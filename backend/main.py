import sys
import os
import json
import sqlite3
import random
import urllib.parse
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure backend directory is in sys.path
_current_dir = os.path.dirname(os.path.abspath(__file__))
_root_dir = os.path.dirname(_current_dir)
if _current_dir not in sys.path:
    sys.path.insert(0, _current_dir)
if _root_dir not in sys.path:
    sys.path.insert(0, _root_dir)

try:
    from database import get_db_connection, init_db, hash_password
    from gemini_service import (
        get_gemini_api_key, save_gemini_api_key, ask_customer_chatbot,
        generate_service_with_gemini, generate_service_image, save_new_service_to_catalog
    )
except ImportError:
    from backend.database import get_db_connection, init_db, hash_password
    from backend.gemini_service import (
        get_gemini_api_key, save_gemini_api_key, ask_customer_chatbot,
        generate_service_with_gemini, generate_service_image, save_new_service_to_catalog
    )

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
STATIC_DIR = os.path.join(FRONTEND_DIR, "static")

# Ensure database is initialized
init_db()

app = FastAPI(
    title="Servida — Fastpris Håndverkertjenester",
    description="Komplett bestillings- og administrasjonsplattform for Servida.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Pydantic Schemas
class UserRegister(BaseModel):
    email: str
    password: str
    full_name: str
    phone: Optional[str] = ""
    street_address: Optional[str] = ""
    postal_code: Optional[str] = ""
    city: Optional[str] = ""

class UserLogin(BaseModel):
    email: str
    password: str

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    street_address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    new_password: Optional[str] = None

class BookingCreate(BaseModel):
    service_handle: str
    service_title: str
    variant_name: Optional[str] = "Standard"
    selected_options: Optional[List[Dict[str, Any]]] = []
    total_price: float
    customer_name: str
    customer_email: str
    customer_phone: str
    street_address: str
    postal_code: str
    city: str
    preferred_date: str
    time_slot: str
    notes: Optional[str] = ""
    user_id: Optional[int] = None

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    payment_status: Optional[str] = None
    assigned_handyman: Optional[str] = None
    handyman_notes: Optional[str] = None
    status_note: Optional[str] = None
    updated_by: Optional[str] = "Admin"

class HandymanStatusUpdate(BaseModel):
    status: str # 'På vei', 'Pågår', 'Utført'
    note: Optional[str] = ""
    handyman_name: str

class OrderMessageCreate(BaseModel):
    message: str
    sender_name: str
    sender_role: str # 'customer', 'handyman', 'admin'
    sender_id: Optional[int] = None

class OrderReviewCreate(BaseModel):
    rating: int # 1 to 5
    review_comment: Optional[str] = ""

class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    price_from: Optional[float] = None
    description: Optional[str] = None
    warranty: Optional[str] = None
    terms: Optional[str] = None
    estimated_hours: Optional[str] = None
    active: Optional[int] = None


# --- Web Page Routes ---

@app.get("/", response_class=HTMLResponse)
async def serve_storefront():
    index_file = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return HTMLResponse("<h1>Servida — Storefront under oppbygging</h1>", status_code=200)

@app.get("/admin", response_class=HTMLResponse)
async def serve_admin():
    admin_file = os.path.join(FRONTEND_DIR, "admin.html")
    if os.path.exists(admin_file):
        return FileResponse(admin_file)
    return HTMLResponse("<h1>Servida — Admin Dashboard under oppbygging</h1>", status_code=200)


# --- Authentication & User Profile Endpoints ---

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
async def register_user(user: UserRegister):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if email exists
    cursor.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (user.email.strip(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="En bruker med denne e-postadressen eksisterer allerede.")
        
    pwd_hash = hash_password(user.password)
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    INSERT INTO users (email, password_hash, full_name, phone, street_address, postal_code, city, role, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'customer', ?)
    """, (
        user.email.strip().lower(),
        pwd_hash,
        user.full_name.strip(),
        user.phone.strip(),
        user.street_address.strip(),
        user.postal_code.strip(),
        user.city.strip(),
        created_at
    ))
    
    user_id = cursor.lastrowid
    conn.commit()
    
    # Check if there are past guest orders matching this email and link them!
    cursor.execute("UPDATE orders SET user_id = ? WHERE lower(customer_email) = lower(?) AND (user_id IS NULL OR user_id = 0)", 
                   (user_id, user.email.strip().lower()))
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": "Brukerkonto opprettet!",
        "user": {
            "id": user_id,
            "email": user.email.strip().lower(),
            "full_name": user.full_name.strip(),
            "phone": user.phone.strip(),
            "street_address": user.street_address.strip(),
            "postal_code": user.postal_code.strip(),
            "city": user.city.strip(),
            "role": "customer"
        }
    }

@app.post("/api/auth/login")
async def login_user(cred: UserLogin):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    pwd_hash = hash_password(cred.password)
    cursor.execute("""
    SELECT id, email, full_name, phone, street_address, postal_code, city, role, handyman_specialty, avatar_url
    FROM users 
    WHERE lower(email) = lower(?) AND password_hash = ?
    """, (cred.email.strip(), pwd_hash))
    
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=401, detail="Feil e-postadresse eller passord.")
        
    return {
        "success": True,
        "message": f"Velkommen tilbake, {row['full_name']}!",
        "user": {
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "phone": row["phone"] or "",
            "street_address": row["street_address"] or "",
            "postal_code": row["postal_code"] or "",
            "city": row["city"] or "",
            "role": row["role"],
            "handyman_specialty": row["handyman_specialty"],
            "avatar_url": row["avatar_url"]
        }
    }

@app.get("/api/auth/me")
async def get_current_user(user_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, full_name, phone, street_address, postal_code, city, role, handyman_specialty, avatar_url FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Bruker ikke funnet")
        
    return {
        "user": {
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "phone": row["phone"] or "",
            "street_address": row["street_address"] or "",
            "postal_code": row["postal_code"] or "",
            "city": row["city"] or "",
            "role": row["role"],
            "handyman_specialty": row["handyman_specialty"],
            "avatar_url": row["avatar_url"]
        }
    }

@app.put("/api/user/profile/{user_id}")
async def update_profile(user_id: int, p: ProfileUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    if p.full_name is not None:
        updates.append("full_name = ?")
        params.append(p.full_name.strip())
    if p.phone is not None:
        updates.append("phone = ?")
        params.append(p.phone.strip())
    if p.street_address is not None:
        updates.append("street_address = ?")
        params.append(p.street_address.strip())
    if p.postal_code is not None:
        updates.append("postal_code = ?")
        params.append(p.postal_code.strip())
    if p.city is not None:
        updates.append("city = ?")
        params.append(p.city.strip())
    if p.new_password:
        updates.append("password_hash = ?")
        params.append(hash_password(p.new_password))
        
    if not updates:
        conn.close()
        return {"success": True, "message": "Ingen endringer"}
        
    params.append(user_id)
    cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    
    cursor.execute("SELECT id, email, full_name, phone, street_address, postal_code, city, role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    return {
        "success": True,
        "message": "Profil oppdatert!",
        "user": dict(row)
    }

@app.get("/api/user/orders/{user_id}")
async def get_user_orders(user_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get user email
    cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
    u_row = cursor.fetchone()
    email = u_row["email"] if u_row else ""
    
    cursor.execute("""
    SELECT * FROM orders 
    WHERE user_id = ? OR lower(customer_email) = lower(?)
    ORDER BY id DESC
    """, (user_id, email))
    
    rows = cursor.fetchall()
    orders = []
    
    for r in rows:
        try:
            options = json.loads(r["selected_options"]) if r["selected_options"] else []
        except:
            options = []
            
        # Get status history
        cursor.execute("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id ASC", (r["id"],))
        history = [dict(h) for h in cursor.fetchall()]
        
        # Get unread/message count
        cursor.execute("SELECT COUNT(*) FROM order_messages WHERE order_id = ?", (r["id"],))
        msg_count = cursor.fetchone()[0]
        
        orders.append({
            "id": r["id"],
            "order_number": r["order_number"],
            "service_handle": r["service_handle"],
            "service_title": r["service_title"],
            "variant_name": r["variant_name"],
            "selected_options": options,
            "total_price": r["total_price"],
            "status": r["status"],
            "payment_status": r["payment_status"],
            "assigned_handyman": r["assigned_handyman"],
            "preferred_date": r["preferred_date"],
            "time_slot": r["time_slot"],
            "street_address": r["street_address"],
            "postal_code": r["postal_code"],
            "city": r["city"],
            "notes": r["notes"],
            "handyman_notes": r["handyman_notes"],
            "rating": r["rating"],
            "review_comment": r["review_comment"],
            "created_at": r["created_at"],
            "status_history": history,
            "message_count": msg_count
        })
        
    conn.close()
    return {"orders": orders, "count": len(orders)}


# --- Catalog Endpoints ---

@app.get("/api/catalog")
async def get_catalog():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM categories ORDER BY sort_order ASC")
    cat_rows = cursor.fetchall()
    categories = [{"id": r["id"], "name": r["name"], "icon": r["icon"], "description": r["description"]} for r in cat_rows]
        
    cursor.execute("SELECT * FROM services WHERE active = 1 ORDER BY popularity DESC, price_from ASC")
    srv_rows = cursor.fetchall()
    services = []
    for r in srv_rows:
        try:
            included = json.loads(r["included"]) if r["included"] else []
        except:
            included = [r["included"]] if r["included"] else []
            
        try:
            variants = json.loads(r["variants"]) if r["variants"] else []
        except:
            variants = []
            
        services.append({
            "id": r["id"],
            "handle": r["handle"],
            "title": r["title"],
            "category": r["category"],
            "description": r["description"],
            "short_description": r["short_description"],
            "price_from": r["price_from"],
            "included": included,
            "warranty": r["warranty"],
            "terms": r["terms"],
            "variants": variants,
            "image_url": r["image_url"],
            "estimated_hours": r["estimated_hours"],
            "popularity": r["popularity"]
        })
        
    conn.close()
    return {
        "categories": categories,
        "services": services,
        "total_services": len(services)
    }

@app.get("/api/services/{handle}")
async def get_service(handle: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM services WHERE handle = ?", (handle,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Tjeneste ikke funnet")
        
    try:
        included = json.loads(row["included"]) if row["included"] else []
    except:
        included = [row["included"]]
        
    try:
        variants = json.loads(row["variants"]) if row["variants"] else []
    except:
        variants = []
        
    return {
        "id": row["id"],
        "handle": row["handle"],
        "title": row["title"],
        "category": row["category"],
        "description": row["description"],
        "short_description": row["short_description"],
        "price_from": row["price_from"],
        "included": included,
        "warranty": row["warranty"],
        "terms": row["terms"],
        "variants": variants,
        "image_url": row["image_url"],
        "estimated_hours": row["estimated_hours"]
    }


# --- Booking & Order Management Endpoints ---

@app.post("/api/bookings", status_code=status.HTTP_201_CREATED)
async def create_booking(booking: BookingCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    date_str = datetime.now().strftime("%Y%m%d")
    rand_suffix = random.randint(1000, 9999)
    order_number = f"SRV-{date_str}-{rand_suffix}"
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    options_json = json.dumps(booking.selected_options or [], ensure_ascii=False)
    
    # Auto-link user_id if not provided by looking up email
    user_id = booking.user_id
    if not user_id:
        cursor.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (booking.customer_email.strip(),))
        u_row = cursor.fetchone()
        if u_row:
            user_id = u_row["id"]
            
    cursor.execute("""
    INSERT INTO orders (
        order_number, user_id, customer_name, customer_email, customer_phone,
        street_address, postal_code, city, preferred_date, time_slot,
        notes, service_handle, service_title, variant_name,
        selected_options, total_price, status, payment_status, assigned_handyman,
        handyman_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ny bestilling', 'Utestående', 'Ikke tildelt', '', ?)
    """, (
        order_number,
        user_id,
        booking.customer_name,
        booking.customer_email,
        booking.customer_phone,
        booking.street_address,
        booking.postal_code,
        booking.city,
        booking.preferred_date,
        booking.time_slot,
        booking.notes,
        booking.service_handle,
        booking.service_title,
        booking.variant_name,
        options_json,
        booking.total_price,
        created_at
    ))
    
    order_id = cursor.lastrowid
    
    # Record initial audit entry
    cursor.execute("""
    INSERT INTO order_status_history (order_id, status, note, updated_by, created_at)
    VALUES (?, ?, ?, ?, ?)
    """, (order_id, "Ny bestilling", "Bestilling mottatt og registrert i systemet", "Kunde", created_at))
    
    # System welcome message
    cursor.execute("""
    INSERT INTO order_messages (order_id, sender_id, sender_name, sender_role, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (order_id, 1, "Servida Kundeservice", "admin", "Takk for bestillingen! Vi sjekker kapasitet og bekrefter tildelt håndverker om kort tid.", created_at))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "order_id": order_id,
        "order_number": order_number,
        "message": "Bestilling registrert! Du betaler ingenting nå – oppgjøret tas med Vipps eller faktura etter at arbeidet er godkjent og utført.",
        "details": {
            "customer_name": booking.customer_name,
            "service_title": booking.service_title,
            "preferred_date": booking.preferred_date,
            "time_slot": booking.time_slot,
            "total_price": booking.total_price
        }
    }

@app.get("/api/orders")
async def get_orders(status: Optional[str] = None, search: Optional[str] = None, handyman: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM orders WHERE 1=1"
    params = []
    
    if status and status != "Alle":
        query += " AND status = ?"
        params.append(status)
        
    if handyman and handyman != "Alle":
        query += " AND assigned_handyman LIKE ?"
        params.append(f"%{handyman}%")
        
    if search:
        query += " AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR service_title LIKE ? OR street_address LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s, s])
        
    query += " ORDER BY id DESC"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    orders = []
    for r in rows:
        try:
            options = json.loads(r["selected_options"]) if r["selected_options"] else []
        except:
            options = []
            
        orders.append({
            "id": r["id"],
            "order_number": r["order_number"],
            "user_id": r["user_id"],
            "customer_name": r["customer_name"],
            "customer_email": r["customer_email"],
            "customer_phone": r["customer_phone"],
            "street_address": r["street_address"],
            "postal_code": r["postal_code"],
            "city": r["city"],
            "preferred_date": r["preferred_date"],
            "time_slot": r["time_slot"],
            "notes": r["notes"],
            "service_handle": r["service_handle"],
            "service_title": r["service_title"],
            "variant_name": r["variant_name"],
            "selected_options": options,
            "total_price": r["total_price"],
            "status": r["status"],
            "payment_status": r["payment_status"],
            "assigned_handyman": r["assigned_handyman"],
            "handyman_notes": r["handyman_notes"],
            "rating": r["rating"],
            "review_comment": r["review_comment"],
            "created_at": r["created_at"]
        })
        
    conn.close()
    return {"orders": orders, "count": len(orders)}


@app.get("/api/calendar/dispatch")
async def get_calendar_dispatch(date: Optional[str] = None, handyman: Optional[str] = None):
    """Returns structured multi-job schedule per handyman for a given day or date range."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    target_date = date.strip() if date and date != "alle" else datetime.now().strftime("%Y-%m-%d")
    
    # Get all handymen
    cursor.execute("SELECT id, full_name, phone, role, handyman_specialty, avatar_url, status FROM users WHERE role = 'handyman' ORDER BY full_name ASC")
    handymen_rows = cursor.fetchall()
    
    schedules = []
    total_day_jobs_count = 0
    total_day_revenue = 0.0
    
    for h in handymen_rows:
        h_name = h["full_name"]
        
        # If handyman filter specified, skip others
        if handyman and handyman != "alle" and handyman not in h_name:
            continue
            
        cursor.execute("""
        SELECT * FROM orders
        WHERE (assigned_handyman = ? OR assigned_handyman LIKE ?)
          AND preferred_date = ?
        ORDER BY time_slot ASC, id ASC
        """, (h_name, f"%{h_name}%", target_date))
        
        order_rows = cursor.fetchall()
        jobs = []
        estimated_hours = 0.0
        
        for r in order_rows:
            try:
                options = json.loads(r["selected_options"]) if r["selected_options"] else []
            except:
                options = []
                
            map_query = f"{r['street_address']}, {r['postal_code']} {r['city']}"
            map_url = f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(map_query)}"
            
            # Estimate 2.5 hours per job if not specified
            est_h = 2.5
            estimated_hours += est_h
            total_day_revenue += r["total_price"]
            
            jobs.append({
                "id": r["id"],
                "order_number": r["order_number"],
                "service_title": r["service_title"],
                "variant_name": r["variant_name"] or "Standard",
                "time_slot": r["time_slot"],
                "customer_name": r["customer_name"],
                "customer_phone": r["customer_phone"],
                "street_address": r["street_address"],
                "postal_code": r["postal_code"],
                "city": r["city"],
                "full_address": f"{r['street_address']}, {r['postal_code']} {r['city']}",
                "map_url": map_url,
                "total_price": r["total_price"],
                "status": r["status"],
                "payment_status": r["payment_status"],
                "notes": r["notes"] or "",
                "handyman_notes": r["handyman_notes"] or "",
                "estimated_hours": est_h
            })
            
        total_day_jobs_count += len(jobs)
        
        schedules.append({
            "handyman_id": h["id"],
            "handyman_name": h_name,
            "phone": h["phone"] or "",
            "specialty": h["handyman_specialty"] or "Handyman",
            "avatar_url": h["avatar_url"] or "👷",
            "status": h["status"] or "Aktiv",
            "total_jobs": len(jobs),
            "estimated_daily_hours": round(estimated_hours, 1),
            "jobs": jobs
        })
        
    # Also fetch unassigned jobs for this day
    cursor.execute("""
    SELECT * FROM orders
    WHERE (assigned_handyman = 'Ikke tildelt' OR assigned_handyman IS NULL OR assigned_handyman = '')
      AND preferred_date = ?
    ORDER BY time_slot ASC, id ASC
    """, (target_date,))
    unassigned_rows = cursor.fetchall()
    unassigned_jobs = []
    for r in unassigned_rows:
        map_query = f"{r['street_address']}, {r['postal_code']} {r['city']}"
        unassigned_jobs.append({
            "id": r["id"],
            "order_number": r["order_number"],
            "service_title": r["service_title"],
            "variant_name": r["variant_name"] or "Standard",
            "time_slot": r["time_slot"],
            "customer_name": r["customer_name"],
            "customer_phone": r["customer_phone"],
            "street_address": r["street_address"],
            "postal_code": r["postal_code"],
            "city": r["city"],
            "full_address": f"{r['street_address']}, {r['postal_code']} {r['city']}",
            "map_url": f"https://www.google.com/maps/search/?api=1&query={urllib.parse.quote(map_query)}",
            "total_price": r["total_price"],
            "status": r["status"]
        })
        
    conn.close()
    
    return {
        "date": target_date,
        "total_jobs": total_day_jobs_count + len(unassigned_jobs),
        "total_revenue": round(total_day_revenue, 2),
        "schedules": schedules,
        "unassigned_jobs": unassigned_jobs
    }


@app.get("/api/orders/{order_number_or_id}")
async def get_single_order(order_number_or_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if order_number_or_id.isdigit():
        cursor.execute("SELECT * FROM orders WHERE id = ?", (int(order_number_or_id),))
    else:
        cursor.execute("SELECT * FROM orders WHERE order_number = ?", (order_number_or_id,))
        
    r = cursor.fetchone()
    if not r:
        conn.close()
        raise HTTPException(status_code=404, detail="Ordre ikke funnet")
        
    try:
        options = json.loads(r["selected_options"]) if r["selected_options"] else []
    except:
        options = []
        
    # Get status timeline
    cursor.execute("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id ASC", (r["id"],))
    history = [dict(h) for h in cursor.fetchall()]
    
    # Get messages
    cursor.execute("SELECT * FROM order_messages WHERE order_id = ? ORDER BY id ASC", (r["id"],))
    messages = [dict(m) for h, m in enumerate(cursor.fetchall())]
    
    conn.close()
    
    return {
        "order": {
            "id": r["id"],
            "order_number": r["order_number"],
            "user_id": r["user_id"],
            "customer_name": r["customer_name"],
            "customer_email": r["customer_email"],
            "customer_phone": r["customer_phone"],
            "street_address": r["street_address"],
            "postal_code": r["postal_code"],
            "city": r["city"],
            "preferred_date": r["preferred_date"],
            "time_slot": r["time_slot"],
            "notes": r["notes"],
            "service_handle": r["service_handle"],
            "service_title": r["service_title"],
            "variant_name": r["variant_name"],
            "selected_options": options,
            "total_price": r["total_price"],
            "status": r["status"],
            "payment_status": r["payment_status"],
            "assigned_handyman": r["assigned_handyman"],
            "handyman_notes": r["handyman_notes"],
            "rating": r["rating"],
            "review_comment": r["review_comment"],
            "created_at": r["created_at"],
            "status_history": history,
            "messages": messages
        }
    }

@app.patch("/api/orders/{order_id}")
async def update_order(order_id: int, update: OrderUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    if update.status is not None:
        updates.append("status = ?")
        params.append(update.status)
    if update.payment_status is not None:
        updates.append("payment_status = ?")
        params.append(update.payment_status)
    if update.assigned_handyman is not None:
        updates.append("assigned_handyman = ?")
        params.append(update.assigned_handyman)
    if update.handyman_notes is not None:
        updates.append("handyman_notes = ?")
        params.append(update.handyman_notes)
        
    if not updates:
        conn.close()
        return {"message": "Ingen endringer spesifisert"}
        
    params.append(order_id)
    query = f"UPDATE orders SET {', '.join(updates)} WHERE id = ?"
    cursor.execute(query, params)
    
    # Record history if status changed
    if update.status is not None:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        note = update.status_note or f"Status endret til {update.status}"
        cursor.execute("""
        INSERT INTO order_status_history (order_id, status, note, updated_by, created_at)
        VALUES (?, ?, ?, ?, ?)
        """, (order_id, update.status, note, update.updated_by or "Admin", now_str))
        
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Ordre oppdatert"}

@app.post("/api/handyman/orders/{order_id}/status")
async def handyman_set_status(order_id: int, payload: HandymanStatusUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("UPDATE orders SET status = ? WHERE id = ?", (payload.status, order_id))
    
    note_text = payload.note or f"Status oppdatert av {payload.handyman_name}"
    if payload.status == "På vei":
        note_text = f"🚗 {payload.handyman_name} har startet kjøreturen til oppmøteadressen."
    elif payload.status == "Pågår":
        note_text = f"🔨 {payload.handyman_name} har ankommet og startet arbeidet."
    elif payload.status == "Utført":
        note_text = f"✅ Arbeid er fullført av {payload.handyman_name}. " + (f"Rapport: {payload.note}" if payload.note else "")
        
    cursor.execute("""
    INSERT INTO order_status_history (order_id, status, note, updated_by, created_at)
    VALUES (?, ?, ?, ?, ?)
    """, (order_id, payload.status, note_text, payload.handyman_name, now_str))
    
    conn.commit()
    conn.close()
    return {"success": True, "message": f"Status oppdatert til '{payload.status}'"}

@app.post("/api/orders/{order_id}/messages")
async def send_order_message(order_id: int, msg: OrderMessageCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""
    INSERT INTO order_messages (order_id, sender_id, sender_name, sender_role, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (order_id, msg.sender_id, msg.sender_name, msg.sender_role, msg.message.strip(), now_str))
    
    conn.commit()
    conn.close()
    return {"success": True, "message": "Melding sendt!"}

@app.get("/api/orders/{order_id}/messages")
async def get_order_messages(order_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM order_messages WHERE order_id = ? ORDER BY id ASC", (order_id,))
    messages = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"messages": messages, "count": len(messages)}

@app.post("/api/orders/{order_id}/review")
async def add_order_review(order_id: int, review: OrderReviewCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("UPDATE orders SET rating = ?, review_comment = ? WHERE id = ?", (review.rating, review.review_comment, order_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Takk for din vurdering!"}

@app.post("/api/orders/{order_id}/cancel")
async def cancel_order(order_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT status FROM orders WHERE id = ?", (order_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Ordre ikke funnet")
        
    if row["status"] in ["På vei", "Pågår", "Utført", "Fakturert"]:
        conn.close()
        raise HTTPException(status_code=400, detail="Kan ikke avbestille en ordre som allerede er påbegynt eller fullført. Kontakt kundeservice på tlf 55 12 34 56.")
        
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("UPDATE orders SET status = 'Kansellert' WHERE id = ?", (order_id,))
    cursor.execute("""
    INSERT INTO order_status_history (order_id, status, note, updated_by, created_at)
    VALUES (?, 'Kansellert', 'Ordren ble avbestilt av kunden', 'Kunde', ?)
    """, (order_id, now_str))
    
    conn.commit()
    conn.close()
    return {"success": True, "message": "Bestillingen er kansellert."}

@app.get("/api/admin/handymen")
async def list_handymen():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, full_name, phone, handyman_specialty, avatar_url FROM users WHERE role = 'handyman'")
    rows = cursor.fetchall()
    handymen = [dict(r) for r in rows]
    conn.close()
    return {"handymen": handymen}


# --- Statistics & Analytics ---

@app.get("/api/stats")
async def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM orders")
    total_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM orders WHERE status = 'Ny bestilling'")
    new_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM orders WHERE status IN ('Bekreftet', 'Håndverker tildelt', 'På vei', 'Pågår')")
    active_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM orders WHERE status = 'Utført' OR status = 'Fakturert'")
    completed_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT SUM(total_price) FROM orders WHERE status != 'Kansellert'")
    total_revenue = cursor.fetchone()[0] or 0.0
    
    cursor.execute("""
    SELECT service_title, COUNT(*) as count 
    FROM orders 
    GROUP BY service_title 
    ORDER BY count DESC 
    LIMIT 5
    """)
    top_services = [{"title": r[0], "count": r[1]} for r in cursor.fetchall()]
    
    cursor.execute("SELECT COUNT(*) FROM services WHERE active = 1")
    active_services = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'customer'")
    customer_count = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "total_orders": total_orders,
        "new_orders": new_orders,
        "active_orders": active_orders,
        "completed_orders": completed_orders,
        "total_revenue": total_revenue,
        "active_services": active_services,
        "customer_count": customer_count,
        "top_services": top_services
    }

@app.put("/api/services/{handle}")
async def update_service(handle: str, s_update: ServiceUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    if s_update.title is not None:
        updates.append("title = ?")
        params.append(s_update.title)
    if s_update.price_from is not None:
        updates.append("price_from = ?")
        params.append(s_update.price_from)
    if s_update.category is not None:
        updates.append("category = ?")
        params.append(s_update.category)
    if s_update.description is not None:
        updates.append("description = ?")
        params.append(s_update.description)
    if s_update.warranty is not None:
        updates.append("warranty = ?")
        params.append(s_update.warranty)
    if s_update.terms is not None:
        updates.append("terms = ?")
        params.append(s_update.terms)
    if s_update.estimated_hours is not None:
        updates.append("estimated_hours = ?")
        params.append(s_update.estimated_hours)
    if s_update.active is not None:
        updates.append("active = ?")
        params.append(s_update.active)
        
    if not updates:
        conn.close()
        return {"message": "Ingen felt å oppdatere"}
        
    params.append(handle)
    query = f"UPDATE services SET {', '.join(updates)} WHERE handle = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    
    return {"success": True, "message": f"Tjeneste '{handle}' oppdatert"}


# ==========================================================================
# GEMINI AI ENDPOINTS (Customer Chatbot & Admin Service/Image Generator)
# ==========================================================================

class AIChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = []

class AIGenerateServiceRequest(BaseModel):
    prompt: str
    category: Optional[str] = None
    rough_price: Optional[float] = None

class AIGenerateImageRequest(BaseModel):
    prompt: str
    handle: str

class AISaveServiceRequest(BaseModel):
    service: Dict[str, Any]

class AIConfigUpdate(BaseModel):
    gemini_api_key: str


@app.post("/api/ai/chat")
async def ai_customer_chat(payload: AIChatRequest):
    """Customer-facing interactive AI advisor for finding services and booking help."""
    try:
        res = ask_customer_chatbot(payload.message, payload.history)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/generate-service")
async def ai_generate_service(payload: AIGenerateServiceRequest):
    """Admin endpoint: Generate full product description, variants, checklist with Gemini AI."""
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Vennligst oppgi et stikkord eller tittel for tjenesten.")
    try:
        data = generate_service_with_gemini(payload.prompt, payload.category, payload.rough_price)
        return {"success": True, "service": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/generate-image")
async def ai_generate_image(payload: AIGenerateImageRequest):
    """Admin endpoint: Generate realistic photo for new service using AI."""
    if not payload.prompt.strip():
        raise HTTPException(status_code=400, detail="Vennligst oppgi en bildeinstruks.")
    try:
        res = generate_service_image(payload.prompt, payload.handle)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/save-service")
async def ai_save_service(payload: AISaveServiceRequest):
    """Admin endpoint: Persist generated service to catalog and database."""
    try:
        res = save_new_service_to_catalog(payload.service)
        # Also ensure service table in sqlite has it if needed
        conn = get_db_connection()
        cursor = conn.cursor()
        s = payload.service
        cursor.execute("""
            INSERT OR REPLACE INTO services (handle, title, category, price_from, description, warranty, terms, estimated_hours, active, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        """, (
            s.get("handle"), s.get("title"), s.get("category"), s.get("price_from", 1490.0),
            s.get("description", ""), s.get("warranty", "2 års garanti på utført arbeid"),
            s.get("terms", "Standard vilkår"), s.get("estimated_hours", "1-3 timer"),
            s.get("image_url", f"/static/images/products/{s.get('handle')}.jpg")
        ))
        conn.commit()
        conn.close()
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/config")
async def get_ai_config():
    """Admin endpoint: Get current Gemini AI key status."""
    key = get_gemini_api_key()
    if key:
        masked = key[:4] + "..." + key[-4:] if len(key) > 8 else "***"
        return {"configured": True, "masked_key": masked}
    return {"configured": False, "masked_key": ""}


@app.post("/api/ai/config")
async def update_ai_config(payload: AIConfigUpdate):
    """Admin endpoint: Save or update Gemini API key."""
    if not payload.gemini_api_key.strip():
        raise HTTPException(status_code=400, detail="API-nøkkel kan ikke være tom.")
    save_gemini_api_key(payload.gemini_api_key.strip())
    return {"success": True, "message": "Gemini API-nøkkel er lagret!"}


# ==========================================================================
# PDF DOCUMENTATION ARCHIVE & HANDYMAN MANUALS (SOP)
# ==========================================================================

DOCS_DIR = os.path.join(STATIC_DIR, "docs")

@app.get("/api/docs/list")
async def list_pdf_docs(
    search: Optional[str] = None,
    category: Optional[str] = None,
    doc_type: Optional[str] = None
):
    """Returns indexed list of all 250 PDF manuals, checklists, and product sheets."""
    import urllib.parse
    if not os.path.exists(DOCS_DIR):
        return {"total": 0, "categories": {}, "docs": []}

    categories: Dict[str, int] = {}
    docs: List[Dict[str, Any]] = []
    
    def normalize_norwegian(s: str) -> str:
        s = s.lower()
        replacements = [('æ', 'ae'), ('ø', 'o'), ('å', 'a'), ('é', 'e'), ('è', 'e'), ('ä', 'a'), ('ö', 'o')]
        for r1, r2 in replacements:
            s = s.replace(r1, r2)
        return s

    search_term = normalize_norwegian(search.strip()) if search else ""
    cat_filter = normalize_norwegian(category.strip()) if category and category != "alle" else ""
    type_filter = normalize_norwegian(doc_type.strip()) if doc_type and doc_type != "alle" else ""

    for root, dirs, files in os.walk(DOCS_DIR):
        for f in files:
            if f.lower().endswith(".pdf"):
                rel_path = os.path.relpath(os.path.join(root, f), DOCS_DIR)
                parts = rel_path.split(os.sep)
                cat_folder = parts[0] if len(parts) > 1 else "Generelt"
                service_folder = parts[1] if len(parts) > 2 else ""
                
                cat_clean = cat_folder.split(" - ")[-1] if " - " in cat_folder else cat_folder
                is_sop = "framgangsm" in f.lower() or "sjekkliste" in f.lower()
                dtype = "SOP / Sjekkliste" if is_sop else "Produktinformasjon"
                
                # Normalize values for filtering
                norm_cat = normalize_norwegian(cat_clean)
                norm_dtype = normalize_norwegian(dtype)
                norm_filename = normalize_norwegian(f)
                norm_srv = normalize_norwegian(service_folder)
                
                # Filters
                if cat_filter and cat_filter not in norm_cat:
                    continue
                if type_filter and type_filter not in norm_dtype:
                    continue
                if search_term and (search_term not in norm_filename and search_term not in norm_srv and search_term not in norm_cat):
                    continue
                
                url = "/static/docs/" + urllib.parse.quote(rel_path.replace(os.sep, "/"))
                try:
                    size_kb = round(os.path.getsize(os.path.join(root, f)) / 1024, 1)
                except Exception:
                    size_kb = 0.0
                
                doc_item = {
                    "filename": f,
                    "title": f.replace(".pdf", ""),
                    "service_folder": service_folder,
                    "category": cat_clean,
                    "doc_type": dtype,
                    "url": url,
                    "size_kb": size_kb
                }
                
                docs.append(doc_item)
                if cat_clean not in categories:
                    categories[cat_clean] = 0
                categories[cat_clean] += 1

    docs.sort(key=lambda x: (x["category"], x["service_folder"], x["title"]))

    return {
        "total": len(docs),
        "categories": categories,
        "docs": docs
    }


# ==========================================================================
# EMPLOYEE MANAGEMENT & WORK HOURS TRACKING CONTROLLER
# ==========================================================================

class EmployeeCreate(BaseModel):
    full_name: str
    email: str
    password: str
    phone: Optional[str] = ""
    handyman_specialty: Optional[str] = "Allround Handyman"
    employment_percentage: Optional[int] = 100
    hourly_rate: Optional[float] = 350.0
    bio: Optional[str] = ""
    avatar_url: Optional[str] = "👷"

class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    handyman_specialty: Optional[str] = None
    employment_percentage: Optional[int] = None
    hourly_rate: Optional[float] = None
    status: Optional[str] = None
    bio: Optional[str] = None
    password: Optional[str] = None

class HourLogCreate(BaseModel):
    user_id: int
    work_date: str
    hours_spent: float
    description: str
    order_id: Optional[int] = None


@app.get("/api/employees")
async def list_employees():
    """Returns list of all handymen and employees with calculated hours, target hours, and balance."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT id, email, full_name, phone, street_address, postal_code, city, role, 
           handyman_specialty, avatar_url, created_at, employment_percentage, 
           target_weekly_hours, hourly_rate, status, bio
    FROM users 
    WHERE role IN ('handyman', 'admin')
    ORDER BY role ASC, full_name ASC
    """)
    rows = cursor.fetchall()
    
    employees = []
    for r in rows:
        uid = r["id"]
        pct = r["employment_percentage"] if r["employment_percentage"] is not None else 100
        target_hours = round((pct / 100.0) * 37.5, 2)
        
        # Calculate worked hours this week from work_hours_log
        cursor.execute("""
        SELECT COALESCE(SUM(hours_spent), 0.0)
        FROM work_hours_log
        WHERE user_id = ?
        """, (uid,))
        worked_hours = float(cursor.fetchone()[0])
        
        # Calculate active assigned orders count and estimated scheduled hours
        cursor.execute("""
        SELECT COUNT(*), COALESCE(SUM(total_price), 0.0)
        FROM orders
        WHERE (assigned_handyman = ? OR assigned_handyman LIKE ?)
          AND status IN ('Ny bestilling', 'Bekreftet', 'Håndverker tildelt', 'På vei', 'Pågår')
        """, (r["full_name"], f"%{r['full_name']}%"))
        active_row = cursor.fetchone()
        active_orders_count = active_row[0]
        
        # Estimated scheduled hours: 2.5 hours per active assigned order
        scheduled_hours = round(active_orders_count * 2.5, 1)
        
        # Calculate completed orders count
        cursor.execute("""
        SELECT COUNT(*)
        FROM orders
        WHERE (assigned_handyman = ? OR assigned_handyman LIKE ?)
          AND status IN ('Utført', 'Fakturert')
        """, (r["full_name"], f"%{r['full_name']}%"))
        completed_orders_count = cursor.fetchone()[0]
        
        # Time balance: worked vs target
        if pct == 0:
            balance = worked_hours
            balance_label = f"{worked_hours}t arbeidet (Tilkalling)"
            balance_status = "on_call"
        else:
            balance = round(worked_hours - target_hours, 1)
            if balance > 0:
                balance_label = f"+{balance}t overtid"
                balance_status = "overtime"
            elif balance == 0:
                balance_label = "0.0t (I rute)"
                balance_status = "on_track"
            else:
                balance_label = f"{balance}t (Gjenstående)"
                balance_status = "under_target"
            
        employees.append({
            "id": uid,
            "email": r["email"],
            "full_name": r["full_name"],
            "phone": r["phone"] or "",
            "role": r["role"],
            "handyman_specialty": r["handyman_specialty"] or "Allround",
            "avatar_url": r["avatar_url"] or ("👑" if r["role"] == "admin" else "👷"),
            "employment_percentage": pct,
            "target_weekly_hours": target_hours,
            "hourly_rate": r["hourly_rate"] or 350.0,
            "status": r["status"] or ("Tilkalling" if pct == 0 else "Aktiv"),
            "bio": r["bio"] or "",
            "worked_hours_this_week": worked_hours,
            "scheduled_hours_this_week": scheduled_hours,
            "time_balance": balance,
            "balance_label": balance_label,
            "balance_status": balance_status,
            "active_orders_count": active_orders_count,
            "completed_orders_count": completed_orders_count
        })
        
    conn.close()
    return {"employees": employees}


@app.post("/api/employees")
async def create_employee(payload: EmployeeCreate):
    """Creates a new handyman employee profile with employment percentage and weekly target hours."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if email exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (payload.email.strip().lower(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="En bruker med denne e-postadressen eksisterer allerede.")
        
    pct = payload.employment_percentage if payload.employment_percentage is not None else 100
    target_hours = round((pct / 100.0) * 37.5, 2) if pct > 0 else 0.0
    pwd_hash = hash_password(payload.password)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    INSERT INTO users (
        email, password_hash, full_name, phone, role, handyman_specialty, 
        avatar_url, created_at, employment_percentage, target_weekly_hours, 
        hourly_rate, status, bio
    ) VALUES (?, ?, ?, ?, 'handyman', ?, ?, ?, ?, ?, ?, 'Aktiv', ?)
    """, (
        payload.email.strip().lower(),
        pwd_hash,
        payload.full_name.strip(),
        payload.phone.strip(),
        payload.handyman_specialty.strip(),
        payload.avatar_url or ("⏱️" if pct == 0 else "👷"),
        now_str,
        pct,
        target_hours,
        payload.hourly_rate or 350.0,
        payload.bio.strip() if payload.bio else ""
    ))
    
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Håndverker {payload.full_name} ({pct}% stilling) er nå opprettet!",
        "employee_id": new_id
    }


@app.put("/api/employees/{employee_id}")
async def update_employee(employee_id: int, payload: EmployeeUpdate):
    """Updates an employee profile, employment percentage, specialty, and hourly rate."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (employee_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="Ansatt ikke funnet.")
        
    full_name = payload.full_name if payload.full_name is not None else user["full_name"]
    phone = payload.phone if payload.phone is not None else user["phone"]
    specialty = payload.handyman_specialty if payload.handyman_specialty is not None else user["handyman_specialty"]
    status_val = payload.status if payload.status is not None else user["status"]
    bio = payload.bio if payload.bio is not None else user["bio"]
    hourly_rate = payload.hourly_rate if payload.hourly_rate is not None else user["hourly_rate"]
    
    pct = payload.employment_percentage if payload.employment_percentage is not None else user["employment_percentage"]
    target_hours = round((pct / 100.0) * 37.5, 2)
    
    if payload.password and payload.password.strip():
        pwd_hash = hash_password(payload.password.strip())
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, employee_id))
        
    cursor.execute("""
    UPDATE users SET 
        full_name = ?,
        phone = ?,
        handyman_specialty = ?,
        employment_percentage = ?,
        target_weekly_hours = ?,
        hourly_rate = ?,
        status = ?,
        bio = ?
    WHERE id = ?
    """, (full_name, phone, specialty, pct, target_hours, hourly_rate, status_val, bio, employee_id))
    
    conn.commit()
    conn.close()
    return {"success": True, "message": "Ansattprofilen er oppdatert!"}


@app.get("/api/employees/{employee_id}/hours")
async def get_employee_hours(employee_id: int):
    """Returns work hour logs for an employee."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    SELECT id, user_id, order_id, work_date, hours_spent, description, status, created_at
    FROM work_hours_log
    WHERE user_id = ?
    ORDER BY work_date DESC, id DESC
    """, (employee_id,))
    rows = cursor.fetchall()
    
    logs = [dict(r) for r in rows]
    total_hours = sum(l["hours_spent"] for l in logs)
    
    conn.close()
    return {
        "user_id": employee_id,
        "total_logged_hours": round(total_hours, 1),
        "logs": logs
    }


@app.post("/api/employees/{employee_id}/hours")
async def log_employee_hours(employee_id: int, payload: HourLogCreate):
    """Logs worked hours for a handyman."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    work_date = payload.work_date or datetime.now().strftime("%Y-%m-%d")
    
    cursor.execute("""
    INSERT INTO work_hours_log (user_id, order_id, work_date, hours_spent, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'Godkjent', ?)
    """, (employee_id, payload.order_id, work_date, payload.hours_spent, payload.description.strip(), now_str))
    
    log_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Ført {payload.hours_spent} timer for dato {work_date}!",
        "log_id": log_id
    }


@app.get("/api/handyman/profile/{employee_id}")
async def get_handyman_dashboard_profile(employee_id: int):
    """Returns dedicated profile data, time statistics, and assigned orders for the logged in handyman."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM users WHERE id = ?", (employee_id,))
    user = cursor.fetchone()
    if not user:
        conn.close()
        raise HTTPException(status_code=404, detail="Håndverker ikke funnet.")
        
    pct = user["employment_percentage"] if user["employment_percentage"] is not None else 100
    target_hours = round((pct / 100.0) * 37.5, 2)
    
    # Worked hours
    cursor.execute("SELECT COALESCE(SUM(hours_spent), 0.0) FROM work_hours_log WHERE user_id = ?", (employee_id,))
    worked_hours = float(cursor.fetchone()[0])
    
    # Hour logs list
    cursor.execute("""
    SELECT id, order_id, work_date, hours_spent, description, status, created_at
    FROM work_hours_log
    WHERE user_id = ?
    ORDER BY work_date DESC, id DESC
    LIMIT 20
    """, (employee_id,))
    hour_logs = [dict(r) for r in cursor.fetchall()]
    
    # Assigned upcoming/active orders
    cursor.execute("""
    SELECT * FROM orders
    WHERE (assigned_handyman = ? OR assigned_handyman LIKE ?)
    ORDER BY preferred_date ASC, id DESC
    """, (user["full_name"], f"%{user['full_name']}%"))
    orders_rows = cursor.fetchall()
    orders_list = [dict(o) for o in orders_rows]
    
    active_orders = [o for o in orders_list if o["status"] not in ("Utført", "Fakturert", "Kansellert")]
    completed_orders = [o for o in orders_list if o["status"] in ("Utført", "Fakturert")]
    
    balance = round(worked_hours - target_hours, 1)
    
    conn.close()
    return {
        "profile": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "phone": user["phone"],
            "role": user["role"],
            "handyman_specialty": user["handyman_specialty"],
            "avatar_url": user["avatar_url"],
            "employment_percentage": pct,
            "target_weekly_hours": target_hours,
            "hourly_rate": user["hourly_rate"],
            "status": user["status"],
            "bio": user["bio"]
        },
        "stats": {
            "worked_hours": worked_hours,
            "target_hours": target_hours,
            "time_balance": balance,
            "is_overtime": balance > 0,
            "progress_pct": min(round((worked_hours / target_hours) * 100, 1) if target_hours > 0 else 0, 100),
            "active_orders_count": len(active_orders),
            "completed_orders_count": len(completed_orders)
        },
        "recent_hour_logs": hour_logs,
        "assigned_orders": orders_list
    }


# --- Accounting & Financial Management Endpoints ---

class ExpenseCreate(BaseModel):
    title: str
    category: str
    vendor: str
    amount_gross: float
    vat_rate: Optional[float] = 25.0
    expense_date: Optional[str] = None
    receipt_url: Optional[str] = ""
    notes: Optional[str] = ""
    created_by: Optional[str] = "Admin"

class EmploymentContractCreate(BaseModel):
    user_id: int
    employee_name: str
    position_title: str
    employment_percentage: int = 100
    weekly_hours: Optional[float] = 37.5
    hourly_rate: Optional[float] = 380.0
    start_date: str
    probation_period: Optional[str] = "6 måneder"
    notice_period: Optional[str] = "1 måned (14 dager i prøvetid)"
    workplace_address: Optional[str] = "Bergen og omegn (Kundelokasjoner)"
    special_terms: Optional[str] = ""


@app.get("/api/accounting/summary")
async def get_accounting_summary(fiscal_year: Optional[int] = None):
    """Calculates comprehensive P&L (Resultatregnskap), payroll with Fiscal Year totals, expenses, VAT balance, and profit margin."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    current_year = fiscal_year or datetime.now().year
    
    # 1. Total Revenue from Orders (Gross, Net, VAT 25%)
    cursor.execute("""
    SELECT 
        COALESCE(SUM(total_price), 0.0) as total_gross,
        COALESCE(SUM(CASE WHEN status IN ('Utført', 'Fakturert', 'Bekreftet', 'Pågår', 'På vei') THEN total_price ELSE 0.0 END), 0.0) as realized_gross,
        COUNT(id) as total_orders_count,
        SUM(CASE WHEN status IN ('Utført', 'Fakturert') THEN 1 ELSE 0 END) as completed_orders_count
    FROM orders
    """)
    rev_row = cursor.fetchone()
    revenue_gross = float(rev_row["realized_gross"])
    # 25% VAT on service revenue
    revenue_net = round(revenue_gross / 1.25, 2)
    revenue_vat = round(revenue_gross - revenue_net, 2)
    
    # 2. Payroll Costs (Lønnskostnader) & Fiscal Year Total Calculations
    cursor.execute("""
    SELECT 
        u.id as user_id,
        u.full_name,
        u.employment_percentage,
        u.target_weekly_hours,
        COALESCE(u.hourly_rate, 380.0) as hourly_rate,
        COALESCE(SUM(w.hours_spent), 0.0) as total_hours_worked
    FROM users u
    LEFT JOIN work_hours_log w ON u.id = w.user_id
    WHERE u.role = 'handyman'
    GROUP BY u.id
    ORDER BY u.full_name ASC
    """)
    handymen_payroll_rows = cursor.fetchall()
    
    payroll_list = []
    total_wages_gross_ytd = 0.0
    total_fiscal_annual_wages_gross = 0.0
    total_fiscal_annual_cost = 0.0
    
    for h in handymen_payroll_rows:
        hrs_worked = float(h["total_hours_worked"])
        rate = float(h["hourly_rate"])
        pct = float(h["employment_percentage"] or 100)
        weekly_target = float(h["target_weekly_hours"] or round((pct / 100.0) * 37.5, 2))
        
        # Påløpt hittil (YTD / Period)
        gross_wage_ytd = round(hrs_worked * rate, 2)
        aga_tax_ytd = round(gross_wage_ytd * 0.141, 2) # 14.1% Arbeidsgiveravgift Sone 1
        holiday_pay_ytd = round(gross_wage_ytd * 0.102, 2) # 10.2% Feriepenger
        emp_total_cost_ytd = round(gross_wage_ytd + aga_tax_ytd + holiday_pay_ytd, 2)
        
        total_wages_gross_ytd += gross_wage_ytd
        
        # Helårsberegning for Fiscal År (52 uker normtid, 100% = 1950t/år)
        annual_hours_norm = round(weekly_target * 52.0, 1)
        annual_gross_wage = round(annual_hours_norm * rate, 2)
        annual_aga = round(annual_gross_wage * 0.141, 2)
        annual_holiday_pay = round(annual_gross_wage * 0.102, 2)
        annual_otp = round(annual_gross_wage * 0.02, 2) # 2.0% OTP
        annual_total_cost = round(annual_gross_wage + annual_aga + annual_holiday_pay + annual_otp, 2)
        
        total_fiscal_annual_wages_gross += annual_gross_wage
        total_fiscal_annual_cost += annual_total_cost
        
        payroll_list.append({
            "user_id": h["user_id"],
            "full_name": h["full_name"],
            "employment_percentage": int(pct),
            "target_weekly_hours": weekly_target,
            "annual_hours_norm": annual_hours_norm,
            "hourly_rate": rate,
            "hours_worked": hrs_worked,
            "gross_wage": gross_wage_ytd,
            "aga_tax": aga_tax_ytd,
            "holiday_pay": holiday_pay_ytd,
            "total_cost": emp_total_cost_ytd,
            "fiscal_year_annual_gross": annual_gross_wage,
            "fiscal_year_annual_aga": annual_aga,
            "fiscal_year_annual_holiday": annual_holiday_pay,
            "fiscal_year_annual_otp": annual_otp,
            "fiscal_year_annual_total_cost": annual_total_cost
        })
        
    total_aga_tax_ytd = round(total_wages_gross_ytd * 0.141, 2)
    total_holiday_pay_ytd = round(total_wages_gross_ytd * 0.102, 2)
    total_payroll_cost_ytd = round(total_wages_gross_ytd + total_aga_tax_ytd + total_holiday_pay_ytd, 2)
    
    total_fiscal_annual_aga = round(total_fiscal_annual_wages_gross * 0.141, 2)
    total_fiscal_annual_holiday = round(total_fiscal_annual_wages_gross * 0.102, 2)
    total_fiscal_annual_otp = round(total_fiscal_annual_wages_gross * 0.02, 2)
    
    # 3. Operating Expenses & Materials (Driftsutgifter)
    cursor.execute("""
    SELECT 
        COALESCE(SUM(amount_gross), 0.0) as exp_gross,
        COALESCE(SUM(amount_net), 0.0) as exp_net,
        COALESCE(SUM(vat_amount), 0.0) as exp_vat,
        COUNT(id) as exp_count
    FROM expenses
    """)
    exp_row = cursor.fetchone()
    expenses_gross = float(exp_row["exp_gross"])
    expenses_net = float(exp_row["exp_net"])
    expenses_vat = float(exp_row["exp_vat"])
    
    # Group expenses by category
    cursor.execute("""
    SELECT category, SUM(amount_gross) as cat_gross, SUM(amount_net) as cat_net, COUNT(id) as count
    FROM expenses
    GROUP BY category
    ORDER BY cat_gross DESC
    """)
    expense_categories = [dict(r) for r in cursor.fetchall()]
    
    # Recent expense list
    cursor.execute("""
    SELECT id, title, category, vendor, amount_gross, vat_rate, amount_net, vat_amount, expense_date, receipt_url, notes, created_by
    FROM expenses
    ORDER BY expense_date DESC, id DESC
    LIMIT 30
    """)
    recent_expenses = [dict(r) for r in cursor.fetchall()]
    
    # 4. Resultat / Fortjeneste & Marginer
    # Driftsresultat = Netto Inntekt - Lønnskostnader (YTD) - Netto Driftsutgifter
    net_operating_profit = round(revenue_net - total_payroll_cost_ytd - expenses_net, 2)
    profit_margin_pct = round((net_operating_profit / revenue_net) * 100.0, 1) if revenue_net > 0 else 0.0
    
    # 5. MVA-oppgjør (VAT settlement to Tax Authority)
    # Skyldig MVA = Utgående MVA på salg - Inngående MVA på kjøp/utgifter
    vat_payable = round(revenue_vat - expenses_vat, 2)
    
    conn.close()
    
    return {
        "fiscal_year": current_year,
        "revenue": {
            "gross": revenue_gross,
            "net": revenue_net,
            "vat_sales": revenue_vat,
            "orders_count": rev_row["total_orders_count"],
            "completed_count": rev_row["completed_orders_count"]
        },
        "payroll": {
            "gross_wages": total_wages_gross_ytd,
            "aga_tax": total_aga_tax_ytd,
            "holiday_pay": total_holiday_pay_ytd,
            "total_payroll_cost": total_payroll_cost_ytd,
            "fiscal_year": {
                "year": current_year,
                "total_annual_cost": total_fiscal_annual_cost,
                "annual_gross_wages": total_fiscal_annual_wages_gross,
                "annual_aga_tax": total_fiscal_annual_aga,
                "annual_holiday_pay": total_fiscal_annual_holiday,
                "annual_otp": total_fiscal_annual_otp,
                "active_employees_count": len(payroll_list)
            },
            "employees_breakdown": payroll_list
        },
        "expenses": {
            "gross": expenses_gross,
            "net": expenses_net,
            "vat_deductible": expenses_vat,
            "count": exp_row["exp_count"],
            "categories": expense_categories,
            "recent_list": recent_expenses
        },
        "profit": {
            "net_profit": net_operating_profit,
            "profit_margin_pct": profit_margin_pct,
            "is_profitable": net_operating_profit >= 0
        },
        "vat_settlement": {
            "sales_vat_outgoing": revenue_vat,
            "purchase_vat_incoming": expenses_vat,
            "net_vat_payable": vat_payable
        }
    }


@app.get("/api/expenses")
async def get_expenses(category: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM expenses WHERE 1=1"
    params = []
    if category and category != "Alle":
        query += " AND category = ?"
        params.append(category)
    query += " ORDER BY expense_date DESC, id DESC"
    cursor.execute(query, params)
    expenses = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"expenses": expenses, "count": len(expenses)}


@app.post("/api/expenses", status_code=status.HTTP_201_CREATED)
async def create_expense(exp: ExpenseCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    vat_rate = exp.vat_rate if exp.vat_rate is not None else 25.0
    amount_net = round(exp.amount_gross / (1.0 + (vat_rate / 100.0)), 2)
    vat_amount = round(exp.amount_gross - amount_net, 2)
    exp_date = exp.expense_date or datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    INSERT INTO expenses (
        title, category, vendor, amount_gross, vat_rate, amount_net, vat_amount,
        expense_date, receipt_url, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        exp.title.strip(),
        exp.category.strip(),
        exp.vendor.strip(),
        exp.amount_gross,
        vat_rate,
        amount_net,
        vat_amount,
        exp_date,
        exp.receipt_url or "",
        exp.notes or "",
        exp.created_by or "Admin",
        now_str
    ))
    
    expense_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Utgift '{exp.title}' på kr {exp.amount_gross},- er registrert i regnskapet!",
        "expense_id": expense_id,
        "amount_net": amount_net,
        "vat_amount": vat_amount
    }


@app.delete("/api/expenses/{expense_id}")
async def delete_expense(expense_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Utgift slettet fra regnskapet."}


# --- Employment Contracts Endpoints ---

@app.get("/api/contracts")
async def get_all_contracts():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM employment_contracts ORDER BY id DESC")
    contracts = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"contracts": contracts, "count": len(contracts)}


@app.get("/api/contracts/user/{user_id}")
async def get_user_contract(user_id: int):
    """Returns stored contract or dynamically generates pre-filled standard contract based on employee profile."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if existing contract exists
    cursor.execute("SELECT * FROM employment_contracts WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user_id,))
    existing = cursor.fetchone()
    
    if existing:
        conn.close()
        return {"contract": dict(existing), "is_saved": True}
        
    # Generate pre-filled draft from user profile
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="Ansatt ikke funnet.")
        
    pct = user["employment_percentage"] if user["employment_percentage"] is not None else 100
    weekly_hours = round((pct / 100.0) * 37.5, 2) if pct > 0 else 0.0
    hourly_rate = user["hourly_rate"] if user["hourly_rate"] is not None else 380.0
    rand_id = random.randint(100, 999)
    contract_number = f"CTR-2026-{rand_id}"
    
    if pct == 0:
        position_title = f"{user['handyman_specialty'] or 'Håndverker'} (Tilkallingsvikar / Ekstrahjelp)"
        special_terms = "Rammeavtale for tilkallingsvikar / ekstrahjelp etter behov jf. Arbeidsmiljøloven § 14-9. Arbeidstid tilbys og avtales særskilt for hvert enkelt oppdrag. Lønn utbetales etter avtalt timesats for faktisk arbeidede timer. Arbeidstaker står fritt til å akseptere eller avslå tilbudte oppdrag/vakter."
        probation_period = "Ingen fast prøvetid (oppdragsbasert)"
        notice_period = "14 dager"
    else:
        position_title = user["handyman_specialty"] or "Håndverker & Montør"
        special_terms = f"Fast ansettelse med {pct}% stillingsprosent ({weekly_hours} timer per uke). Overtid godtgjøres med 40% tillegg etter AML § 10-6. Arbeidstaker stiller med nødvendig førerkort klasse B."
        probation_period = "6 måneder"
        notice_period = "1 måned (14 dager i prøvetiden)"

    draft_contract = {
        "user_id": user["id"],
        "contract_number": contract_number,
        "employee_name": user["full_name"],
        "employee_email": user["email"],
        "employee_phone": user["phone"] or "",
        "employee_address": f"{user['street_address'] or 'Adresse'}, {user['postal_code'] or ''} {user['city'] or 'Bergen'}",
        "position_title": position_title,
        "employment_percentage": pct,
        "weekly_hours": weekly_hours,
        "hourly_rate": hourly_rate,
        "start_date": datetime.now().strftime("%Y-%m-%d"),
        "probation_period": probation_period,
        "notice_period": notice_period,
        "workplace_address": "Bergen og omegn (Kundelokasjoner / Servida AS)",
        "special_terms": special_terms,
        "employer_name": "Servida AS",
        "employer_org_no": "932 847 192 MVA",
        "employer_address": "Servida Hovedkontor, 5000 Bergen",
        "status": "Forhåndsutfylt Utkast",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    return {"contract": draft_contract, "is_saved": False}


@app.post("/api/contracts", status_code=status.HTTP_201_CREATED)
async def create_or_save_contract(c: EmploymentContractCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rand_num = random.randint(100, 999)
    contract_number = f"CTR-2026-{rand_num}"
    weekly_hours = c.weekly_hours or round((c.employment_percentage / 100.0) * 37.5, 2)
    
    cursor.execute("""
    INSERT INTO employment_contracts (
        user_id, contract_number, employee_name, position_title, employment_percentage,
        weekly_hours, hourly_rate, start_date, probation_period, notice_period,
        workplace_address, special_terms, created_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Signert & Aktiv')
    """, (
        c.user_id,
        contract_number,
        c.employee_name.strip(),
        c.position_title.strip(),
        c.employment_percentage,
        weekly_hours,
        c.hourly_rate or 380.0,
        c.start_date,
        c.probation_period or "6 måneder",
        c.notice_period or "1 måned (14 dager i prøvetid)",
        c.workplace_address or "Bergen og omegn",
        c.special_terms or "",
        now_str
    ))
    
    contract_id = cursor.lastrowid
    
    # Also synchronize user record if needed
    cursor.execute("""
    UPDATE users SET 
        employment_percentage = ?,
        target_weekly_hours = ?,
        hourly_rate = ?
    WHERE id = ?
    """, (c.employment_percentage, weekly_hours, c.hourly_rate or 380.0, c.user_id))
    
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"Arbeidsavtale {contract_number} for {c.employee_name} er opprettet og aktivert!",
        "contract_id": contract_id,
        "contract_number": contract_number
    }


# ==========================================================================
# 15. EMAIL SERVICE & COMMUNICATION HUB ENDPOINTS
# ==========================================================================

class EmailSendPayload(BaseModel):
    recipient_email: str
    recipient_name: Optional[str] = ""
    subject: str
    body_html: str
    body_text: Optional[str] = ""
    category: Optional[str] = "Generell"
    related_order_id: Optional[int] = None
    related_user_id: Optional[int] = None
    folder: Optional[str] = "sent"

class EmailSettingsUpdate(BaseModel):
    smtp_host: Optional[str] = "smtp.servida.no"
    smtp_port: Optional[int] = 587
    smtp_user: Optional[str] = "post@servida.no"
    smtp_password: Optional[str] = ""
    sender_name: Optional[str] = "Servida AS Kundesenter"
    sender_email: Optional[str] = "post@servida.no"
    auto_order_confirmations: Optional[int] = 1
    auto_handyman_dispatch: Optional[int] = 1
    auto_completion_receipt: Optional[int] = 1

class EmailAiDraftPayload(BaseModel):
    prompt: str
    category: Optional[str] = "Generell"
    recipient_name: Optional[str] = ""
    recipient_role: Optional[str] = "Kunde"
    order_id: Optional[int] = None


@app.get("/api/emails")
async def get_emails(
    folder: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    unread_only: Optional[bool] = False
):
    """Retrieves emails filtered by folder (inbox, sent, automated, drafts, trash), category, or search."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM emails WHERE 1=1"
    params = []
    
    if folder and folder != "all":
        query += " AND folder = ?"
        params.append(folder)
        
    if category and category != "Alle":
        query += " AND category = ?"
        params.append(category)
        
    if unread_only:
        query += " AND is_read = 0"
        
    if search and search.strip():
        s = f"%{search.strip().lower()}%"
        query += " AND (lower(subject) LIKE ? OR lower(recipient_email) LIKE ? OR lower(recipient_name) LIKE ? OR lower(sender_name) LIKE ? OR lower(sender_email) LIKE ?)"
        params.extend([s, s, s, s, s])
        
    query += " ORDER BY id DESC LIMIT 100"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    emails = [dict(r) for r in rows]
    
    # Counts
    cursor.execute("SELECT COUNT(*) FROM emails WHERE folder = 'inbox' AND is_read = 0")
    unread_inbox = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM emails WHERE folder = 'inbox'")
    total_inbox = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM emails WHERE folder = 'sent'")
    total_sent = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM emails WHERE folder = 'automated'")
    total_automated = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        "emails": emails,
        "count": len(emails),
        "unread_inbox_count": unread_inbox,
        "total_inbox": total_inbox,
        "total_sent": total_sent,
        "total_automated": total_automated
    }


@app.get("/api/emails/{email_id}")
async def get_single_email(email_id: int):
    """Fetches a specific email and marks it as read."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM emails WHERE id = ?", (email_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="E-post ikke funnet.")
        
    cursor.execute("UPDATE emails SET is_read = 1 WHERE id = ?", (email_id,))
    conn.commit()
    
    email_data = dict(row)
    email_data["is_read"] = 1
    
    # Optional related order info
    related_order = None
    if row["related_order_id"]:
        cursor.execute("SELECT id, order_number, service_title, status, total_price, customer_name, customer_email, preferred_date FROM orders WHERE id = ?", (row["related_order_id"],))
        ord_row = cursor.fetchone()
        if ord_row:
            related_order = dict(ord_row)
            
    conn.close()
    return {"email": email_data, "related_order": related_order}


@app.post("/api/emails/send", status_code=status.HTTP_201_CREATED)
async def send_email_message(payload: EmailSendPayload):
    """Sends and logs an outbound email in the Servida email hub."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT sender_name, sender_email FROM email_settings WHERE id = 1")
    settings_row = cursor.fetchone()
    sender_name = settings_row["sender_name"] if settings_row else "Servida AS"
    sender_email = settings_row["sender_email"] if settings_row else "post@servida.no"
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Wrap in branded HTML container if not already HTML
    body_html = payload.body_html
    if "<div" not in body_html and "<p" not in body_html:
        body_html = f"""
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1E293B; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; background: #FFFFFF;">
          <div style="background: #0F172A; padding: 1.5rem; color: #FFFFFF; display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 1.3rem; font-weight: 800; letter-spacing: -0.5px;">SERVIDA<span style="color: #38BDF8;">.</span></div>
            <div style="font-size: 0.8rem; color: #94A3B8;">Håndverkstjenester & Montering</div>
          </div>
          <div style="padding: 1.75rem; line-height: 1.6; font-size: 0.95rem;">
            {body_html.replace(chr(10), '<br>')}
          </div>
          <div style="background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 1.25rem 1.75rem; font-size: 0.78rem; color: #64748B;">
            <strong>Servida AS</strong> &bull; Org.nr: 932 847 192 MVA &bull; Bergen, Norge<br>
            Tlf: 55 12 34 56 &bull; E-post: <a href="mailto:post@servida.no" style="color: #2563EB;">post@servida.no</a>
          </div>
        </div>
        """
        
    cursor.execute("""
    INSERT INTO emails (
        folder, sender_email, sender_name, recipient_email, recipient_name,
        subject, body_html, body_text, category, status,
        related_order_id, related_user_id, is_read, is_starred, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Levert', ?, ?, 1, 0, ?)
    """, (
        payload.folder or "sent",
        sender_email,
        sender_name,
        payload.recipient_email.strip(),
        payload.recipient_name.strip() if payload.recipient_name else payload.recipient_email.split('@')[0],
        payload.subject.strip(),
        body_html,
        payload.body_text or payload.subject,
        payload.category or "Generell",
        payload.related_order_id,
        payload.related_user_id,
        now_str
    ))
    
    email_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "message": f"E-post sendt til {payload.recipient_email}!",
        "email_id": email_id
    }


@app.post("/api/emails/ai-draft")
async def ai_draft_email(payload: EmailAiDraftPayload):
    """Uses Gemini AI or built-in intelligent engine to generate customized Norwegian business email drafts."""
    prompt = payload.prompt.strip()
    recipient = payload.recipient_name or "Kunde"
    category = payload.category or "Generell"
    
    # Try Gemini API if key is present
    gemini_key = get_gemini_api_key()
    if gemini_key:
        try:
            import urllib.request
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            system_instruction = (
                "Du er en profesjonell norsk kundeservice- og e-post-assistent for Servida AS (en ledende plattform for håndverkere og montører i Bergen). "
                "Generer et høflig, tillitsvekkende og tydelig e-postutkast på feilfritt norsk basert på brukerens instruks. "
                "Returner JSON med format: {\"subject\": \"...\", \"body_text\": \"...\", \"body_html\": \"...\"}."
            )
            req_data = {
                "contents": [{"parts": [{"text": f"Instruks: {prompt}. Mottaker: {recipient}. Kategori: {category}. Generer profesjonell e-post."}]}],
                "systemInstruction": {"parts": [{"text": system_instruction}]},
                "generationConfig": {"responseMimeType": "application/json"}
            }
            req = urllib.request.Request(url, data=json.dumps(req_data).encode("utf-8"), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as response:
                res_body = json.loads(response.read().decode("utf-8"))
                text_content = res_body["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text_content)
                return {"success": True, "subject": parsed.get("subject"), "body_html": parsed.get("body_html") or parsed.get("body_text"), "body_text": parsed.get("body_text")}
        except Exception as err:
            pass # Fallback to internal generator below
            
    # Built-in fallback template generator
    subject = f"Vedrørende henvendelse / oppdrag – Servida AS"
    if "tilbud" in prompt.lower() or category == "Tilbud":
        subject = f"Uforpliktende pristilbud til {recipient} – Servida AS"
        body = f"""Hei {recipient},

Takk for hyggelig henvendelse!

Basert på dine opplysninger har vi gleden av å oversende et uforpliktende pristilbud:
• {prompt}
• Fagmessig utførelse av autorisert fagperson
• Inkluderer nødvendig materiell og 2 års garanti

Ta gjerne kontakt om du har spørsmål eller ønsker å avtale oppstartstidspunkt.

Vennlig hilsen,
Servida AS Kundesenter
Tlf: 55 12 34 56 | post@servida.no"""
    elif "forsinkelse" in prompt.lower() or "tid" in prompt.lower():
        subject = f"Viktig oppdatering om oppmøtetidspunkt – Servida AS"
        body = f"""Hei {recipient},

Vi ønsker å gi en kort oppdatering vedrørende dagens planlagte oppdrag:
{prompt}

Vi beklager eventuelle ulemper dette medfører og takker for din forståelse. Vår håndverker vil holde deg løpende oppdatert.

Med vennlig hilsen,
Servida AS Oppdragsledelse"""
    else:
        subject = f"Melding fra Servida AS til {recipient}"
        body = f"""Hei {recipient},

Viser til din kontakt med Servida AS.

{prompt}

Ikke nøl med å svare på denne e-posten dersom du har spørsmål eller kommentarer.

Med vennlig hilsen,
Servida AS Kundeservice
Tlf: 55 12 34 56 | post@servida.no"""

    return {
        "success": True,
        "subject": subject,
        "body_text": body,
        "body_html": body.replace('\n', '<br>')
    }


@app.get("/api/email-templates")
async def get_email_templates():
    """Returns available email templates."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM email_templates ORDER BY id ASC")
    templates = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"templates": templates}


@app.get("/api/email-settings")
async def get_email_settings():
    """Returns current SMTP and automated trigger configuration."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM email_settings WHERE id = 1")
    row = cursor.fetchone()
    settings = dict(row) if row else {}
    conn.close()
    return {"settings": settings}


@app.put("/api/email-settings")
async def update_email_settings(s: EmailSettingsUpdate):
    """Updates email service SMTP and trigger settings."""
    conn = get_db_connection()
    cursor = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    UPDATE email_settings SET 
        smtp_host = ?,
        smtp_port = ?,
        smtp_user = ?,
        sender_name = ?,
        sender_email = ?,
        auto_order_confirmations = ?,
        auto_handyman_dispatch = ?,
        auto_completion_receipt = ?,
        updated_at = ?
    WHERE id = 1
    """, (
        s.smtp_host,
        s.smtp_port,
        s.smtp_user,
        s.sender_name,
        s.sender_email,
        s.auto_order_confirmations,
        s.auto_handyman_dispatch,
        s.auto_completion_receipt,
        now_str
    ))
    conn.commit()
    conn.close()
    return {"success": True, "message": "E-postinnstillinger lagret!"}


@app.delete("/api/emails/{email_id}")
async def delete_email_message(email_id: int):
    """Moves an email to trash or deletes it."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT folder FROM emails WHERE id = ?", (email_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="E-post ikke funnet.")
        
    if row["folder"] == "trash":
        cursor.execute("DELETE FROM emails WHERE id = ?", (email_id,))
        msg = "E-post permanent slettet."
    else:
        cursor.execute("UPDATE emails SET folder = 'trash' WHERE id = ?", (email_id,))
        msg = "E-post flyttet til papirkurv."
        
    conn.commit()
    conn.close()
    return {"success": True, "message": msg}


@app.post("/api/emails/{email_id}/star")
async def toggle_star_email(email_id: int):
    """Toggles starred status on an email."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE emails SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END WHERE id = ?", (email_id,))
    conn.commit()
    cursor.execute("SELECT is_starred FROM emails WHERE id = ?", (email_id,))
    val = cursor.fetchone()[0]
    conn.close()
    return {"success": True, "is_starred": bool(val)}





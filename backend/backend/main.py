import sys
import os
import json
import sqlite3
import random
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



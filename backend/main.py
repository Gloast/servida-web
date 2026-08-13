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
    from database import get_db_connection, init_db
except ImportError:
    from backend.database import get_db_connection, init_db

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

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    assigned_handyman: Optional[str] = None
    handyman_notes: Optional[str] = None

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


# --- REST API Endpoints ---

@app.get("/api/catalog")
async def get_catalog():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Categories
    cursor.execute("SELECT * FROM categories ORDER BY sort_order ASC")
    cat_rows = cursor.fetchall()
    categories = []
    for r in cat_rows:
        categories.append({
            "id": r["id"],
            "name": r["name"],
            "icon": r["icon"],
            "description": r["description"]
        })
        
    # 2. Services
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

@app.post("/api/bookings", status_code=status.HTTP_201_CREATED)
async def create_booking(booking: BookingCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Generate human readable order number e.g. SRV-20260814-4821
    date_str = datetime.now().strftime("%Y%m%d")
    rand_suffix = random.randint(1000, 9999)
    order_number = f"SRV-{date_str}-{rand_suffix}"
    
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    options_json = json.dumps(booking.selected_options or [], ensure_ascii=False)
    
    cursor.execute("""
    INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone,
        street_address, postal_code, city, preferred_date, time_slot,
        notes, service_handle, service_title, variant_name,
        selected_options, total_price, status, assigned_handyman,
        handyman_notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ny bestilling', 'Ikke tildelt', '', ?)
    """, (
        order_number,
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
async def get_orders(status: Optional[str] = None, search: Optional[str] = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM orders WHERE 1=1"
    params = []
    
    if status and status != "Alle":
        query += " AND status = ?"
        params.append(status)
        
    if search:
        query += " AND (order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR service_title LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s])
        
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
            "assigned_handyman": r["assigned_handyman"],
            "handyman_notes": r["handyman_notes"],
            "created_at": r["created_at"]
        })
        
    conn.close()
    return {"orders": orders, "count": len(orders)}

@app.patch("/api/orders/{order_id}")
async def update_order(order_id: int, update: OrderUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    if update.status is not None:
        updates.append("status = ?")
        params.append(update.status)
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
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Ordre oppdatert"}

@app.get("/api/stats")
async def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM orders")
    total_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM orders WHERE status = 'Ny bestilling'")
    new_orders = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM orders WHERE status IN ('Bekreftet', 'Håndverker tildelt', 'På vei')")
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
    
    conn.close()
    
    return {
        "total_orders": total_orders,
        "new_orders": new_orders,
        "active_orders": active_orders,
        "completed_orders": completed_orders,
        "total_revenue": total_revenue,
        "active_services": active_services,
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

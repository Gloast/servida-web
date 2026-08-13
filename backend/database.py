import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "servida.db")
CATALOG_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "catalog.json")

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        street_address TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        city TEXT NOT NULL,
        preferred_date TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        notes TEXT,
        service_handle TEXT NOT NULL,
        service_title TEXT NOT NULL,
        variant_name TEXT,
        selected_options TEXT, -- JSON string
        total_price REAL NOT NULL,
        status TEXT DEFAULT 'Ny bestilling', -- 'Ny bestilling', 'Bekreftet', 'Håndverker tildelt', 'På vei', 'Utført', 'Fakturert', 'Kansellert'
        assigned_handyman TEXT DEFAULT 'Ikke tildelt',
        handyman_notes TEXT,
        created_at TEXT NOT NULL
    )
    """)
    
    # 2. Services table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        handle TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        short_description TEXT,
        price_from REAL NOT NULL,
        included TEXT, -- JSON array
        warranty TEXT,
        terms TEXT,
        variants TEXT, -- JSON array
        image_url TEXT,
        estimated_hours TEXT,
        popularity INTEGER DEFAULT 80,
        active INTEGER DEFAULT 1
    )
    """)
    
    # 3. Categories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        icon TEXT NOT NULL,
        description TEXT,
        sort_order INTEGER DEFAULT 0
    )
    """)
    
    conn.commit()
    
    # Check if services table is empty, if so populate from catalog.json
    cursor.execute("SELECT COUNT(*) FROM services")
    count = cursor.fetchone()[0]
    
    if count == 0 and os.path.exists(CATALOG_JSON_PATH):
        with open(CATALOG_JSON_PATH, "r", encoding="utf-8") as f:
            cat_data = json.load(f)
            
        # Insert categories
        for idx, (cat_name, cat_meta) in enumerate(cat_data.get("categories", {}).items()):
            cursor.execute("""
            INSERT OR IGNORE INTO categories (name, icon, description, sort_order)
            VALUES (?, ?, ?, ?)
            """, (cat_name, cat_meta.get("icon", "🛠️"), cat_meta.get("desc", ""), idx))
            
        # Insert services
        for s in cat_data.get("services", []):
            cursor.execute("""
            INSERT OR IGNORE INTO services (
                handle, title, category, description, short_description,
                price_from, included, warranty, terms, variants,
                image_url, estimated_hours, popularity, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                s.get("handle"),
                s.get("title"),
                s.get("category"),
                s.get("description"),
                s.get("short_description"),
                s.get("price_from", 0.0),
                json.dumps(s.get("included", []), ensure_ascii=False),
                s.get("warranty", "2 års garanti"),
                s.get("terms", "Kunden klargjør adkomst"),
                json.dumps(s.get("variants", []), ensure_ascii=False),
                s.get("image_url", "/static/images/hero-handyman.jpg"),
                s.get("estimated_hours", "1-3 timer"),
                s.get("popularity", 80),
                1
            ))
            
        # Seed 3 realistic demo orders so the admin dashboard is immediately active and impressive
        demo_orders = [
            (
                "SRV-20260814-1042", "Ole Christian Hansen", "ole.hansen@example.no", "982 34 567",
                "Fjellveien 14", "5014", "Bergen", "2026-08-15", "08:00 - 12:00",
                "Trenger hjelp til å montere 65\" Samsung på murvegg. Har veggfeste klart.",
                "montere-tv-pa-vegg", "Montere TV på vegg", "Størrelse: 55-100\"",
                json.dumps([{"name": "Skruer for mur/betong", "price": 0.0}]),
                1847.0, "Bekreftet", "Lars (Snekker)", "Murvegg, ta med slagdrill og 8mm betongbor.",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ),
            (
                "SRV-20260814-1043", "Kari Nordmann", "kari.nordmann@example.no", "415 88 920",
                "Strandgaten 82", "5004", "Bergen", "2026-08-16", "12:00 - 16:00",
                "Ønsker montering av ny smartlås på ytterdør i tre.",
                "installasjon-av-smartlas", "Installasjon av smartlås", "Standard",
                json.dumps([]),
                1990.0, "Ny bestilling", "Ikke tildelt", "",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ),
            (
                "SRV-20260814-1044", "Henrik Ibsen", "henrik.ibsen@example.no", "901 12 345",
                "Kalfarveien 28", "5018", "Bergen", "2026-08-14", "16:00 - 20:00",
                "Bytte av begge fremre bremser og klosser på VW Golf.",
                "bytte-bremser", "Bytte av bremser", "Sider: 2 sider (foran)",
                json.dumps([{"name": "Bremsevæskesjekk", "price": 0.0}]),
                2890.0, "Håndverker tildelt", "Magnus (Mekaniker)", "Kunden har garasje.",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
        ]
        
        for o in demo_orders:
            cursor.execute("""
            INSERT OR IGNORE INTO orders (
                order_number, customer_name, customer_email, customer_phone,
                street_address, postal_code, city, preferred_date, time_slot,
                notes, service_handle, service_title, variant_name,
                selected_options, total_price, status, assigned_handyman,
                handyman_notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, o)
            
        conn.commit()
        print("Database initialized and populated with catalog data and initial sample bookings!")
        
    conn.close()

if __name__ == "__main__":
    init_db()

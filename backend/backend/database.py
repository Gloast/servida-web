import sqlite3
import json
import os
import hashlib
import hmac
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "servida.db")
CATALOG_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "catalog.json")

def hash_password(password: str) -> str:
    salt = "servida_secure_salt_2026"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Users table (Customers, Admins, Handymen)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        street_address TEXT,
        postal_code TEXT,
        city TEXT,
        role TEXT DEFAULT 'customer', -- 'customer', 'admin', 'handyman'
        handyman_specialty TEXT,
        avatar_url TEXT,
        created_at TEXT NOT NULL
    )
    """)
    
    # 2. Orders table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        user_id INTEGER,
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
        status TEXT DEFAULT 'Ny bestilling', -- 'Ny bestilling', 'Bekreftet', 'Håndverker tildelt', 'På vei', 'Pågår', 'Utført', 'Fakturert', 'Kansellert'
        payment_status TEXT DEFAULT 'Utestående', -- 'Utestående', 'Vipps', 'Faktura', 'Betalt'
        assigned_handyman TEXT DEFAULT 'Ikke tildelt',
        handyman_notes TEXT,
        rating INTEGER,
        review_comment TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)
    
    # Check if columns exist in orders (for existing DB migration)
    cursor.execute("PRAGMA table_info(orders)")
    columns = [col[1] for col in cursor.fetchall()]
    if "user_id" not in columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN user_id INTEGER")
    if "payment_status" not in columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'Utestående'")
    if "rating" not in columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN rating INTEGER")
    if "review_comment" not in columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN review_comment TEXT")
    
    # 3. Order Status History (Audit & Live Tracking)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        note TEXT,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )
    """)
    
    # 4. Order Messages (Customer <-> Handyman / Admin chat)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS order_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        sender_id INTEGER,
        sender_name TEXT NOT NULL,
        sender_role TEXT NOT NULL, -- 'customer', 'handyman', 'admin'
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )
    """)
    
    # 5. Services table
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
    
    # 6. Categories table
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
    
    # --- Seed Default Users ---
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    default_users = [
        # Admin
        ("admin@servida.no", hash_password("servida2026"), "Servida Administrator", "55 12 34 56", "Servida Hovedkontor", "5000", "Bergen", "admin", None, None, now_str),
        # Handymen
        ("lars@servida.no", hash_password("lars2026"), "Lars Snekker", "912 34 567", "Snekkerveien 12", "5010", "Bergen", "handyman", "Snekker, Montering & Dører", "👷", now_str),
        ("magnus@servida.no", hash_password("magnus2026"), "Magnus Mekaniker", "923 45 678", "Garasjeveien 4", "5020", "Bergen", "handyman", "Bil, Bremser & Maskiner", "🔧", now_str),
        ("erik@servida.no", hash_password("erik2026"), "Erik Elektrotekniker", "934 56 789", "Teknikkveien 8", "5030", "Bergen", "handyman", "Smartlås, Belysning & Robotklipper", "⚡", now_str),
        # Demo Customer
        ("ole.hansen@example.no", hash_password("pass123"), "Ole Christian Hansen", "982 34 567", "Fjellveien 14", "5014", "Bergen", "customer", None, None, now_str),
        ("kari.nordmann@example.no", hash_password("pass123"), "Kari Nordmann", "415 88 920", "Strandgaten 82", "5004", "Bergen", "customer", None, None, now_str)
    ]
    
    for u in default_users:
        cursor.execute("""
        INSERT OR IGNORE INTO users (
            email, password_hash, full_name, phone, street_address, postal_code, city, role, handyman_specialty, avatar_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, u)
    
    conn.commit()
    
    # Check if services table is empty, if so populate from catalog.json
    cursor.execute("SELECT COUNT(*) FROM services")
    count = cursor.fetchone()[0]
    
    if count == 0 and os.path.exists(CATALOG_JSON_PATH):
        with open(CATALOG_JSON_PATH, "r", encoding="utf-8") as f:
            cat_data = json.load(f)
            
        for idx, (cat_name, cat_meta) in enumerate(cat_data.get("categories", {}).items()):
            cursor.execute("""
            INSERT OR IGNORE INTO categories (name, icon, description, sort_order)
            VALUES (?, ?, ?, ?)
            """, (cat_name, cat_meta.get("icon", "🛠️"), cat_meta.get("desc", ""), idx))
            
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
            
    # Seed or link demo orders
    cursor.execute("SELECT COUNT(*) FROM orders")
    order_count = cursor.fetchone()[0]
    
    if order_count == 0:
        demo_orders = [
            (
                "SRV-20260814-1042", 5, "Ole Christian Hansen", "ole.hansen@example.no", "982 34 567",
                "Fjellveien 14", "5014", "Bergen", "2026-08-15", "08:00 - 12:00",
                "Trenger hjelp til å montere 65\" Samsung på murvegg. Har veggfeste klart.",
                "montere-tv-pa-vegg", "Montere TV på vegg", "Størrelse: 55-100\"",
                json.dumps([{"name": "Skruer for mur/betong", "price": 0.0}]),
                1847.0, "Bekreftet", "Utestående", "Lars (Snekker)", "Murvegg, ta med slagdrill og 8mm betongbor.",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ),
            (
                "SRV-20260814-1043", 6, "Kari Nordmann", "kari.nordmann@example.no", "415 88 920",
                "Strandgaten 82", "5004", "Bergen", "2026-08-16", "12:00 - 16:00",
                "Ønsker montering av ny smartlås på ytterdør i tre.",
                "installasjon-av-smartlas", "Installasjon av smartlås", "Standard",
                json.dumps([]),
                1990.0, "Ny bestilling", "Utestående", "Ikke tildelt", "",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ),
            (
                "SRV-20260814-1044", 5, "Ole Christian Hansen", "ole.hansen@example.no", "982 34 567",
                "Fjellveien 14", "5014", "Bergen", "2026-08-10", "16:00 - 20:00",
                "Bytte av begge fremre bremser og klosser på VW Golf.",
                "bytte-bremser", "Bytte av bremser", "Sider: 2 sider (foran)",
                json.dumps([{"name": "Bremsevæskesjekk", "price": 0.0}]),
                2890.0, "Utført", "Vipps", "Magnus (Mekaniker)", "Arbeid fullført og testkjørt. Bremser fungerer optimalt.",
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
        ]
        
        for o in demo_orders:
            cursor.execute("""
            INSERT OR IGNORE INTO orders (
                order_number, user_id, customer_name, customer_email, customer_phone,
                street_address, postal_code, city, preferred_date, time_slot,
                notes, service_handle, service_title, variant_name,
                selected_options, total_price, status, payment_status, assigned_handyman,
                handyman_notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, o)
            order_id = cursor.lastrowid
            
            # Initial status history
            cursor.execute("""
            INSERT INTO order_status_history (order_id, status, note, updated_by, created_at)
            VALUES (?, ?, ?, ?, ?)
            """, (order_id, o[16], "Bestilling mottatt og registrert", "System", o[20]))
            
            # Sample message
            cursor.execute("""
            INSERT INTO order_messages (order_id, sender_id, sender_name, sender_role, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (order_id, 1, "Servida Kundeservice", "admin", "Takk for bestillingen! Vi har reservert tidspunktet for deg.", o[20]))
            
    conn.commit()
    conn.close()
    print("Database updated and initialized successfully with users, order status tracking, and roles!")

if __name__ == "__main__":
    init_db()

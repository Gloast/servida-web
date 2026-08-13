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
    
    # Check if columns exist in users (for existing DB migration)
    cursor.execute("PRAGMA table_info(users)")
    user_columns = [col[1] for col in cursor.fetchall()]
    if "employment_percentage" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN employment_percentage INTEGER DEFAULT 100")
    if "target_weekly_hours" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN target_weekly_hours REAL DEFAULT 37.5")
    if "hourly_rate" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN hourly_rate REAL DEFAULT 350.0")
    if "status" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'Aktiv'")
    if "bio" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''")

    # 1b. Work Hours Log (Timeregistrering & arbeidstimer)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS work_hours_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        order_id INTEGER,
        work_date TEXT NOT NULL,
        hours_spent REAL NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'Godkjent',
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
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
    
    # 7. Expenses & Receipts table (Regnskap & Utgifter)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        vendor TEXT NOT NULL,
        amount_gross REAL NOT NULL,
        vat_rate REAL DEFAULT 25.0,
        amount_net REAL NOT NULL,
        vat_amount REAL NOT NULL,
        expense_date TEXT NOT NULL,
        receipt_url TEXT,
        notes TEXT,
        created_by TEXT,
        created_at TEXT
    )
    """)

    # 8. Employment Contracts table (Arbeidsavtaler & Kontrakter)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employment_contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        contract_number TEXT UNIQUE NOT NULL,
        employee_name TEXT NOT NULL,
        position_title TEXT NOT NULL,
        employment_percentage INTEGER DEFAULT 100,
        weekly_hours REAL DEFAULT 37.5,
        hourly_rate REAL DEFAULT 380.0,
        start_date TEXT NOT NULL,
        probation_period TEXT DEFAULT '6 måneder',
        notice_period TEXT DEFAULT '1 måned (14 dager i prøvetid)',
        workplace_address TEXT DEFAULT 'Bergen og omegn (Kundelokasjoner)',
        special_terms TEXT,
        created_at TEXT,
        status TEXT DEFAULT 'Signert & Aktiv',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)
    
    conn.commit()
    
    # --- Seed Default Users ---
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    default_users = [
        # Admin
        ("admin@servida.no", hash_password("servida2026"), "Servida Administrator", "55 12 34 56", "Servida Hovedkontor", "5000", "Bergen", "admin", None, None, now_str, 100, 37.5, 450.0, "Aktiv", "Daglig leder og oppdragsansvarlig"),
        # Handymen
        ("lars@servida.no", hash_password("lars2026"), "Lars Snekker", "912 34 567", "Snekkerveien 12", "5010", "Bergen", "handyman", "Snekker, Montering & Dører", "👷", now_str, 100, 37.5, 380.0, "På oppdrag", "Fagbrev som tømrer med 12 års erfaring innen montering av dører, vinduer, kjøkken og møbler."),
        ("magnus@servida.no", hash_password("magnus2026"), "Magnus Mekaniker", "923 45 678", "Garasjeveien 4", "5020", "Bergen", "handyman", "Bil, Bremser & Maskiner", "🔧", now_str, 80, 30.0, 370.0, "Aktiv", "Fagbrev mekaniker. Spesialist på maskinservice, robotklippere, høytrykksvaskere og bilvedlikehold."),
        ("erik@servida.no", hash_password("erik2026"), "Erik Elektrotekniker", "934 56 789", "Teknikkveien 8", "5030", "Bergen", "handyman", "Smartlås, Belysning & Robotklipper", "⚡", now_str, 100, 37.5, 390.0, "Aktiv", "Elektrokyndig montør for smarthus, Yale Doorman, sensorer, el-belysning og kabelinstallasjoner."),
        ("thomas@servida.no", hash_password("thomas2026"), "Thomas Ekstrahjelp", "945 67 890", "Vikarveien 3", "5040", "Bergen", "handyman", "Maling, Montering & Hage", "⏱️", now_str, 0, 0.0, 360.0, "Tilkalling", "Tilkallingsvikar og ekstrahjelp for oppdragsstopper, helgevakter og sesongarbeid."),
        # Demo Customer
        ("ole.hansen@example.no", hash_password("pass123"), "Ole Christian Hansen", "982 34 567", "Fjellveien 14", "5014", "Bergen", "customer", None, None, now_str, 0, 0, 0, "Aktiv", ""),
        ("kari.nordmann@example.no", hash_password("pass123"), "Kari Nordmann", "415 88 920", "Strandgaten 82", "5004", "Bergen", "customer", None, None, now_str, 0, 0, 0, "Aktiv", "")
    ]
    
    for u in default_users:
        cursor.execute("""
        INSERT OR IGNORE INTO users (
            email, password_hash, full_name, phone, street_address, postal_code, city, role, handyman_specialty, avatar_url, created_at, employment_percentage, target_weekly_hours, hourly_rate, status, bio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, u)
        # Update if user already exists
        cursor.execute("""
        UPDATE users SET 
            employment_percentage = COALESCE(employment_percentage, ?),
            target_weekly_hours = COALESCE(target_weekly_hours, ?),
            hourly_rate = COALESCE(hourly_rate, ?),
            status = COALESCE(status, ?),
            bio = COALESCE(bio, ?)
        WHERE email = ?
        """, (u[11], u[12], u[13], u[14], u[15], u[0]))
    
    # --- Seed Sample Work Hours for Current Week ---
    cursor.execute("SELECT COUNT(*) FROM work_hours_log")
    log_count = cursor.fetchone()[0]
    if log_count == 0:
        cursor.execute("SELECT id, full_name FROM users WHERE role = 'handyman'")
        handymen = cursor.fetchall()
        sample_logs = [
            # Lars (100% = 37.5t target) -> 39.5t (2.0t overtid)
            ("Lars Snekker", 7.5, "Montering av innerdører og justering av karmer"),
            ("Lars Snekker", 8.0, "Montering av ytterdør inkl. tetting og listverk"),
            ("Lars Snekker", 7.5, "Montering av IKEA Pax garderobeskap hos kunde"),
            ("Lars Snekker", 8.5, "Reparasjon og listing av vinduer"),
            ("Lars Snekker", 8.0, "Oppmøte, sluttføring og befaring"),
            # Magnus (80% = 30.0t target) -> 28.0t (2.0t under/gjenstående)
            ("Magnus Mekaniker", 7.0, "Service og knivbytte på 3 robotklippere"),
            ("Magnus Mekaniker", 7.5, "Bytte av bremseklosser og skiver"),
            ("Magnus Mekaniker", 6.5, "Høytrykksvask og rens av terrasse og fasade"),
            ("Magnus Mekaniker", 7.0, "Dekkskift og vask av hjulsett"),
            # Erik (100% = 37.5t target) -> 37.5t (Akkurat i rute / 100%)
            ("Erik Elektrotekniker", 7.5, "Montering av Yale Doorman L3 smartlås"),
            ("Erik Elektrotekniker", 7.5, "Installasjon og kabelnedgraving for robotgressklipper"),
            ("Erik Elektrotekniker", 7.5, "Feilsøking av brudd på kantledning"),
            ("Erik Elektrotekniker", 7.5, "Montering av utvendig belysning og fotocelle"),
            ("Erik Elektrotekniker", 7.5, "Ferdigstilling og dokumentasjon")
        ]
        
        for name, hours, desc in sample_logs:
            cursor.execute("SELECT id FROM users WHERE full_name = ?", (name,))
            row = cursor.fetchone()
            if row:
                uid = row[0]
                cursor.execute("""
                INSERT INTO work_hours_log (user_id, work_date, hours_spent, description, status, created_at)
                VALUES (?, ?, ?, ?, 'Godkjent', ?)
                """, (uid, datetime.now().strftime("%Y-%m-%d"), hours, desc, now_str))

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
            
    # Seed Sample Expenses
    cursor.execute("SELECT COUNT(*) FROM expenses")
    if cursor.fetchone()[0] == 0:
        sample_expenses = [
            ("Karmskruer, fugeskum, tetningslister og foringer", "Materiell & Byggevarer", "Montér Bergen", 3450.0, 25.0, "2026-08-12", "Faktura #98124 - Dørmontering materiell", "Servida Admin"),
            ("Diesel for servicebil Lars (KH 12345)", "Drivstoff & Kjøretøy", "Circle K Danmarksplass", 1180.0, 25.0, "2026-08-13", "Korttransaksjon - Drivstoff", "Lars Snekker"),
            ("DeWalt Slagbor, bitsett og 60cm vater", "Verktøy & Utstyr", "Biltema Åsane", 890.0, 25.0, "2026-08-11", "Kvittering #4412", "Magnus Mekaniker"),
            ("Månedlig ansvars- og verktøyforsikring håndverkere", "Forsikring & Lisenser", "Gjensidige Forsikring", 2200.0, 0.0, "2026-08-01", "Polise #AN-88912-26", "Servida Admin"),
            ("Fiken regnskap & Tripletex API integrasjon", "Kontor & Programvare", "Fiken AS", 490.0, 25.0, "2026-08-01", "Månedsfaktura", "Servida Admin"),
            ("Robotklipper kantledning 500m og plugger", "Materiell & Byggevarer", "Grim Maskin AS", 1850.0, 25.0, "2026-08-14", "Grossistkjøp materiell", "Erik Elektrotekniker")
        ]
        
        for title, cat, vendor, gross, vat_pct, exp_date, notes, created_by in sample_expenses:
            net = round(gross / (1.0 + (vat_pct / 100.0)), 2)
            vat_val = round(gross - net, 2)
            cursor.execute("""
            INSERT INTO expenses (
                title, category, vendor, amount_gross, vat_rate, amount_net, vat_amount,
                expense_date, receipt_url, notes, created_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)
            """, (title, cat, vendor, gross, vat_pct, net, vat_val, exp_date, notes, created_by, now_str))

    # Seed Sample Employment Contracts
    cursor.execute("SELECT COUNT(*) FROM employment_contracts")
    if cursor.fetchone()[0] == 0:
        contracts_seed = [
            (2, "CTR-2026-001", "Lars Snekker", "Tømrer & Montør", 100, 37.5, 380.0, "2026-01-01", "6 måneder (fullført)", "1 måned", "Bergen og omegn", "Fast ansettelse med firmabil og verktøygodtgjørelse."),
            (3, "CTR-2026-002", "Magnus Mekaniker", "Mekaniker & Servicetekniker", 80, 30.0, 370.0, "2026-02-01", "6 måneder", "1 måned", "Bergen og omegn", "80% stilling, fleksibel arbeidstid ved sesongtopper."),
            (4, "CTR-2026-003", "Erik Elektrotekniker", "Elektromontør & Smarthus-spesialist", 100, 37.5, 390.0, "2026-01-15", "6 måneder", "1 måned", "Bergen og omegn", "Fast ansettelse med spesialkompetanse på smarthus og robotgressklippere.")
        ]
        for uid, ctr_no, emp_name, pos, pct, wh, hr, s_date, prob, not_p, wp, terms in contracts_seed:
            cursor.execute("""
            INSERT INTO employment_contracts (
                user_id, contract_number, employee_name, position_title, employment_percentage,
                weekly_hours, hourly_rate, start_date, probation_period, notice_period,
                workplace_address, special_terms, created_at, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Signert & Aktiv')
            """, (uid, ctr_no, emp_name, pos, pct, wh, hr, s_date, prob, not_p, wp, terms, now_str))

    conn.commit()
    conn.close()
    print("Database updated and initialized successfully with users, order status tracking, accounting expenses, and employment contracts!")

if __name__ == "__main__":
    init_db()


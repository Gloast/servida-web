import os
import json
import re
import urllib.request
import urllib.parse
import urllib.error
from typing import Dict, Any, List, Optional

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "data", "ai_config.json")
CATALOG_PATH = os.path.join(os.path.dirname(__file__), "data", "catalog.json")
PRODUCTS_IMG_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "static", "images", "products")

# Ensure directories exist
os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
os.makedirs(PRODUCTS_IMG_DIR, exist_ok=True)

def get_gemini_api_key() -> str:
    """Retrieve Gemini API key from config file or environment variable."""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                key = data.get("gemini_api_key", "").strip()
                if key:
                    return key
        except Exception:
            pass
    return os.environ.get("GEMINI_API_KEY", "").strip()

def save_gemini_api_key(key: str) -> None:
    """Persist Gemini API key to config file."""
    data = {}
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass
    data["gemini_api_key"] = key.strip()
    data["updated_at"] = "2026-08-14"
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def call_gemini_api(prompt: str, system_instruction: Optional[str] = None, json_mode: bool = False) -> str:
    """Call Google Gemini REST API directly using standard urllib."""
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("Ingen Gemini API-nøkkel er konfigurert. Vennligst legg inn nøkkel i Admin AI-innstillinger.")

    models = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"]
    last_err = None

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        
        contents = []
        if system_instruction:
            contents.append({
                "role": "user",
                "parts": [{"text": f"System Instruction:\n{system_instruction}\n\nTask: Follow instructions strictly."}]
            })
            contents.append({
                "role": "model",
                "parts": [{"text": "Understood. I will follow your instructions strictly."}]
            })

        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })

        req_body: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048,
            }
        }

        if json_mode:
            req_body["generationConfig"]["responseMimeType"] = "application/json"

        data_bytes = json.dumps(req_body).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_json = json.loads(resp.read().decode("utf-8"))
                candidates = resp_json.get("candidates", [])
                if candidates and "content" in candidates[0]:
                    parts = candidates[0]["content"].get("parts", [])
                    if parts and "text" in parts[0]:
                        return parts[0]["text"]
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            last_err = f"Gemini API Error ({e.code}): {err_msg}"
            continue
        except Exception as e:
            last_err = str(e)
            continue

    raise RuntimeError(last_err or "Kunne ikke fullføre kall til Gemini API.")

# ==========================================================================
# 1. CUSTOMER AI CHATBOT (SERVIDA AI-ASSISTENT)
# ==========================================================================

def get_catalog_summary() -> str:
    """Returns a compact summary of available services for AI context."""
    if not os.path.exists(CATALOG_PATH):
        return "125 håndverkertjenester med fastpris."
    try:
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            services = data.get("services", [])
            lines = [f"- {s.get('title')} ({s.get('category')}): Fastpris fra kr {int(s.get('price_from', 0))},-" for s in services[:50]]
            return "\n".join(lines)
    except Exception:
        return "Tjenester innen snekker, rørlegger, montering, maling, VVS og el."

def ask_customer_chatbot(message: str, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
    """Generates an intelligent customer advisor response using Gemini or fallback."""
    api_key = get_gemini_api_key()
    
    # Load catalog for service recommendations
    matched_services = []
    try:
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            cat = json.load(f)
            all_services = cat.get("services", [])
            
            tokens = re.findall(r'\w+', message.lower())
            for s in all_services:
                score = 0
                title_lower = s.get("title", "").lower()
                cat_lower = s.get("category", "").lower()
                for t in tokens:
                    if len(t) > 3:
                        if t in title_lower: score += 3
                        if t in cat_lower: score += 1
                if score > 0:
                    matched_services.append((score, s))
            matched_services.sort(key=lambda x: x[0], reverse=True)
            matched_services = [x[1] for x in matched_services[:3]]
    except Exception:
        pass

    if not api_key:
        fallback_text = (
            f"Hei! Jeg er Servida AI-assistenten. "
            f"Vi leverer over 125 faste håndverkertjenester til garantert fastpris i hele Oslo, Akershus, Bergen og Trondheim.\n\n"
            f"Basert på det du spør om, kan vi hjelpe deg med profesjonell utførelse, inkludert 2 års garanti og oppmøte til avtalt tid. "
            f"Sjekk gjerne de foreslåtte tjenestene under for å se nøyaktig hva som er inkludert og bestille direkte!"
        )
        return {
            "reply": fallback_text,
            "recommended_services": matched_services,
            "has_api_key": False
        }

    catalog_context = get_catalog_summary()
    system_instruction = f"""
Du er Servida AI — den vennlige, kunnskapsrike og profesjonelle kundeservice- og rådgivningsassistenten for Servida (Norges ledende plattform for håndverkertjenester med fastpris).

NØKKELINFORMASJON OM SERVIDA:
- Servida tilbyr over 125 håndverkertjenester til 100% garanterte fastpriser (ingen ubehagelige overraskelser).
- Alle oppdrag inkluderer 2 års garanti, fagmessig utførelse, nødvendig standard materiell og opprydding.
- Betaling skjer trygt etter at jobben er godkjent (Vipps, Kort eller Faktura med 14 dager forfall).
- Kunder kan velge ønsket dato og tidsvindu (08:00-12:00, 12:00-16:00, 16:00-20:00).
- Kategoriene dekker: Dører, Vinduer & Lås, Kjøkken & VVS, Montering & Interiør, Garasje, Gulv, Maling, Hage, Høytrykksvask, Bil & Kjøretøy, og Ventilasjon.

RETNINGSLINJER FOR SVAR:
1. Svar alltid på flytende, hyggelig og profesjonell norsk.
2. Vær hjelpsom, gi praktiske råd og estimer hva kunden trenger.
3. Hvis kunden beskriver et problem eller prosjekt, forklar hvilken tjeneste som passer best og hva som typisk inngår.
4. Hold svarene strukturerte med korte avsnitt eller kulepunkter.
5. Avslutt gjerne med et vennlig forslag om å se detaljer eller booke oppmøte.

UTDRAG AV TJENESTER:
{catalog_context}
"""

    prompt = f"Kunde: {message}"
    if history:
        history_text = "\n".join([f"{h.get('role', 'user')}: {h.get('text', '')}" for h in history[-4:]])
        prompt = f"Tidligere dialog:\n{history_text}\n\nKunde nå: {message}"

    try:
        reply_text = call_gemini_api(prompt, system_instruction=system_instruction, json_mode=False)
        return {
            "reply": reply_text.strip(),
            "recommended_services": matched_services,
            "has_api_key": True
        }
    except Exception as e:
        return {
            "reply": f"Hei! Jeg mottok spørsmålet ditt: «{message}». Vi har autoriserte fagfolk klare. Sjekk våre fastpristilbud under!",
            "recommended_services": matched_services,
            "error": str(e),
            "has_api_key": False
        }

# ==========================================================================
# 2. ADMIN AI PRODUCT SPEC & DESCRIPTION GENERATOR
# ==========================================================================

def generate_service_with_gemini(prompt: str, category: Optional[str] = None, rough_price: Optional[float] = None) -> Dict[str, Any]:
    """Generates complete structured Norwegian service catalog item using Gemini."""
    api_key = get_gemini_api_key()
    
    slug_suggestion = re.sub(r'[^a-z0-9]+', '-', prompt.lower().strip()).strip('-')
    
    system_instruction = """
Du er en ekspert på produktledelse og e-handel for håndverkertjenester i Norge.
Din oppgave er å generere en komplett, profesjonell og selgende tjenesteoppføring i JSON-format basert på brukerens instruksjoner.

JSON-STRUKTUREN MÅ FØLGE DETTE FORMATET NØYAKTIG:
{
  "title": "Kort og presis tittel på tjenesten (f.eks: Montering av Easee Elbillader)",
  "handle": "url-vennlig-slug (f.eks: montering-easee-elbillader)",
  "category": "Velg mest passende av: Dører, Vinduer & Lås | Kjøkken, Bad & VVS | Montering & Interiør | Garasje & Solskjerming | Gulv & Trapp | Maling & Vegg | Hage, Utemiljø & Snø | Høytrykksvask & Rengjøring | Maskinservice & Robotklipper | Bil & Kjøretøy | Ventilasjon & Inneklima | Handyman & Rådgivning",
  "short_description": "Selgende ingress på 2-3 setninger som fremhever fastpris og trygghet.",
  "description": "Utfyllende og profesjonell beskrivelse (2 avsnitt) som forklarer hvordan oppdraget utføres, sikkerhetskrav og standarder.",
  "price_from": 1890.0,
  "estimated_hours": "1–3 timer",
  "warranty": "2 års garanti på utført arbeid",
  "terms": "Kunden sørger for fri adkomst og at nødvendig underlag/strøm er tilgjengelig.",
  "included": [
    "Fagmessig montering og tilkobling",
    "Nødvendig standard festemateriell",
    "Funksjonstest og brukerveiledning",
    "Grovrengjøring av arbeidsområdet",
    "Dokumentasjon i Boligmappa / FDV"
  ],
  "variants": [
    { "name": "Standard montering", "price": 1890.0, "sku": "STD-01" },
    { "name": "Montering inkl. demontering av gammel enhet", "price": 2490.0, "sku": "STD-02" },
    { "name": "Komplett pakke m/ premium materiell", "price": 2990.0, "sku": "STD-03" }
  ],
  "image_prompt": "A clean, bright photorealistic picture showing a professional Norwegian craftsman installing or working on this specific item in a modern Nordic home. Ultra realistic 4k photography, natural soft daylight, cinematic framing."
}
"""

    user_query = f"Opprett en ny håndverkertjeneste for: {prompt}."
    if category:
        user_query += f" Kategori: {category}."
    if rough_price and rough_price > 0:
        user_query += f" Omtrentlig veiledende fastpris: {rough_price} NOK."

    if not api_key:
        fallback_cat = category or "Montering & Interiør"
        base_p = float(rough_price or 1490.0)
        return {
            "title": prompt.strip().title(),
            "handle": slug_suggestion or "ny-handverkertjeneste",
            "category": fallback_cat,
            "short_description": f"Trenger du hjelp med {prompt.lower()}? Servida utfører oppdraget trygt, effektivt og til garantert fastpris med 2 års garanti.",
            "description": f"Våre sertifiserte håndverkere sørger for at {prompt.lower()} blir utført etter gjeldende norske standarder og byggeforskrifter. Vi stiller med nødvendig verktøy og festemateriell for et perfekt resultat.",
            "price_from": base_p,
            "estimated_hours": "1–3 timer",
            "warranty": "2 års garanti på utført arbeid",
            "terms": "Kunden sørger for at arbeidsområdet er ryddet og tilgjengelig.",
            "included": [
                "Fagmessig utførelse av faglært håndverker",
                "Nødvendig standard festemateriell",
                "Funksjonstest og kvalitetskontroll",
                "Grovrengjøring og rydding"
            ],
            "variants": [
                { "name": "Standard utførelse", "price": base_p, "sku": "VAR-1" },
                { "name": "Inkl. bortkjøring av avfall", "price": base_p + 690.0, "sku": "VAR-2" }
            ],
            "image_prompt": f"Professional realistic photograph of a friendly Norwegian craftsman working on {prompt} in a stylish bright Scandinavian home, 4k sharp details.",
            "notice": "Generert med smart mal (legg til Gemini API-nøkkel i innstillinger for direkte AI-generering)."
        }

    try:
        raw_json_str = call_gemini_api(user_query, system_instruction=system_instruction, json_mode=True)
        parsed = json.loads(raw_json_str)
        if not parsed.get("handle"):
            parsed["handle"] = slug_suggestion
        return parsed
    except Exception as e:
        return {
            "title": prompt.strip().title(),
            "handle": slug_suggestion or "ny-tjeneste",
            "category": category or "Montering & Interiør",
            "short_description": f"Profesjonell utførelse av {prompt.lower()} til fastpris.",
            "description": f"Servida sørger for at {prompt.lower()} blir fagmessig utført med garanti.",
            "price_from": float(rough_price or 1490.0),
            "estimated_hours": "1–3 timer",
            "warranty": "2 års garanti på utført arbeid",
            "terms": "Standard Servida vilkår.",
            "included": ["Fagmessig montering", "Standard festemateriell", "Test og kontroll"],
            "variants": [{ "name": "Standard", "price": float(rough_price or 1490.0), "sku": "VAR-1" }],
            "image_prompt": f"Realistic photo of a Scandinavian craftsman installing {prompt}.",
            "error": str(e)
        }

# ==========================================================================
# 3. AI IMAGE GENERATOR FOR NEW PRODUCTS
# ==========================================================================

def generate_service_image(prompt: str, handle: str) -> Dict[str, Any]:
    """Generates a high-quality product image using AI and saves it locally."""
    clean_handle = re.sub(r'[^a-z0-9_-]', '', handle.lower()) or "generated-service"
    filename = f"{clean_handle}.jpg"
    target_path = os.path.join(PRODUCTS_IMG_DIR, filename)

    encoded_prompt = urllib.parse.quote(f"{prompt}, high quality photorealistic commercial photo, modern Scandinavian interior, bright daylight, 8k resolution, professional photography, no watermark, no text")
    image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=800&height=800&nologo=true&seed={abs(hash(clean_handle)) % 99999}"

    try:
        req = urllib.request.Request(
            image_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            image_bytes = resp.read()
            with open(target_path, "wb") as f:
                f.write(image_bytes)
            
        rel_url = f"/static/images/products/{filename}"
        return {
            "success": True,
            "image_url": rel_url,
            "local_path": target_path
        }
    except Exception as e:
        rel_url = f"/static/images/products/{filename}"
        return {
            "success": False,
            "image_url": rel_url,
            "error": str(e)
        }

# ==========================================================================
# 4. SAVE NEW SERVICE TO CATALOG
# ==========================================================================

def save_new_service_to_catalog(service_data: Dict[str, Any]) -> Dict[str, Any]:
    """Appends a newly generated service to catalog.json and persists it."""
    if not os.path.exists(CATALOG_PATH):
        raise FileNotFoundError("catalog.json ble ikke funnet")

    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    services: List[Dict[str, Any]] = catalog.get("services", [])
    handle = service_data.get("handle") or re.sub(r'[^a-z0-9]+', '-', service_data.get("title", "ny-tjeneste").lower()).strip('-')

    existing_idx = next((i for i, s in enumerate(services) if s.get("handle") == handle), None)
    
    new_entry = {
        "id": handle,
        "handle": handle,
        "title": service_data.get("title", "Ny Tjeneste"),
        "category": service_data.get("category", "Montering & Interiør"),
        "description": service_data.get("description", ""),
        "short_description": service_data.get("short_description", ""),
        "price_from": float(service_data.get("price_from", 1490.0)),
        "included": service_data.get("included", ["Fagmessig montering", "Standard festemateriell"]),
        "warranty": service_data.get("warranty", "2 års garanti på utført arbeid"),
        "terms": service_data.get("terms", "Kunden sørger for fri adkomst."),
        "variants": service_data.get("variants", [{"name": "Standard", "price": float(service_data.get("price_from", 1490.0)), "sku": ""}]),
        "images": [service_data.get("image_url", f"/static/images/products/{handle}.jpg")],
        "image_url": service_data.get("image_url", f"/static/images/products/{handle}.jpg"),
        "estimated_hours": service_data.get("estimated_hours", "1–3 timer"),
        "popularity": int(service_data.get("popularity", 80))
    }

    if existing_idx is not None:
        services[existing_idx] = new_entry
    else:
        services.insert(0, new_entry)

    catalog["services"] = services

    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    return {
        "success": True,
        "service": new_entry,
        "total_services": len(services)
    }

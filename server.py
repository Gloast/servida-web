import os
import sys
import uvicorn

# Add current directory to python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)
sys.path.insert(0, os.path.join(current_dir, "backend"))

from backend.main import app

if __name__ == "__main__":
    print("=======================================================")
    print("  SERVIDA WEBNETTSIDE & HÅNDVERKERPORTAL STARTER")
    print("=======================================================")
    print("  - Nettbutikk:       http://localhost:8000")
    print("  - Håndverkerportal: http://localhost:8000/admin")
    print("  - API Docs:         http://localhost:8000/docs")
    print("=======================================================\n")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")

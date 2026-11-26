# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "requests>=2.34.2",
#     "python-dotenv>=1.0.0",
# ]
# ///

"""
Mock-base-url attendance smoke test — interactive.

Pauses between each step so you can inspect the mock server before continuing.
Press Enter at each `inout()` prompt to move to the next step.

Flow (mirrors the browser JS in staffclockin/app.js):

  1. POST /attendance/api/attendance/security-challenge   -> {challenge_id, challenge_token}
     (saved to security_challenge.json)
  2. POST /attendance/upload_selfie  (multipart PNG)       -> {ok, selfie_url}
  3. POST /attendance/check_in_out  (JSON)                 -> submits everything

Set BASE_URL (default http://localhost:5000), STAFF_ID and SELFIE_PATH via .env
or environment variables before running.
"""

from generate_geo_samples import build_geo_samples
import requests
import json
import os
import time
import random
import string
from dotenv import load_dotenv

load_dotenv()


def inout(prompt="Press Enter to continue..."):
    """Pause and wait for the user to press Enter."""
    try:
        input(prompt)
    except EOFError:
        print()
    except KeyboardInterrupt:
        print("\n⏹  interrupted by user")
        raise SystemExit(0)


# ---- mock base URL (override with BASE_URL env var) ----
BASE = os.getenv("BASE_URL", "http://localhost:5000")

s = requests.Session()
s.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
})

# ---- config ----
staff_id = os.getenv("STAFF_ID", "NH-1224")
action = os.getenv("ACTION", "OUT")
device_id = os.getenv(
    "DEVICE_ID",
    f"NH-{int(time.time()*1000)}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}",
)
print(f"device_id: {device_id}")

params = {
    "lat": 6.597806,
    "lng": 3.339668,
    "accuracy": 150,
    "count": 4,
    "interval_ms": 655,
    "speed_mps": 1.5,
    "heading_deg": 0,
}

# Build geo evidence (same helper used by test_request.py)
sample = build_geo_samples(
    start_lat=params["lat"],
    start_lng=params["lng"],
    accuracy=params["accuracy"],
    count=params["count"],
    interval_ms=params["interval_ms"],
    speed_mps=params["speed_mps"],
    heading_deg=params["heading_deg"],
)

lat = sample[-1]["lat"]
lng = sample[-1]["lng"]
client_ts = int(time.time() * 1000)
geo_samples = json.dumps(sample)

print(f"BASE        : {BASE}")
print(f"action      : {action}")
print(f"device_id   : {device_id}")
print(f"lat/lng     : {lat}/{lng}")
print(f"geo_samples : {len(sample)} samples")
inout("⏎  Press Enter to start Step 1 (security challenge)...")

# ============================================================
# Step 1 — security challenge (save the content)
# ============================================================
challenge_url = f"{BASE}/attendance/api/attendance/security-challenge"
r = s.post(
    challenge_url,
    json={"action": action, "device_id": device_id},
    timeout=30,
)
print(f"security-challenge status: {r.status_code}")
print(f"security-challenge body: {r.text[:600]}")
r.raise_for_status()

challenge_data = r.json()
challenge_id = challenge_data["challenge_id"]
challenge_token = challenge_data["challenge_token"]

# Persist the challenge payload for reuse / inspection
with open("security_challenge.json", "w", encoding="utf-8") as f:
    json.dump(challenge_data, f, indent=2)
print("✅ security challenge saved to security_challenge.json")
print(f"   challenge_id   : {challenge_id}")
print(f"   challenge_token: {challenge_token[:40]}…")
inout("⏎  Press Enter to continue to Step 2 (upload selfie)...")

# ============================================================
# Step 2 — import a PNG and post it to upload_selfie (multipart)
# ============================================================
selfie_path = os.getenv("SELFIE_PATH", "selfie.png")
if not os.path.exists(selfie_path):
    raise SystemExit(f"❌ selfie PNG not found at {selfie_path} (set SELFIE_PATH)")

with open(selfie_path, "rb") as f:
    files = {"selfie": ("selfie.png", f, "image/png")}
    r2 = s.post(f"{BASE}/attendance/upload_selfie", files=files, timeout=30)

print(f"upload_selfie status: {r2.status_code}")
print(f"upload_selfie body: {r2.text[:600]}")
r2.raise_for_status()

selfie_data = r2.json()
selfie_url = selfie_data.get("selfie_url") or selfie_data.get("url") or selfie_data.get("selfie")
print(f"✅ selfie uploaded: {selfie_url}")
inout("⏎  Press Enter to continue to Step 3 (check_in_out)...")

# ============================================================
# Step 3 — post everything to check_in_out (JSON)
# ============================================================
payload = {
    "action": action,
    "device_id": device_id,
    "lat": lat,
    "lng": lng,
    "accuracy": params["accuracy"],
    "client_ts": client_ts,
    "geo_samples": geo_samples,
    "selfie_url": selfie_url,
    "security_challenge_id": challenge_id,
    "security_challenge_token": challenge_token,
}

print(f"payload: {json.dumps(payload, indent=2)}")
r3 = s.post(f"{BASE}/attendance/check_in_out", json=payload, timeout=60)
print(f"check_in_out status: {r3.status_code}")
print(f"check_in_out body: {r3.text[:1500]}")

if r3.ok:
    print("✅ check_in_out submitted successfully")
else:
    print("❌ check_in_out failed")
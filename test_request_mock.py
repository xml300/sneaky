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
  2. POST /attendance/api/liveness_verify  (JSON)          -> {ok, ...}
     (saved to liveness_verify.json)
  3. POST /attendance/upload_selfie  (multipart PNG)       -> {ok, selfie_url}
  4. POST /attendance/check_in_out  (JSON)                 -> submits everything

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
import base64
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


# Liveness challenge strings (mirrors staffclockin/app.js lines ~1582-1589)
LIVENESS_CHALLENGES = [
    "Face the camera, turn your head slightly to the left, then face front again",
    "Face the camera, turn your head slightly to the right, then face front again",
]

# Pick one deterministically (no random camera needed for a scripted test)
liveness_challenge = LIVENESS_CHALLENGES[0]

# Encode the selfie PNG as data URLs for the three liveness frames
# (front / turn / final). In a real browser these come from the camera;
# here we reuse the same PNG for all three frames.
def _png_to_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:image/png;base64,{b64}"


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
inout("⏎  Press Enter to continue to Step 2 (liveness verify)...")

# ============================================================
# Step 2 — liveness verify (JSON)
# ============================================================
# Mirror app.js: front_frame / turn_frame / final_frame are data URLs.
# For a scripted test we reuse the same selfie PNG for all three frames.
liveness_payload = {
    "challenge": liveness_challenge,
    "front_frame": _png_to_data_url(selfie_path),
    "turn_frame": _png_to_data_url(selfie_path),
    "final_frame": _png_to_data_url(selfie_path),
}

r2 = s.post(
    f"{BASE}/attendance/api/liveness_verify",
    json=liveness_payload,
    timeout=30,
)
print(f"liveness_verify status: {r2.status_code}")
print(f"liveness_verify body: {r2.text[:600]}")
r2.raise_for_status()

liveness_data = r2.json()

# Persist the liveness response for reuse / inspection
with open("liveness_verify.json", "w", encoding="utf-8") as f:
    json.dump(liveness_data, f, indent=2)
print("✅ liveness verify saved to liveness_verify.json")
print(f"   liveness_challenge : {liveness_challenge}")
print(f"   liveness_completed : {liveness_data.get('ok', False)}")
# Reasonable defaults mirroring app.js initial liveness state
liveness_completed = bool(liveness_data.get("ok", False))
liveness_status = "COMPLETED" if liveness_completed else "PENDING"
liveness_backend_status = "PASSED" if liveness_completed else "PENDING"
liveness_movement_score = 1.0 if liveness_completed else 0.0
inout("⏎  Press Enter to continue to Step 3 (upload selfie)...")

# ============================================================
# Step 3 — import a PNG and post it to upload_selfie (multipart)
# ============================================================
selfie_path = os.getenv("SELFIE_PATH", "selfie.png")
if not os.path.exists(selfie_path):
    raise SystemExit(f"❌ selfie PNG not found at {selfie_path} (set SELFIE_PATH)")

# app.js uploads with field name "file" (not "selfie")
with open(selfie_path, "rb") as f:
    files = {"file": ("selfie.png", f, "image/png")}
    r3 = s.post(f"{BASE}/attendance/upload_selfie", files=files, timeout=30)

print(f"upload_selfie status: {r3.status_code}")
print(f"upload_selfie body: {r3.text[:600]}")
r3.raise_for_status()

selfie_data = r3.json()
selfie_url = selfie_data.get("selfie_url") or selfie_data.get("url") or selfie_data.get("selfie")
print(f"✅ selfie uploaded: {selfie_url}")
inout("⏎  Press Enter to continue to Step 4 (check_in_out)...")

# ============================================================
# Step 4 — post everything to check_in_out (JSON)
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
    # Liveness fields (mirrors staffclockin/app.js lines ~2210-2242)
    "liveness_challenge": liveness_challenge,
    "liveness_completed": liveness_completed,
    "liveness_status": liveness_status,
    "liveness_backend_status": liveness_backend_status,
    "liveness_movement_score": liveness_movement_score,
    # Security challenge
    "security_challenge_id": challenge_id,
    "security_challenge_token": challenge_token,
}

print(f"payload: {json.dumps(payload, indent=2)}")
r4 = s.post(f"{BASE}/attendance/check_in_out", json=payload, timeout=60)
print(f"check_in_out status: {r4.status_code}")
print(f"check_in_out body: {r4.text[:1500]}")

if r4.ok:
    print("✅ check_in_out submitted successfully")
else:
    print("❌ check_in_out failed")
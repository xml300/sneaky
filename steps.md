# Testing the 3 layers + security challenge from Python

You've got the dashboard and attendance page loaded — now let's map what the browser actually does, then test each piece in isolation so a failure tells you *which* layer broke.

## The flow (in order, from the JS)

```
1. Device:     localStorage "nh_attendance_device_id" → device_id string
2. Location:   4 GPS samples over ≥1500 ms (650 ms apart)
                  POST /attendance/set_location          (optional UI)
                  POST /attendance/geo_status            (geofence check)
3. Liveness:   POST /attendance/api/liveness_verify       (AI / frame diff)
                  body: {challenge, front_frame, turn_frame, final_frame}
4. Selfie:     POST /attendance/upload_selfie             (multipart)
                  returns {ok, selfie_url}
5. Challenge:  POST /attendance/api/attendance/security-challenge
                  body: {action, device_id}
                  returns {challenge_id, challenge_token}
6. Submit:     POST /attendance/check_in_out              (JSON)
                  body: {action, device_id, lat, lng, accuracy, client_ts,
                         geo_samples, selfie_url,
                         security_challenge_id, security_challenge_token}
```

`OFFLINE_ATTENDANCE_ENABLED = false` — the offline path is dead. All tests must go over the wire.

---

## Test 0 — confirm the session is authenticated

Before anything, prove you're logged in against a JSON endpoint:

```python
r = s.get(f"{BASE}/staff/api/leave/context")
print(r.status_code, r.url)          # should be 200, url = /staff/api/leave/context
```

If `r.url` contains `/auth/login`, your session expired. Re-login first.

---

## Test 1 — device token + security challenge (safe, no side-effects)

`/security-challenge` just *issues* a token. Nothing is marked yet. Run this first.

```python
import time, random, string

device_id = f"NH-{int(time.time()*1000)}-{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}"
print("device_id:", device_id)

r = s.post(
    f"{BASE}/attendance/api/attendance/security-challenge",
    json={"action": "OUT", "device_id": device_id},
    timeout=30,
)
print("status:", r.status_code)
print("body  :", r.text[:600])

if r.ok:
    j = r.json()
    challenge_id    = j["challenge_id"]
    challenge_token = j["challenge_token"]
    print("✅ challenge issued")
    print("   id   :", challenge_id)
    print("   token:", challenge_token[:40] + "…")
```

**What to look for**

| Result | Meaning |
|---|---|
| `200 {ok:true, challenge_id, challenge_token}` | ✅ Device registered, challenge issued |
| `400 "device_id required"` / `"invalid"` | Your `device_id` shape is wrong |
| `400 "action required"` | Send `"IN"` or `"OUT"` |
| `401` / redirect | Session lost — re-login |
| `429` | Rate-limited — wait 30 s |

**Anti-replay sanity checks worth running**

```python
# Reuse the same challenge_id+token for a *second* call — should be rejected
r2 = s.post(f"{BASE}/attendance/api/attendance/security-challenge",
            json={"action": "OUT", "device_id": device_id})
print("second call:", r2.status_code, r2.json())
```

```python
# Tamper with the token — check_in_out with a forged token should fail
bad_payload = {..., "security_challenge_token": challenge_token[:-4] + "XXXX"}
# (do this in Test 4 below — don't waste your good challenge)
```

---

## Test 2 — liveness verify

Two things to know first:

1. The `challenge` string **must match** one of the browser's two strings exactly:
   ```python
   CHALLENGES = [
     "Face the camera, turn your head slightly to the left, then face front again",
     "Face the camera, turn your head slightly to the right, then face front again",
   ]
   ```
2. The JS comment says: **"Backend liveness is currently optional because AI model download is disabled on Render"**. So the endpoint may just return OK without real analysis. That's *itself* a finding.

```python
import base64
from pathlib import Path

def img_to_data_url(path):
    raw = Path(path).read_bytes()
    ext = Path(path).suffix.lower().lstrip(".")
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    return f"data:image/{mime};base64," + base64.b64encode(raw).decode()

front = img_to_data_url("front.jpg")
turn  = img_to_data_url("turn.jpg")
final = img_to_data_url("front.jpg")   # final = same face, front

r = s.post(
    f"{BASE}/attendance/api/liveness_verify",
    json={
        "challenge": CHALLENGES[0],
        "front_frame": front,
        "turn_frame":  turn,
        "final_frame": final,
    },
    timeout=60,
)
print("status:", r.status_code)
print("body  :", r.text[:1000])
```

**Interesting variations to test**

```python
# a) All three frames identical → does backend catch it?
same = img_to_data_url("front.jpg")
s.post(f"{BASE}/attendance/api/liveness_verify",
       json={"challenge": CHALLENGES[0],
             "front_frame": same, "turn_frame": same, "final_frame": same})

# b) Empty frames → should 400
s.post(f"{BASE}/attendance/api/liveness_verify",
       json={"challenge": CHALLENGES[0],
             "front_frame": "", "turn_frame": "", "final_frame": ""})

# c) Wrong challenge text → should 400
s.post(f"{BASE}/attendance/api/liveness_verify",
       json={"challenge": "blink twice",
             "front_frame": front, "turn_frame": turn, "final_frame": final})

# d) No frames at all
s.post(f"{BASE}/attendance/api/liveness_verify", json={"challenge": CHALLENGES[0]})
```

Expected responses give you `liveness_status` (`BACKEND_LIVENESS_OK`, `BACKEND_LIVENESS_SKIPPED`) and `turn_delta` (a number). If (a) returns the same positive result as a real turn, **the backend liveness is fake** — it just echoes OK. If it 400s with something like `"turn_delta too small"`, it's real.

---

## Test 3 — selfie upload

Needs a real JPEG with a visible face. Same file works.

```python
with open("selfie.jpg", "rb") as f:
    r = s.post(
        f"{BASE}/attendance/upload_selfie",
        files={"file": ("selfie.jpg", f, "image/jpeg")},
        timeout=60,
    )
print("status:", r.status_code)
print("body  :", r.text[:600])

selfie_url = r.json().get("selfie_url") if r.ok else None
print("selfie_url:", selfie_url)
```

**Things to probe**

| Test | What to look for |
|---|---|
| **Blank / all-black JPEG** | Server should reject with `"SELFIE_FACE_REQUIRED"` or similar |
| **No file at all** (`files={}`) | Should 400 |
| **Non-image payload** (`.txt` renamed) | Should 400 |
| **Huge image (5 MB)** | Should either reject or downsample |
| **Upload same file twice** | Note whether `selfie_url` differs — if identical, that's a replay vector |

```python
# Blank 1×1 white JPEG (make one with PIL or grab any tiny jpg)
with open("blank.jpg", "rb") as f:
    r = s.post(f"{BASE}/attendance/upload_selfie",
               files={"file": ("blank.jpg", f, "image/jpeg")})
print("blank status:", r.status_code, r.text[:300])

# No file
r = s.post(f"{BASE}/attendance/upload_selfie", files={})
print("empty  status:", r.status_code, r.text[:300])
```

---

## Test 4 — full `check_in_out` (⚠️ actually marks attendance)

Only run this when you're fine with changing today's status. Since `CONTEXT.nextAction === "OUT"` in your page, this will check you **out**.

```python
import json, time

now_ms = int(time.time() * 1000)
lat, lng, acc = 6.597806, 3.339668, 150       # your test coords

geo_samples = [{
    "lat": lat, "lng": lng, "accuracy": acc,
    "captured_at": now_ms - (3 - i) * 650,
    "provider_ts": now_ms - (3 - i) * 650,
    "speed": 1.5, "heading": 0, "altitude": None,
} for i in range(4)]

payload = {
    "action": "OUT",
    "device_id": device_id,
    "lat": lat, "lng": lng, "accuracy": acc,
    "client_ts": now_ms,
    "geo_samples": geo_samples,
    "selfie_url": selfie_url,
    "security_challenge_id": challenge_id,
    "security_challenge_token": challenge_token,
}

r = s.post(f"{BASE}/attendance/check_in_out", json=payload, timeout=60)
print("status:", r.status_code)
print("body  :", r.text[:1500])
```

**Negative tests worth running before the real one** (make a *fresh* challenge each time):

```python
def fresh_challenge(action="OUT", dev=device_id):
    j = s.post(f"{BASE}/attendance/api/attendance/security-challenge",
               json={"action": action, "device_id": dev}).json()
    return j["challenge_id"], j["challenge_token"]

def try_submit(**overrides):
    cid, tok = fresh_challenge()
    p = {**payload,
         "security_challenge_id": cid,
         "security_challenge_token": tok}
    p.update(overrides)
    r = s.post(f"{BASE}/attendance/check_in_out", json=p, timeout=60)
    print(overrides, "→", r.status_code, r.text[:300])

try_submit(security_challenge_token="forged_token_XXXX")   # should 403/400
try_submit(security_challenge_id="not-a-real-id")          # should 400
try_submit(device_id="NH-WRONGDEVICE")                     # should mismatch
try_submit(geo_samples=[])                                 # should reject no evidence
try_submit(geo_samples=geo_samples[:1])                    # < 4 samples, should reject
try_submit(selfie_url="https://evil.example/fake.jpg")     # forged selfie_url
try_submit(accuracy=5000)                                  # accuracy too weak
```

Each negative test tells you whether the server *really* enforces that check or just trusts the client. **This is the whole point of the exercise** — a system where `security_challenge_id` is passed but never validated against the token is a red flag.

---

## The three CSRF/header gotchas

1. **These endpoints are JSON POSTs** with `Content-Type: application/json` and **no CSRF token** in the browser JS. They're almost certainly `@csrf.exempt`. If you get `400 "CSRF"` from any of them, grep the attendance HTML for `<meta name="csrf-token"` — if present, add `headers={"X-CSRFToken": ...}`.
2. **Multipart for `/upload_selfie`** — that one *might* be CSRF-protected since it's a form-style POST. If it 400s, scrape a CSRF token from the attendance page:
   ```python
   r = s.get(f"{BASE}/attendance/staff")
   import re
   m = re.search(r'name=["\']csrf_token["\'][^>]*value=["\']([^"\']+)["\']', r.text)
   # then add X-CSRFToken header (Flask-WTF accepts both header and form field)
   ```
3. **Keep the same `device_id` across tests** — the backend may bind the security challenge to the device_id that requested it. Generate once, reuse everywhere in a single test run.

---

## What you'll have learned at the end

For each of your three target layers:

| Layer | Green flag | Red flag |
|---|---|---|
| **Device token** | Unknown `device_id` in `check_in_out` → 4xx; reused across users → 4xx | Any random string accepted |
| **Liveness** | Identical frames → rejected, `turn_delta` low → rejected | OK returned for identical frames, `turn_delta` always same |
| **Challenge token** | Tampered/expired/reused token → 4xx | Any string accepted, or `challenge_id` never checked |

The negative tests are the actual audit. Happy path passing tells you nothing. **Mismatched token, forged token, blank liveness, no samples, wrong device** — each one should fail, and when you see it fail, you know the layer is real.
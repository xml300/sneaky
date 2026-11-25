# /// script
# requires-python = ">=3.14"
# dependencies = [
#     "requests>=2.34.2",
# ]
# ///


from generate_geo_samples import build_geo_samples
import requests
import json
import re


staff_id = "NH-1224"
password = "vuM49jeCGz8KBpA"

url = "https://thenewhorizonsapp.onrender.com"
auth_url = "/auth/login"

params = {
    "lat": 6.597806,
    "lng": 3.339668,
    "accuracy": 150,
    "count": 4,
    "interval_ms": 655,
    "speed_mps": 1.5,
    "heading_deg": 0,
}

BASE = url
s = requests.Session()

s.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
})

# 1) GET the login page with the session (this sets the session cookie)
r1 = s.get(f"{BASE}/auth/login")
print(r1.status_code, len(r1.text))

# 2) Extract the CURRENT csrf_token from the rendered form
m = re.search(r'name="csrf_token"\s+value="([^"]+)"', r1.text)
assert m, "csrf_token not found — did the page render differently?"
csrf = m.group(1)
print("csrf:", csrf)

sample = build_geo_samples(
    start_lat=params["lat"],
    start_lng=params["lng"],
    accuracy=params["accuracy"],
    count=params["count"],
    interval_ms=params["interval_ms"],
    speed_mps=params["speed_mps"],
    heading_deg=params["heading_deg"],
)

lat =  sample[-1]["lat"]
long = sample[-1]["lng"]
body = {
    "csrf_token": csrf,
    "staff_id": staff_id,
    "password": password, 
    "latitude": lat,
    "longitude": long,
    "geo_accuracy": params["accuracy"],
    "geo_samples": json.dumps(sample)
}



resp = s.post(url + auth_url, data=body)#, allow_redirects=False)

print("status  :", resp.status_code)
# print("location:", resp.headers.get("Location"))
# print("csrf err:", "Security check failed" in resp.text)
# print("len body:", len(resp.text))
# print(resp.text)
with open("dump.html", "w", encoding="utf-8") as f:
    f.write(resp.text)

# resp = s.post(url+auth_url, data=body)
# print(resp.text)

# resp = requests.post(url+auth_url, data=body, cookies=cookies)
# # print(resp.text)

# # print(resp.status_code)


# resp = requests.post(url, data=body, cookies=cookies, allow_redirects=False)

# print("status  :", resp.status_code)
# print("location:", resp.headers.get("Location"))
# # print("flash?  :", "Security check failed" in resp.text)


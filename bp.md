The flow (in order, from the JS)
```text
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
OFFLINE_ATTENDANCE_ENABLED = false — the offline path is dead. All tests must go over the wire
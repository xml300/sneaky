const DEV_IDS = [
  "charles_admin",
  "charles_admin_admin",
  "charles_admin_hr",
  "charles_admin_staff"
];

const geoStatus = document.getElementById('geo-status');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const accuracyInput = document.getElementById('geo_accuracy');
const geoSamplesInput = document.getElementById('geo_samples');
const staffInput = document.getElementById('staff_id');
const devNote = document.getElementById('dev-note');
const form = document.getElementById('login-form');
const btnGeo = document.getElementById('btn-request-geo');

let lastGeoOk = false;
let geoWatchId = null;

// LOGIN_GPS_MULTISAMPLE_ANTI_SPOOF_V1
// Browser GPS cannot prove Android mock-location state.
// This layer therefore collects several fresh observations and sends
// the evidence to Flask for server-side consistency/risk analysis.
const LOGIN_GEO_REQUIRED_SAMPLES = 4;
const LOGIN_GEO_MAX_SAMPLES = 12;
const LOGIN_GEO_FRESH_WINDOW_MS = 30000;

let geoSamples = [];
let geoSubmitVerificationInProgress = false;

function freshGeoSamples() {
  const now = Date.now();

  return geoSamples.filter((sample) => {
    const ts = Number(sample && sample.captured_at);
    return Number.isFinite(ts) && Math.abs(now - ts) <= LOGIN_GEO_FRESH_WINDOW_MS;
  });
}

function syncGeoSamplesInput() {
  if (!geoSamplesInput) return;

  try {
    geoSamplesInput.value = JSON.stringify(freshGeoSamples());
  } catch (e) {
    geoSamplesInput.value = "[]";
  }
}

function resetGeoSamples() {
  geoSamples = [];
  syncGeoSamplesInput();
}

function recordGeoSample(pos) {
  if (!pos || !pos.coords) return;

  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  const acc = Number(pos.coords.accuracy);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (lat === 0 && lng === 0) return;

  const sample = {
    lat: lat,
    lng: lng,
    accuracy: Number.isFinite(acc) ? acc : null,
    captured_at: Date.now(),
    provider_ts: Number.isFinite(Number(pos.timestamp))
      ? Number(pos.timestamp)
      : null,
    speed: Number.isFinite(Number(pos.coords.speed))
      ? Number(pos.coords.speed)
      : null,
    heading: Number.isFinite(Number(pos.coords.heading))
      ? Number(pos.coords.heading)
      : null,
    altitude: Number.isFinite(Number(pos.coords.altitude))
      ? Number(pos.coords.altitude)
      : null
  };

  geoSamples.push(sample);

  if (geoSamples.length > LOGIN_GEO_MAX_SAMPLES) {
    geoSamples = geoSamples.slice(-LOGIN_GEO_MAX_SAMPLES);
  }

  syncGeoSamplesInput();
}

function loginGeoEvidenceReady() {
  const samples = freshGeoSamples();

  if (samples.length < LOGIN_GEO_REQUIRED_SAMPLES) {
    return false;
  }

  const firstTs = Number(samples[0].captured_at);
  const lastTs = Number(samples[samples.length - 1].captured_at);

  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs)) {
    return false;
  }

  return (lastTs - firstTs) >= 1500;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function captureOneFreshGeoSample(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleGeoSuccess(pos);
        resolve(pos);
      },
      (err) => reject(err),
      options
    );
  });
}

async function collectFreshLoginGeoEvidence() {
  if (!navigator.geolocation) return false;

  resetGeoSamples();

  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  for (let i = 0; i < LOGIN_GEO_REQUIRED_SAMPLES; i++) {
    try {
      await captureOneFreshGeoSample(options);
    } catch (err) {
      return false;
    }

    if (i < LOGIN_GEO_REQUIRED_SAMPLES - 1) {
      await sleepMs(650);
    }
  }

  syncGeoSamplesInput();

  return loginGeoEvidenceReady();
}

function isDevId() {
  const typedID = (staffInput.value || "").trim().toLowerCase();
  return DEV_IDS.includes(typedID);
}


function updateLoginNetworkStatus() {
  const chip = document.getElementById("login-network-chip");
  const note = document.getElementById("login-network-note");
  const online = navigator.onLine;

  if (chip) {
    chip.textContent = online ? "Online" : "Offline";
    chip.className = "network-chip " + (online ? "online" : "offline");
  }

  if (note) {
    if (online) {
      note.innerHTML =
        "<strong>Secure login notice:</strong> " +
        "Internet and location permission are required to sign in. " +
        "Staff must be within an approved branch radius before attendance access is allowed. " +
        "If connection drops after successful sign-in, attendance can be saved and synced automatically when internet returns.";
    } else {
      note.innerHTML =
        "<strong>You are offline:</strong> " +
        "Login requires internet and location verification. Please reconnect to sign in. " +
        "If connection drops after successful sign-in, attendance can be saved and synced automatically when internet returns.";
    }
  }
}

window.addEventListener("online", updateLoginNetworkStatus);
window.addEventListener("offline", updateLoginNetworkStatus);
setInterval(updateLoginNetworkStatus, 5000);

function setStatus(text, cls) {
  geoStatus.textContent = text;
  geoStatus.className = "status " + (cls || "");
}

function setGeo(lat, lon, acc) {
  latitudeInput.value = lat;
  longitudeInput.value = lon;
  accuracyInput.value = acc || "";
  lastGeoOk = true;

  if (!isDevId()) {
    setStatus("Location captured. You can now login.", "good");
    devNote.style.display = "none";
  } else {
    setStatus("Developer login allowed without location.", "warn");
    devNote.style.display = "block";
  }
}

function clearGeo(reason) {
  latitudeInput.value = "";
  longitudeInput.value = "";
  accuracyInput.value = "";
  lastGeoOk = false;

  if (isDevId()) {
    setStatus("Developer login allowed without location.", "warn");
    devNote.style.display = "block";
  } else {
    setStatus(reason || "Location access is required for regular staff login.", "bad");
    devNote.style.display = "none";
  }
}

function geoErrorMessage(err) {
  if (!err) return "Location failed. Please turn on GPS/location and try again.";

  if (err.code === 1) {
    return "Location permission was denied. Please allow location access for this site and try again.";
  }

  if (err.code === 2) {
    return "Location is currently unavailable. Turn on GPS/location, move to an open area, and try again.";
  }

  if (err.code === 3) {
    return "Location request timed out. Keep GPS/location on and click Request Location again.";
  }

  return "Location failed. Please turn on GPS/location and try again.";
}

function handleGeoSuccess(pos) {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  const acc = pos.coords.accuracy;

  if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) {
    clearGeo("Location is invalid (0,0). Turn on real GPS/location services and try again.");
    return;
  }

  recordGeoSample(pos);
  setGeo(lat, lon, acc);

  if (Number.isFinite(acc) && acc > 1000) {
    setStatus(
      "Your phone location accuracy is too weak (" + Math.round(acc) + "m). Turn on Precise Location, open Google Maps until the blue dot is accurate, then click Request Location again.",
      "bad"
    );
    return;
  }

  setStatus("Location captured. You can now login.", "good");
}

function requestGeo() {
  if (!navigator.geolocation) {
    clearGeo("This browser/device does not support GPS location.");
    return;
  }

  if (!window.isSecureContext && location.hostname !== "127.0.0.1" && location.hostname !== "localhost") {
    clearGeo("GPS may be blocked because this page is not HTTPS. Use the live HTTPS app link or localhost.");
    return;
  }

  setStatus("Requesting GPS location… keep location on and allow permission.", "warn");

  try {
    if (geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      geoWatchId = null;
    }
  } catch (e) {}

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 45000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    handleGeoSuccess,
    (err) => {
      setStatus(geoErrorMessage(err) + " Retrying GPS…", "warn");
    },
    geoOptions
  );

  // LOGIN_GPS_MULTISAMPLE_ANTI_SPOOF_V1
  // Keep watching even after the first successful fix so Flask receives
  // multiple fresh observations rather than one browser coordinate.
  try {
    geoWatchId = navigator.geolocation.watchPosition(
      handleGeoSuccess,
      (watchErr) => {
        if (!lastGeoOk) {
          clearGeo(geoErrorMessage(watchErr));
        }
      },
      geoOptions
    );
  } catch (e) {}
}

// Dev ID typed => no geo required
staffInput.addEventListener("input", () => {
  if (isDevId()) {
    devNote.style.display = "block";
    setStatus("Developer login allowed without location.", "warn");
  } else {
    devNote.style.display = "none";
    if (!lastGeoOk) setStatus("Location access is required for regular staff login.", "bad");
  }
});

btnGeo.addEventListener("click", requestGeo);

form.addEventListener("submit", async (e) => {
  updateLoginNetworkStatus();

  // Developer/self-review accounts keep their existing bypass behaviour.
  if (isDevId()) {
    return;
  }

  e.preventDefault();

  if (geoSubmitVerificationInProgress) {
    return;
  }

  if (!navigator.onLine) {
    setStatus("You are offline. Please reconnect to sign in securely.", "bad");
    return;
  }

  // LOGIN_ROLE_AWARE_SERVER_GEO_FALLBACK_V1
  //
  // IMPORTANT:
  // The browser does not know the authenticated role before the login
  // request reaches Flask.
  //
  // Therefore the browser must not permanently block the form just
  // because GPS evidence is unavailable.
  //
  // Flask remains the final authority:
  //   STAFF -> GPS/geofence/spoof checks are enforced server-side.
  //   HR/ADMIN/SUPERADMIN -> staff attendance geofence is not applied.
  //
  // This preserves staff security while preventing HR/Admin login
  // from being wrongly blocked by browser-side GPS collection.

  // LOGIN_GPS_SAMPLE_COLLECTION_FIX_V1
  // Do not submit regular login immediately just because the first
  // browser location fix has not completed yet. First attempt to collect
  // the full multi-sample GPS evidence required by Flask.
  geoSubmitVerificationInProgress = true;

  try {
    // LOGIN_GPS_MULTISAMPLE_ANTI_SPOOF_V1
    // Attempt to prepare stronger GPS evidence when available.
    if (!loginGeoEvidenceReady()) {
      setStatus(
        "Verifying your location securely… please remain on this page for a few seconds.",
        "warn"
      );

      const evidenceOk = await collectFreshLoginGeoEvidence();

      if (!evidenceOk) {
        // Do not make a role decision in JavaScript.
        // Submit to Flask and let the authenticated role determine
        // whether GPS evidence is mandatory.
        setStatus("Signing in securely…", "good");
        HTMLFormElement.prototype.submit.call(form);
        return;
      }
    }

    syncGeoSamplesInput();

    const submitAcc = parseFloat(accuracyInput.value || "0");

    if (Number.isFinite(submitAcc) && submitAcc > 1000) {
      // Weak browser GPS must not stop HR/Admin before Flask
      // has authenticated and identified the role.
      setStatus("Signing in securely…", "good");
      HTMLFormElement.prototype.submit.call(form);
      return;
    }

    if (!lastGeoOk) {
      setStatus("Signing in securely…", "good");
      HTMLFormElement.prototype.submit.call(form);
      return;
    }

    setStatus("Location verified. Signing in…", "good");

    // Submit directly after the evidence has been prepared.
    HTMLFormElement.prototype.submit.call(form);

  } catch (err) {
    // Browser GPS/JavaScript failure must not become an HR/Admin
    // authentication failure. STAFF remains protected by Flask.
    setStatus("Signing in securely…", "good");
    HTMLFormElement.prototype.submit.call(form);
  } finally {
    geoSubmitVerificationInProgress = false;
  }
});

// LOGIN_SECURITY_ALERT_VISIBILITY_V1
// Presentation only. Does not alter spoof detection or login security.
const loginSecurityAlert = document.getElementById("login-security-alert");
if (loginSecurityAlert) {
  setTimeout(() => {
    loginSecurityAlert.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }, 150);
}

// Auto request on page load (but does NOT lock the screen)
window.onload = () => {
  updateLoginNetworkStatus();
  clearGeo();
  requestGeo();
};

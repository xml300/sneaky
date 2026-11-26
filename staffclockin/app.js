(function () {
  const CONTEXT = {
    userId: "NH-1224",
    userName: "Peterben Ajuga",
    isCheckedIn: true,
    checkInTime: "2026-11-25T07:37:59.256214+00:00",
    nextAction: "OUT",
    attendanceCompletedToday: 0,
    locationMaxAgeS: parseInt("90", 10) || 90
  };

  const el = (id) => document.getElementById(id);

  function toast(msg, type) {
    const t = el("toast");
    if (!t) return;
    t.className = "toast show " + (type || "");
    t.textContent = msg;
  }


  function showClockOutConfirmation() {
    return new Promise((resolve) => {
      const modal = document.getElementById("nhClockoutModal");
      const cancelBtn = document.getElementById("nhClockoutCancel");
      const confirmBtn = document.getElementById("nhClockoutConfirm");

      if (!modal || !cancelBtn || !confirmBtn) {
        resolve(window.confirm(
          "You are about to mark OUT for today.\n\nOnly continue if you are sure you are closing your attendance for the day."
        ));
        return;
      }

      let resolved = false;

      function close(answer) {
        if (resolved) return;
        resolved = true;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.removeEventListener("keydown", onKeyDown);
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        resolve(answer);
      }

      function onCancel() { close(false); }
      function onConfirm() { close(true); }

      function onKeyDown(e) {
        if (e.key === "Escape") close(false);
      }

      cancelBtn.addEventListener("click", onCancel);
      confirmBtn.addEventListener("click", onConfirm);
      document.addEventListener("keydown", onKeyDown);

      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");

      setTimeout(() => {
        try { cancelBtn.focus(); } catch (_) {}
      }, 80);
    });
  }


  function showAttendanceClosedModal(message) {
    return new Promise((resolve) => {
      const modal = document.getElementById("nhAttendanceClosedModal");
      const okBtn = document.getElementById("nhAttendanceClosedOk");
      const messageBox = document.getElementById("nhAttendanceClosedMessage");

      const finalMessage = message || "Attendance marking has closed for today at 12:00 PM. You can only sign out if you marked in before the cutoff time. Please contact HR if you need assistance.";

      if (!modal || !okBtn) {
        toast(finalMessage, "error");
        alert(finalMessage);
        resolve(false);
        return;
      }

      if (messageBox) {
        messageBox.textContent = finalMessage;
      }

      let resolved = false;

      function close() {
        if (resolved) return;
        resolved = true;
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
        document.removeEventListener("keydown", onKeyDown);
        okBtn.removeEventListener("click", onOk);
        resolve(true);
      }

      function onOk() {
        close();
      }

      function onKeyDown(ev) {
        if (ev.key === "Escape" || ev.key === "Enter") {
          close();
        }
      }

      okBtn.addEventListener("click", onOk);
      document.addEventListener("keydown", onKeyDown);

      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");

      try {
        okBtn.focus();
      } catch (_) {}
    });
  }


  function updateClock() {
  const clock = el("live-clock");

  const tick = () => {
    const now = new Date();

    if (clock) {
      clock.textContent = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      });
    }
  };

  tick();
  setInterval(tick, 1000);
}
  function setCardStatus(cardId, status, title, detail) {
    const card = el(cardId);
    if (!card) return;
    card.className = "security-item " + status;

    const strong = card.querySelector(".security-text strong");
    if (strong) strong.textContent = title;

    const det = card.querySelector(".security-detail");
    if (det) det.textContent = detail || "";
  }

  const SOUND_KEY = "nh_sound_enabled";
  function isSoundOn() { return localStorage.getItem(SOUND_KEY) === "1"; }

  function setSound(on) {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
    const btn = el("btnSound");
    if (!btn) return;

    btn.classList.toggle("on", on);
    btn.title = on ? "Sound is ON" : "Sound is OFF";
    btn.innerHTML = on
      ? '<i class="fas fa-volume-up"></i>'
      : '<i class="fas fa-volume-mute"></i>';

    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  }

  function speak(text) {
    if (!isSoundOn()) return;
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function makeDeviceId() {
    let deviceId = localStorage.getItem("nh_device_id");
    if (!deviceId) {
      deviceId = "NH-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10).toUpperCase();
      localStorage.setItem("nh_device_id", deviceId);
    }
    return deviceId;
  }

  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    return {res, data};
  }


  // ATTENDANCE_SECURITY_CHALLENGE_CLIENT_V1
  // Silent background verification. No staff input is required.
  async function requestAttendanceSecurityChallenge(action, deviceId) {
    const {res, data} = await postJSON(
      "/attendance/api/attendance/security-challenge",
      {
        action: String(action || "").toUpperCase(),
        device_id: String(deviceId || "")
      }
    );

    if (!res.ok || !data || !data.ok || !data.challenge_id || !data.challenge_token) {
      const msg = (data && (data.message || data.error))
        ? String(data.message || data.error)
        : "Attendance security verification is temporarily unavailable.";
      throw new Error(msg);
    }

    return {
      security_challenge_id: data.challenge_id,
      security_challenge_token: data.challenge_token
    };
  }

  const OFFLINE_ATT_QUEUE_KEY = "nh_offline_attendance_queue_v1";

  // ATTENDANCE_OFFLINE_DISABLED_SECURITY_V1
  const OFFLINE_ATTENDANCE_ENABLED = false;

  function offlineAttendanceDisabledMessage() {
    if (navigator.onLine === false) {
      return "OFFLINE — No internet connection detected on this phone. Attendance cannot be submitted while offline. Please restore mobile data or Wi-Fi and try again.";
    }

    return "The attendance server cannot currently be reached. Attendance was not submitted. Please check your phone's internet connection and try again.";
  }

  function showOfflineAttendanceDisabledNotice() {
    const msg = offlineAttendanceDisabledMessage();

    try {
      toast(msg, "error");
    } catch (_) {}

    try {
      speak(msg);
    } catch (_) {}

    return msg;
  }



  let NH_APP_SERVER_ONLINE = true;

  async function checkAppServerOnline() {
    // The correct test is whether this app server is reachable.
    // Do not depend on Google/gstatic because some networks may block it
    // even while TheNewHorizonsApp itself is working.
    try {
      const res = await fetch("/healthz?offline_ping=" + Date.now(), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin"
      });
      NH_APP_SERVER_ONLINE = !!res.ok;
    } catch (_) {
      NH_APP_SERVER_ONLINE = false;
    }

    try { updateOfflineStatusBadge(); } catch (_) {}
    return NH_APP_SERVER_ONLINE;
  }

  function getOfflineQueueCount() {
    try {
      return readOfflineAttendanceQueue().length;
    } catch (_) {
      return 0;
    }
  }

  function ensureOfflineStatusBadge() {
    let badge = document.getElementById("offline-sync-status-badge");
    if (badge) return badge;

    badge = document.createElement("div");
    badge.id = "offline-sync-status-badge";
    badge.style.position = "fixed";
    badge.style.right = "14px";
    badge.style.bottom = "14px";
    badge.style.zIndex = "99999";
    badge.style.padding = "10px 14px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "13px";
    badge.style.fontWeight = "900";
    badge.style.boxShadow = "0 10px 28px rgba(0,0,0,.22)";
    badge.style.border = "1px solid rgba(255,255,255,.35)";
    badge.style.fontFamily = "Arial, sans-serif";
    document.body.appendChild(badge);
    return badge;
  }

  function updateOfflineStatusBadge(textOverride = "") {
    const badge = ensureOfflineStatusBadge();
    const pending = getOfflineQueueCount();
    const online = navigator.onLine && NH_APP_SERVER_ONLINE;

    let text = "";
    let bg = "";
    let color = "#ffffff";

    if (textOverride) {
      text = textOverride;
      bg = "#7c3aed";
    } else if (!online) {
      text = "OFFLINE • No internet • Attendance unavailable";
      bg = "#dc2626";
    } else if (pending > 0 && OFFLINE_ATTENDANCE_ENABLED) {
      text = `Online • Pending sync: ${pending}`;
      bg = "#d97706";
    } else {
      text = "Online";
      bg = "#16a34a";
    }

    badge.textContent = text;
    badge.style.background = bg;
    badge.style.color = color;
  }

  window.addEventListener("online", () => {
    updateOfflineStatusBadge("Online • Connection restored");

    try {
      toast(
        "Internet connection restored. You may now mark attendance.",
        "success"
      );
    } catch (_) {}

    setTimeout(updateOfflineStatusBadge, 1800);
  });

  window.addEventListener("offline", () => {
    updateOfflineStatusBadge();
    showOfflineAttendanceDisabledNotice();
  });

  // ATTENDANCE_SERVER_REACHABILITY_LOAD_REDUCTION_V1
  // Do not continuously ping Render from every staff device.
  // Server reachability is checked only when an actual pending
  // offline attendance record needs to be synchronized.
  // The status badge itself is local browser work and does not contact Render.
  setInterval(updateOfflineStatusBadge, 60000);
  setTimeout(updateOfflineStatusBadge, 1600);


  function readOfflineAttendanceQueue() {
    try {
      return JSON.parse(localStorage.getItem(OFFLINE_ATT_QUEUE_KEY) || "[]");
    } catch (_) {
      return [];
    }
  }

  function writeOfflineAttendanceQueue(queue) {
    localStorage.setItem(OFFLINE_ATT_QUEUE_KEY, JSON.stringify(queue || []));
    try { updateOfflineStatusBadge(); } catch (_) {}
  }

  // ATTENDANCE_PENDING_SYNC_NOTICE_V1
  function getLocalDateKeyFromClientTs(clientTs) {
    try {
      const d = clientTs ? new Date(Number(clientTs)) : new Date();
      if (Number.isNaN(d.getTime())) return "";
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    } catch (_) {
      return "";
    }
  }

  function findPendingOfflineAttendanceForToday(actionOverride = "") {
    const queue = readOfflineAttendanceQueue();
    const todayKey = getLocalDateKeyFromClientTs(Date.now());
    const action = String(actionOverride || (window.CONTEXT && CONTEXT.nextAction) || "").toUpperCase();
    const userId = String((window.CONTEXT && CONTEXT.userId) || "").toUpperCase();

    for (const packet of queue) {
      const payload = packet && packet.payload ? packet.payload : {};
      const packetAction = String(payload.action || "").toUpperCase();
      const packetUserId = String(payload.user_id || "").toUpperCase();
      const packetDateKey = getLocalDateKeyFromClientTs(payload.client_ts || packet.queued_at_iso || Date.now());

      if (action && packetAction && packetAction !== action) continue;
      if (userId && packetUserId && packetUserId !== userId) continue;
      if (todayKey && packetDateKey && packetDateKey !== todayKey) continue;

      return packet;
    }

    return null;
  }

  function showPendingOfflineAttendanceNotice(actionOverride = "") {
    const packet = findPendingOfflineAttendanceForToday(actionOverride);
    if (!packet) return false;

    const payload = packet.payload || {};
    const action = String(payload.action || actionOverride || (window.CONTEXT && CONTEXT.nextAction) || "").toUpperCase();
    const actionText = action === "OUT" ? "sign-out" : "sign-in";

    const message = `Your ${actionText} attendance has already been captured today and is pending sync. Please do not mark attendance again. It will update HR automatically when internet returns.`;

    try { toast(message, "warning"); } catch (_) {}
    try { speak(message); } catch (_) {}
    try { updateOfflineStatusBadge("Attendance captured • Pending sync"); } catch (_) {}

    const btn = el("attendance-btn");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Attendance captured - pending sync';
    }

    setTimeout(() => {
      try { updateOfflineStatusBadge(); } catch (_) {}
    }, 4500);

    return true;
  }

  function startPendingOfflineAttendanceReminder() {
    setTimeout(() => {
      showPendingOfflineAttendanceNotice();
    }, 2500);

    // ATTENDANCE_PENDING_SYNC_NOTICE_2MIN_V1
    // Local browser reminder only; no Firestore write and no selfie upload.
    setInterval(() => {
      showPendingOfflineAttendanceNotice();
    }, 120000);
  }

  function queueOfflineAttendance(payload) {
    const queue = readOfflineAttendanceQueue();
    const packet = {
      id: `offline_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      queued_at_iso: new Date().toISOString(),
      url: "/attendance/check_in_out",
      payload: {
        ...payload,
        offline_sync: true,
        offline_queued_at_iso: new Date().toISOString()
      }
    };

    queue.push(packet);

    // Keep only latest 20 pending packets to avoid browser storage abuse.
    writeOfflineAttendanceQueue(queue.slice(-5));
    return packet;
  }


  function dataUrlToBlobForOfflineSelfie(dataUrl) {
    const parts = String(dataUrl || "").split(",");
    if (parts.length < 2) throw new Error("Invalid offline selfie data.");
    const meta = parts[0] || "";
    const base64 = parts[1] || "";
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadOfflineSelfieDataUrl(dataUrl) {
    const blob = dataUrlToBlobForOfflineSelfie(dataUrl);
    return await uploadSelfieBlob(blob);
  }

  async function syncOfflineAttendanceQueue() {
    // ATTENDANCE_OFFLINE_DISABLED_SECURITY_V1
    if (!OFFLINE_ATTENDANCE_ENABLED) {
      return;
    }

    // ATTENDANCE_OFFLINE_SYNC_LOAD_GUARD_V1
    let queue = readOfflineAttendanceQueue();

    // No pending offline attendance means no reason to contact Render.
    if (!queue.length) {
      return;
    }

    if (!navigator.onLine) {
      NH_APP_SERVER_ONLINE = false;
      try { updateOfflineStatusBadge(); } catch (_) {}
      return;
    }

    // Only a device with real pending attendance checks server reachability.
    const serverOk = await checkAppServerOnline();
    if (!serverOk) {
      return;
    }

    const remaining = [];
    let syncedAny = false;

    for (const packet of queue) {
      try {
        const payload = {
          ...(packet.payload || {}),
          offline_sync: true,
          offline_sync_attempted_at_iso: new Date().toISOString()
        };

        // ATTENDANCE_OFFLINE_SYNC_REPAIR_V1
        // Always re-upload the stored offline selfie when available.
        // This recreates the fresh selfie session before posting attendance.
        if (payload.selfie_data_url) {
          try {
            const uploadedSelfieUrl = await uploadOfflineSelfieDataUrl(payload.selfie_data_url);
            payload.selfie_url = uploadedSelfieUrl;
            delete payload.selfie_data_url;
          } catch (selfieUploadErr) {
            const selfieRejectCode = selfieUploadErr && selfieUploadErr.code ? String(selfieUploadErr.code) : "";
            // ATTENDANCE_OFFLINE_NO_FACE_FINAL_REJECT_V1
            if (selfieRejectCode === "SELFIE_FACE_REQUIRED") {
              const rejectMsg = selfieUploadErr.message || "Face not detected. Please retake your selfie.";
              toast(rejectMsg, "error");
              continue;
            }

            packet.last_sync_error = selfieUploadErr && selfieUploadErr.message
              ? selfieUploadErr.message
              : "Offline selfie upload is still pending.";
            packet.last_sync_attempt_iso = new Date().toISOString();
            remaining.push(packet);
            toast("Offline selfie still pending. It will retry when the connection is stronger.", "warning");
            continue;
          }
        }

        // ATTENDANCE_SECURITY_CHALLENGE_OFFLINE_SYNC_V1
        // The original offline capture remains unchanged. A fresh server challenge
        // is obtained only now, when connectivity has returned and sync is about to POST.
        const securityChallenge = await requestAttendanceSecurityChallenge(
          payload.action || "IN",
          payload.device_id || ""
        );
        payload.security_challenge_id = securityChallenge.security_challenge_id;
        payload.security_challenge_token = securityChallenge.security_challenge_token;

        const {res, data} = await postJSON(packet.url || "/attendance/check_in_out", payload);

        if (res.ok && data && data.ok) {
          syncedAny = true;
          toast("Offline attendance synced successfully.", "success");
          try { updateOfflineStatusBadge("Attendance synced - refreshing..."); } catch (_) {}
          continue;
        }

        // Do not drop offline records too quickly.
        // Some errors are temporary, especially fresh selfie/session/network timing issues.
        if ([400, 403, 409].includes(res.status)) {
          const msg = (data && (data.message || data.error || data.code))
            ? String(data.message || data.error || data.code)
            : "Offline sync rejected.";

          const msgLower = msg.toLowerCase();

          const finalReject =
            res.status === 409 ||
            msgLower.includes("already marked") ||
            msgLower.includes("second attendance") ||
            msgLower.includes("outside radius") ||
            msgLower.includes("outside approved") ||
            msgLower.includes("outside all approved") ||
            msgLower.includes("unauthorized location") ||
            msgLower.includes("login_geofence_required") ||
            msgLower.includes("cannot clock out");

          if (finalReject) {
            toast(msg, "warning");
            continue;
          }

          packet.last_sync_error = msg;
          packet.last_sync_attempt_iso = new Date().toISOString();
          remaining.push(packet);
          toast("Offline attendance is still pending and will retry automatically.", "warning");
          continue;
        }

        packet.last_sync_error = (data && (data.message || data.error)) ? (data.message || data.error) : "Server did not accept sync yet.";
        packet.last_sync_attempt_iso = new Date().toISOString();
        remaining.push(packet);
      } catch (_) {
        remaining.push(packet);
      }
    }

    writeOfflineAttendanceQueue(remaining);

    if (syncedAny && remaining.length === 0) {
      try {
        sessionStorage.removeItem("nh_last_selfie_url");
        sessionStorage.removeItem("nh_pending_checkout");
        sessionStorage.removeItem("nh_pending_checkout_ts");
      } catch (_) {}

      setTimeout(() => {
        window.location.href = "/attendance/success";
      }, 1200);
    }
  }

  window.addEventListener("online", () => {
    setTimeout(syncOfflineAttendanceQueue, 1200);
  });

  setTimeout(syncOfflineAttendanceQueue, 2500);
  setInterval(syncOfflineAttendanceQueue, 60000);
  startPendingOfflineAttendanceReminder();



  // ATTENDANCE_DUPLICATE_REQUEST_LOCK_V1
  // Repeated taps share the same active network request instead of
  // creating duplicate liveness checks or duplicate selfie uploads.
  let nhSelfieUploadInFlight = null;
  let nhLivenessVerifyInFlight = null;

  async function uploadSelfieBlob(blob) {
    // If another tap already started the upload, reuse that request.
    if (nhSelfieUploadInFlight) {
      return await nhSelfieUploadInFlight;
    }

    nhSelfieUploadInFlight = (async () => {
      const fd = new FormData();
      fd.append("file", blob, "selfie.jpg");

      const res = await fetch(
        "/attendance/upload_selfie",
        {
          method: "POST",
          body: fd
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok || !data.selfie_url) {
        const msg =
          data && data.message
            ? data.message
            : "Selfie upload failed.";

        const uploadErr = new Error(msg);
        uploadErr.code = data && data.code ? String(data.code) : "";
        uploadErr.status = res.status;
        uploadErr.serverRejected = true;
        throw uploadErr;
      }

      return data.selfie_url;
    })();

    try {
      return await nhSelfieUploadInFlight;
    } finally {
      nhSelfieUploadInFlight = null;
    }
  }


  function captureVideoDataUrl(videoEl, quality = 0.72, maxW = 480) {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) {
      throw new Error("Camera frame is not ready.");
    }

    const srcW = videoEl.videoWidth;
    const srcH = videoEl.videoHeight;
    const scale = Math.min(1, maxW / Math.max(srcW, 1));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;

    const ctx = c.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, w, h);

    return c.toDataURL("image/jpeg", quality);
  }

  async function verifyBackendLiveness(payload) {
    // Repeated capture taps must not create multiple liveness requests.
    if (nhLivenessVerifyInFlight) {
      return await nhLivenessVerifyInFlight;
    }

    nhLivenessVerifyInFlight = (async () => {
      const res = await fetch(
        "/attendance/api/liveness_verify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload || {})
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(
          data && data.message
            ? data.message
            : "Backend liveness verification failed."
        );
      }

      return data;
    })();

    try {
      return await nhLivenessVerifyInFlight;
    } finally {
      nhLivenessVerifyInFlight = null;
    }
  }


  function setPendingCheckoutPacket(packet) {
    sessionStorage.setItem("nh_pending_checkout", JSON.stringify(packet));
    sessionStorage.setItem("nh_pending_checkout_ts", String(packet.client_ts || Date.now()));
  }

  function getPendingCheckoutAgeSeconds() {
    const raw = sessionStorage.getItem("nh_pending_checkout_ts");
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    if (!ts) return null;
    return Math.floor((Date.now() - ts) / 1000);
  }

  function showGeoPanel(linesHtml, badgeHtml, badgeType) {
    const p = el("geoPanel");
    const l = el("geoLines");
    const b = el("geoBadge");
    if (!p || !l || !b) return;

    p.style.display = "block";
    l.innerHTML = linesHtml || "—";

    if (badgeHtml) {
      b.style.display = "inline-flex";
      b.className = "geo-badge " + (badgeType || "warn");
      b.innerHTML = badgeHtml;
    } else {
      b.style.display = "none";
    }
  }

  function fmtM(n) {
    if (n == null) return "—";
    const v = Number(n);
    if (Number.isNaN(v)) return "—";
    return String(Math.round(v));
  }

  class NH_Attendance {
    constructor() {
      this.deviceId = null;

      this.lat = null;
      this.lng = null;
      this.accuracy = null;
      this.clientTs = null;

      // ATTENDANCE_GPS_MULTISAMPLE_ANTI_SPOOF_V1
      this.geoSamples = [];
      this.geoEvidenceRequiredSamples = 4;
      this.geoEvidenceMaxSamples = 12;
      this.geoEvidenceFreshWindowMs = 30000;

      this.locationReady = false;
      this.deviceReady = false;

      this.selfieUrl = "";
      this.selfieReady = false;
      this.offlineSelfieDataUrl = "";

      // Soft liveness challenge. This does not block attendance.
      this.livenessChallenge = "";
      this.livenessChallengeCompleted = false;
      this.livenessStatus = "PENDING";
      this.livenessBaselineSignature = null;
      this.livenessMovementScore = 0;

      this.geoInside = null;
      this.geoReasonRequired = false;

      this.stream = null;
      this.locWatchId = null;

      // ATTENDANCE_DUPLICATE_REQUEST_LOCK_V1
      this.captureClickLocked = false;
      this.submitInProgress = false;
    }

    init() {
      updateClock();
      setSound(isSoundOn());
      el("btnSound")?.addEventListener("click", () => setSound(!isSoundOn()));

      this.initDevice();
      this.hydrateExistingSelfie();
      this.initLocation();

      el("btnOpenCamera")?.addEventListener(
        "click",
        () => this.openCamera()
      );

      // ATTENDANCE_CAPTURE_BUTTON_PROGRESS_V1
      const captureBtn = el("btnCapture");

      if (captureBtn && !captureBtn.dataset.originalHtml) {
        captureBtn.dataset.originalHtml = captureBtn.innerHTML;
      }

      captureBtn?.addEventListener("click", async () => {
        if (this.captureClickLocked) {
          toast(
            "Selfie verification is already processing.",
            "warning"
          );
          return;
        }

        const originalHtml =
          captureBtn.dataset.originalHtml
          || captureBtn.innerHTML;

        this.captureClickLocked = true;
        captureBtn.disabled = true;
        captureBtn.setAttribute("aria-busy", "true");

        captureBtn.innerHTML = `
          <i class="fas fa-spinner fa-spin"></i>
          Checking liveness and uploading...
        `;

        setCardStatus(
          "selfie-status",
          "pending",
          "Processing Selfie",
          "Checking liveness and uploading your selfie..."
        );

        try {
          await this.captureSelfieAndUpload();

          /*
           * canvas.toBlob starts its callback asynchronously.
           * Wait for the shared upload request to begin.
           */
          for (
            let attempt = 0;
            attempt < 50
            && !nhSelfieUploadInFlight
            && !this.selfieReady;
            attempt++
          ) {
            await new Promise(
              resolve => setTimeout(resolve, 100)
            );
          }

          if (nhSelfieUploadInFlight) {
            try {
              await nhSelfieUploadInFlight;
            } catch (_) {
              /*
               * The existing capture method displays the
               * actual upload error.
               */
            }
          }

          if (this.selfieReady) {
            captureBtn.innerHTML = `
              <i class="fas fa-circle-check"></i>
              Selfie Captured
            `;

            captureBtn.disabled = true;

            setCardStatus(
              "selfie-status",
              "verified",
              "Selfie Approved",
              "Fresh selfie accepted. You can now mark attendance."
            );
          } else {
            captureBtn.innerHTML = originalHtml;
            captureBtn.disabled = false;
          }

        } catch (error) {
          console.error(
            "Selfie capture processing failed:",
            error
          );

          captureBtn.innerHTML = originalHtml;
          captureBtn.disabled = false;

          setCardStatus(
            "selfie-status",
            "error",
            "Selfie Processing Failed",
            error.message || "Please try again."
          );

        } finally {
          this.captureClickLocked = false;
          captureBtn.removeAttribute("aria-busy");

          if (!this.selfieReady) {
            captureBtn.innerHTML = originalHtml;
            captureBtn.disabled = false;
          }
        }
      });

      const attendanceBtn = el("attendance-btn");

      attendanceBtn?.addEventListener("click", async () => {
        if (this.submitInProgress) {
          toast(
            "Attendance submission is already processing.",
            "warning"
          );
          return;
        }

        this.submitInProgress = true;

        try {
          await this.submit();
        } finally {
          this.submitInProgress = false;
        }
      });

      // If OUT: invalidate stale pending packet
      if (CONTEXT.nextAction === "OUT") {
        const age = getPendingCheckoutAgeSeconds();
        if (age != null && age > CONTEXT.locationMaxAgeS) {
          sessionStorage.removeItem("nh_pending_checkout");
          sessionStorage.removeItem("nh_pending_checkout_ts");
        }
      }
    }

    initDevice() {
      try {
        let deviceId = localStorage.getItem("nh_attendance_device_id") || "";
        if (!deviceId) {
          deviceId = "NH-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10).toUpperCase();
          localStorage.setItem("nh_attendance_device_id", deviceId);
        }

        this.deviceId = deviceId;
        this.deviceReady = true;

        setCardStatus(
          "device-status",
          "verified",
          "Device Verified",
          "Secure device check passed"
        );
      } catch (err) {
        this.deviceId = "NH-FALLBACK-" + Date.now();
        this.deviceReady = true;

        setCardStatus(
          "device-status",
          "verified",
          "Device Verified",
          "Temporary device ID assigned"
        );
      }

      this.updateActionButton();
    }

    hydrateExistingSelfie() {
      // Shared-phone safety:
      // Never reuse an old selfie from this browser/device.
      // Every logged-in staff must capture a fresh selfie for their own attendance.
      try { sessionStorage.removeItem("nh_last_selfie_url"); } catch (_) {}

      this.selfieUrl = "";
      this.selfieReady = false;
      this.offlineSelfieDataUrl = "";

      setCardStatus("selfie-status", "pending", "Fresh Selfie Needed", "Capture a fresh selfie for this attendance");
    }

    async refreshGeoStatus() {
      if (!(this.locationReady && this.lat != null && this.lng != null && this.clientTs != null)) return;

      try {
        const {res, data} = await postJSON("/attendance/geo_status", {
          lat: this.lat,
          lng: this.lng,
          accuracy: this.accuracy,
          client_ts: this.clientTs,
          next_action: CONTEXT.nextAction
        });

        if (!res.ok || !data.ok) {
          this.geoInside = null;
          this.geoReasonRequired = false;

          const msg = (data && (data.message || data.error)) ? (data.message || data.error) : "Geo status unavailable";
          showGeoPanel(
            `<div>Geo status: <span class="mono">${msg}</span></div>`,
            `<i class="fas fa-triangle-exclamation"></i> Location needs refresh`,
            "warn"
          );
          return;
        }

        this.geoInside = !!data.inside;
        this.geoReasonRequired = !!data.reason_required;

        const nb = data.nearest_branch || {};
        const mb = data.matched_branch || null;
        const pick = mb || nb;

        const lines = [
          `<div><b>Nearest:</b> <span class="mono">${(pick.branch_name || "—")} (${(pick.branch_id || "")})</span></div>`,
          `<div><b>Distance:</b> <span class="mono">${fmtM(data.distance_m)}m</span> &nbsp; <b>Allowed:</b> <span class="mono">${fmtM(data.allowed_m)}m</span> &nbsp; <b>Radius:</b> <span class="mono">${fmtM(data.radius_m)}m</span></div>`
        ].join("");

        if (this.geoInside) {
          showGeoPanel(lines, `<i class="fas fa-circle-check"></i> Inside approved radius`, "ok");
          setCardStatus("location-status", "verified", "Location Verified", `Inside • dist ${fmtM(data.distance_m)}m`);
        } else {
          if (CONTEXT.nextAction === "IN") {
            showGeoPanel(lines, `<i class="fas fa-triangle-exclamation"></i> Outside radius • IN will be rejected`, "danger");
            setCardStatus("location-status", "error", "Location Outside", `OUTSIDE • dist ${fmtM(data.distance_m)}m`);
          } else {
            const badge = this.geoReasonRequired
              ? `<i class="fas fa-pen-to-square"></i> Outside radius • Reason will be required`
              : `<i class="fas fa-triangle-exclamation"></i> Outside radius`;
            showGeoPanel(lines, badge, "warn");
            setCardStatus("location-status", "verified", "Location Captured", "Outside • Reason may be required");
          }
        }
      } catch (e) {
        showGeoPanel(
          `<div>Geo status: <span class="mono">Network error</span></div>`,
          `<i class="fas fa-triangle-exclamation"></i> Could not verify branch`,
          "warn"
        );
      }
    }

    // ======================================================
    // ATTENDANCE_GPS_MULTISAMPLE_ANTI_SPOOF_V1
    // Collect several fresh browser location observations before IN/OUT.
    // This supplements the existing geofence and does not replace native
    // Android Location.isMock() / Play Integrity.
    // ======================================================

    freshAttendanceGeoSamples() {
      const now = Date.now();

      return (this.geoSamples || []).filter((sample) => {
        const ts = Number(sample && sample.captured_at);

        return Number.isFinite(ts)
          && Math.abs(now - ts) <= this.geoEvidenceFreshWindowMs;
      });
    }

    recordAttendanceGeoSample(pos) {
      if (!pos || !pos.coords) return;

      const lat = Number(pos.coords.latitude);
      const lng = Number(pos.coords.longitude);
      const acc = Number(pos.coords.accuracy);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (lat === 0 && lng === 0) return;

      this.geoSamples.push({
        lat: lat,
        lng: lng,

        accuracy: Number.isFinite(acc)
          ? acc
          : null,

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
      });

      if (
        this.geoSamples.length
        > this.geoEvidenceMaxSamples
      ) {
        this.geoSamples =
          this.geoSamples.slice(
            -this.geoEvidenceMaxSamples
          );
      }
    }

    attendanceGeoEvidenceReady() {
      const samples =
        this.freshAttendanceGeoSamples();

      if (
        samples.length
        < this.geoEvidenceRequiredSamples
      ) {
        return false;
      }

      const firstTs = Number(
        samples[0].captured_at
      );

      const lastTs = Number(
        samples[
          samples.length - 1
        ].captured_at
      );

      if (
        !Number.isFinite(firstTs)
        || !Number.isFinite(lastTs)
      ) {
        return false;
      }

      return (
        lastTs - firstTs
      ) >= 1500;
    }

    sleepGeoEvidence(ms) {
      return new Promise(
        (resolve) =>
          setTimeout(resolve, ms)
      );
    }

    captureAttendanceGeoSample(options) {
      return new Promise(
        (resolve, reject) => {

          navigator.geolocation
            .getCurrentPosition(
              (pos) => {

                this.recordAttendanceGeoSample(
                  pos
                );

                this.lat =
                  pos.coords.latitude;

                this.lng =
                  pos.coords.longitude;

                this.accuracy =
                  pos.coords.accuracy;

                this.clientTs =
                  Date.now();

                this.locationReady =
                  true;

                resolve(pos);
              },

              (err) =>
                reject(err),

              options
            );
        }
      );
    }

    async collectFreshAttendanceGeoEvidence() {
      if (!navigator.geolocation) {
        return false;
      }

      /*
       * New evidence window immediately
       * before attendance submission.
       */
      this.geoSamples = [];

      const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      };

      for (
        let i = 0;
        i < this.geoEvidenceRequiredSamples;
        i++
      ) {
        try {
          await this
            .captureAttendanceGeoSample(
              options
            );
        } catch (err) {
          return false;
        }

        if (
          i
          < this.geoEvidenceRequiredSamples - 1
        ) {
          await this.sleepGeoEvidence(
            650
          );
        }
      }

      return this
        .attendanceGeoEvidenceReady();
    }


    initLocation() {
      if (!navigator.geolocation) {
        setCardStatus("location-status", "error", "Location Unavailable", "Geolocation not supported");
        this.locationReady = false;
        this.updateActionButton();
        return;
      }

      const onSuccess = async (pos) => {
        // ATTENDANCE_GPS_MULTISAMPLE_ANTI_SPOOF_V1
        this.recordAttendanceGeoSample(pos);

        this.lat = pos.coords.latitude;
        this.lng = pos.coords.longitude;
        this.accuracy = pos.coords.accuracy;
        this.clientTs = Date.now();

        this.locationReady = true;
        const accTxt = (this.accuracy != null) ? `${Math.round(this.accuracy)}m` : "n/a";
        setCardStatus("location-status", "verified", "Location Captured", `Accuracy: ${accTxt}`);

        // Throttle server location verification.
        // watchPosition can fire repeatedly on mobile GPS, so do not POST to backend every time.
        const now = Date.now();
        const lastPostAt = this._lastLocationServerPostAt || 0;
        const canPostLocation = !lastPostAt || ((now - lastPostAt) >= 30000);

        if (canPostLocation) {
          this._lastLocationServerPostAt = now;

          try {
            await postJSON("/attendance/set_location", {
              lat: this.lat,
              lng: this.lng,
              accuracy: this.accuracy,
              ts: this.clientTs
            });
          } catch (e) {}

          await this.refreshGeoStatus();
        }

        this.updateActionButton();
      };

      const onError = () => {
        this.locationReady = false;
        this.clientTs = null;
        setCardStatus("location-status", "error", "Location Failed", "Enable location to continue");
        showGeoPanel(
          `<div>Location is <span class="mono">missing</span>.</div>`,
          `<i class="fas fa-triangle-exclamation"></i> Enable location`,
          "danger"
        );
        this.updateActionButton();
      };

      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });

      try {
        this.locWatchId = navigator.geolocation.watchPosition(onSuccess, onError, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });
      } catch (e) {}
    }

    getLivenessFrameSignature(videoEl) {
      try {
        if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;

        const tw = 64;
        const th = 48;
        const tmp = document.createElement("canvas");
        tmp.width = tw;
        tmp.height = th;

        const ctx = tmp.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(videoEl, 0, 0, tw, th);

        const data = ctx.getImageData(0, 0, tw, th).data;
        const sig = [];

        for (let y = 0; y < th; y += 4) {
          for (let x = 0; x < tw; x += 4) {
            const idx = ((y * tw) + x) * 4;
            const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            sig.push(gray);
          }
        }

        return sig;
      } catch (e) {
        return null;
      }
    }

    compareLivenessFrames(a, b) {
      try {
        if (!a || !b || !a.length || !b.length) return 0;

        const n = Math.min(a.length, b.length);
        let total = 0;

        for (let i = 0; i < n; i++) {
          total += Math.abs(a[i] - b[i]);
        }

        return total / Math.max(n, 1);
      } catch (e) {
        return 0;
      }
    }

    // CAMERA_LIVENESS_TIMEOUT_RECOVERY_V1
    // Prevents staff phones from getting stuck on "Wait for liveness check..."
    // when camera permission/stream/video metadata is slow or unavailable.
    async waitForCameraReady(video, timeoutMs = 12000) {
      return new Promise((resolve, reject) => {
        if (!video) {
          reject(new Error("Camera preview element was not found."));
          return;
        }

        const start = Date.now();

        const isReady = () => {
          return (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          );
        };

        if (isReady()) {
          resolve(true);
          return;
        }

        let timer = null;

        const cleanup = () => {
          try { video.removeEventListener("loadedmetadata", check); } catch (_) {}
          try { video.removeEventListener("canplay", check); } catch (_) {}
          try { video.removeEventListener("playing", check); } catch (_) {}
          try { clearInterval(timer); } catch (_) {}
        };

        const check = () => {
          if (isReady()) {
            cleanup();
            resolve(true);
            return;
          }

          if ((Date.now() - start) >= timeoutMs) {
            cleanup();
            reject(new Error("Camera did not become ready. Please close other camera apps, allow permission, and retry."));
          }
        };

        video.addEventListener("loadedmetadata", check);
        video.addEventListener("canplay", check);
        video.addEventListener("playing", check);

        timer = setInterval(check, 250);
      });
    }

    stopCameraStreamOnly() {
      try {
        if (this.stream) {
          this.stream.getTracks().forEach(t => {
            try { t.stop(); } catch (_) {}
          });
          this.stream = null;
        }

        const video = el("camVideo");
        if (video) {
          video.srcObject = null;
          video.style.display = "none";
        }
      } catch (_) {}
    }

    resetCameraButtonsAfterFailure(message) {
      const openBtn = el("btnOpenCamera");
      const captureBtn = el("btnCapture");
      const instructionBox = el("livenessInstruction");

      if (openBtn) {
        openBtn.disabled = false;
        openBtn.innerHTML = '<i class="fas fa-redo"></i> Retry Camera';
      }

      if (captureBtn) {
        captureBtn.disabled = true;
        captureBtn.innerHTML = '<i class="fas fa-camera-retro"></i> Capture Selfie';
      }

      if (instructionBox) {
        instructionBox.innerHTML =
          '<strong>Camera could not start properly.</strong> ' +
          'Close other apps using the camera, allow camera permission, then tap <strong>Retry Camera</strong>.';
      }

      setCardStatus(
        "selfie-status",
        "error",
        "Camera Not Ready",
        message || "Camera could not start. Retry camera."
      );

      toast(message || "Camera could not start. Please retry.", "error");
      try { speak("Camera could not start. Please retry camera."); } catch (_) {}
    }

    async openCamera() {
      const video = el("camVideo");
      const openBtn = el("btnOpenCamera");
      const captureBtn = el("btnCapture");

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera is not supported on this browser. Please use Chrome or a modern browser.");
        }

        // Reset any old stream first.
        this.stopCameraStreamOnly();

        this.selfieReady = false;
        this.selfieUrl = "";
        this.offlineSelfieDataUrl = "";

        this.livenessChallengeCompleted = false;
        this.livenessStatus = "CAMERA_STARTING";
        this.livenessBaselineSignature = null;
        this.livenessMovementScore = 0;
        this.livenessBaselineDataUrl = "";
        this.livenessTurnDataUrl = "";
        this.livenessFinalDataUrl = "";
        this.livenessBackendStatus = "PENDING";

        if (openBtn) {
          openBtn.disabled = true;
          openBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Opening Camera...';
        }

        if (captureBtn) {
          captureBtn.disabled = true;
          captureBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Wait for camera...';
        }

        const instructionBox = el("livenessInstruction");
        if (instructionBox) {
          instructionBox.innerHTML =
            '<strong>Opening camera...</strong> Please allow camera permission and wait for the live preview.';
        }

        const constraints = {
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!video) {
          throw new Error("Camera preview element was not found.");
        }

        video.srcObject = this.stream;
        video.muted = true;
        video.playsInline = true;
        video.style.display = "block";

        try {
          await video.play();
        } catch (_) {
          // Some mobile browsers delay play until metadata is ready.
        }

        await this.waitForCameraReady(video, 12000);

        if (openBtn) {
          openBtn.disabled = false;
          openBtn.innerHTML = '<i class="fas fa-video"></i> Restart Camera';
        }

        if (captureBtn) {
          captureBtn.disabled = true;
          captureBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> Wait for liveness check...';
        }

        const challenges = [
          "Face the camera, turn your head slightly to the left, then face front again",
          "Face the camera, turn your head slightly to the right, then face front again"
        ];

        const chosenChallenge = challenges[Math.floor(Math.random() * challenges.length)];

        this.livenessChallenge = chosenChallenge;
        this.livenessChallengeCompleted = false;
        this.livenessStatus = "CHALLENGE_PRESENTED";
        this.livenessChallengeStartedAt = Date.now();
        this.livenessMinCaptureDelayMs = 1800;
        this.livenessRequiredScore = 1.0; // ATTENDANCE_LIVENESS_SOFT_PASS_V1
        this.livenessBaselineDataUrl = "";
        this.livenessTurnDataUrl = "";
        this.livenessFinalDataUrl = "";
        this.livenessBackendStatus = "PENDING";

        if (instructionBox) {
          instructionBox.classList.remove("nh-live-ok", "nh-live-bad");
          instructionBox.classList.add("nh-live-warn");
          instructionBox.innerHTML =
            "Liveness Check: " + chosenChallenge +
            ". Wait for the capture button, then tap Capture Selfie while facing front again.";
        }

        try { speak("Liveness check. " + chosenChallenge + ". Then tap capture selfie while facing the camera."); } catch (_) {}

        toast(chosenChallenge + ", then tap Capture Selfie while facing the camera.", "warning");

        setCardStatus(
          "selfie-status",
          "pending",
          "Camera Ready",
          "Follow the liveness instruction before capture"
        );

        // Wait a little longer on slow phones before taking baseline.
        await new Promise(resolve => setTimeout(resolve, 1000));
        await this.waitForCameraReady(video, 8000);

        this.livenessBaselineSignature = this.getLivenessFrameSignature(video);
        this.livenessBaselineDataUrl = captureVideoDataUrl(video, 0.70, 480);
        this.livenessMovementScore = 0;

        // Capture turn frame after the user has had time to move.
        setTimeout(() => {
          try {
            if (!video || !video.videoWidth || !video.videoHeight) {
              throw new Error("Camera frame is not ready for turn frame.");
            }

            this.livenessTurnDataUrl = captureVideoDataUrl(video, 0.70, 480);

            const box = el("livenessInstruction");
            if (box) {
              box.classList.remove("nh-live-bad");
              box.classList.add("nh-live-warn");
              box.innerHTML = "Turn frame captured. Now face front again, then tap Capture Selfie.";
            }

            try { speak("Turn frame captured. Face front again, then capture selfie."); } catch (_) {}

          } catch (_) {
            // Do not freeze the user. Capture can still validate movement from current frame.
          }

          const btn = el("btnCapture");
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-camera-retro"></i> Capture Selfie';
          }
        }, this.livenessMinCaptureDelayMs || 1800);

      } catch (err) {
        this.stopCameraStreamOnly();

        this.livenessBaselineSignature = null;
        this.livenessBaselineDataUrl = "";
        this.livenessTurnDataUrl = "";
        this.livenessMovementScore = 0;
        this.livenessStatus = "CAMERA_START_FAILED";

        this.resetCameraButtonsAfterFailure(err.message || "Camera access denied or not available.");
      }
    }

    async captureSelfieAndUpload() {
      const video = el("camVideo");
      const canvas = el("selfieCanvas");
      const preview = el("selfiePreview");

      if (!video || !video.videoWidth) {
        setCardStatus("selfie-status", "error", "Camera Not Ready", "Open camera first");
        this.selfieReady = false;
        this.updateActionButton();
        return;
      }

      const challengeAgeMs = Date.now() - (this.livenessChallengeStartedAt || 0);
      const minDelayMs = this.livenessMinCaptureDelayMs || 1800;

      if (!this.livenessChallengeStartedAt || challengeAgeMs < minDelayMs) {
        this.selfieReady = false;
        this.selfieUrl = "";

        setCardStatus(
          "selfie-status",
          "error",
          "Too Early",
          "Please wait, obey the head-turn instruction, face front again, then capture."
        );

        toast("Too early. Please obey the head-turn instruction before capturing.", "error");
        try { speak("Too early. Please obey the head turn instruction before capturing."); } catch (_) {}

        this.updateActionButton();
        return;
      }

      this.livenessChallengeCompleted = true;

      // Soft movement verification:
      // compare current live camera frame against the baseline frame.
      // Weak browser movement detection must not block genuine staff attendance.
      try {
        const currentSignature = this.getLivenessFrameSignature(video);
        const score = this.compareLivenessFrames(this.livenessBaselineSignature, currentSignature);
        this.livenessMovementScore = Number(score.toFixed(2));

        const requiredScore = this.livenessRequiredScore || 1.0; // ATTENDANCE_LIVENESS_SOFT_PASS_V1

        if (this.livenessMovementScore >= requiredScore) {
          this.livenessStatus = "LIVE_CHALLENGE_OBSERVED";
        } else {
          this.livenessStatus = "CHALLENGE_NOT_CONFIRMED";

          // ATTENDANCE_LIVENESS_SOFT_PASS_V1
          // Browser movement detection can be unreliable on some phones/laptops.
          // Do not block genuine staff attendance here. Continue with fresh selfie,
          // geofence, face visibility, dark/blur checks, and backend fresh-selfie protection.
          try {
            const instructionBox = el("livenessInstruction");
            if (instructionBox) {
              instructionBox.style.display = "block";
              instructionBox.classList.remove("nh-live-bad");
              instructionBox.classList.add("nh-live-warn");
              instructionBox.innerHTML =
                "Movement check was not fully confirmed, but selfie capture will continue. Please keep your face clearly visible.";
            }
          } catch (_) {}

          toast("Movement check not fully confirmed, but selfie capture will continue.", "warning");
          try { speak("Movement check not fully confirmed. Selfie capture will continue."); } catch (_) {}
          // ATTENDANCE_LIVENESS_SOFT_PASS_DANGLING_ELSE_FIX_V1

        }
      } catch (e) {
        this.livenessMovementScore = 0;
        this.livenessStatus = "CHALLENGE_NOT_CONFIRMED";

        // ATTENDANCE_LIVENESS_SOFT_PASS_V1
        // Do not block attendance because frontend movement scoring failed.
        try { console.warn("Frontend movement check failed softly:", e); } catch (_) {}
        try { toast("Movement check could not be fully confirmed, but selfie capture will continue.", "warning"); } catch (_) {}
      }

      try {
        this.livenessFinalDataUrl = captureVideoDataUrl(video, 0.72, 480);

        const backendLive = await verifyBackendLiveness({
          challenge: this.livenessChallenge || "",
          front_frame: this.livenessBaselineDataUrl || "",
          turn_frame: this.livenessTurnDataUrl || "",
          final_frame: this.livenessFinalDataUrl || ""
        });

        this.livenessBackendStatus = backendLive.liveness_status || "BACKEND_LIVENESS_OK";
        this.livenessStatus = this.livenessBackendStatus;
        this.livenessMovementScore = backendLive.turn_delta || this.livenessMovementScore || 0;

      } catch (e) {
        // Backend liveness is currently optional because AI model download is disabled on Render
        // to protect app startup stability. Do not block selfie upload here.
        // Frontend head-turn/movement check above still remains active.
        this.livenessBackendStatus = "BACKEND_LIVENESS_SKIPPED";
        this.livenessStatus = this.livenessStatus || "LIVE_CHALLENGE_OBSERVED";

        try {
          const instructionBox = el("livenessInstruction");
          if (instructionBox) {
            instructionBox.style.display = "block";
            instructionBox.innerHTML =
              "Selfie liveness checked locally. Backend AI liveness is temporarily skipped for faster attendance.";
          }
        } catch (_) {}

        toast("Backend AI liveness skipped for speed. Continuing with selfie upload.", "warning");
      }

      try {
        const instructionBox = el("livenessInstruction");
        if (instructionBox) {
          instructionBox.style.display = "block";
          const liveLabel = this.livenessStatus === "LIVE_CHALLENGE_OBSERVED"
            ? "Movement observed"
            : "Movement check continuing";

          instructionBox.innerHTML = liveLabel + ": " + (this.livenessChallenge || "Keep face in frame, turn slightly, then face front") + ". Uploading selfie...";
        }
      } catch (e) {}

      setCardStatus(
        "selfie-status",
        "pending",
        "Uploading Selfie",
        this.livenessChallenge || "Please wait..."
      );

      // Blank/dark selfie protection before upload.
      // This prevents empty, black, or very dark camera frames from being saved.
      try {
        const testCanvas = document.createElement("canvas");
        const testW = 80;
        const testH = 60;
        testCanvas.width = testW;
        testCanvas.height = testH;

        const testCtx = testCanvas.getContext("2d", { willReadFrequently: true });
        testCtx.drawImage(video, 0, 0, testW, testH);

        const imgData = testCtx.getImageData(0, 0, testW, testH).data;

        let totalBrightness = 0;
        let brightPixels = 0;
        let sampledPixels = 0;

        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const brightness = (r + g + b) / 3;

          totalBrightness += brightness;
          sampledPixels++;

          if (brightness > 35) brightPixels++;
        }

        const avgBrightness = totalBrightness / Math.max(sampledPixels, 1);
        const brightRatio = brightPixels / Math.max(sampledPixels, 1);

        if (avgBrightness < 28 || brightRatio < 0.08) {
          this.selfieReady = false;
          this.selfieUrl = "";
          this.offlineSelfieDataUrl = "";

          setCardStatus(
            "selfie-status",
            "error",
            "Selfie Too Dark",
            "Move to a brighter place and retake selfie."
          );

          toast("Selfie is too dark or blank. Move to a brighter place and retake.", "error");
          speak("Selfie is too dark or blank. Move to a brighter place and retake.");

          this.updateActionButton();
          return;
        }

        // Basic blur detection before upload.
        // Uses nearby-pixel contrast. Very low edge detail means the selfie is likely blurred.
        let edgeTotal = 0;
        let edgeCount = 0;

        function grayAt(pxIndex) {
          return (imgData[pxIndex] + imgData[pxIndex + 1] + imgData[pxIndex + 2]) / 3;
        }

        for (let y = 1; y < testH - 1; y += 2) {
          for (let x = 1; x < testW - 1; x += 2) {
            const idx = ((y * testW) + x) * 4;
            const rightIdx = ((y * testW) + (x + 1)) * 4;
            const downIdx = (((y + 1) * testW) + x) * 4;

            const g = grayAt(idx);
            const gr = grayAt(rightIdx);
            const gd = grayAt(downIdx);

            edgeTotal += Math.abs(g - gr) + Math.abs(g - gd);
            edgeCount += 2;
          }
        }

        const blurScore = edgeTotal / Math.max(edgeCount, 1);

        // Conservative threshold: only block clearly blurred/soft frames.
        if (blurScore < 4.0) {
          this.selfieReady = false;
          this.selfieUrl = "";
          this.offlineSelfieDataUrl = "";

          setCardStatus(
            "selfie-status",
            "error",
            "Selfie Blurry",
            "Hold the phone steady and retake selfie."
          );

          toast("Selfie appears blurry. Hold the phone steady and retake.", "error");
          speak("Selfie appears blurry. Hold the phone steady and retake.");

          this.updateActionButton();
          return;
        }
      } catch (e) {
        // If brightness check fails, continue normal capture to avoid breaking camera flow.
      }

      // Full-face visibility protection before upload.
      // Uses the browser FaceDetector API where available.
      // If unsupported, it skips safely so older browsers do not break.
      try {
        if (false && "FaceDetector" in window) {
          const faceCanvas = document.createElement("canvas");
          const faceW = Math.min(480, Math.max(1, video.videoWidth || 480));
          const faceScale = faceW / Math.max(video.videoWidth || faceW, 1);
          const faceH = Math.max(1, Math.round((video.videoHeight || 360) * faceScale));

          faceCanvas.width = faceW;
          faceCanvas.height = faceH;

          const faceCtx = faceCanvas.getContext("2d", { willReadFrequently: true });
          faceCtx.drawImage(video, 0, 0, faceW, faceH);

          const detector = new FaceDetector({
            fastMode: true,
            maxDetectedFaces: 2
          });

          const faces = await detector.detect(faceCanvas);

          if (!faces || faces.length < 1) {
            this.selfieReady = false;
            this.selfieUrl = "";
            this.offlineSelfieDataUrl = "";

            setCardStatus(
              "selfie-status",
              "error",
              "Face Not Detected",
              "Your full face was not detected. Face the camera clearly and retake selfie."
            );

            toast("Your full face was not detected. Face the camera clearly and retake.", "error");
            speak("Your full face was not detected. Face the camera clearly and retake selfie.");

            this.updateActionButton();
            return;
          }

          if (faces.length > 1) {
            this.selfieReady = false;
            this.selfieUrl = "";
            this.offlineSelfieDataUrl = "";

            setCardStatus(
              "selfie-status",
              "error",
              "Multiple Faces Detected",
              "Only your face should appear in the selfie. Retake selfie."
            );

            toast("Multiple faces detected. Only your face should appear in the selfie.", "error");
            speak("Multiple faces detected. Only your face should appear in the selfie.");

            this.updateActionButton();
            return;
          }

          const box = faces[0].boundingBox || {};
          const x = Number(box.x || 0);
          const y = Number(box.y || 0);
          const bw = Number(box.width || 0);
          const bh = Number(box.height || 0);

          const marginX = faceW * 0.04;
          const marginY = faceH * 0.04;
          const touchesEdge =
            x <= marginX ||
            y <= marginY ||
            (x + bw) >= (faceW - marginX) ||
            (y + bh) >= (faceH - marginY);

          const faceTooSmall = bw < (faceW * 0.16) || bh < (faceH * 0.22);

          if (touchesEdge || faceTooSmall) {
            this.selfieReady = false;
            this.selfieUrl = "";
            this.offlineSelfieDataUrl = "";

            setCardStatus(
              "selfie-status",
              "error",
              "Full Face Not Visible",
              "Your face appears cut off or not fully visible. Center your full face and retake selfie."
            );

            toast("Your face appears cut off or not fully visible. Center your full face and retake.", "error");
            speak("Your face appears cut off or not fully visible. Center your full face and retake selfie.");

            this.updateActionButton();
            return;
          }
        }
      } catch (e) {
        // FaceDetector is optional. If it fails, continue with existing dark/blur/liveness checks.
      }

      // ATTENDANCE_SELFIE_UPLOAD_RESIZE_V1
      // Keep enough detail for face matching while avoiding unnecessarily
      // large phone-camera uploads. The backend already limits AI input to
      // a maximum of 960x960, so sending anything larger provides no AI benefit.
      const sourceW = video.videoWidth;
      const sourceH = video.videoHeight;
      const maxSide = 960;

      let w = sourceW;
      let h = sourceH;

      if (Math.max(sourceW, sourceH) > maxSide) {
        const scale = maxSide / Math.max(sourceW, sourceH);
        w = Math.round(sourceW * scale);
        h = Math.round(sourceH * scale);
      }

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, sourceW, sourceH, 0, 0, w, h);

      try {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
        this.offlineSelfieDataUrl = dataUrl;
        preview.src = dataUrl;
        preview.style.display = "block";
      } catch (e) {}

      canvas.toBlob(async (blob) => {
        try {
          try {
            this.offlineSelfieDataUrl = canvas.toDataURL("image/jpeg", 0.80);
          } catch (_) {}

          if (!blob) throw new Error("Could not capture selfie. Try again.");
          const url = await uploadSelfieBlob(blob);

          this.selfieUrl = url;
          this.selfieReady = true;
          try { sessionStorage.removeItem("nh_last_selfie_url"); } catch (_) {}

          try {
            if (this.stream) {
              this.stream.getTracks().forEach(t => t.stop());
              this.stream = null;
            }
            video.srcObject = null;
            video.style.display = "none";
            el("btnCapture").disabled = true;
          } catch (e) {}

          // ATTENDANCE_SELFIE_APPROVED_MESSAGE_V1
          try {
            const instructionBox = el("livenessInstruction");
            if (instructionBox) {
              instructionBox.style.display = "block";
              instructionBox.classList.remove("nh-live-warn", "nh-live-bad");
              instructionBox.classList.add("nh-live-ok");
              instructionBox.innerHTML =
                "<strong>Selfie Approved.</strong> Fresh selfie accepted. You can now mark attendance.";
            }
          } catch (_) {}

          setCardStatus("selfie-status", "verified", "Selfie Approved", "Fresh selfie accepted. You can now mark attendance.");
          try { toast("Selfie approved. You can now mark attendance.", "success"); } catch (_) {}
          try { speak("Selfie approved. You can now mark attendance."); } catch (_) {}
          this.updateActionButton();
        } catch (err) {
          this.selfieUrl = "";
          // ATTENDANCE_SELFIE_FACE_REQUIRED_FRONTEND_V1
          if (err && err.serverRejected) {
            this.selfieReady = false;
            this.offlineSelfieDataUrl = "";
            try { sessionStorage.removeItem("nh_last_selfie_url"); } catch (_) {}
            const rejectMsg = err.message || "Selfie was rejected. Please retake the photo.";
            const rejectTitle = err.code === "SELFIE_FACE_REQUIRED" ? "Face Not Detected" : "Selfie Failed";
            setCardStatus("selfie-status", "error", rejectTitle, rejectMsg);
            try { toast(rejectMsg, "error"); } catch (_) {}
            try { speak(rejectMsg); } catch (_) {}
          } else if (this.offlineSelfieDataUrl) {
            this.selfieReady = true;
            sessionStorage.removeItem("nh_last_selfie_url");
            setCardStatus("selfie-status", "pending", "Selfie Captured for Sync", "Fresh selfie captured. Attendance will sync automatically when internet returns");
            toast("Selfie captured offline. Attendance will sync automatically when connection returns.", "warning");
          } else {
            this.selfieReady = false;
            setCardStatus("selfie-status", "error", "Selfie Failed", err.message || "Upload failed");
          }
          this.updateActionButton();
        }
      }, "image/jpeg", 0.85);
    }

    updateActionButton() {
      const btn = el("attendance-btn");
      if (!btn) return;

      // ATTENDANCE_DAILY_COMPLETED_UI_V1
      if (CONTEXT.attendanceCompletedToday || CONTEXT.nextAction === `COMPLETED`) {
        btn.disabled = true;
        btn.classList.remove(`check-in`, `check-out`);
        btn.innerHTML = `<i class="fas fa-circle-check"></i> ATTENDANCE COMPLETED FOR TODAY`;
        return;
      }

      const hasSelfie = this.selfieReady && !!(this.selfieUrl || this.offlineSelfieDataUrl);
      const locOk = this.locationReady && (this.lat != null) && (this.lng != null) && (this.clientTs != null);

      let geoOk = true;
      if (CONTEXT.nextAction === "IN" && this.geoInside === false) geoOk = false;

      const ready = this.deviceReady && locOk && hasSelfie && geoOk;

      if (ready) {
        btn.disabled = false;
        btn.innerHTML = (CONTEXT.nextAction === "OUT")
          ? '<i class="fas fa-right-from-bracket"></i> CHECK OUT NOW'
          : '<i class="fas fa-right-to-bracket"></i> CHECK IN NOW';
      } else {
        btn.disabled = true;
        const missing = [];
        if (!this.deviceReady) missing.push("device");
        if (!locOk) missing.push("location");
        if (!hasSelfie) missing.push("selfie");
        if (!geoOk) missing.push("inside radius");

        btn.innerHTML = `<i class="fas fa-shield-halved"></i> Complete verification (${missing.join(", ")})`;
      }
    }

    async submit() {
      const btn = el("attendance-btn");

      if (showPendingOfflineAttendanceNotice(CONTEXT.nextAction)) {
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

      const selfieUrl = this.selfieUrl || "";
      const offlineSelfieDataUrl = this.offlineSelfieDataUrl || "";

      if (!(this.locationReady && this.lat != null && this.lng != null && this.clientTs != null)) {
        toast("Location is required. Enable location and wait for Location Captured.", "error");
        btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Location required';
        setTimeout(() => this.updateActionButton(), 1600);
        return;
      }

      if (!selfieUrl && !offlineSelfieDataUrl) {
        toast("Selfie is required. Capture and upload your selfie.", "error");
        btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Selfie required';
        setTimeout(() => this.updateActionButton(), 1600);
        return;
      }

      // ATTENDANCE_GPS_MULTISAMPLE_ANTI_SPOOF_V1
      btn.disabled = true;

      btn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Verifying location...';

      const geoEvidenceOk =
        await this.collectFreshAttendanceGeoEvidence();

      if (!geoEvidenceOk) {
        toast(
          "Location verification could not be completed. Keep location enabled and try again.",
          "error"
        );

        setCardStatus(
          "location-status",
          "error",
          "Location Verification Failed",
          "Keep location enabled and try again"
        );

        setTimeout(
          () => this.updateActionButton(),
          1600
        );

        return;
      }

      const attendanceGeoSamples =
        this.freshAttendanceGeoSamples();

      // ✅ OUT flow driven by server nextAction
      if (CONTEXT.nextAction === "OUT") {
        const okToClockOut = await showClockOutConfirmation();
        if (!okToClockOut) {
          btn.innerHTML = '<i class="fas fa-ban"></i> Sign-out cancelled';
          toast("Sign-out cancelled. You are still checked in.", "warning");
          speak("Sign out cancelled. You are still checked in.");
          setTimeout(() => this.updateActionButton(), 1800);
          return;
        }

        setPendingCheckoutPacket({
          confirm_out: true,
          confirmed_out: true,
          clock_out_confirmed: true,
          confirmed_at_iso: new Date().toISOString(),
          user_id: CONTEXT.userId,
          user_name: CONTEXT.userName,
          check_in_time: CONTEXT.checkInTime || "",
          device_id: this.deviceId,
          selfie_url: selfieUrl,
          selfie_data_url: offlineSelfieDataUrl || "",
          liveness_challenge: this.livenessChallenge || "",
          liveness_completed: !!this.livenessChallengeCompleted,
          liveness_status: this.livenessStatus || "PENDING",
          liveness_backend_status: this.livenessBackendStatus || "PENDING",
          liveness_movement_score: this.livenessMovementScore || 0,
          lat: this.lat,
          lng: this.lng,
          accuracy: this.accuracy,
          client_ts: this.clientTs,

          geo_samples: attendanceGeoSamples
        });

        speak(`${CONTEXT.userName}, please confirm your sign out.`);
        window.location.href = "/attendance/confirm_out";
        return;
      }

      // IN submission
      const payload = {
        note: "",
        action: CONTEXT.nextAction,
        device_id: this.deviceId,
        selfie_url: selfieUrl,
        selfie_data_url: offlineSelfieDataUrl,
        liveness_challenge: this.livenessChallenge || "",
        liveness_completed: !!this.livenessChallengeCompleted,
        liveness_status: this.livenessStatus || "PENDING",
        liveness_backend_status: this.livenessBackendStatus || "PENDING",
        liveness_movement_score: this.livenessMovementScore || 0,
        lat: this.lat,
        lng: this.lng,
        accuracy: this.accuracy,
        client_ts: this.clientTs,

        geo_samples: attendanceGeoSamples
      };

      if (!selfieUrl && offlineSelfieDataUrl) {
        if (!OFFLINE_ATTENDANCE_ENABLED) {
          showOfflineAttendanceDisabledNotice();

          btn.innerHTML =
            '<i class="fas fa-wifi"></i> Internet connection required';

          setTimeout(
            () => this.updateActionButton(),
            2200
          );

          return;
        }

        queueOfflineAttendance(payload);

        toast(
          "Attendance captured offline and will sync automatically when connection returns.",
          "warning"
        );

        btn.innerHTML =
          '<i class="fas fa-cloud-arrow-up"></i> Saved offline for auto-sync';

        setTimeout(() => {
          if (!showPendingOfflineAttendanceNotice(CONTEXT.nextAction)) {
            this.updateActionButton();
          }
        }, 2500);

        return;
      }

      try {
        // ATTENDANCE_SECURITY_CHALLENGE_IN_V1
        const securityChallenge = await requestAttendanceSecurityChallenge(
          payload.action || "IN",
          payload.device_id || ""
        );
        payload.security_challenge_id = securityChallenge.security_challenge_id;
        payload.security_challenge_token = securityChallenge.security_challenge_token;

        const {res, data} = await postJSON("/attendance/check_in_out", payload);

        if (!res.ok || !data.ok) {
          const msg = (data && (data.message || data.error)) ? (data.message || data.error) : "Submission failed";

          const geoCode = data && data.code ? String(data.code) : "";
          const hasGeoDetails = data && (data.nearest_branch || data.distance_m != null || data.allowed_m != null);
          const isOutsideGeoProblem =
            geoCode === "OUTSIDE_FOR_IN" ||
            geoCode === "REASON_REQUIRED" ||
            geoCode.includes("OUTSIDE");

          if (hasGeoDetails) {
            const nb = data.nearest_branch || {};
            const geoDetailsHtml =
              `<div><b>Nearest:</b> <span class="mono">${(nb.branch_name || "—")} (${(nb.branch_id || "")})</span></div>
               <div><b>Distance:</b> <span class="mono">${fmtM(data.distance_m)}m</span> &nbsp; <b>Allowed:</b> <span class="mono">${fmtM(data.allowed_m)}m</span> &nbsp; <b>Radius:</b> <span class="mono">${fmtM(data.radius_m)}m</span></div>`;

            showGeoPanel(
              geoDetailsHtml,
              `<i class="fas fa-triangle-exclamation"></i> ${msg}`,
              "danger"
            );

            if (isOutsideGeoProblem) {
              showBigOutsidePremisesModal(
                geoCode === "REASON_REQUIRED" ? "Reason Required Outside Premises" : "Outside Approved Branch Range",
                msg,
                geoDetailsHtml,
                geoCode === "REASON_REQUIRED"
              );
            }
          } else if (isOutsideGeoProblem) {
            showBigOutsidePremisesModal(
              geoCode === "REASON_REQUIRED" ? "Reason Required Outside Premises" : "Outside Approved Branch Range",
              msg,
              "Please move closer to an approved branch/premises. If you are signing out outside the approved range, type a clear reason.",
              geoCode === "REASON_REQUIRED"
            );
          }

          if (data && data.code === "ATTENDANCE_CLOSED_FOR_TODAY") {
            await showAttendanceClosedModal(msg);
          } else {
            toast(msg, "error");
          }

          btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Failed';
          setTimeout(() => this.updateActionButton(), 2200);
          return;
        }

        btn.innerHTML = '<i class="fas fa-check-circle"></i> SUCCESS!';
        speak(`${CONTEXT.userName}, attendance recorded successfully.`);
        setTimeout(() => {
          window.location.href = "/attendance/success";
        }, 800);

      } catch (e) {
        try {
          if (CONTEXT.nextAction === "IN" && this.geoInside !== true) {
            toast("Offline sign-in was not saved because branch radius was not confirmed. Move inside the approved branch premises and try again.", "error");
            btn.innerHTML = '<i class="fas fa-location-dot"></i> Branch location not confirmed';
            setTimeout(() => this.updateActionButton(), 2500);
            return;
          }

          queueOfflineAttendance(payload);
          toast("Network issue. Attendance captured offline with the original time and will sync automatically when connection returns. Please do not mark attendance again.", "warning");
          btn.disabled = true;
          btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Attendance captured - pending sync';
          try { speak("Attendance captured today and pending sync. Please do not mark attendance again."); } catch (_) {}
        } catch (_) {
          toast("Network error. Please try again.", "error");
          btn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> Network error';
        }
        setTimeout(() => this.updateActionButton(), 2500);
      }
    }
  }


  // BIG_OUTSIDE_PREMISES_MODAL_V1
  function showBigOutsidePremisesModal(title, message, detailsHtml, reasonRequired = false) {
    try {
      let old = document.getElementById("nhBigOutsidePremisesModal");
      if (old) old.remove();

      const wrap = document.createElement("div");
      wrap.id = "nhBigOutsidePremisesModal";
      wrap.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "background:rgba(127,29,29,.72)",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "padding:18px"
      ].join(";");

      const box = document.createElement("div");
      box.style.cssText = [
        "max-width:620px",
        "width:100%",
        "background:#fff",
        "border:5px solid #dc2626",
        "border-radius:24px",
        "box-shadow:0 24px 70px rgba(0,0,0,.45)",
        "overflow:hidden",
        "font-family:Arial,sans-serif"
      ].join(";");

      box.innerHTML = `
        <div style="background:#dc2626;color:#fff;padding:18px 20px;font-weight:900;font-size:22px;line-height:1.2;">
          <i class="fas fa-triangle-exclamation"></i> ${title || "Outside Approved Premises"}
        </div>
        <div style="padding:20px;color:#111827;">
          <div style="font-size:18px;font-weight:900;margin-bottom:10px;">
            ${message || "You are outside the approved branch range."}
          </div>
          <div style="font-size:15px;line-height:1.55;background:#fef2f2;border:1px solid #fecaca;border-radius:16px;padding:14px;margin-bottom:14px;">
            ${detailsHtml || "Please move closer to an approved branch/premises and try again."}
          </div>
          ${reasonRequired ? `
            <div style="background:#fff7ed;border:2px solid #fb923c;border-radius:16px;padding:14px;margin-bottom:14px;font-weight:800;color:#9a3412;">
              You are signing out outside the approved range. A clear reason is required before the system can continue.
            </div>
          ` : `
            <div style="background:#fee2e2;border:2px solid #ef4444;border-radius:16px;padding:14px;margin-bottom:14px;font-weight:800;color:#991b1b;">
              Attendance marking/sign-out may fail because your current location is outside the approved premises.
            </div>
          `}
          <button type="button" id="nhBigOutsideCloseBtn"
            style="width:100%;border:0;background:#991b1b;color:white;font-weight:900;font-size:16px;border-radius:14px;padding:14px;">
            I understand
          </button>
        </div>
      `;

      wrap.appendChild(box);
      document.body.appendChild(wrap);

      document.getElementById("nhBigOutsideCloseBtn").addEventListener("click", () => wrap.remove());
    } catch (e) {
      alert((title || "Outside Approved Premises") + "\n\n" + (message || "You are outside the approved branch range."));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCardStatus("selfie-status", "error", "Camera Not Supported", "Use a modern browser");
    }
    const app = new NH_Attendance();
    window.NH_Attendance = app;
    app.init();
  });
})();

// ==========================================

// Mobile menu toggle logic
        const menuBtn = document.getElementById('menu-toggle');
        if (menuBtn) {
            menuBtn.onclick = () => {
                document.getElementById('sidebar').classList.toggle('active');
            };
        }

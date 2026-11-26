// Live clock + date (UI only)
        (function () {
          const clockEl = document.getElementById("live-clock");
          const dateEl = document.getElementById("live-date");
          function tick() {
            const d = new Date();
            if (clockEl) {
              clockEl.textContent = d.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                hour12: true
              });
            }
            if (dateEl) {
              dateEl.textContent = d.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' });
            }
          }
          tick();
          setInterval(tick, 1000);
        })();

        // =========================================================
        // Sound toggle + Text-to-Speech (active, with on/off)
        // =========================================================
        const SOUND_KEY = "nh_sound_enabled"; // same idea as attendance page
        const btnSound = document.getElementById("btnSound");

        function isSoundOn() { return localStorage.getItem(SOUND_KEY) === "1"; }

        function applySoundUI(on) {
          if (!btnSound) return;
          btnSound.classList.toggle("on", on);
          btnSound.title = on ? "Sound is ON" : "Sound is OFF";
          btnSound.innerHTML = on
            ? '<i class="fa-solid fa-volume-high"></i>'
            : '<i class="fa-solid fa-volume-xmark"></i>';
        }

        function setSound(on) {
          localStorage.setItem(SOUND_KEY, on ? "1" : "0");
          applySoundUI(on);
          try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { }
        }

        if (btnSound) {
          btnSound.addEventListener("click", () => setSound(!isSoundOn()));
        }

        // Text-to-Speech welcome (does NOT say "staff" with name)
        function speakWelcome() {
          try {
            if (!isSoundOn()) return; // respect toggle
            if (!("speechSynthesis" in window)) {
              alert("Text-to-speech is not supported in this browser.");
              return;
            }
            const name = "Peterben Ajuga";
            const msg = `Welcome ${name}. Please open the Attendance Hub to clock in or clock out.`;
            window.speechSynthesis.cancel();
            const utter = new SpeechSynthesisUtterance(msg);
            utter.rate = 1.0;
            utter.pitch = 1.0;
            utter.volume = 1.0;
            window.speechSynthesis.speak(utter);
          } catch (e) {
            alert("Text-to-speech failed: " + e);
          }
        }

        // ✅ Auto-speak once on load ONLY if sound is ON
        (function () {
          applySoundUI(isSoundOn());
          window.addEventListener("load", () => {
            if (isSoundOn()) {
              setTimeout(() => speakWelcome(), 650);
            }
          });
        })();

        // =========================================================
        // Issue reporting (POST /support/report_issue)
        // =========================================================
        const issueAlert = document.getElementById("issueAlert");
        const issueForm = document.getElementById("issueForm");
        const btnSendIssue = document.getElementById("btnSendIssue");

        function showIssueAlert(kind, msg) {
          if (!issueAlert) return;
          issueAlert.className = "alert";
          issueAlert.classList.add(kind === "success" ? "alert-success" : kind === "warning" ? "alert-warning" : "alert-danger");
          issueAlert.textContent = msg;
          issueAlert.classList.remove("d-none");
        }

        function clearIssueAlert() {
          if (!issueAlert) return;
          issueAlert.classList.add("d-none");
          issueAlert.textContent = "";
        }

        async function sendIssue() {
          clearIssueAlert();
          if (!issueForm) return;

          const fd = new FormData(issueForm);

          // extra context (harmless)
          fd.append("page_url", window.location.href);
          fd.append("user_id", "NH-1224");
          fd.append("user_name", "Peterben Ajuga");
          fd.append("role", "STAFF");

          btnSendIssue.disabled = true;
          btnSendIssue.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sending...';

          try {
            const res = await fetch("/support/report_issue", {
              method: "POST",
              body: fd
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.ok) {
              showIssueAlert("danger", (data.error || "Failed to send report. Check server logs."));
              return;
            }

            showIssueAlert("success", `Report sent successfully. Ticket: ${data.issue_id}`);

            // reset form (keep hidden page)
            const page = issueForm.querySelector('input[name="page"]')?.value || "Staff Dashboard";
            issueForm.reset();
            if (issueForm.querySelector('input[name="page"]')) issueForm.querySelector('input[name="page"]').value = page;

            // close modal after short delay
            setTimeout(() => {
              const modalEl = document.getElementById("reportIssueModal");
              const modal = bootstrap.Modal.getInstance(modalEl);
              if (modal) modal.hide();
              clearIssueAlert();
            }, 900);

          } catch (err) {
            console.error(err);
            showIssueAlert("danger", "Network/server error. Could not send report.");
          } finally {
            btnSendIssue.disabled = false;
            btnSendIssue.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Send Report';
          }
        }

        if (btnSendIssue) {
          btnSendIssue.addEventListener("click", sendIssue);
        }

        // Clear alert when modal reopens
        const reportModalEl = document.getElementById("reportIssueModal");
        if (reportModalEl) {
          reportModalEl.addEventListener("show.bs.modal", clearIssueAlert);
        }

// ==========================================

/* LEAVE_PREVIEW_AND_HR_WORKFLOW_UI_V3 */

        function updateStaffLeavePreviewDays() {
          const startInput = document.getElementById(
            "staffLeavePreviewStart"
          );

          const endInput = document.getElementById(
            "staffLeavePreviewEnd"
          );

          const output = document.getElementById(
            "staffLeavePreviewRequestedDays"
          );

          const errorBox = document.getElementById(
            "staffLeavePreviewDateError"
          );

          if (!startInput || !endInput || !output) {
            return;
          }

          const startValue = startInput.value;
          const endValue = endInput.value;

          output.textContent = "0";

          if (errorBox) {
            errorBox.classList.add("d-none");
            errorBox.textContent = "";
          }

          if (!startValue || !endValue) {
            return;
          }

          const startDate = new Date(startValue + "T00:00:00");
          const endDate = new Date(endValue + "T00:00:00");

          if (
            Number.isNaN(startDate.getTime())
            || Number.isNaN(endDate.getTime())
          ) {
            return;
          }

          if (endDate < startDate) {
            if (errorBox) {
              errorBox.textContent =
                "End date cannot be earlier than the start date.";

              errorBox.classList.remove("d-none");
            }

            return;
          }

          const millisecondsPerDay = 24 * 60 * 60 * 1000;

          const requestedDays =
            Math.floor(
              (endDate.getTime() - startDate.getTime())
              / millisecondsPerDay
            ) + 1;

          output.textContent = String(requestedDays);
        }



        let staffLeaveManagerContextV6 = null;


        function staffLeaveManagerEscapeV6(value) {
          return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
        }

        // LEAVE_BALANCE_ENGINE_V1
        function updateStaffLeaveBalanceDisplayV1(balance) {
          balance = balance || {};

          const usedEl = document.getElementById(
            "staffLeaveUsedDays"
          );

          const usedLabel = document.getElementById(
            "staffLeaveUsedDaysLabel"
          );

          const remainingEl = document.getElementById(
            "staffLeaveRemainingDays"
          );

          const remainingLabel = document.getElementById(
            "staffLeaveRemainingDaysLabel"
          );

          const entitlement = balance.entitlement_days ?? 15;
          const used = balance.used_days ?? 0;
          const pending = balance.pending_days ?? 0;
          const remaining = balance.remaining_days ?? entitlement;
          const year = balance.leave_year || new Date().getFullYear();

          if (usedEl) {
            usedEl.textContent = String(used);
          }

          if (usedLabel) {
            usedLabel.textContent =
              `Used / Pending: ${used} / ${pending}`;
          }

          if (remainingEl) {
            remainingEl.textContent = String(remaining);
          }

          if (remainingLabel) {
            remainingLabel.textContent =
              `Left from ${entitlement} working days in ${year}`;
          }
        }



        async function loadAssignedLineManagerIntoLeaveV6() {
          const managerBox = document.getElementById(
            "staffLeavePreviewManager"
          );

          const submitButton = document.getElementById(
            "btnStaffLeavePreviewSubmit"
          );

          if (!managerBox) {
            return null;
          }

          managerBox.className =
            "staff-leave-manager-card";

          managerBox.innerHTML = `
    <div class="fw-bold">
      Loading HR-assigned line manager...
    </div>
  `;

          if (submitButton) {
            submitButton.disabled = true;
          }

          try {
            const response = await fetch(
              "/staff/api/leave/context?t=" + Date.now()
            );

            const data = await response.json().catch(
              () => ({})
            );

            if (!response.ok || data.ok === false) {
              throw new Error(
                data.message
                || "Could not load your line-manager assignment."
              );
            }

            staffLeaveManagerContextV6 = data;

            updateStaffLeaveBalanceDisplayV1(
              data.leave_balance || {}
            );

            updateStaffTeamLeaveDashboardNoticeV1(
              data
            );

            const assignment =
              data.current_assignment || {};

            // STAFF_LEAVE_EXACT_SOURCE_MULTI_MANAGER_FIX_V2
            let assignedManagersForLeaveV2 = [];

            if (Array.isArray(assignment.line_managers)) {
              assignedManagersForLeaveV2 = assignment.line_managers.slice();
            } else if (Array.isArray(assignment.assigned_line_managers)) {
              assignedManagersForLeaveV2 = assignment.assigned_line_managers.slice();
            }

            if (!assignedManagersForLeaveV2.length && assignment.line_manager_id) {
              assignedManagersForLeaveV2 = [{
                line_manager_id: assignment.line_manager_id,
                line_manager_name: assignment.line_manager_name,
                line_manager_email: assignment.line_manager_email,
                line_manager_department: assignment.line_manager_department,
                active: assignment.active
              }];
            }

            const hasActiveManager = Boolean(
              assignment.assigned
              && assignment.active
              && assignedManagersForLeaveV2.length
            );

            if (hasActiveManager) {
              managerBox.className =
                "staff-leave-manager-card assigned";

              const approvalsForLeaveV2 =
                assignment.manager_approvals
                || data.manager_approvals
                || {};

              const seenManagersForLeaveV2 = new Set();

              assignedManagersForLeaveV2 = assignedManagersForLeaveV2.filter(function (manager) {
                if (!manager) return false;

                const mid = String(
                  manager.line_manager_id
                  || manager.manager_id
                  || manager.staff_id
                  || manager.id
                  || ""
                ).trim().toUpperCase();

                const name = String(
                  manager.line_manager_name
                  || manager.name
                  || ""
                ).trim().toUpperCase();

                const key = mid || name;

                if (!key || seenManagersForLeaveV2.has(key)) {
                  return false;
                }

                seenManagersForLeaveV2.add(key);
                return true;
              });

              function leaveManagerStatusInfoV2(manager) {
                const mid = String(
                  manager.line_manager_id
                  || manager.manager_id
                  || manager.staff_id
                  || manager.id
                  || ""
                ).trim().toUpperCase();

                const approval = approvalsForLeaveV2[mid] || {};

                const raw = String(
                  approval.status
                  || approval.decision
                  || manager.status
                  || manager.decision
                  || "pending"
                ).trim().toUpperCase();

                if (
                  raw.includes("RECOMMEND")
                  || raw.includes("APPROV")
                  || raw === "DONE"
                ) {
                  return {
                    className: "approved",
                    icon: "✅",
                    label: "Approved / Recommended"
                  };
                }

                if (
                  raw.includes("REJECT")
                  || raw.includes("RETURN")
                  || raw.includes("CANCEL")
                ) {
                  return {
                    className: "rejected",
                    icon: "⛔",
                    label: raw.includes("RETURN") ? "Returned" : "Rejected"
                  };
                }

                return {
                  className: "pending",
                  icon: "⏳",
                  label: "Pending approval"
                };
              }

              const countLabel =
                assignedManagersForLeaveV2.length === 1
                  ? "1 assigned line manager"
                  : `${assignedManagersForLeaveV2.length} assigned line managers`;

              managerBox.innerHTML = `
        <div class="fw-bold mb-2">
          ${staffLeaveManagerEscapeV6(countLabel)}
        </div>

        <div class="staff-leave-manager-list-v2">
          ${assignedManagersForLeaveV2.map(function (manager) {
                const mid = String(
                  manager.line_manager_id
                  || manager.manager_id
                  || manager.staff_id
                  || ""
                ).trim();

                const name = String(
                  manager.line_manager_name
                  || manager.name
                  || "Assigned Line Manager"
                ).trim();

                const dept = String(
                  manager.line_manager_department
                  || manager.department
                  || ""
                ).trim();

                const email = String(
                  manager.line_manager_email
                  || manager.email
                  || ""
                ).trim();

                const info = leaveManagerStatusInfoV2(manager);

                return `
              <div class="staff-leave-manager-item-v2 ${info.className}">
                <div class="staff-leave-manager-head-v3">
                  <div class="staff-leave-manager-name-v2">
                    ${staffLeaveManagerEscapeV6(name)}
                  </div>

                  <div class="staff-leave-manager-status-v2">
                    ${info.icon} ${staffLeaveManagerEscapeV6(info.label)}
                  </div>
                </div>

                <div class="staff-leave-manager-meta-v2">
                  ${mid ? `Staff ID: ${staffLeaveManagerEscapeV6(mid)}<br>` : ""}
                  ${dept ? `Department: ${staffLeaveManagerEscapeV6(dept)}<br>` : ""}
                  ${email ? `Email: ${staffLeaveManagerEscapeV6(email)}<br>` : ""}
                </div>
              </div>
            `;
              }).join("")}
        </div>

        <div class="staff-leave-hr-preview-card-v1">
          <div class="staff-leave-hr-preview-title-v1">
            🏁 HR Final Approval
          </div>

          <div class="staff-leave-hr-preview-status-v1">
            ⏳ Waiting until all assigned line managers recommend.
          </div>

          <div class="staff-leave-hr-preview-note-v1">
            After line-manager review is completed, HR will make the final leave decision.
          </div>
        </div>

        <div class="small mt-2 text-success">
          <i class="fa-solid fa-shield-check me-1"></i>
          Assigned by HR. Staff cannot change this selection.
        </div>
      `;

              if (submitButton) {
                submitButton.disabled = false;

                submitButton.title =
                  "Submit to your HR-assigned line manager";
              }

              return assignment;
            }

            const message =
              assignment.message
              || (
                "No active line manager has been assigned "
                + "to your profile. Please contact HR before "
                + "submitting a leave application."
              );

            managerBox.className =
              "staff-leave-manager-card pending";

            managerBox.innerHTML = `
      <div class="fw-bold">
        No Line Manager Assigned
      </div>

      <div class="small mt-1">
        ${staffLeaveManagerEscapeV6(message)}
      </div>

      <div class="small mt-2">
        Leave submission remains unavailable until HR assigns
        an active line manager.
      </div>
    `;

            if (submitButton) {
              submitButton.disabled = true;
              submitButton.title = message;
            }

            return null;

          } catch (error) {
            console.error(
              "loadAssignedLineManagerIntoLeaveV6 failed:",
              error
            );

            managerBox.className =
              "staff-leave-manager-card pending";

            managerBox.innerHTML = `
      <div class="fw-bold">
        Line Manager Information Unavailable
      </div>

      <div class="small mt-1">
        ${staffLeaveManagerEscapeV6(
              error.message
              || "Please contact HR."
            )}
      </div>
    `;

            if (submitButton) {
              submitButton.disabled = true;
            }

            return null;
          }
        }


        function showStaffLeaveWorkingModal(actionLabel) {
          const previewElement = document.getElementById(
            "staffLeaveComingSoonModal"
          );

          const workingElement = document.getElementById(
            "staffLeaveWorkingModal"
          );

          const title = document.getElementById(
            "staffLeaveWorkingTitle"
          );

          const message = document.getElementById(
            "staffLeaveWorkingMessage"
          );

          if (title) {
            title.textContent = "HR is working on it";
          }

          if (message) {
            message.textContent =
              `${actionLabel} will become available after HR activates `
              + `the complete Staff → Line Manager → HR workflow.`;
          }

          if (previewElement) {
            bootstrap.Modal.getInstance(
              previewElement
            )?.hide();
          }

          setTimeout(() => {
            if (workingElement) {
              bootstrap.Modal.getOrCreateInstance(
                workingElement
              ).show();
            }
          }, 250);
        }



        // ==========================================================
        // STAFF_LEAVE_LIVE_WORKFLOW_V1
        // ==========================================================

        let staffLeaveSubmitBusyV1 = false;


        function showStaffLeaveLiveAlertV1(kind, message) {
          const alertBox = document.getElementById(
            "staffLeaveLiveAlert"
          );

          if (!alertBox) {
            if (message) {
              alert(message);
            }

            return;
          }

          alertBox.className =
            `alert alert-${kind || "info"} mt-4 mb-3`;

          alertBox.textContent = message || "";
          alertBox.classList.remove("d-none");

          try {
            alertBox.scrollIntoView({
              behavior: "smooth",
              block: "nearest"
            });
          } catch (_) { }
        }


        function clearStaffLeaveLiveAlertV1() {
          const alertBox = document.getElementById(
            "staffLeaveLiveAlert"
          );

          if (!alertBox) {
            return;
          }

          alertBox.classList.add("d-none");
          alertBox.textContent = "";
        }


        function staffLeaveStatusLabelV1(value) {
          const raw = String(value || "pending")
            .trim()
            .replaceAll("_", " ");

          return raw.replace(
            /\b\w/g,
            character => character.toUpperCase()
          );
        }


        function staffLeaveStatusClassV1(value) {
          const status = String(value || "")
            .toLowerCase();

          if (
            status.includes("approved")
            && !status.includes("partially")
          ) {
            return "success";
          }

          if (status.includes("partially")) {
            return "primary";
          }

          if (
            status.includes("reject")
            || status.includes("cancel")
          ) {
            return "danger";
          }

          if (status.includes("return")) {
            return "warning";
          }

          return "secondary";
        }



        // ==========================================================
        // LINE_MANAGER_LEAVE_POPUP_V1
        // ==========================================================

        let staffTeamLeaveRequestsV1 = [];
        let staffTeamLeaveLoadingV1 = false;


        function staffTeamLeaveStatusIsPendingV1(row) {
          const status = String(row?.status || "")
            .trim()
            .toLowerCase();

          return status === "pending_line_manager";
        }


        function updateStaffTeamLeaveDashboardNoticeV1(context) {
          // STAFF_TEAM_LEAVE_BUTTON_DISPLAY_FIX_V1
          const notice = document.getElementById(
            "staffTeamLeaveDashboardNoticeV1"
          );

          const badge = document.getElementById(
            "staffTeamLeavePendingBadgeV1"
          );

          const text = document.getElementById(
            "staffTeamLeaveNoticeTextV1"
          );

          if (!notice) {
            return;
          }

          const showTeamLeave = Boolean(
            context?.show_team_leave
            || context?.is_line_manager
            || Number(context?.pending_team_leave_count || 0) > 0
          );

          if (!showTeamLeave) {
            notice.classList.add("d-none");
            notice.style.setProperty("display", "none", "important");
            return;
          }

          const pendingCount = Number(
            context?.pending_team_leave_count || 0
          );

          notice.classList.remove("d-none");
          notice.style.setProperty("display", "block", "important");

          if (badge) {
            badge.textContent =
              pendingCount === 1
                ? "1 Pending"
                : `${pendingCount} Pending`;

            badge.className =
              pendingCount > 0
                ? "badge rounded-pill text-bg-danger"
                : "badge rounded-pill text-bg-secondary";
          }

          if (text) {
            text.textContent =
              pendingCount > 0
                ? (
                  pendingCount === 1
                    ? "1 leave request is waiting for your review."
                    : `${pendingCount} leave requests are waiting for your review.`
                )
                : "No pending team leave request at the moment.";
          }
        }


        async function loadStaffTeamLeaveNoticeV1() {
          try {
            const response = await fetch(
              "/staff/api/leave/context?t=" + Date.now()
            );

            const data = await response.json().catch(
              () => ({})
            );

            if (!response.ok || data.ok === false) {
              return;
            }

            updateStaffTeamLeaveDashboardNoticeV1(data);

            if (data.leave_balance) {
              updateStaffLeaveBalanceDisplayV1(
                data.leave_balance || {}
              );
            }

          } catch (error) {
            console.warn(
              "loadStaffTeamLeaveNoticeV1 failed:",
              error
            );
          }
        }


        function staffTeamLeaveDecisionLabelV1(decision) {
          const labels = {
            recommend: "Recommend",
            reject: "Reject",
            return: "Return",
            cancel: "Cancel"
          };

          return labels[decision] || decision;
        }


        async function openStaffTeamLeaveReviewModalV1() {
          const modal = document.getElementById(
            "staffTeamLeaveReviewModalV1"
          );

          if (modal) {
            bootstrap.Modal.getOrCreateInstance(modal).show();
          }

          await loadStaffTeamLeaveRequestsV1();
        }


        async function loadStaffTeamLeaveRequestsV1() {
          if (staffTeamLeaveLoadingV1) {
            return;
          }

          staffTeamLeaveLoadingV1 = true;

          const summary = document.getElementById(
            "staffTeamLeaveReviewSummaryV1"
          );

          const body = document.getElementById(
            "staffTeamLeaveReviewBodyV1"
          );

          if (summary) {
            summary.className = "alert alert-info";
            summary.textContent = "Loading team leave requests...";
          }

          if (body) {
            body.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>
        Loading requests...
      </div>
    `;
          }

          try {
            const response = await fetch(
              "/staff/api/leave/team?t=" + Date.now()
            );

            const data = await response.json().catch(
              () => ({})
            );

            if (!response.ok || data.ok === false) {
              throw new Error(
                data.message
                || "Could not load team leave requests."
              );
            }

            staffTeamLeaveRequestsV1 = Array.isArray(data.requests)
              ? data.requests
              : [];

            const pendingCount = Number(
              data.pending_count || 0
            );

            updateStaffTeamLeaveDashboardNoticeV1({
              show_team_leave: true,
              is_line_manager: true,
              pending_team_leave_count: pendingCount
            });

            if (summary) {
              summary.className =
                pendingCount > 0
                  ? "alert alert-warning"
                  : "alert alert-success";

              summary.textContent =
                pendingCount > 0
                  ? (
                    pendingCount === 1
                      ? "1 request is waiting for your review."
                      : `${pendingCount} requests are waiting for your review.`
                  )
                  : "No pending request is waiting for review.";
            }

            renderStaffTeamLeaveRequestsV1();

          } catch (error) {
            console.error(
              "loadStaffTeamLeaveRequestsV1 failed:",
              error
            );

            if (summary) {
              summary.className = "alert alert-danger";
              summary.textContent =
                error.message
                || "Could not load team leave requests.";
            }

            if (body) {
              body.innerHTML = "";
            }

          } finally {
            staffTeamLeaveLoadingV1 = false;
          }
        }


        function renderStaffTeamLeaveRequestsV1() {
          const body = document.getElementById(
            "staffTeamLeaveReviewBodyV1"
          );

          if (!body) {
            return;
          }

          if (!staffTeamLeaveRequestsV1.length) {
            body.innerHTML = `
      <div class="card border-0 shadow-sm rounded-4">
        <div class="card-body p-5 text-center text-muted">
          <i class="fa-solid fa-inbox fa-2x mb-3"></i>
          <div class="fw-bold">
            No team leave request found.
          </div>
        </div>
      </div>
    `;

            return;
          }

          body.innerHTML = staffTeamLeaveRequestsV1.map(
            (row, index) => {
              const status =
                row.status
                || row.final_status
                || "pending_line_manager";

              const pending = staffTeamLeaveStatusIsPendingV1(row);

              const statusClass =
                staffLeaveStatusClassV1(status);

              const requestedDays =
                row.requested_days ?? 0;

              const managerNote =
                row.manager_note || "";

              return `
        <div class="card border-0 shadow-sm rounded-4 mb-3">
          <div class="card-body p-4">

            <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">

              <div>
                <h5 class="fw-bold mb-1">
                  ${staffLeaveManagerEscapeV6(
                row.full_name
                || row.name
                || row.staff_id
                || "Staff"
              )}
                </h5>

                <div class="small text-muted">
                  Staff ID:
                  ${staffLeaveManagerEscapeV6(row.staff_id || "—")}
                </div>
              </div>

              <span class="badge text-bg-${statusClass} align-self-start">
                ${staffLeaveManagerEscapeV6(
                staffLeaveStatusLabelV1(status)
              )}
              </span>

            </div>

            <div class="row g-2 mb-3">

              <div class="col-md-4">
                <div class="border rounded-3 p-3 bg-light h-100">
                  <div class="small text-muted">Leave Type</div>
                  <div class="fw-bold">
                    ${staffLeaveManagerEscapeV6(row.leave_type || "Leave")}
                  </div>
                </div>
              </div>

              <div class="col-md-4">
                <div class="border rounded-3 p-3 bg-light h-100">
                  <div class="small text-muted">Dates</div>
                  <div class="fw-bold">
                    ${staffLeaveManagerEscapeV6(row.start_date || "—")}
                    to
                    ${staffLeaveManagerEscapeV6(row.end_date || "—")}
                  </div>
                </div>
              </div>

              <div class="col-md-4">
                <div class="border rounded-3 p-3 bg-light h-100">
                  <div class="small text-muted">Requested Working Days</div>
                  <div class="fw-bold">
                    ${staffLeaveManagerEscapeV6(requestedDays)}
                  </div>
                </div>
              </div>

            </div>

            <div class="small mb-2">
              <b>Staff Reason:</b>
              ${staffLeaveManagerEscapeV6(row.reason || "—")}
            </div>

            <div class="small mb-3">
              <b>Current Manager Note:</b>
              ${staffLeaveManagerEscapeV6(managerNote || "No note yet.")}
            </div>

            <label class="form-label small fw-bold">
              Manager Reason / Comment
            </label>

            <textarea
              class="form-control mb-3"
              rows="2"
              id="staffTeamLeaveReasonV1_${index}"
              placeholder="Required for reject, return, or cancel. Optional for recommend."
              ${pending ? "" : "disabled"}
            >${staffLeaveManagerEscapeV6(managerNote)}</textarea>

            <div class="d-flex gap-2 flex-wrap">

              <button
                type="button"
                class="btn btn-sm btn-success"
                onclick="staffTeamLeaveDecisionV1(${index}, 'recommend')"
                ${pending ? "" : "disabled"}
              >
                <i class="fa-solid fa-check me-1"></i>
                Recommend
              </button>

              <button
                type="button"
                class="btn btn-sm btn-danger"
                onclick="staffTeamLeaveDecisionV1(${index}, 'reject')"
                ${pending ? "" : "disabled"}
              >
                <i class="fa-solid fa-xmark me-1"></i>
                Reject
              </button>

              <button
                type="button"
                class="btn btn-sm btn-warning"
                onclick="staffTeamLeaveDecisionV1(${index}, 'return')"
                ${pending ? "" : "disabled"}
              >
                <i class="fa-solid fa-rotate-left me-1"></i>
                Return
              </button>

              <button
                type="button"
                class="btn btn-sm btn-outline-dark"
                onclick="staffTeamLeaveDecisionV1(${index}, 'cancel')"
                ${pending ? "" : "disabled"}
              >
                <i class="fa-solid fa-ban me-1"></i>
                Cancel
              </button>

            </div>

          </div>
        </div>
      `;
            }
          ).join("");
        }


        async function staffTeamLeaveDecisionV1(index, decision) {
          const row = staffTeamLeaveRequestsV1[index];

          if (!row || !row.id) {
            alert("Leave request could not be identified.");
            return;
          }

          const reasonInput = document.getElementById(
            `staffTeamLeaveReasonV1_${index}`
          );

          const reason = String(
            reasonInput?.value || ""
          ).trim();

          if (
            ["reject", "return", "cancel"].includes(decision)
            && !reason
          ) {
            alert(
              "A reason is required before you can "
              + staffTeamLeaveDecisionLabelV1(decision).toLowerCase()
              + " this leave request."
            );

            reasonInput?.focus();
            return;
          }

          const confirmed = confirm(
            `${staffTeamLeaveDecisionLabelV1(decision)} this leave request?`
          );

          if (!confirmed) {
            return;
          }

          try {
            const response = await fetch(
              `/staff/api/leave/team/review/${encodeURIComponent(row.id)}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  decision: decision,
                  reason: reason
                })
              }
            );

            const data = await response.json().catch(
              () => ({})
            );

            if (!response.ok || data.ok === false) {
              throw new Error(
                data.message
                || "Could not save manager decision."
              );
            }

            alert(
              data.message
              || "Manager decision saved successfully."
            );

            await loadStaffTeamLeaveNoticeV1();
            await loadStaffTeamLeaveRequestsV1();

          } catch (error) {
            console.error(
              "staffTeamLeaveDecisionV1 failed:",
              error
            );

            alert(
              error.message
              || "Could not save manager decision."
            );
          }
        }


        document.addEventListener("DOMContentLoaded", function () {
          document.getElementById(
            "btnOpenStaffTeamLeaveModalV1"
          )?.addEventListener(
            "click",
            openStaffTeamLeaveReviewModalV1
          );

          document.getElementById(
            "btnRefreshStaffTeamLeaveNoticeV1"
          )?.addEventListener(
            "click",
            loadStaffTeamLeaveNoticeV1
          );

          document.getElementById(
            "btnReloadStaffTeamLeaveModalV1"
          )?.addEventListener(
            "click",
            loadStaffTeamLeaveRequestsV1
          );

          loadStaffTeamLeaveNoticeV1();
        });



        async function submitStaffLeaveApplicationV1() {
          if (staffLeaveSubmitBusyV1) {
            showStaffLeaveLiveAlertV1(
              "warning",
              "Your leave application is already being submitted."
            );

            return;
          }

          clearStaffLeaveLiveAlertV1();

          const typeInput = document.getElementById(
            "staffLeavePreviewType"
          );

          const startInput = document.getElementById(
            "staffLeavePreviewStart"
          );

          const endInput = document.getElementById(
            "staffLeavePreviewEnd"
          );

          const reasonInput = document.getElementById(
            "staffLeavePreviewReason"
          );

          const requestedDaysElement = document.getElementById(
            "staffLeavePreviewRequestedDays"
          );

          const submitButton = document.getElementById(
            "btnStaffLeavePreviewSubmit"
          );

          const leaveType = String(
            typeInput?.value || ""
          ).trim();

          const startDate = String(
            startInput?.value || ""
          ).trim();

          const endDate = String(
            endInput?.value || ""
          ).trim();

          const reason = String(
            reasonInput?.value || ""
          ).trim();

          const requestedDays = Number(
            requestedDaysElement?.textContent || 0
          );

          if (!leaveType) {
            showStaffLeaveLiveAlertV1(
              "danger",
              "Select a leave type."
            );

            typeInput?.focus();
            return;
          }

          if (!startDate || !endDate) {
            showStaffLeaveLiveAlertV1(
              "danger",
              "Select both the start date and end date."
            );

            return;
          }

          if (!Number.isFinite(requestedDays) || requestedDays <= 0) {
            showStaffLeaveLiveAlertV1(
              "danger",
              "The selected leave date range is invalid."
            );

            return;
          }

          if (!reason) {
            showStaffLeaveLiveAlertV1(
              "danger",
              "Enter the reason for your leave application."
            );

            reasonInput?.focus();
            return;
          }

          const assignment =
            staffLeaveManagerContextV6?.current_assignment || {};

          const hasActiveManager = Boolean(
            assignment.assigned
            && assignment.active
            && assignment.line_manager_id
          );

          if (!hasActiveManager) {
            showStaffLeaveLiveAlertV1(
              "danger",
              "An active HR-assigned line manager is required before submission."
            );

            await loadAssignedLineManagerIntoLeaveV6();
            return;
          }

          const confirmed = window.confirm(
            `Submit ${leaveType} from ${startDate} to ${endDate} `
            + `for ${requestedDays} day(s) to `
            + `${assignment.line_manager_name || "your line manager"}?`
          );

          if (!confirmed) {
            return;
          }

          staffLeaveSubmitBusyV1 = true;

          const originalButtonHtml =
            submitButton?.innerHTML || "Submit Application";

          if (submitButton) {
            submitButton.disabled = true;

            submitButton.innerHTML = `
      <i class="fa-solid fa-spinner fa-spin me-1"></i>
      Submitting...
    `;
          }

          try {
            const response = await fetch(
              "/staff/api/leave/submit",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  leave_type: leaveType,
                  start_date: startDate,
                  end_date: endDate,
                  reason: reason
                })
              }
            );

            const data = await response.json().catch(
              () => ({})
            );

            if (!response.ok || data.ok === false) {
              if (data.code === "LEAVE_BALANCE_EXCEEDED") {
                updateStaffLeaveBalanceDisplayV1(
                  data.leave_balance || {}
                );
              }

              throw new Error(
                data.message
                || "The leave application could not be submitted."
              );
            }

            showStaffLeaveLiveAlertV1(
              "success",
              data.message
              || (
                "Leave application submitted successfully "
                + "to your assigned line manager."
              )
            );

            if (typeInput) {
              typeInput.value = "";
            }

            if (startInput) {
              startInput.value = "";
            }

            if (endInput) {
              endInput.value = "";
            }

            if (reasonInput) {
              reasonInput.value = "";
            }

            updateStaffLeavePreviewDays();

            if (submitButton) {
              submitButton.innerHTML = `
        <i class="fa-solid fa-circle-check me-1"></i>
        Application Submitted
      `;
            }

            setTimeout(() => {
              if (submitButton) {
                submitButton.innerHTML = originalButtonHtml;
              }

              loadAssignedLineManagerIntoLeaveV6();
            }, 2200);

          } catch (error) {
            console.error(
              "submitStaffLeaveApplicationV1 failed:",
              error
            );

            showStaffLeaveLiveAlertV1(
              "danger",
              error.message
              || "The leave application could not be submitted."
            );

            if (submitButton) {
              submitButton.innerHTML = originalButtonHtml;
            }

          } finally {
            staffLeaveSubmitBusyV1 = false;

            const assignmentNow =
              staffLeaveManagerContextV6?.current_assignment || {};

            const managerStillActive = Boolean(
              assignmentNow.assigned
              && assignmentNow.active
              && assignmentNow.line_manager_id
            );

            if (submitButton) {
              submitButton.disabled = !managerStillActive;
            }
          }
        }


        async function loadStaffLeaveHistoryV1() {
          const previewModal = document.getElementById(
            "staffLeaveComingSoonModal"
          );

          const historyModal = document.getElementById(
            "staffLeaveHistoryModal"
          );

          const summary = document.getElementById(
            "staffLeaveHistorySummary"
          );

          const body = document.getElementById(
            "staffLeaveHistoryBody"
          );

          if (!historyModal || !summary || !body) {
            return;
          }

          summary.className = "alert alert-info";
          summary.textContent = "Loading your leave records...";

          body.innerHTML = `
    <div class="text-center py-5 text-muted">
      <i class="fa-solid fa-spinner fa-spin me-2"></i>
      Loading leave history...
    </div>
  `;

          bootstrap.Modal.getInstance(
            previewModal
          )?.hide();

          setTimeout(() => {
            bootstrap.Modal.getOrCreateInstance(
              historyModal
            ).show();
          }, 220);

          try {
            const response = await fetch(
              "/staff/api/leave/my?t=" + Date.now()
            );

            const data = await response.json().catch(
              () => ({})
            );

            if (!response.ok || data.ok === false) {
              throw new Error(
                data.message
                || "Could not load leave history."
              );
            }

            updateStaffLeaveBalanceDisplayV1(
              data.leave_balance || {}
            );

            const rows = Array.isArray(data.leaves)
              ? data.leaves
              : [];

            summary.className = "alert alert-success";

            summary.textContent =
              rows.length === 1
                ? "1 leave record found."
                : `${rows.length} leave records found.`;

            if (!rows.length) {
              body.innerHTML = `
        <div class="card border-0 shadow-sm rounded-4">
          <div class="card-body p-5 text-center text-muted">
            <i class="fa-solid fa-calendar-xmark fa-2x mb-3"></i>
            <div class="fw-bold">
              No leave application has been submitted yet.
            </div>
          </div>
        </div>
      `;

              return;
            }

            body.innerHTML = rows.map(row => {
              const status =
                row.final_status
                || row.status
                || "pending_line_manager";

              const statusClass =
                staffLeaveStatusClassV1(status);

              const requestedDays =
                row.requested_days ?? 0;

              const approvedDays =
                row.approved_days ?? 0;

              const pendingDays =
                row.pending_days ?? requestedDays;

              const managerNote =
                row.manager_note || "No manager note yet.";

              const hrNote =
                row.hr_note || "No HR note yet.";

              return `
        <div class="card border-0 shadow-sm rounded-4 mb-3">
          <div class="card-body p-4">

            <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">

              <div>
                <h5 class="fw-bold mb-1">
                  ${staffLeaveManagerEscapeV6(
                row.leave_type || "Leave"
              )}
                </h5>

                <div class="small text-muted">
                  ${staffLeaveManagerEscapeV6(
                row.start_date || "—"
              )}
                  to
                  ${staffLeaveManagerEscapeV6(
                row.end_date || "—"
              )}
                </div>
              </div>

              <span class="badge text-bg-${statusClass} align-self-start">
                ${staffLeaveManagerEscapeV6(
                staffLeaveStatusLabelV1(status)
              )}
              </span>

            </div>

            <div class="row g-2 mb-3">

              <div class="col-md-4">
                <div class="border rounded-3 p-3 bg-light h-100">
                  <div class="small text-muted">Requested Days</div>
                  <div class="fw-bold">${requestedDays}</div>
                </div>
              </div>

              <div class="col-md-4">
                <div class="border rounded-3 p-3 bg-light h-100">
                  <div class="small text-muted">Approved Days</div>
                  <div class="fw-bold">${approvedDays}</div>
                </div>
              </div>

              <div class="col-md-4">
                <div class="border rounded-3 p-3 bg-light h-100">
                  <div class="small text-muted">Pending Days</div>
                  <div class="fw-bold">${pendingDays}</div>
                </div>
              </div>

            </div>

            <div class="small mb-2">
              <b>Reason:</b>
              ${staffLeaveManagerEscapeV6(
                row.reason || "—"
              )}
            </div>

            <div class="small mb-2">
              <b>Line Manager:</b>
              ${staffLeaveManagerEscapeV6(
                row.line_manager_name || "Not assigned"
              )}
            </div>

            <div class="small mb-2">
              <b>Manager Status:</b>
              ${staffLeaveManagerEscapeV6(
                staffLeaveStatusLabelV1(
                  row.manager_status || "pending"
                )
              )}
            </div>

            <div class="small mb-2">
              <b>Manager Reason/Note:</b>
              ${staffLeaveManagerEscapeV6(managerNote)}
            </div>

            <div class="small mb-2">
              <b>HR Status:</b>
              ${staffLeaveManagerEscapeV6(
                staffLeaveStatusLabelV1(
                  row.hr_status || "not_started"
                )
              )}
            </div>

            <div class="small">
              <b>HR Reason/Note:</b>
              ${staffLeaveManagerEscapeV6(hrNote)}
            </div>

          </div>
        </div>
      `;
            }).join("");

          } catch (error) {
            console.error(
              "loadStaffLeaveHistoryV1 failed:",
              error
            );

            summary.className = "alert alert-danger";

            summary.textContent =
              error.message
              || "Could not load leave history.";

            body.innerHTML = "";
          }
        }


        document.addEventListener("DOMContentLoaded", function () {
          const startInput = document.getElementById(
            "staffLeavePreviewStart"
          );

          const endInput = document.getElementById(
            "staffLeavePreviewEnd"
          );

          startInput?.addEventListener(
            "change",
            updateStaffLeavePreviewDays
          );

          endInput?.addEventListener(
            "change",
            updateStaffLeavePreviewDays
          );

          document.getElementById(
            "staffLeaveComingSoonModal"
          )?.addEventListener(
            "show.bs.modal",
            async function () {
              await loadAssignedLineManagerIntoLeaveV6();
              updateStaffLeavePreviewDays();
            }
          );

          document.getElementById(
            "btnStaffLeavePreviewHistory"
          )?.addEventListener(
            "click",
            loadStaffLeaveHistoryV1
          );

          const saveDraftButton = document.getElementById(
            "btnStaffLeavePreviewSaveDraft"
          );

          if (saveDraftButton) {
            saveDraftButton.disabled = true;

            saveDraftButton.title =
              "Draft storage will be activated in the next phase.";

            saveDraftButton.addEventListener(
              "click",
              () => showStaffLeaveLiveAlertV1(
                "info",
                "Draft saving is not active yet. Use Submit Application for the live test."
              )
            );
          }

          document.getElementById(
            "btnStaffLeavePreviewSubmit"
          )?.addEventListener(
            "click",
            submitStaffLeaveApplicationV1
          );
        });

// ==========================================

// Mobile menu toggle logic
    const menuBtn = document.getElementById('menu-toggle');
    if (menuBtn) {
      menuBtn.onclick = () => {
        document.getElementById('sidebar').classList.toggle('active');
      };
    }

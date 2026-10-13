/**
 * timer.js - UI helpers for time warnings + toast notifications.
 * The countdown itself lives in app.js (startTimer/updateTimerDisplay).
 */
(function () {
  'use strict';

  var WARN_5_MIN = 5 * 60;
  var WARN_1_MIN = 60;

  var warned5 = false;
  var warned1 = false;

  function resetTimerWarnings() {
    warned5 = false;
    warned1 = false;
  }

  // Called from app.js updateTimerDisplay(). Fires once per threshold.
  function checkTimerWarnings(remainingSeconds) {
    if (warned5 && warned1) return;
    if (!warned5 && remainingSeconds <= WARN_5_MIN && remainingSeconds > WARN_1_MIN) {
      warned5 = true;
      showToast('⏳ 5 minutes left. Review flagged questions.', 'warn');
    }
    if (!warned1 && remainingSeconds <= WARN_1_MIN && remainingSeconds > 0) {
      warned1 = true;
      showToast('⏰ Less than 1 minute left! Answers auto-submit at 0:00.', 'danger');
    }
  }

  function formatClock(totalSeconds) {
    var s = Math.max(0, totalSeconds);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? '0' + m : '' + m) + ':' + (r < 10 ? '0' + r : '' + r);
  }

  // Polite toast region (aria-live). Auto-creates container once.
  function showToast(message, kind) {
    var region = document.getElementById('toefl-toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toefl-toast-region';
      region.className = 'toefl-toasts';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('role', 'status');
      document.body.appendChild(region);
    }
    var el = document.createElement('div');
    el.className = 'toefl-toast' + (kind ? ' toefl-toast-' + kind : '');
    el.textContent = message;
    region.appendChild(el);
    // Animate in next frame
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 400);
    }, 4200);
  }

  window.ToeflTimerUI = {
    resetWarnings: resetTimerWarnings,
    checkWarnings: checkTimerWarnings,
    formatClock: formatClock,
    showToast: showToast
  };
  // Convenience global (used across app.js)
  window.showToast = window.showToast || showToast;
})();

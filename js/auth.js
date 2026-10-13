/**
 * auth.js — Google sign-in (Supabase Auth) + sinkronisasi hasil test ke cloud.
 * Graceful: jika config belum diisi, semua fungsi no-op dan UI login disembunyikan.
 *
 * Dipakai: index.html + result.html + login.html
 */
(function () {
  "use strict";

  var sb = null;
  var ready = false;

  function isConfigured() {
    return !!(window.SUPABASE_CONFIG &&
      SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey &&
      SUPABASE_CONFIG.url.indexOf("YOUR_PROJECT") === -1);
  }

  function init() {
    if (!isConfigured()) { ready = false; return Promise.resolve(false); }
    if (!window.supabase) {
      console.warn("[auth] supabase-js CDN belum ter-load");
      return Promise.resolve(false);
    }
    if (!sb) {
      sb = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
      // Re-render user chip saat auth berubah (login/logout)
      sb.auth.onAuthStateChange(function () { paintUserChip(); });
    }
    ready = true;
    return sb.auth.getSession().then(function () { return true; });
  }

  function client() { return ready ? sb : null; }

  function getUser() {
    if (!ready) return Promise.resolve(null);
    return sb.auth.getUser().then(function (r) { return r.data.user || null; });
  }

  function signInWithGoogle(next) {
    if (!ready) return;
    sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: location.origin + "/login",
        skipBrowserRedirect: false
      }
    });
  }

  function signOut() {
    if (!ready) return Promise.resolve();
    return sb.auth.signOut().then(function () {
      paintUserChip();
      showToastSafe("Berhasil logout");
    });
  }

  /** Simpan hasil test; fallback ke local history kalau offline/belum login.
   * extraOps opsional: { elapsed_seconds }
   */
  function saveResult(mode, setName, section, L, S, R, extraOps) {
    var payload = (function () {
      var itp = null, accuracy = 0, total = L.score + S.score + R.score;
      var totalQ = L.total + S.total + R.total;
      if (totalQ) accuracy = Math.round(total / totalQ * 100);
      try {
        itp = calculateITPScore(L, S, R);
      } catch (e) { /* scoring belum load */ }

      var p = {
        mode: mode,
        set_name: setName,
        section: section,
        listening: L.score || L.total ? L : null,
        structure: S.score || S.total ? S : null,
        reading: R.score || R.total ? R : null,
        total_score: itp ? itp.totalScore : null,
        cefr: itp ? itp.level : null,
        accuracy: accuracy,
        questions_answered: total,
        questions_total: totalQ
      };
      if (extraOps && typeof extraOps.elapsed_seconds === "number") {
        p.elapsed_seconds = extraOps.elapsed_seconds;
      }
      return p;
    })();

    return getUser().then(function (user) {
      if (!user) return { saved: false, reason: "not-logged-in" };
      return sb.from("test_results").insert(Object.assign({ user_id: user.id }, payload))
        .then(function (res) {
          if (res.error) { console.warn("[auth] save gagal:", res.error.message); return { saved: false, reason: res.error.message }; }
          return { saved: true };
        });
    });
  }

  /** Ambil riwayat test user (gabung cloud kalau login, lokal selalu). */
  function fetchHistory(limit) {
    limit = limit || 20;
    return getUser().then(function (user) {
      if (!user) return [];
      return sb.from("test_results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit)
        .then(function (res) {
          if (res.error) { console.warn("[auth] history gagal:", res.error.message); return []; }
          return res.data || [];
        });
    });
  }

  /** Update nama tampilan user di tabel profiles + auth metadata. */
  function updateProfileName(fullName) {
    if (!ready) return Promise.resolve({ ok: false, reason: "not-configured" });
    return getUser().then(function (user) {
      if (!user) return { ok: false, reason: "not-logged-in" };
      var trimmed = String(fullName || "").trim().slice(0, 60);
      if (trimmed.length < 2) return { ok: false, reason: "too-short" };
      return sb.from("profiles").upsert({ id: user.id, full_name: trimmed })
        .then(function (res) {
          if (res.error) return { ok: false, reason: res.error.message };
          return sb.auth.updateUser({ data: { full_name: trimmed } }).then(function () {
            paintUserChip();
            return { ok: true, name: trimmed };
          });
        });
    });
  }

  /** Ambil leaderboard per periode: 'daily' | 'weekly' | 'monthly' (default).
   *  'monthly' memakai view leaderboard_monthly (menggantikan leaderboard_30d). */
  function fetchLeaderboard(limit, period) {
    limit = limit || 20;
    period = period || "monthly";
    if (!ready) return Promise.resolve([]);
    var viewName = "leaderboard_" + period;
    return sb.from(viewName)
      .select("player_name, avatar_url, best_score, attempts, last_attempt")
      .order("best_score", { ascending: false })
      .limit(limit)
      .then(function (res) {
        if (res.error) { console.warn("[auth] leaderboard " + period + " gagal:", res.error.message); return []; }
        return res.data || [];
      });
  }

  /* ── UI helpers ── */
  function paintUserChip() {
    var mount = document.getElementById("nav-user-slot");
    if (!mount) return;
    getUser().then(function (user) {
      if (!ready) { mount.innerHTML = ""; return; }
      if (!user) {
        mount.innerHTML =
          '<a class="btn btn-soft btn-sm" href="/login" style="min-height:38px">' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' +
          "Masuk</a>";
        return;
      }
      var meta = user.user_metadata || {};
      var name = (meta.full_name || meta.name || "User").split(" ")[0];
      var avatar = meta.avatar_url || "";
      mount.innerHTML =
        '<div class="user-chip-wrap">' +
          '<button class="user-chip" id="user-chip-btn" aria-haspopup="true">' +
            (avatar ? '<img src="' + escapeAttr(avatar) + '" alt="" referrerpolicy="no-referrer">' :
              '<span class="user-chip-initial">' + escapeAttr(name.charAt(0).toUpperCase()) + "</span>") +
            '<span class="user-chip-name">' + escapeHtml(name) + "</span>" +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
          "</button>" +
          '<div class="user-menu" id="user-menu" hidden>' +
            '<a href="#history-wrap" id="menu-history">Riwayat skor</a>' +
            '<a href="/login" id="menu-relogin">Akun</a>' +
            '<button id="menu-logout">Keluar</button>' +
          "</div>" +
        "</div>";
      var btn = document.getElementById("user-chip-btn");
      var menu = document.getElementById("user-menu");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        menu.hidden = !menu.hidden;
      });
      document.getElementById("menu-logout").addEventListener("click", signOut);
      document.addEventListener("click", function closeMenu(e) {
        if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) menu.hidden = true;
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

  function showToastSafe(msg) {
    if (window.ToeflTimerUI && ToeflTimerUI.showToast) ToeflTimerUI.showToast(msg);
  }

  /** Batasi aksi hanya ke user login. Return Promise<boolean> boleh lanjut; kalau tidak, redirect ke login. */
  function requireAuth(trigger) {
    if (!ready) return Promise.resolve(true); // config kosong → izinkan guest
    return getUser().then(function (user) {
      if (user) return true;
      var next = encodeURIComponent(trigger || "start-test");
      location.href = "/login?next=" + next;
      return false;
    });
  }

  window.ToeflAuth = {
    isConfigured: isConfigured,
    init: init,
    ready: function () { return ready; },
    getUser: getUser,
    requireAuth: requireAuth,
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    saveResult: saveResult,
    fetchHistory: fetchHistory,
    updateProfileName: updateProfileName,
    fetchLeaderboard: fetchLeaderboard,
    paintUserChip: paintUserChip
  };

  document.addEventListener("DOMContentLoaded", function () {
    init().then(paintUserChip);
  });
})();

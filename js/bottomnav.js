/**
 * bottomnav.js — shared topbar diskrit + bottom navigation mobile + PWA install.
 * Mount: #topbar-mount (nav desktop, optional) dan #bottomnav-mount (mobile).
 * Active page ditandai otomatis dari pathname.
 */
(function () {
  "use strict";

  var path = location.pathname.split("/").pop() || "index";

  var LINKS = [
    { href: "/",            label: "Beranda",  id: "index",
      icon: '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>' },
    { href: "/panduan",      label: "Artikel",  id: "panduan",
      icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
    { href: "/leaderboard", label: "Peringkat", id: "leaderboard",
      icon: '<path d="M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 2 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.5-2 4-4 4"/>' },
    { href: "/account",     label: "Akun",     id: "account",
      icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/>' }
  ];

  function buildBottomNav() {
    var mount = document.getElementById("bottomnav-mount");
    if (!mount) return;
    var items = LINKS.map(function (l) {
      var active = path === l.id || (path === "" && l.id === "index");
      return '<a href="' + l.href + '" class="bn-item' + (active ? " active" : "") + '"' +
        (active ? ' aria-current="page"' : "") + ">" +
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + l.icon + "</svg>" +
        "<span>" + l.label + "</span></a>";
    }).join("");
    mount.innerHTML = '<nav class="bottom-nav" aria-label="Navigasi utama">' + items + "</nav>";
  }

  /* ── PWA: daftarkan service worker + tombol install saat tersedia ── */
  var deferredPrompt = null;

  function registerSW() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () { /* offline dev */ });
    }
  }

  function bindInstallPrompt() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner();
    });
    window.addEventListener("appinstalled", function () {
      deferredPrompt = null;
      hideInstallBanner();
    });
  }

  function showInstallBanner() {
    if (document.getElementById("pwa-install-banner")) return;
    if (localStorage.getItem("pwa.install.dismissed")) return;
    var b = document.createElement("div");
    b.id = "pwa-install-banner";
    b.innerHTML =
      '<div class="pwa-banner">' +
        '<span class="pwa-icon"><img src="assets/logo-64.png" alt="Logo TOEFL Yuk" width="42" height="42" /></span>' +
        '<div class="pwa-text"><strong>Install TOEFL Yuk</strong>' +
        '<span>Latihan offline, akses dari home screen</span></div>' +
        '<button class="btn btn-primary btn-sm" id="pwa-install-btn">Install</button>' +
        '<button class="pwa-close" id="pwa-close" aria-label="Tutup">×</button>' +
      "</div>";
    document.body.appendChild(b);
    document.getElementById("pwa-install-btn").addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (r) {
        if (r.outcome === "dismissed") localStorage.setItem("pwa.install.dismissed", "1");
        deferredPrompt = null;
        hideInstallBanner();
      });
    });
    document.getElementById("pwa-close").addEventListener("click", function () {
      localStorage.setItem("pwa.install.dismissed", "1");
      hideInstallBanner();
    });
  }

  function hideInstallBanner() {
    var b = document.getElementById("pwa-install-banner");
    if (b) b.remove();
  }

  /* ── Hamburger menu (mobile) ── */
  function bindHamburger() {
    var btn = document.getElementById("hamburger-btn");
    var sheet = document.getElementById("mobile-menu");
    var overlay = document.getElementById("mm-overlay");
    var closeBtn = document.getElementById("mm-close");
    if (!btn || !sheet || !overlay) return;

    var openIcon = btn.querySelector(".hb-open");
    var closeIcon = btn.querySelector(".hb-close");

    function openMenu() {
      sheet.hidden = false;
      overlay.hidden = false;
      // reflow agar transisi jalan
      sheet.getBoundingClientRect();
      sheet.classList.add("open");
      overlay.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      if (openIcon) openIcon.style.display = "none";
      if (closeIcon) closeIcon.style.display = "block";
      document.body.style.overflow = "hidden";
    }
    function closeMenu() {
      sheet.classList.remove("open");
      overlay.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      if (openIcon) openIcon.style.display = "block";
      if (closeIcon) closeIcon.style.display = "none";
      document.body.style.overflow = "";
      setTimeout(function () {
        if (!sheet.classList.contains("open")) { sheet.hidden = true; overlay.hidden = true; }
      }, 320);
    }

    btn.addEventListener("click", function () {
      if (sheet.classList.contains("open")) closeMenu(); else openMenu();
    });
    overlay.addEventListener("click", closeMenu);
    if (closeBtn) closeBtn.addEventListener("click", closeMenu);
    // klik link di sheet → tutup
    sheet.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeMenu);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheet.classList.contains("open")) closeMenu();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildBottomNav();
    registerSW();
    bindInstallPrompt();
    bindHamburger();
  });
})();

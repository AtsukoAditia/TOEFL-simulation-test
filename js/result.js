"use strict";

(function () {
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function animateNumber(el, target, duration) {
    if (!el) return;
    var start = performance.now();
    function tick(now) {
      var p = Math.min((now - start) / duration, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(e * target);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function animateRing(percent) {
    var ring = document.getElementById("score-ring-progress");
    if (!ring) return;
    var C = 502.65; // 2 * PI * 80
    ring.style.transition = "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)";
    ring.style.strokeDashoffset = C * (1 - percent / 100);
  }

  function setBar(id, pct) {
    var el = document.getElementById(id);
    if (el) setTimeout(function () { el.style.width = pct + "%"; }, 200);
  }

  function getHistory() {
    try {
      var h = localStorage.getItem("toefl.history.v1");
      return h ? JSON.parse(h) : [];
    } catch (e) { return []; }
  }

  function init() {
    var data = null;
    try {
      var raw = localStorage.getItem("toeflResult");
      data = raw ? JSON.parse(raw) : null;
    } catch (e) {}

    if (!data) {
      data = { listening: { score: 30, total: 50 }, structure: { score: 25, total: 40 }, reading: { score: 35, total: 50 }, date: "--", setName: "Demo Result" };
    }

    var L = data.listening || { score: 0, total: 0 },
        S = data.structure || { score: 0, total: 0 },
        R = data.reading || { score: 0, total: 0 };

    var itp = calculateITPScore(L, S, R);
    var cefr = getCEFRBand(itp.totalScore);
    var scoreColor = getScoreColor(itp.totalScore);

    setText("result-date", data.date || "");
    setText("result-set", data.setName || "Full Test");

    // Total score ring
    var pct = ((itp.totalScore - 310) / (677 - 310)) * 100;
    animateNumber(document.getElementById("score-number"), itp.totalScore, 1400);
    animateRing(pct);

    // CEFR badge
    var badge = document.getElementById("cefr-level");
    if (badge) { badge.textContent = cefr.level; badge.style.background = cefr.color; badge.style.color = "#fff"; }
    setText("cefr-label", cefr.label);

    // Map score number to CEFR label for hero text
    var heroDesc = document.getElementById("cefr-label");
    if (heroDesc && !heroDesc.dataset.custom) {
      heroDesc.innerHTML = "Level kamu: <b>" + cefr.level + " — " + cefr.label + "</b>. " +
        "Skor " + itp.totalScore + " dari 677. " +
        (itp.totalScore >= 627 ? "Excellent! Kamu siap menghadapi tes TOEFL asli." :
         itp.totalScore >= 543 ? "Bagus. Tinggal poles beberapa bagian lagi." :
         itp.totalScore >= 460 ? "Cukup. Fokus naikkan section terlemah." :
         "Jangan menyerah — latihan rutin akan menaikkan skor.");
    }

    // Sections
    var lp = L.total ? L.score / L.total * 100 : 0;
    var sp = S.total ? S.score / S.total * 100 : 0;
    var rp = R.total ? R.score / R.total * 100 : 0;

    setText("s-listening-scaled", itp.listeningScale);
    setText("s-listening-raw", L.score + " / " + L.total);
    setBar("bar-listening", lp);

    setText("s-structure-scaled", itp.structureScale);
    setText("s-structure-raw", S.score + " / " + S.total);
    setBar("bar-structure", sp);

    setText("s-reading-scaled", itp.readingScale);
    setText("s-reading-raw", R.score + " / " + R.total);
    setBar("bar-reading", rp);

    function detailChips(elId, sec) {
      var el = document.getElementById(elId);
      if (!el || !sec || !sec.total) return;
      var wrong = sec.wrong != null ? sec.wrong : Math.max(0, (sec.answered != null ? sec.answered : sec.total) - sec.score);
      var skipped = sec.skipped != null ? sec.skipped : (sec.answered != null ? sec.total - sec.answered : 0);
      el.innerHTML =
        '<span class="sec-chip c">✓ ' + sec.score + ' benar</span>' +
        '<span class="sec-chip w">✗ ' + wrong + ' salah</span>' +
        (skipped ? '<span class="sec-chip s">○ ' + skipped + ' kosong</span>' : '');
    }
    detailChips("d-listening", L);
    detailChips("d-structure", S);
    detailChips("d-reading", R);

    var totalCorrect = L.score + S.score + R.score;
    var totalQ = L.total + S.total + R.total;
    var accuracy = totalQ ? Math.round(totalCorrect / totalQ * 100) : 0;

    setText("stat-correct", totalCorrect);
    animateNumber(document.getElementById("accuracy-value"), accuracy, 1200);

    // CEFR scale highlight
    var segments = document.querySelectorAll(".cefr-segment");
    var levelMap = { "A1": 0, "A2": 0, "B1": 1, "B2": 2, "C1": 3 };
    var activeIdx = levelMap[cefr.level] || 0;
    // A1 is not shown; A2 is segment 0
    if (cefr.level === "A1") activeIdx = 0;
    segments.forEach(function (seg, i) {
      seg.classList.toggle("active", i === activeIdx);
    });

    // Benchmark institusi Indonesia
    (function renderBenchmarks() {
      var list = document.getElementById("bench-list");
      if (!list) return;
      var targets = [
        { name: "S1 / SMA / Masuk kerja umum", desc: "Level entry", target: 450 },
        { name: "LPDP S2 dalam negeri", desc: "Beasiswa magister", target: 500 },
        { name: "LPDP S3 / S2 luar negeri", desc: "Beasiswa doktoral / S2 LN", target: 530 },
        { name: "CPNS dengan syarat bahasa", desc: "Formasi tertentu", target: 475 },
        { name: "BUMN tingkat officer", desc: "Rekrutmen bersama", target: 450 },
        { name: "Tokoh level (SI tersertifikasi internasional)", desc: "Benchmark maksimal latihan", target: 600 }
      ];
      list.innerHTML = targets.map(function (t) {
        var pass = itp.totalScore >= t.target;
        var delta = t.target - itp.totalScore;
        return '<div class="bench-row' + (pass ? ' passed' : '') + '">' +
          '<div class="bench-info"><div class="bench-name">' + t.name + '</div>' +
          '<div class="bench-desc">' + t.desc + '</div></div>' +
          '<span class="bench-target">' + t.target + '+</span>' +
          '<span class="bench-status ' + (pass ? 'ok' : 'miss') + '">' +
          (pass ? '✓ Tercapai' : '▲ +' + delta) + '</span></div>';
      }).join("");
    })();

    // Previous comparison
    var hist = getHistory();
    var comp = document.getElementById("prev-comparison");
    if (comp && hist.length > 1) {
      var prev = null, cur = hist[hist.length - 1];
      for (var i = hist.length - 2; i >= 0; i--) {
        if (hist[i].setName === cur.setName) { prev = hist[i]; break; }
      }
      if (!prev) prev = hist[hist.length - 2];
      if (prev && prev.setName === cur.setName && prev.savedAt === cur.savedAt && hist.length > 2) {
        prev = hist[hist.length - 3];
      }
      if (prev) {
        var pL = prev.listening || { score: 0, total: 0 },
            pS = prev.structure || { score: 0, total: 0 },
            pR = prev.reading || { score: 0, total: 0 };
        var pItp = calculateITPScore(pL, pS, pR);
        var delta = itp.totalScore - pItp.totalScore;
        comp.innerHTML = "Attempt sebelumnya: <b>" + pItp.totalScore + "</b> (" + (prev.date || "") + ") — " +
          (delta > 0 ? "<span class='delta-up'>▲ +" + delta + " poin</span>" :
           delta < 0 ? "<span class='delta-down'>▼ " + delta + " poin</span>" :
           "<span style='color:var(--text-faint)'>Tidak berubah</span>");
        comp.style.display = "block";
      }
    }
  }

  function saveImage() {
    var card = document.getElementById("result-card");
    if (!card) return;
    if (typeof html2canvas === "undefined") {
      alert("Pustaka export tidak tersedia. Coba lagi saat online.");
      return;
    }
    html2canvas(card, { backgroundColor: null, scale: 2, useCORS: true, logging: false }).then(function (canvas) {
      var link = document.createElement("a");
      link.download = "TOEFL-Score-" + Date.now() + ".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    });
  }

  function attach(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }

  attach("btn-save-image", saveImage);
  attach("btn-try-again", function () { window.location.href = "index.html"; });
  attach("btn-home", function () { window.location.href = "index.html"; });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else { init(); }
})();

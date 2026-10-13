/**
 * result.js - TOEFL Simulation Test Result Page Logic
 * Reads result data from localStorage and renders the result card.
 * DOM IDs matched to result.html structure.
 */
(function () {
  'use strict';

  // ---- HELPERS ----
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHtml(id, value) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  function animateCounter(el, target, duration) {
    if (!el) return;
    var start = performance.now();
    function tick(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function animateRing(ringEl, percent) {
    if (!ringEl) return;
    var circumference = 2 * Math.PI * 80; // r=80 in result.html SVG
    ringEl.style.strokeDasharray = circumference;
    ringEl.style.strokeDashoffset = circumference;
    setTimeout(function () {
      ringEl.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
      ringEl.style.strokeDashoffset = circumference * (1 - percent / 100);
    }, 100);
  }

  function setBar(id, pct, color) {
    var el = document.getElementById(id);
    if (!el) return;
    el.style.transition = 'width 1s ease';
    setTimeout(function () {
      el.style.width = pct + '%';
      if (color) el.style.background = color;
    }, 200);
  }

  // ---- RENDER ----
  function renderResult(data) {
    var listening = data.listening || { score: 0, total: 0 };
    var structure = data.structure || { score: 0, total: 0 };
    var reading = data.reading || { score: 0, total: 0 };
    var date = data.date || new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    var setName = data.setName || 'Full Test';

    // Calculate scores using scoring.js globals
    var itp = (typeof calculateITPScore === 'function')
      ? calculateITPScore(listening, structure, reading)
      : { totalScore: 0, listeningScale: 0, structureScale: 0, readingScale: 0 };

    var cefr = (typeof getCEFRBand === 'function')
      ? getCEFRBand(itp.totalScore)
      : { level: 'A2', label: 'Elementary', color: '#f59e0b' };

    var scoreColor = (typeof getScoreColor === 'function')
      ? getScoreColor(itp.totalScore)
      : '#3b82f6';

    var totalCorrect = listening.score + structure.score + reading.score;
    var totalQ = listening.total + structure.total + reading.total;
    var accuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

    // ---- Header ----
    setText('result-date', date);
    setText('result-set', setName);

    // ---- Score ring ----
    var scoreEl = document.getElementById('score-number');
    var ringEl = document.getElementById('score-ring-progress');
    if (scoreEl) animateCounter(scoreEl, itp.totalScore, 1600);
    if (ringEl) {
      ringEl.style.stroke = scoreColor;
      var pctRing = Math.min(100, Math.round(((itp.totalScore - 310) / (677 - 310)) * 100));
      animateRing(ringEl, pctRing);
    }

    // ---- CEFR badge ----
    var cefrEl = document.getElementById('cefr-level');
    var cefrLabel = document.getElementById('cefr-label');
    if (cefrEl) {
      cefrEl.textContent = cefr.level;
      cefrEl.style.background = cefr.color || scoreColor;
    }
    if (cefrLabel) cefrLabel.textContent = cefr.label;

    // ---- Section: Listening ----
    var lPct = listening.total > 0 ? Math.round((listening.score / listening.total) * 100) : 0;
    var lBarColor = lPct >= 70 ? '#10b981' : lPct >= 50 ? '#3b82f6' : '#ef4444';
    setText('s-listening-scaled', itp.listeningScale);
    setText('s-listening-raw', listening.score + ' / ' + listening.total);
    setBar('bar-listening', lPct, lBarColor);

    // ---- Section: Structure ----
    var sPct = structure.total > 0 ? Math.round((structure.score / structure.total) * 100) : 0;
    var sBarColor = sPct >= 70 ? '#10b981' : sPct >= 50 ? '#3b82f6' : '#ef4444';
    setText('s-structure-scaled', itp.structureScale);
    setText('s-structure-raw', structure.score + ' / ' + structure.total);
    setBar('bar-structure', sPct, sBarColor);

    // ---- Section: Reading ----
    var rPct = reading.total > 0 ? Math.round((reading.score / reading.total) * 100) : 0;
    var rBarColor = rPct >= 70 ? '#10b981' : rPct >= 50 ? '#3b82f6' : '#ef4444';
    setText('s-reading-scaled', itp.readingScale);
    setText('s-reading-raw', reading.score + ' / ' + reading.total);
    setBar('bar-reading', rPct, rBarColor);

    // ---- Stats row ----
    setText('stat-correct', totalCorrect);
    var accEl = document.getElementById('accuracy-value');
    if (accEl) animateCounter(accEl, accuracy, 1400);
    setText('result-set', setName);

    // ---- CEFR indicator position ----
    // Segments: A2=310-432, B1=433-542, B2=543-619, C1=620-677
    var cefrIndicator = document.getElementById('cefr-indicator');
    if (cefrIndicator) {
      var cefrBar = cefrIndicator.parentElement;
      var segments = document.querySelectorAll('.cefr-segment');
      var totalSegments = segments.length;
      var activeIdx = 0;
      var levelMap = { 'A2': 0, 'B1': 1, 'B2': 2, 'C1': 3, 'C2': 4 };
      activeIdx = levelMap[cefr.level] || 0;
      // Position indicator in center of active segment
      var segWidth = 100 / totalSegments;
      var pctPos = (activeIdx * segWidth) + (segWidth / 2);
      cefrIndicator.style.left = pctPos + '%';
      cefrIndicator.style.transform = 'translateX(-50%)';
      // Highlight active segment
      segments.forEach(function (seg, idx) {
        seg.classList.toggle('active', idx === activeIdx);
      });
    }
  }

  // ---- SAVE AS IMAGE ----
  function saveAsImage() {
    var card = document.getElementById('result-card');
    if (!card) return;
    var overlay = document.getElementById('saving-overlay');
    if (overlay) overlay.style.display = 'flex';
    if (typeof html2canvas === 'undefined') {
      alert('html2canvas tidak tersedia. Pastikan koneksi internet aktif.');
      if (overlay) overlay.style.display = 'none';
      return;
    }
    html2canvas(card, {
      backgroundColor: '#0d1b3e',
      scale: 2,
      useCORS: true,
      logging: false
    }).then(function (canvas) {
      var link = document.createElement('a');
      link.download = 'TOEFL-Score-' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).finally(function () {
      if (overlay) overlay.style.display = 'none';
    });
  }

  // ---- INIT ----
  function init() {
    // Load from localStorage
    var data = null;
    try {
      var raw = localStorage.getItem('toeflResult');
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to read toeflResult from localStorage', e);
    }

    // Fallback demo data if no real data
    if (!data) {
      data = {
        listening:  { score: 30, total: 50 },
        structure:  { score: 25, total: 40 },
        reading:    { score: 35, total: 50 },
        date: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
        setName: 'Demo Result'
      };
    }

    renderResult(data);

    // Buttons
    var saveBtn = document.getElementById('btn-save-image');
    if (saveBtn) saveBtn.addEventListener('click', saveAsImage);

    var tryBtn = document.getElementById('btn-try-again');
    if (tryBtn) tryBtn.addEventListener('click', function () {
      window.location.href = 'index.html';
    });

    var homeBtn = document.getElementById('btn-home');
    if (homeBtn) homeBtn.addEventListener('click', function () {
      window.location.href = 'index.html';
    });

    var shareBtn = document.getElementById('btn-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(window.location.href).then(function () {
          shareBtn.textContent = 'Link Disalin!';
          setTimeout(function () { shareBtn.textContent = 'Bagikan'; }, 2000);
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

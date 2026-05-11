/**
 * result.js - TOEFL Simulation Test Result Page Logic
 * Reads result data from sessionStorage and renders the result card.
 * Also handles Save as Image feature via html2canvas.
 */

(function () {
  'use strict';

// ---- SCORING: delegated to js/scoring.js ----
  // Functions available globally: calculateITPScore(), getCEFRBand(), getScoreColor(), rawToScaled()

  // ---- DOM RENDERING ----

  function animateCounter(el, target, duration) {
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function animateRing(ringEl, percent) {
    const circumference = 2 * Math.PI * 54; // r=54
    ringEl.style.strokeDasharray = circumference;
    ringEl.style.strokeDashoffset = circumference;
    setTimeout(() => {
      ringEl.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
      ringEl.style.strokeDashoffset = circumference * (1 - percent / 100);
    }, 100);
  }

  function renderResult(data) {
    const { listening, structure, reading, date, setName } = data;
    const itp = calculateITPScore(listening, structure, reading);
    const cefr = getCEFRBand(itp.totalScore);
    const totalCorrect = listening.score + structure.score + reading.score;
    const totalQ = listening.total + structure.total + reading.total;
    const accuracy = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
    const scoreColor = getScoreColor(itp.totalScore);

    // Header meta
    const metaDate = document.getElementById('result-date');
    const metaSet = document.getElementById('result-set');
    if (metaDate) metaDate.textContent = date || new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    if (metaSet) metaSet.textContent = setName || 'Full Test';

    // Score ring
    const scoreEl = document.getElementById('score-number');
    const ringEl = document.getElementById('score-ring-progress');
    const scoreColorEl = document.getElementById('score-color-accent');
    if (scoreEl) animateCounter(scoreEl, itp.totalScore, 1600);
    if (ringEl) {
      ringEl.style.stroke = scoreColor;
      animateRing(ringEl, Math.min(100, Math.round(((itp.totalScore - 310) / (677 - 310)) * 100)));
    }
    if (scoreColorEl) scoreColorEl.style.setProperty('--accent', scoreColor);

    // CEFR badge
    const cefrEl = document.getElementById('cefr-level');
    const cefrLabel = document.getElementById('cefr-label');
    if (cefrEl) { cefrEl.textContent = cefr.level; cefrEl.style.background = cefr.color; }
    if (cefrLabel) cefrLabel.textContent = cefr.label;

    // Accuracy
    const accEl = document.getElementById('accuracy-value');
    if (accEl) animateCounter(accEl, accuracy, 1400);

    // Section breakdown
    const sections = [
      { id: 'listening', label: 'Listening Comprehension', score: listening.score, total: listening.total, scale: itp.listeningScale, min: 31, max: 68 },
      { id: 'structure', label: 'Structure & Written Expression', score: structure.score, total: structure.total, scale: itp.structureScale, min: 31, max: 68 },
      { id: 'reading', label: 'Reading Comprehension', score: reading.score, total: reading.total, scale: itp.readingScale, min: 31, max: 67 },
    ];

    const breakdownEl = document.getElementById('section-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = sections.map(s => {
        const pct = s.total > 0 ? Math.round((s.score / s.total) * 100) : 0;
        const scalePct = Math.round(((s.scale - s.min) / (s.max - s.min)) * 100);
        const barColor = pct >= 70 ? '#10b981' : pct >= 50 ? '#3b82f6' : '#ef4444';
        return `
          <div class="section-row">
            <div class="section-info">
              <span class="section-name">${s.label}</span>
              <span class="section-stats">${s.score}/${s.total} benar &bull; Scaled: ${s.scale}</span>
            </div>
            <div class="section-bar-wrap">
              <div class="section-bar" style="width:${pct}%; background:${barColor};"></div>
            </div>
            <span class="section-pct">${pct}%</span>
          </div>`;
      }).join('');
    }

    // Stats row
    const statsEl = document.getElementById('stats-row');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-item"><div class="stat-value">${totalCorrect}</div><div class="stat-label">Jawaban Benar</div></div>
        <div class="stat-item"><div class="stat-value">${totalQ - totalCorrect}</div><div class="stat-label">Jawaban Salah</div></div>
        <div class="stat-item"><div class="stat-value">${totalQ}</div><div class="stat-label">Total Soal</div></div>
        <div class="stat-item"><div class="stat-value">${accuracy}%</div><div class="stat-label">Akurasi</div></div>
      `;
    }

    // CEFR scale bar highlight
    const cefrItems = document.querySelectorAll('.cefr-item');
    cefrItems.forEach(item => {
      if (item.dataset.level === cefr.level) {
        item.classList.add('active');
      }
    });
  }

  // ---- SAVE AS IMAGE ----

  function saveAsImage() {
    const card = document.getElementById('result-card');
    if (!card) return;

    // Show overlay
    const overlay = document.getElementById('saving-overlay');
    if (overlay) overlay.style.display = 'flex';

    // Use html2canvas
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
    }).then(canvas => {
      const link = document.createElement('a');
      link.download = 'TOEFL-Score-' + Date.now() + '.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    }).finally(() => {
      if (overlay) overlay.style.display = 'none';
    });
  }

  // ---- INIT ----

  function init() {
    // Load result data from sessionStorage
    let data = null;
    try {
      const raw = sessionStorage.getItem('toeflResult');
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse toeflResult from sessionStorage', e);
    }

    // Fallback demo data for direct access
    if (!data) {
      data = {
        listening: { score: 30, total: 50 },
        structure: { score: 25, total: 40 },
        reading: { score: 35, total: 50 },
        date: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
        setName: 'Demo Result'
      };
    }

    renderResult(data);

    // Button: Save as image
    const saveBtn = document.getElementById('btn-save-image');
    if (saveBtn) saveBtn.addEventListener('click', saveAsImage);

    // Button: Try again
    const tryBtn = document.getElementById('btn-try-again');
    if (tryBtn) tryBtn.addEventListener('click', () => { window.location.href = 'index.html'; });

    // Button: Share (copy URL)
    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          shareBtn.textContent = 'Link Disalin!';
          setTimeout(() => { shareBtn.textContent = 'Bagikan'; }, 2000);
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

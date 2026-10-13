/**
 * app.js — TOEFL Simulator (v3 redesign)
 * One-question-per-screen test engine + landing interactions.
 * Supports: single section practice, full test (L→S→R), palette nav,
 * flag, review-before-submit, post-submit review with explanations,
 * score history, TTS listening player with canvas visual.
 */
(function () {
  "use strict";

  /* ══════════ STATE ══════════ */
  var STATE = {
    mode: null,            // "section" | "fulltest"
    section: null,         // current section name
    set: null,             // selected set object
    data: null,            // current section data (arrays normalized)
    flat: [],              // [{qid, q, ref}...] flattened questions
    answers: {},           // qid -> choiceIndex
    flagged: {},           // qid -> true
    pos: 0,                // current flat index
    reviewed: false,       // explanations shown (post submit or wrong-only)
    full: { index: 0, results: {}, sections: ["listening", "structure", "reading"] }
  };

  var TIMER = { id: null, remaining: 0 };
  var manifest = null;
  var AUDIO = { playingId: null, state: "idle", raf: null, startedAt: 0, estDur: 0 };

  var SECTION_META = {
    listening: { title: "Listening Comprehension", short: "Listening" },
    structure: { title: "Structure & Written Expression", short: "Structure" },
    reading: { title: "Reading Comprehension", short: "Reading" }
  };

  /* ══════════ UTIL ══════════ */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function shuffle(arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtTime(s) { return pad2(Math.floor(Math.max(0, s) / 60)) + ":" + pad2(Math.max(0, s) % 60); }

  function shuffleChoices(q) {
    var pairs = q.choices.map(function (c, i) { return { c: c, orig: i }; });
    pairs = shuffle(pairs);
    return {
      id: q.id, question: q.question, explanation: q.explanation, type: q.type || null,
      choices: pairs.map(function (p) { return p.c; }),
      answer: pairs.findIndex(function (p) { return p.orig === q.answer; })
    };
  }

  /* ══════════ DATA ══════════ */
  function loadManifest() {
    if (manifest) return Promise.resolve(manifest);
    return fetch("data/manifest.json").then(function (r) { return r.json(); }).then(function (m) { manifest = m; return m; });
  }
  function activeSets() { return manifest ? manifest.sets.filter(function (s) { return s.status === "active"; }) : []; }
  function getSet(setId) { return activeSets().filter(function (s) { return s.id === setId; })[0]; }
  function fetchJSON(p) { return fetch(p).then(function (r) { return r.json(); }); }

  function sectionTotals(set, section) {
    // rough totals for pills on landing; we don't fetch all, we fetch on demand
    var map = {
      "set-1": { listening: 10, structure: 10, reading: 10 },
      "set-2": { listening: 20, structure: 20, reading: 20 },
      "set-3": { listening: 30, structure: 30, reading: 30 },
      "set-4": { listening: 20, structure: 25, reading: 20 },
      "set-5": { listening: 20, structure: 15, reading: 15 },
      "set-6": { listening: 50, structure: 40, reading: 50 }
    };
    var m = map[set.id];
    return m ? m[section] : null;
  }

  /* ══════════ FLATTEN ══════════ */
  // Normalize section data to a flat question list:
  // [{ id, question, choices, answer, explanation, audio, passage, partLabel, audioTitle }]
  function flatten(section, data) {
    var out = [];
    if (section === "listening") {
      data.items.forEach(function (item, idx) {
        item.questions.forEach(function (q, qi) {
          out.push({
            id: q.id, question: q.question, choices: q.choices, answer: q.answer,
            explanation: q.explanation, type: q.type || null,
            audio: item.ttsText, audioTitle: "Audio " + (idx + 1) + " — " + item.title,
            audioType: item.type,
            partLabel: "Audio " + (idx + 1) + " · Q" + (qi + 1)
          });
        });
      });
    } else if (section === "structure") {
      data.items.forEach(function (q, i) {
        out.push({
          id: q.id, question: q.question, choices: q.choices, answer: q.answer,
          explanation: q.explanation, type: q.type || null,
          partLabel: (q.type === "error-identification" ? "Error Identification" : "Sentence Completion") + " · Q" + (i + 1)
        });
      });
    } else if (section === "reading") {
      data.passages.forEach(function (p, pi) {
        p.questions.forEach(function (q, qi) {
          out.push({
            id: q.id, question: q.question, choices: q.choices, answer: q.answer,
            explanation: q.explanation, type: q.type || null,
            passage: p.passage, passageTitle: "Passage " + (pi + 1) + (p.title ? " — " + p.title : ""),
            partLabel: "Passage " + (pi + 1) + " · Q" + (qi + 1)
          });
        });
      });
    }
    return out;
  }

  /* ══════════ THEME ══════════ */
  function initTheme() {
    var saved = ToeflStore.get("theme", "dark");
    setTheme(saved);
    var btn = $("theme-toggle-btn");
    if (btn) btn.addEventListener("click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    ToeflStore.set("theme", t);
    var moon = $("ic-moon"), sun = $("ic-sun");
    if (moon && sun) {
      moon.style.display = t === "dark" ? "" : "none";
      sun.style.display = t === "dark" ? "none" : "";
    }
  }

  /* ══════════ LANDING ══════════ */
  var heroAnimated = false;
  function animateHeroCard() {
    if (heroAnimated) return;
    heroAnimated = true;
    var target = { score: 558, l: 62, s: 55, r: 58, lvl: "B2 · Upper-Intermediate" };
    var num = $("hc-score-num"), ring = $("hc-ring-fill");
    var start = performance.now();
    var dur = 1400;
    function tick(now) {
      var p = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - p, 3);
      if (num) num.textContent = Math.round(e * target.score);
      if (ring) ring.style.strokeDashoffset = 314.16 * (1 - e * ((target.score - 310) / (677 - 310)));
      if (p < 1) requestAnimationFrame(tick);
      else setTimeout(function () {
        if ($("hc-bar-l")) $("hc-bar-l").style.width = (target.l / 68 * 100) + "%";
        if ($("hc-bar-s")) $("hc-bar-s").style.width = (target.s / 68 * 100) + "%";
        if ($("hc-bar-r")) $("hc-bar-r").style.width = (target.r / 67 * 100) + "%";
        if ($("hc-num-l")) $("hc-num-l").textContent = target.l;
        if ($("hc-num-s")) $("hc-num-s").textContent = target.s;
        if ($("hc-num-r")) $("hc-num-r").textContent = target.r;
      }, 100);
    }
    requestAnimationFrame(tick);
  }

  function countUp(elm, target, dur) {
    var start = performance.now();
    function tick(now) {
      var p = Math.min((now - start) / (dur || 1200), 1);
      var e = 1 - Math.pow(1 - p, 3);
      elm.textContent = Math.round(e * target) + (elm.dataset.suffix || "");
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function initReveal() {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          if (en.target.classList.contains("hero-card")) animateHeroCard();
          en.target.querySelectorAll("[data-count]").forEach(function (n) {
            if (!n.dataset.done) { n.dataset.done = "1"; countUp(n, Number(n.dataset.count)); }
          });
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (n) { io.observe(n); });
  }

  function renderSetsGrid() {
    var grid = $("sets-grid");
    if (!grid) return;
    var regular = activeSets().filter(function (s) { return s.type !== "mixed"; });
    var mixed = activeSets().filter(function (s) { return s.type === "mixed"; })[0];

    grid.innerHTML = "";
    regular.forEach(function (s, i) {
      var parts = (s.description || "").match(/(\d+)\s+(Listening|Structure|Reading)/gi) || [];
      var pills = ["L", "S", "R"].map(function (k, ki) {
        var sec = ki === 0 ? "listening" : ki === 1 ? "structure" : "reading";
        var n = sectionTotals(s, sec);
        return '<span class="set-pill">' + (n ? n + " " : "") + { L: "Listening", S: "Structure", R: "Reading" }[k] + "</span>";
      }).join("");
      var card = el("div", "set-card reveal in");
      card.innerHTML =
        '<span class="set-no">' + (i + 1) + "</span>" +
        "<h4>" + esc(s.title) + "</h4>" +
        "<p>" + esc(s.description || "").replace(/with .*$/i, "") + "</p>" +
        '<div class="set-pills">' + pills + "</div>" +
        '<div class="set-actions">' +
        '<button class="btn btn-soft btn-sm" data-sec="listening">Listening</button>' +
        '<button class="btn btn-soft btn-sm" data-sec="structure">Structure</button>' +
        '<button class="btn btn-soft btn-sm" data-sec="reading">Reading</button>' +
        '<button class="btn btn-primary btn-sm" data-sec="fulltest">Full Test</button>' +
        "</div>";
      card.querySelectorAll("[data-sec]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (btn.dataset.sec === "fulltest") startFullTestWith(s.id);
          else startSectionWith(btn.dataset.sec, s.id);
        });
      });
      grid.appendChild(card);
    });

    if (mixed) {
      var mc = el("div", "set-card reveal in");
      mc.style.borderColor = "rgba(246,185,59,0.4)";
      mc.innerHTML =
        '<span class="set-no" style="color:rgba(246,185,59,0.3)">∞</span>' +
        "<h4>" + esc(mixed.title) + "</h4>" +
        "<p>" + esc(mixed.description || "") + "</p>" +
        '<div class="set-pills"><span class="set-pill">50 L</span><span class="set-pill">40 S</span><span class="set-pill">50 R</span><span class="set-pill" style="border-color:rgba(246,185,59,0.4);color:var(--accent)">Randomized</span></div>' +
        '<div class="set-actions"><button class="btn btn-accent">Start Mixed Full Test</button></div>';
      mc.querySelector("button").addEventListener("click", function () { startFullTestWith(mixed.id); });
      grid.appendChild(mc);
    }
  }

  /* ══════════ HISTORY ══════════ */
  function renderHistory() {
    var wrap = $("history-wrap"), list = $("history-list");
    if (!wrap || !list || !window.ToeflStore) return;

    // Start from local history, then merge cloud if logged in
    var local = ToeflStore.get("history.v1", []);
    if (!Array.isArray(local)) local = [];

    if (window.ToeflAuth && ToeflAuth.ready) {
      ToeflAuth.getUser().then(function (user) {
        if (!user) { paintHistoryList(wrap, list, local); return; }
        ToeflAuth.fetchHistory(12).then(function (cloud) {
          // Convert cloud rows to local shape, newest first
          var cloudRows = cloud.map(function (r) {
            return {
              cloud: true,
              setName: r.set_name + (r.mode === "section" && r.section ? " · " + r.section : ""),
              date: new Date(r.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
              listening: r.listening || { score: 0, total: 0 },
              structure: r.structure || { score: 0, total: 0 },
              reading: r.reading || { score: 0, total: 0 },
              total_score: r.total_score,
              cefr: r.cefr,
              savedAt: new Date(r.created_at).getTime()
            };
          });
          // Merge: cloud rows (with explicit score) first, then local-only rows
          var merged = dedupeHistory(cloudRows.concat(local));
          paintHistoryList(wrap, list, merged);
        });
      });
      return;
    }
    paintHistoryList(wrap, list, local);
  }

  function dedupeHistory(rows) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      // Key: setName + score combo + same-minute timestamp window
      var total = (r.listening ? r.listening.score : 0) + (r.structure ? r.structure.score : 0) + (r.reading ? r.reading.score : 0);
      var bucket = Math.floor((r.savedAt || 0) / 60000);
      var key = (r.setName || "") + "|" + total + "|" + bucket;
      if (seen[key]) return;
      seen[key] = 1;
      out.push(r);
    });
    // Sort newest first
    out.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
    return out.slice(0, 6);
  }

  function paintHistoryList(wrap, list, history) {
    if (!history.length) { wrap.classList.remove("has-data"); return; }
    wrap.classList.add("has-data");
    var items = history;
    list.innerHTML = items.map(function (h, i) {
      var itp = h.total_score ? { totalScore: h.total_score } : calculateITPScore(h.listening || {}, h.structure || {}, h.reading || {});
      var next = items[i + 1];
      var nextTotal = next ? (next.total_score != null ? next.total_score : calculateITPScore(next.listening || {}, next.structure || {}, next.reading || {}).totalScore) : null;
      var delta = nextTotal != null ? itp.totalScore - nextTotal : null;
      var deltaTag = delta === null ? "" :
        delta > 0 ? '<span class="history-delta-tag up">▲ +' + delta + "</span>" :
        delta < 0 ? '<span class="history-delta-tag down">▼ ' + delta + "</span>" :
        '<span class="history-delta-tag same">± 0</span>';
      return '<div class="history-item">' +
        '<div class="history-score-big">' + itp.totalScore + "</div>" +
        '<div class="history-info"><b>' + esc(h.setName || "Full Test") + "</b><span>" + esc(h.date || "") + "</span></div>" +
        deltaTag +
        "</div>";
    }).join("");
  }

  function clearHistory() {
    if (!confirm("Hapus semua riwayat skor?")) return;
    ToeflStore.del("history.v1");
    renderHistory();
  }

  /* ══════════ TEST SHELL ══════════ */
  function enterTestShell() { document.body.classList.add("in-test"); $("palette-fab").style.display = ""; }
  function exitTestShell() {
    stopTimer(); stopAudio();
    document.body.classList.remove("in-test");
    closePaletteSheet();
    document.querySelector(".landing-root").style.display = "";
    window.scrollTo({ top: 0 });
  }

  function shellSetSection(name) {
    $("tb-crumb").innerHTML = "Section<b id='tb-section'>" + SECTION_META[name].title + "</b>";
  }
  function shellUpdateProgress() {
    var total = STATE.flat.length, answered = Object.keys(STATE.answers).length;
    $("tb-progress-fill").style.width = (total ? (answered / total * 100) : 0) + "%";
    $("tb-progressbar").setAttribute("aria-valuenow", total ? Math.round(answered / total * 100) : 0);
    $("tb-progress-lbl").textContent = answered + " / " + total + " answered";
    $("tb-qpos").textContent = "Q " + (STATE.pos + 1) + " / " + total;
    $("palette-count").textContent = answered + "/" + total;
    var btn = $("palette-submit-btn");
    btn.textContent = "Submit · " + (total - answered) + " left";
    btn.className = "btn palette-submit " + (answered >= total ? "btn-accent" : "btn-primary");
  }

  /* ══════════ TIMER ══════════ */
  function startTimer(minutes) {
    TIMER.remaining = minutes * 60;
    paintTimer();
    ToeflTimerUI.resetWarnings();
    TIMER.id = setInterval(function () {
      TIMER.remaining--;
      paintTimer();
      ToeflTimerUI.checkWarnings(TIMER.remaining);
      if (TIMER.remaining <= 0) {
        stopTimer();
        showToast("Waktu habis! Jawaban tersubmit otomatis.", "danger");
        submitSection(true);
      }
    }, 1000);
  }
  function stopTimer() { if (TIMER.id) clearInterval(TIMER.id); TIMER.id = null; }
  function paintTimer() {
    var t = $("tb-timer"), txt = $("tb-timer-text");
    if (!txt) return;
    txt.textContent = fmtTime(TIMER.remaining);
    t.classList.remove("warn", "danger");
    if (TIMER.remaining <= 60) t.classList.add("danger");
    else if (TIMER.remaining <= 300) t.classList.add("warn");
  }

  /* ══════════ RENDER QUESTION ══════════ */
  function renderQuestion() {
    var q = STATE.flat[STATE.pos];
    var stage = $("qstage");
    var dir = renderQuestion._lastDir || "fwd";
    renderQuestion._lastDir = "fwd";

    $("stage-qnum").textContent = "Question " + (STATE.pos + 1) + " of " + STATE.flat.length;
    $("stage-part").textContent = q.partLabel || "";

    var html = '<div class="qcard' + (dir === "back" ? " back" : "") + '">';

    // Audio player (listening)
    if (q.audio) {
      html += '<div class="audio-player">' +
        '<div class="audio-head">' +
          '<div class="audio-title"><span class="a-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></span>' + esc(q.audioTitle) + "</div>" +
          '<span class="audio-type">' + esc((q.audioType || "talk").replace(/-/g, " ")) + "</span>" +
        "</div>" +
        '<div class="audio-canvas-wrap"><canvas id="audio-canvas"></canvas><div class="audio-progress-line" id="audio-progress"></div></div>' +
        '<div class="audio-controls-row">' +
          '<button class="audio-play-btn" id="audio-play-btn" aria-label="Play audio"><svg id="audio-icon-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg><svg id="audio-icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>' +
          '<button class="audio-mini-btn" onclick="App.audioReplay()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/></svg> Replay</button>' +
          '<div class="audio-status" id="audio-status"><span class="live-dot"></span><span id="audio-status-text">Siap diputar</span></div>' +
        "</div>" +
      "</div>";
    }

    // Passage (reading)
    if (q.passage) {
      html += '<div class="passage-box"><h4>' + esc(q.passageTitle) + '</h4><div class="ptext">' + esc(q.passage) + "</div></div>";
    }

    // Question
    html += '<p class="q-text">' + esc(q.question) + "</p>";

    // Choices
    html += '<div class="choices">';
    q.choices.forEach(function (c, i) {
      var selected = STATE.answers[q.id] === i;
      html += '<label class="choice' + (selected ? " selected" : "") + '" data-cl="1" data-idx="' + i + '">' +
        '<input type="radio" name="' + q.id + '" value="' + i + '"' + (selected ? " checked" : "") + ">" +
        '<span class="key">' + "ABCD"[i] + "</span>" +
        '<span class="choice-body">' + esc(c) + "</span>" +
        '<span class="check"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' +
      "</label>";
    });
    html += "</div>";

    html += '<div class="explain" id="explain-box"></div>';

    // Stage controls
    var isLast = STATE.pos === STATE.flat.length - 1;
    html += '<div class="stage-controls">' +
      '<div class="sc-group">' +
        '<button class="btn btn-soft" onclick="App.prev()" ' + (STATE.pos === 0 ? "disabled" : "") + '><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Prev</button>' +
        '<button class="btn btn-soft btn-flag-toggle' + (STATE.flagged[q.id] ? " on" : "") + '" onclick="App.toggleFlag()" id="stage-flag-btn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> ' + (STATE.flagged[q.id] ? "Flagged" : "Flag") + "</button>" +
      "</div>" +
      '<div class="sc-group">' +
        (isLast
          ? '<button class="btn btn-accent" onclick="App.requestSubmit()">Review & Submit <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>'
          : '<button class="btn btn-primary" onclick="App.next()">Next <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>') +
      "</div>" +
    "</div></div>";

    stage.innerHTML = html;

    // Bind choices
    stage.querySelectorAll("[data-cl]").forEach(function (label) {
      label.addEventListener("click", function () { selectChoice(q, Number(label.dataset.idx)); });
    });

    // If reviewed already (post-submit), paint verdict
    if (STATE.reviewed) paintReviewed(q);

    renderPalette();
    shellUpdateProgress();
    drawIdleWave();
  }

  function selectChoice(q, idx) {
    if (STATE.reviewed) return;
    if (STATE.answers[q.id] === idx) return;
    STATE.answers[q.id] = idx;
    document.querySelectorAll("[data-cl]").forEach(function (l) {
      l.classList.toggle("selected", Number(l.dataset.idx) === idx);
      var inp = l.querySelector("input"); if (inp) inp.checked = Number(l.dataset.idx) === idx;
    });
    saveDraft();
    renderPalette();
    shellUpdateProgress();
    // auto-advance like real CBT? keep manual — just pulse next button
    var nx = document.querySelector(".stage-controls .btn-primary");
    if (nx && !renderQuestion._pulseOnce) {
      nx.style.transform = "translateY(-2px)";
      setTimeout(function () { nx.style.transform = ""; }, 350);
    }
  }

  function paintReviewed(q, onlyWrong) {
    var sel = STATE.answers[q.id];
    var box = $("explain-box");
    document.querySelectorAll("[data-cl]").forEach(function (l) {
      var i = Number(l.dataset.idx);
      if (i === q.answer) l.classList.add("is-correct");
      if (i === sel && sel !== q.answer) l.classList.add("is-wrong");
      if (i !== q.answer && i !== sel) l.classList.add("dim");
      l.classList.add("locked");
    });
    if (!box) return;
    if (sel === q.answer) {
      if (onlyWrong) { box.classList.remove("show"); return; }
      box.className = "explain show good";
      box.innerHTML = '<div class="ex-verdict"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Correct</div>' + esc(q.explanation || "");
    } else if (sel === undefined) {
      box.className = "explain show bad";
      box.innerHTML = '<div class="ex-verdict"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Unanswered</div>' +
        '<p class="ex-answer">Jawaban benar: <b>' + "ABCD"[q.answer] + ". " + esc(q.choices[q.answer]) + "</b></p>" + esc(q.explanation || "");
    } else {
      box.className = "explain show bad";
      box.innerHTML = '<div class="ex-verdict"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Incorrect</div>' +
        '<p class="ex-answer">Jawaban benar: <b>' + "ABCD"[q.answer] + ". " + esc(q.choices[q.answer]) + "</b></p>" + esc(q.explanation || "");
    }
  }

  /* ══════════ NAVIGATION ══════════ */
  function goTo(pos, dir) {
    if (pos < 0 || pos >= STATE.flat.length) return;
    renderQuestion._lastDir = dir || (pos > STATE.pos ? "fwd" : "back");
    STATE.pos = pos;
    var trackAudio = STATE.section === "listening";
    if (trackAudio) stopAudio();
    renderQuestion();
    if (!document.body.classList.contains("in-test")) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function next() { goTo(STATE.pos + 1, "fwd"); }
  function prev() { goTo(STATE.pos - 1, "back"); }

  function toggleFlag() {
    var q = STATE.flat[STATE.pos];
    if (STATE.flagged[q.id]) delete STATE.flagged[q.id];
    else STATE.flagged[q.id] = true;
    var btn = $("stage-flag-btn");
    if (btn) {
      btn.classList.toggle("on", !!STATE.flagged[q.id]);
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg> ' + (STATE.flagged[q.id] ? "Flagged" : "Flag");
    }
    renderPalette();
    saveDraft();
  }

  function renderPalette() {
    var grid = $("palette-grid");
    if (!grid) return;
    var html = STATE.flat.map(function (q, i) {
      var cls = "pal-btn";
      if (STATE.answers[q.id] !== undefined) cls += " answered";
      if (STATE.flagged[q.id]) cls += " flagged";
      if (i === STATE.pos) cls += " current";
      return '<button class="' + cls + '" onclick="App.goTo(' + i + ')" title="Q' + (i + 1) + '">' + (i + 1) + "</button>";
    }).join("");
    grid.innerHTML = html;
  }

  /* ══════════ PALETTE SHEET (mobile) ══════════ */
  function openPaletteSheet() {
    $("test-palette").classList.add("open");
    $("palette-sheet-overlay").classList.add("open");
  }
  function closePaletteSheet() {
    var p = $("test-palette"), o = $("palette-sheet-overlay");
    if (p) p.classList.remove("open");
    if (o) o.classList.remove("open");
  }
  function togglePaletteSheet() {
    var p = $("test-palette");
    if (p.classList.contains("open")) closePaletteSheet();
    else openPaletteSheet();
  }

  /* ══════════ MODALS ══════════ */
  function openModal(html) {
    $("modal-box").innerHTML = html;
    $("modal-overlay").classList.add("open");
  }
  function closeModal() { $("modal-overlay").classList.remove("open"); }
  $("modal-overlay") && $("modal-overlay").addEventListener("click", function (e) {
    if (e.target === this) closeModal();
  });

  function requestSubmit() {
    var total = STATE.flat.length, answered = Object.keys(STATE.answers).length;
    var flagged = Object.keys(STATE.flagged).length;
    var flaggedList = Object.keys(STATE.flagged).map(function (qid) {
      return STATE.flat.findIndex(function (f) { return f.id === qid; }) + 1;
    }).sort(function (a, b) { return a - b; });
    var unList = [];
    STATE.flat.forEach(function (q, i) {
      if (STATE.answers[q.id] === undefined) unList.push(i + 1);
    });
    openModal(
      "<h3>Review sebelum Submit</h3>" +
      "<p style='color:var(--text-dim);font-size:13.5px;margin-bottom:14px'>Cek dulu sebelum kunci jawaban. Skor masih bisa berubah selama belum submit.</p>" +
      "<p><b>" + answered + "</b> dari <b>" + total + "</b> soal terjawab.</p>" +
      (flagged ? "<p class='warn-p'>⚑ Ditandai: <b>Q " + flaggedList.slice(0, 12).join(', ') + (flaggedList.length > 12 ? '…' : '') + "</b></p>" : "") +
      (unList.length
        ? '<p class="bad-p">Belum dijawab: <b>Q ' + unList.slice(0, 12).join(", ") + (unList.length > 12 ? "… (" + unList.length + " lagi)" : "") + "</b></p>"
        : '<p class="ok-p">✓ Semua soal terjawab. Mantap, siap submit!</p>') +
      '<div class="modal-actions">' +
        (unList.length ? '<button class="btn btn-soft" onclick="App.goFirstEmpty()">Lompat ke soal kosong</button>' : "") +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Lanjut kerja</button>' +
        '<button class="btn btn-accent" onclick="App.confirmSubmit()">Kunci & Submit</button>' +
      "</div>"
    );
  }

  function goFirstEmpty() {
    var idx = STATE.flat.findIndex(function (q) { return STATE.answers[q.id] === undefined; });
    closeModal();
    if (idx >= 0) goTo(idx);
  }

  function confirmSubmit() {
    closeModal();
    submitSection(false);
  }

  function requestExit() {
    openModal(
      "<h3>Keluar dari test?</h3>" +
      "<p>Progress section ini tidak akan tersimpan sebagai skor.</p>" +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="App.closeModal()">Lanjut kerja</button>' +
      '<button class="btn btn-danger" onclick="App.forceExit()">Keluar</button>' +
      "</div>"
    );
  }

  function forceExit() {
    closeModal();
    exitTestShell();
  }

  /* ══════════ SUBMIT + REVIEW + NEXT ══════════ */
  function submitSection(timedOut) {
    stopTimer(); stopAudio();
    var score = 0, total = STATE.flat.length;
    STATE.flat.forEach(function (q) { if (STATE.answers[q.id] === q.answer) score++; });
    var answered = Object.keys(STATE.answers).length;
    var skipped = total - answered;
    var wrong = answered - score;

    STATE.results = STATE.results || {};
    STATE.results[STATE.section] = { score: score, total: total, wrong: wrong, skipped: skipped, answered: answered };
    STATE.reviewed = true;
    ToeflStore.del("draft");

    if (STATE.mode === "fulltest") {
      STATE.full.results[STATE.section] = STATE.results[STATE.section];
      showSectionTransition(timedOut, score, total);
    } else {
      showSectionResult(timedOut, score, total);
    }
  }

  function showSectionTransition(timedOut, score, total) {
    var idx = STATE.full.index;
    var isLast = idx >= STATE.full.sections.length - 1;
    var nextSec = STATE.full.sections[idx + 1];
    var pct = total ? Math.round(score / total * 100) : 0;

    openModal(
      "<h3>" + (timedOut ? "Waktu habis ⏱" : "Section selesai ✓") + "</h3>" +
      "<p><b>" + SECTION_META[STATE.section].short + ":</b> " + score + " / " + total + " benar (" + pct + "%)</p>" +
      (isLast
        ? '<p class="ok-p">Semua section selesai. Siap lihat score report?</p>'
        : "<p>Lanjut ke <b>" + SECTION_META[nextSec].title + "</b>? Timer berikutnya mulai setelah kamu menekan tombol.</p>") +
      '<div class="modal-actions">' +
        '<button class="btn btn-soft" onclick="App.reviewCurrentSection()">Review jawaban dulu</button>' +
        (isLast
          ? '<button class="btn btn-accent" onclick="App.finishFullTest()">Lihat Hasil Akhir</button>'
          : '<button class="btn btn-accent" onclick="App.continueFullTest()">Lanjut ' + SECTION_META[nextSec].short + ' →</button>') +
      "</div>"
    );
  }

  function showSectionResult(timedOut, score, total) {
    var pct = total ? Math.round(score / total * 100) : 0;
    var scaled = calculateITPScore(
      STATE.section === "listening" ? { score: score, total: total } : { score: 0, total: 50 },
      STATE.section === "structure" ? { score: score, total: total } : { score: 0, total: 40 },
      STATE.section === "reading" ? { score: score, total: total } : { score: 0, total: 50 }
    );
    // save result (single section history, setName tags section)
    try {
      var resultData = {
        listening: STATE.section === "listening" ? { score: score, total: total } : { score: 0, total: 0 },
        structure: STATE.section === "structure" ? { score: score, total: total } : { score: 0, total: 0 },
        reading: STATE.section === "reading" ? { score: score, total: total } : { score: 0, total: 0 },
        date: new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" }),
        setName: (STATE.set ? STATE.set.title : "Practice") + " · " + SECTION_META[STATE.section].short,
        savedAt: Date.now()
      };
      localStorage.setItem("toeflResult", JSON.stringify(resultData));
      ToeflStore.pushCapped("history.v1", resultData, 20);
    } catch (e) { /* storage unavailable */ }
    syncResultToCloud("section", resultData.setName, STATE.section, resultData.listening, resultData.structure, resultData.reading);

    openModal(
      "<h3>" + (timedOut ? "Waktu habis ⏱" : "Section selesai ✓") + "</h3>" +
      '<div class="review-score-row">' +
        '<div class="review-stat"><b>' + score + "/" + total + "</b><span>Benar</span></div>" +
        '<div class="review-stat"><b>' + pct + "%</b><span>Akurasi</span></div>" +
        '<div class="review-stat"><b>' + (STATE.section === "listening" ? scaled.listeningScale : STATE.section === "structure" ? scaled.structureScale : scaled.readingScale) + "</b><span>Estimasi scaled score</span></div>" +
      "</div>" +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeAndExit()">Kembali ke Beranda</button>' +
        '<button class="btn btn-soft" onclick="App.retake()">Ulangi (acak)</button>' +
        '<button class="btn btn-accent" onclick="App.reviewCurrentSection()">Review jawaban</button>' +
      "</div>"
    );
  }

  function closeAndExit() { closeModal(); exitTestShell(); renderHistory(); }

  function reviewCurrentSection() {
    closeModal();
    STATE.pos = 0;
    renderQuestion._lastDir = "fwd";
    renderQuestion();
  }

  function retake() {
    closeModal();
    startSectionRun(STATE.section, STATE._dataRaw, STATE.set, STATE.mode === "fulltest");
  }

  /* ══════════ FULL TEST FLOW ══════════ */
  function continueFullTest() {
    closeModal();
    STATE.full.index++;
    var nextSec = STATE.full.sections[STATE.full.index];
    var data = STATE._fullData[nextSec];
    startSectionRun(nextSec, data, STATE.set, true);
  }

  function finishFullTest() {
    closeModal();
    var r = STATE.full.results;
    var L = r.listening || { score: 0, total: 0 },
        S = r.structure || { score: 0, total: 0 },
        R = r.reading || { score: 0, total: 0 };
    try {
      var resultData = {
        listening: L, structure: S, reading: R,
        date: new Date().toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" }),
        setName: STATE.set ? STATE.set.title : "Full Test",
        savedAt: Date.now()
      };
      localStorage.setItem("toeflResult", JSON.stringify(resultData));
      ToeflStore.pushCapped("history.v1", resultData, 20);
      ToeflStore.del("draft");
    } catch (e) { /* storage unavailable */ }
    syncResultToCloud("fulltest", resultData.setName, null, L, S, R).finally(function () {
      location.href = "result.html";
    });
  }

  /* ══════════ START FLOWS ══════════ */
  function resetState() {
    STATE.answers = {}; STATE.flagged = {}; STATE.pos = 0; STATE.reviewed = false;
    stopAudio(); stopTimer();
  }

  function confirmAndStart(section, setId, fulltest) {
    // If a test looks active locally (same session), just go through — drafts are same-tab only.
    if (fulltest) startFullTestWith(setId);
    else startSectionWith(section, setId);
  }

  function startSectionWith(sectionName, setId) {
    // Gate login SEBELUM fetch soal (kalau config aktif)
    if (window.ToeflAuth && ToeflAuth.isConfigured && ToeflAuth.isConfigured()) {
      return ToeflAuth.init().then(function () {
        return ToeflAuth.requireAuth("section:" + sectionName);
      }).then(function (ok) {
        if (!ok) return;
        _startSectionWith(sectionName, setId);
      });
    }
    _startSectionWith(sectionName, setId);
  }

  function _startSectionWith(sectionName, setId) {
    var set = getSet(setId);
    if (!set) return;
    if (set.type === "mixed") { showToast("Set 0 khusus Full Test", "warn"); return; }
    if (!set.files || !set.files[sectionName]) { showToast("Set ini tidak punya file " + sectionName, "danger"); return; }

    fetchJSON(set.files[sectionName]).then(function (data) {
      STATE.mode = "section";
      STATE.set = set;
      showSectionIntro(sectionName, data, set, false, function () {
        startSectionRun(sectionName, data, set, false);
      });
    }).catch(function () { showToast("Gagal memuat soal", "danger"); });
  }

  function startFullTestWith(setId) {
    // Gate login SEBELUM fetch soal (kalau config aktif)
    if (window.ToeflAuth && ToeflAuth.isConfigured && ToeflAuth.isConfigured()) {
      return ToeflAuth.init().then(function () {
        return ToeflAuth.requireAuth("fulltest");
      }).then(function (ok) {
        if (!ok) return;
        _startFullTestWith(setId);
      });
    }
    _startFullTestWith(setId);
  }

  function _startFullTestWith(setId) {
    var set = getSet(setId);
    if (!set) return;
    showToast("Memuat full test…", "info");
    if (set.type === "mixed") {
      // gather all regular sets
      var sources = manifest.sets.filter(function (s) { return s.status === "active" && s.type !== "mixed" && s.files; });
      var files = { listening: [], structure: [], reading: [] };
      sources.forEach(function (s) {
        files.listening.push(s.files.listening);
        files.structure.push(s.files.structure);
        files.reading.push(s.files.reading);
      });
      Promise.all(
        files.listening.concat(files.structure, files.reading).map(fetchJSON)
      ).then(function (allData) {
        var n = sources.length;
        var L = allData.slice(0, n), S = allData.slice(n, 2 * n), R = allData.slice(2 * n, 3 * n);
        var tgtQ = set.targetQuestions || { listening: 50, structure: 40, reading: 50 };
        var dur = set.durationMinutes || { listening: 35, structure: 25, reading: 55 };
        var fullData = {
          listening: buildMixedListening(L, tgtQ.listening, dur.listening),
          structure: buildMixedStructure(S, tgtQ.structure, dur.structure),
          reading: buildMixedReading(R, tgtQ.reading, dur.reading)
        };
        STATE.mode = "fulltest";
        STATE.set = set;
        STATE._fullData = fullData;
        STATE.full = { index: 0, results: {}, sections: ["listening", "structure", "reading"] };
        showFulltestIntro(set, fullData);
      }).catch(function (e) { console.error(e); showToast("Gagal memuat mixed test", "danger"); });
    } else {
      Promise.all([
        fetchJSON(set.files.listening),
        fetchJSON(set.files.structure),
        fetchJSON(set.files.reading)
      ]).then(function (arr) {
        var fullData = { listening: arr[0], structure: arr[1], reading: arr[2] };
        STATE.mode = "fulltest";
        STATE.set = set;
        STATE._fullData = fullData;
        STATE.full = { index: 0, results: {}, sections: ["listening", "structure", "reading"] };
        showFulltestIntro(set, fullData);
      }).catch(function () { showToast("Gagal memuat full test", "danger"); });
    }
  }

  function buildMixedListening(datas, targetQ, dur) {
    var items = [];
    datas.forEach(function (d) {
      d.items.forEach(function (item) {
        var it = JSON.parse(JSON.stringify(item));
        it.questions = it.questions.map(shuffleChoices);
        items.push(it);
      });
    });
    items = shuffle(items);
    // accumulate whole audio blocks until question target is hit (keeps audio-question groups intact)
    var selected = [], total = 0;
    for (var i = 0; i < items.length && total < targetQ; i++) { selected.push(items[i]); total += items[i].questions.length; }
    return { meta: { durationMinutes: dur, totalQuestions: total, set: "set-0" }, items: selected };
  }
  function buildMixedStructure(datas, targetQ, dur) {
    var qs = [];
    datas.forEach(function (d) {
      d.items.forEach(function (q) { qs.push(shuffleChoices(JSON.parse(JSON.stringify(q)))); });
    });
    qs = shuffle(qs).slice(0, targetQ);
    return { meta: { durationMinutes: dur, totalQuestions: qs.length, set: "set-0" }, items: qs };
  }
  function buildMixedReading(datas, targetQ, dur) {
    var ps = [];
    datas.forEach(function (d) {
      d.passages.forEach(function (p) {
        var pp = JSON.parse(JSON.stringify(p));
        pp.questions = pp.questions.map(shuffleChoices);
        ps.push(pp);
      });
    });
    ps = shuffle(ps);
    var selected = [], total = 0;
    for (var i = 0; i < ps.length && total < targetQ; i++) { selected.push(ps[i]); total += ps[i].questions.length; }
    return { meta: { durationMinutes: dur, totalQuestions: total, set: "set-0" }, passages: selected };
  }

  function showFulltestIntro(set, fullData) {
    var totals = {
      listening: countQ("listening", fullData.listening),
      structure: countQ("structure", fullData.structure),
      reading: countQ("reading", fullData.reading)
    };
    openModal(
      "<h3>Full TOEFL ITP-like Test</h3>" +
      "<p><b>" + esc(set.title) + "</b></p>" +
      '<div class="review-score-row">' +
        '<div class="review-stat"><b>' + totals.listening + "</b><span>Listening · " + fullData.listening.meta.durationMinutes + "m</span></div>" +
        '<div class="review-stat"><b>' + totals.structure + "</b><span>Structure · " + fullData.structure.meta.durationMinutes + "m</span></div>" +
        '<div class="review-stat"><b>' + totals.reading + "</b><span>Reading · " + fullData.reading.meta.durationMinutes + "m</span></div>" +
      "</div>" +
      "<p>Alur: Listening → Structure → Reading → Score Report. Antara section bisa istirahat sebentar.</p>" +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Batal</button>' +
        '<button class="btn btn-accent" onclick="App.beginFullTest()">Mulai Listening</button>' +
      "</div>"
    );
  }

  function beginFullTest() {
    closeModal();
    STATE.results = {};
    STATE.full.index = 0;
    startSectionRun("listening", STATE._fullData.listening, STATE.set, true);
  }

  function countQ(sec, d) {
    if (sec === "listening") return d.items.reduce(function (t, i) { return t + i.questions.length; }, 0);
    if (sec === "structure") return d.items.length;
    return d.passages.reduce(function (t, p) { return t + p.questions.length; }, 0);
  }

  function showSectionIntro(sectionName, data, set, isFull, onStart) {
    var total = countQ(sectionName, data);
    openModal(
      "<h3>" + SECTION_META[sectionName].title + "</h3>" +
      '<div class="review-score-row">' +
        '<div class="review-stat"><b>' + total + "</b><span>Soal</span></div>" +
        '<div class="review-stat"><b>' + data.meta.durationMinutes + " mnt</b><span>Waktu</span></div>" +
        '<div class="review-stat"><b>' + esc(set.title) + "</b><span>Set</span></div>" +
      "</div>" +
      "<p>Timer jalan setelah kamu mulai. Bisa flag soal yang ragu, jawab dengan klik atau keyboard A–D.</p>" +
      (sectionName === "listening" ? '<p class="warn-p">🎧 Pakai headphone untuk hasil terbaik.</p>' : "") +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="App.closeModal()">Batal</button>' +
        '<button class="btn btn-accent" id="section-start-btn">Mulai Sekarang</button>' +
      "</div>"
    );
    var btn = $("section-start-btn");
    if (btn) btn.addEventListener("click", function () { closeModal(); onStart(); });
  }

  function startSectionRun(sectionName, data, set, isFull) {
    resetState();
    STATE.mode = isFull ? "fulltest" : "section";
    STATE.section = sectionName;
    STATE.set = set;
    STATE._dataRaw = data;
    STATE.data = data;
    STATE.flat = flatten(sectionName, cloneShuffled(sectionName, data));
    // Keep reference to raw for retake
    STATE._shuffledRef = STATE.flat;

    enterTestShell();
    shellSetSection(sectionName);
    renderPalette();
    renderQuestion();
    startTimer(data.meta.durationMinutes);
  }

  function cloneShuffled(section, data) {
    var d = JSON.parse(JSON.stringify(data));
    if (section === "listening") {
      d.items = shuffle(d.items);
      d.items.forEach(function (it) { it.questions = shuffle(it.questions).map(shuffleChoices); });
    } else if (section === "structure") {
      d.items = shuffle(d.items).map(shuffleChoices);
    } else {
      d.passages = shuffle(d.passages);
      d.passages.forEach(function (p) { p.questions = shuffle(p.questions).map(shuffleChoices); });
    }
    return d;
  }

  /* ══════════ AUDIO (TTS) ══════════ */
  function drawIdleWave() {
    var cv = $("audio-canvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var w = cv.width = cv.offsetWidth * devicePixelRatio;
    var h = cv.height = cv.offsetHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    var bars = 56, gap = w / bars;
    for (var i = 0; i < bars; i++) {
      var bh = (0.2 + Math.abs(Math.sin(i * 0.55)) * 0.35) * h;
      ctx.fillStyle = "rgba(79,140,255,0.55)";
      ctx.beginPath();
      roundRect(ctx, i * gap + gap * 0.22, (h - bh) / 2, gap * 0.56, bh, 3 * devicePixelRatio);
      ctx.fill();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }

  function animateWave() {
    if (AUDIO.state !== "speaking") return;
    var cv = $("audio-canvas");
    if (!cv) return;
    var ctx = cv.getContext("2d");
    var w = cv.width, h = cv.height;
    var t = performance.now() / 1000;
    ctx.clearRect(0, 0, w, h);
    var bars = 56, gap = w / bars;
    for (var i = 0; i < bars; i++) {
      var amp = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.7 + t * 6) * Math.sin(t * 3 + i * 0.13));
      var bh = amp * h * 0.9;
      ctx.fillStyle = "rgba(45,212,191," + (0.45 + amp * 0.4) + ")";
      ctx.beginPath();
      roundRect(ctx, i * gap + gap * 0.22, (h - bh) / 2, gap * 0.56, bh, 3 * devicePixelRatio);
      ctx.fill();
    }
    // progress
    if (AUDIO.estDur > 0) {
      var p = Math.min(1, (performance.now() - AUDIO.startedAt) / AUDIO.estDur);
      var line = $("audio-progress");
      if (line) line.style.width = (p * 100) + "%";
    }
    AUDIO.raf = requestAnimationFrame(animateWave);
  }

  function setAudioStatus(text, playing) {
    var st = $("audio-status"), tx = $("audio-status-text");
    if (tx) tx.textContent = text;
    if (st) st.classList.toggle("playing", !!playing);
    var pp = $("audio-icon-play"), pi = $("audio-icon-pause");
    if (pp && pi) {
      pp.style.display = playing ? "none" : "";
      pi.style.display = playing ? "" : "none";
    }
  }

  function currentAudioText() {
    var q = STATE.flat[STATE.pos];
    return q && q.audio ? q : null;
  }

  function audioToggle() {
    var q = currentAudioText();
    if (!q) return;
    if (AUDIO.state === "speaking") { audioPause(); return; }
    if (AUDIO.state === "paused") { audioResume(); return; }
    audioPlay();
  }
  function audioPlay() {
    var q = currentAudioText();
    if (!q || !window.ToeflTTS || !ToeflTTS.isSupported()) {
      setAudioStatus("TTS tidak didukung browser ini", false);
      return;
    }
    ToeflTTS.cancel();
    var text = q.audio;
    var utter = new SpeechSynthesisUtterance(text);
    ToeflTTS.applyVoice(utter);
    utter.onstart = function () {
      AUDIO.state = "speaking";
      AUDIO.startedAt = performance.now();
      AUDIO.estDur = Math.max(4000, (text.length / 15) * 1000 / ToeflTTS.NATURAL_RATE);
      setAudioStatus("Memutar…", true);
      animateWave();
    };
    utter.onend = function () {
      AUDIO.state = "idle";
      setAudioStatus("Selesai — bisa replay", false);
      if (AUDIO.raf) cancelAnimationFrame(AUDIO.raf);
      drawIdleWave();
      var line = $("audio-progress"); if (line) line.style.width = "100%";
    };
    utter.onerror = function () {
      AUDIO.state = "idle";
      setAudioStatus("Audio error", false);
      if (AUDIO.raf) cancelAnimationFrame(AUDIO.raf);
      drawIdleWave();
    };
    AUDIO.playingId = q.id;
    speechSynthesis.speak(utter);
  }
  function audioPause() {
    if (AUDIO.state !== "speaking") return;
    speechSynthesis.pause();
    AUDIO.state = "paused";
    setAudioStatus("Paused", false);
    if (AUDIO.raf) cancelAnimationFrame(AUDIO.raf);
  }
  function audioResume() {
    if (AUDIO.state !== "paused") return;
    speechSynthesis.resume();
    AUDIO.state = "speaking";
    setAudioStatus("Memutar…", true);
    animateWave();
  }
  function audioReplay() {
    var q = currentAudioText();
    if (!q) return;
    stopAudio();
    var line = $("audio-progress"); if (line) line.style.width = "0%";
    audioPlay();
  }
  function stopAudio() {
    AUDIO.state = "idle";
    if (AUDIO.raf) cancelAnimationFrame(AUDIO.raf);
    AUDIO.raf = null;
    if (window.ToeflTTS) ToeflTTS.cancel();
  }

  /* ══════════ CLOUD SYNC ══════════ */
  function syncResultToCloud(mode, setName, section, L, S, R) {
    if (!window.ToeflAuth || !ToeflAuth.ready) return Promise.resolve();
    var dur = 0;
    return ToeflAuth.saveResult(mode, setName, section, L, S, R);
  }

  /* ══════════ DRAFT ══════════ */
  function saveDraft() {
    try {
      if (STATE.mode === "section") {
        ToeflStore.set("draft", {
          section: STATE.section, setId: STATE.set ? STATE.set.id : null,
          answers: STATE.answers, flagged: STATE.flagged, pos: STATE.pos
        });
      }
    } catch (e) { /* ignore */ }
  }

  /* ══════════ PICKERS (landing) ══════════ */
  function openSectionPicker(sectionName) {
    var setId = (manifest.sets.find(function (s) { return s.id === manifest.defaultSetId; }) || manifest.sets[1] || manifest.sets[0]).id;
    // prefer first regular set
    var first = manifest.sets.find(function (s) { return s.status === "active" && s.type !== "mixed"; });
    if (first) setId = first.id;
    openModal(
      "<h3>" + SECTION_META[sectionName].title + "</h3>" +
      "<p>Pilih practice set:</p>" +
      '<div style="display:grid;gap:10px;margin-top:12px">' +
      manifest.sets.filter(function (s) { return s.status === "active" && s.type !== "mixed"; }).map(function (s) {
        return '<button class="btn btn-soft" style="justify-content:space-between" onclick="App.closeModal();App.startSectionWith(\'' + sectionName + "','" + s.id + "')\">" +
          esc(s.title) + " <span style='color:var(--text-faint);font-weight:600;font-size:12px'>" + (sectionTotals(s, sectionName) || "?") + " soal</span></button>";
      }).join("") +
      "</div>"
    );
  }

  function openFullTestPicker() {
    openModal(
      "<h3>Full TOEFL ITP-like Test</h3>" +
      "<p>Pilih set untuk full test (Listening → Structure → Reading):</p>" +
      '<div style="display:grid;gap:10px;margin-top:12px">' +
      manifest.sets.filter(function (s) { return s.status === "active"; }).map(function (s) {
        return '<button class="btn ' + (s.type === "mixed" ? "btn-accent" : "btn-soft") + '" style="justify-content:space-between" onclick="App.closeModal();App.startFullTestWith(\'' + s.id + "')\">" +
          esc(s.title) + (s.type === "mixed" ? " <span style='font-size:12px'>★ Rekomendasi</span>" : "") + "</button>";
      }).join("") +
      "</div>"
    );
  }

  /* ══════════ KEYBOARD ══════════ */
  function onKey(e) {
    if (!document.body.classList.contains("in-test")) return;
    if ($("modal-overlay").classList.contains("open")) {
      if (e.key === "Escape") closeModal();
      return;
    }
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    var q = STATE.flat[STATE.pos];
    var k = e.key.toLowerCase();
    if (k >= "a" && k <= "d") {
      var idx = k.charCodeAt(0) - 97;
      if (q && idx < q.choices.length) selectChoice(q, idx);
    } else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") prev();
    else if (k === "f") toggleFlag();
    else if (k === "p" && STATE.section === "listening") audioToggle();
  }

  /* ══════════ PUBLIC API ══════════ */
  window.App = {
    closeModal: closeModal,
    requestSubmit: requestSubmit,
    confirmSubmit: confirmSubmit,
    requestExit: requestExit,
    forceExit: forceExit,
    next: next,
    prev: prev,
    goTo: function (i) { goTo(i > STATE.pos ? (renderQuestion._lastDir = "fwd", i) : (renderQuestion._lastDir = "back", i)); closePaletteSheet(); },
    goFirstEmpty: goFirstEmpty,
    toggleFlag: toggleFlag,
    reviewCurrentSection: reviewCurrentSection,
    retake: retake,
    closeAndExit: closeAndExit,
    continueFullTest: continueFullTest,
    finishFullTest: finishFullTest,
    beginFullTest: beginFullTest,
    startSectionWith: startSectionWith,
    startFullTestWith: startFullTestWith,
    audioToggle: audioToggle,
    audioReplay: function () { audioReplay(); },
    togglePaletteSheet: togglePaletteSheet,
    closePaletteSheet: closePaletteSheet,
    openSectionPicker: function (sec) {
      loadManifest().then(function () { openSectionPicker(sec); });
    },
    openFullTestPicker: function () {
      loadManifest().then(openFullTestPicker);
    },
    clearHistory: clearHistory
  };

  /* ══════════ INIT ══════════ */
  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initReveal();
    renderHistory();
    loadManifest().then(renderSetsGrid).catch(function () {
      var g = $("sets-grid");
      if (g) g.innerHTML = "<p style='color:var(--bad)'>Gagal memuat manifest soal.</p>";
    });
    document.addEventListener("keydown", onKey);
    // audio canvas init on first render (rebound each render)
    new ResizeObserver(function () { if ($("audio-canvas") && AUDIO.state !== "speaking") drawIdleWave(); })
      .observe($("qstage"));
    // audio big play button binding done via delegation (button re-renders each question)
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("#audio-play-btn")) audioToggle();
    });
    // renderPalette + set FAB display
    if (window.innerWidth < 980) $("palette-fab").style.display = "";
  });
})();

/**
 * tts.js - ToeflTTS: natural-rate Web Speech API helpers for Listening audio.
 * Playback state machine stays in app.js; this module picks a natural
 * English voice and exposes replay support.
 */
(function () {
  'use strict';

  var NATURAL_RATE = 0.95;
  var cachedVoice = null;
  var voicesLoaded = false;

  function loadVoices() {
    if (!('speechSynthesis' in window)) return [];
    var v = speechSynthesis.getVoices();
    if (v && v.length) voicesLoaded = true;
    return v || [];
  }

  function pickEnglishVoice() {
    if (cachedVoice) return cachedVoice;
    var voices = loadVoices();
    if (!voices.length) return null;
    // Prefer en-US female-sounding Google/US voices, then any en voice.
    var prefs = ['Google US English', 'Samantha', 'Zira', 'Aria', 'Jenny'];
    for (var i = 0; i < prefs.length; i++) {
      var hit = voices.find(function (v) { return v.name === prefs[i]; });
      if (hit) { cachedVoice = hit; return hit; }
    }
    var enUS = voices.find(function (v) { return v.lang === 'en-US'; });
    if (enUS) { cachedVoice = enUS; return enUS; }
    var en = voices.find(function (v) { return v.lang && v.lang.indexOf('en') === 0; });
    if (en) { cachedVoice = en; return en; }
    return null;
  }

  function applyNaturalVoice(utterance) {
    var voice = pickEnglishVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'en-US';
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = NATURAL_RATE; // natural pace (not slowed down)
    utterance.pitch = 1.0;
    utterance.volume = 1;
    return utterance;
  }

  function cancel() {
    if ('speechSynthesis' in window) {
      try { speechSynthesis.cancel(); } catch (e) { /* noop */ }
    }
  }

  function isSupported() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  if ('speechSynthesis' in window) {
    loadVoices();
    if (typeof speechSynthesis.onvoiceschanged !== 'undefined') {
      speechSynthesis.onvoiceschanged = function () {
        voicesLoaded = true;
        cachedVoice = null;
        pickEnglishVoice();
      };
    }
  }

  window.ToeflTTS = {
    NATURAL_RATE: NATURAL_RATE,
    isSupported: isSupported,
    pickVoice: pickEnglishVoice,
    applyVoice: applyNaturalVoice,
    cancel: cancel
  };
})();

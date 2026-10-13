/**
 * storage.js - ToeflStore: consistent localStorage wrapper (prefix "toefl.").
 * Also reads legacy "toeflResult" key for backward compatibility.
 */
(function () {
  'use strict';

  var PREFIX = 'toefl.';
  var LEGACY_RESULT_KEY = 'toeflResult';

  function fullKey(key) {
    if (key.indexOf(PREFIX) === 0 || key === LEGACY_RESULT_KEY) return key;
    return PREFIX + key;
  }

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  var ToeflStore = {
    prefix: PREFIX,
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(fullKey(key));
        if (raw === null && fullKey(key) !== LEGACY_RESULT_KEY && key === 'result.v1') {
          raw = localStorage.getItem(LEGACY_RESULT_KEY); // backward compat
        }
        return safeParse(raw, fallback === undefined ? null : fallback);
      } catch (e) {
        return fallback === undefined ? null : fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(fullKey(key), JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
    del: function (key) {
      try {
        localStorage.removeItem(fullKey(key));
        return true;
      } catch (e) {
        return false;
      }
    },
    // Append entry to a capped array (history). Returns the array.
    pushCapped: function (key, entry, maxLen) {
      var arr = this.get(key, []);
      if (!Array.isArray(arr)) arr = [];
      arr.push(entry);
      if (arr.length > maxLen) arr = arr.slice(arr.length - maxLen);
      this.set(key, arr);
      return arr;
    }
  };

  window.ToeflStore = ToeflStore;
})();

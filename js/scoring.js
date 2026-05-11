/**
 * scoring.js - Module 1: TOEFL ITP-like Scoring Conversion Table
 *
 * Implements lookup-table-based scoring that mirrors the official
 * TOEFL ITP scaled score conversion (ETS-inspired, not official).
 *
 * Sections:
 *  - Listening Comprehension : 50 questions → scaled 31–68
 *  - Structure & Written Expr: 40 questions → scaled 31–68
 *  - Reading Comprehension   : 50 questions → scaled 31–67
 *
 * Total ITP-like score = ((L + S + R) × 10) / 3  → rounded to nearest 10
 * Range: 310–677
 *
 * CEFR Mapping:
 *  C1 Advanced          : ≥ 627
 *  B2 Upper-Intermediate: 543–626
 *  B1 Intermediate      : 460–542
 *  A2 Elementary        : 337–459
 *  A1 Beginner          : < 337
 */

// ─── LISTENING CONVERSION TABLE (50 questions → scale 31-68) ───
// Index = number of correct answers (0–50)
const LISTENING_TABLE = [
  31, 31, 31, 31, 31, // 0–4
  32, 32, 33, 33, 34, // 5–9
  35, 35, 36, 36, 37, // 10–14
  38, 38, 39, 40, 41, // 15–19
  42, 42, 43, 44, 45, // 20–24
  46, 47, 47, 48, 49, // 25–29
  50, 51, 52, 52, 53, // 30–34
  54, 55, 56, 57, 57, // 35–39
  58, 59, 60, 61, 62, // 40–44
  63, 64, 65, 66, 67, // 45–49
  68                   // 50
];

// ─── STRUCTURE CONVERSION TABLE (40 questions → scale 31-68) ───
// Index = number of correct answers (0–40)
const STRUCTURE_TABLE = [
  31, 31, 31, 32, 33, // 0–4
  34, 35, 36, 36, 37, // 5–9
  38, 39, 40, 41, 42, // 10–14
  43, 44, 45, 46, 47, // 15–19
  48, 49, 50, 51, 52, // 20–24
  53, 54, 55, 56, 57, // 25–29
  58, 59, 60, 61, 62, // 30–34
  63, 64, 65, 66, 67, // 35–39
  68                   // 40
];

// ─── READING CONVERSION TABLE (50 questions → scale 31-67) ───
// Index = number of correct answers (0–50)
const READING_TABLE = [
  31, 31, 31, 31, 32, // 0–4
  32, 33, 33, 34, 34, // 5–9
  35, 36, 37, 37, 38, // 10–14
  39, 40, 41, 41, 42, // 15–19
  43, 44, 45, 45, 46, // 20–24
  47, 48, 49, 50, 51, // 25–29
  52, 53, 54, 55, 56, // 30–34
  57, 58, 59, 60, 61, // 35–39
  62, 63, 64, 65, 65, // 40–44
  66, 66, 67, 67, 67, // 45–49
  67                   // 50
];

/**
 * Convert raw correct answers to ITP scaled score using lookup table.
 * Handles any number of questions by interpolating against the table.
 * @param {number} correct - Number of correct answers
 * @param {number} total   - Total number of questions in the section
 * @param {number[]} table - Conversion table array
 * @returns {number} Scaled score
 */
function rawToScaled(correct, total, table) {
  if (!total || total <= 0) return table[0];
  // If the test has exactly the same # of questions as the table, direct lookup
  if (total === table.length - 1) {
    const idx = Math.max(0, Math.min(correct, table.length - 1));
    return table[idx];
  }
  // Otherwise: interpolate by mapping correct/total → 0..tableMax index
  const tableMax = table.length - 1;
  const ratio = Math.min(1, Math.max(0, correct / total));
  const idx = Math.round(ratio * tableMax);
  return table[Math.max(0, Math.min(idx, tableMax))];
}

/**
 * Calculate ITP-like scaled score for each section.
 * @param {object} listening  - { score, total }
 * @param {object} structure  - { score, total }
 * @param {object} reading    - { score, total }
 * @returns {object} { listeningScale, structureScale, readingScale, totalScore, level, band }
 */
function calculateITPScore(listening, structure, reading) {
  const listeningScale = rawToScaled(
    listening.score || 0,
    listening.total || 50,
    LISTENING_TABLE
  );
  const structureScale = rawToScaled(
    structure.score || 0,
    structure.total || 40,
    STRUCTURE_TABLE
  );
  const readingScale = rawToScaled(
    reading.score || 0,
    reading.total || 50,
    READING_TABLE
  );

  const rawTotal = ((listeningScale + structureScale + readingScale) * 10) / 3;
  const totalScore = Math.round(rawTotal / 10) * 10; // round to nearest 10

  const band = getCEFRBand(totalScore);

  return {
    listeningScale,
    structureScale,
    readingScale,
    totalScore,
    level: band.level,
    label: band.label,
    color: band.color
  };
}

/**
 * Legacy wrapper used by app.js (keeps backward compatibility).
 */
function calculateEstimatedITPScore(listening, structure, reading) {
  return calculateITPScore(listening, structure, reading);
}

/**
 * Get CEFR band from total ITP-like score.
 */
function getCEFRBand(total) {
  if (total >= 627) return { level: 'C1', label: 'Advanced',            color: '#10b981' };
  if (total >= 543) return { level: 'B2', label: 'Upper-Intermediate',  color: '#3b82f6' };
  if (total >= 460) return { level: 'B1', label: 'Intermediate',        color: '#f59e0b' };
  if (total >= 337) return { level: 'A2', label: 'Elementary',          color: '#ef4444' };
  return             { level: 'A1', label: 'Beginner',              color: '#6b7280' };
}

/**
 * Legacy function used by app.js getEstimatedITPLevel.
 */
function getEstimatedITPLevel(score) {
  const band = getCEFRBand(score);
  return band.level + ' / ' + band.label;
}

/**
 * Get score color for UI (green=good, yellow=medium, red=low).
 */
function getScoreColor(total) {
  if (total >= 600) return '#10b981';
  if (total >= 500) return '#3b82f6';
  if (total >= 400) return '#f59e0b';
  return '#ef4444';
}

// OCR accuracy only exists for readings the OCR actually scored.
//
// A reading typed in by hand has no score, but it reached the pages as either null
// (seeded rows) or 0 (the Add Meter Reading form used to send 0), and every page
// read that as "0% accurate". On the demo data "Low OCR Accuracy" showed 25 when only
// 5 photo readings were genuinely under 90%, and one building's average was dragged
// down to 58%. No OCR run returns exactly 0 confidence, so anything not above 0 means
// "not scored" and is left out of accuracy figures entirely.

export const OCR_ACCURACY_THRESHOLD = 90;

/** The OCR score as a number, or null for a reading that was never scored. */
export function getOcrScore(accuracy) {
  const value = Number(accuracy);

  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isManualReading(reading) {
  return getOcrScore(reading?.ocr_accuracy) === null;
}

export function isLowOcrAccuracy(reading) {
  const score = getOcrScore(reading?.ocr_accuracy);

  return score !== null && score < OCR_ACCURACY_THRESHOLD;
}

export function isHighOcrAccuracy(reading) {
  const score = getOcrScore(reading?.ocr_accuracy);

  return score !== null && score >= OCR_ACCURACY_THRESHOLD;
}

/** Rounded mean over scored readings only; null when none were scored. */
export function getAverageOcrAccuracy(readings) {
  let total = 0;
  let count = 0;

  for (const reading of readings || []) {
    const score = getOcrScore(reading.ocr_accuracy);

    if (score !== null) {
      total += score;
      count += 1;
    }
  }

  return count ? Math.round(total / count) : null;
}

/** "93%", or "Manual" when there is no score. */
export function formatOcrAccuracy(accuracy) {
  const score = getOcrScore(accuracy);

  return score === null ? "Manual" : `${Math.round(score)}%`;
}

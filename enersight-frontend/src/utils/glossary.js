// Plain-language definitions for every term the interface uses that a reader
// cannot be assumed to know.
//
// Why this file exists: "EUI" appeared 39 times across the pages and was never
// once spelled out where a user could see it. The meaning lived in source
// comments, which is the one place the people using the system never look.
//
// Rules for writing an entry:
//   · `term`       what the label says, expanded - no acronym on its own.
//   · `definition` one sentence, no jargon inside the jargon. If you need another
//                  defined term to explain it, the sentence is too clever.
//   · `soWhat`     what the reader should DO or conclude. A definition that ends
//                  without this leaves them no better off than the acronym did.
//
// Keep the wording identical everywhere a term appears. Two phrasings of the
// same concept reads as two concepts.

export const GLOSSARY = {
  eui: {
    term: "Energy Use Intensity (EUI)",
    definition:
      "Electricity used per square metre of floor area over a year, in kWh/m²/yr.",
    soWhat:
      "It lets a small building and a large one be compared fairly - a big building using more electricity is not automatically a problem.",
  },

  euiStatus: {
    term: "Energy status",
    definition:
      "A building's grade from its intensity: Normal up to 150, High above 150, Critical above 250 kWh/m²/yr.",
    soWhat: "Critical buildings are the ones to look at first.",
  },

  annualised: {
    term: "Annualised",
    definition:
      "A figure scaled up to a full year from the days the readings actually cover.",
    soWhat:
      "Two months of readings and two years of readings can then be compared on the same scale. Spans under 20 days are left alone, because scaling them up exaggerates.",
  },

  measuredVsEstimated: {
    term: "Measured vs estimated",
    definition:
      "Measured electricity comes from meter readings. Estimated comes from appliance lists - watts x quantity x hours.",
    soWhat:
      "The two are never added together. A gap between them usually means an appliance list is out of date, not that a meter is wrong.",
  },

  ocrAccuracy: {
    term: "Photo reading confidence",
    definition:
      "How sure the system is that it read the digits on a meter photo correctly, from 0 to 100%.",
    soWhat:
      "Below 90% the photo is worth opening and checking by eye. A reading typed in by hand has no score at all, which is not the same as scoring zero.",
  },

  needsReview: {
    term: "Needs review",
    definition:
      "A saved reading nobody has confirmed yet, or a photo the system read with low confidence.",
    soWhat:
      "These still count in the totals. Confirming them is what makes a report safe to hand over.",
  },

  ratePerKwh: {
    term: "Electricity rate",
    definition: "The peso amount charged per kWh, set once for the whole system.",
    soWhat:
      "Every cost figure on every page uses it, so changing it in Settings changes them all together.",
  },

  forecastMethod: {
    term: "Forecast method",
    definition:
      "The system tries three ways of predicting next month and shows the one that has been most accurate on your own past readings.",
    soWhat:
      "Which one wins depends on the data, so it can change as more readings come in.",
  },

  levelForecast: {
    term: "Why every month shows the same figure",
    definition:
      "All three methods estimate a level rather than a direction, so they project one figure and repeat it across the horizon.",
    soWhat:
      "Read it as \"consumption should hold around here\", not as a month-by-month prediction. Following a rising or seasonal curve would need a method with a trend term, which this study places outside its scope.",
  },

  backTest: {
    term: "Accuracy check",
    definition:
      "Each method is asked to predict months that have already happened, using only the months before them, and its answers are compared with what really occurred.",
    soWhat:
      "It is how the system decides which method to trust, rather than just asserting one.",
  },

  mape: {
    term: "Average error (MAPE)",
    definition:
      "How far off a method's predictions were on average, as a percentage of the real figure.",
    soWhat: "Lower is better. This is the number used to pick the leading method.",
  },

  mae: {
    term: "Average error in kWh (MAE)",
    definition:
      "How far off the predictions were on average, counted in kWh rather than as a percentage.",
    soWhat: "Lower is better.",
  },

  rmse: {
    term: "Large-miss error (RMSE)",
    definition:
      "Like the average error, but it counts one big miss much more heavily than several small ones.",
    soWhat:
      "Lower is better. A method with a low average error but a high RMSE is usually wrong badly, if rarely.",
  },

  r2: {
    term: "Fit score (R²)",
    definition:
      "How much better a method does than simply guessing the average of the months being tested.",
    soWhat:
      "1.00 is perfect. Below zero means it did worse than that plain average - normal over a short test window, and not a fault.",
  },
};

/** The one-line form used in a tooltip: what it is, then why it matters. */
export function getGlossaryText(key) {
  const entry = GLOSSARY[key];

  if (!entry) {
    return "";
  }

  return `${entry.definition} ${entry.soWhat}`;
}

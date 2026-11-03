// Population reference data behind the stat tiers. Kept in one file, apart from
// the maths in stats.js, because the sources will change: swap a table here (or
// a whole metric) and every tier, curve and footnote follows.
//
// Each metric gives its distribution as CDF breakpoints — [value, percentile] —
// read off published tables or summary figures and interpolated between. They
// are approximations of the shape, not the original microdata, and each says so.
// A metric with `scale: "game"` has no good population data: its breakpoints
// are the guild's own ladder, and the page labels it that way.

export const NORMS_VERSION = "2026-11-03";

/** Push-up category cut-offs (Poor ≤, Fair ≤, Good ≤, Very good ≤, Excellent ≥). Women's are the modified (knee) test. */
const PUSHUPS = {
  male: { "20-29": [16, 21, 28, 35, 36], "30-39": [11, 16, 21, 29, 30], "40-49": [9, 12, 16, 24, 25], "50-59": [6, 9, 12, 20, 21], "60-69": [4, 7, 10, 17, 18] },
  female: { "20-29": [9, 14, 20, 29, 30], "30-39": [7, 12, 19, 26, 27], "40-49": [4, 10, 14, 23, 24], "50-59": [1, 6, 10, 20, 21], "60-69": [1, 4, 11, 16, 17] },
};

/** The five categories are roughly quintiles; the top end is stretched to ~1.6× "excellent" for the 98th percentile. */
function pushupCdf({ sex = "male", ageBand = "20-29" } = {}) {
  const t = (PUSHUPS[sex] || PUSHUPS.male)[ageBand] || PUSHUPS.male["20-29"];
  return [[0, 1], [t[0], 20], [t[1], 40], [t[2], 60], [t[3], 80], [Math.round(t[4] * 1.6), 98], [t[4] * 2.5, 99.7]];
}

export const METRICS = {
  pushups: {
    label: "Push-ups in one set",
    unit: "reps",
    scale: "population",
    cdf: pushupCdf,
    source: "Canadian Physical Activity, Fitness & Lifestyle Approach push-up norms, as reprinted in ACSM's Guidelines for Exercise Testing and Prescription. Category cut-offs by age and sex; percentiles between them are interpolated.",
  },
  steps: {
    label: "Average steps a day",
    unit: "steps",
    scale: "population",
    cdf: () => [[0, 0], [1500, 6], [3000, 22], [5000, 50], [7500, 76], [10000, 90], [12500, 96], [16000, 99]],
    source: "Althoff et al. (2017), Nature 547: smartphone data from 717,000 people in 111 countries, worldwide mean ≈ 4,961 steps a day. The spread around that mean is an assumed right-skewed shape, not their published distribution.",
  },
  books: {
    label: "Books finished in the last 12 months",
    unit: "books",
    scale: "population",
    cdf: () => [[0, 23], [1, 30], [3, 42], [5, 50], [12, 72], [24, 87], [50, 96], [100, 99.5]],
    source: "Pew Research Center (2021), US adults: 23% read no book in the past year, median 5, mean 14. Points between are interpolated to fit those figures.",
  },
  activeMinutes: {
    label: "Moderate-to-vigorous minutes a week",
    unit: "min/week",
    scale: "population",
    cdf: () => [[0, 8], [30, 15], [75, 22], [150, 31], [300, 62], [450, 82], [600, 91], [900, 98]],
    source: "WHO (2022): 31% of adults worldwide don't meet the 150 min/week guideline (Lancet Global Health, Strain et al. 2024). Above that, the shape is assumed.",
  },
  places: {
    label: "New places explored (GPS check-ins)",
    unit: "places",
    scale: "game",
    cdf: () => [[0, 0], [1, 10], [3, 30], [6, 50], [10, 70], [20, 85], [35, 95], [60, 99]],
    source: "Guild ladder: no population data. Counts distinct check-in quests.",
  },
  reflections: {
    label: "Reflection quests done",
    unit: "quests",
    scale: "game",
    cdf: () => [[0, 0], [1, 10], [3, 30], [6, 50], [12, 70], [24, 85], [40, 95], [70, 99]],
    source: "Guild ladder: no population data. Counts finished quests weighted to WIS. The journal itself is never read for this.",
  },
  social: {
    label: "Social quests done",
    unit: "quests",
    scale: "game",
    cdf: () => [[0, 0], [1, 10], [3, 30], [6, 50], [12, 70], [24, 85], [40, 95], [70, 99]],
    source: "Guild ladder: no population data. Counts finished quests weighted to CHA.",
  },
  tasksPerWeek: {
    label: "Tasks finished a week (last 8 weeks)",
    unit: "tasks/week",
    scale: "game",
    cdf: () => [[0, 0], [0.5, 10], [1, 30], [2, 50], [4, 70], [7, 85], [12, 95], [20, 99]],
    source: "Guild ladder: no population data. From the completed history in both task repos.",
  },
};

/** The status screen: each attribute reads one metric. */
export const ATTRIBUTES = [
  { id: "str", name: "STR", label: "Strength", metric: "pushups" },
  { id: "vit", name: "VIT", label: "Vitality", metric: "activeMinutes" },
  { id: "agi", name: "AGI", label: "Wayfaring", metric: "places" },
  { id: "int", name: "INT", label: "Intellect", metric: "books" },
  { id: "wis", name: "WIS", label: "Wisdom", metric: "reflections" },
  { id: "cha", name: "CHA", label: "Charisma", metric: "social" },
  { id: "wil", name: "WIL", label: "Will", metric: "tasksPerWeek" },
];

export const AGE_BANDS = ["20-29", "30-39", "40-49", "50-59", "60-69"];

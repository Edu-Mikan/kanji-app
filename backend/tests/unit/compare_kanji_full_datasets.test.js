const test = require("node:test");

const assert = require("node:assert/strict");

const {
  getStrokeCount,
  compareKanjiEntry,
  buildComparisonReport,
} = require("../../scripts/compare_kanji_full_datasets");

test("getStrokeCount should return null for missing entries", () => {
  assert.equal(getStrokeCount({}, "田"), null);
});

test("getStrokeCount should return stroke array length", () => {
  assert.equal(
    getStrokeCount(
      {
        田: [
          {
            x: [0, 1],
            y: [0, 1],
          },
        ],
      },
      "田",
    ),
    1,
  );
});

test("compareKanjiEntry should detect stroke count changes", () => {
  const result = compareKanjiEntry({
    kanji: "田",

    baseline: {
      田: [
        {
          x: [0, 1],
          y: [0, 1],
        },
      ],
    },

    candidate: {
      田: [
        {
          x: [0, 1],
          y: [0, 1],
        },
        {
          x: [0, 1],
          y: [1, 0],
        },
      ],
    },
  });

  assert.equal(result.strokeCountChanged, true);

  assert.equal(result.baselineStrokeCount, 1);

  assert.equal(result.candidateStrokeCount, 2);
});

test("buildComparisonReport should summarize dataset differences", () => {
  const report = buildComparisonReport({
    baselinePath: "./old.json",

    candidatePath: "./new.json",

    baseline: {
      一: [
        {
          x: [0, 1],
          y: [0, 0],
        },
      ],
    },

    candidate: {
      一: [
        {
          x: [0, 1],
          y: [0, 0],
        },
      ],

      田: [
        {
          x: [0, 1],
          y: [0, 1],
        },
      ],
    },
  });

  assert.equal(report.counts.baseline, 1);

  assert.equal(report.counts.candidate, 2);

  assert.equal(report.counts.onlyInCandidate, 1);

  assert.equal(report.counts.inBoth, 1);
});

test("compareKanjiEntry should not count missing candidate entries as stroke count changes", () => {
  const result = compareKanjiEntry({
    kanji: "あ",

    baseline: {
      あ: [
        {
          x: [0, 1],
          y: [0, 1],
        },
      ],
    },

    candidate: {},
  });

  assert.equal(result.existsInBaseline, true);

  assert.equal(result.existsInCandidate, false);

  assert.equal(result.strokeCountChanged, false);

  assert.equal(result.excludedFromCandidate, true);
});

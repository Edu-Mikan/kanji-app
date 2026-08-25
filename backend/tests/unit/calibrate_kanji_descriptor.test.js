const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  calculateMedian,
  calculateMean,
  calculatePercentile,
  summarizeNumericValues,
  buildReferenceFeaturesForKanji,
  collectReferenceComparisonValues,
  summarizeReferenceComparisonValues,
  collectPerStrokeReferenceComparisonValues,
  summarizePerStrokeReferenceComparisonValues,
  buildPerRoleReferenceComparisonMap,
  buildSampleEvaluationEntry,
  buildSampleEvaluationEntries,
} = require("../../scripts/calibrate_kanji_descriptor");

function assertApproximatelyEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `Expected ${actual} to be approximately ${expected}`,
  );
}

test("calculateMedian should support odd value counts", () => {
  assert.equal(calculateMedian([3, 1, 2]), 2);
});

test("calculateMedian should support even value counts", () => {
  assert.equal(calculateMedian([4, 1, 3, 2]), 2.5);
});

test("calculateMean should calculate the numeric average", () => {
  assert.equal(calculateMean([1, 2, 3, 4]), 2.5);
});

test("calculatePercentile should interpolate values", () => {
  assert.equal(calculatePercentile([0, 10], 0.25), 2.5);
});

test("summarizeNumericValues should ignore invalid values", () => {
  const summary = summarizeNumericValues([
    1,
    2,
    null,
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    3,
  ]);

  assert.deepEqual(summary, {
    count: 3,
    min: 1,
    p05: 1.1,
    p25: 1.5,
    median: 2,
    mean: 2,
    p75: 2.5,
    p95: 2.9,
    max: 3,
  });
});

test("summarizeNumericValues should return null without numeric values", () => {
  assert.equal(summarizeNumericValues([null, undefined, Number.NaN]), null);
});

test("collectReferenceComparisonValues should group global comparison metrics by classification", () => {
  const values = collectReferenceComparisonValues([
    {
      classification: "truePositive",
      referenceComparison: {
        comparisonCost: 0.1,
        meanStrokeCost: 0.1,
        meanRoleCost: 0.12,
        maxRoleCost: 0.2,
        strokeCountDiff: 0,
        comparedRoleCount: 5,
        missingRoleCount: 0,
      },
    },
    {
      classification: "falsePositive",
      referenceComparison: {
        comparisonCost: 0.8,
        meanStrokeCost: 0.8,
        strokeCountDiff: 0,
      },
    },
  ]);

  assert.deepEqual(values.truePositive.comparisonCost, [0.1]);

  assert.deepEqual(values.falsePositive.comparisonCost, [0.8]);

  assert.deepEqual(values.truePositive.meanRoleCost, [0.12]);

  assert.deepEqual(values.truePositive.maxRoleCost, [0.2]);

  assert.deepEqual(values.truePositive.comparedRoleCount, [5]);

  assert.deepEqual(values.truePositive.missingRoleCount, [0]);
});

test("summarizeReferenceComparisonValues should summarize comparison metrics", () => {
  const summary = summarizeReferenceComparisonValues({
    truePositive: {
      comparisonCost: [0.1, 0.2],
      meanStrokeCost: [0.1, 0.2],
      meanRoleCost: [0.1, 0.3],
      maxRoleCost: [0.2, 0.4],
      strokeCountDiff: [0, 0],
      comparedRoleCount: [5, 5],
      missingRoleCount: [0, 1],
    },
    falseNegative: {
      comparisonCost: [],
      meanStrokeCost: [],
      strokeCountDiff: [],
    },
    trueNegative: {
      comparisonCost: [],
      meanStrokeCost: [],
      strokeCountDiff: [],
    },
    falsePositive: {
      comparisonCost: [],
      meanStrokeCost: [],
      strokeCountDiff: [],
    },
  });

  assert.equal(summary.truePositive.comparisonCost.count, 2);

  assertApproximatelyEqual(summary.truePositive.comparisonCost.median, 0.15);

  assertApproximatelyEqual(summary.truePositive.meanRoleCost.median, 0.2);

  assertApproximatelyEqual(summary.truePositive.maxRoleCost.median, 0.3);

  assert.equal(summary.truePositive.comparedRoleCount.median, 5);

  assertApproximatelyEqual(summary.truePositive.missingRoleCount.median, 0.5);
});

test("collectPerStrokeReferenceComparisonValues should group metrics by reference stroke", () => {
  const values = collectPerStrokeReferenceComparisonValues([
    {
      classification: "truePositive",
      referenceComparison: {
        perStrokeComparisons: [
          {
            referenceStrokeIndex: 0,
            comparisonCost: 0.1,
            metrics: {
              angleAbsDiff: 0.01,
              centerDistance: 0.02,
            },
          },
        ],
      },
    },
  ]);

  assert.deepEqual(values.truePositive.referenceStroke_0.comparisonCost, [0.1]);

  assert.deepEqual(values.truePositive.referenceStroke_0.angleAbsDiff, [0.01]);
});

test("summarizePerStrokeReferenceComparisonValues should summarize per-stroke metrics", () => {
  const summary = summarizePerStrokeReferenceComparisonValues({
    truePositive: {
      referenceStroke_0: {
        comparisonCost: [0.1, 0.3],
        angleAbsDiff: [0.01, 0.03],
        centerDistance: [],
        widthRelativeDiff: [],
        heightRelativeDiff: [],
        deltaXRelativeDiff: [],
        deltaYRelativeDiff: [],
        straightnessDiff: [],
      },
    },
    falseNegative: {},
    trueNegative: {},
    falsePositive: {},
  });

  assert.equal(
    summary.truePositive.referenceStroke_0.comparisonCost.median,
    0.2,
  );

  assert.equal(summary.truePositive.referenceStroke_0.angleAbsDiff.max, 0.03);
});
test("collectPerStrokeReferenceComparisonValues should group descriptor role comparisons by role id", () => {
  const values = collectPerStrokeReferenceComparisonValues([
    {
      classification: "truePositive",
      referenceComparison: {
        perRoleComparisons: [
          {
            roleId: "innerVerticalStroke",
            referenceStrokeIndex: 2,
            comparisonCost: 0.4,
            metrics: {
              angleAbsDiff: 0.01,
              centerDistance: 0.02,
            },
          },
        ],
      },
    },
  ]);

  assert.deepEqual(
    values.truePositive.role_innerVerticalStroke.comparisonCost,
    [0.4],
  );

  assert.deepEqual(
    values.truePositive.role_innerVerticalStroke.angleAbsDiff,
    [0.01],
  );
});

test("buildPerRoleReferenceComparisonMap should expose per-role metrics by role key", () => {
  const result = buildPerRoleReferenceComparisonMap({
    perRoleComparisons: [
      {
        roleId: "bottomStroke",
        comparisonCost: 0.2,
        metrics: {
          centerDistance: 0.25,
          angleAbsDiff: 0.03,
        },
      },
    ],
  });

  assert.deepEqual(result, {
    role_bottomStroke: {
      comparisonCost: 0.2,
      centerDistance: 0.25,
      angleAbsDiff: 0.03,
    },
  });
});

test("buildSampleEvaluationEntry should include per-sample reference comparisons", () => {
  const entry = buildSampleEvaluationEntry({
    classification: "falsePositive",

    sample: {
      recognitionId: "sample-1",
      expectedKanji: "田",
      isCorrect: false,
    },

    validation: {
      isCorrect: true,
      hardFailedChecks: [],
    },

    referenceComparison: {
      comparisonCost: 0.42,
      meanRoleCost: 0.42,
      maxRoleCost: 0.72,
      strokeCountDiff: 0,
      comparedRoleCount: 5,
      missingRoleCount: 0,
      perRoleComparisons: [
        {
          roleId: "bottomStroke",
          comparisonCost: 0.2,
          metrics: {
            centerDistance: 0.25,
          },
        },
      ],
    },
  });

  assert.equal(entry.recognitionId, "sample-1");
  assert.equal(entry.kanji, "田");
  assert.equal(entry.classification, "falsePositive");
  assert.equal(entry.expectedCorrect, false);
  assert.equal(entry.actualAccepted, true);

  assert.equal(entry.referenceComparison.comparisonCost, 0.42);

  assert.equal(
    entry.perRoleReferenceComparison.role_bottomStroke.centerDistance,
    0.25,
  );
});

test("buildSampleEvaluationEntries should preserve one entry per evaluation", () => {
  const entries = buildSampleEvaluationEntries([
    {
      classification: "truePositive",
      sample: {
        recognitionId: "sample-1",
        expectedKanji: "田",
        isCorrect: true,
      },
      validation: {
        isCorrect: true,
      },
      referenceComparison: {
        comparisonCost: 0.1,
        perRoleComparisons: [],
      },
    },
    {
      classification: "falsePositive",
      sample: {
        recognitionId: "sample-2",
        expectedKanji: "田",
        isCorrect: false,
      },
      validation: {
        isCorrect: true,
      },
      referenceComparison: {
        comparisonCost: 0.4,
        perRoleComparisons: [],
      },
    },
  ]);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].classification, "truePositive");
  assert.equal(entries[1].classification, "falsePositive");
});
test("parseArgs uses the incremental reference catalog by default", () => {
  const options = parseArgs([]);

  assert.equal(options.datasetPath, DEFAULT_KANJI_DATASET_PATH);

  assert.equal(
    options.datasetPath.endsWith("kanji_reference_catalog.json"),
    true,
  );
});

test("parseArgs preserves an explicit legacy dataset path", () => {
  const options = parseArgs(["--dataset", "./kanji_full.json"]);

  assert.equal(options.datasetPath.endsWith("kanji_full.json"), true);
});

function createTemporaryReferenceDataset({ fileName }) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-calibration-reference-"),
  );

  const datasetPath = path.join(directory, fileName);

  fs.writeFileSync(
    datasetPath,
    JSON.stringify(
      {
        一: [
          {
            x: [0, 1],
            y: [0, 0],
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    directory,
    datasetPath,
  };
}

test("buildReferenceFeaturesForKanji records the incremental catalog source", (t) => {
  const fixture = createTemporaryReferenceDataset({
    fileName: "kanji_reference_catalog.json",
  });

  t.after(() => {
    fs.rmSync(fixture.directory, {
      recursive: true,
      force: true,
    });
  });

  const result = buildReferenceFeaturesForKanji({
    kanji: "一",
    datasetPath: fixture.datasetPath,
  });

  assert.equal(result.source, "kanji_reference_catalog.json");
});

test("buildReferenceFeaturesForKanji preserves an explicit legacy source", (t) => {
  const fixture = createTemporaryReferenceDataset({
    fileName: "kanji_full.json",
  });

  t.after(() => {
    fs.rmSync(fixture.directory, {
      recursive: true,
      force: true,
    });
  });

  const result = buildReferenceFeaturesForKanji({
    kanji: "一",
    datasetPath: fixture.datasetPath,
  });

  assert.equal(result.source, "kanji_full.json");
});

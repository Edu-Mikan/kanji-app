"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  loadJsonlDataset,
  getExpectedClassification,
  getDescriptorPredictionFromClassification,
  validateDatasetRow,
  validateDatasetRows,
  determineFeatureNames,
  detectPotentialLeakageFeatures,
  calculateFeaturePresence,
  groupDatasetEntriesByTargetKanji,
  buildFeatureNamesByTargetKanji,
  calculateFeatureTargetKanjiPresence,
  calculateLabelCounts,
  buildTargetKanjiFeatureCoverage,
  findLowFeatureRows,
  calculateDescriptorMetrics,
  compareArrays,
  compareInspectionWithSummary,
  safeDivide,
} = require("../../scripts/train_reference_candidate_baseline_model");

function createValidRow(overrides = {}) {
  return {
    recognitionId: "recognition-1",
    targetKanji: "木",
    expectedKanji: "木",
    sampleIsCorrect: true,
    classification: "truePositive",
    label: 1,
    features: {
      "referenceComparison.comparisonCost": 0.1,
      "referenceComparison.meanRoleCost": 0.2,
    },
    ...overrides,
  };
}

function validateRow(row, lineNumber = 1) {
  return validateDatasetRow({
    row,
    lineNumber,
  });
}

test("loadJsonlDataset loads valid non-empty JSONL lines", (t) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-baseline-jsonl-"),
  );

  t.after(() => {
    fs.rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  });

  const datasetPath = path.join(temporaryDirectory, "dataset.jsonl");

  const firstRow = createValidRow();

  const secondRow = createValidRow({
    recognitionId: "recognition-2",
    sampleIsCorrect: false,
    classification: "trueNegative",
    label: 0,
  });

  fs.writeFileSync(
    datasetPath,
    [JSON.stringify(firstRow), "", JSON.stringify(secondRow), ""].join("\n"),
    "utf8",
  );

  const rows = loadJsonlDataset(datasetPath);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].lineNumber, 1);
  assert.equal(rows[0].row.recognitionId, "recognition-1");
  assert.equal(rows[1].lineNumber, 3);
  assert.equal(rows[1].row.recognitionId, "recognition-2");
});

test("loadJsonlDataset reports the invalid JSONL line", (t) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kanji-baseline-invalid-jsonl-"),
  );

  t.after(() => {
    fs.rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  });

  const datasetPath = path.join(temporaryDirectory, "dataset.jsonl");

  fs.writeFileSync(
    datasetPath,
    [JSON.stringify(createValidRow()), '{"invalidJson":'].join("\n"),
    "utf8",
  );

  assert.throws(() => loadJsonlDataset(datasetPath), /Invalid JSONL at line 2/);
});

test("validateDatasetRow accepts a valid positive row", () => {
  const result = validateRow(createValidRow());

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validateDatasetRow rejects an invalid binary label", () => {
  const result = validateRow(
    createValidRow({
      label: 2,
    }),
  );

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /label must be either 0 or 1/);
});

test("validateDatasetRow detects label and sampleIsCorrect mismatch", () => {
  const result = validateRow(
    createValidRow({
      sampleIsCorrect: true,
      label: 0,
      classification: "trueNegative",
    }),
  );

  assert.ok(
    result.errors.some((error) =>
      error.includes("label=0 is inconsistent with sampleIsCorrect=true"),
    ),
  );
});

test("descriptor classification is converted into its binary prediction", () => {
  assert.equal(getDescriptorPredictionFromClassification("truePositive"), 1);

  assert.equal(getDescriptorPredictionFromClassification("falsePositive"), 1);

  assert.equal(getDescriptorPredictionFromClassification("trueNegative"), 0);

  assert.equal(getDescriptorPredictionFromClassification("falseNegative"), 0);

  assert.throws(
    () =>
      getDescriptorPredictionFromClassification("unsupportedClassification"),
    /Unsupported descriptor classification/,
  );
});

test("getExpectedClassification builds the four confusion matrix cases", () => {
  assert.equal(
    getExpectedClassification({
      label: 1,
      descriptorPrediction: 1,
    }),
    "truePositive",
  );

  assert.equal(
    getExpectedClassification({
      label: 1,
      descriptorPrediction: 0,
    }),
    "falseNegative",
  );

  assert.equal(
    getExpectedClassification({
      label: 0,
      descriptorPrediction: 1,
    }),
    "falsePositive",
  );

  assert.equal(
    getExpectedClassification({
      label: 0,
      descriptorPrediction: 0,
    }),
    "trueNegative",
  );
});

test("validateDatasetRow detects an inconsistent classification", () => {
  const result = validateRow(
    createValidRow({
      sampleIsCorrect: false,
      label: 0,
      classification: "truePositive",
    }),
  );

  assert.ok(
    result.errors.some((error) =>
      error.includes(
        'classification="truePositive" is inconsistent with label=0',
      ),
    ),
  );
});

test("validateDatasetRow rejects non-finite feature values", () => {
  const values = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    null,
    "0.1",
  ];

  for (const value of values) {
    const result = validateRow(
      createValidRow({
        features: {
          "referenceComparison.comparisonCost": value,
        },
      }),
    );

    assert.ok(
      result.errors.some((error) =>
        error.includes(
          'feature "referenceComparison.comparisonCost" must be a finite number',
        ),
      ),
    );
  }
});

test("determineFeatureNames creates a sorted union of sparse features", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        features: {
          "feature.z": 0.3,
          "feature.a": 0.1,
        },
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "recognition-2",
        features: {
          "feature.m": 0.2,
          "feature.a": 0.4,
        },
      }),
    },
  ];

  const featureNames = determineFeatureNames(datasetEntries);

  assert.deepEqual(featureNames, ["feature.a", "feature.m", "feature.z"]);

  const presence = calculateFeaturePresence(datasetEntries, featureNames);

  assert.deepEqual(presence, {
    "feature.a": 2,
    "feature.m": 1,
    "feature.z": 1,
  });
});

test("detectPotentialLeakageFeatures reports suspicious feature names", () => {
  const featureNames = [
    "referenceComparison.comparisonCost",
    "metadata.predictedResult",
    "sample.correctLabel",
    "perRole.stroke0.angleAbsDiff",
  ];

  const suspiciousFeatures = detectPotentialLeakageFeatures(featureNames);

  assert.deepEqual(suspiciousFeatures, [
    "metadata.predictedResult",
    "sample.correctLabel",
  ]);
});

test("calculateDescriptorMetrics calculates confusion matrix metrics", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        recognitionId: "tp",
        sampleIsCorrect: true,
        label: 1,
        classification: "truePositive",
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "fn",
        sampleIsCorrect: true,
        label: 1,
        classification: "falseNegative",
      }),
    },
    {
      lineNumber: 3,
      row: createValidRow({
        recognitionId: "tn",
        sampleIsCorrect: false,
        label: 0,
        classification: "trueNegative",
      }),
    },
    {
      lineNumber: 4,
      row: createValidRow({
        recognitionId: "fp",
        sampleIsCorrect: false,
        label: 0,
        classification: "falsePositive",
      }),
    },
  ];

  const metrics = calculateDescriptorMetrics(datasetEntries);

  assert.equal(metrics.truePositive, 1);
  assert.equal(metrics.trueNegative, 1);
  assert.equal(metrics.falsePositive, 1);
  assert.equal(metrics.falseNegative, 1);
  assert.equal(metrics.positiveCount, 2);
  assert.equal(metrics.negativeCount, 2);
  assert.equal(metrics.accuracy, 0.5);
  assert.equal(metrics.recall, 0.5);
  assert.equal(metrics.specificity, 0.5);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.falseNegativeRate, 0.5);
  assert.equal(metrics.falsePositiveRate, 0.5);
});

test("compareArrays ignores array order but preserves values and counts", () => {
  assert.equal(
    compareArrays(["feature.b", "feature.a"], ["feature.a", "feature.b"]),
    true,
  );

  assert.equal(compareArrays(["feature.a"], ["feature.a", "feature.b"]), false);

  assert.equal(
    compareArrays(["feature.a", "feature.a"], ["feature.a", "feature.b"]),
    false,
  );
});

test("compareInspectionWithSummary accepts matching dataset metadata", () => {
  const inspection = {
    rowCount: 4,
    targetKanjiCount: 2,
    positiveCount: 3,
    negativeCount: 1,
    featureCount: 2,
    featureNames: ["feature.a", "feature.b"],
    classificationCounts: {
      truePositive: 3,
      trueNegative: 1,
    },
  };

  const summary = {
    rowCount: 4,
    targetKanjiCount: 2,
    positiveCount: 3,
    negativeCount: 1,
    featureCount: 2,
    featureNames: ["feature.b", "feature.a"],
    classificationCounts: {
      truePositive: 3,
      trueNegative: 1,
    },
  };

  const mismatches = compareInspectionWithSummary({
    inspection,
    summary,
  });

  assert.deepEqual(mismatches, []);
});

test("compareInspectionWithSummary reports mismatching values", () => {
  const inspection = {
    rowCount: 4,
    targetKanjiCount: 2,
    positiveCount: 3,
    negativeCount: 1,
    featureCount: 2,
    featureNames: ["feature.a", "feature.b"],
    classificationCounts: {
      truePositive: 3,
      trueNegative: 1,
    },
  };

  const summary = {
    rowCount: 5,
    targetKanjiCount: 2,
    positiveCount: 3,
    negativeCount: 2,
    featureCount: 3,
    featureNames: ["feature.a", "feature.c"],
    classificationCounts: {
      truePositive: 3,
      falsePositive: 1,
      trueNegative: 1,
    },
  };

  const mismatches = compareInspectionWithSummary({
    inspection,
    summary,
  });

  const mismatchingFields = mismatches.map((mismatch) => mismatch.field);

  assert.ok(mismatchingFields.includes("rowCount"));
  assert.ok(mismatchingFields.includes("negativeCount"));
  assert.ok(mismatchingFields.includes("featureCount"));
  assert.ok(mismatchingFields.includes("featureNames"));
  assert.ok(mismatchingFields.includes("classificationCounts.falsePositive"));
});

test("validateDatasetRows aggregates errors from multiple rows", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow(),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "",
      }),
    },
    {
      lineNumber: 3,
      row: createValidRow({
        label: 3,
      }),
    },
  ];

  const result = validateDatasetRows(datasetEntries);

  assert.equal(result.errors.length, 2);

  assert.ok(result.errors.some((error) => error.includes("Line 2")));

  assert.ok(result.errors.some((error) => error.includes("Line 3")));
});

test("safeDivide returns null when denominator is zero", () => {
  assert.equal(safeDivide(10, 0), null);
  assert.equal(safeDivide(1, 2), 0.5);
});

test("groupDatasetEntriesByTargetKanji groups rows by target kanji", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        recognitionId: "wood-1",
        targetKanji: "木",
        expectedKanji: "木",
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "book-1",
        targetKanji: "本",
        expectedKanji: "本",
      }),
    },
    {
      lineNumber: 3,
      row: createValidRow({
        recognitionId: "wood-2",
        targetKanji: "木",
        expectedKanji: "木",
      }),
    },
  ];

  const grouped = groupDatasetEntriesByTargetKanji(datasetEntries);

  assert.equal(grouped.size, 2);
  assert.equal(grouped.get("木").length, 2);
  assert.equal(grouped.get("本").length, 1);
});

test("buildFeatureNamesByTargetKanji builds feature unions per kanji", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        targetKanji: "木",
        expectedKanji: "木",
        features: {
          "feature.shared": 0.1,
          "feature.wood": 0.2,
        },
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "book-1",
        targetKanji: "本",
        expectedKanji: "本",
        features: {
          "feature.shared": 0.3,
          "feature.book": 0.4,
        },
      }),
    },
  ];

  const result = buildFeatureNamesByTargetKanji(datasetEntries);

  assert.deepEqual([...result.get("木")].sort(), [
    "feature.shared",
    "feature.wood",
  ]);

  assert.deepEqual([...result.get("本")].sort(), [
    "feature.book",
    "feature.shared",
  ]);
});

test("calculateFeatureTargetKanjiPresence counts kanji presence per feature", () => {
  const featureNamesByTargetKanji = new Map([
    ["木", new Set(["feature.shared", "feature.wood"])],
    ["本", new Set(["feature.shared", "feature.book"])],
  ]);

  const result = calculateFeatureTargetKanjiPresence(featureNamesByTargetKanji);

  assert.deepEqual(
    [...result.get("feature.shared")].sort(),
    ["木", "本"].sort(),
  );

  assert.deepEqual([...result.get("feature.wood")], ["木"]);

  assert.deepEqual([...result.get("feature.book")], ["本"]);
});

test("calculateLabelCounts counts positive and negative rows", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        recognitionId: "positive-1",
        label: 1,
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "positive-2",
        label: 1,
      }),
    },
    {
      lineNumber: 3,
      row: createValidRow({
        recognitionId: "negative-1",
        sampleIsCorrect: false,
        classification: "trueNegative",
        label: 0,
      }),
    },
  ];

  assert.deepEqual(calculateLabelCounts(datasetEntries), {
    positiveCount: 2,
    negativeCount: 1,
  });
});

test("buildTargetKanjiFeatureCoverage identifies shared and exclusive features", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        recognitionId: "wood-positive",
        targetKanji: "木",
        expectedKanji: "木",
        features: {
          "feature.global": 0.1,
          "feature.partial": 0.2,
          "feature.wood": 0.3,
        },
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "wood-negative",
        targetKanji: "木",
        expectedKanji: "木",
        sampleIsCorrect: false,
        classification: "trueNegative",
        label: 0,
        features: {
          "feature.global": 0.4,
          "feature.wood": 0.5,
        },
      }),
    },
    {
      lineNumber: 3,
      row: createValidRow({
        recognitionId: "book-positive",
        targetKanji: "本",
        expectedKanji: "本",
        features: {
          "feature.global": 0.6,
          "feature.partial": 0.7,
          "feature.book": 0.8,
        },
      }),
    },
    {
      lineNumber: 4,
      row: createValidRow({
        recognitionId: "one-positive",
        targetKanji: "一",
        expectedKanji: "一",
        features: {
          "feature.global": 0.9,
          "feature.one": 1.0,
        },
      }),
    },
  ];

  const featureNames = determineFeatureNames(datasetEntries);

  const coverage = buildTargetKanjiFeatureCoverage(
    datasetEntries,
    featureNames,
  );

  assert.equal(coverage.targetKanjiCount, 3);
  assert.equal(coverage.featureCount, 5);
  assert.equal(coverage.sharedByAllTargetKanjisCount, 1);

  assert.deepEqual(coverage.sharedByAllTargetKanjis, ["feature.global"]);

  assert.equal(coverage.sharedByMultipleTargetKanjisCount, 1);

  assert.equal(coverage.exclusiveFeatureCount, 3);

  assert.deepEqual(coverage.exclusiveFeatures, [
    "feature.book",
    "feature.one",
    "feature.wood",
  ]);

  const woodCoverage = coverage.rows.find((row) => row.targetKanji === "木");

  assert.equal(woodCoverage.rowCount, 2);
  assert.equal(woodCoverage.positiveCount, 1);
  assert.equal(woodCoverage.negativeCount, 1);
  assert.equal(woodCoverage.featureCount, 3);
  assert.equal(woodCoverage.featuresSeenInOtherTargetKanjisCount, 2);
  assert.equal(woodCoverage.featuresUnseenOutsideTargetKanjiCount, 1);
  assert.equal(woodCoverage.featureCoverageFromOtherTargetKanjis, 2 / 3);
  assert.deepEqual(woodCoverage.featuresUnseenOutsideTargetKanji, [
    "feature.wood",
  ]);
});

test("findLowFeatureRows returns rows under the configured limit", () => {
  const datasetEntries = [
    {
      lineNumber: 1,
      row: createValidRow({
        recognitionId: "one-feature",
        features: {
          "feature.a": 0.1,
        },
      }),
    },
    {
      lineNumber: 2,
      row: createValidRow({
        recognitionId: "three-features",
        features: {
          "feature.a": 0.1,
          "feature.b": 0.2,
          "feature.c": 0.3,
        },
      }),
    },
    {
      lineNumber: 3,
      row: createValidRow({
        recognitionId: "four-features",
        features: {
          "feature.a": 0.1,
          "feature.b": 0.2,
          "feature.c": 0.3,
          "feature.d": 0.4,
        },
      }),
    },
  ];

  const result = findLowFeatureRows(datasetEntries, 3);

  assert.equal(result.length, 2);

  assert.deepEqual(
    result.map((row) => row.recognitionId),
    ["one-feature", "three-features"],
  );

  assert.equal(result[0].featureCount, 1);
  assert.deepEqual(result[0].featureNames, ["feature.a"]);
});

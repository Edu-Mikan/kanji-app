const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  validateMlDatasetQualityGate,
} = require("../../scripts/validate_reference_candidate_ml_dataset_quality_gate");

test("parseArgs should parse ML dataset quality gate arguments", () => {
  const options = parseArgs([
    "--dataset",
    "./ml_datasets/reference_candidate_binary_dataset.jsonl",
    "--summary",
    "./ml_datasets/reference_candidate_binary_dataset_summary.json",
    "--min-rows",
    "10",
    "--min-positive",
    "2",
    "--min-negative",
    "2",
    "--min-features",
    "5",
  ]);

  assert.ok(
    options.datasetPath.endsWith("reference_candidate_binary_dataset.jsonl"),
  );

  assert.ok(
    options.summaryPath.endsWith(
      "reference_candidate_binary_dataset_summary.json",
    ),
  );

  assert.equal(options.minRows, 10);

  assert.equal(options.minPositive, 2);

  assert.equal(options.minNegative, 2);

  assert.equal(options.minFeatures, 5);
});

test("validateOptions should reject missing dataset", () => {
  assert.throws(
    () =>
      validateOptions({
        summaryPath: "./summary.json",
        minRows: 1,
        minPositive: 1,
        minNegative: 1,
        minFeatures: 1,
        help: false,
      }),
    /Missing --dataset/,
  );
});

test("validateOptions should reject missing summary", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./dataset.jsonl",
        minRows: 1,
        minPositive: 1,
        minNegative: 1,
        minFeatures: 1,
        help: false,
      }),
    /Missing --summary/,
  );
});

test("validateOptions should reject non finite thresholds", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./dataset.jsonl",
        summaryPath: "./summary.json",
        minRows: Number.NaN,
        minPositive: 1,
        minNegative: 1,
        minFeatures: 1,
        help: false,
      }),
    /--min-rows must be a finite number/,
  );
});

test("validateOptions should reject negative thresholds", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./dataset.jsonl",
        summaryPath: "./summary.json",
        minRows: -1,
        minPositive: 1,
        minNegative: 1,
        minFeatures: 1,
        help: false,
      }),
    /--min-rows must be greater than or equal to 0/,
  );
});

test("validateMlDatasetQualityGate should pass valid summary", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      targetKanjiCount: 19,
      rowCount: 565,
      positiveCount: 383,
      negativeCount: 182,
      featureCount: 131,
      errorCount: 0,
      featureNames: [
        "referenceComparison.comparisonCost",
        "perRole.role_stroke0_horizontal.centerDistance",
      ],
      classificationCounts: {
        truePositive: 383,
        falsePositive: 56,
        trueNegative: 126,
      },
    },
    datasetRowCount: 565,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);
});

test("validateMlDatasetQualityGate should fail on export errors", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 5,
      negativeCount: 5,
      featureCount: 3,
      errorCount: 1,
      featureNames: ["a"],
      classificationCounts: {},
    },
    datasetRowCount: 10,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "dataset_export_errors");
});

test("validateMlDatasetQualityGate should fail when row count is below minimum", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 5,
      positiveCount: 3,
      negativeCount: 2,
      featureCount: 3,
      errorCount: 0,
      featureNames: ["a"],
      classificationCounts: {},
    },
    datasetRowCount: 5,
    minRows: 10,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "row_count_below_minimum");
});

test("validateMlDatasetQualityGate should fail when positive labels are missing", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 0,
      negativeCount: 10,
      featureCount: 3,
      errorCount: 0,
      featureNames: ["a"],
      classificationCounts: {},
    },
    datasetRowCount: 10,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "positive_count_below_minimum");
});

test("validateMlDatasetQualityGate should fail when negative labels are missing", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 10,
      negativeCount: 0,
      featureCount: 3,
      errorCount: 0,
      featureNames: ["a"],
      classificationCounts: {},
    },
    datasetRowCount: 10,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "negative_count_below_minimum");
});

test("validateMlDatasetQualityGate should fail when feature count is below minimum", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 5,
      negativeCount: 5,
      featureCount: 0,
      errorCount: 0,
      featureNames: [],
      classificationCounts: {},
    },
    datasetRowCount: 10,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "feature_count_below_minimum");
});

test("validateMlDatasetQualityGate should fail when row count mismatches JSONL", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 5,
      negativeCount: 5,
      featureCount: 3,
      errorCount: 0,
      featureNames: ["a"],
      classificationCounts: {},
    },
    datasetRowCount: 9,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "jsonl_row_count_mismatch");
});

test("validateMlDatasetQualityGate should fail when feature names are missing", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 5,
      negativeCount: 5,
      featureCount: 3,
      errorCount: 0,
      featureNames: [],
      classificationCounts: {},
    },
    datasetRowCount: 10,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 0,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some((failure) => failure.code === "missing_feature_names"),
  );
});

test("validateMlDatasetQualityGate should fail when classification counts are missing", () => {
  const result = validateMlDatasetQualityGate({
    summary: {
      rowCount: 10,
      positiveCount: 5,
      negativeCount: 5,
      featureCount: 3,
      errorCount: 0,
      featureNames: ["a"],
    },
    datasetRowCount: 10,
    minRows: 1,
    minPositive: 1,
    minNegative: 1,
    minFeatures: 1,
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.failures.some(
      (failure) => failure.code === "missing_classification_counts",
    ),
  );
});

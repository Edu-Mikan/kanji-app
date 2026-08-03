const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  labelFromClassification,
  flattenReferenceFeatures,
  getTargetRowsFromBatchSummary,
  buildDatasetRow,
  buildDatasetSummary,
  collectFeatureNames,
} = require("../../scripts/export_reference_candidate_ml_dataset");

test("parseArgs should parse ML dataset export arguments", () => {
  const options = parseArgs([
    "--batch-summary",
    "./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json",
    "--reports-dir",
    "./candidate_reports_training",
    "--file",
    "./training_data.jsonl",
    "--out-jsonl",
    "./ml_datasets/reference_candidate_binary_dataset.jsonl",
    "--out-summary",
    "./ml_datasets/reference_candidate_binary_dataset_summary.json",
    "--safe-only",
  ]);

  assert.ok(
    options.batchSummaryPath.endsWith(
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
  );

  assert.ok(options.reportsDirectory.endsWith("candidate_reports_training"));

  assert.ok(options.trainingFilePath.endsWith("training_data.jsonl"));

  assert.ok(
    options.outputJsonlPath.endsWith(
      "reference_candidate_binary_dataset.jsonl",
    ),
  );

  assert.equal(options.includeOnlySafeCandidates, true);
});

test("validateOptions should reject missing batch summary", () => {
  assert.throws(
    () =>
      validateOptions({
        reportsDirectory: "./candidate_reports_training",
        trainingFilePath: "./training_data.jsonl",
        outputJsonlPath: "./out.jsonl",
        outputSummaryPath: "./summary.json",
        help: false,
      }),
    /Missing --batch-summary/,
  );
});

test("labelFromClassification should map classifications to binary labels", () => {
  assert.equal(labelFromClassification("truePositive"), 1);

  assert.equal(labelFromClassification("falseNegative"), 1);

  assert.equal(labelFromClassification("trueNegative"), 0);

  assert.equal(labelFromClassification("falsePositive"), 0);

  assert.equal(labelFromClassification("unknown"), null);
});

test("flattenReferenceFeatures should flatten reference and per-role metrics", () => {
  const features = flattenReferenceFeatures({
    referenceComparison: {
      comparisonCost: 0.2,
      meanRoleCost: 0.3,
      maxRoleCost: 0.4,
      missingRoles: 0,
    },
    perRoleReferenceComparison: {
      role_stroke0_horizontal: {
        comparisonCost: 0.1,
        centerDistance: 0.05,
        heightRelativeDiff: 0.2,
      },
    },
  });

  assert.equal(features["referenceComparison.comparisonCost"], 0.2);

  assert.equal(features["referenceComparison.missingRoles"], 0);

  assert.equal(
    features["perRole.role_stroke0_horizontal.centerDistance"],
    0.05,
  );

  assert.equal(
    features["perRole.role_stroke0_horizontal.heightRelativeDiff"],
    0.2,
  );
});

test("getTargetRowsFromBatchSummary should select safe rows when requested", () => {
  const rows = getTargetRowsFromBatchSummary({
    batchSummary: {
      rows: [
        {
          kanji: "本",
          status: "ok",
          safeAgainstFalseNegatives: true,
        },
        {
          kanji: "田",
          status: "ok",
          safeAgainstFalseNegatives: false,
        },
        {
          kanji: "口",
          status: "error",
          safeAgainstFalseNegatives: true,
        },
      ],
    },
    includeOnlySafeCandidates: true,
  });

  assert.deepEqual(
    rows.map((row) => row.kanji),
    ["本"],
  );
});

test("buildDatasetRow should create a labeled ML row", () => {
  const row = buildDatasetRow({
    targetKanji: "本",
    evaluation: {
      recognitionId: "sample-1",
      classification: "truePositive",
      referenceComparison: {
        comparisonCost: 0.2,
      },
      perRoleReferenceComparison: {
        role_stroke4_horizontal: {
          centerDistance: 0.1,
        },
      },
    },
    trainingSample: {
      recognitionId: "sample-1",
      expectedKanji: "本",
      isCorrect: true,
    },
  });

  assert.equal(row.recognitionId, "sample-1");

  assert.equal(row.targetKanji, "本");

  assert.equal(row.expectedKanji, "本");

  assert.equal(row.label, 1);

  assert.equal(row.features["referenceComparison.comparisonCost"], 0.2);
});

test("collectFeatureNames should return sorted unique names", () => {
  const featureNames = collectFeatureNames([
    {
      features: {
        b: 1,
        a: 2,
      },
    },
    {
      features: {
        c: 3,
        a: 4,
      },
    },
  ]);

  assert.deepEqual(featureNames, ["a", "b", "c"]);
});

test("buildDatasetSummary should count rows and labels", () => {
  const summary = buildDatasetSummary({
    rows: [
      {
        targetKanji: "本",
        classification: "truePositive",
        label: 1,
        features: {
          a: 1,
        },
      },
      {
        targetKanji: "本",
        classification: "falsePositive",
        label: 0,
        features: {
          b: 2,
        },
      },
    ],
    errors: [],
    targetKanjis: ["本"],
    includeOnlySafeCandidates: true,
  });

  assert.equal(summary.rowCount, 2);

  assert.equal(summary.positiveCount, 1);

  assert.equal(summary.negativeCount, 1);

  assert.equal(summary.featureCount, 2);

  assert.equal(summary.errorCount, 0);
});

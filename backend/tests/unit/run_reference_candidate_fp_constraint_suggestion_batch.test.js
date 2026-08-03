const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  getPermissiveRows,
  getCandidateDescriptorPath,
  getCalibrationReportPath,
  getSuggestionsPath,
  getEvaluationSummaryPath,
  getBatchResultPath,
  buildNoSuggestionRow,
  buildEvaluationRow,
  buildBatchSummary,
} = require("../../scripts/run_reference_candidate_fp_constraint_suggestion_batch");

test("parseArgs should parse batch suggestion evaluation arguments", () => {
  const options = parseArgs([
    "--batch-summary",
    "./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--file",
    "./training_data.jsonl",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
    "--continue-on-error",
  ]);

  assert.ok(
    options.batchSummaryPath.endsWith(
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
  );

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));

  assert.ok(options.filePath.endsWith("training_data.jsonl"));

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(options.outputDirectory.endsWith("candidate_reports_training"));

  assert.equal(options.continueOnError, true);
});

test("validateOptions should reject missing batch summary", () => {
  assert.throws(
    () =>
      validateOptions({
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        help: false,
      }),
    /Missing --batch-summary/,
  );
});

test("validateOptions should reject missing descriptor file", () => {
  assert.throws(
    () =>
      validateOptions({
        batchSummaryPath:
          "./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json",
        filePath: "./training_data.jsonl",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        help: false,
      }),
    /Missing --descriptor-file/,
  );
});

test("getPermissiveRows should select safe non-clean rows with false positives", () => {
  const rows = getPermissiveRows({
    rows: [
      {
        kanji: "本",
        status: "ok",
        safeAgainstFalseNegatives: true,
        clean: false,
        falsePositive: 8,
      },
      {
        kanji: "三",
        status: "ok",
        safeAgainstFalseNegatives: true,
        clean: true,
        falsePositive: 0,
      },
      {
        kanji: "田",
        status: "ok",
        safeAgainstFalseNegatives: false,
        clean: false,
        falsePositive: 4,
      },
      {
        kanji: "口",
        status: "error",
        safeAgainstFalseNegatives: true,
        clean: false,
        falsePositive: 2,
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => row.kanji),
    ["本"],
  );
});

test("path helpers should build expected paths", () => {
  assert.ok(
    getCandidateDescriptorPath({
      kanji: "本",
      outputDirectory: "candidate_reports_training",
    }).endsWith("本_descriptor_candidate_from_reference.json"),
  );

  assert.ok(
    getCalibrationReportPath({
      kanji: "本",
      outputDirectory: "candidate_reports_training",
    }).endsWith("本_reference_candidate_calibration_report.json"),
  );

  assert.ok(
    getSuggestionsPath({
      kanji: "本",
      outputDirectory: "candidate_reports_training",
    }).endsWith("本_reference_candidate_fp_constraint_suggestions.json"),
  );

  assert.ok(
    getEvaluationSummaryPath({
      kanji: "本",
      outputDirectory: "candidate_reports_training",
    }).endsWith("本_reference_candidate_evaluation_summary.json"),
  );

  assert.ok(
    getBatchResultPath("candidate_reports_training").endsWith(
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
  );
});

test("buildNoSuggestionRow should create no suggestion row", () => {
  const row = buildNoSuggestionRow(
    {
      kanji: "日",
      truePositive: 13,
      falseNegative: 0,
      trueNegative: 7,
      falsePositive: 2,
    },
    {
      suggestionCount: 0,
    },
  );

  assert.equal(row.kanji, "日");

  assert.equal(row.status, "no_suggestion");

  assert.equal(row.before.falsePositive, 2);

  assert.equal(row.suggestionCount, 0);
});

test("buildEvaluationRow should calculate before and after deltas", () => {
  const row = buildEvaluationRow({
    baseRow: {
      kanji: "本",
      truePositive: 32,
      falseNegative: 0,
      trueNegative: 10,
      falsePositive: 8,
    },
    suggestion: {
      metricPath: "perRole.role.centerDistance",
      max: 0.2,
      evidence: {
        falsePositiveReduction: 5,
        truePositiveLoss: 0,
      },
    },
    afterSummary: {
      classifications: {
        truePositive: 32,
        falseNegative: 0,
        trueNegative: 15,
        falsePositive: 3,
      },
      recommendation: "candidate_too_permissive_review_constraints",
    },
  });

  assert.equal(row.status, "ok");

  assert.equal(row.actualFalsePositiveReduction, 5);

  assert.equal(row.actualFalseNegativeIncrease, 0);

  assert.equal(row.actualTruePositiveLoss, 0);

  assert.equal(row.safe, true);

  assert.equal(row.remainingFalsePositive, 3);
});

test("buildEvaluationRow should mark unsafe row when false negatives increase", () => {
  const row = buildEvaluationRow({
    baseRow: {
      kanji: "本",
      truePositive: 32,
      falseNegative: 0,
      trueNegative: 10,
      falsePositive: 8,
    },
    suggestion: {
      metricPath: "perRole.role.centerDistance",
      max: 0.2,
      evidence: {
        falsePositiveReduction: 5,
        truePositiveLoss: 0,
      },
    },
    afterSummary: {
      classifications: {
        truePositive: 31,
        falseNegative: 1,
        trueNegative: 15,
        falsePositive: 3,
      },
      recommendation: "reject_or_relax_candidate_due_to_false_negatives",
    },
  });

  assert.equal(row.actualFalseNegativeIncrease, 1);

  assert.equal(row.actualTruePositiveLoss, 1);

  assert.equal(row.safe, false);
});

test("buildBatchSummary should aggregate reductions", () => {
  const summary = buildBatchSummary({
    sourceBatchSummary: {
      mode: "reference_descriptor_candidate_pipeline_batch_summary",
    },
    rows: [
      {
        kanji: "本",
        status: "ok",
        before: {
          truePositive: 32,
          falseNegative: 0,
          trueNegative: 10,
          falsePositive: 8,
        },
        after: {
          truePositive: 32,
          falseNegative: 0,
          trueNegative: 15,
          falsePositive: 3,
        },
        actualFalsePositiveReduction: 5,
        actualFalseNegativeIncrease: 0,
        actualTruePositiveLoss: 0,
        safe: true,
      },
      {
        kanji: "日",
        status: "no_suggestion",
        before: {
          truePositive: 13,
          falseNegative: 0,
          trueNegative: 7,
          falsePositive: 2,
        },
        suggestionCount: 0,
      },
    ],
    errors: [],
  });

  assert.equal(summary.targetCount, 2);

  assert.equal(summary.evaluatedCount, 1);

  assert.equal(summary.noSuggestionCount, 1);

  assert.equal(summary.totalFalsePositiveBefore, 8);

  assert.equal(summary.totalFalsePositiveAfter, 3);

  assert.equal(summary.totalFalsePositiveReduction, 5);

  assert.equal(summary.totalFalseNegativeIncrease, 0);

  assert.equal(summary.totalTruePositiveLoss, 0);

  assert.equal(summary.passed, true);
});

test("buildBatchSummary should fail when true positives are lost", () => {
  const summary = buildBatchSummary({
    sourceBatchSummary: {
      mode: "reference_descriptor_candidate_pipeline_batch_summary",
    },
    rows: [
      {
        kanji: "本",
        status: "ok",
        before: {
          truePositive: 32,
          falseNegative: 0,
          trueNegative: 10,
          falsePositive: 8,
        },
        after: {
          truePositive: 31,
          falseNegative: 1,
          trueNegative: 15,
          falsePositive: 3,
        },
        actualFalsePositiveReduction: 5,
        actualFalseNegativeIncrease: 1,
        actualTruePositiveLoss: 1,
        safe: false,
      },
    ],
    errors: [],
  });

  assert.equal(summary.passed, false);

  assert.equal(summary.totalFalseNegativeIncrease, 1);

  assert.equal(summary.totalTruePositiveLoss, 1);
});

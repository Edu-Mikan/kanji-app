const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  validateReferenceCandidateFpSuggestionBatchQualityGate,
} = require("../../scripts/validate_reference_candidate_fp_constraint_suggestion_batch_quality_gate");

test("parseArgs should parse summary path", () => {
  const options = parseArgs([
    "--summary",
    "./candidate_reports_training/reference_candidate_fp_constraint_suggestion_batch_summary.json",
  ]);

  assert.ok(
    options.summaryPath.endsWith(
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
  );
});

test("validateOptions should reject missing summary path", () => {
  assert.throws(
    () =>
      validateOptions({
        help: false,
      }),
    /Missing --summary/,
  );
});

test("quality gate should pass when summary is safe", () => {
  const result = validateReferenceCandidateFpSuggestionBatchQualityGate({
    passed: true,
    targetCount: 14,
    evaluatedCount: 14,
    noSuggestionCount: 0,
    errorCount: 0,
    safeEvaluationCount: 14,
    totalFalsePositiveBefore: 56,
    totalFalsePositiveAfter: 16,
    totalFalsePositiveReduction: 40,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    rows: [
      {
        kanji: "本",
        status: "ok",
        safe: true,
      },
    ],
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);
});

test("quality gate should fail when summary passed flag is false", () => {
  const result = validateReferenceCandidateFpSuggestionBatchQualityGate({
    passed: false,
    errorCount: 0,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    rows: [],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "summary_not_passed");
});

test("quality gate should fail on batch errors", () => {
  const result = validateReferenceCandidateFpSuggestionBatchQualityGate({
    passed: true,
    errorCount: 1,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    rows: [],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "batch_errors");
});

test("quality gate should fail on false negative increase", () => {
  const result = validateReferenceCandidateFpSuggestionBatchQualityGate({
    passed: true,
    errorCount: 0,
    totalFalseNegativeIncrease: 1,
    totalTruePositiveLoss: 0,
    rows: [],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "false_negative_increase");
});

test("quality gate should fail on true positive loss", () => {
  const result = validateReferenceCandidateFpSuggestionBatchQualityGate({
    passed: true,
    errorCount: 0,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 1,
    rows: [],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "true_positive_loss");
});

test("quality gate should fail on unsafe evaluated rows", () => {
  const result = validateReferenceCandidateFpSuggestionBatchQualityGate({
    passed: true,
    errorCount: 0,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    rows: [
      {
        kanji: "本",
        status: "ok",
        safe: false,
      },
    ],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "unsafe_rows");
});

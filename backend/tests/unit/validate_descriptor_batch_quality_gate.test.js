const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateBatchQualityGate,
} = require("../../scripts/validate_descriptor_batch_quality_gate");

test("parseArgs should parse summary path", () => {
  const options = parseArgs([
    "--summary",
    "./candidate_reports_training/pipeline_batch_summary.json",
  ]);

  assert.ok(options.summaryPath.endsWith("pipeline_batch_summary.json"));
});

test("validateBatchQualityGate should pass with no errors, no false negatives and no unexpected false positives", () => {
  const result = validateBatchQualityGate({
    errorCount: 0,
    falseNegativeKanjiCount: 0,
    falsePositiveKanjiCount: 2,
    acceptedFalsePositiveCount: 2,
    unexpectedFalsePositiveCount: 0,
    unexpectedFalsePositiveKanjis: [],
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);
});

test("validateBatchQualityGate should fail on batch errors", () => {
  const result = validateBatchQualityGate({
    errorCount: 1,
    falseNegativeKanjiCount: 0,
    unexpectedFalsePositiveCount: 0,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "batch_errors");
});

test("validateBatchQualityGate should fail on false negatives", () => {
  const result = validateBatchQualityGate({
    errorCount: 0,
    falseNegativeKanjiCount: 1,
    falseNegativeKanjis: ["用"],
    unexpectedFalsePositiveCount: 0,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "false_negatives");
});

test("validateBatchQualityGate should fail on unexpected false positives", () => {
  const result = validateBatchQualityGate({
    errorCount: 0,
    falseNegativeKanjiCount: 0,
    unexpectedFalsePositiveCount: 1,
    unexpectedFalsePositiveKanjis: ["日"],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "unexpected_false_positives");
});

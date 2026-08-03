const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  validateReferenceCandidateBatchQualityGate,
} = require("../../scripts/validate_reference_descriptor_candidate_batch_quality_gate");

test("parseArgs should parse summary path", () => {
  const options = parseArgs([
    "--summary",
    "./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json",
  ]);

  assert.ok(
    options.summaryPath.endsWith(
      "reference_descriptor_candidate_pipeline_batch_summary.json",
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

test("validateReferenceCandidateBatchQualityGate should pass with no errors and no unsafe candidates", () => {
  const result = validateReferenceCandidateBatchQualityGate({
    errorCount: 0,
    cleanCandidateCount: 5,
    safeCandidateCount: 19,
    unsafeCandidateCount: 0,
    permissiveCandidateCount: 14,
    unsafeKanjis: [],
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);
});

test("validateReferenceCandidateBatchQualityGate should fail on batch errors", () => {
  const result = validateReferenceCandidateBatchQualityGate({
    errorCount: 1,
    unsafeCandidateCount: 0,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "batch_errors");
});

test("validateReferenceCandidateBatchQualityGate should fail on unsafe candidates", () => {
  const result = validateReferenceCandidateBatchQualityGate({
    errorCount: 0,
    unsafeCandidateCount: 2,
    unsafeKanjis: ["田", "用"],
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "unsafe_candidates");
});

test("validateReferenceCandidateBatchQualityGate should not fail on permissive candidates", () => {
  const result = validateReferenceCandidateBatchQualityGate({
    errorCount: 0,
    cleanCandidateCount: 5,
    safeCandidateCount: 19,
    unsafeCandidateCount: 0,
    permissiveCandidateCount: 14,
  });

  assert.equal(result.passed, true);
});

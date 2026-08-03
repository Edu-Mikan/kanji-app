const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  summarizeReferenceCandidateQuality,
  summarizeFpSuggestionQuality,
  summarizePatchProposals,
  buildReadiness,
  buildStatusSummary,
} = require("../../scripts/summarize_reference_candidate_generation_status");

test("parseArgs should parse summary paths", () => {
  const options = parseArgs([
    "--reference-candidate-summary",
    "./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json",
    "--fp-suggestion-summary",
    "./candidate_reports_training/reference_candidate_fp_constraint_suggestion_batch_summary.json",
    "--patch-proposals",
    "./candidate_reports_training/reference_candidate_fp_constraint_patch_proposals.json",
    "--out-json",
    "./candidate_reports_training/reference_candidate_generation_status_summary.json",
  ]);

  assert.ok(
    options.referenceCandidateSummaryPath.endsWith(
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
  );

  assert.ok(
    options.fpSuggestionBatchSummaryPath.endsWith(
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
  );

  assert.ok(
    options.patchProposalsPath.endsWith(
      "reference_candidate_fp_constraint_patch_proposals.json",
    ),
  );

  assert.ok(
    options.outputPath.endsWith(
      "reference_candidate_generation_status_summary.json",
    ),
  );
});

test("validateOptions should reject missing reference candidate summary", () => {
  assert.throws(
    () =>
      validateOptions({
        fpSuggestionBatchSummaryPath: "./fp.json",
        patchProposalsPath: "./patches.json",
        outputPath: "./out.json",
        help: false,
      }),
    /Missing --reference-candidate-summary/,
  );
});

test("summarizeReferenceCandidateQuality should mark safe summary as passed", () => {
  const summary = summarizeReferenceCandidateQuality({
    kanjiCount: 19,
    processedCount: 19,
    errorCount: 0,
    cleanCandidateCount: 5,
    safeCandidateCount: 19,
    unsafeCandidateCount: 0,
    permissiveCandidateCount: 14,
  });

  assert.equal(summary.passed, true);

  assert.equal(summary.safeCandidateCount, 19);
});

test("summarizeReferenceCandidateQuality should fail when unsafe candidates exist", () => {
  const summary = summarizeReferenceCandidateQuality({
    kanjiCount: 19,
    processedCount: 19,
    errorCount: 0,
    safeCandidateCount: 18,
    unsafeCandidateCount: 1,
  });

  assert.equal(summary.passed, false);
});

test("summarizeFpSuggestionQuality should preserve reduction and pass flag", () => {
  const summary = summarizeFpSuggestionQuality({
    targetCount: 14,
    evaluatedCount: 14,
    errorCount: 0,
    safeEvaluationCount: 14,
    totalFalsePositiveBefore: 56,
    totalFalsePositiveAfter: 16,
    totalFalsePositiveReduction: 40,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    passed: true,
  });

  assert.equal(summary.totalFalsePositiveReduction, 40);

  assert.equal(summary.passed, true);
});

test("summarizePatchProposals should pass valid proposals", () => {
  const summary = summarizePatchProposals({
    proposalCount: 14,
    rejectedCount: 0,
    totalFalsePositiveReduction: 40,
    totalFalseNegativeIncrease: 0,
    totalTruePositiveLoss: 0,
    proposals: [
      {
        kanji: "本",
      },
      {
        kanji: "末",
      },
    ],
  });

  assert.equal(summary.passed, true);

  assert.deepEqual(summary.proposalKanjis, ["本", "末"]);
});

test("buildReadiness should mark setup ready when all summaries pass", () => {
  const readiness = buildReadiness({
    referenceCandidateQuality: {
      passed: true,
      safeCandidateCount: 19,
    },
    fpSuggestionQuality: {
      passed: true,
    },
    patchProposalQuality: {
      passed: true,
    },
  });

  assert.equal(readiness.readyForMlDatasetExport, true);

  assert.deepEqual(readiness.blockers, []);
});

test("buildReadiness should report blockers", () => {
  const readiness = buildReadiness({
    referenceCandidateQuality: {
      passed: false,
      safeCandidateCount: 18,
    },
    fpSuggestionQuality: {
      passed: true,
    },
    patchProposalQuality: {
      passed: true,
    },
  });

  assert.equal(readiness.readyForMlDatasetExport, false);

  assert.ok(readiness.blockers.includes("reference_candidates_not_safe"));
});

test("buildStatusSummary should combine all sections", () => {
  const summary = buildStatusSummary({
    referenceCandidateSummary: {
      kanjiCount: 19,
      processedCount: 19,
      errorCount: 0,
      cleanCandidateCount: 5,
      safeCandidateCount: 19,
      unsafeCandidateCount: 0,
      permissiveCandidateCount: 14,
    },
    fpSuggestionBatchSummary: {
      targetCount: 14,
      evaluatedCount: 14,
      errorCount: 0,
      safeEvaluationCount: 14,
      totalFalsePositiveBefore: 56,
      totalFalsePositiveAfter: 16,
      totalFalsePositiveReduction: 40,
      totalFalseNegativeIncrease: 0,
      totalTruePositiveLoss: 0,
      passed: true,
    },
    patchProposals: {
      proposalCount: 14,
      rejectedCount: 0,
      totalFalsePositiveReduction: 40,
      totalFalseNegativeIncrease: 0,
      totalTruePositiveLoss: 0,
      proposals: [
        {
          kanji: "本",
        },
      ],
    },
  });

  assert.equal(summary.mode, "reference_candidate_generation_status_summary");

  assert.equal(summary.readiness.readyForMlDatasetExport, true);
});

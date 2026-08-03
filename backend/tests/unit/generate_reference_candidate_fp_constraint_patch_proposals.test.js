const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  shouldCreateProposal,
  buildReferenceConstraintFromRow,
  buildPatchProposal,
  buildRejectedRowReason,
  generatePatchProposals,
} = require("../../scripts/generate_reference_candidate_fp_constraint_patch_proposals");

test("parseArgs should parse summary and output arguments", () => {
  const options = parseArgs([
    "--summary",
    "./candidate_reports_training/reference_candidate_fp_constraint_suggestion_batch_summary.json",
    "--out-json",
    "./candidate_reports_training/reference_candidate_fp_constraint_patch_proposals.json",
  ]);

  assert.ok(
    options.summaryPath.endsWith(
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
  );

  assert.ok(
    options.outputPath.endsWith(
      "reference_candidate_fp_constraint_patch_proposals.json",
    ),
  );
});

test("validateOptions should reject missing summary", () => {
  assert.throws(
    () =>
      validateOptions({
        outputPath: "./out.json",
        minFalsePositiveReduction: 1,
        help: false,
      }),
    /Missing --summary/,
  );
});

test("validateOptions should reject missing output path", () => {
  assert.throws(
    () =>
      validateOptions({
        summaryPath: "./summary.json",
        minFalsePositiveReduction: 1,
        help: false,
      }),
    /Missing --out-json/,
  );
});

test("shouldCreateProposal should accept safe row with FP reduction", () => {
  assert.equal(
    shouldCreateProposal({
      row: {
        status: "ok",
        safe: true,
        actualFalsePositiveReduction: 5,
        actualFalseNegativeIncrease: 0,
        actualTruePositiveLoss: 0,
        metricPath: "perRole.role.centerDistance",
        max: 0.2,
      },
      minFalsePositiveReduction: 1,
      requireSafe: true,
    }),
    true,
  );
});

test("shouldCreateProposal should reject unsafe row", () => {
  assert.equal(
    shouldCreateProposal({
      row: {
        status: "ok",
        safe: false,
        actualFalsePositiveReduction: 5,
        actualFalseNegativeIncrease: 0,
        actualTruePositiveLoss: 0,
        metricPath: "perRole.role.centerDistance",
        max: 0.2,
      },
      minFalsePositiveReduction: 1,
      requireSafe: true,
    }),
    false,
  );
});

test("shouldCreateProposal should reject row with false negative increase", () => {
  assert.equal(
    shouldCreateProposal({
      row: {
        status: "ok",
        safe: true,
        actualFalsePositiveReduction: 5,
        actualFalseNegativeIncrease: 1,
        actualTruePositiveLoss: 0,
        metricPath: "perRole.role.centerDistance",
        max: 0.2,
      },
      minFalsePositiveReduction: 1,
      requireSafe: true,
    }),
    false,
  );
});

test("buildReferenceConstraintFromRow should create referenceMetricMax constraint", () => {
  const constraint = buildReferenceConstraintFromRow({
    metricPath: "perRole.role_stroke4_horizontal.centerDistance",
    max: 0.173,
    actualFalsePositiveReduction: 5,
    actualFalseNegativeIncrease: 0,
    actualTruePositiveLoss: 0,
    suggestedFalsePositiveReduction: 5,
    suggestedTruePositiveLoss: 0,
    safe: true,
  });

  assert.deepEqual(constraint, {
    type: "referenceMetricMax",
    metricPath: "perRole.role_stroke4_horizontal.centerDistance",
    max: 0.173,
    severity: "hard",
    status: "candidate",
    source: "fp_constraint_patch_proposal",
    evidence: {
      suggestedFalsePositiveReduction: 5,
      suggestedTruePositiveLoss: 0,
      actualFalsePositiveReduction: 5,
      actualFalseNegativeIncrease: 0,
      actualTruePositiveLoss: 0,
      safe: true,
    },
  });
});

test("buildPatchProposal should create reviewable proposal", () => {
  const proposal = buildPatchProposal({
    kanji: "本",
    metricPath: "perRole.role_stroke4_horizontal.centerDistance",
    max: 0.173,
    suggestedFalsePositiveReduction: 5,
    suggestedTruePositiveLoss: 0,
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
    remainingFalsePositive: 3,
  });

  assert.equal(proposal.kanji, "本");

  assert.equal(proposal.status, "proposal");

  assert.equal(proposal.action, "append_reference_constraint");

  assert.equal(
    proposal.constraint.metricPath,
    "perRole.role_stroke4_horizontal.centerDistance",
  );

  assert.equal(proposal.impact.falsePositiveReduction, 5);

  assert.equal(proposal.review.requiresManualReview, true);
});

test("buildRejectedRowReason should identify low FP reduction", () => {
  assert.equal(
    buildRejectedRowReason({
      row: {
        status: "ok",
        safe: true,
        actualFalsePositiveReduction: 0,
        actualFalseNegativeIncrease: 0,
        actualTruePositiveLoss: 0,
        metricPath: "metric",
        max: 1,
      },
      minFalsePositiveReduction: 1,
      requireSafe: true,
    }),
    "false_positive_reduction_below_minimum",
  );
});

test("generatePatchProposals should build proposals and totals", () => {
  const report = generatePatchProposals({
    suggestionBatchSummary: {
      mode: "reference_candidate_fp_constraint_suggestion_batch_summary",
      targetCount: 2,
      evaluatedCount: 2,
      errorCount: 0,
      totalFalsePositiveBefore: 10,
      totalFalsePositiveAfter: 3,
      totalFalsePositiveReduction: 7,
      totalFalseNegativeIncrease: 0,
      totalTruePositiveLoss: 0,
      passed: true,
      rows: [
        {
          kanji: "本",
          status: "ok",
          safe: true,
          metricPath: "perRole.role.centerDistance",
          max: 0.2,
          suggestedFalsePositiveReduction: 5,
          suggestedTruePositiveLoss: 0,
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
          remainingFalsePositive: 3,
        },
        {
          kanji: "日",
          status: "ok",
          safe: true,
          metricPath: "perRole.role.heightRelativeDiff",
          max: 0.1,
          before: {
            truePositive: 13,
            falseNegative: 0,
            trueNegative: 7,
            falsePositive: 2,
          },
          after: {
            truePositive: 13,
            falseNegative: 0,
            trueNegative: 8,
            falsePositive: 1,
          },
          actualFalsePositiveReduction: 1,
          actualFalseNegativeIncrease: 0,
          actualTruePositiveLoss: 0,
          remainingFalsePositive: 1,
        },
      ],
    },
    minFalsePositiveReduction: 1,
    requireSafe: true,
  });

  assert.equal(report.proposalCount, 2);

  assert.equal(report.rejectedCount, 0);

  assert.equal(report.totalFalsePositiveReduction, 6);

  assert.equal(report.totalFalseNegativeIncrease, 0);

  assert.equal(report.totalTruePositiveLoss, 0);
});

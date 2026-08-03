const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  isValidReferenceConstraint,
  validatePatchProposal,
  validatePatchProposalsQualityGate,
} = require("../../scripts/validate_reference_candidate_fp_constraint_patch_proposals_quality_gate");

test("parseArgs should parse proposals path", () => {
  const options = parseArgs([
    "--proposals",
    "./candidate_reports_training/reference_candidate_fp_constraint_patch_proposals.json",
  ]);

  assert.ok(
    options.proposalsPath.endsWith(
      "reference_candidate_fp_constraint_patch_proposals.json",
    ),
  );

  assert.equal(options.requireProposals, true);
});

test("parseArgs should support allow-empty", () => {
  const options = parseArgs([
    "--proposals",
    "./proposals.json",
    "--allow-empty",
  ]);

  assert.equal(options.requireProposals, false);
});

test("validateOptions should reject missing proposals path", () => {
  assert.throws(
    () =>
      validateOptions({
        help: false,
      }),
    /Missing --proposals/,
  );
});

test("isValidReferenceConstraint should accept valid referenceMetricMax constraint", () => {
  assert.equal(
    isValidReferenceConstraint({
      type: "referenceMetricMax",
      metricPath: "perRole.role.centerDistance",
      max: 0.2,
      severity: "hard",
      status: "candidate",
    }),
    true,
  );
});

test("isValidReferenceConstraint should reject missing metric path", () => {
  assert.equal(
    isValidReferenceConstraint({
      type: "referenceMetricMax",
      max: 0.2,
      severity: "hard",
      status: "candidate",
    }),
    false,
  );
});

test("validatePatchProposal should pass valid proposal", () => {
  const failures = validatePatchProposal({
    kanji: "本",
    status: "proposal",
    action: "append_reference_constraint",
    constraint: {
      type: "referenceMetricMax",
      metricPath: "perRole.role.centerDistance",
      max: 0.2,
      severity: "hard",
      status: "candidate",
    },
    impact: {
      falsePositiveReduction: 5,
      falseNegativeIncrease: 0,
      truePositiveLoss: 0,
    },
  });

  assert.deepEqual(failures, []);
});

test("validatePatchProposal should fail when proposal introduces false negatives", () => {
  const failures = validatePatchProposal({
    kanji: "本",
    status: "proposal",
    action: "append_reference_constraint",
    constraint: {
      type: "referenceMetricMax",
      metricPath: "perRole.role.centerDistance",
      max: 0.2,
      severity: "hard",
      status: "candidate",
    },
    impact: {
      falsePositiveReduction: 5,
      falseNegativeIncrease: 1,
      truePositiveLoss: 0,
    },
  });

  assert.equal(failures[0].code, "false_negative_increase");
});

test("validatePatchProposalsQualityGate should pass valid report", () => {
  const result = validatePatchProposalsQualityGate({
    proposalReport: {
      proposalCount: 1,
      totalFalsePositiveReduction: 5,
      totalFalseNegativeIncrease: 0,
      totalTruePositiveLoss: 0,
      proposals: [
        {
          kanji: "本",
          status: "proposal",
          action: "append_reference_constraint",
          constraint: {
            type: "referenceMetricMax",
            metricPath: "perRole.role.centerDistance",
            max: 0.2,
            severity: "hard",
            status: "candidate",
          },
          impact: {
            falsePositiveReduction: 5,
            falseNegativeIncrease: 0,
            truePositiveLoss: 0,
          },
        },
      ],
    },
    requireProposals: true,
  });

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);
});

test("validatePatchProposalsQualityGate should fail empty report when required", () => {
  const result = validatePatchProposalsQualityGate({
    proposalReport: {
      proposalCount: 0,
      totalFalsePositiveReduction: 0,
      totalFalseNegativeIncrease: 0,
      totalTruePositiveLoss: 0,
      proposals: [],
    },
    requireProposals: true,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "no_proposals");
});

test("validatePatchProposalsQualityGate should fail on total true positive loss", () => {
  const result = validatePatchProposalsQualityGate({
    proposalReport: {
      proposalCount: 1,
      totalFalsePositiveReduction: 5,
      totalFalseNegativeIncrease: 0,
      totalTruePositiveLoss: 1,
      proposals: [],
    },
    requireProposals: false,
  });

  assert.equal(result.passed, false);

  assert.equal(result.failures[0].code, "total_true_positive_loss");
});

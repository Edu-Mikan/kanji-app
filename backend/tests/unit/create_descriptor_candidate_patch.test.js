const test = require("node:test");

const assert = require("node:assert/strict");

const {
  isUsefulEvaluation,
  buildCandidateRule,
  buildDescriptorCandidatePatch,
} = require("../../scripts/create_descriptor_candidate_patch");

test("isUsefulEvaluation should accept safe evaluations that reduce false positives", () => {
  assert.equal(
    isUsefulEvaluation(
      {
        safe: true,
        falsePositiveReduction: 2,
        falseNegativeIncrease: 0,
        truePositiveLoss: 0,
      },
      {
        minFalsePositiveReduction: 1,
        requireSafe: true,
      },
    ),
    true,
  );
});

test("isUsefulEvaluation should reject evaluations that introduce false negatives", () => {
  assert.equal(
    isUsefulEvaluation(
      {
        safe: false,
        falsePositiveReduction: 2,
        falseNegativeIncrease: 1,
        truePositiveLoss: 1,
      },
      {
        minFalsePositiveReduction: 1,
        requireSafe: true,
      },
    ),
    false,
  );
});

test("buildCandidateRule should create reference max rule", () => {
  const rule = buildCandidateRule({
    metricPath: "perRole.role_bottomStroke.centerDistance",
    suggestedMax: 0.2026,
    source: "perRole",
    comparisonGroup: "falsePositiveVsTruePositive",
    risk: "medium",
    falsePositiveReduction: 2,
    falseNegativeIncrease: 0,
    truePositiveLoss: 0,
    safe: true,
    before: {
      truePositive: 12,
      falseNegative: 0,
      trueNegative: 2,
      falsePositive: 2,
    },
    after: {
      truePositive: 12,
      falseNegative: 0,
      trueNegative: 4,
      falsePositive: 0,
    },
    affectedSampleCount: 2,
    affectedSamples: [],
  });

  assert.equal(rule.type, "referenceMetricMax");

  assert.equal(rule.metricPath, "perRole.role_bottomStroke.centerDistance");

  assert.equal(rule.max, 0.2026);

  assert.equal(rule.evidence.falsePositiveReduction, 2);
});

test("buildDescriptorCandidatePatch should include useful safe rules only", () => {
  const patch = buildDescriptorCandidatePatch({
    evaluationReport: {
      kanji: "田",
      sampleCount: 16,
      recommendationCount: 1,
      safeCount: 1,
      usefulCount: 1,
      originalClassifications: {
        truePositive: 12,
        falseNegative: 0,
        trueNegative: 2,
        falsePositive: 2,
      },
      evaluations: [
        {
          metricPath: "perRole.role_bottomStroke.centerDistance",
          suggestedMax: 0.2026,
          source: "perRole",
          comparisonGroup: "falsePositiveVsTruePositive",
          risk: "medium",
          falsePositiveReduction: 2,
          falseNegativeIncrease: 0,
          truePositiveLoss: 0,
          safe: true,
          before: {
            truePositive: 12,
            falseNegative: 0,
            trueNegative: 2,
            falsePositive: 2,
          },
          after: {
            truePositive: 12,
            falseNegative: 0,
            trueNegative: 4,
            falsePositive: 0,
          },
          affectedSampleCount: 2,
          affectedSamples: [],
        },
      ],
    },
  });

  assert.equal(patch.kanji, "田");

  assert.equal(patch.status, "candidate");

  assert.equal(patch.ruleCount, 1);

  assert.equal(patch.rules[0].type, "referenceMetricMax");
});

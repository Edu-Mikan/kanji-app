const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateReferenceMetricMaxRule,
  evaluateSampleAgainstPatch,
  evaluateCandidatePatch,
  buildCandidatePatchEvaluationReport,
} = require("../../scripts/evaluate_descriptor_candidate_patch");

test("evaluateReferenceMetricMaxRule should pass when metric is below threshold", () => {
  const result = evaluateReferenceMetricMaxRule({
    sampleEvaluation: {
      perRoleReferenceComparison: {
        role_bottomStroke: {
          centerDistance: 0.1,
        },
      },
    },
    rule: {
      type: "referenceMetricMax",
      metricPath: "perRole.role_bottomStroke.centerDistance",
      max: 0.2,
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.metricValue, 0.1);
  assert.equal(result.hasMetric, true);
});

test("evaluateReferenceMetricMaxRule should fail when metric is above threshold", () => {
  const result = evaluateReferenceMetricMaxRule({
    sampleEvaluation: {
      perRoleReferenceComparison: {
        role_bottomStroke: {
          centerDistance: 0.3,
        },
      },
    },
    rule: {
      type: "referenceMetricMax",
      metricPath: "perRole.role_bottomStroke.centerDistance",
      max: 0.2,
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.metricValue, 0.3);
  assert.equal(result.hasMetric, true);
});

test("evaluateReferenceMetricMaxRule should pass when metric is missing", () => {
  const result = evaluateReferenceMetricMaxRule({
    sampleEvaluation: {
      perRoleReferenceComparison: {},
    },
    rule: {
      type: "referenceMetricMax",
      metricPath: "perRole.role_bottomStroke.centerDistance",
      max: 0.2,
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.hasMetric, false);
  assert.equal(result.metricValue, null);
});

test("evaluateSampleAgainstPatch should keep true positive accepted when rule passes", () => {
  const result = evaluateSampleAgainstPatch({
    sampleEvaluation: {
      recognitionId: "tp-1",
      classification: "truePositive",
      expectedCorrect: true,
      actualAccepted: true,
      perRoleReferenceComparison: {
        role_bottomStroke: {
          centerDistance: 0.1,
        },
      },
    },
    patch: {
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2,
        },
      ],
    },
  });

  assert.equal(result.before, "truePositive");
  assert.equal(result.after, "truePositive");
  assert.equal(result.acceptedBefore, true);
  assert.equal(result.acceptedAfter, true);
  assert.equal(result.changed, false);
  assert.equal(result.failedRuleCount, 0);
});

test("evaluateSampleAgainstPatch should turn false positive into true negative when rule fails", () => {
  const result = evaluateSampleAgainstPatch({
    sampleEvaluation: {
      recognitionId: "fp-1",
      classification: "falsePositive",
      expectedCorrect: false,
      actualAccepted: true,
      perRoleReferenceComparison: {
        role_bottomStroke: {
          centerDistance: 0.3,
        },
      },
    },
    patch: {
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2,
        },
      ],
    },
  });

  assert.equal(result.before, "falsePositive");
  assert.equal(result.after, "trueNegative");
  assert.equal(result.acceptedBefore, true);
  assert.equal(result.acceptedAfter, false);
  assert.equal(result.changed, true);
  assert.equal(result.failedRuleCount, 1);
});

test("evaluateCandidatePatch should reduce false positives without losing true positives", () => {
  const result = evaluateCandidatePatch({
    calibrationReport: {
      sampleEvaluations: [
        {
          recognitionId: "tp-1",
          classification: "truePositive",
          expectedCorrect: true,
          actualAccepted: true,
          perRoleReferenceComparison: {
            role_bottomStroke: {
              centerDistance: 0.1,
            },
          },
        },
        {
          recognitionId: "fp-1",
          classification: "falsePositive",
          expectedCorrect: false,
          actualAccepted: true,
          perRoleReferenceComparison: {
            role_bottomStroke: {
              centerDistance: 0.3,
            },
          },
        },
      ],
    },
    patch: {
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2,
        },
      ],
    },
  });

  assert.equal(result.before.truePositive, 1);
  assert.equal(result.before.falsePositive, 1);

  assert.equal(result.after.truePositive, 1);
  assert.equal(result.after.falsePositive, 0);
  assert.equal(result.after.trueNegative, 1);

  assert.equal(result.falsePositiveReduction, 1);
  assert.equal(result.falseNegativeIncrease, 0);
  assert.equal(result.truePositiveLoss, 0);
  assert.equal(result.safe, true);
  assert.equal(result.affectedSampleCount, 1);
});

test("evaluateCandidatePatch should mark patch unsafe when it loses true positives", () => {
  const result = evaluateCandidatePatch({
    calibrationReport: {
      sampleEvaluations: [
        {
          recognitionId: "tp-1",
          classification: "truePositive",
          expectedCorrect: true,
          actualAccepted: true,
          perRoleReferenceComparison: {
            role_bottomStroke: {
              centerDistance: 0.3,
            },
          },
        },
      ],
    },
    patch: {
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2,
        },
      ],
    },
  });

  assert.equal(result.before.truePositive, 1);
  assert.equal(result.after.falseNegative, 1);
  assert.equal(result.truePositiveLoss, 1);
  assert.equal(result.falseNegativeIncrease, 1);
  assert.equal(result.safe, false);
});

test("buildCandidatePatchEvaluationReport should include report metadata", () => {
  const report = buildCandidatePatchEvaluationReport({
    calibrationReport: {
      kanji: "田",
      sampleEvaluations: [
        {
          recognitionId: "tp-1",
          classification: "truePositive",
          expectedCorrect: true,
          actualAccepted: true,
          perRoleReferenceComparison: {
            role_bottomStroke: {
              centerDistance: 0.1,
            },
          },
        },
      ],
    },
    patch: {
      status: "candidate",
      action: "review",
      ruleCount: 1,
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2,
        },
      ],
    },
  });

  assert.equal(report.kanji, "田");
  assert.equal(report.patchStatus, "candidate");
  assert.equal(report.patchAction, "review");
  assert.equal(report.sampleCount, 1);
  assert.equal(report.ruleCount, 1);
  assert.equal(report.safe, true);
});

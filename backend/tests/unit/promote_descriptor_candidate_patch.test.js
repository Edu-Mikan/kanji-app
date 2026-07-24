const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertPromotionIsSafe,
  buildApprovedReferenceConstraint,
  promoteCandidatePatch,
} = require("../../scripts/promote_descriptor_candidate_patch");

test("assertPromotionIsSafe should accept safe useful evaluations", () => {
  assert.doesNotThrow(() =>
    assertPromotionIsSafe({
      patch: {
        status: "candidate",
        kanji: "田",
      },
      evaluationReport: {
        kanji: "田",
        safe: true,
        falsePositiveReduction: 2,
        falseNegativeIncrease: 0,
        truePositiveLoss: 0,
      },
      minFalsePositiveReduction: 1,
    }),
  );
});

test("assertPromotionIsSafe should reject unsafe evaluations", () => {
  assert.throws(
    () =>
      assertPromotionIsSafe({
        patch: {
          status: "candidate",
          kanji: "田",
        },
        evaluationReport: {
          kanji: "田",
          safe: false,
          falsePositiveReduction: 2,
          falseNegativeIncrease: 1,
          truePositiveLoss: 1,
        },
        minFalsePositiveReduction: 1,
      }),
    /not safe/,
  );
});

test("assertPromotionIsSafe should reject false negative increases", () => {
  assert.throws(
    () =>
      assertPromotionIsSafe({
        patch: {
          status: "candidate",
          kanji: "田",
        },
        evaluationReport: {
          kanji: "田",
          safe: true,
          falsePositiveReduction: 2,
          falseNegativeIncrease: 1,
          truePositiveLoss: 0,
        },
        minFalsePositiveReduction: 1,
      }),
    /false negatives/,
  );
});

test("buildApprovedReferenceConstraint should create approved hard constraint", () => {
  const constraint = buildApprovedReferenceConstraint({
    rule: {
      type: "referenceMetricMax",
      metricPath: "perRole.role_bottomStroke.centerDistance",
      max: 0.2026,
      comparisonGroup: "falsePositiveVsTruePositive",
      risk: "medium",
    },
    evaluationReport: {
      sampleCount: 16,
      affectedSampleCount: 2,
      falsePositiveReduction: 2,
      falseNegativeIncrease: 0,
      truePositiveLoss: 0,
      safe: true,
    },
  });

  assert.equal(constraint.type, "referenceMetricMax");

  assert.equal(constraint.status, "approved");

  assert.equal(constraint.severity, "hard");

  assert.equal(constraint.evidence.falsePositiveReduction, 2);
});

test("promoteCandidatePatch should append approved reference constraints", () => {
  const result = promoteCandidatePatch({
    descriptorFile: {
      descriptors: {
        田: {
          strokes: [],
        },
      },
    },
    patch: {
      mode: "descriptor_candidate_patch",
      status: "candidate",
      kanji: "田",
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2026,
          comparisonGroup: "falsePositiveVsTruePositive",
          risk: "medium",
        },
      ],
    },
    evaluationReport: {
      mode: "descriptor_candidate_patch_evaluation",
      kanji: "田",
      sampleCount: 16,
      affectedSampleCount: 2,
      safe: true,
      falsePositiveReduction: 2,
      falseNegativeIncrease: 0,
      truePositiveLoss: 0,
    },
  });

  const descriptor = result.descriptors.田;

  assert.equal(descriptor.referenceConstraints.length, 1);

  assert.equal(descriptor.referenceConstraints[0].status, "approved");

  assert.equal(descriptor.referenceConstraints[0].severity, "hard");

  assert.equal(descriptor.promotionMetadata.safe, true);
});

test("promoteCandidatePatch should avoid duplicate constraints", () => {
  const result = promoteCandidatePatch({
    descriptorFile: {
      descriptors: {
        田: {
          strokes: [],
          referenceConstraints: [
            {
              type: "referenceMetricMax",
              metricPath: "perRole.role_bottomStroke.centerDistance",
              max: 0.2026,
              severity: "hard",
              status: "approved",
            },
          ],
        },
      },
    },
    patch: {
      mode: "descriptor_candidate_patch",
      status: "candidate",
      kanji: "田",
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2026,
          comparisonGroup: "falsePositiveVsTruePositive",
          risk: "medium",
        },
      ],
    },
    evaluationReport: {
      mode: "descriptor_candidate_patch_evaluation",
      kanji: "田",
      sampleCount: 16,
      affectedSampleCount: 2,
      safe: true,
      falsePositiveReduction: 2,
      falseNegativeIncrease: 0,
      truePositiveLoss: 0,
    },
  });

  assert.equal(result.descriptors.田.referenceConstraints.length, 1);
});

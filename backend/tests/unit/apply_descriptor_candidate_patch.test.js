const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getDescriptorCatalog,
  buildReferenceConstraintFromRule,
  applyCandidatePatchToDescriptorFile,
} = require("../../scripts/apply_descriptor_candidate_patch");

test("getDescriptorCatalog should support wrapped descriptor files", () => {
  const descriptors = getDescriptorCatalog({
    descriptors: {
      田: {
        strokes: [],
      },
    },
  });

  assert.ok(descriptors.田);
});

test("getDescriptorCatalog should support raw descriptor catalog", () => {
  const descriptors = getDescriptorCatalog({
    田: {
      strokes: [],
    },
  });

  assert.ok(descriptors.田);
});

test("buildReferenceConstraintFromRule should create candidate reference constraint", () => {
  const constraint = buildReferenceConstraintFromRule({
    type: "referenceMetricMax",
    metricPath: "perRole.role_bottomStroke.centerDistance",
    max: 0.2026,
    comparisonGroup: "falsePositiveVsTruePositive",
    risk: "medium",
    evidence: {
      falsePositiveReduction: 2,
      falseNegativeIncrease: 0,
      truePositiveLoss: 0,
      safe: true,
    },
  });

  assert.equal(constraint.type, "referenceMetricMax");

  assert.equal(
    constraint.metricPath,
    "perRole.role_bottomStroke.centerDistance",
  );

  assert.equal(constraint.max, 0.2026);

  assert.equal(constraint.severity, "hard");

  assert.equal(constraint.status, "candidate");

  assert.equal(constraint.evidence.falsePositiveReduction, 2);
});

test("applyCandidatePatchToDescriptorFile should append reference constraints", () => {
  const result = applyCandidatePatchToDescriptorFile({
    descriptorFile: {
      descriptors: {
        田: {
          strokes: [
            {
              id: "bottomStroke",
            },
          ],
        },
      },
    },

    patch: {
      mode: "descriptor_candidate_patch",
      status: "candidate",
      action: "review",
      kanji: "田",
      selectionPolicy: {
        requireSafe: true,
      },
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2026,
          comparisonGroup: "falsePositiveVsTruePositive",
          risk: "medium",
          evidence: {
            falsePositiveReduction: 2,
            falseNegativeIncrease: 0,
            truePositiveLoss: 0,
            safe: true,
          },
        },
      ],
    },
  });

  const descriptor = result.descriptors.田;

  assert.equal(descriptor.referenceConstraints.length, 1);

  assert.equal(
    descriptor.referenceConstraints[0].metricPath,
    "perRole.role_bottomStroke.centerDistance",
  );

  assert.equal(descriptor.referenceConstraints[0].max, 0.2026);

  assert.equal(descriptor.candidateMetadata.patchStatus, "candidate");
});

test("applyCandidatePatchToDescriptorFile should preserve existing reference constraints", () => {
  const result = applyCandidatePatchToDescriptorFile({
    descriptorFile: {
      descriptors: {
        田: {
          strokes: [],
          referenceConstraints: [
            {
              type: "existingConstraint",
            },
          ],
        },
      },
    },

    patch: {
      kanji: "田",
      rules: [
        {
          type: "referenceMetricMax",
          metricPath: "perRole.role_bottomStroke.centerDistance",
          max: 0.2026,
        },
      ],
    },
  });

  assert.equal(result.descriptors.田.referenceConstraints.length, 2);

  assert.equal(
    result.descriptors.田.referenceConstraints[0].type,
    "existingConstraint",
  );
});

test("applyCandidatePatchToDescriptorFile should fail when descriptor is missing", () => {
  assert.throws(
    () =>
      applyCandidatePatchToDescriptorFile({
        descriptorFile: {
          descriptors: {},
        },
        patch: {
          kanji: "田",
          rules: [],
        },
      }),
    /Descriptor not found/,
  );
});

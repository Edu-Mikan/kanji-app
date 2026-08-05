"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareSortedArrays,
  buildEntryMapByRecognitionId,
  buildDatasetPartitions,
  hasOwnFeature,
  calculateMean,
  calculatePopulationStandardDeviation,
  fitFeatureTransformers,
  buildVectorDimensionNames,
  vectorizeDatasetEntry,
  vectorizeDatasetEntries,
  validateVectors,
} = require("../../scripts/prepare_reference_candidate_baseline_vectors");

function createEntry({
  recognitionId,
  targetKanji = "木",
  label = 1,
  features = {
    "feature.a": 1,
  },
  lineNumber = 1,
}) {
  return {
    lineNumber,
    row: {
      recognitionId,
      targetKanji,
      expectedKanji: targetKanji,
      sampleIsCorrect: label === 1,
      classification: label === 1 ? "truePositive" : "trueNegative",
      label,
      features,
    },
  };
}

test("compareSortedArrays ignores original order", () => {
  assert.equal(
    compareSortedArrays(
      ["recognition-2", "recognition-1"],
      ["recognition-1", "recognition-2"],
    ),
    true,
  );

  assert.equal(
    compareSortedArrays(["recognition-1"], ["recognition-1", "recognition-2"]),
    false,
  );
});

test("buildEntryMapByRecognitionId indexes dataset entries", () => {
  const firstEntry = createEntry({
    recognitionId: "recognition-1",
  });

  const secondEntry = createEntry({
    recognitionId: "recognition-2",
  });

  const result = buildEntryMapByRecognitionId([firstEntry, secondEntry]);

  assert.equal(result.size, 2);

  assert.equal(result.get("recognition-1"), firstEntry);

  assert.equal(result.get("recognition-2"), secondEntry);
});

test("buildEntryMapByRecognitionId rejects duplicate IDs", () => {
  const duplicatedEntry = createEntry({
    recognitionId: "duplicated",
  });

  assert.throws(
    () => buildEntryMapByRecognitionId([duplicatedEntry, duplicatedEntry]),
    /Duplicated recognitionId in dataset/,
  );
});

test("buildDatasetPartitions resolves manifest IDs", () => {
  const firstEntry = createEntry({
    recognitionId: "training-1",
  });

  const secondEntry = createEntry({
    recognitionId: "validation-1",
  });

  const partitions = buildDatasetPartitions({
    datasetEntries: [firstEntry, secondEntry],
    splitManifest: {
      trainingRecognitionIds: ["training-1"],
      validationRecognitionIds: ["validation-1"],
    },
  });

  assert.deepEqual(partitions.trainingEntries, [firstEntry]);

  assert.deepEqual(partitions.validationEntries, [secondEntry]);
});

test("hasOwnFeature distinguishes missing and zero values", () => {
  const features = {
    "feature.presentZero": 0,
  };

  assert.equal(hasOwnFeature(features, "feature.presentZero"), true);

  assert.equal(hasOwnFeature(features, "feature.missing"), false);
});

test("calculateMean calculates the arithmetic mean", () => {
  assert.equal(calculateMean([1, 2, 3, 4]), 2.5);

  assert.equal(calculateMean([]), 0);
});

test("calculatePopulationStandardDeviation calculates population deviation", () => {
  const values = [1, 2, 3];
  const mean = calculateMean(values);

  const standardDeviation = calculatePopulationStandardDeviation(values, mean);

  assert.ok(Math.abs(standardDeviation - Math.sqrt(2 / 3)) < 1e-12);

  assert.equal(calculatePopulationStandardDeviation([], 0), 0);
});

test("fitFeatureTransformers uses only present training values", () => {
  const trainingEntries = [
    createEntry({
      recognitionId: "training-1",
      features: {
        "feature.a": 1,
        "feature.zero": 0,
      },
    }),
    createEntry({
      recognitionId: "training-2",
      features: {
        "feature.a": 3,
      },
    }),
    createEntry({
      recognitionId: "training-3",
      features: {
        "feature.b": 10,
      },
    }),
  ];

  const transformers = fitFeatureTransformers({
    trainingEntries,
    featureNames: ["feature.a", "feature.b", "feature.zero", "feature.unseen"],
  });

  const featureA = transformers.find(
    (transformer) => transformer.featureName === "feature.a",
  );

  assert.equal(featureA.trainingPresentCount, 2);

  assert.equal(featureA.trainingMissingCount, 1);

  assert.equal(featureA.mean, 2);
  assert.equal(featureA.standardDeviation, 1);

  assert.equal(featureA.scale, 1);
  assert.equal(featureA.unseenInTraining, false);

  const zeroFeature = transformers.find(
    (transformer) => transformer.featureName === "feature.zero",
  );

  assert.equal(zeroFeature.trainingPresentCount, 1);

  assert.equal(zeroFeature.mean, 0);
  assert.equal(zeroFeature.standardDeviation, 0);

  assert.equal(zeroFeature.scale, 1);
  assert.equal(zeroFeature.isConstant, true);

  assert.equal(zeroFeature.unseenInTraining, false);

  const unseenFeature = transformers.find(
    (transformer) => transformer.featureName === "feature.unseen",
  );

  assert.equal(unseenFeature.trainingPresentCount, 0);

  assert.equal(unseenFeature.unseenInTraining, true);

  assert.equal(unseenFeature.scale, 1);
});

test("buildVectorDimensionNames uses value and presence pairs", () => {
  const dimensionNames = buildVectorDimensionNames([
    {
      featureName: "feature.a",
    },
    {
      featureName: "feature.b",
    },
  ]);

  assert.deepEqual(dimensionNames, [
    "value.feature.a",
    "presence.feature.a",
    "value.feature.b",
    "presence.feature.b",
  ]);
});

test("vectorizeDatasetEntry distinguishes missing and present zero", () => {
  const trainingEntries = [
    createEntry({
      recognitionId: "training-1",
      features: {
        "feature.a": 0,
      },
    }),
    createEntry({
      recognitionId: "training-2",
      features: {
        "feature.a": 2,
      },
    }),
  ];

  const transformers = fitFeatureTransformers({
    trainingEntries,
    featureNames: ["feature.a", "feature.b"],
  });

  const presentZeroVector = vectorizeDatasetEntry({
    datasetEntry: createEntry({
      recognitionId: "present-zero",
      features: {
        "feature.a": 0,
      },
    }),
    featureTransformers: transformers,
  });

  assert.deepEqual(presentZeroVector.vector, [-1, 1, 0, 0]);

  const missingVector = vectorizeDatasetEntry({
    datasetEntry: createEntry({
      recognitionId: "missing",
      features: {},
    }),
    featureTransformers: transformers,
  });

  assert.deepEqual(missingVector.vector, [0, 0, 0, 0]);
});

test("vectorizeDatasetEntries creates fixed-size vectors", () => {
  const entries = [
    createEntry({
      recognitionId: "entry-1",
      features: {
        "feature.a": 1,
      },
    }),
    createEntry({
      recognitionId: "entry-2",
      features: {
        "feature.b": 2,
      },
    }),
  ];

  const transformers = fitFeatureTransformers({
    trainingEntries: entries,
    featureNames: ["feature.a", "feature.b"],
  });

  const vectors = vectorizeDatasetEntries({
    datasetEntries: entries,
    featureTransformers: transformers,
  });

  assert.equal(vectors.length, 2);
  assert.equal(vectors[0].vector.length, 4);

  assert.equal(vectors[1].vector.length, 4);
});

test("validateVectors accepts finite vectors with expected dimensions", () => {
  const result = validateVectors({
    vectorizedEntries: [
      {
        recognitionId: "recognition-1",
        vector: [0, 1, -0.5, 1],
      },
    ],
    expectedDimensionCount: 4,
    partitionName: "Training",
  });

  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
});

test("validateVectors rejects an invalid dimension count", () => {
  const result = validateVectors({
    vectorizedEntries: [
      {
        recognitionId: "recognition-1",
        vector: [0, 1],
      },
    ],
    expectedDimensionCount: 4,
    partitionName: "Validation",
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("has 2 dimensions, expected 4"),
    ),
  );
});

test("validateVectors rejects non-finite values", () => {
  const result = validateVectors({
    vectorizedEntries: [
      {
        recognitionId: "recognition-1",
        vector: [0, 1, Number.NaN, 1],
      },
    ],
    expectedDimensionCount: 4,
    partitionName: "Training",
  });

  assert.equal(result.passed, false);

  assert.ok(
    result.errors.some((error) =>
      error.includes("contains a non-finite value"),
    ),
  );
});

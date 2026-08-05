"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  validateOptions,
  calculateDeterministicKey,
  buildStratumKey,
  groupEntriesByStratum,
  sortEntriesDeterministically,
  calculateValidationCount,
  createStratifiedDatasetSplit,
  getRecognitionIds,
  getTargetKanjis,
  findSharedRecognitionIds,
  findDuplicateRecognitionIds,
  buildPartitionSummary,
  validateCreatedSplit,
  buildSplitManifest,
} = require("../../scripts/create_reference_candidate_baseline_split");

function createEntry({
  recognitionId,
  targetKanji = "木",
  label = 1,
  lineNumber = 1,
}) {
  const sampleIsCorrect = label === 1;

  return {
    lineNumber,
    row: {
      recognitionId,
      targetKanji,
      expectedKanji: targetKanji,
      sampleIsCorrect,
      classification: sampleIsCorrect ? "truePositive" : "trueNegative",
      label,
      features: {
        "referenceComparison.comparisonCost": lineNumber / 100,
      },
    },
  };
}

function createBalancedDataset() {
  const entries = [];
  let lineNumber = 1;

  for (const targetKanji of ["木", "本"]) {
    for (const label of [0, 1]) {
      for (let index = 1; index <= 5; index++) {
        entries.push(
          createEntry({
            recognitionId: `${targetKanji}-${label}-${index}`,
            targetKanji,
            label,
            lineNumber,
          }),
        );

        lineNumber++;
      }
    }
  }

  return entries;
}

test("parseArguments reads split configuration", () => {
  const options = parseArguments([
    "--dataset",
    "./custom/dataset.jsonl",
    "--out",
    "./custom/split.json",
    "--seed",
    "test-seed",
    "--validation-ratio",
    "0.25",
  ]);

  assert.equal(
    options.datasetPath,
    path.resolve(process.cwd(), "custom", "dataset.jsonl"),
  );

  assert.equal(
    options.outputPath,
    path.resolve(process.cwd(), "custom", "split.json"),
  );

  assert.equal(options.seed, "test-seed");
  assert.equal(options.validationRatio, 0.25);
});

test("validateOptions rejects invalid validation ratios", () => {
  for (const validationRatio of [Number.NaN, -0.1, 0, 1, 1.1]) {
    assert.throws(
      () =>
        validateOptions({
          seed: "seed",
          validationRatio,
        }),
      /validationRatio must be greater than 0 and less than 1/,
    );
  }
});

test("validateOptions rejects an empty seed", () => {
  assert.throws(
    () =>
      validateOptions({
        seed: "",
        validationRatio: 0.2,
      }),
    /seed must be a non-empty string/,
  );
});

test("calculateDeterministicKey is stable for the same input", () => {
  const firstKey = calculateDeterministicKey({
    seed: "seed-a",
    recognitionId: "recognition-1",
  });

  const secondKey = calculateDeterministicKey({
    seed: "seed-a",
    recognitionId: "recognition-1",
  });

  assert.equal(firstKey, secondKey);

  assert.notEqual(
    firstKey,
    calculateDeterministicKey({
      seed: "seed-b",
      recognitionId: "recognition-1",
    }),
  );
});

test("buildStratumKey separates target kanji and label", () => {
  assert.notEqual(
    buildStratumKey({
      targetKanji: "木",
      label: 1,
    }),
    buildStratumKey({
      targetKanji: "木",
      label: 0,
    }),
  );

  assert.notEqual(
    buildStratumKey({
      targetKanji: "木",
      label: 1,
    }),
    buildStratumKey({
      targetKanji: "本",
      label: 1,
    }),
  );
});

test("groupEntriesByStratum groups by target kanji and label", () => {
  const datasetEntries = [
    createEntry({
      recognitionId: "wood-positive-1",
      targetKanji: "木",
      label: 1,
    }),
    createEntry({
      recognitionId: "wood-positive-2",
      targetKanji: "木",
      label: 1,
    }),
    createEntry({
      recognitionId: "wood-negative",
      targetKanji: "木",
      label: 0,
    }),
    createEntry({
      recognitionId: "book-positive",
      targetKanji: "本",
      label: 1,
    }),
  ];

  const strata = groupEntriesByStratum(datasetEntries);

  assert.equal(strata.size, 3);

  assert.equal(strata.get("木\u00001").length, 2);

  assert.equal(strata.get("木\u00000").length, 1);

  assert.equal(strata.get("本\u00001").length, 1);
});

test("sortEntriesDeterministically produces a stable order", () => {
  const datasetEntries = [
    createEntry({
      recognitionId: "recognition-3",
    }),
    createEntry({
      recognitionId: "recognition-1",
    }),
    createEntry({
      recognitionId: "recognition-2",
    }),
  ];

  const firstOrder = getRecognitionIds(
    sortEntriesDeterministically(datasetEntries, "stable-seed"),
  );

  const secondOrder = getRecognitionIds(
    sortEntriesDeterministically([...datasetEntries].reverse(), "stable-seed"),
  );

  assert.deepEqual(firstOrder, secondOrder);
});

test("calculateValidationCount preserves training rows", () => {
  assert.equal(
    calculateValidationCount({
      stratumSize: 1,
      validationRatio: 0.2,
    }),
    0,
  );

  assert.equal(
    calculateValidationCount({
      stratumSize: 2,
      validationRatio: 0.2,
    }),
    1,
  );

  assert.equal(
    calculateValidationCount({
      stratumSize: 5,
      validationRatio: 0.2,
    }),
    1,
  );

  assert.equal(
    calculateValidationCount({
      stratumSize: 10,
      validationRatio: 0.2,
    }),
    2,
  );

  assert.equal(
    calculateValidationCount({
      stratumSize: 2,
      validationRatio: 0.9,
    }),
    1,
  );
});

test("createStratifiedDatasetSplit is reproducible", () => {
  const datasetEntries = createBalancedDataset();

  const firstSplit = createStratifiedDatasetSplit({
    datasetEntries,
    validationRatio: 0.2,
    seed: "split-seed",
  });

  const secondSplit = createStratifiedDatasetSplit({
    datasetEntries: [...datasetEntries].reverse(),
    validationRatio: 0.2,
    seed: "split-seed",
  });

  assert.deepEqual(
    getRecognitionIds(firstSplit.trainingEntries),
    getRecognitionIds(secondSplit.trainingEntries),
  );

  assert.deepEqual(
    getRecognitionIds(firstSplit.validationEntries),
    getRecognitionIds(secondSplit.validationEntries),
  );
});

test("createStratifiedDatasetSplit preserves every source row", () => {
  const datasetEntries = createBalancedDataset();

  const split = createStratifiedDatasetSplit({
    datasetEntries,
    validationRatio: 0.2,
    seed: "split-seed",
  });

  const sourceIds = getRecognitionIds(datasetEntries);

  const splitIds = getRecognitionIds([
    ...split.trainingEntries,
    ...split.validationEntries,
  ]);

  assert.deepEqual(splitIds, sourceIds);
});

test("createStratifiedDatasetSplit keeps each balanced stratum in both partitions", () => {
  const datasetEntries = createBalancedDataset();

  const split = createStratifiedDatasetSplit({
    datasetEntries,
    validationRatio: 0.2,
    seed: "split-seed",
  });

  assert.equal(split.stratumSummaries.length, 4);

  for (const summary of split.stratumSummaries) {
    assert.equal(summary.totalCount, 5);
    assert.equal(summary.trainingCount, 4);
    assert.equal(summary.validationCount, 1);
  }
});

test("findSharedRecognitionIds finds partition leakage", () => {
  const sharedEntry = createEntry({
    recognitionId: "shared",
  });

  const sharedIds = findSharedRecognitionIds({
    trainingEntries: [
      sharedEntry,
      createEntry({
        recognitionId: "training-only",
      }),
    ],
    validationEntries: [
      sharedEntry,
      createEntry({
        recognitionId: "validation-only",
      }),
    ],
  });

  assert.deepEqual(sharedIds, ["shared"]);
});

test("findDuplicateRecognitionIds reports duplicates", () => {
  const duplicatedEntry = createEntry({
    recognitionId: "duplicated",
  });

  const duplicates = findDuplicateRecognitionIds([
    duplicatedEntry,
    duplicatedEntry,
    createEntry({
      recognitionId: "unique",
    }),
  ]);

  assert.deepEqual(duplicates, [
    {
      recognitionId: "duplicated",
      count: 2,
    },
  ]);
});

test("getTargetKanjis returns a sorted unique list", () => {
  const targetKanjis = getTargetKanjis([
    createEntry({
      recognitionId: "wood-1",
      targetKanji: "木",
    }),
    createEntry({
      recognitionId: "book-1",
      targetKanji: "本",
    }),
    createEntry({
      recognitionId: "wood-2",
      targetKanji: "木",
    }),
  ]);

  const expectedTargetKanjis = ["木", "本"].sort((left, right) =>
    left.localeCompare(right),
  );

  assert.deepEqual(targetKanjis, expectedTargetKanjis);
});

test("buildPartitionSummary calculates rows, labels and kanjis", () => {
  const summary = buildPartitionSummary([
    createEntry({
      recognitionId: "wood-positive",
      targetKanji: "木",
      label: 1,
    }),
    createEntry({
      recognitionId: "wood-negative",
      targetKanji: "木",
      label: 0,
    }),
    createEntry({
      recognitionId: "book-positive",
      targetKanji: "本",
      label: 1,
    }),
  ]);

  const expectedTargetKanjis = ["木", "本"].sort((left, right) =>
    left.localeCompare(right),
  );

  assert.deepEqual(summary, {
    rowCount: 3,
    positiveCount: 2,
    negativeCount: 1,
    targetKanjiCount: 2,
    targetKanjis: expectedTargetKanjis,
  });
});

test("validateCreatedSplit accepts a valid split", () => {
  const datasetEntries = createBalancedDataset();

  const split = createStratifiedDatasetSplit({
    datasetEntries,
    validationRatio: 0.2,
    seed: "split-seed",
  });

  const validation = validateCreatedSplit({
    sourceEntries: datasetEntries,
    trainingEntries: split.trainingEntries,
    validationEntries: split.validationEntries,
  });

  assert.equal(validation.passed, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.sharedRecognitionIds, []);
});

test("validateCreatedSplit rejects shared recognition IDs", () => {
  const sharedEntry = createEntry({
    recognitionId: "shared",
    label: 1,
  });

  const negativeTrainingEntry = createEntry({
    recognitionId: "training-negative",
    label: 0,
  });

  const negativeValidationEntry = createEntry({
    recognitionId: "validation-negative",
    label: 0,
  });

  const validation = validateCreatedSplit({
    sourceEntries: [
      sharedEntry,
      negativeTrainingEntry,
      negativeValidationEntry,
    ],
    trainingEntries: [sharedEntry, negativeTrainingEntry],
    validationEntries: [sharedEntry, negativeValidationEntry],
  });

  assert.equal(validation.passed, false);

  assert.ok(
    validation.errors.some((error) =>
      error.includes("Training and validation share"),
    ),
  );
});

test("buildSplitManifest records traceability and partition IDs", () => {
  const datasetEntries = createBalancedDataset();

  const split = createStratifiedDatasetSplit({
    datasetEntries,
    validationRatio: 0.2,
    seed: "manifest-seed",
  });

  const validation = validateCreatedSplit({
    sourceEntries: datasetEntries,
    trainingEntries: split.trainingEntries,
    validationEntries: split.validationEntries,
  });

  const manifest = buildSplitManifest({
    datasetPath: __filename,
    datasetEntries,
    featureNames: ["referenceComparison.comparisonCost"],
    validationRatio: 0.2,
    seed: "manifest-seed",
    split,
    validation,
  });

  assert.equal(manifest.schemaVersion, 1);

  assert.equal(
    manifest.strategy,
    "deterministic_stratified_by_target_kanji_and_label",
  );

  assert.equal(manifest.configuration.seed, "manifest-seed");

  assert.equal(manifest.dataset.rowCount, 20);
  assert.equal(manifest.dataset.featureCount, 1);
  assert.equal(manifest.training.rowCount, 16);
  assert.equal(manifest.validation.rowCount, 4);

  assert.equal(manifest.trainingRecognitionIds.length, 16);

  assert.equal(manifest.validationRecognitionIds.length, 4);

  assert.equal(manifest.validationResult.passed, true);
});

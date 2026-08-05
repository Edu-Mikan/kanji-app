"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  parseArguments,
  splitEntriesByHeldOutKanji,
  buildPartitionSummary,
  findSharedValues,
  validateLeaveOneKanjiOutFold,
  buildLeaveOneKanjiOutFold,
  validateLeaveOneKanjiOutManifest,
} = require("../../scripts/create_reference_candidate_leave_one_kanji_out_folds");

function createEntry({ recognitionId, targetKanji, label, lineNumber = 1 }) {
  return {
    lineNumber,
    row: {
      recognitionId,
      targetKanji,
      expectedKanji: targetKanji,
      sampleIsCorrect: label === 1,
      classification: label === 1 ? "truePositive" : "trueNegative",
      label,
      features: {
        "referenceComparison.comparisonCost": lineNumber / 100,
      },
    },
  };
}

function createDatasetEntries() {
  return [
    createEntry({
      recognitionId: "wood-positive",
      targetKanji: "木",
      label: 1,
      lineNumber: 1,
    }),
    createEntry({
      recognitionId: "wood-negative",
      targetKanji: "木",
      label: 0,
      lineNumber: 2,
    }),
    createEntry({
      recognitionId: "book-positive",
      targetKanji: "本",
      label: 1,
      lineNumber: 3,
    }),
    createEntry({
      recognitionId: "book-negative",
      targetKanji: "本",
      label: 0,
      lineNumber: 4,
    }),
    createEntry({
      recognitionId: "one-positive",
      targetKanji: "一",
      label: 1,
      lineNumber: 5,
    }),
    createEntry({
      recognitionId: "one-negative",
      targetKanji: "一",
      label: 0,
      lineNumber: 6,
    }),
  ];
}

test("parseArguments reads LOOCV paths", () => {
  const options = parseArguments([
    "--dataset",
    "./custom/dataset.jsonl",
    "--out",
    "./custom/folds.json",
  ]);

  assert.equal(
    options.datasetPath,
    path.resolve(process.cwd(), "custom", "dataset.jsonl"),
  );

  assert.equal(
    options.outputPath,
    path.resolve(process.cwd(), "custom", "folds.json"),
  );
});

test("splitEntriesByHeldOutKanji separates the held-out kanji", () => {
  const result = splitEntriesByHeldOutKanji({
    datasetEntries: createDatasetEntries(),
    heldOutKanji: "木",
  });

  assert.equal(result.trainingEntries.length, 4);

  assert.equal(result.evaluationEntries.length, 2);

  assert.ok(
    result.trainingEntries.every(({ row }) => row.targetKanji !== "木"),
  );

  assert.ok(
    result.evaluationEntries.every(({ row }) => row.targetKanji === "木"),
  );
});

test("buildPartitionSummary counts rows, labels and kanjis", () => {
  const summary = buildPartitionSummary(createDatasetEntries().slice(0, 4));

  assert.equal(summary.rowCount, 4);

  assert.equal(summary.positiveCount, 2);

  assert.equal(summary.negativeCount, 2);

  assert.equal(summary.targetKanjiCount, 2);

  assert.equal(summary.recognitionIds.length, 4);
});

test("findSharedValues returns sorted intersections", () => {
  assert.deepEqual(findSharedValues(["c", "a", "b"], ["d", "b", "a"]), [
    "a",
    "b",
  ]);
});

test("validateLeaveOneKanjiOutFold accepts a valid fold", () => {
  const sourceEntries = createDatasetEntries();

  const { trainingEntries, evaluationEntries } = splitEntriesByHeldOutKanji({
    datasetEntries: sourceEntries,
    heldOutKanji: "木",
  });

  const validation = validateLeaveOneKanjiOutFold({
    sourceEntries,
    heldOutKanji: "木",
    trainingEntries,
    evaluationEntries,
  });

  assert.equal(validation.passed, true);

  assert.deepEqual(validation.errors, []);

  assert.deepEqual(validation.sharedRecognitionIds, []);
});

test("validateLeaveOneKanjiOutFold rejects held-out leakage", () => {
  const sourceEntries = createDatasetEntries();

  const validation = validateLeaveOneKanjiOutFold({
    sourceEntries,
    heldOutKanji: "木",
    trainingEntries: sourceEntries,
    evaluationEntries: sourceEntries.filter(
      ({ row }) => row.targetKanji === "木",
    ),
  });

  assert.equal(validation.passed, false);

  assert.ok(
    validation.errors.some((error) => error.includes("appears in training")),
  );
});

test("validateLeaveOneKanjiOutFold rejects mixed evaluation kanjis", () => {
  const sourceEntries = createDatasetEntries();

  const validation = validateLeaveOneKanjiOutFold({
    sourceEntries,
    heldOutKanji: "木",
    trainingEntries: sourceEntries.slice(2),
    evaluationEntries: sourceEntries.slice(0, 3),
  });

  assert.equal(validation.passed, false);

  assert.ok(
    validation.errors.some((error) => error.includes("must contain only")),
  );
});

test("buildLeaveOneKanjiOutFold creates a traceable fold", () => {
  const fold = buildLeaveOneKanjiOutFold({
    datasetEntries: createDatasetEntries(),
    heldOutKanji: "木",
  });

  assert.equal(fold.heldOutKanji, "木");

  assert.equal(fold.training.rowCount, 4);

  assert.equal(fold.evaluation.rowCount, 2);

  assert.equal(fold.evaluation.positiveCount, 1);

  assert.equal(fold.evaluation.negativeCount, 1);

  assert.equal(fold.validation.passed, true);

  assert.equal(fold.validation.sharedRecognitionIdCount, 0);
});

test("validateLeaveOneKanjiOutManifest accepts coherent folds", () => {
  const datasetEntries = createDatasetEntries();

  const folds = ["木", "本", "一"].map((heldOutKanji) =>
    buildLeaveOneKanjiOutFold({
      datasetEntries,
      heldOutKanji,
    }),
  );

  const manifest = {
    schemaVersion: 1,
    strategy: "leave_one_target_kanji_out",
    dataset: {
      rowCount: 6,
      targetKanjiCount: 3,
    },
    foldCount: 3,
    folds,
  };

  const validation = validateLeaveOneKanjiOutManifest(manifest);

  assert.equal(validation.passed, true);

  assert.deepEqual(validation.errors, []);
});

test("validateLeaveOneKanjiOutManifest detects duplicate held-out kanjis", () => {
  const datasetEntries = createDatasetEntries();

  const fold = buildLeaveOneKanjiOutFold({
    datasetEntries,
    heldOutKanji: "木",
  });

  const manifest = {
    schemaVersion: 1,
    strategy: "leave_one_target_kanji_out",
    dataset: {
      rowCount: 6,
      targetKanjiCount: 2,
    },
    foldCount: 2,
    folds: [fold, fold],
  };

  const validation = validateLeaveOneKanjiOutManifest(manifest);

  assert.equal(validation.passed, false);

  assert.ok(
    validation.errors.some((error) => error.includes("contain duplicates")),
  );
});

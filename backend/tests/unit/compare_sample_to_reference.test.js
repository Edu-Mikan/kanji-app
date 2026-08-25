const test = require("node:test");

const assert = require("node:assert/strict");

const {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  getExpectedKanji,
  findSample,
  buildComparisonReport,
} = require("../../scripts/compare_sample_to_reference");

const path = require("node:path");

test("getExpectedKanji should prefer expectedKanji", () => {
  assert.equal(
    getExpectedKanji({
      kanji: "日",
      expectedKanji: "田",
    }),
    "田",
  );
});

test("getExpectedKanji should fall back to kanji", () => {
  assert.equal(
    getExpectedKanji({
      kanji: "四",
    }),
    "四",
  );
});

test("findSample should find by recognition id", () => {
  const sample = findSample({
    recognitionId: "abc",
    samples: [
      {
        recognitionId: "abc",
        expectedKanji: "四",
      },
    ],
  });

  assert.equal(sample.expectedKanji, "四");
});

test("findSample should find first sample by kanji", () => {
  const sample = findSample({
    kanji: "六",
    samples: [
      {
        recognitionId: "one",
        expectedKanji: "四",
      },
      {
        recognitionId: "two",
        expectedKanji: "六",
      },
    ],
  });

  assert.equal(sample.recognitionId, "two");
});

test("buildComparisonReport should preserve sample and comparison metadata", () => {
  const report = buildComparisonReport({
    sample: {
      recognitionId: "id-1",
      kanji: "四",
      expectedKanji: "四",
      isCorrect: true,
      validationStrategy: "descriptor",
      validationResult: true,
      score: 0.5,
    },
    referenceFeatures: {
      kanji: "四",
      source: "kanji_full.json",
      strokeCount: 5,
    },
    comparison: {
      assignmentMode: "index",
      userStrokeCount: 5,
      referenceStrokeCount: 5,
      strokeCountDiff: 0,
      comparedStrokeCount: 5,
      meanStrokeCost: 0.1,
      comparisonCost: 0.1,
      perStrokeComparisons: [],
    },
  });

  assert.equal(report.sample.recognitionId, "id-1");

  assert.equal(report.reference.kanji, "四");

  assert.equal(report.comparison.comparisonCost, 0.1);
});
test("parseArgs uses the incremental reference catalog by default", () => {
  const options = parseArgs([]);

  assert.equal(options.datasetPath, DEFAULT_KANJI_DATASET_PATH);

  assert.equal(
    options.datasetPath.endsWith(
      path.join("data", "kanji_reference_catalog.json"),
    ),
    true,
  );
});

test("parseArgs preserves an explicit legacy dataset path", () => {
  const options = parseArgs(["--dataset", "./kanji_full.json"]);

  assert.equal(options.datasetPath.endsWith("kanji_full.json"), true);
});

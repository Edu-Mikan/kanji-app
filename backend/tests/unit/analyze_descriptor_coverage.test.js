const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  getExpectedKanjiFromSample,
  isSampleCorrect,
  buildCoverageRows,
  buildCoverageReport,
} = require("../../scripts/analyze_descriptor_coverage");

test("parseArgs should parse coverage arguments", () => {
  const options = parseArgs([
    "--file",
    "./training_data.jsonl",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--out-json",
    "./candidate_reports_training/descriptor_coverage_report.json",
  ]);

  assert.ok(options.filePath.endsWith("training_data.jsonl"));

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));

  assert.ok(options.outputPath.endsWith("descriptor_coverage_report.json"));

  assert.equal(options.minTotalSamplesForPriority, 5);

  assert.equal(options.minCorrectSamplesForPriority, 3);
});

test("validateOptions should reject missing file", () => {
  assert.throws(
    () =>
      validateOptions({
        descriptorPath: "./data/kanji_descriptors.json",
        outputPath:
          "./candidate_reports_training/descriptor_coverage_report.json",
        minTotalSamplesForPriority: 5,
        minCorrectSamplesForPriority: 3,
      }),
    /Missing --file/,
  );
});

test("getExpectedKanjiFromSample should prefer expectedKanji", () => {
  assert.equal(
    getExpectedKanjiFromSample({
      expectedKanji: "田",
      kanji: "日",
    }),
    "田",
  );
});

test("getExpectedKanjiFromSample should fall back to kanji", () => {
  assert.equal(
    getExpectedKanjiFromSample({
      kanji: "日",
    }),
    "日",
  );
});

test("isSampleCorrect should support expectedCorrect and isCorrect", () => {
  assert.equal(
    isSampleCorrect({
      expectedCorrect: true,
    }),
    true,
  );

  assert.equal(
    isSampleCorrect({
      isCorrect: true,
    }),
    true,
  );

  assert.equal(
    isSampleCorrect({
      isCorrect: false,
    }),
    false,
  );
});

test("buildCoverageRows should mark kanjis with and without descriptors", () => {
  const rows = buildCoverageRows({
    samples: [
      {
        recognitionId: "a",
        expectedKanji: "田",
        isCorrect: true,
      },
      {
        recognitionId: "b",
        expectedKanji: "語",
        isCorrect: true,
      },
      {
        recognitionId: "c",
        expectedKanji: "語",
        isCorrect: false,
      },
    ],
    descriptors: {
      田: {
        enabled: true,
        source: "manual_migration",
        confidence: "medium",
      },
    },
    minTotalSamplesForPriority: 2,
    minCorrectSamplesForPriority: 1,
  });

  const fieldRow = rows.find((row) => row.kanji === "田");

  const missingRow = rows.find((row) => row.kanji === "語");

  assert.equal(fieldRow.hasDescriptor, true);

  assert.equal(missingRow.hasDescriptor, false);

  assert.equal(missingRow.isPriorityMissingDescriptor, true);
});

test("buildCoverageReport should summarize coverage", () => {
  const report = buildCoverageReport({
    samples: [
      {
        recognitionId: "a",
        expectedKanji: "田",
        isCorrect: true,
      },
      {
        recognitionId: "b",
        expectedKanji: "語",
        isCorrect: true,
      },
    ],
    descriptors: {
      田: {
        enabled: true,
      },
    },
    minTotalSamplesForPriority: 1,
    minCorrectSamplesForPriority: 1,
  });

  assert.equal(report.kanjiCount, 2);

  assert.equal(report.descriptorCoveredKanjiCount, 1);

  assert.equal(report.missingDescriptorKanjiCount, 1);

  assert.deepEqual(report.priorityMissingDescriptorKanjis, ["語"]);
});

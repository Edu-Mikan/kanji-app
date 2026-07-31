const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  getPipelineSummaryPath,
  buildBatchRowFromSummary,
  buildBatchSummary,
  buildFalsePositiveBreakdown,
  getCalibrationReportPath,
  resolveAllTargetKanjis,
  getExpectedKanjiFromSample,
} = require("../../scripts/run_descriptor_candidate_pipeline_batch");

test("parseArgs should parse batch arguments", () => {
  const options = parseArgs([
    "--kanji-list",
    "田,山,四",
    "--file",
    "./training_data.jsonl",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
  ]);

  assert.deepEqual(options.kanjiList, ["田", "山", "四"]);

  assert.equal(options.minGap, 0.05);

  assert.equal(options.comparisonGroup, "falsePositiveVsTruePositive");

  assert.equal(options.continueOnError, false);
});

test("parseArgs should support continue on error", () => {
  const options = parseArgs([
    "--kanji-list",
    "田,山",
    "--file",
    "./training_data.jsonl",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
    "--continue-on-error",
  ]);

  assert.equal(options.continueOnError, true);
});

test("validateOptions should reject missing kanji list and all flag", () => {
  assert.throws(
    () =>
      validateOptions({
        kanjiList: [],
        all: false,
        filePath: "./training_data.jsonl",
        descriptorPath: "./data/kanji_descriptors.json",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        minGap: 0.05,
      }),
    /Missing --kanji-list/,
  );
});

test("getPipelineSummaryPath should create expected summary path", () => {
  const summaryPath = getPipelineSummaryPath({
    kanji: "田",
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(summaryPath.endsWith("田_pipeline_summary.json"));
});

test("buildBatchRowFromSummary should flatten pipeline summary", () => {
  const row = buildBatchRowFromSummary({
    kanji: "田",
    classifications: {
      truePositive: 12,
      falseNegative: 0,
      trueNegative: 4,
      falsePositive: 0,
    },
    recommendationCount: 1,
    candidatePatch: {
      ruleCount: 1,
    },
    patchEvaluation: {
      falsePositiveReduction: 2,
      falseNegativeIncrease: 0,
      truePositiveLoss: 0,
      safe: true,
      affectedSampleCount: 2,
    },
    readyForManualPromotion: true,
  });

  assert.equal(row.kanji, "田");

  assert.equal(row.truePositive, 12);

  assert.equal(row.falsePositiveReduction, 2);

  assert.equal(row.readyForManualPromotion, true);
});

test("buildBatchSummary should classify rows by readiness and errors", () => {
  /*
   * This test avoids filesystem dependency for existing summary files
   * by giving an empty kanji list and explicit errors.
   * Full file-reading behavior is exercised by runtime usage.
   */
  const summary = buildBatchSummary({
    kanjiList: [],
    outputDirectory: "candidate_reports_training",
    errors: [
      {
        kanji: "missing",
        message: "failure",
      },
    ],
  });

  assert.equal(summary.kanjiCount, 0);

  assert.equal(summary.errorCount, 1);

  assert.deepEqual(summary.errors, [
    {
      kanji: "missing",
      message: "failure",
    },
  ]);
});
test("buildFalsePositiveBreakdown should separate accepted and unexpected false positives", () => {
  const breakdown = buildFalsePositiveBreakdown({
    falsePositiveRecognitionIds: ["accepted-1", "unexpected-1", "accepted-2"],
    acceptedFalsePositiveIds: new Set(["accepted-1", "accepted-2"]),
  });

  assert.deepEqual(breakdown.acceptedFalsePositiveRecognitionIds, [
    "accepted-1",
    "accepted-2",
  ]);

  assert.deepEqual(breakdown.unexpectedFalsePositiveRecognitionIds, [
    "unexpected-1",
  ]);

  assert.equal(breakdown.acceptedFalsePositiveCount, 2);

  assert.equal(breakdown.unexpectedFalsePositiveCount, 1);
});

test("parseArgs should support accepted false positives path", () => {
  const options = parseArgs([
    "--kanji-list",
    "日,本",
    "--file",
    "./training_data.jsonl",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
    "--accepted-false-positives",
    "./custom_accepted_false_positives.json",
  ]);

  assert.ok(
    options.acceptedFalsePositivesPath.endsWith(
      "custom_accepted_false_positives.json",
    ),
  );
});
test("parseArgs should support all mode", () => {
  const options = parseArgs([
    "--all",
    "--file",
    "./training_data.jsonl",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
  ]);

  assert.equal(options.all, true);

  assert.deepEqual(options.kanjiList, []);
});
test("validateOptions should reject using all and kanji list together", () => {
  assert.throws(
    () =>
      validateOptions({
        kanjiList: ["田"],
        all: true,
        filePath: "./training_data.jsonl",
        descriptorPath: "./data/kanji_descriptors.json",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        minGap: 0.05,
      }),
    /either --kanji-list or --all/,
  );
});

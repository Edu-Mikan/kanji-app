const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  getSummaryPath,
  getBatchSummaryPath,
  buildRowFromSummary,
  buildBatchSummary,
} = require("../../scripts/run_reference_descriptor_candidate_pipeline_batch");

test("parseArgs should parse batch arguments", () => {
  const options = parseArgs([
    "--kanji-list",
    "一,二,三",
    "--dataset",
    "./kanji_full.json",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--file",
    "./training_data.jsonl",
    "--out-dir",
    "./candidate_reports_training",
    "--continue-on-error",
  ]);

  assert.deepEqual(options.kanjiList, ["一", "二", "三"]);

  assert.equal(options.continueOnError, true);

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));
});

test("validateOptions should reject missing kanji list", () => {
  assert.throws(
    () =>
      validateOptions({
        kanjiList: [],
        datasetPath: "./kanji_full.json",
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
      }),
    /Missing --kanji-list/,
  );
});

test("getSummaryPath should create kanji summary path", () => {
  const summaryPath = getSummaryPath({
    kanji: "一",
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(
    summaryPath.endsWith("一_reference_candidate_evaluation_summary.json"),
  );
});

test("getBatchSummaryPath should create batch summary path", () => {
  const summaryPath = getBatchSummaryPath("candidate_reports_training");

  assert.ok(
    summaryPath.endsWith(
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
  );
});

test("buildRowFromSummary should flatten summary classifications", () => {
  const row = buildRowFromSummary({
    kanji: "一",
    clean: false,
    safeAgainstFalseNegatives: true,
    recommendation: "candidate_too_permissive_review_constraints",
    classifications: {
      truePositive: 12,
      falseNegative: 0,
      trueNegative: 10,
      falsePositive: 2,
    },
  });

  assert.deepEqual(row, {
    kanji: "一",
    status: "ok",
    truePositive: 12,
    falseNegative: 0,
    trueNegative: 10,
    falsePositive: 2,
    clean: false,
    safeAgainstFalseNegatives: true,
    recommendation: "candidate_too_permissive_review_constraints",
  });
});

test("buildBatchSummary should classify clean, permissive and unsafe candidates", () => {
  const summary = buildBatchSummary({
    kanjiList: ["一", "二", "六"],
    rows: [
      {
        kanji: "一",
        status: "ok",
        truePositive: 12,
        falseNegative: 0,
        trueNegative: 10,
        falsePositive: 2,
        clean: false,
        safeAgainstFalseNegatives: true,
        recommendation: "candidate_too_permissive_review_constraints",
      },
      {
        kanji: "二",
        status: "ok",
        truePositive: 21,
        falseNegative: 0,
        trueNegative: 6,
        falsePositive: 0,
        clean: true,
        safeAgainstFalseNegatives: true,
        recommendation: "candidate_clean_on_dataset",
      },
      {
        kanji: "六",
        status: "ok",
        truePositive: 12,
        falseNegative: 2,
        trueNegative: 1,
        falsePositive: 3,
        clean: false,
        safeAgainstFalseNegatives: false,
        recommendation: "reject_or_relax_candidate_due_to_false_negatives",
      },
    ],
    errors: [],
  });

  assert.equal(summary.kanjiCount, 3);

  assert.equal(summary.cleanCandidateCount, 1);

  assert.equal(summary.safeCandidateCount, 2);

  assert.equal(summary.unsafeCandidateCount, 1);

  assert.equal(summary.permissiveCandidateCount, 1);

  assert.deepEqual(summary.cleanKanjis, ["二"]);

  assert.deepEqual(summary.permissiveKanjis, ["一"]);

  assert.deepEqual(summary.unsafeKanjis, ["六"]);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  buildBatchArgs,
  buildQualityGateArgs,
} = require("../../scripts/run_descriptor_batch_quality_check");

test("parseArgs should parse quality check arguments", () => {
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
    "--continue-on-error",
  ]);

  assert.equal(options.kanjiList, "田,山,四");

  assert.equal(options.continueOnError, true);

  assert.equal(options.minGap, 0.05);

  assert.equal(options.comparisonGroup, "falsePositiveVsTruePositive");

  assert.ok(
    options.acceptedFalsePositivesPath.endsWith(
      "accepted_false_positives.json",
    ),
  );
});

test("parseArgs should support custom accepted false positives path", () => {
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

test("validateOptions should reject missing kanji list", () => {
  assert.throws(
    () =>
      validateOptions({
        filePath: "./training_data.jsonl",
        descriptorPath: "./data/kanji_descriptors.json",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        minGap: 0.05,
      }),
    /Missing --kanji-list/,
  );
});

test("validateOptions should reject invalid min gap", () => {
  assert.throws(
    () =>
      validateOptions({
        kanjiList: "田,山",
        filePath: "./training_data.jsonl",
        descriptorPath: "./data/kanji_descriptors.json",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        minGap: Number.NaN,
      }),
    /--min-gap/,
  );
});

test("buildBatchArgs should include batch script arguments", () => {
  const args = buildBatchArgs({
    kanjiList: "田,山",
    filePath: "training_data.jsonl",
    descriptorPath: "data/kanji_descriptors.json",
    datasetPath: "kanji_full.json",
    outputDirectory: "candidate_reports_training",
    acceptedFalsePositivesPath: "data/accepted_false_positives.json",
    minGap: 0.05,
    comparisonGroup: "falsePositiveVsTruePositive",
    continueOnError: true,
  });

  assert.ok(args.includes("--kanji-list"));

  assert.ok(args.includes("田,山"));

  assert.ok(args.includes("--accepted-false-positives"));

  assert.ok(args.includes("--continue-on-error"));
});

test("buildBatchArgs should omit continue-on-error when disabled", () => {
  const args = buildBatchArgs({
    kanjiList: "田,山",
    filePath: "training_data.jsonl",
    descriptorPath: "data/kanji_descriptors.json",
    datasetPath: "kanji_full.json",
    outputDirectory: "candidate_reports_training",
    acceptedFalsePositivesPath: "data/accepted_false_positives.json",
    minGap: 0.05,
    comparisonGroup: "falsePositiveVsTruePositive",
    continueOnError: false,
  });

  assert.equal(args.includes("--continue-on-error"), false);
});

test("buildQualityGateArgs should point to pipeline batch summary", () => {
  const args = buildQualityGateArgs({
    outputDirectory: "candidate_reports_training",
  });

  assert.equal(args[0], "--summary");

  assert.ok(args[1].endsWith("pipeline_batch_summary.json"));

  assert.ok(args[1].includes("candidate_reports_training"));
});

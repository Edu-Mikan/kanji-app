const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  buildBatchArgs,
  buildQualityGateArgs,
} = require("../../scripts/run_reference_descriptor_candidate_quality_check");

test("parseArgs should parse all-covered quality check arguments", () => {
  const options = parseArgs([
    "--all-covered",
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

  assert.equal(options.allCovered, true);

  assert.deepEqual(options.kanjiList, []);

  assert.equal(options.continueOnError, true);

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));

  assert.ok(options.filePath.endsWith("training_data.jsonl"));

  assert.ok(options.outputDirectory.endsWith("candidate_reports_training"));
});

test("parseArgs should parse explicit kanji list", () => {
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
  ]);

  assert.equal(options.allCovered, false);

  assert.deepEqual(options.kanjiList, ["一", "二", "三"]);
});

test("validateOptions should reject missing kanji selection mode", () => {
  assert.throws(
    () =>
      validateOptions({
        kanjiList: [],
        allCovered: false,
        datasetPath: "./kanji_full.json",
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
      }),
    /Missing --kanji-list/,
  );
});

test("validateOptions should reject all-covered and kanji list together", () => {
  assert.throws(
    () =>
      validateOptions({
        kanjiList: ["一"],
        allCovered: true,
        datasetPath: "./kanji_full.json",
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
      }),
    /either --kanji-list or --all-covered/,
  );
});

test("buildBatchArgs should pass all-covered to batch runner", () => {
  const args = buildBatchArgs({
    allCovered: true,
    kanjiList: [],
    datasetPath: "kanji_full.json",
    descriptorPath: "data/kanji_descriptors.json",
    filePath: "training_data.jsonl",
    outputDirectory: "candidate_reports_training",
    continueOnError: true,
  });

  assert.ok(args.includes("--all-covered"));

  assert.equal(args.includes("--kanji-list"), false);

  assert.ok(args.includes("--continue-on-error"));
});

test("buildBatchArgs should pass explicit kanji list to batch runner", () => {
  const args = buildBatchArgs({
    allCovered: false,
    kanjiList: ["一", "二", "三"],
    datasetPath: "kanji_full.json",
    descriptorPath: "data/kanji_descriptors.json",
    filePath: "training_data.jsonl",
    outputDirectory: "candidate_reports_training",
    continueOnError: false,
  });

  assert.ok(args.includes("--kanji-list"));

  assert.ok(args.includes("一,二,三"));

  assert.equal(args.includes("--all-covered"), false);
});

test("buildQualityGateArgs should point to reference candidate batch summary", () => {
  const args = buildQualityGateArgs({
    outputDirectory: "candidate_reports_training",
  });

  assert.equal(args[0], "--summary");

  assert.ok(args[1].includes("candidate_reports_training"));

  assert.ok(
    args[1].endsWith(
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
  );
});
test("parseArgs should use the incremental reference catalog by default", () => {
  const options = parseArgs([]);

  assert.equal(options.datasetPath, DEFAULT_KANJI_DATASET_PATH);

  assert.equal(
    options.datasetPath.endsWith("kanji_reference_catalog.json"),
    true,
  );
});
test("buildBatchArgs should propagate the incremental reference catalog", () => {
  const args = buildBatchArgs({
    allCovered: true,
    kanjiList: [],
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
    descriptorPath: "data/kanji_descriptors.json",
    filePath: "training_data.jsonl",
    outputDirectory: "candidate_reports_training",
    continueOnError: false,
  });

  const datasetIndex = args.indexOf("--dataset");

  assert.notEqual(datasetIndex, -1);

  assert.equal(args[datasetIndex + 1], DEFAULT_KANJI_DATASET_PATH);
});

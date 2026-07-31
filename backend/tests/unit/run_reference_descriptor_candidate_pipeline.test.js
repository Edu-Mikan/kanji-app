const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  buildOutputPaths,
} = require("../../scripts/run_reference_descriptor_candidate_pipeline");

test("parseArgs should parse reference descriptor candidate pipeline arguments", () => {
  const options = parseArgs([
    "--kanji",
    "一",
    "--dataset",
    "./kanji_full.json",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--file",
    "./training_data.jsonl",
    "--out-dir",
    "./candidate_reports_training",
  ]);

  assert.equal(options.kanji, "一");

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));

  assert.ok(options.filePath.endsWith("training_data.jsonl"));

  assert.ok(options.outputDirectory.endsWith("candidate_reports_training"));
});

test("validateOptions should reject missing kanji", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./kanji_full.json",
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
      }),
    /Missing --kanji/,
  );
});

test("buildOutputPaths should create expected output paths", () => {
  const paths = buildOutputPaths({
    kanji: "一",
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(
    paths.candidateDescriptorPath.endsWith(
      "一_descriptor_candidate_from_reference.json",
    ),
  );

  assert.ok(
    paths.evaluationSummaryPath.endsWith(
      "一_reference_candidate_evaluation_summary.json",
    ),
  );
});

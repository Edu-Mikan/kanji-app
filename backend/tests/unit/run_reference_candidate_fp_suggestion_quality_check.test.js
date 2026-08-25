const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  buildReferenceCandidateQualityArgs,
  buildFpSuggestionBatchArgs,
  buildFpSuggestionGateArgs,
} = require("../../scripts/run_reference_candidate_fp_suggestion_quality_check");

test("parseArgs should parse FP suggestion quality check arguments", () => {
  const options = parseArgs([
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

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));

  assert.ok(options.filePath.endsWith("training_data.jsonl"));

  assert.ok(options.outputDirectory.endsWith("candidate_reports_training"));

  assert.equal(options.continueOnError, true);
});

test("parseArgs should use the incremental reference catalog by default", () => {
  const options = parseArgs([]);

  assert.equal(options.datasetPath, DEFAULT_KANJI_DATASET_PATH);

  assert.equal(
    options.datasetPath.endsWith("kanji_reference_catalog.json"),
    true,
  );
});

test("validateOptions should reject missing descriptor file", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./kanji_full.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
        help: false,
      }),
    /Missing --descriptor-file/,
  );
});

test("buildReferenceCandidateQualityArgs should build all-covered command arguments", () => {
  const args = buildReferenceCandidateQualityArgs({
    datasetPath: "kanji_full.json",
    descriptorPath: "data/kanji_descriptors.json",
    filePath: "training_data.jsonl",
    outputDirectory: "candidate_reports_training",
    continueOnError: true,
  });

  assert.ok(args.includes("--all-covered"));

  assert.ok(args.includes("--continue-on-error"));

  assert.ok(args.includes("kanji_full.json"));
});

test("buildFpSuggestionBatchArgs should build batch suggestion arguments", () => {
  const args = buildFpSuggestionBatchArgs({
    datasetPath: "kanji_full.json",
    descriptorPath: "data/kanji_descriptors.json",
    filePath: "training_data.jsonl",
    outputDirectory: "candidate_reports_training",
    continueOnError: true,
  });

  assert.ok(args.includes("--batch-summary"));

  assert.ok(
    args.some((arg) =>
      arg.endsWith(
        "reference_descriptor_candidate_pipeline_batch_summary.json",
      ),
    ),
  );

  assert.ok(args.includes("--continue-on-error"));
});

test("buildFpSuggestionGateArgs should point to FP suggestion batch summary", () => {
  const args = buildFpSuggestionGateArgs({
    outputDirectory: "candidate_reports_training",
  });

  assert.equal(args[0], "--summary");

  assert.ok(
    args[1].endsWith(
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
  );
});

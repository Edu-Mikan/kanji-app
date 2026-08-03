const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  buildReferenceCandidateQualityArgs,
  buildMlDatasetExportArgs,
  buildMlDatasetQualityGateArgs,
} = require("../../scripts/run_reference_candidate_ml_dataset_quality_check");

test("parseArgs should parse ML dataset quality check arguments", () => {
  const options = parseArgs([
    "--dataset",
    "./kanji_full.json",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--file",
    "./training_data.jsonl",
    "--out-dir",
    "./candidate_reports_training",
    "--out-jsonl",
    "./ml_datasets/reference_candidate_binary_dataset.jsonl",
    "--out-summary",
    "./ml_datasets/reference_candidate_binary_dataset_summary.json",
    "--continue-on-error",
  ]);

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(options.descriptorPath.endsWith("kanji_descriptors.json"));

  assert.ok(options.filePath.endsWith("training_data.jsonl"));

  assert.ok(options.outputDirectory.endsWith("candidate_reports_training"));

  assert.ok(
    options.mlDatasetPath.endsWith("reference_candidate_binary_dataset.jsonl"),
  );

  assert.ok(
    options.mlSummaryPath.endsWith(
      "reference_candidate_binary_dataset_summary.json",
    ),
  );

  assert.equal(options.continueOnError, true);
});

test("validateOptions should reject missing dataset", () => {
  assert.throws(
    () =>
      validateOptions({
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
        mlDatasetPath: "./ml_datasets/dataset.jsonl",
        mlSummaryPath: "./ml_datasets/summary.json",
        help: false,
      }),
    /Missing --dataset/,
  );
});

test("validateOptions should reject missing output jsonl", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./kanji_full.json",
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        outputDirectory: "./candidate_reports_training",
        mlSummaryPath: "./ml_datasets/summary.json",
        help: false,
      }),
    /Missing --out-jsonl/,
  );
});

test("buildReferenceCandidateQualityArgs should build all-covered candidate quality args", () => {
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

test("buildMlDatasetExportArgs should point to candidate batch summary and ML outputs", () => {
  const args = buildMlDatasetExportArgs({
    outputDirectory: "candidate_reports_training",
    filePath: "training_data.jsonl",
    mlDatasetPath: "ml_datasets/reference_candidate_binary_dataset.jsonl",
    mlSummaryPath:
      "ml_datasets/reference_candidate_binary_dataset_summary.json",
  });

  assert.ok(args.includes("--batch-summary"));

  assert.ok(
    args.some((arg) =>
      arg.endsWith(
        "reference_descriptor_candidate_pipeline_batch_summary.json",
      ),
    ),
  );

  assert.ok(args.includes("--safe-only"));

  assert.ok(
    args.includes("ml_datasets/reference_candidate_binary_dataset.jsonl"),
  );
});

test("buildMlDatasetQualityGateArgs should point to ML dataset and summary", () => {
  const args = buildMlDatasetQualityGateArgs({
    mlDatasetPath: "ml_datasets/reference_candidate_binary_dataset.jsonl",
    mlSummaryPath:
      "ml_datasets/reference_candidate_binary_dataset_summary.json",
  });

  assert.deepEqual(args, [
    "--dataset",
    "ml_datasets/reference_candidate_binary_dataset.jsonl",
    "--summary",
    "ml_datasets/reference_candidate_binary_dataset_summary.json",
  ]);
});

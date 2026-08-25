const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  buildFpSuggestionQualityArgs,
  buildPatchProposalArgs,
  buildPatchProposalGateArgs,
} = require("../../scripts/run_reference_candidate_fp_patch_proposal_quality_check");

test("parseArgs should parse FP patch proposal quality check arguments", () => {
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

test("validateOptions should accept the default reference catalog", () => {
  assert.doesNotThrow(() => {
    validateOptions({
      datasetPath: DEFAULT_KANJI_DATASET_PATH,
      descriptorPath: "./data/kanji_descriptors.json",
      filePath: "./training_data.jsonl",
      outputDirectory: "./candidate_reports_training",
      continueOnError: false,
      help: false,
    });
  });
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

test("buildFpSuggestionQualityArgs should build FP suggestion runner arguments", () => {
  const args = buildFpSuggestionQualityArgs({
    datasetPath: "kanji_full.json",
    descriptorPath: "data/kanji_descriptors.json",
    filePath: "training_data.jsonl",
    outputDirectory: "candidate_reports_training",
    continueOnError: true,
  });

  assert.ok(args.includes("--dataset"));

  assert.ok(args.includes("kanji_full.json"));

  assert.ok(args.includes("--continue-on-error"));
});

test("buildPatchProposalArgs should point to suggestion batch summary and proposals output", () => {
  const args = buildPatchProposalArgs({
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(args.includes("--summary"));

  assert.ok(
    args.some((arg) =>
      arg.endsWith(
        "reference_candidate_fp_constraint_suggestion_batch_summary.json",
      ),
    ),
  );

  assert.ok(args.includes("--out-json"));

  assert.ok(
    args.some((arg) =>
      arg.endsWith("reference_candidate_fp_constraint_patch_proposals.json"),
    ),
  );
});

test("buildPatchProposalGateArgs should point to patch proposals output", () => {
  const args = buildPatchProposalGateArgs({
    outputDirectory: "candidate_reports_training",
  });

  assert.equal(args[0], "--proposals");

  assert.ok(
    args[1].endsWith("reference_candidate_fp_constraint_patch_proposals.json"),
  );
});

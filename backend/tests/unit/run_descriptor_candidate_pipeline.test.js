const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  buildOutputPaths,
} = require("../../scripts/run_descriptor_candidate_pipeline");

test("parseArgs should parse required pipeline arguments", () => {
  const options = parseArgs([
    "--kanji",
    "田",
    "--file",
    "./samples.jsonl",
    "--descriptor-file",
    "./descriptors.json",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports",
  ]);

  assert.equal(options.kanji, "田");

  assert.equal(options.minGap, 0.05);

  assert.equal(options.comparisonGroup, "falsePositiveVsTruePositive");

  assert.ok(options.filePath.endsWith("samples.jsonl"));

  assert.ok(options.descriptorPath.endsWith("descriptors.json"));

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));
});

test("parseArgs should support custom min gap and comparison group", () => {
  const options = parseArgs([
    "--kanji",
    "四",
    "--file",
    "./samples.jsonl",
    "--descriptor-file",
    "./descriptors.json",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports",
    "--min-gap",
    "0.1",
    "--comparison-group",
    "trueNegativeVsTruePositive",
  ]);

  assert.equal(options.kanji, "四");

  assert.equal(options.minGap, 0.1);

  assert.equal(options.comparisonGroup, "trueNegativeVsTruePositive");
});

test("validateOptions should reject missing kanji", () => {
  assert.throws(
    () =>
      validateOptions({
        filePath: "./samples.jsonl",
        descriptorPath: "./descriptors.json",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports",
        minGap: 0.05,
      }),
    /Missing --kanji/,
  );
});

test("validateOptions should reject invalid min gap", () => {
  assert.throws(
    () =>
      validateOptions({
        kanji: "田",
        filePath: "./samples.jsonl",
        descriptorPath: "./descriptors.json",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports",
        minGap: Number.NaN,
      }),
    /--min-gap/,
  );
});

test("buildOutputPaths should create kanji-prefixed report paths", () => {
  const paths = buildOutputPaths({
    kanji: "田",
    outputDirectory: "candidate_reports",
  });

  assert.ok(paths.calibrationReport.endsWith("田_calibration_report.json"));

  assert.ok(
    paths.separationReport.endsWith("田_reference_separation_report.json"),
  );

  assert.ok(
    paths.recommendations.endsWith("田_threshold_recommendations.json"),
  );

  assert.ok(
    paths.thresholdEvaluation.endsWith("田_threshold_evaluation_report.json"),
  );

  assert.ok(
    paths.candidatePatch.endsWith("田_descriptor_candidate_patch.json"),
  );

  assert.ok(
    paths.patchEvaluation.endsWith(
      "田_descriptor_candidate_patch_evaluation_report.json",
    ),
  );

  assert.ok(
    paths.candidateDescriptors.endsWith("田_kanji_descriptors_candidate.json"),
  );

  assert.ok(paths.summary.endsWith("田_pipeline_summary.json"));
});

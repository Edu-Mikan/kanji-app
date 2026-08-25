const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  buildEvaluationCatalog,
  buildOutputPaths,
  buildEvaluationSummary,
  DEFAULT_KANJI_DATASET_PATH,
} = require("../../scripts/evaluate_reference_descriptor_candidate");

test("parseArgs should parse evaluation arguments", () => {
  const options = parseArgs([
    "--kanji",
    "一",
    "--candidate-descriptor",
    "./candidate.json",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--file",
    "./training_data.jsonl",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
  ]);

  assert.equal(options.kanji, "一");

  assert.ok(options.candidateDescriptorPath.endsWith("candidate.json"));

  assert.ok(options.outputDirectory.endsWith("candidate_reports_training"));
});

test("validateOptions should reject missing candidate descriptor", () => {
  assert.throws(
    () =>
      validateOptions({
        kanji: "一",
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
      }),
    /Missing --candidate-descriptor/,
  );
});

test("buildEvaluationCatalog should replace descriptor in wrapped catalog", () => {
  const catalog = buildEvaluationCatalog({
    kanji: "一",
    descriptorFile: {
      descriptors: {
        一: {
          kanji: "一",
          source: "old",
        },
      },
    },
    candidateDescriptor: {
      kanji: "一",
      source: "candidate",
      enabled: false,
    },
  });

  assert.equal(catalog.descriptors["一"].source, "candidate");

  assert.equal(catalog.descriptors["一"].enabled, true);

  assert.equal(catalog.descriptors["一"].status, "candidate_evaluation");
});

test("buildOutputPaths should create kanji-prefixed paths", () => {
  const paths = buildOutputPaths({
    kanji: "一",
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(
    paths.evaluationDescriptorPath.endsWith(
      "一_reference_candidate_descriptor_catalog.json",
    ),
  );

  assert.ok(
    paths.calibrationReportPath.endsWith(
      "一_reference_candidate_calibration_report.json",
    ),
  );

  assert.ok(
    paths.summaryPath.endsWith(
      "一_reference_candidate_evaluation_summary.json",
    ),
  );
});

test("buildEvaluationSummary should recommend clean candidate when no FN or FP", () => {
  const summary = buildEvaluationSummary({
    kanji: "一",
    candidateDescriptorPath: "./candidate.json",
    evaluationDescriptorPath: "./catalog.json",
    calibrationReportPath: "./report.json",
    calibrationReport: {
      classifications: {
        truePositive: 3,
        falseNegative: 0,
        trueNegative: 2,
        falsePositive: 0,
      },
    },
  });

  assert.equal(summary.clean, true);

  assert.equal(summary.recommendation, "candidate_clean_on_dataset");
});

test("buildEvaluationSummary should reject candidates with false negatives", () => {
  const summary = buildEvaluationSummary({
    kanji: "一",
    candidateDescriptorPath: "./candidate.json",
    evaluationDescriptorPath: "./catalog.json",
    calibrationReportPath: "./report.json",
    calibrationReport: {
      classifications: {
        truePositive: 2,
        falseNegative: 1,
        trueNegative: 2,
        falsePositive: 0,
      },
    },
  });

  assert.equal(summary.safeAgainstFalseNegatives, false);

  assert.equal(
    summary.recommendation,
    "reject_or_relax_candidate_due_to_false_negatives",
  );
});
test("parseArgs uses the incremental reference catalog by default", () => {
  const options = parseArgs([]);

  assert.equal(options.datasetPath, DEFAULT_KANJI_DATASET_PATH);

  assert.equal(
    options.datasetPath.endsWith("kanji_reference_catalog.json"),
    true,
  );
});

test("parseArgs preserves an explicit legacy dataset", () => {
  const options = parseArgs(["--dataset", "./kanji_full.json"]);

  assert.equal(options.datasetPath.endsWith("kanji_full.json"), true);
});

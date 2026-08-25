const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseArgs,
  validateOptions,
  buildDefaultOutputCandidatePath,
  normalizeSuggestionAsReferenceConstraint,
  buildConstrainedCandidate,
  getEvaluationSummaryPath,
  DEFAULT_KANJI_DATASET_PATH,
} = require("../../scripts/evaluate_reference_candidate_fp_constraint_suggestion");

test("parseArgs should parse FP constraint suggestion evaluation arguments", () => {
  const options = parseArgs([
    "--kanji",
    "本",
    "--candidate-descriptor",
    "./candidate.json",
    "--suggestions",
    "./suggestions.json",
    "--suggestion-index",
    "2",
    "--descriptor-file",
    "./data/kanji_descriptors.json",
    "--file",
    "./training_data.jsonl",
    "--dataset",
    "./kanji_full.json",
    "--out-dir",
    "./candidate_reports_training",
  ]);

  assert.equal(options.kanji, "本");

  assert.equal(options.suggestionIndex, 2);

  assert.ok(options.candidateDescriptorPath.endsWith("candidate.json"));

  assert.ok(options.suggestionsPath.endsWith("suggestions.json"));
});

test("validateOptions should reject missing suggestions path", () => {
  assert.throws(
    () =>
      validateOptions({
        kanji: "本",
        candidateDescriptorPath: "./candidate.json",
        suggestionIndex: 0,
        descriptorPath: "./data/kanji_descriptors.json",
        filePath: "./training_data.jsonl",
        datasetPath: "./kanji_full.json",
        outputDirectory: "./candidate_reports_training",
        help: false,
      }),
    /Missing --suggestions/,
  );
});

test("buildDefaultOutputCandidatePath should include kanji and suggestion index", () => {
  const outputPath = buildDefaultOutputCandidatePath({
    kanji: "本",
    suggestionIndex: 3,
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(
    outputPath.endsWith(
      "本_descriptor_candidate_from_reference_fp_suggestion_3.json",
    ),
  );
});

test("normalizeSuggestionAsReferenceConstraint should keep reference metric fields", () => {
  const constraint = normalizeSuggestionAsReferenceConstraint({
    type: "referenceMetricMax",
    metricPath: "perRole.role.centerDistance",
    max: 0.2,
    severity: "hard",
    source: "auto_fp_reduction_suggestion",
    evidence: {
      falsePositiveReduction: 2,
      truePositiveLoss: 0,
      safe: true,
    },
  });

  assert.deepEqual(constraint, {
    type: "referenceMetricMax",
    metricPath: "perRole.role.centerDistance",
    max: 0.2,
    severity: "hard",
    status: "candidate",
    source: "auto_fp_reduction_suggestion",
    evidence: {
      falsePositiveReduction: 2,
      truePositiveLoss: 0,
      safe: true,
    },
  });
});

test("buildConstrainedCandidate should append reference constraint", () => {
  const constrainedCandidate = buildConstrainedCandidate({
    candidateDescriptor: {
      kanji: "本",
      referenceConstraints: [
        {
          type: "referenceMetricMax",
          metricPath: "existing.metric",
          max: 1,
        },
      ],
    },
    suggestion: {
      type: "referenceMetricMax",
      metricPath: "perRole.role.centerDistance",
      max: 0.2,
      evidence: {
        falsePositiveReduction: 2,
        truePositiveLoss: 0,
        safe: true,
      },
    },
  });

  assert.equal(constrainedCandidate.referenceConstraints.length, 2);

  assert.equal(
    constrainedCandidate.referenceConstraints[1].metricPath,
    "perRole.role.centerDistance",
  );

  assert.equal(
    constrainedCandidate.debug.fpConstraintSuggestionEvaluation.metricPath,
    "perRole.role.centerDistance",
  );
});

test("getEvaluationSummaryPath should return standard reference candidate summary path", () => {
  const summaryPath = getEvaluationSummaryPath({
    kanji: "本",
    outputDirectory: "candidate_reports_training",
  });

  assert.ok(
    summaryPath.endsWith("本_reference_candidate_evaluation_summary.json"),
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

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
    kanji: null,
    candidateDescriptorPath: null,
    suggestionsPath: null,
    suggestionIndex: 0,
    descriptorPath: null,
    filePath: null,
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
    outputDirectory: null,
    outputCandidatePath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--kanji") {
      options.kanji = argv[index + 1];
      index++;
      continue;
    }

    if (argument === "--candidate-descriptor") {
      options.candidateDescriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--suggestions") {
      options.suggestionsPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--suggestion-index") {
      options.suggestionIndex = Number(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--descriptor-file") {
      options.descriptorPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--file") {
      options.filePath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-dir") {
      options.outputDirectory = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-candidate") {
      options.outputCandidatePath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Evaluate one FP-safe constraint suggestion for a generated reference candidate

Usage:
  node scripts/evaluate_reference_candidate_fp_constraint_suggestion.js \\
    --kanji 本 \\
    --candidate-descriptor ./candidate_reports_training/本_descriptor_candidate_from_reference.json \\
    --suggestions ./candidate_reports_training/本_reference_candidate_fp_constraint_suggestions.json \\
    --suggestion-index 0 \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --dataset ./data/kanji_reference_catalog.json \\
    --dataset <path> \\
        Path to the canonical kanji reference catalog. \\
        Default: ./data/kanji_reference_catalog.json \\
    --out-dir ./candidate_reports_training

Optional:
  --out-candidate <path>
      Path where the temporary constrained candidate will be written.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.kanji) {
    throw new Error("Missing --kanji <kanji>");
  }

  if (!options.candidateDescriptorPath) {
    throw new Error("Missing --candidate-descriptor <path>");
  }

  if (!options.suggestionsPath) {
    throw new Error("Missing --suggestions <path>");
  }

  if (
    !Number.isInteger(options.suggestionIndex) ||
    options.suggestionIndex < 0
  ) {
    throw new Error("--suggestion-index must be a non-negative integer");
  }

  if (!options.descriptorPath) {
    throw new Error("Missing --descriptor-file <path>");
  }

  if (!options.filePath) {
    throw new Error("Missing --file <path>");
  }

  if (!options.outputDirectory) {
    throw new Error("Missing --out-dir <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildDefaultOutputCandidatePath({
  kanji,
  suggestionIndex,
  outputDirectory,
}) {
  return path.join(
    outputDirectory,
    `${kanji}_descriptor_candidate_from_reference_fp_suggestion_${suggestionIndex}.json`,
  );
}

function normalizeSuggestionAsReferenceConstraint(suggestion) {
  return {
    type: suggestion.type,

    metricPath: suggestion.metricPath,

    max: suggestion.max,

    severity: suggestion.severity ?? "hard",

    status: "candidate",

    source: suggestion.source ?? "auto_fp_reduction_suggestion",

    evidence: suggestion.evidence ?? null,
  };
}

function buildConstrainedCandidate({ candidateDescriptor, suggestion }) {
  const referenceConstraint =
    normalizeSuggestionAsReferenceConstraint(suggestion);

  return {
    ...candidateDescriptor,

    referenceConstraints: [
      ...(candidateDescriptor.referenceConstraints ?? []),
      referenceConstraint,
    ],

    debug: {
      ...(candidateDescriptor.debug ?? {}),
      fpConstraintSuggestionEvaluation: {
        metricPath: suggestion.metricPath,
        max: suggestion.max,
        falsePositiveReduction:
          suggestion.evidence?.falsePositiveReduction ?? null,
        truePositiveLoss: suggestion.evidence?.truePositiveLoss ?? null,
        safe: suggestion.evidence?.safe ?? null,
      },
    },
  };
}

function runNodeScript(scriptPath, args) {
  const commandArgs = [scriptPath, ...args];

  console.log("");
  console.log(`> node ${commandArgs.join(" ")}`);

  const result = childProcess.spawnSync(process.execPath, commandArgs, {
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `Script failed with exit code ${result.status}: ${scriptPath}`,
    );
  }
}

function runEvaluation({
  kanji,
  constrainedCandidatePath,
  descriptorPath,
  filePath,
  datasetPath,
  outputDirectory,
}) {
  runNodeScript(
    path.join("scripts", "evaluate_reference_descriptor_candidate.js"),
    [
      "--kanji",
      kanji,
      "--candidate-descriptor",
      constrainedCandidatePath,
      "--descriptor-file",
      descriptorPath,
      "--file",
      filePath,
      "--dataset",
      datasetPath,
      "--out-dir",
      outputDirectory,
    ],
  );
}

function getEvaluationSummaryPath({ kanji, outputDirectory }) {
  return path.join(
    outputDirectory,
    `${kanji}_reference_candidate_evaluation_summary.json`,
  );
}

function printResult({ kanji, suggestion, summary, constrainedCandidatePath }) {
  const classifications = summary.classifications ?? {};

  console.log("");
  console.log("REFERENCE CANDIDATE FP CONSTRAINT SUGGESTION EVALUATION");
  console.log("=======================================================");
  console.log(`Kanji: ${kanji}`);
  console.log(`Candidate: ${constrainedCandidatePath}`);
  console.log(`Metric: ${suggestion.metricPath}`);
  console.log(`Max: ${suggestion.max}`);
  console.log(
    `Suggested FP reduction: ${suggestion.evidence?.falsePositiveReduction ?? "n/a"}`,
  );
  console.log(
    `Suggested TP loss: ${suggestion.evidence?.truePositiveLoss ?? "n/a"}`,
  );
  console.log("");
  console.log(`TP: ${classifications.truePositive ?? 0}`);
  console.log(`FN: ${classifications.falseNegative ?? 0}`);
  console.log(`TN: ${classifications.trueNegative ?? 0}`);
  console.log(`FP: ${classifications.falsePositive ?? 0}`);
  console.log(
    `Safe against false negatives: ${summary.safeAgainstFalseNegatives}`,
  );
  console.log(`Recommendation: ${summary.recommendation}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  fs.mkdirSync(options.outputDirectory, {
    recursive: true,
  });

  const candidateDescriptor = readJson(options.candidateDescriptorPath);

  const suggestionsReport = readJson(options.suggestionsPath);

  const suggestion = suggestionsReport.suggestions?.[options.suggestionIndex];

  if (!suggestion) {
    throw new Error(`Suggestion index not found: ${options.suggestionIndex}`);
  }

  const outputCandidatePath =
    options.outputCandidatePath ??
    buildDefaultOutputCandidatePath({
      kanji: options.kanji,
      suggestionIndex: options.suggestionIndex,
      outputDirectory: options.outputDirectory,
    });

  const constrainedCandidate = buildConstrainedCandidate({
    candidateDescriptor,
    suggestion,
  });

  fs.writeFileSync(
    outputCandidatePath,
    JSON.stringify(constrainedCandidate, null, 2),
    "utf8",
  );

  runEvaluation({
    kanji: options.kanji,
    constrainedCandidatePath: outputCandidatePath,
    descriptorPath: options.descriptorPath,
    filePath: options.filePath,
    datasetPath: options.datasetPath,
    outputDirectory: options.outputDirectory,
  });

  const summary = readJson(
    getEvaluationSummaryPath({
      kanji: options.kanji,
      outputDirectory: options.outputDirectory,
    }),
  );

  printResult({
    kanji: options.kanji,
    suggestion,
    summary,
    constrainedCandidatePath: outputCandidatePath,
  });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  buildDefaultOutputCandidatePath,
  normalizeSuggestionAsReferenceConstraint,
  buildConstrainedCandidate,
  getEvaluationSummaryPath,
};

const path = require("node:path");
const childProcess = require("node:child_process");

function parseArgs(argv) {
  const options = {
    datasetPath: null,
    descriptorPath: null,
    filePath: null,
    outputDirectory: null,
    continueOnError: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
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

    if (argument === "--out-dir") {
      options.outputDirectory = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--continue-on-error") {
      options.continueOnError = true;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Run reference candidate FP suggestion quality check

Usage:
  node scripts/run_reference_candidate_fp_suggestion_quality_check.js \\
    --dataset ./kanji_full.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

This script runs:
  1. scripts/run_reference_descriptor_candidate_quality_check.js
  2. scripts/run_reference_candidate_fp_constraint_suggestion_batch.js
  3. scripts/validate_reference_candidate_fp_constraint_suggestion_batch_quality_gate.js

The final gate fails when:
  - batch errors are present
  - false negatives increase
  - true positives are lost
  - any evaluated FP suggestion is unsafe
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
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

function buildReferenceCandidateQualityArgs(options) {
  const args = [
    "--all-covered",
    "--dataset",
    options.datasetPath,
    "--descriptor-file",
    options.descriptorPath,
    "--file",
    options.filePath,
    "--out-dir",
    options.outputDirectory,
  ];

  if (options.continueOnError) {
    args.push("--continue-on-error");
  }

  return args;
}

function buildFpSuggestionBatchArgs(options) {
  const args = [
    "--batch-summary",
    path.join(
      options.outputDirectory,
      "reference_descriptor_candidate_pipeline_batch_summary.json",
    ),
    "--descriptor-file",
    options.descriptorPath,
    "--file",
    options.filePath,
    "--dataset",
    options.datasetPath,
    "--out-dir",
    options.outputDirectory,
  ];

  if (options.continueOnError) {
    args.push("--continue-on-error");
  }

  return args;
}

function buildFpSuggestionGateArgs(options) {
  return [
    "--summary",
    path.join(
      options.outputDirectory,
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
  ];
}

function runQualityCheck(options) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP SUGGESTION QUALITY CHECK");
  console.log("================================================");

  runNodeScript(
    path.join("scripts", "run_reference_descriptor_candidate_quality_check.js"),
    buildReferenceCandidateQualityArgs(options),
  );

  runNodeScript(
    path.join(
      "scripts",
      "run_reference_candidate_fp_constraint_suggestion_batch.js",
    ),
    buildFpSuggestionBatchArgs(options),
  );

  runNodeScript(
    path.join(
      "scripts",
      "validate_reference_candidate_fp_constraint_suggestion_batch_quality_gate.js",
    ),
    buildFpSuggestionGateArgs(options),
  );

  console.log("");
  console.log(
    "Reference candidate FP suggestion quality check completed successfully.",
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  runQualityCheck(options);
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
  parseArgs,
  validateOptions,
  buildReferenceCandidateQualityArgs,
  buildFpSuggestionBatchArgs,
  buildFpSuggestionGateArgs,
};

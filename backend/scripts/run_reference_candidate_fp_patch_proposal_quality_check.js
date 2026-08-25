const path = require("node:path");
const childProcess = require("node:child_process");
const { REFERENCE_CATALOG_PATH } = require("../services/kanji_reference_paths");

const DEFAULT_KANJI_DATASET_PATH = REFERENCE_CATALOG_PATH;

function parseArgs(argv) {
  const options = {
    datasetPath: DEFAULT_KANJI_DATASET_PATH,
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
Run reference candidate FP patch proposal quality check

Usage:
  node scripts/run_reference_candidate_fp_patch_proposal_quality_check.js \\
    --dataset ./data/kanji_reference_catalog.json \\
    --dataset <path> \\
        Path to the canonical kanji reference catalog. \\
        Default: ./data/kanji_reference_catalog.json \\
    --descriptor-file ./data/kanji_descriptors.json \\
    --file ./training_data.jsonl \\
    --out-dir ./candidate_reports_training \\
    --continue-on-error

This script runs:
  1. scripts/run_reference_candidate_fp_suggestion_quality_check.js
  2. scripts/generate_reference_candidate_fp_constraint_patch_proposals.js
  3. scripts/validate_reference_candidate_fp_constraint_patch_proposals_quality_gate.js

The final gate validates that generated patch proposals:
  - reduce false positives
  - do not introduce false negatives
  - do not lose true positives
  - contain valid referenceMetricMax constraints
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
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

function buildFpSuggestionQualityArgs(options) {
  const args = [
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

function buildPatchProposalArgs(options) {
  return [
    "--summary",
    path.join(
      options.outputDirectory,
      "reference_candidate_fp_constraint_suggestion_batch_summary.json",
    ),
    "--out-json",
    path.join(
      options.outputDirectory,
      "reference_candidate_fp_constraint_patch_proposals.json",
    ),
  ];
}

function buildPatchProposalGateArgs(options) {
  return [
    "--proposals",
    path.join(
      options.outputDirectory,
      "reference_candidate_fp_constraint_patch_proposals.json",
    ),
  ];
}

function runQualityCheck(options) {
  console.log("");
  console.log("REFERENCE CANDIDATE FP PATCH PROPOSAL QUALITY CHECK");
  console.log("===================================================");

  runNodeScript(
    path.join(
      "scripts",
      "run_reference_candidate_fp_suggestion_quality_check.js",
    ),
    buildFpSuggestionQualityArgs(options),
  );

  runNodeScript(
    path.join(
      "scripts",
      "generate_reference_candidate_fp_constraint_patch_proposals.js",
    ),
    buildPatchProposalArgs(options),
  );

  runNodeScript(
    path.join(
      "scripts",
      "validate_reference_candidate_fp_constraint_patch_proposals_quality_gate.js",
    ),
    buildPatchProposalGateArgs(options),
  );

  console.log("");
  console.log(
    "Reference candidate FP patch proposal quality check completed successfully.",
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
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  buildFpSuggestionQualityArgs,
  buildPatchProposalArgs,
  buildPatchProposalGateArgs,
};

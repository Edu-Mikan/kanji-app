const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    summaryPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--summary") {
      options.summaryPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Validate reference descriptor candidate batch quality gate

Usage:
  node scripts/validate_reference_descriptor_candidate_batch_quality_gate.js \\
    --summary ./candidate_reports_training/reference_descriptor_candidate_pipeline_batch_summary.json

The gate fails when:
  - errorCount > 0
  - unsafeCandidateCount > 0

Permissive candidates do not fail this gate because this gate only checks
that generated candidates are safe against false negatives.
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateReferenceCandidateBatchQualityGate(summary) {
  const failures = [];

  if ((summary.errorCount ?? 0) > 0) {
    failures.push({
      code: "batch_errors",
      message: `Batch has ${summary.errorCount} processing error(s).`,
    });
  }

  if ((summary.unsafeCandidateCount ?? 0) > 0) {
    failures.push({
      code: "unsafe_candidates",
      message: [
        `Batch has ${summary.unsafeCandidateCount} unsafe candidate(s).`,
        `Kanjis: ${(summary.unsafeKanjis ?? []).join(", ")}`,
      ].join(" "),
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

function printQualityGateResult({ summary, result }) {
  console.log("");
  console.log("REFERENCE DESCRIPTOR CANDIDATE BATCH QUALITY GATE");
  console.log("==================================================");

  console.log(`Processed kanjis: ${summary.processedCount}`);
  console.log(`Errors: ${summary.errorCount}`);
  console.log(`Clean candidates: ${summary.cleanCandidateCount}`);
  console.log(`Safe candidates: ${summary.safeCandidateCount}`);
  console.log(`Unsafe candidates: ${summary.unsafeCandidateCount}`);
  console.log(`Permissive candidates: ${summary.permissiveCandidateCount}`);

  console.log("");
  console.log(`Passed: ${result.passed}`);

  if (!result.passed) {
    console.log("");
    console.log("Failures:");

    for (const failure of result.failures) {
      console.log(`- ${failure.code}: ${failure.message}`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(options.summaryPath)) {
    throw new Error(`Summary file not found: ${options.summaryPath}`);
  }

  const summary = readJson(options.summaryPath);

  const result = validateReferenceCandidateBatchQualityGate(summary);

  printQualityGateResult({
    summary,
    result,
  });

  if (!result.passed) {
    process.exitCode = 1;
  }
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
  validateReferenceCandidateBatchQualityGate,
};

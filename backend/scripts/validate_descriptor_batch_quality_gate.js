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
Validate descriptor batch quality gate

Usage:
  node scripts/validate_descriptor_batch_quality_gate.js \\
    --summary ./candidate_reports_training/pipeline_batch_summary.json

The gate fails when:
  - errorCount > 0
  - falseNegativeKanjiCount > 0
  - unexpectedFalsePositiveCount > 0
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateBatchQualityGate(summary) {
  const failures = [];

  if ((summary.errorCount ?? 0) > 0) {
    failures.push({
      code: "batch_errors",
      message: `Batch has ${summary.errorCount} processing error(s).`,
    });
  }

  if ((summary.falseNegativeKanjiCount ?? 0) > 0) {
    failures.push({
      code: "false_negatives",
      message: `Batch has false negatives in ${summary.falseNegativeKanjiCount} kanji(s): ${(summary.falseNegativeKanjis ?? []).join(", ")}`,
    });
  }

  if ((summary.unexpectedFalsePositiveCount ?? 0) > 0) {
    failures.push({
      code: "unexpected_false_positives",
      message: [
        `Batch has ${summary.unexpectedFalsePositiveCount} unexpected false positive(s).`,
        `Kanjis: ${(summary.unexpectedFalsePositiveKanjis ?? []).join(", ")}`,
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
  console.log("DESCRIPTOR BATCH QUALITY GATE");
  console.log("=============================");

  console.log(`Processed kanjis: ${summary.processedCount}`);
  console.log(`Errors: ${summary.errorCount}`);
  console.log(`False negative kanjis: ${summary.falseNegativeKanjiCount}`);
  console.log(`False positive kanjis: ${summary.falsePositiveKanjiCount}`);
  console.log(
    `Accepted false positives: ${summary.acceptedFalsePositiveCount ?? 0}`,
  );
  console.log(
    `Unexpected false positives: ${summary.unexpectedFalsePositiveCount ?? 0}`,
  );

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

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.summaryPath) {
    throw new Error("Missing --summary <path>");
  }

  if (!fs.existsSync(options.summaryPath)) {
    throw new Error(`Summary file not found: ${options.summaryPath}`);
  }

  const summary = readJson(options.summaryPath);

  const result = validateBatchQualityGate(summary);

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
  validateBatchQualityGate,
};

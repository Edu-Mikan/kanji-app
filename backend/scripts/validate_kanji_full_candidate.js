const fs = require("node:fs");

const path = require("node:path");

const { extractReferenceFeatures } = require("./extract_reference_features");

function parseArgs(argv) {
  const options = {
    datasetPath: null,
    kanjiList: null,
    outputPath: null,
    fromDataset: false,
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

    if (argument === "--kanji-list") {
      options.kanjiList = argv[index + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      index++;
      continue;
    }

    if (argument === "--from-dataset") {
      options.fromDataset = true;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Validate kanji_full candidate dataset

Usage:
  node scripts/validate_kanji_full_candidate.js \\
    --dataset ./kanji_full_candidate.json \\
    --kanji-list 一,二,三,四,六,七,八,十,田 \\
    --out-json ./kanji_full_candidate_validation_report.json

Options:
  --dataset <path>
      Candidate dataset JSON file.

  --kanji-list <kanji1,kanji2,...>
      Kanjis to validate.

  --out-json <path>
      Save validation report as JSON.

  --help
      Show this help.
`);
}

function assertFileExists(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function loadDataset(datasetPath) {
  assertFileExists(datasetPath, "dataset");

  return JSON.parse(fs.readFileSync(datasetPath, "utf8"));
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
  }

  if (
    !options.fromDataset &&
    (!Array.isArray(options.kanjiList) || options.kanjiList.length === 0)
  ) {
    throw new Error(
      "Missing --kanji-list <kanji1,kanji2,...> or --from-dataset",
    );
  }
}

function validateKanjiEntry({ dataset, kanji }) {
  const rawStrokes = dataset[kanji];

  if (!Array.isArray(rawStrokes)) {
    return {
      kanji,
      exists: false,
      ok: false,
      strokeCount: 0,
      warningCount: 1,
      warnings: [
        {
          type: "missing_kanji_entry",
          kanji,
        },
      ],
    };
  }

  const referenceFeatures = extractReferenceFeatures({
    kanji,
    rawStrokes,
  });

  return {
    kanji,
    exists: true,
    ok: referenceFeatures.quality?.ok === true,
    strokeCount: referenceFeatures.strokeCount,
    warningCount: referenceFeatures.quality?.warningCount ?? 0,
    warnings: referenceFeatures.quality?.warnings ?? [],
    geometry: {
      bboxWidth: referenceFeatures.features?.geometry?.bboxWidth,
      bboxHeight: referenceFeatures.features?.geometry?.bboxHeight,
      aspectRatio: referenceFeatures.features?.geometry?.aspectRatio,
    },
  };
}

function buildValidationReport({ datasetPath, kanjiList, results }) {
  const validCount = results.filter((result) => result.ok).length;

  const invalidCount = results.length - validCount;

  return {
    generatedAt: new Date().toISOString(),

    mode: "kanji_full_candidate_validation",

    datasetPath: path.resolve(datasetPath),

    kanjiCount: kanjiList.length,

    validCount,

    invalidCount,

    ok: invalidCount === 0,

    results,
  };
}

function printValidationReport(report) {
  console.log("");
  console.log("KANJI FULL CANDIDATE VALIDATION");
  console.log("================================");

  console.log(`Dataset: ${report.datasetPath}`);

  console.log(`Kanji count: ${report.kanjiCount}`);

  console.log(`Valid: ${report.validCount}`);

  console.log(`Invalid: ${report.invalidCount}`);

  console.log("");

  for (const result of report.results) {
    console.log(
      [
        `${result.kanji}:`,
        `ok=${result.ok}`,
        `exists=${result.exists}`,
        `strokeCount=${result.strokeCount}`,
        `warnings=${result.warningCount}`,
      ].join(" "),
    );

    for (const warning of result.warnings) {
      console.log(`  warning: ${warning.type}`);
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

  const dataset = loadDataset(options.datasetPath);

  const kanjiList = options.fromDataset
    ? Object.keys(dataset)
    : options.kanjiList;

  const results = kanjiList.map((kanji) =>
    validateKanjiEntry({
      dataset,
      kanji,
    }),
  );

  const report = buildValidationReport({
    datasetPath: options.datasetPath,
    kanjiList,
    results,
  });

  printValidationReport(report);

  if (options.outputPath) {
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    console.log("");
    console.log(`Validation report saved to: ${options.outputPath}`);
  }

  if (!report.ok) {
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
  validateKanjiEntry,
  buildValidationReport,
};

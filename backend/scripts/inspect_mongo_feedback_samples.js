"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  readMongoFeedbackDocuments,
  DEFAULT_DB_NAME,
  DEFAULT_COLLECTION_NAME,
} = require("../services/mongo_feedback_reader");

const {
  inspectFeedbackSamples,
} = require("../services/mongo_feedback_inspector");

const {
  buildFeedbackInspectionCatalogContext,
} = require("../services/feedback_inspection_catalog_context");

const BACKEND_ROOT = path.resolve(__dirname, "..");

const DEFAULT_CATALOG_PATH = path.join(
  BACKEND_ROOT,
  "data",
  "kanji_reference_catalog.json",
);

const DEFAULT_DESCRIPTOR_PATH = path.join(
  BACKEND_ROOT,
  "data",
  "kanji_descriptors.json",
);

const DEFAULT_REQUIREMENTS_PATH = path.join(
  BACKEND_ROOT,
  "data",
  "kanji_reference_requirements.json",
);

function requireArgumentValue(argv, index, argumentName) {
  const value = argv[index + 1];

  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.startsWith("--")
  ) {
    throw new Error(`Missing value for ${argumentName}.`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    dbName: DEFAULT_DB_NAME,
    collectionName: DEFAULT_COLLECTION_NAME,
    catalogPath: DEFAULT_CATALOG_PATH,
    descriptorPath: DEFAULT_DESCRIPTOR_PATH,
    requirementsPath: DEFAULT_REQUIREMENTS_PATH,
    outputJsonPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--apply") {
      throw new Error(
        "--apply is not supported. " + "This inspector is strictly read-only.",
      );
    }

    if (argument === "--db") {
      options.dbName = requireArgumentValue(argv, index, "--db");
      index++;
      continue;
    }

    if (argument === "--collection") {
      options.collectionName = requireArgumentValue(
        argv,
        index,
        "--collection",
      );
      index++;
      continue;
    }

    if (argument === "--catalog") {
      options.catalogPath = path.resolve(
        requireArgumentValue(argv, index, "--catalog"),
      );
      index++;
      continue;
    }

    if (argument === "--descriptors") {
      options.descriptorPath = path.resolve(
        requireArgumentValue(argv, index, "--descriptors"),
      );
      index++;
      continue;
    }

    if (argument === "--requirements") {
      options.requirementsPath = path.resolve(
        requireArgumentValue(argv, index, "--requirements"),
      );
      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputJsonPath = path.resolve(
        requireArgumentValue(argv, index, "--out-json"),
      );
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
MongoDB feedback sample inspector

Strictly read-only inspection of feedback_samples.

Usage:
  node scripts/inspect_mongo_feedback_samples.js

  node scripts/inspect_mongo_feedback_samples.js \\
    --out-json ./candidate_reports_training/mongo_feedback_inspection.json

Options:
  --db <name>
      MongoDB database name.
      Default: ${DEFAULT_DB_NAME}

  --collection <name>
      MongoDB feedback collection name.
      Default: ${DEFAULT_COLLECTION_NAME}

  --catalog <path>
      Canonical reference catalog.
      Default: ./data/kanji_reference_catalog.json

  --descriptors <path>
      Approved descriptor catalog.
      Default: ./data/kanji_descriptors.json

  --requirements <path>
      Reference requirements file.
      Default: ./data/kanji_reference_requirements.json

  --out-json <path>
      Save the inspection report as local JSON.

  --help
      Show this help.

Security:
  - Requires MONGO_URI through the environment.
  - Never prints MONGO_URI.
  - Never writes to MongoDB.
  - Does not approve, exclude or mark samples.
`);
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ` + error.message);
  }
}

function loadCatalogContext(options) {
  const catalog = readJsonFile(options.catalogPath, "Reference catalog");

  const descriptorCatalog = readJsonFile(
    options.descriptorPath,
    "Descriptor catalog",
  );

  const requirements = readJsonFile(
    options.requirementsPath,
    "Reference requirements",
  );

  return buildFeedbackInspectionCatalogContext({
    catalog,
    descriptorCatalog,
    requirements,
  });
}

function buildSafeConsoleSummary(report) {
  return {
    totalSamples: report.totalSamples,
    reliableCount: report.reliableCount,
    excludedCount: report.excludedCount,
    totalKanjis: Object.keys(report.byKanji ?? {}).length,
  };
}

function printReportSummary(report) {
  const summary = buildSafeConsoleSummary(report);

  console.log("");
  console.log("MONGODB FEEDBACK SAMPLE INSPECTION");
  console.log("==================================");
  console.log(`Total samples: ${summary.totalSamples}`);
  console.log(`Reliable samples: ${summary.reliableCount}`);
  console.log(`Excluded samples: ${summary.excludedCount}`);
  console.log(`Kanjis found: ${summary.totalKanjis}`);

  console.log("");
  console.log("BY KANJI");
  console.log("--------");

  for (const kanji of Object.keys(report.byKanji)) {
    const row = report.byKanji[kanji];

    console.log(
      [
        kanji,
        `total=${row.total}`,
        `reliable=${row.reliableCount}`,
        `excluded=${row.excludedCount}`,
        `geometry=${row.geometryAvailableCount}`,
        `reconstructible=${row.reconstructibleCount}`,
        `notPreparable=${row.notPreparableCount}`,
      ].join(" "),
    );
  }
}

function writeJsonReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true,
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function getRequiredMongoUri(environment) {
  const value = environment?.MONGO_URI;

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("MONGO_URI is required to inspect MongoDB.");
  }

  return value.trim();
}

async function runInspection({
  options,
  environment = process.env,
  readDocuments = readMongoFeedbackDocuments,
}) {
  const mongoUri = getRequiredMongoUri(environment);

  const catalogContext = loadCatalogContext(options);

  const documents = await readDocuments({
    mongoUri,
    dbName: options.dbName,
    collectionName: options.collectionName,
  });

  return inspectFeedbackSamples(documents, catalogContext);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const report = await runInspection({
    options,
  });

  printReportSummary(report);

  if (options.outputJsonPath) {
    writeJsonReport(options.outputJsonPath, report);

    console.log("");
    console.log(`JSON report saved to: ` + options.outputJsonPath);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("");
    console.error("ERROR");
    console.error("-----");

    /*
     * No mostramos stack traces ni objetos internos.
     * Tampoco mostramos configuración ni MONGO_URI.
     */
    console.error(error.message);

    process.exitCode = 1;
  });
}

module.exports = {
  BACKEND_ROOT,
  DEFAULT_CATALOG_PATH,
  DEFAULT_DESCRIPTOR_PATH,
  DEFAULT_REQUIREMENTS_PATH,
  requireArgumentValue,
  parseArgs,
  printHelp,
  readJsonFile,
  loadCatalogContext,
  buildSafeConsoleSummary,
  printReportSummary,
  writeJsonReport,
  getRequiredMongoUri,
  runInspection,
  main,
};

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  calculateSha256,
  sortKanjis,
  validateReferenceEntry,
} = require("../services/kanji_reference_catalog");

const BACKEND_DIRECTORY = path.resolve(__dirname, "..");

const DEFAULT_LEGACY_DATASET_PATH = path.join(
  BACKEND_DIRECTORY,
  "kanji_full.json",
);

const DEFAULT_REFERENCE_CATALOG_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_catalog.json",
);

const DEFAULT_DESCRIPTOR_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_descriptors.json",
);

const DEFAULT_REQUIREMENTS_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_requirements.json",
);

function parseArgs(argv) {
  const options = {
    legacyDatasetPath: DEFAULT_LEGACY_DATASET_PATH,
    referenceCatalogPath: DEFAULT_REFERENCE_CATALOG_PATH,
    descriptorPath: DEFAULT_DESCRIPTOR_PATH,
    requirementsPath: DEFAULT_REQUIREMENTS_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--legacy") {
      options.legacyDatasetPath = path.resolve(argv[++index]);

      continue;
    }

    if (argument === "--catalog") {
      options.referenceCatalogPath = path.resolve(argv[++index]);

      continue;
    }

    if (argument === "--descriptors") {
      options.descriptorPath = path.resolve(argv[++index]);

      continue;
    }

    if (argument === "--requirements") {
      options.requirementsPath = path.resolve(argv[++index]);

      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Kanji reference catalog regression validator

Usage:

  node scripts/validate_kanji_reference_catalog_regression.js

Options:

  --legacy <path>
      Legacy kanji_full.json path.

  --catalog <path>
      Incremental reference catalog path.

  --descriptors <path>
      Approved descriptor catalog path.

  --requirements <path>
      Reference requirements path.

  --help
      Show this help.
`);
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function readJson(filePath, label) {
  assertFileExists(filePath, label);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains invalid JSON: ${error.message}`);
  }
}

function getDescriptorKanjis(descriptorCatalog) {
  const descriptors = descriptorCatalog?.descriptors ?? descriptorCatalog;

  if (
    !descriptors ||
    typeof descriptors !== "object" ||
    Array.isArray(descriptors)
  ) {
    throw new Error("Descriptor catalog must contain a descriptors object.");
  }

  return sortKanjis(Object.keys(descriptors));
}

function getExternalUnseenKanjis(requirements) {
  if (!requirements || !Array.isArray(requirements.externalUnseen)) {
    throw new Error("Reference requirements must contain externalUnseen.");
  }

  return sortKanjis(requirements.externalUnseen);
}

function compareReferenceEntries({ kanji, legacyStrokes, catalogStrokes }) {
  const errors = [];

  if (!Array.isArray(legacyStrokes)) {
    errors.push("missing_or_invalid_legacy_reference");
  }

  if (!Array.isArray(catalogStrokes)) {
    errors.push("missing_or_invalid_catalog_reference");
  }

  if (errors.length > 0) {
    return {
      kanji,
      exactMatch: false,
      legacyStrokeCount: Array.isArray(legacyStrokes)
        ? legacyStrokes.length
        : null,
      catalogStrokeCount: Array.isArray(catalogStrokes)
        ? catalogStrokes.length
        : null,
      legacySha256: null,
      catalogSha256: null,
      errors,
    };
  }

  const legacyValidation = validateReferenceEntry({
    kanji,
    strokes: legacyStrokes,
  });

  const catalogValidation = validateReferenceEntry({
    kanji,
    strokes: catalogStrokes,
  });

  if (!legacyValidation.valid) {
    errors.push(...legacyValidation.errors.map((error) => `legacy_${error}`));
  }

  if (!catalogValidation.valid) {
    errors.push(...catalogValidation.errors.map((error) => `catalog_${error}`));
  }

  const legacySha256 = calculateSha256(legacyStrokes);

  const catalogSha256 = calculateSha256(catalogStrokes);

  if (legacyStrokes.length !== catalogStrokes.length) {
    errors.push("stroke_count_mismatch");
  }

  if (legacySha256 !== catalogSha256) {
    errors.push("reference_content_mismatch");
  }

  return {
    kanji,
    exactMatch: errors.length === 0,
    legacyStrokeCount: legacyStrokes.length,
    catalogStrokeCount: catalogStrokes.length,
    legacySha256,
    catalogSha256,
    errors,
  };
}

function validateCatalogRegression({
  legacyDataset,
  referenceCatalog,
  descriptorCatalog,
  requirements,
}) {
  const descriptorKanjis = getDescriptorKanjis(descriptorCatalog);

  const externalUnseenKanjis = getExternalUnseenKanjis(requirements);

  const expectedCatalogKanjis = sortKanjis([
    ...descriptorKanjis,
    ...externalUnseenKanjis,
  ]);

  const actualCatalogKanjis = sortKanjis(Object.keys(referenceCatalog));

  const missingCatalogKanjis = expectedCatalogKanjis.filter(
    (kanji) => !Object.hasOwn(referenceCatalog, kanji),
  );

  const unexpectedCatalogKanjis = actualCatalogKanjis.filter(
    (kanji) => !expectedCatalogKanjis.includes(kanji),
  );

  const rows = descriptorKanjis.map((kanji) =>
    compareReferenceEntries({
      kanji,
      legacyStrokes: legacyDataset[kanji],
      catalogStrokes: referenceCatalog[kanji],
    }),
  );

  const matchingKanjis = rows
    .filter((row) => row.exactMatch)
    .map((row) => row.kanji);

  const mismatchingKanjis = rows
    .filter((row) => !row.exactMatch)
    .map((row) => row.kanji);

  const externalUnseenRows = externalUnseenKanjis.map((kanji) => {
    const strokes = referenceCatalog[kanji];

    const validation = validateReferenceEntry({
      kanji,
      strokes,
    });

    return {
      kanji,
      existsInCatalog: Object.hasOwn(referenceCatalog, kanji),
      existsInLegacy: Object.hasOwn(legacyDataset, kanji),
      valid: validation.valid,
      strokeCount: validation.strokeCount,
      sha256: validation.valid ? calculateSha256(strokes) : null,
      errors: validation.errors,
    };
  });

  const externalUnseenValid = externalUnseenRows.every(
    (row) => row.existsInCatalog && row.valid,
  );

  const passed =
    mismatchingKanjis.length === 0 &&
    missingCatalogKanjis.length === 0 &&
    unexpectedCatalogKanjis.length === 0 &&
    externalUnseenValid;

  return {
    mode: "kanji_reference_catalog_regression",
    passed,
    descriptorKanjiCount: descriptorKanjis.length,
    externalUnseenKanjiCount: externalUnseenKanjis.length,
    expectedCatalogKanjiCount: expectedCatalogKanjis.length,
    actualCatalogKanjiCount: actualCatalogKanjis.length,
    exactMatchCount: matchingKanjis.length,
    mismatchCount: mismatchingKanjis.length,
    descriptorKanjis,
    externalUnseenKanjis,
    expectedCatalogKanjis,
    actualCatalogKanjis,
    matchingKanjis,
    mismatchingKanjis,
    missingCatalogKanjis,
    unexpectedCatalogKanjis,
    externalUnseenRows,
    rows,
  };
}

function printSummary(result) {
  console.log("");
  console.log("KANJI REFERENCE CATALOG REGRESSION");
  console.log("==================================");

  console.log(`Descriptor kanjis: ${result.descriptorKanjiCount}`);

  console.log(`External unseen kanjis: ${result.externalUnseenKanjiCount}`);

  console.log(`Expected catalog kanjis: ${result.expectedCatalogKanjiCount}`);

  console.log(`Actual catalog kanjis: ${result.actualCatalogKanjiCount}`);

  console.log(`Exact baseline matches: ${result.exactMatchCount}`);

  console.log(`Baseline mismatches: ${result.mismatchCount}`);

  console.log(`Missing catalog kanjis: ${result.missingCatalogKanjis.length}`);

  console.log(
    `Unexpected catalog kanjis: ${result.unexpectedCatalogKanjis.length}`,
  );

  console.log("");

  for (const row of result.rows) {
    console.log(
      [
        row.exactMatch ? "[OK]" : "[FAIL]",
        row.kanji,
        `legacyStrokes=${row.legacyStrokeCount}`,
        `catalogStrokes=${row.catalogStrokeCount}`,
        `hashMatch=${row.legacySha256 === row.catalogSha256}`,
      ].join(" "),
    );

    for (const error of row.errors) {
      console.log(`  ${error}`);
    }
  }

  if (result.externalUnseenRows.length > 0) {
    console.log("");
    console.log("External unseen references:");

    for (const row of result.externalUnseenRows) {
      console.log(
        [
          row.valid ? "[OK]" : "[FAIL]",
          row.kanji,
          `catalog=${row.existsInCatalog}`,
          `legacy=${row.existsInLegacy}`,
          `strokes=${row.strokeCount}`,
        ].join(" "),
      );
    }
  }

  console.log("");
  console.log(`Result: ${result.passed ? "PASS" : "FAIL"}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const result = validateCatalogRegression({
    legacyDataset: readJson(options.legacyDatasetPath, "Legacy kanji dataset"),
    referenceCatalog: readJson(
      options.referenceCatalogPath,
      "Incremental reference catalog",
    ),
    descriptorCatalog: readJson(options.descriptorPath, "Descriptor catalog"),
    requirements: readJson(options.requirementsPath, "Reference requirements"),
  });

  printSummary(result);

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
  readJson,
  getDescriptorKanjis,
  getExternalUnseenKanjis,
  compareReferenceEntries,
  validateCatalogRegression,
  printSummary,
};

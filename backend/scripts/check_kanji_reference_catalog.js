"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  REFERENCE_CATALOG_PATH,
  REFERENCE_MANIFEST_PATH,
  REFERENCE_REQUIREMENTS_PATH,
} = require("../services/kanji_reference_paths");

const {
  calculateSha256,
  sortKanjis,
  validateReferenceEntry,
} = require("../services/kanji_reference_catalog");

const DEFAULT_DESCRIPTOR_PATH = path.resolve(
  __dirname,
  "../data/kanji_descriptors.json",
);

function parseArgs(argv) {
  const options = {
    catalogPath: REFERENCE_CATALOG_PATH,
    manifestPath: REFERENCE_MANIFEST_PATH,
    requirementsPath: REFERENCE_REQUIREMENTS_PATH,
    descriptorPath: DEFAULT_DESCRIPTOR_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--catalog") {
      options.catalogPath = path.resolve(argv[++index]);
      continue;
    }

    if (argument === "--manifest") {
      options.manifestPath = path.resolve(argv[++index]);
      continue;
    }

    if (argument === "--requirements") {
      options.requirementsPath = path.resolve(argv[++index]);
      continue;
    }

    if (argument === "--descriptors") {
      options.descriptorPath = path.resolve(argv[++index]);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Check the incremental kanji reference catalog

Usage:

  node scripts/check_kanji_reference_catalog.js

Options:

  --catalog <path>
      Reference catalog path.
      Default: ./data/kanji_reference_catalog.json

  --manifest <path>
      Reference catalog manifest path.
      Default: ./data/kanji_reference_catalog.manifest.json

  --requirements <path>
      Reference requirements path.
      Default: ./data/kanji_reference_requirements.json

  --descriptors <path>
      Approved descriptor catalog path.
      Default: ./data/kanji_descriptors.json

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

function getRequiredKanjis({ descriptorCatalog, requirements }) {
  if (requirements?.schemaVersion !== 1) {
    throw new Error(
      `Unsupported requirements schema version: ${requirements?.schemaVersion}`,
    );
  }

  if (
    !Array.isArray(requirements.externalUnseen) ||
    !Array.isArray(requirements.requiredKanjis)
  ) {
    throw new Error(
      "Requirements must contain externalUnseen and requiredKanjis arrays.",
    );
  }

  return sortKanjis([
    ...getDescriptorKanjis(descriptorCatalog),
    ...requirements.externalUnseen,
    ...requirements.requiredKanjis,
  ]);
}

function checkReferenceCatalog({
  catalog,
  manifest,
  descriptorCatalog,
  requirements,
}) {
  const failures = [];

  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    failures.push({
      code: "invalid_catalog",
      message: "Reference catalog must be an object.",
    });

    return {
      passed: false,
      failures,
    };
  }

  if (manifest?.schemaVersion !== 1) {
    failures.push({
      code: "invalid_manifest_schema",
      message: `Unsupported manifest schema version: ${manifest?.schemaVersion}`,
    });
  }

  const requiredKanjis = getRequiredKanjis({
    descriptorCatalog,
    requirements,
  });

  const catalogKanjis = sortKanjis(Object.keys(catalog));

  const missingKanjis = requiredKanjis.filter(
    (kanji) => !Object.hasOwn(catalog, kanji),
  );

  if (missingKanjis.length > 0) {
    failures.push({
      code: "missing_required_kanjis",
      message: `Missing required kanjis: ${missingKanjis.join(", ")}`,
      kanjis: missingKanjis,
    });
  }

  const invalidEntries = [];

  for (const kanji of catalogKanjis) {
    const validation = validateReferenceEntry({
      kanji,
      strokes: catalog[kanji],
    });

    if (!validation.valid) {
      invalidEntries.push({
        kanji,
        errors: validation.errors,
      });
    }
  }

  if (invalidEntries.length > 0) {
    failures.push({
      code: "invalid_reference_entries",
      message: "The catalog contains invalid reference entries.",
      entries: invalidEntries,
    });
  }

  const catalogSha256 = calculateSha256(catalog);

  if (manifest?.catalog?.sha256 !== catalogSha256) {
    failures.push({
      code: "catalog_hash_mismatch",
      message: "The catalog SHA-256 does not match the manifest.",
      expected: manifest?.catalog?.sha256 ?? null,
      actual: catalogSha256,
    });
  }

  if (manifest?.catalog?.kanjiCount !== catalogKanjis.length) {
    failures.push({
      code: "catalog_count_mismatch",
      message: "The catalog count does not match the manifest.",
      expected: manifest?.catalog?.kanjiCount ?? null,
      actual: catalogKanjis.length,
    });
  }

  const manifestKanjis = Array.isArray(manifest?.catalog?.kanjis)
    ? manifest.catalog.kanjis
    : [];

  if (JSON.stringify(manifestKanjis) !== JSON.stringify(catalogKanjis)) {
    failures.push({
      code: "catalog_kanji_list_mismatch",
      message: "The catalog kanji list does not match the manifest.",
    });
  }

  const entryFailures = [];

  for (const kanji of catalogKanjis) {
    const manifestEntry = manifest?.entries?.[kanji];

    if (!manifestEntry) {
      entryFailures.push({
        kanji,
        error: "missing_manifest_entry",
      });
      continue;
    }

    const entrySha256 = calculateSha256(catalog[kanji]);

    if (manifestEntry.entrySha256 !== entrySha256) {
      entryFailures.push({
        kanji,
        error: "entry_hash_mismatch",
      });
    }

    if (manifestEntry.strokeCount !== catalog[kanji].length) {
      entryFailures.push({
        kanji,
        error: "stroke_count_mismatch",
      });
    }
  }

  if (entryFailures.length > 0) {
    failures.push({
      code: "manifest_entry_mismatch",
      message: "One or more manifest entries do not match the catalog.",
      entries: entryFailures,
    });
  }

  return {
    passed: failures.length === 0,
    catalogKanjiCount: catalogKanjis.length,
    requiredKanjiCount: requiredKanjis.length,
    descriptorKanjiCount: getDescriptorKanjis(descriptorCatalog).length,
    externalUnseenKanjiCount: requirements.externalUnseen.length,
    requiredKanjis,
    catalogKanjis,
    missingKanjis,
    catalogSha256,
    failures,
  };
}

function printSummary(result) {
  console.log("");
  console.log("KANJI REFERENCE CATALOG CHECK");
  console.log("=============================");

  console.log(`Catalog kanjis: ${result.catalogKanjiCount ?? 0}`);

  console.log(`Required kanjis: ${result.requiredKanjiCount ?? 0}`);

  console.log(`Descriptor kanjis: ${result.descriptorKanjiCount ?? 0}`);

  console.log(
    `External unseen kanjis: ${result.externalUnseenKanjiCount ?? 0}`,
  );

  console.log(`Failures: ${result.failures.length}`);

  for (const failure of result.failures) {
    console.log(`[FAIL] ${failure.code}: ${failure.message}`);
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

  const result = checkReferenceCatalog({
    catalog: readJson(options.catalogPath, "Reference catalog"),
    manifest: readJson(options.manifestPath, "Reference catalog manifest"),
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
  getRequiredKanjis,
  checkReferenceCatalog,
  printSummary,
};

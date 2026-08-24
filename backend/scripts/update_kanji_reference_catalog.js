"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildKanjiDatasetEntry,
  getKanjiSvgFileName,
} = require("../services/kanji_svg_reference_converter");

const {
  calculateSha256,
  buildIncrementalCatalog,
  buildReferenceCatalogManifest,
} = require("../services/kanji_reference_catalog");

const BACKEND_DIRECTORY = path.resolve(__dirname, "..");

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

const DEFAULT_SVG_DIRECTORY = path.join(BACKEND_DIRECTORY, "kanji_svg");

const DEFAULT_CATALOG_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_catalog.json",
);

const DEFAULT_MANIFEST_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_catalog.manifest.json",
);

const CONVERTER_PATH = path.join(
  BACKEND_DIRECTORY,
  "services",
  "kanji_svg_reference_converter.js",
);

function parseArgs(argv) {
  const options = {
    descriptorPath: DEFAULT_DESCRIPTOR_PATH,
    requirementsPath: DEFAULT_REQUIREMENTS_PATH,
    svgDirectory: DEFAULT_SVG_DIRECTORY,
    catalogPath: DEFAULT_CATALOG_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    apply: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--apply") {
      options.apply = true;
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

    if (argument === "--svg-dir") {
      options.svgDirectory = path.resolve(argv[++index]);
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

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Incremental kanji reference catalog updater

Usage:

  node scripts/update_kanji_reference_catalog.js

  node scripts/update_kanji_reference_catalog.js \\
    --apply

Options:

  --apply
      Write the catalog and manifest.
      Without this option, the command is a dry-run.

  --descriptors <path>
      Descriptor catalog path.

  --requirements <path>
      Reference requirements path.

  --svg-dir <path>
      Kanji SVG directory.

  --catalog <path>
      Output catalog path.

  --manifest <path>
      Output manifest path.

  --help
      Show this help.
`);
}

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function assertDirectoryExists(directoryPath, label) {
  if (
    !fs.existsSync(directoryPath) ||
    !fs.statSync(directoryPath).isDirectory()
  ) {
    throw new Error(`${label} not found: ${directoryPath}`);
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

function readOptionalCatalog(catalogPath) {
  if (!fs.existsSync(catalogPath)) {
    return {};
  }

  return readJson(catalogPath, "Reference catalog");
}

function collectDescriptorKanjis(descriptorCatalog) {
  const descriptors = descriptorCatalog?.descriptors ?? descriptorCatalog;

  if (
    !descriptors ||
    typeof descriptors !== "object" ||
    Array.isArray(descriptors)
  ) {
    throw new Error("Descriptor catalog must contain a descriptors object.");
  }

  return Object.keys(descriptors);
}

function loadRequirements(requirementsPath) {
  const requirements = readJson(requirementsPath, "Reference requirements");

  if (requirements.schemaVersion !== 1) {
    throw new Error(
      `Unsupported reference requirements schema version: ${requirements.schemaVersion}`,
    );
  }

  if (!Array.isArray(requirements.externalUnseen)) {
    throw new Error("Reference requirements must contain externalUnseen.");
  }

  if (!Array.isArray(requirements.requiredKanjis)) {
    throw new Error("Reference requirements must contain requiredKanjis.");
  }

  return requirements;
}

function buildRequiredSources({ descriptorCatalog, requirements }) {
  return [
    {
      reason: "approved_descriptor",
      kanjis: collectDescriptorKanjis(descriptorCatalog),
    },
    {
      reason: "external_unseen",
      kanjis: requirements.externalUnseen,
    },
    {
      reason: "explicit_requirement",
      kanjis: requirements.requiredKanjis,
    },
  ];
}

function calculateFileSha256(filePath) {
  assertFileExists(filePath, "Hash source file");

  return calculateSha256(fs.readFileSync(filePath, "utf8"));
}

function calculateSourceSvgHashes({ svgDirectory, kanjis }) {
  const hashes = {};

  for (const kanji of kanjis) {
    const svgPath = path.join(svgDirectory, getKanjiSvgFileName(kanji));

    hashes[kanji] = calculateFileSha256(svgPath);
  }

  return hashes;
}

function serializePrettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeFileAtomically(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  const temporaryPath = `${filePath}.tmp-${process.pid}`;

  try {
    fs.writeFileSync(temporaryPath, content, "utf8");

    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.rmSync(temporaryPath, {
        force: true,
      });
    }
  }
}

function buildGeneratorSha256() {
  return calculateSha256({
    updater: fs.readFileSync(__filename, "utf8"),
    converter: fs.readFileSync(CONVERTER_PATH, "utf8"),
  });
}

function updateReferenceCatalog({
  descriptorPath,
  requirementsPath,
  svgDirectory,
  catalogPath,
  manifestPath,
  apply,
  generatedAt = new Date().toISOString(),
}) {
  assertDirectoryExists(svgDirectory, "Kanji SVG directory");

  const descriptorCatalog = readJson(descriptorPath, "Descriptor catalog");

  const requirements = loadRequirements(requirementsPath);

  const existingCatalog = readOptionalCatalog(catalogPath);

  const requiredSources = buildRequiredSources({
    descriptorCatalog,
    requirements,
  });

  const result = buildIncrementalCatalog({
    existingCatalog,
    requiredSources,
    buildEntry(kanji) {
      return buildKanjiDatasetEntry({
        svgDir: svgDirectory,
        kanji,
      });
    },
  });

  const changed =
    result.generatedKanjis.length > 0 ||
    !fs.existsSync(catalogPath) ||
    !fs.existsSync(manifestPath);

  let manifest = null;

  if (changed) {
    const sourceSvgSha256ByKanji = calculateSourceSvgHashes({
      svgDirectory,
      kanjis: Object.keys(result.catalog),
    });

    manifest = buildReferenceCatalogManifest({
      catalog: result.catalog,
      updateResult: result,
      generatedAt,
      sourceDirectory: "kanji_svg",
      generatorFile: "scripts/update_kanji_reference_catalog.js",
      generatorSha256: buildGeneratorSha256(),
      sourceSvgSha256ByKanji,
    });
  }

  if (apply && changed) {
    writeFileAtomically(catalogPath, serializePrettyJson(result.catalog));

    writeFileAtomically(manifestPath, serializePrettyJson(manifest));
  }

  return {
    ...result,
    manifest,
    changed,
    applied: Boolean(apply && changed),
  };
}

function printSummary({ options, result }) {
  console.log("");
  console.log("KANJI REFERENCE CATALOG UPDATE");
  console.log("==============================");
  console.log(`Mode: ${options.apply ? "apply" : "dry-run"}`);
  console.log(`Required kanjis: ${result.requiredKanjis.length}`);
  console.log(`Catalog kanjis: ${Object.keys(result.catalog).length}`);
  console.log(`Generated: ${result.generatedKanjis.length}`);
  console.log(`Preserved: ${result.preservedKanjis.length}`);
  console.log(`Changed: ${result.changed}`);
  console.log(`Applied: ${result.applied}`);

  if (result.generatedKanjis.length > 0) {
    console.log("");
    console.log(`Generated kanjis: ${result.generatedKanjis.join(", ")}`);
  }

  console.log("");
  console.log(`Catalog: ${options.catalogPath}`);
  console.log(`Manifest: ${options.manifestPath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const result = updateReferenceCatalog(options);

  printSummary({
    options,
    result,
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
  parseArgs,
  readJson,
  readOptionalCatalog,
  collectDescriptorKanjis,
  loadRequirements,
  buildRequiredSources,
  calculateFileSha256,
  calculateSourceSvgHashes,
  serializePrettyJson,
  writeFileAtomically,
  updateReferenceCatalog,
  printSummary,
};

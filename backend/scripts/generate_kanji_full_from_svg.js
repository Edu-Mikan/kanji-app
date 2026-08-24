const fs = require("node:fs");
const path = require("node:path");

const {
  getKanjiSvgFileName,
  getKanjiFromSvgFileName,
  isCjkCharacter,
  getAllKanjisFromSvgDir,
  extractPathDataFromSvg,
  tokenizePathData,
  parsePathDataToPoints,
  normalizeStrokesToUnitBox,
  convertSvgToStrokes,
  buildKanjiDatasetEntry,
} = require("../services/kanji_svg_reference_converter");

const DEFAULT_OUTPUT_PATH = path.resolve(
  __dirname,
  "../kanji_full_candidate.json",
);

function parseArgs(argv) {
  const options = {
    svgDir: null,
    kanji: null,
    kanjiList: null,
    all: false,
    outputPath: DEFAULT_OUTPUT_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--svg-dir") {
      options.svgDir = path.resolve(argv[index + 1]);

      index++;
      continue;
    }

    if (argument === "--kanji") {
      options.kanji = argv[index + 1];

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

    if (argument === "--all") {
      options.all = true;
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

function getTargetKanjis(options) {
  if (options.all) {
    return getAllKanjisFromSvgDir(options.svgDir);
  }

  if (Array.isArray(options.kanjiList) && options.kanjiList.length > 0) {
    return options.kanjiList;
  }

  if (options.kanji) {
    return [options.kanji];
  }

  return [];
}

function printHelp() {
  console.log(`
    Generate kanji_full.json from SVG files

    Usage:
    node scripts/generate_kanji_full_from_svg.js \\
        --svg-dir ./kanji_svg \\
        --kanji 田 \\
        --out-json ./kanji_full_candidate.json

    Alternative:
    node scripts/generate_kanji_full_from_svg.js \\
        --svg-dir ./kanji_svg \\
        --kanji-list 一,二,三,四,六,七,八,十,田 \\
        --all \
        --out-json ./kanji_full_candidate.json

    Options:
    --svg-dir <path>
        Folder containing SVG files.

    --kanji <kanji>
        Generate only one kanji.

    --kanji-list <kanji1,kanji2,...>
        Generate several kanjis into the same candidate file.

    --all
      Generate all SVG files found in the SVG directory.

    --out-json <path>
        Candidate output JSON file.

    --help
        Show this help.
`);
}

function assertDirectoryExists(directoryPath) {
  if (
    !directoryPath ||
    !fs.existsSync(directoryPath) ||
    !fs.statSync(directoryPath).isDirectory()
  ) {
    throw new Error(`SVG directory not found: ${directoryPath}`);
  }
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.svgDir) {
    throw new Error("Missing --svg-dir <path>");
  }

  const targetKanjis = getTargetKanjis(options);

  if (targetKanjis.length === 0) {
    throw new Error("Missing --kanji, --kanji-list or --all");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  assertDirectoryExists(options.svgDir);

  const targetKanjis = getTargetKanjis(options);

  const output = {};
  const summaries = [];

  for (const kanji of targetKanjis) {
    const result = buildKanjiDatasetEntry({
      svgDir: options.svgDir,
      kanji,
    });

    output[kanji] = result.strokes;

    summaries.push({
      kanji,
      originalPathCount: result.originalPathCount,
      usefulStrokeCount: result.usefulStrokeCount,
      warningCount: result.warnings.length,
      warnings: result.warnings,
    });
  }

  fs.writeFileSync(options.outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log("KANJI FULL CANDIDATE GENERATED");
  console.log("==============================");
  console.log(`Kanji count: ${targetKanjis.length}`);
  console.log(`Output: ${options.outputPath}`);

  console.log("");
  console.log("Generated entries:");

  for (const summary of summaries) {
    console.log(
      [
        `  ${summary.kanji}:`,
        `paths=${summary.originalPathCount}`,
        `strokes=${summary.usefulStrokeCount}`,
        `warnings=${summary.warningCount}`,
      ].join(" "),
    );

    for (const warning of summary.warnings) {
      console.log(`    stroke#${warning.strokeIndex}: ${warning.warning}`);
    }
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
  getKanjiSvgFileName,
  extractPathDataFromSvg,
  tokenizePathData,
  parsePathDataToPoints,
  normalizeStrokesToUnitBox,
  convertSvgToStrokes,
  getTargetKanjis,
  getKanjiFromSvgFileName,
  getAllKanjisFromSvgDir,
  isCjkCharacter,
};

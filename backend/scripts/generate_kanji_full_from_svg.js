const fs = require("node:fs");

const path = require("node:path");

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

function getKanjiFromSvgFileName(fileName) {
  const match = fileName.match(/^([0-9a-fA-F]{5})\.svg$/);

  if (!match) {
    return null;
  }

  const codePoint = Number.parseInt(match[1], 16);

  if (!Number.isFinite(codePoint)) {
    return null;
  }

  return String.fromCodePoint(codePoint);
}

function getAllKanjisFromSvgDir(svgDir) {
  return fs
    .readdirSync(svgDir)
    .map(getKanjiFromSvgFileName)
    .filter(Boolean)
    .filter(isCjkCharacter)
    .sort((left, right) => left.codePointAt(0) - right.codePointAt(0));
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

function getKanjiSvgFileName(kanji) {
  const codePoint = Array.from(kanji)[0]
    .codePointAt(0)
    .toString(16)
    .padStart(5, "0");

  return `${codePoint}.svg`;
}

function readSvgForKanji({ svgDir, kanji }) {
  const svgFileName = getKanjiSvgFileName(kanji);

  const svgPath = path.join(svgDir, svgFileName);

  if (!fs.existsSync(svgPath)) {
    throw new Error(`SVG file not found for ${kanji}: ${svgPath}`);
  }

  return fs.readFileSync(svgPath, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getAttribute(tag, attributeName) {
  const escapedAttributeName = escapeRegExp(attributeName);

  const doubleQuoteRegex = new RegExp(
    `(?:^|\\s)${escapedAttributeName}\\s*=\\s*"([^"]*)"`,
  );

  const singleQuoteRegex = new RegExp(
    `(?:^|\\s)${escapedAttributeName}\\s*=\\s*'([^']*)'`,
  );

  return (
    tag.match(doubleQuoteRegex)?.[1] ?? tag.match(singleQuoteRegex)?.[1] ?? null
  );
}

function extractPathDataFromSvg(svgContent) {
  const paths = [];

  const pathTagRegex = /<path\b[^>]*>/g;

  let match;

  while ((match = pathTagRegex.exec(svgContent)) !== null) {
    const tag = match[0];

    const d = getAttribute(tag, "d");

    if (d) {
      paths.push(d);
    }
  }

  return paths;
}

function tokenizePathData(pathData) {
  return (
    pathData.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) ?? []
  );
}

function isCommand(token) {
  return /^[a-zA-Z]$/.test(token);
}

function toNumber(token) {
  const value = Number(token);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid SVG path number: ${token}`);
  }

  return value;
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;

  return {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * p1.x +
      3 * mt * t * t * p2.x +
      t * t * t * p3.x,

    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * p1.y +
      3 * mt * t * t * p2.y +
      t * t * t * p3.y,
  };
}

function quadraticPoint(p0, p1, p2, t) {
  const mt = 1 - t;

  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,

    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function reflectPoint(point, around) {
  if (!point) {
    return {
      x: around.x,
      y: around.y,
    };
  }

  return {
    x: 2 * around.x - point.x,

    y: 2 * around.y - point.y,
  };
}

function appendPoint(points, point) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return;
  }

  const previous = points[points.length - 1];

  if (previous && previous.x === point.x && previous.y === point.y) {
    return;
  }

  points.push(point);
}

function parsePathDataToPoints(pathData) {
  const tokens = tokenizePathData(pathData);

  const points = [];
  const warnings = [];

  let index = 0;
  let command = null;

  let current = {
    x: 0,
    y: 0,
  };

  let subpathStart = {
    x: 0,
    y: 0,
  };

  let lastCubicControl = null;
  let lastQuadraticControl = null;

  function readNumber() {
    return toNumber(tokens[index++]);
  }

  function hasMoreNumbers() {
    return index < tokens.length && !isCommand(tokens[index]);
  }

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++];
    }

    if (!command) {
      throw new Error(`Path data starts without command: ${pathData}`);
    }

    const relative = command === command.toLowerCase();

    const upper = command.toUpperCase();

    if (upper === "M") {
      const x = readNumber();

      const y = readNumber();

      current = {
        x: relative ? current.x + x : x,

        y: relative ? current.y + y : y,
      };

      subpathStart = {
        ...current,
      };

      appendPoint(points, current);

      command = relative ? "l" : "L";

      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (upper === "L") {
      while (hasMoreNumbers()) {
        const x = readNumber();

        const y = readNumber();

        current = {
          x: relative ? current.x + x : x,

          y: relative ? current.y + y : y,
        };

        appendPoint(points, current);
      }

      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (upper === "H") {
      while (hasMoreNumbers()) {
        const x = readNumber();

        current = {
          x: relative ? current.x + x : x,

          y: current.y,
        };

        appendPoint(points, current);
      }

      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (upper === "V") {
      while (hasMoreNumbers()) {
        const y = readNumber();

        current = {
          x: current.x,

          y: relative ? current.y + y : y,
        };

        appendPoint(points, current);
      }

      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (upper === "C") {
      while (hasMoreNumbers()) {
        const c1 = {
          x: readNumber(),
          y: readNumber(),
        };

        const c2 = {
          x: readNumber(),
          y: readNumber(),
        };

        const end = {
          x: readNumber(),
          y: readNumber(),
        };

        const control1 = relative
          ? {
              x: current.x + c1.x,
              y: current.y + c1.y,
            }
          : c1;

        const control2 = relative
          ? {
              x: current.x + c2.x,
              y: current.y + c2.y,
            }
          : c2;

        const absoluteEnd = relative
          ? {
              x: current.x + end.x,
              y: current.y + end.y,
            }
          : end;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(
            points,
            cubicPoint(start, control1, control2, absoluteEnd, step / 12),
          );
        }

        current = absoluteEnd;

        lastCubicControl = control2;

        lastQuadraticControl = null;
      }

      continue;
    }

    if (upper === "S") {
      while (hasMoreNumbers()) {
        const reflected = reflectPoint(lastCubicControl, current);

        const c2 = {
          x: readNumber(),
          y: readNumber(),
        };

        const end = {
          x: readNumber(),
          y: readNumber(),
        };

        const control2 = relative
          ? {
              x: current.x + c2.x,
              y: current.y + c2.y,
            }
          : c2;

        const absoluteEnd = relative
          ? {
              x: current.x + end.x,
              y: current.y + end.y,
            }
          : end;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(
            points,
            cubicPoint(start, reflected, control2, absoluteEnd, step / 12),
          );
        }

        current = absoluteEnd;

        lastCubicControl = control2;

        lastQuadraticControl = null;
      }

      continue;
    }

    if (upper === "Q") {
      while (hasMoreNumbers()) {
        const c = {
          x: readNumber(),
          y: readNumber(),
        };

        const end = {
          x: readNumber(),
          y: readNumber(),
        };

        const control = relative
          ? {
              x: current.x + c.x,
              y: current.y + c.y,
            }
          : c;

        const absoluteEnd = relative
          ? {
              x: current.x + end.x,
              y: current.y + end.y,
            }
          : end;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(
            points,
            quadraticPoint(start, control, absoluteEnd, step / 12),
          );
        }

        current = absoluteEnd;

        lastQuadraticControl = control;

        lastCubicControl = null;
      }

      continue;
    }

    if (upper === "T") {
      while (hasMoreNumbers()) {
        const control = reflectPoint(lastQuadraticControl, current);

        const rawEnd = {
          x: readNumber(),
          y: readNumber(),
        };

        const absoluteEnd = relative
          ? {
              x: current.x + rawEnd.x,
              y: current.y + rawEnd.y,
            }
          : rawEnd;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(
            points,
            quadraticPoint(start, control, absoluteEnd, step / 12),
          );
        }

        current = absoluteEnd;

        lastQuadraticControl = control;

        lastCubicControl = null;
      }

      continue;
    }

    if (upper === "A") {
      warnings.push("Arc command approximated as line");

      while (hasMoreNumbers()) {
        readNumber();
        readNumber();
        readNumber();
        readNumber();
        readNumber();

        const x = readNumber();

        const y = readNumber();

        current = {
          x: relative ? current.x + x : x,

          y: relative ? current.y + y : y,
        };

        appendPoint(points, current);
      }

      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    if (upper === "Z") {
      current = {
        ...subpathStart,
      };

      appendPoint(points, current);

      lastCubicControl = null;
      lastQuadraticControl = null;
      continue;
    }

    throw new Error(`Unsupported SVG path command: ${command}`);
  }

  return {
    points,
    warnings,
  };
}

function normalizeStrokesToUnitBox(strokes) {
  const allPoints = strokes.flat();

  if (allPoints.length === 0) {
    return [];
  }

  const minX = Math.min(...allPoints.map((point) => point.x));

  const maxX = Math.max(...allPoints.map((point) => point.x));

  const minY = Math.min(...allPoints.map((point) => point.y));

  const maxY = Math.max(...allPoints.map((point) => point.y));

  const width = Math.max(maxX - minX, 1e-9);

  const height = Math.max(maxY - minY, 1e-9);

  const scale = Math.max(width, height);

  return strokes.map((stroke) => ({
    x: stroke.map((point) => (point.x - minX) / scale),

    y: stroke.map((point) => (point.y - minY) / scale),
  }));
}

function convertSvgToStrokes(svgContent) {
  const pathDataList = extractPathDataFromSvg(svgContent);

  const warnings = [];

  const pointStrokes = pathDataList.map((pathData, index) => {
    const parsed = parsePathDataToPoints(pathData);

    for (const warning of parsed.warnings) {
      warnings.push({
        strokeIndex: index,
        warning,
      });
    }

    return parsed.points;
  });

  const usefulPointStrokes = pointStrokes.filter(
    (stroke) => stroke.length >= 2,
  );

  const normalized = normalizeStrokesToUnitBox(usefulPointStrokes);

  return {
    strokes: normalized,
    warnings,
    originalPathCount: pathDataList.length,
    usefulStrokeCount: normalized.length,
  };
}

function buildKanjiDatasetEntry({ svgDir, kanji }) {
  const svgContent = readSvgForKanji({
    svgDir,
    kanji,
  });

  return convertSvgToStrokes(svgContent);
}

function isCjkCharacter(value) {
  if (!value) {
    return false;
  }

  const codePoint = value.codePointAt(0);

  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2a6df) ||
    (codePoint >= 0x2a700 && codePoint <= 0x2b73f) ||
    (codePoint >= 0x2b740 && codePoint <= 0x2b81f) ||
    (codePoint >= 0x2b820 && codePoint <= 0x2ceaf) ||
    (codePoint >= 0x2ceb0 && codePoint <= 0x2ebef) ||
    (codePoint >= 0x30000 && codePoint <= 0x3134f)
  );
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

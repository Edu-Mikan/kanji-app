"use strict";

const fs = require("node:fs");
const path = require("node:path");

function getKanjiSvgFileName(kanji) {
  const characters = Array.from(kanji ?? "");

  if (characters.length !== 1) {
    throw new Error(`Expected one kanji character, received: ${kanji}`);
  }

  const codePoint = characters[0].codePointAt(0).toString(16).padStart(5, "0");

  return `${codePoint}.svg`;
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

function isCjkCharacter(value) {
  if (typeof value !== "string" || Array.from(value).length !== 1) {
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

function getAllKanjisFromSvgDir(svgDir) {
  return fs
    .readdirSync(svgDir)
    .map(getKanjiFromSvgFileName)
    .filter(Boolean)
    .filter(isCjkCharacter)
    .sort((left, right) => left.codePointAt(0) - right.codePointAt(0));
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
    const pathData = getAttribute(tag, "d");

    if (pathData) {
      paths.push(pathData);
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

function cubicPoint(point0, point1, point2, point3, time) {
  const remaining = 1 - time;

  return {
    x:
      remaining * remaining * remaining * point0.x +
      3 * remaining * remaining * time * point1.x +
      3 * remaining * time * time * point2.x +
      time * time * time * point3.x,
    y:
      remaining * remaining * remaining * point0.y +
      3 * remaining * remaining * time * point1.y +
      3 * remaining * time * time * point2.y +
      time * time * time * point3.y,
  };
}

function quadraticPoint(point0, point1, point2, time) {
  const remaining = 1 - time;

  return {
    x:
      remaining * remaining * point0.x +
      2 * remaining * time * point1.x +
      time * time * point2.x,
    y:
      remaining * remaining * point0.y +
      2 * remaining * time * point1.y +
      time * time * point2.y,
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
        const control1Raw = {
          x: readNumber(),
          y: readNumber(),
        };

        const control2Raw = {
          x: readNumber(),
          y: readNumber(),
        };

        const endRaw = {
          x: readNumber(),
          y: readNumber(),
        };

        const control1 = relative
          ? {
              x: current.x + control1Raw.x,
              y: current.y + control1Raw.y,
            }
          : control1Raw;

        const control2 = relative
          ? {
              x: current.x + control2Raw.x,
              y: current.y + control2Raw.y,
            }
          : control2Raw;

        const end = relative
          ? {
              x: current.x + endRaw.x,
              y: current.y + endRaw.y,
            }
          : endRaw;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(
            points,
            cubicPoint(start, control1, control2, end, step / 12),
          );
        }

        current = end;
        lastCubicControl = control2;
        lastQuadraticControl = null;
      }

      continue;
    }

    if (upper === "S") {
      while (hasMoreNumbers()) {
        const control1 = reflectPoint(lastCubicControl, current);

        const control2Raw = {
          x: readNumber(),
          y: readNumber(),
        };

        const endRaw = {
          x: readNumber(),
          y: readNumber(),
        };

        const control2 = relative
          ? {
              x: current.x + control2Raw.x,
              y: current.y + control2Raw.y,
            }
          : control2Raw;

        const end = relative
          ? {
              x: current.x + endRaw.x,
              y: current.y + endRaw.y,
            }
          : endRaw;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(
            points,
            cubicPoint(start, control1, control2, end, step / 12),
          );
        }

        current = end;
        lastCubicControl = control2;
        lastQuadraticControl = null;
      }

      continue;
    }

    if (upper === "Q") {
      while (hasMoreNumbers()) {
        const controlRaw = {
          x: readNumber(),
          y: readNumber(),
        };

        const endRaw = {
          x: readNumber(),
          y: readNumber(),
        };

        const control = relative
          ? {
              x: current.x + controlRaw.x,
              y: current.y + controlRaw.y,
            }
          : controlRaw;

        const end = relative
          ? {
              x: current.x + endRaw.x,
              y: current.y + endRaw.y,
            }
          : endRaw;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(points, quadraticPoint(start, control, end, step / 12));
        }

        current = end;
        lastQuadraticControl = control;

        lastCubicControl = null;
      }

      continue;
    }

    if (upper === "T") {
      while (hasMoreNumbers()) {
        const control = reflectPoint(lastQuadraticControl, current);

        const endRaw = {
          x: readNumber(),
          y: readNumber(),
        };

        const end = relative
          ? {
              x: current.x + endRaw.x,
              y: current.y + endRaw.y,
            }
          : endRaw;

        const start = current;

        for (let step = 1; step <= 12; step++) {
          appendPoint(points, quadraticPoint(start, control, end, step / 12));
        }

        current = end;
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

  const pointStrokes = pathDataList.map((pathData, strokeIndex) => {
    const parsed = parsePathDataToPoints(pathData);

    for (const warning of parsed.warnings) {
      warnings.push({
        strokeIndex,
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

module.exports = {
  getKanjiSvgFileName,
  getKanjiFromSvgFileName,
  isCjkCharacter,
  getAllKanjisFromSvgDir,
  readSvgForKanji,
  extractPathDataFromSvg,
  tokenizePathData,
  parsePathDataToPoints,
  normalizeStrokesToUnitBox,
  convertSvgToStrokes,
  buildKanjiDatasetEntry,
};

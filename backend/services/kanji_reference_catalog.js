"use strict";

const crypto = require("node:crypto");

const REFERENCE_CATALOG_SCHEMA_VERSION = 1;
const REFERENCE_MANIFEST_SCHEMA_VERSION = 1;
const REFERENCE_GENERATOR_VERSION = 1;

function compareKanjis(left, right) {
  return left.codePointAt(0) - right.codePointAt(0);
}

function sortKanjis(kanjis) {
  return [...new Set(kanjis)].sort(compareKanjis);
}

function isSingleCharacter(value) {
  return typeof value === "string" && Array.from(value).length === 1;
}

function assertValidKanji(kanji) {
  if (!isSingleCharacter(kanji)) {
    throw new Error(`Expected one kanji character, received: ${kanji}`);
  }
}

function canonicalizeObject(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeObject);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const canonical = {};

  for (const key of Object.keys(value).sort()) {
    canonical[key] = canonicalizeObject(value[key]);
  }

  return canonical;
}

function serializeCanonicalJson(value) {
  return JSON.stringify(canonicalizeObject(value));
}

function calculateSha256(value) {
  const content =
    typeof value === "string" ? value : serializeCanonicalJson(value);

  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeRequiredKanjiSources(sourceGroups) {
  const reasonsByKanji = new Map();

  for (const sourceGroup of sourceGroups) {
    const reason = sourceGroup?.reason;
    const kanjis = sourceGroup?.kanjis;

    if (typeof reason !== "string" || reason.trim().length === 0) {
      throw new Error("Each required kanji source must have a reason.");
    }

    if (!Array.isArray(kanjis)) {
      throw new Error(
        `Required kanji source must contain a kanjis array: ${reason}`,
      );
    }

    for (const kanji of kanjis) {
      assertValidKanji(kanji);

      const reasons = reasonsByKanji.get(kanji) ?? new Set();

      reasons.add(reason.trim());
      reasonsByKanji.set(kanji, reasons);
    }
  }

  return new Map(
    sortKanjis([...reasonsByKanji.keys()]).map((kanji) => [
      kanji,
      [...reasonsByKanji.get(kanji)].sort(),
    ]),
  );
}

function normalizeCatalogEntries(catalog) {
  if (catalog === null || catalog === undefined) {
    return {};
  }

  if (typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error("Reference catalog must be a JSON object.");
  }

  const normalized = {};

  for (const kanji of sortKanjis(Object.keys(catalog))) {
    assertValidKanji(kanji);

    const strokes = catalog[kanji];

    if (!Array.isArray(strokes)) {
      throw new Error(`Reference entry must be an array: ${kanji}`);
    }

    normalized[kanji] = strokes;
  }

  return normalized;
}

function isUsableStroke(stroke) {
  return (
    stroke !== null &&
    typeof stroke === "object" &&
    Array.isArray(stroke.x) &&
    Array.isArray(stroke.y) &&
    stroke.x.length >= 2 &&
    stroke.x.length === stroke.y.length &&
    stroke.x.every(Number.isFinite) &&
    stroke.y.every(Number.isFinite)
  );
}

function validateReferenceEntry({ kanji, strokes }) {
  const errors = [];

  if (!Array.isArray(strokes)) {
    errors.push("strokes_not_array");
  } else if (strokes.length === 0) {
    errors.push("strokes_empty");
  } else {
    for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
      if (!isUsableStroke(strokes[strokeIndex])) {
        errors.push(`invalid_stroke_${strokeIndex}`);
      }
    }
  }

  return {
    kanji,
    valid: errors.length === 0,
    strokeCount: Array.isArray(strokes) ? strokes.length : 0,
    errors,
  };
}

function buildIncrementalCatalog({
  existingCatalog = {},
  requiredSources,
  buildEntry,
}) {
  if (typeof buildEntry !== "function") {
    throw new Error("buildEntry must be a function.");
  }

  const normalizedExisting = normalizeCatalogEntries(existingCatalog);

  const reasonsByKanji = normalizeRequiredKanjiSources(requiredSources);

  const requiredKanjis = [...reasonsByKanji.keys()];

  const existingKanjis = Object.keys(normalizedExisting);

  const generatedKanjis = [];
  const preservedKanjis = [];
  const entries = {
    ...normalizedExisting,
  };

  const generationDetails = {};

  for (const kanji of requiredKanjis) {
    if (Object.hasOwn(entries, kanji)) {
      preservedKanjis.push(kanji);

      generationDetails[kanji] = {
        action: "preserved",
        reasons: reasonsByKanji.get(kanji),
      };

      continue;
    }

    const result = buildEntry(kanji);

    if (!result || !Array.isArray(result.strokes)) {
      throw new Error(
        `Reference generator returned an invalid result for ${kanji}.`,
      );
    }

    const validation = validateReferenceEntry({
      kanji,
      strokes: result.strokes,
    });

    if (!validation.valid) {
      throw new Error(
        `Generated reference is invalid for ${kanji}: ${validation.errors.join(", ")}`,
      );
    }

    entries[kanji] = result.strokes;
    generatedKanjis.push(kanji);

    generationDetails[kanji] = {
      action: "generated",
      reasons: reasonsByKanji.get(kanji),
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      originalPathCount: result.originalPathCount ?? null,
      usefulStrokeCount: result.usefulStrokeCount ?? result.strokes.length,
    };
  }

  const orderedEntries = {};

  for (const kanji of sortKanjis(Object.keys(entries))) {
    orderedEntries[kanji] = entries[kanji];
  }

  return {
    catalog: orderedEntries,
    requiredKanjis,
    generatedKanjis: sortKanjis(generatedKanjis),
    preservedKanjis: sortKanjis(preservedKanjis),
    generationDetails,
  };
}

function buildReferenceCatalogManifest({
  catalog,
  updateResult,
  generatedAt,
  sourceDirectory,
  generatorFile,
  generatorSha256,
  sourceSvgSha256ByKanji = {},
}) {
  const normalizedCatalog = normalizeCatalogEntries(catalog);

  const entries = {};

  for (const kanji of Object.keys(normalizedCatalog)) {
    const strokes = normalizedCatalog[kanji];

    const validation = validateReferenceEntry({
      kanji,
      strokes,
    });

    if (!validation.valid) {
      throw new Error(
        `Cannot create manifest for invalid reference ${kanji}: ${validation.errors.join(", ")}`,
      );
    }

    entries[kanji] = {
      strokeCount: validation.strokeCount,
      entrySha256: calculateSha256(strokes),
      sourceSvgSha256: sourceSvgSha256ByKanji[kanji] ?? null,
      reasons: updateResult?.generationDetails?.[kanji]?.reasons ?? [],
      action: updateResult?.generationDetails?.[kanji]?.action ?? "existing",
      warningCount: updateResult?.generationDetails?.[kanji]?.warningCount ?? 0,
    };
  }

  return {
    schemaVersion: REFERENCE_MANIFEST_SCHEMA_VERSION,
    generatedAt,
    generator: {
      version: REFERENCE_GENERATOR_VERSION,
      file: generatorFile,
      sha256: generatorSha256,
    },
    source: {
      directory: sourceDirectory,
    },
    catalog: {
      schemaVersion: REFERENCE_CATALOG_SCHEMA_VERSION,
      kanjiCount: Object.keys(normalizedCatalog).length,
      kanjis: Object.keys(normalizedCatalog),
      sha256: calculateSha256(normalizedCatalog),
    },
    update: {
      generatedKanjis: updateResult?.generatedKanjis ?? [],
      preservedKanjis: updateResult?.preservedKanjis ?? [],
    },
    entries,
  };
}

module.exports = {
  REFERENCE_CATALOG_SCHEMA_VERSION,
  REFERENCE_MANIFEST_SCHEMA_VERSION,
  REFERENCE_GENERATOR_VERSION,
  compareKanjis,
  sortKanjis,
  isSingleCharacter,
  assertValidKanji,
  canonicalizeObject,
  serializeCanonicalJson,
  calculateSha256,
  normalizeRequiredKanjiSources,
  normalizeCatalogEntries,
  isUsableStroke,
  validateReferenceEntry,
  buildIncrementalCatalog,
  buildReferenceCatalogManifest,
};

"use strict";

const { sortKanjis } = require("./kanji_reference_catalog");

const SNAPSHOT_DIFF_SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredSampleKey(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Snapshot entry sampleKey is required.");
  }

  return value.trim();
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeDocumentSha256(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(
      "Snapshot entry documentSha256 " + "must be a SHA-256 hash.",
    );
  }

  return value;
}

function normalizeSnapshotEntry(entry) {
  if (!isPlainObject(entry)) {
    throw new TypeError("Snapshot entry must be an object.");
  }

  return {
    sampleKey: normalizeRequiredSampleKey(entry.sampleKey),

    recognitionId: normalizeOptionalString(entry.recognitionId),

    expectedKanji: normalizeOptionalString(entry.expectedKanji),

    documentSha256: normalizeDocumentSha256(entry.documentSha256),
  };
}

function compareSampleKeys(left, right) {
  return left.localeCompare(right, "en", {
    sensitivity: "variant",
  });
}

function normalizeSnapshotEntries(snapshot) {
  if (!isPlainObject(snapshot) || !Array.isArray(snapshot.entries)) {
    throw new Error("Snapshot must contain an entries array.");
  }

  const entries = new Map();

  const normalizedEntries = snapshot.entries
    .map(normalizeSnapshotEntry)
    .sort((left, right) => compareSampleKeys(left.sampleKey, right.sampleKey));

  for (const entry of normalizedEntries) {
    if (entries.has(entry.sampleKey)) {
      throw new Error("Duplicate sampleKey in snapshot: " + entry.sampleKey);
    }

    entries.set(entry.sampleKey, entry);
  }

  return entries;
}

function createCurrentEntry(entry) {
  return {
    sampleKey: entry.sampleKey,
    recognitionId: entry.recognitionId,
    expectedKanji: entry.expectedKanji,
    documentSha256: entry.documentSha256,
  };
}

function createModifiedEntry({ previousEntry, currentEntry }) {
  return {
    sampleKey: currentEntry.sampleKey,
    recognitionId: currentEntry.recognitionId,
    expectedKanji: currentEntry.expectedKanji,
    previousDocumentSha256: previousEntry.documentSha256,
    currentDocumentSha256: currentEntry.documentSha256,
  };
}

function createEmptyKanjiRow(kanji) {
  return {
    kanji,
    new: 0,
    modified: 0,
    unchanged: 0,
    missing: 0,
  };
}

function incrementKanjiCount(rows, kanji, category) {
  const normalizedKanji = normalizeOptionalString(kanji) ?? "UNKNOWN";

  const row = rows.get(normalizedKanji) ?? createEmptyKanjiRow(normalizedKanji);

  row[category]++;

  rows.set(normalizedKanji, row);
}

function buildByKanji({
  newSamples,
  modifiedSamples,
  unchangedSamples,
  missingSamples,
}) {
  const rows = new Map();

  for (const sample of newSamples) {
    incrementKanjiCount(rows, sample.expectedKanji, "new");
  }

  for (const sample of modifiedSamples) {
    incrementKanjiCount(rows, sample.expectedKanji, "modified");
  }

  for (const sample of unchangedSamples) {
    incrementKanjiCount(rows, sample.expectedKanji, "unchanged");
  }

  for (const sample of missingSamples) {
    incrementKanjiCount(rows, sample.expectedKanji, "missing");
  }

  const regularKanjis = [...rows.keys()].filter((kanji) => kanji !== "UNKNOWN");

  const orderedKanjis = sortKanjis(regularKanjis);

  if (rows.has("UNKNOWN")) {
    orderedKanjis.push("UNKNOWN");
  }

  return Object.fromEntries(
    orderedKanjis.map((kanji) => [kanji, rows.get(kanji)]),
  );
}

function compareMongoFeedbackSnapshots({ previousSnapshot, currentSnapshot }) {
  const previousEntries = normalizeSnapshotEntries(previousSnapshot);

  const currentEntries = normalizeSnapshotEntries(currentSnapshot);

  const newSamples = [];
  const modifiedSamples = [];
  const unchangedSamples = [];
  const missingSamples = [];

  for (const [sampleKey, currentEntry] of currentEntries) {
    const previousEntry = previousEntries.get(sampleKey);

    if (!previousEntry) {
      newSamples.push(createCurrentEntry(currentEntry));

      continue;
    }

    if (previousEntry.documentSha256 !== currentEntry.documentSha256) {
      modifiedSamples.push(
        createModifiedEntry({
          previousEntry,
          currentEntry,
        }),
      );

      continue;
    }

    unchangedSamples.push(createCurrentEntry(currentEntry));
  }

  for (const [sampleKey, previousEntry] of previousEntries) {
    if (!currentEntries.has(sampleKey)) {
      missingSamples.push(createCurrentEntry(previousEntry));
    }
  }

  const byKanji = buildByKanji({
    newSamples,
    modifiedSamples,
    unchangedSamples,
    missingSamples,
  });

  return {
    schemaVersion: SNAPSHOT_DIFF_SCHEMA_VERSION,

    counts: {
      previous: previousEntries.size,
      current: currentEntries.size,
      new: newSamples.length,
      modified: modifiedSamples.length,
      unchanged: unchangedSamples.length,
      missing: missingSamples.length,
    },

    byKanji,
    newSamples,
    modifiedSamples,
    unchangedSamples,
    missingSamples,
  };
}

module.exports = {
  SNAPSHOT_DIFF_SCHEMA_VERSION,
  SHA256_PATTERN,
  isPlainObject,
  normalizeRequiredSampleKey,
  normalizeOptionalString,
  normalizeDocumentSha256,
  normalizeSnapshotEntry,
  compareSampleKeys,
  normalizeSnapshotEntries,
  createCurrentEntry,
  createModifiedEntry,
  createEmptyKanjiRow,
  incrementKanjiCount,
  buildByKanji,
  compareMongoFeedbackSnapshots,
};

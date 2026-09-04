"use strict";

const { sortKanjis } = require("./kanji_reference_catalog");

const SNAPSHOT_DIFF_SCHEMA_VERSION = 1;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredRecognitionId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Snapshot entry recognitionId is required.");
  }

  return value.trim();
}

function normalizeSha256(value) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error("Snapshot entry sha256 must be a SHA-256 hash.");
  }

  return value;
}

function normalizeSnapshotEntry(entry) {
  if (!isPlainObject(entry)) {
    throw new TypeError("Snapshot entry must be an object.");
  }

  return {
    recognitionId: normalizeRequiredRecognitionId(entry.recognitionId),

    expectedKanji:
      typeof entry.expectedKanji === "string" &&
      entry.expectedKanji.trim().length > 0
        ? entry.expectedKanji.trim()
        : null,

    classification:
      typeof entry.classification === "string" &&
      entry.classification.trim().length > 0
        ? entry.classification.trim()
        : null,

    sha256: normalizeSha256(entry.sha256),
  };
}

function compareRecognitionIds(left, right) {
  return left.localeCompare(right, "en", {
    sensitivity: "variant",
  });
}

function normalizeSnapshotEntries(snapshot) {
  if (!isPlainObject(snapshot) || !Array.isArray(snapshot.samples)) {
    throw new Error("Snapshot must contain a samples array.");
  }

  const entries = new Map();

  const normalizedEntries = snapshot.samples
    .map(normalizeSnapshotEntry)
    .sort((left, right) =>
      compareRecognitionIds(left.recognitionId, right.recognitionId),
    );

  for (const entry of normalizedEntries) {
    if (entries.has(entry.recognitionId)) {
      throw new Error(
        "Duplicate recognitionId in snapshot: " + entry.recognitionId,
      );
    }

    entries.set(entry.recognitionId, entry);
  }

  return entries;
}

function createCurrentEntry(entry) {
  return {
    recognitionId: entry.recognitionId,
    expectedKanji: entry.expectedKanji,
    classification: entry.classification,
    sha256: entry.sha256,
  };
}

function createModifiedEntry({ previousEntry, currentEntry }) {
  return {
    recognitionId: currentEntry.recognitionId,
    expectedKanji: currentEntry.expectedKanji,
    classification: currentEntry.classification,
    previousSha256: previousEntry.sha256,
    currentSha256: currentEntry.sha256,
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
  const normalizedKanji =
    typeof kanji === "string" && kanji.length > 0 ? kanji : "UNKNOWN";

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

  for (const [recognitionId, currentEntry] of currentEntries) {
    const previousEntry = previousEntries.get(recognitionId);

    if (!previousEntry) {
      newSamples.push(createCurrentEntry(currentEntry));
      continue;
    }

    if (previousEntry.sha256 !== currentEntry.sha256) {
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

  for (const [recognitionId, previousEntry] of previousEntries) {
    if (!currentEntries.has(recognitionId)) {
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
  normalizeRequiredRecognitionId,
  normalizeSha256,
  normalizeSnapshotEntry,
  compareRecognitionIds,
  normalizeSnapshotEntries,
  createCurrentEntry,
  createModifiedEntry,
  createEmptyKanjiRow,
  incrementKanjiCount,
  buildByKanji,
  compareMongoFeedbackSnapshots,
};

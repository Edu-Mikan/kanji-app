"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SNAPSHOT_DIFF_SCHEMA_VERSION,
  normalizeSnapshotEntries,
  compareMongoFeedbackSnapshots,
} = require("../../services/mongo_feedback_snapshot_diff");

function createSnapshot(entries) {
  return {
    schemaVersion: 1,
    samples: entries,
  };
}

function createEntry({
  recognitionId,
  sha256,
  expectedKanji = "木",
  classification = "reliable",
}) {
  return {
    recognitionId,
    expectedKanji,
    classification,
    sha256,
  };
}

test("snapshot diff schema version is explicit", () => {
  assert.equal(SNAPSHOT_DIFF_SCHEMA_VERSION, 1);
});

test("normalizeSnapshotEntries creates a recognitionId index", () => {
  const snapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-2",
      sha256: "b".repeat(64),
      expectedKanji: "力",
    }),
    createEntry({
      recognitionId: "sample-1",
      sha256: "a".repeat(64),
      expectedKanji: "木",
    }),
  ]);

  const result = normalizeSnapshotEntries(snapshot);

  assert.deepEqual([...result.keys()], ["sample-1", "sample-2"]);

  assert.equal(result.get("sample-1").expectedKanji, "木");

  assert.equal(result.get("sample-2").expectedKanji, "力");
});

test("normalizeSnapshotEntries rejects a missing samples array", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries({
        schemaVersion: 1,
      }),
    /Snapshot must contain a samples array/,
  );
});

test("normalizeSnapshotEntries rejects an invalid recognitionId", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries(
        createSnapshot([
          createEntry({
            recognitionId: "",
            sha256: "a".repeat(64),
          }),
        ]),
      ),
    /Snapshot entry recognitionId is required/,
  );
});

test("normalizeSnapshotEntries rejects an invalid SHA-256", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries(
        createSnapshot([
          createEntry({
            recognitionId: "sample-1",
            sha256: "not-a-hash",
          }),
        ]),
      ),
    /Snapshot entry sha256 must be a SHA-256 hash/,
  );
});

test("normalizeSnapshotEntries rejects duplicate recognitionIds", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries(
        createSnapshot([
          createEntry({
            recognitionId: "sample-1",
            sha256: "a".repeat(64),
          }),
          createEntry({
            recognitionId: "sample-1",
            sha256: "b".repeat(64),
          }),
        ]),
      ),
    /Duplicate recognitionId in snapshot: sample-1/,
  );
});

test("compareMongoFeedbackSnapshots detects a new sample", () => {
  const previousSnapshot = createSnapshot([]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-new",
      sha256: "a".repeat(64),
      expectedKanji: "力",
    }),
  ]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.equal(result.counts.new, 1);
  assert.equal(result.counts.modified, 0);
  assert.equal(result.counts.unchanged, 0);
  assert.equal(result.counts.missing, 0);

  assert.deepEqual(result.newSamples, [
    {
      recognitionId: "sample-new",
      expectedKanji: "力",
      classification: "reliable",
      sha256: "a".repeat(64),
    },
  ]);
});

test("compareMongoFeedbackSnapshots detects a modified sample", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-1",
      sha256: "a".repeat(64),
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-1",
      sha256: "b".repeat(64),
    }),
  ]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.equal(result.counts.modified, 1);

  assert.deepEqual(result.modifiedSamples, [
    {
      recognitionId: "sample-1",
      expectedKanji: "木",
      classification: "reliable",
      previousSha256: "a".repeat(64),
      currentSha256: "b".repeat(64),
    },
  ]);
});

test("compareMongoFeedbackSnapshots detects an unchanged sample", () => {
  const hash = "a".repeat(64);

  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-1",
      sha256: hash,
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-1",
      sha256: hash,
    }),
  ]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.equal(result.counts.unchanged, 1);

  assert.deepEqual(result.unchangedSamples, [
    {
      recognitionId: "sample-1",
      expectedKanji: "木",
      classification: "reliable",
      sha256: hash,
    },
  ]);
});

test("compareMongoFeedbackSnapshots detects a missing sample", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-missing",
      sha256: "a".repeat(64),
      expectedKanji: "力",
    }),
  ]);

  const currentSnapshot = createSnapshot([]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.equal(result.counts.missing, 1);

  assert.deepEqual(result.missingSamples, [
    {
      recognitionId: "sample-missing",
      expectedKanji: "力",
      classification: "reliable",
      sha256: "a".repeat(64),
    },
  ]);
});

test("snapshot comparison returns deterministic ordering", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-z",
      sha256: "a".repeat(64),
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-b",
      sha256: "b".repeat(64),
    }),
    createEntry({
      recognitionId: "sample-a",
      sha256: "c".repeat(64),
    }),
    createEntry({
      recognitionId: "sample-z",
      sha256: "d".repeat(64),
    }),
  ]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.deepEqual(
    result.newSamples.map((sample) => sample.recognitionId),
    ["sample-a", "sample-b"],
  );

  assert.deepEqual(
    result.modifiedSamples.map((sample) => sample.recognitionId),
    ["sample-z"],
  );
});

test("snapshot comparison groups changes by kanji", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "tree-modified",
      expectedKanji: "木",
      sha256: "a".repeat(64),
    }),
    createEntry({
      recognitionId: "force-missing",
      expectedKanji: "力",
      sha256: "b".repeat(64),
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "tree-modified",
      expectedKanji: "木",
      sha256: "c".repeat(64),
    }),
    createEntry({
      recognitionId: "tree-new",
      expectedKanji: "木",
      sha256: "d".repeat(64),
    }),
  ]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.deepEqual(Object.keys(result.byKanji), ["力", "木"]);

  assert.deepEqual(result.byKanji.力, {
    kanji: "力",
    new: 0,
    modified: 0,
    unchanged: 0,
    missing: 1,
  });

  assert.deepEqual(result.byKanji.木, {
    kanji: "木",
    new: 1,
    modified: 1,
    unchanged: 0,
    missing: 0,
  });
});

test("snapshot comparison satisfies total invariants", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "unchanged",
      sha256: "a".repeat(64),
    }),
    createEntry({
      recognitionId: "modified",
      sha256: "b".repeat(64),
    }),
    createEntry({
      recognitionId: "missing",
      sha256: "c".repeat(64),
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "unchanged",
      sha256: "a".repeat(64),
    }),
    createEntry({
      recognitionId: "modified",
      sha256: "d".repeat(64),
    }),
    createEntry({
      recognitionId: "new",
      sha256: "e".repeat(64),
    }),
  ]);

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.deepEqual(result.counts, {
    previous: 3,
    current: 3,
    new: 1,
    modified: 1,
    unchanged: 1,
    missing: 1,
  });

  assert.equal(
    result.counts.current,
    result.counts.new + result.counts.modified + result.counts.unchanged,
  );

  assert.equal(
    result.counts.previous,
    result.counts.missing + result.counts.modified + result.counts.unchanged,
  );
});

test("snapshot comparison does not mutate either snapshot", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-1",
      sha256: "a".repeat(64),
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      recognitionId: "sample-1",
      sha256: "b".repeat(64),
    }),
  ]);

  const previousBefore = JSON.stringify(previousSnapshot);

  const currentBefore = JSON.stringify(currentSnapshot);

  compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.equal(JSON.stringify(previousSnapshot), previousBefore);

  assert.equal(JSON.stringify(currentSnapshot), currentBefore);
});

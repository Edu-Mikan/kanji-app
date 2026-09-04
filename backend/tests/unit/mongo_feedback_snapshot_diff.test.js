"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMongoFeedbackSnapshot,
} = require("../../services/mongo_feedback_snapshot");

const {
  SNAPSHOT_DIFF_SCHEMA_VERSION,
  normalizeSnapshotEntries,
  compareMongoFeedbackSnapshots,
} = require("../../services/mongo_feedback_snapshot_diff");

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);

function createSnapshot(entries) {
  return {
    schemaVersion: 1,
    entries,
  };
}

function createEntry({
  sampleKey,
  recognitionId = null,
  expectedKanji = "木",
  documentSha256,
}) {
  return {
    sampleKey,
    recognitionId,
    expectedKanji,
    documentSha256,
  };
}

test("snapshot diff schema version is explicit", () => {
  assert.equal(SNAPSHOT_DIFF_SCHEMA_VERSION, 1);
});

test("normalizeSnapshotEntries creates a sampleKey index", () => {
  const snapshot = createSnapshot([
    createEntry({
      sampleKey: "recognition:sample-2",
      recognitionId: "sample-2",
      expectedKanji: "力",
      documentSha256: HASH_B,
    }),
    createEntry({
      sampleKey: "recognition:sample-1",
      recognitionId: "sample-1",
      expectedKanji: "木",
      documentSha256: HASH_A,
    }),
  ]);

  const result = normalizeSnapshotEntries(snapshot);

  assert.deepEqual(
    [...result.keys()],
    ["recognition:sample-1", "recognition:sample-2"],
  );

  assert.equal(result.get("recognition:sample-1").expectedKanji, "木");

  assert.equal(result.get("recognition:sample-2").expectedKanji, "力");
});

test("normalizeSnapshotEntries rejects a missing entries array", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries({
        schemaVersion: 1,
      }),
    /Snapshot must contain an entries array/,
  );
});

test("normalizeSnapshotEntries rejects an invalid sampleKey", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries(
        createSnapshot([
          createEntry({
            sampleKey: "",
            documentSha256: HASH_A,
          }),
        ]),
      ),
    /Snapshot entry sampleKey is required/,
  );
});

test("normalizeSnapshotEntries rejects an invalid document SHA-256", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries(
        createSnapshot([
          createEntry({
            sampleKey: "recognition:sample-1",
            documentSha256: "not-a-hash",
          }),
        ]),
      ),
    /documentSha256 must be a SHA-256 hash/,
  );
});

test("normalizeSnapshotEntries rejects duplicate sampleKeys", () => {
  assert.throws(
    () =>
      normalizeSnapshotEntries(
        createSnapshot([
          createEntry({
            sampleKey: "recognition:sample-1",
            documentSha256: HASH_A,
          }),
          createEntry({
            sampleKey: "recognition:sample-1",
            documentSha256: HASH_B,
          }),
        ]),
      ),
    /Duplicate sampleKey in snapshot: recognition:sample-1/,
  );
});

test("compareMongoFeedbackSnapshots detects a new entry", () => {
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([]),
    currentSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:sample-new",
        recognitionId: "sample-new",
        expectedKanji: "力",
        documentSha256: HASH_A,
      }),
    ]),
  });

  assert.deepEqual(result.counts, {
    previous: 0,
    current: 1,
    new: 1,
    modified: 0,
    unchanged: 0,
    missing: 0,
  });

  assert.deepEqual(result.newSamples, [
    {
      sampleKey: "recognition:sample-new",
      recognitionId: "sample-new",
      expectedKanji: "力",
      documentSha256: HASH_A,
    },
  ]);
});

test("compareMongoFeedbackSnapshots detects a modified entry", () => {
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:sample-1",
        recognitionId: "sample-1",
        documentSha256: HASH_A,
      }),
    ]),
    currentSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:sample-1",
        recognitionId: "sample-1",
        documentSha256: HASH_B,
      }),
    ]),
  });

  assert.equal(result.counts.modified, 1);

  assert.deepEqual(result.modifiedSamples, [
    {
      sampleKey: "recognition:sample-1",
      recognitionId: "sample-1",
      expectedKanji: "木",
      previousDocumentSha256: HASH_A,
      currentDocumentSha256: HASH_B,
    },
  ]);
});

test("compareMongoFeedbackSnapshots detects an unchanged entry", () => {
  const entry = createEntry({
    sampleKey: "recognition:sample-1",
    recognitionId: "sample-1",
    documentSha256: HASH_A,
  });

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([entry]),
    currentSnapshot: createSnapshot([entry]),
  });

  assert.equal(result.counts.unchanged, 1);

  assert.deepEqual(result.unchangedSamples, [
    {
      sampleKey: "recognition:sample-1",
      recognitionId: "sample-1",
      expectedKanji: "木",
      documentSha256: HASH_A,
    },
  ]);
});

test("compareMongoFeedbackSnapshots detects a missing entry", () => {
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:sample-missing",
        recognitionId: "sample-missing",
        expectedKanji: "力",
        documentSha256: HASH_A,
      }),
    ]),
    currentSnapshot: createSnapshot([]),
  });

  assert.equal(result.counts.missing, 1);

  assert.deepEqual(result.missingSamples, [
    {
      sampleKey: "recognition:sample-missing",
      recognitionId: "sample-missing",
      expectedKanji: "力",
      documentSha256: HASH_A,
    },
  ]);
});

test("comparison supports MongoDB fallback sample keys", () => {
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([]),
    currentSnapshot: createSnapshot([
      createEntry({
        sampleKey: "mongo:507f1f77bcf86cd799439011",
        recognitionId: null,
        expectedKanji: "木",
        documentSha256: HASH_A,
      }),
    ]),
  });

  assert.equal(result.counts.new, 1);

  assert.equal(
    result.newSamples[0].sampleKey,
    "mongo:507f1f77bcf86cd799439011",
  );

  assert.equal(result.newSamples[0].recognitionId, null);
});

test("snapshot comparison returns deterministic ordering", () => {
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:sample-z",
        recognitionId: "sample-z",
        documentSha256: HASH_A,
      }),
    ]),
    currentSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:sample-b",
        recognitionId: "sample-b",
        documentSha256: HASH_B,
      }),
      createEntry({
        sampleKey: "recognition:sample-a",
        recognitionId: "sample-a",
        documentSha256: HASH_C,
      }),
      createEntry({
        sampleKey: "recognition:sample-z",
        recognitionId: "sample-z",
        documentSha256: HASH_D,
      }),
    ]),
  });

  assert.deepEqual(
    result.newSamples.map((sample) => sample.sampleKey),
    ["recognition:sample-a", "recognition:sample-b"],
  );

  assert.deepEqual(
    result.modifiedSamples.map((sample) => sample.sampleKey),
    ["recognition:sample-z"],
  );
});

test("snapshot comparison groups changes by kanji", () => {
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:tree-modified",
        recognitionId: "tree-modified",
        expectedKanji: "木",
        documentSha256: HASH_A,
      }),
      createEntry({
        sampleKey: "recognition:force-missing",
        recognitionId: "force-missing",
        expectedKanji: "力",
        documentSha256: HASH_B,
      }),
    ]),
    currentSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:tree-modified",
        recognitionId: "tree-modified",
        expectedKanji: "木",
        documentSha256: HASH_C,
      }),
      createEntry({
        sampleKey: "recognition:tree-new",
        recognitionId: "tree-new",
        expectedKanji: "木",
        documentSha256: HASH_D,
      }),
    ]),
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
  const result = compareMongoFeedbackSnapshots({
    previousSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:unchanged",
        documentSha256: HASH_A,
      }),
      createEntry({
        sampleKey: "recognition:modified",
        documentSha256: HASH_B,
      }),
      createEntry({
        sampleKey: "recognition:missing",
        documentSha256: HASH_C,
      }),
    ]),
    currentSnapshot: createSnapshot([
      createEntry({
        sampleKey: "recognition:unchanged",
        documentSha256: HASH_A,
      }),
      createEntry({
        sampleKey: "recognition:modified",
        documentSha256: HASH_D,
      }),
      createEntry({
        sampleKey: "recognition:new",
        documentSha256: HASH_E,
      }),
    ]),
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

test("comparison accepts snapshots built by the real constructor", () => {
  const catalogSha256 = "1".repeat(64);
  const manifestSha256 = "2".repeat(64);

  const previousSnapshot = buildMongoFeedbackSnapshot({
    documents: [
      {
        _id: "mongo-id-1",
        recognitionId: "sample-1",
        expectedKanji: "木",
        isCorrect: true,
        source: "test_screen",
      },
    ],
    catalogSha256,
    manifestSha256,
    generatedAt: "2026-09-04T10:00:00.000Z",
  });

  const currentSnapshot = buildMongoFeedbackSnapshot({
    documents: [
      {
        _id: "mongo-id-1",
        recognitionId: "sample-1",
        expectedKanji: "木",
        isCorrect: false,
        source: "test_screen",
      },
      {
        _id: "mongo-id-2",
        recognitionId: "sample-2",
        expectedKanji: "力",
        isCorrect: true,
        source: "test_screen",
      },
    ],
    catalogSha256,
    manifestSha256,
    generatedAt: "2026-09-04T11:00:00.000Z",
  });

  const result = compareMongoFeedbackSnapshots({
    previousSnapshot,
    currentSnapshot,
  });

  assert.equal(result.counts.previous, 1);
  assert.equal(result.counts.current, 2);
  assert.equal(result.counts.new, 1);
  assert.equal(result.counts.modified, 1);
  assert.equal(result.counts.unchanged, 0);
  assert.equal(result.counts.missing, 0);

  assert.equal(result.newSamples[0].sampleKey, "recognition:sample-2");

  assert.equal(result.modifiedSamples[0].sampleKey, "recognition:sample-1");
});

test("snapshot comparison does not mutate either snapshot", () => {
  const previousSnapshot = createSnapshot([
    createEntry({
      sampleKey: "recognition:sample-1",
      recognitionId: "sample-1",
      documentSha256: HASH_A,
    }),
  ]);

  const currentSnapshot = createSnapshot([
    createEntry({
      sampleKey: "recognition:sample-1",
      recognitionId: "sample-1",
      documentSha256: HASH_B,
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

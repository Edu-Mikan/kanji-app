"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_HASH_ALGORITHM,
  normalizeSnapshotValue,
  buildSnapshotDocument,
  buildSnapshotSampleKey,
  buildSnapshotEntry,
  buildMongoFeedbackSnapshot,
} = require("../../services/mongo_feedback_snapshot");

function createStroke() {
  return {
    x: [0, 0.5, 1],
    y: [0, 0.5, 1],
  };
}

function createGeometry() {
  return {
    bboxWidth: 1,
    bboxHeight: 1,
    aspectRatio: 1,
    perStroke: [
      {
        index: 0,
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1,
        width: 1,
        height: 1,
      },
    ],
  };
}

function createDocument(overrides = {}) {
  return {
    _id: "mongo-id-1",
    schemaVersion: 1,
    recognitionId: "recognition-id-1",
    kanji: "木",
    expectedKanji: "木",
    isCorrect: true,
    source: "test_screen",
    feedbackType: "manual_debug",
    datasetReviewStatus: "pending",
    datasetReviewedAt: null,
    exclusionReason: null,
    features: {
      geometry: createGeometry(),
    },
    strokesNormalized: [createStroke()],
    algorithmVersion: "heuristic-v2",
    createdAt: "2026-08-26T08:00:00.000Z",
    updatedAt: null,
    labelUpdatedAt: null,
    ...overrides,
  };
}

function createSnapshotOptions(overrides = {}) {
  return {
    generatedAt: "2026-08-26T10:00:00.000Z",
    catalogSha256: "catalog-sha256",
    manifestSha256: "manifest-sha256",
    ...overrides,
  };
}

test("snapshot constants expose a versioned SHA-256 contract", () => {
  assert.equal(SNAPSHOT_SCHEMA_VERSION, 1);
  assert.equal(SNAPSHOT_HASH_ALGORITHM, "sha256");
});

test("normalizeSnapshotValue converts dates and identifier objects", () => {
  const date = new Date("2026-08-26T08:00:00.000Z");

  const identifier = {
    toHexString() {
      return "507f1f77bcf86cd799439011";
    },
  };

  assert.equal(normalizeSnapshotValue(date), "2026-08-26T08:00:00.000Z");

  assert.equal(normalizeSnapshotValue(identifier), "507f1f77bcf86cd799439011");
});

test("normalizeSnapshotValue sorts object keys recursively", () => {
  const result = normalizeSnapshotValue({
    z: 1,
    nested: {
      y: 2,
      a: 3,
    },
    a: 4,
  });

  assert.deepEqual(result, {
    a: 4,
    nested: {
      a: 3,
      y: 2,
    },
    z: 1,
  });
});

test("buildSnapshotDocument selects only relevant projected fields", () => {
  const document = createDocument({
    userId: "must-not-be-included",
    sessionId: "must-not-be-included",
    clientInfo: {
      device: "must-not-be-included",
    },
    reviewDevice: {
      tokenId: "must-not-be-included",
    },
  });

  const result = buildSnapshotDocument(document);

  assert.equal(result.recognitionId, "recognition-id-1");
  assert.equal(result.expectedKanji, "木");
  assert.equal(result.isCorrect, true);
  assert.deepEqual(result.features.geometry, createGeometry());
  assert.deepEqual(result.strokesNormalized, [createStroke()]);

  assert.equal(Object.hasOwn(result, "userId"), false);

  assert.equal(Object.hasOwn(result, "sessionId"), false);

  assert.equal(Object.hasOwn(result, "clientInfo"), false);

  assert.equal(Object.hasOwn(result, "reviewDevice"), false);
});

test("buildSnapshotSampleKey prefers recognitionId", () => {
  assert.equal(
    buildSnapshotSampleKey(
      createDocument({
        _id: "mongo-id-1",
        recognitionId: " recognition-id-1 ",
      }),
    ),
    "recognition:recognition-id-1",
  );
});

test("buildSnapshotSampleKey falls back to MongoDB id", () => {
  assert.equal(
    buildSnapshotSampleKey(
      createDocument({
        _id: "mongo-id-1",
        recognitionId: " ",
      }),
    ),
    "mongo:mongo-id-1",
  );
});

test("buildSnapshotSampleKey rejects a document without stable identity", () => {
  assert.throws(
    () =>
      buildSnapshotSampleKey(
        createDocument({
          _id: null,
          recognitionId: null,
        }),
      ),
    /stable recognitionId or MongoDB _id/,
  );
});

test("buildSnapshotEntry creates a stable document hash", () => {
  const first = buildSnapshotEntry(createDocument());

  const second = buildSnapshotEntry(createDocument());

  assert.equal(first.sampleKey, "recognition:recognition-id-1");
  assert.equal(first.recognitionId, "recognition-id-1");
  assert.equal(first.expectedKanji, "木");
  assert.equal(first.documentSha256, second.documentSha256);
  assert.match(first.documentSha256, /^[a-f0-9]{64}$/);
});

test("changing a relevant field changes the document hash", () => {
  const first = buildSnapshotEntry(
    createDocument({
      isCorrect: true,
    }),
  );

  const second = buildSnapshotEntry(
    createDocument({
      isCorrect: false,
    }),
  );

  assert.notEqual(first.documentSha256, second.documentSha256);
});

test("changing geometry changes the document hash", () => {
  const first = buildSnapshotEntry(createDocument());

  const second = buildSnapshotEntry(
    createDocument({
      features: {
        geometry: {
          ...createGeometry(),
          bboxWidth: 0.75,
        },
      },
    }),
  );

  assert.notEqual(first.documentSha256, second.documentSha256);
});

test("irrelevant fields do not change the document hash", () => {
  const first = buildSnapshotEntry(createDocument());

  const second = buildSnapshotEntry(
    createDocument({
      userId: "user-1",
      sessionId: "session-1",
      clientInfo: {
        platform: "test",
      },
      reviewDevice: {
        tokenId: "secret-adjacent-value",
      },
    }),
  );

  assert.equal(first.documentSha256, second.documentSha256);
});

test("buildMongoFeedbackSnapshot orders entries deterministically", () => {
  const documents = [
    createDocument({
      _id: "mongo-id-2",
      recognitionId: "recognition-z",
      expectedKanji: "力",
      kanji: "力",
    }),

    createDocument({
      _id: "mongo-id-1",
      recognitionId: "recognition-a",
      expectedKanji: "木",
      kanji: "木",
    }),
  ];

  const snapshot = buildMongoFeedbackSnapshot({
    documents,
    ...createSnapshotOptions(),
  });

  assert.deepEqual(
    snapshot.entries.map((entry) => entry.sampleKey),
    ["recognition:recognition-a", "recognition:recognition-z"],
  );
});

test("snapshot hash is independent from generatedAt", () => {
  const documents = [createDocument()];

  const first = buildMongoFeedbackSnapshot({
    documents,
    ...createSnapshotOptions({
      generatedAt: "2026-08-26T10:00:00.000Z",
    }),
  });

  const second = buildMongoFeedbackSnapshot({
    documents,
    ...createSnapshotOptions({
      generatedAt: "2026-08-27T10:00:00.000Z",
    }),
  });

  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.equal(first.snapshotSha256, second.snapshotSha256);
});

test("snapshot hash changes when the catalog hash changes", () => {
  const documents = [createDocument()];

  const first = buildMongoFeedbackSnapshot({
    documents,
    ...createSnapshotOptions({
      catalogSha256: "catalog-sha256-a",
    }),
  });

  const second = buildMongoFeedbackSnapshot({
    documents,
    ...createSnapshotOptions({
      catalogSha256: "catalog-sha256-b",
    }),
  });

  assert.notEqual(first.snapshotSha256, second.snapshotSha256);
});

test("snapshot totals and hashes are reproducible", () => {
  const documents = [
    createDocument({
      recognitionId: "recognition-b",
    }),
    createDocument({
      _id: "mongo-id-2",
      recognitionId: "recognition-a",
      expectedKanji: "力",
      kanji: "力",
    }),
  ];

  const first = buildMongoFeedbackSnapshot({
    documents,
    ...createSnapshotOptions(),
  });

  const second = buildMongoFeedbackSnapshot({
    documents: [...documents].reverse(),
    ...createSnapshotOptions(),
  });

  assert.equal(first.documentCount, 2);
  assert.equal(first.entryCount, 2);
  assert.equal(first.hashAlgorithm, "sha256");
  assert.match(first.snapshotSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.entries, second.entries);
  assert.equal(first.snapshotSha256, second.snapshotSha256);
});

test("snapshot rejects duplicate stable sample keys", () => {
  const documents = [
    createDocument({
      _id: "mongo-id-1",
      recognitionId: "duplicate-id",
    }),

    createDocument({
      _id: "mongo-id-2",
      recognitionId: "duplicate-id",
    }),
  ];

  assert.throws(
    () =>
      buildMongoFeedbackSnapshot({
        documents,
        ...createSnapshotOptions(),
      }),
    /Duplicate snapshot sample key: recognition:duplicate-id/,
  );
});

test("snapshot rejects invalid input and missing hashes", () => {
  assert.throws(
    () =>
      buildMongoFeedbackSnapshot({
        documents: null,
        ...createSnapshotOptions(),
      }),
    /documents must be an array/,
  );

  assert.throws(
    () =>
      buildMongoFeedbackSnapshot({
        documents: [],
        ...createSnapshotOptions({
          catalogSha256: "",
        }),
      }),
    /catalogSha256 is required/,
  );

  assert.throws(
    () =>
      buildMongoFeedbackSnapshot({
        documents: [],
        ...createSnapshotOptions({
          manifestSha256: "",
        }),
      }),
    /manifestSha256 is required/,
  );
});

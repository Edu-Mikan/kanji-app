"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DB_NAME,
  DEFAULT_COLLECTION_NAME,
  DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  buildFeedbackInspectionProjection,
  loadFeedbackDocuments,
  readMongoFeedbackDocuments,
} = require("../../services/mongo_feedback_reader");

function createFakeReadOnlyCollection({ documents = [] } = {}) {
  const calls = {
    findFilter: null,
    findOptions: null,
    sort: null,
    toArrayCount: 0,
  };

  const cursor = {
    sort(value) {
      calls.sort = value;
      return this;
    },

    async toArray() {
      calls.toArrayCount++;
      return documents;
    },
  };

  const collection = {
    find(filter, options) {
      calls.findFilter = filter;
      calls.findOptions = options;
      return cursor;
    },
  };

  return {
    collection,
    calls,
  };
}

function createFakeMongoClientClass({
  documents = [],
  connectError = null,
  queryError = null,
} = {}) {
  const calls = {
    constructorUri: null,
    constructorOptions: null,
    connectCount: 0,
    closeCount: 0,
    dbName: null,
    collectionName: null,
    findFilter: null,
    findOptions: null,
    sort: null,
  };

  class FakeMongoClient {
    constructor(uri, options) {
      calls.constructorUri = uri;
      calls.constructorOptions = options;
    }

    async connect() {
      calls.connectCount++;

      if (connectError) {
        throw connectError;
      }
    }

    db(dbName) {
      calls.dbName = dbName;

      return {
        collection(collectionName) {
          calls.collectionName = collectionName;

          return {
            find(filter, options) {
              calls.findFilter = filter;
              calls.findOptions = options;

              return {
                sort(value) {
                  calls.sort = value;
                  return this;
                },

                async toArray() {
                  if (queryError) {
                    throw queryError;
                  }

                  return documents;
                },
              };
            },
          };
        },
      };
    }

    async close() {
      calls.closeCount++;
    }
  }

  return {
    MongoClientClass: FakeMongoClient,
    calls,
  };
}

test("reader constants expose the current MongoDB defaults", () => {
  assert.equal(DEFAULT_DB_NAME, "kanji_app");
  assert.equal(DEFAULT_COLLECTION_NAME, "feedback_samples");
  assert.equal(DEFAULT_SERVER_SELECTION_TIMEOUT_MS, 10000);
});

test("buildFeedbackInspectionProjection includes only required fields", () => {
  const projection = buildFeedbackInspectionProjection();

  assert.deepEqual(projection, {
    _id: 1,
    recognitionId: 1,
    kanji: 1,
    expectedKanji: 1,
    isCorrect: 1,
    source: 1,
    feedbackType: 1,
    datasetReviewStatus: 1,
    datasetReviewedAt: 1,
    exclusionReason: 1,
    "features.geometry": 1,
    strokesRaw: 1,
    strokesNormalized: 1,
    strokesResampled: 1,
    strokes: 1,
    schemaVersion: 1,
    algorithmVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    labelUpdatedAt: 1,
  });

  assert.equal(projection.reviewDevice, undefined);
  assert.equal(projection.userId, undefined);
  assert.equal(projection.sessionId, undefined);
  assert.equal(projection.clientInfo, undefined);
});

test("loadFeedbackDocuments performs one projected read", async () => {
  const documents = [
    {
      recognitionId: "recognition-id-1",
      expectedKanji: "木",
    },
  ];

  const { collection, calls } = createFakeReadOnlyCollection({
    documents,
  });

  const result = await loadFeedbackDocuments({
    collection,
  });

  assert.equal(result, documents);
  assert.deepEqual(calls.findFilter, {});
  assert.deepEqual(
    calls.findOptions.projection,
    buildFeedbackInspectionProjection(),
  );
  assert.deepEqual(calls.sort, {
    createdAt: 1,
    _id: 1,
  });
  assert.equal(calls.toArrayCount, 1);
});

test("loadFeedbackDocuments accepts an explicit read filter", async () => {
  const { collection, calls } = createFakeReadOnlyCollection();

  await loadFeedbackDocuments({
    collection,
    filter: {
      expectedKanji: "力",
    },
  });

  assert.deepEqual(calls.findFilter, {
    expectedKanji: "力",
  });
});

test("loadFeedbackDocuments rejects a collection without find", async () => {
  await assert.rejects(
    () =>
      loadFeedbackDocuments({
        collection: {},
      }),
    /MongoDB feedback collection with find is required/,
  );
});

test("loadFeedbackDocuments requires an object filter", async () => {
  const { collection } = createFakeReadOnlyCollection();

  await assert.rejects(
    () =>
      loadFeedbackDocuments({
        collection,
        filter: null,
      }),
    /filter must be a plain object/,
  );

  await assert.rejects(
    () =>
      loadFeedbackDocuments({
        collection,
        filter: [],
      }),
    /filter must be a plain object/,
  );
});

test("loadFeedbackDocuments only requires read capabilities", async () => {
  const { collection } = createFakeReadOnlyCollection({
    documents: [],
  });

  assert.equal(collection.insertOne, undefined);
  assert.equal(collection.updateOne, undefined);
  assert.equal(collection.findOneAndUpdate, undefined);
  assert.equal(collection.deleteOne, undefined);
  assert.equal(collection.bulkWrite, undefined);

  const result = await loadFeedbackDocuments({
    collection,
  });

  assert.deepEqual(result, []);
});

test("readMongoFeedbackDocuments opens, reads and closes MongoDB", async () => {
  const documents = [
    {
      recognitionId: "recognition-id-1",
      expectedKanji: "木",
    },
  ];

  const { MongoClientClass, calls } = createFakeMongoClientClass({
    documents,
  });

  const result = await readMongoFeedbackDocuments({
    mongoUri: "mongodb://example.invalid:27017",
    MongoClientClass,
  });

  assert.equal(result, documents);
  assert.equal(calls.constructorUri, "mongodb://example.invalid:27017");
  assert.deepEqual(calls.constructorOptions, {
    serverSelectionTimeoutMS: 10000,
  });
  assert.equal(calls.connectCount, 1);
  assert.equal(calls.closeCount, 1);
  assert.equal(calls.dbName, "kanji_app");
  assert.equal(calls.collectionName, "feedback_samples");
  assert.deepEqual(calls.findFilter, {});
  assert.deepEqual(calls.sort, {
    createdAt: 1,
    _id: 1,
  });
});

test("readMongoFeedbackDocuments accepts explicit names and timeout", async () => {
  const { MongoClientClass, calls } = createFakeMongoClientClass();

  await readMongoFeedbackDocuments({
    mongoUri: "mongodb://example.invalid:27017",
    dbName: "custom_db",
    collectionName: "custom_feedback",
    serverSelectionTimeoutMS: 2500,
    MongoClientClass,
  });

  assert.equal(calls.dbName, "custom_db");
  assert.equal(calls.collectionName, "custom_feedback");
  assert.deepEqual(calls.constructorOptions, {
    serverSelectionTimeoutMS: 2500,
  });
});

test("readMongoFeedbackDocuments rejects a missing Mongo URI", async () => {
  const { MongoClientClass, calls } = createFakeMongoClientClass();

  await assert.rejects(
    () =>
      readMongoFeedbackDocuments({
        mongoUri: "",
        MongoClientClass,
      }),
    /MongoDB URI is required/,
  );

  assert.equal(calls.connectCount, 0);
  assert.equal(calls.closeCount, 0);
});

test("readMongoFeedbackDocuments validates database and collection names", async () => {
  const { MongoClientClass } = createFakeMongoClientClass();

  await assert.rejects(
    () =>
      readMongoFeedbackDocuments({
        mongoUri: "mongodb://example.invalid:27017",
        dbName: " ",
        MongoClientClass,
      }),
    /MongoDB database name is required/,
  );

  await assert.rejects(
    () =>
      readMongoFeedbackDocuments({
        mongoUri: "mongodb://example.invalid:27017",
        collectionName: "",
        MongoClientClass,
      }),
    /MongoDB collection name is required/,
  );
});

test("readMongoFeedbackDocuments closes the client after a query error", async () => {
  const sensitiveError = new Error("Sensitive MongoDB query details");

  const { MongoClientClass, calls } = createFakeMongoClientClass({
    queryError: sensitiveError,
  });

  await assert.rejects(
    () =>
      readMongoFeedbackDocuments({
        mongoUri: "mongodb://example.invalid:27017",
        MongoClientClass,
      }),
    (error) => error === sensitiveError,
  );

  assert.equal(calls.connectCount, 1);
  assert.equal(calls.closeCount, 1);
});

test("readMongoFeedbackDocuments closes the client after a connect error", async () => {
  const sensitiveError = new Error("Sensitive MongoDB connection details");

  const { MongoClientClass, calls } = createFakeMongoClientClass({
    connectError: sensitiveError,
  });

  await assert.rejects(
    () =>
      readMongoFeedbackDocuments({
        mongoUri: "mongodb://example.invalid:27017",
        MongoClientClass,
      }),
    (error) => error === sensitiveError,
  );

  assert.equal(calls.connectCount, 1);
  assert.equal(calls.closeCount, 1);
});

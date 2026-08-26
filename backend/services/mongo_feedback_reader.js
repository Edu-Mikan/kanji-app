"use strict";

const { MongoClient } = require("mongodb");

const DEFAULT_DB_NAME = "kanji_app";
const DEFAULT_COLLECTION_NAME = "feedback_samples";
const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 10000;

function buildFeedbackInspectionProjection() {
  return {
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
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeRequiredString(value, message) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(message);
  }

  return value.trim();
}

function normalizeServerSelectionTimeout(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      "MongoDB server selection timeout must be a positive integer.",
    );
  }

  return value;
}

async function loadFeedbackDocuments({ collection, filter = {} }) {
  if (!collection || typeof collection.find !== "function") {
    throw new Error("A MongoDB feedback collection with find is required.");
  }

  if (!isPlainObject(filter)) {
    throw new TypeError("filter must be a plain object.");
  }

  return collection
    .find(filter, {
      projection: buildFeedbackInspectionProjection(),
    })
    .sort({
      createdAt: 1,
      _id: 1,
    })
    .toArray();
}

async function readMongoFeedbackDocuments({
  mongoUri,
  dbName = DEFAULT_DB_NAME,
  collectionName = DEFAULT_COLLECTION_NAME,
  serverSelectionTimeoutMS = DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  filter = {},
  MongoClientClass = MongoClient,
}) {
  const normalizedMongoUri = normalizeRequiredString(
    mongoUri,
    "MongoDB URI is required.",
  );

  const normalizedDbName = normalizeRequiredString(
    dbName,
    "MongoDB database name is required.",
  );

  const normalizedCollectionName = normalizeRequiredString(
    collectionName,
    "MongoDB collection name is required.",
  );

  const normalizedTimeout = normalizeServerSelectionTimeout(
    serverSelectionTimeoutMS,
  );

  if (typeof MongoClientClass !== "function") {
    throw new TypeError("MongoClientClass must be a constructor.");
  }

  const client = new MongoClientClass(normalizedMongoUri, {
    serverSelectionTimeoutMS: normalizedTimeout,
  });

  try {
    await client.connect();

    const database = client.db(normalizedDbName);
    const collection = database.collection(normalizedCollectionName);

    return await loadFeedbackDocuments({
      collection,
      filter,
    });
  } finally {
    await client.close();
  }
}

module.exports = {
  DEFAULT_DB_NAME,
  DEFAULT_COLLECTION_NAME,
  DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  buildFeedbackInspectionProjection,
  isPlainObject,
  normalizeRequiredString,
  normalizeServerSelectionTimeout,
  loadFeedbackDocuments,
  readMongoFeedbackDocuments,
};

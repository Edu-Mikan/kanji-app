"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const {
  createFeedbackReviewRouter,
} = require("../../routes/feedback_review_routes");

const {
  buildDeviceToken,
  hashDeviceTokenSecret,
} = require("../../services/review_device_service");

function createReviewDocument({
  id = "mongo-id-1",
  recognitionId = "recognition-id-1",
  expectedKanji = "力",
  isCorrect = false,
  datasetReviewStatus,
} = {}) {
  return {
    _id: {
      toString() {
        return id;
      },
    },

    schemaVersion: 1,

    recognitionId,

    source: "test_screen",

    feedbackType: "manual_debug",

    algorithmVersion: "heuristic-v2",

    kanji: expectedKanji,

    expectedKanji,

    isCorrect,

    datasetReviewStatus,

    strokesNormalized: [
      {
        x: [0, 0.5, 1],

        y: [0, 0.5, 1],
      },
      {
        x: [1, 0],

        y: [0, 1],
      },
    ],

    createdAt: "2026-08-03T20:44:28.401Z",
  };
}

function createFakeCollection({
  total = 1,
  documents = [createReviewDocument()],
  countError = null,
  findError = null,
  aggregateRows = [],
  aggregateError = null,
} = {}) {
  const calls = {
    countFilter: null,
    findFilter: null,
    findOptions: null,
    sort: null,
    skip: null,
    limit: null,
    aggregatePipeline: null,
  };

  const cursor = {
    sort(value) {
      calls.sort = value;

      return this;
    },

    skip(value) {
      calls.skip = value;

      return this;
    },

    limit(value) {
      calls.limit = value;

      return this;
    },

    async toArray() {
      if (findError) {
        throw findError;
      }

      return documents;
    },
  };

  const collection = {
    async countDocuments(filter) {
      calls.countFilter = filter;

      if (countError) {
        throw countError;
      }

      return total;
    },

    find(filter, options) {
      calls.findFilter = filter;

      calls.findOptions = options;

      return cursor;
    },

    aggregate(pipeline) {
      calls.aggregatePipeline = pipeline;

      return {
        async toArray() {
          if (aggregateError) {
            throw aggregateError;
          }

          return aggregateRows;
        },
      };
    },
  };

  return {
    collection,
    calls,
  };
}

async function startTestServer({
  configuredKey = "test-review-key",
  collection,
  deviceCollection = null,
}) {
  const app = express();

  app.use(express.json());

  app.use(
    "/api/review",
    createFeedbackReviewRouter({
      configuredKey,
      getCollection: () => collection,
      getDeviceCollection: () => deviceCollection,
    }),
  );

  const server = http.createServer(app);

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("The test server did not expose a TCP address.");
  }

  return {
    server,

    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestJson({
  baseUrl,
  path,
  method = "GET",
  reviewKey,
  authorization,
  body,
}) {
  const headers = {};

  if (reviewKey !== undefined) {
    headers["X-Review-Key"] = reviewKey;
  }

  if (authorization !== undefined) {
    headers.authorization = authorization;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const responseBody = await response.json();

  return {
    status: response.status,
    body: responseBody,
  };
}

test("GET /api/review/samples rejects requests without a review key", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples?kanji=力",
    });

    assert.equal(response.status, 401);

    assert.equal(response.body.ok, false);

    assert.equal(response.body.error, "review_authorization_required");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples rejects an invalid review key", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples?kanji=力",

      reviewKey: "incorrect-key",
    });

    assert.equal(response.status, 403);

    assert.equal(response.body.error, "review_admin_key_invalid");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples returns 503 when administration is not configured", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    configuredKey: "",
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples?kanji=力",

      reviewKey: "provided-key",
    });

    assert.equal(response.status, 503);

    assert.equal(response.body.error, "review_admin_not_configured");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples returns 503 when MongoDB is unavailable", async () => {
  const { server, baseUrl } = await startTestServer({
    collection: null,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples?kanji=力",

      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 503);

    assert.equal(response.body.error, "review_storage_unavailable");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples requires a kanji", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples",

      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 400);

    assert.equal(response.body.error, "kanji_required");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples rejects an invalid status", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,

      path: "/api/review/samples" + "?kanji=力" + "&status=deleted",

      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 400);

    assert.equal(response.body.error, "invalid_status");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples returns a compact paginated response", async () => {
  const { collection, calls } = createFakeCollection({
    total: 45,

    documents: [
      createReviewDocument({
        recognitionId: "force-sample-1",
        isCorrect: false,
      }),
    ],
  });

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,

      path:
        "/api/review/samples" +
        "?kanji=力" +
        "&status=pending" +
        "&label=incorrect" +
        "&page=2" +
        "&pageSize=20",

      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 200);

    assert.equal(response.body.ok, true);

    assert.equal(response.body.page, 2);

    assert.equal(response.body.pageSize, 20);

    assert.equal(response.body.total, 45);

    assert.equal(response.body.totalPages, 3);

    assert.equal(response.body.hasPreviousPage, true);

    assert.equal(response.body.hasNextPage, true);

    assert.equal(response.body.items.length, 1);

    assert.equal(response.body.items[0].recognitionId, "force-sample-1");

    assert.equal(response.body.items[0].expectedKanji, "力");

    assert.equal(response.body.items[0].isCorrect, false);

    assert.equal(response.body.items[0].datasetReviewStatus, "pending");

    assert.equal(response.body.items[0].strokeCount, 2);

    assert.equal(Object.hasOwn(response.body.items[0], "features"), false);

    assert.equal(calls.skip, 20);

    assert.equal(calls.limit, 20);

    assert.deepEqual(calls.sort, {
      createdAt: -1,
      _id: -1,
    });
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/samples returns 500 without exposing storage errors", async () => {
  const { collection } = createFakeCollection({
    countError: new Error("Sensitive MongoDB failure details"),
  });

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples?kanji=力",
      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 500);
    assert.equal(response.body.error, "review_samples_query_failed");

    assert.equal(
      JSON.stringify(response.body).includes("Sensitive MongoDB"),
      false,
    );
  } finally {
    await stopTestServer(server);
  }
});

function createFakeDeviceCollection({
  expectedTokenId = "device-token-id",
  expectedTokenHash,
  permissions = ["review:read"],
} = {}) {
  return {
    async findOne(query) {
      if (query.tokenId !== expectedTokenId) {
        return null;
      }

      return {
        tokenId: expectedTokenId,
        tokenHash: expectedTokenHash,
        name: "Móvil test",
        permissions,
        revokedAt: null,
        expiresAt: null,
      };
    },

    async updateOne() {
      return {
        matchedCount: 1,
        modifiedCount: 1,
      };
    },
  };
}

test("GET /api/review/samples accepts a valid review device token", async () => {
  const tokenId = "device-token-id";
  const tokenSecret = "device-token-secret";

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const expectedTokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const { collection } = createFakeCollection({
    total: 1,
    documents: [
      createReviewDocument({
        recognitionId: "force-sample-1",
      }),
    ],
  });

  const deviceCollection = createFakeDeviceCollection({
    expectedTokenId: tokenId,
    expectedTokenHash,
  });

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples?kanji=力",
      authorization: `Bearer ${deviceToken}`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.items.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

function createLabelUpdateCollection({
  document = createReviewDocument({
    isCorrect: true,
  }),
} = {}) {
  const calls = [];

  return {
    calls,

    collection: {
      async countDocuments() {
        return 0;
      },

      find() {
        return {
          sort() {
            return this;
          },
          skip() {
            return this;
          },
          limit() {
            return this;
          },
          async toArray() {
            return [];
          },
        };
      },

      async findOneAndUpdate(filter, update, options) {
        calls.push({
          filter,
          update,
          options,
        });

        return document;
      },
    },
  };
}

test("PATCH label rejects requests without device token", async () => {
  const { collection } = createLabelUpdateCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection: createFakeDeviceCollection(),
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples/recognition-id-1/label",
      method: "PATCH",
      body: {
        isCorrect: true,
      },
    });

    assert.equal(response.status, 401);

    assert.equal(response.body.error, "review_authorization_required");
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH label rejects a token without update permission", async () => {
  const tokenId = "device-token-id";

  const tokenSecret = "device-token-secret";

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const expectedTokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const { collection } = createLabelUpdateCollection();

  const deviceCollection = createFakeDeviceCollection({
    expectedTokenId: tokenId,
    expectedTokenHash,
    permissions: ["review:read"],
  });

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples/recognition-id-1/label",
      method: "PATCH",
      authorization: `Bearer ${deviceToken}`,
      body: {
        isCorrect: true,
      },
    });

    assert.equal(response.status, 403);

    assert.equal(response.body.error, "review_device_permission_denied");
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH label rejects a non-boolean value", async () => {
  const tokenId = "device-token-id";

  const tokenSecret = "device-token-secret";

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const expectedTokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const { collection } = createLabelUpdateCollection();

  const deviceCollection = createFakeDeviceCollection({
    expectedTokenId: tokenId,
    expectedTokenHash,
    permissions: ["review:update-label"],
  });

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples/recognition-id-1/label",
      method: "PATCH",
      authorization: `Bearer ${deviceToken}`,
      body: {
        isCorrect: "true",
      },
    });

    assert.equal(response.status, 400);

    assert.equal(response.body.error, "invalid_is_correct");
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH label updates a sample with update permission", async () => {
  const tokenId = "device-token-id";

  const tokenSecret = "device-token-secret";

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const expectedTokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const document = createReviewDocument({
    recognitionId: "recognition-id-1",
    isCorrect: true,
  });

  document.labelUpdatedAt = new Date().toISOString();

  const { collection, calls } = createLabelUpdateCollection({
    document,
  });

  const deviceCollection = createFakeDeviceCollection({
    expectedTokenId: tokenId,
    expectedTokenHash,
    permissions: ["review:update-label"],
  });

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples/recognition-id-1/label",
      method: "PATCH",
      authorization: `Bearer ${deviceToken}`,
      body: {
        isCorrect: true,
      },
    });

    assert.equal(response.status, 200);

    assert.equal(response.body.ok, true);

    assert.equal(response.body.sample.isCorrect, true);

    assert.equal(calls.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

test("PATCH label returns 404 when sample does not exist", async () => {
  const tokenId = "device-token-id";

  const tokenSecret = "device-token-secret";

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const expectedTokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const { collection } = createLabelUpdateCollection({
    document: null,
  });

  const deviceCollection = createFakeDeviceCollection({
    expectedTokenId: tokenId,
    expectedTokenHash,
    permissions: ["review:update-label"],
  });

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/samples/missing-id/label",
      method: "PATCH",
      authorization: `Bearer ${deviceToken}`,
      body: {
        isCorrect: false,
      },
    });

    assert.equal(response.status, 404);

    assert.equal(response.body.error, "review_sample_not_found");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/sample-counts requires authorization", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/sample-counts?kanjis=力,木",
    });

    assert.equal(response.status, 401);

    assert.equal(response.body.error, "review_authorization_required");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/sample-counts requires kanjis", async () => {
  const { collection } = createFakeCollection();

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/sample-counts",
      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 400);

    assert.equal(response.body.error, "kanjis_required");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/sample-counts returns grouped counts and zeros", async () => {
  const { collection, calls } = createFakeCollection({
    aggregateRows: [
      {
        _id: "力",
        count: 12,
      },
      {
        _id: "木",
        count: 69,
      },
    ],
  });

  const tokenId = "device-token-id";

  const tokenSecret = "device-token-secret";

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const expectedTokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const deviceCollection = createFakeDeviceCollection({
    expectedTokenId: tokenId,
    expectedTokenHash,
    permissions: ["review:read"],
  });

  const { server, baseUrl } = await startTestServer({
    collection,
    deviceCollection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/sample-counts?kanjis=力,木,刀",
      authorization: `Bearer ${deviceToken}`,
    });

    assert.equal(response.status, 200);

    assert.equal(response.body.ok, true);

    assert.deepEqual(response.body.counts, {
      力: 12,
      木: 69,
      刀: 0,
    });

    assert.equal(response.body.requestedCount, 3);

    assert.equal(response.body.withSamplesCount, 2);

    assert.equal(response.body.withoutSamplesCount, 1);

    assert.ok(Array.isArray(calls.aggregatePipeline));
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/sample-counts returns 503 when storage is unavailable", async () => {
  const { server, baseUrl } = await startTestServer({
    collection: null,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/sample-counts?kanjis=力",
      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 503);

    assert.equal(response.body.error, "review_storage_unavailable");
  } finally {
    await stopTestServer(server);
  }
});

test("GET /api/review/sample-counts hides storage errors", async () => {
  const { collection } = createFakeCollection({
    aggregateError: new Error("Sensitive aggregation details"),
  });

  const { server, baseUrl } = await startTestServer({
    collection,
  });

  try {
    const response = await requestJson({
      baseUrl,
      path: "/api/review/sample-counts?kanjis=力",
      reviewKey: "test-review-key",
    });

    assert.equal(response.status, 500);

    assert.equal(response.body.error, "review_sample_counts_query_failed");

    assert.equal(
      JSON.stringify(response.body).includes("Sensitive aggregation"),
      false,
    );
  } finally {
    await stopTestServer(server);
  }
});

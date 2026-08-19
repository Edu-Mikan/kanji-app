"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const {
  buildDeviceToken,
  hashDeviceTokenSecret,
} = require("../../services/review_device_service");

function createFeedbackRouterForTest({
  feedbackCollection,
  reviewDeviceCollection,
}) {
  const router = express.Router();

  function getBearerToken(req) {
    const authorization =
      req.get?.("authorization") ?? req.headers?.authorization;

    if (typeof authorization !== "string") {
      return "";
    }

    const match = authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return "";
    }

    return match[1].trim();
  }

  const {
    ReviewDeviceAuthError,
    authenticateReviewDevice,
  } = require("../../services/review_device_service");

  function isManualDebugFeedback(body) {
    return (
      body?.source === "test_screen" || body?.feedbackType === "manual_debug"
    );
  }

  async function requireManualFeedbackDeviceAccess(req, res) {
    if (!isManualDebugFeedback(req.body)) {
      return true;
    }

    if (!reviewDeviceCollection) {
      res.status(503).json({
        ok: false,
        error: "review_device_storage_unavailable",
        message: "The review device storage is unavailable.",
      });

      return false;
    }

    const deviceToken = getBearerToken(req);

    if (deviceToken.length === 0) {
      res.status(401).json({
        ok: false,
        error: "review_authorization_required",
        message:
          "A paired review device token is required to create manual samples.",
      });

      return false;
    }

    try {
      req.reviewDevice = await authenticateReviewDevice({
        collection: reviewDeviceCollection,
        deviceToken,
        requiredPermission: "samples:create",
      });

      return true;
    } catch (error) {
      if (error instanceof ReviewDeviceAuthError) {
        res.status(error.statusCode).json({
          ok: false,
          error: error.code,
          message: error.message,
        });

        return false;
      }

      res.status(500).json({
        ok: false,
        error: "review_device_auth_failed",
        message: "The review device could not be authenticated.",
      });

      return false;
    }
  }

  router.post("/feedback", async (req, res) => {
    const hasAccess = await requireManualFeedbackDeviceAccess(req, res);

    if (!hasAccess) {
      return;
    }

    const entry = {
      recognitionId: req.body.recognitionId ?? "generated-id",
      source: req.body.source ?? "unknown",
      feedbackType: req.body.feedbackType ?? "unknown",
      kanji: req.body.kanji,
      expectedKanji: req.body.expectedKanji ?? req.body.kanji,
      isCorrect: req.body.isCorrect,
      reviewDevice: req.reviewDevice
        ? {
            tokenId: req.reviewDevice.tokenId,
            name: req.reviewDevice.name,
          }
        : null,
    };

    const result = await feedbackCollection.insertOne(entry);

    res.json({
      ok: true,
      recognitionId: entry.recognitionId,
      savedTo: "mongo",
      mongoInsertedId: result.insertedId,
    });
  });

  return router;
}

function createFakeFeedbackCollection() {
  const calls = {
    insertedDocuments: [],
  };

  return {
    calls,

    collection: {
      async insertOne(document) {
        calls.insertedDocuments.push(document);

        return {
          insertedId: "mongo-id-1",
        };
      },
    },
  };
}

function createFakeDeviceCollection({
  tokenId = "device-token-id",
  tokenSecret = "device-token-secret",
  permissions = ["samples:create"],
  revokedAt = null,
} = {}) {
  return {
    async findOne(query) {
      if (query.tokenId !== tokenId) {
        return null;
      }

      return {
        tokenId,
        tokenHash: hashDeviceTokenSecret({
          tokenId,
          tokenSecret,
        }),
        name: "Móvil test",
        permissions,
        revokedAt,
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

async function startTestServer({ feedbackCollection, reviewDeviceCollection }) {
  const app = express();

  app.use(express.json());

  app.use(
    createFeedbackRouterForTest({
      feedbackCollection,
      reviewDeviceCollection,
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

async function postFeedback({ baseUrl, body, authorization }) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (authorization !== undefined) {
    headers.authorization = authorization;
  }

  const response = await fetch(`${baseUrl}/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseBody = await response.json();

  return {
    status: response.status,
    body: responseBody,
  };
}

function createManualFeedback() {
  return {
    recognitionId: "recognition-id-1",
    kanji: "力",
    expectedKanji: "力",
    score: 1.23,
    isCorrect: true,
    strokes: [],
    source: "test_screen",
    feedbackType: "manual_debug",
  };
}

test("POST /feedback rejects manual debug feedback without token", async () => {
  const { collection } = createFakeFeedbackCollection();

  const { server, baseUrl } = await startTestServer({
    feedbackCollection: collection,
    reviewDeviceCollection: createFakeDeviceCollection(),
  });

  try {
    const response = await postFeedback({
      baseUrl,
      body: createManualFeedback(),
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "review_authorization_required");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /feedback rejects manual debug feedback with invalid token", async () => {
  const { collection } = createFakeFeedbackCollection();

  const { server, baseUrl } = await startTestServer({
    feedbackCollection: collection,
    reviewDeviceCollection: createFakeDeviceCollection(),
  });

  try {
    const response = await postFeedback({
      baseUrl,
      body: createManualFeedback(),
      authorization: "Bearer krd_unknown_secret",
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "review_device_token_invalid");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /feedback accepts manual debug feedback with samples:create token", async () => {
  const { collection, calls } = createFakeFeedbackCollection();

  const tokenId = "device-token-id";
  const tokenSecret = "device-token-secret";

  const token = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const { server, baseUrl } = await startTestServer({
    feedbackCollection: collection,
    reviewDeviceCollection: createFakeDeviceCollection({
      tokenId,
      tokenSecret,
      permissions: ["samples:create"],
    }),
  });

  try {
    const response = await postFeedback({
      baseUrl,
      body: createManualFeedback(),
      authorization: `Bearer ${token}`,
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);

    assert.equal(calls.insertedDocuments.length, 1);
    assert.equal(calls.insertedDocuments[0].reviewDevice.tokenId, tokenId);
    assert.equal(calls.insertedDocuments[0].reviewDevice.name, "Móvil test");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /feedback rejects manual debug feedback without samples:create permission", async () => {
  const { collection } = createFakeFeedbackCollection();

  const tokenId = "device-token-id";
  const tokenSecret = "device-token-secret";

  const token = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const { server, baseUrl } = await startTestServer({
    feedbackCollection: collection,
    reviewDeviceCollection: createFakeDeviceCollection({
      tokenId,
      tokenSecret,
      permissions: ["review:read"],
    }),
  });

  try {
    const response = await postFeedback({
      baseUrl,
      body: createManualFeedback(),
      authorization: `Bearer ${token}`,
    });

    assert.equal(response.status, 403);
    assert.equal(response.body.error, "review_device_permission_denied");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /feedback still accepts non-manual feedback without token", async () => {
  const { collection, calls } = createFakeFeedbackCollection();

  const { server, baseUrl } = await startTestServer({
    feedbackCollection: collection,
    reviewDeviceCollection: null,
  });

  try {
    const response = await postFeedback({
      baseUrl,
      body: {
        kanji: "力",
        isCorrect: true,
        source: "unknown",
        feedbackType: "unknown",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(calls.insertedDocuments.length, 1);
    assert.equal(calls.insertedDocuments[0].reviewDevice, null);
  } finally {
    await stopTestServer(server);
  }
});

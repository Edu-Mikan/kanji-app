"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const {
  createFeedbackReviewRouter,
} = require("../../routes/feedback_review_routes");

function createFakeDeviceCollection({ insertError = null } = {}) {
  const calls = {
    insertedDocuments: [],
  };

  const collection = {
    async insertOne(document) {
      if (insertError) {
        throw insertError;
      }

      const insertedId = `device-${calls.insertedDocuments.length + 1}`;

      calls.insertedDocuments.push({
        _id: insertedId,
        ...document,
      });

      return {
        insertedId,
      };
    },
  };

  return {
    collection,
    calls,
  };
}

function createFakeFeedbackCollection() {
  return {
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
  };
}

async function startTestServer({
  configuredKey = "test-review-key",
  deviceCollection,
}) {
  const app = express();

  app.use(express.json());

  app.use(
    "/api/review",
    createFeedbackReviewRouter({
      configuredKey,
      getCollection: () => createFakeFeedbackCollection(),
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

async function postJson({ baseUrl, path, reviewKey, body }) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (reviewKey !== undefined) {
    headers["X-Review-Key"] = reviewKey;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const responseBody = await response.json();

  return {
    status: response.status,
    body: responseBody,
  };
}

test("POST /api/review/devices/pair rejects requests without review key", async () => {
  const { collection } = createFakeDeviceCollection();

  const { server, baseUrl } = await startTestServer({
    deviceCollection: collection,
  });

  try {
    const response = await postJson({
      baseUrl,
      path: "/api/review/devices/pair",
      body: {
        deviceName: "Móvil Eduardo",
      },
    });

    assert.equal(response.status, 401);

    assert.equal(response.body.error, "review_admin_key_required");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/review/devices/pair rejects invalid review key", async () => {
  const { collection } = createFakeDeviceCollection();

  const { server, baseUrl } = await startTestServer({
    deviceCollection: collection,
  });

  try {
    const response = await postJson({
      baseUrl,
      path: "/api/review/devices/pair",
      reviewKey: "invalid-key",
      body: {
        deviceName: "Móvil Eduardo",
      },
    });

    assert.equal(response.status, 403);

    assert.equal(response.body.error, "review_admin_key_invalid");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/review/devices/pair returns 503 when device storage is unavailable", async () => {
  const { server, baseUrl } = await startTestServer({
    deviceCollection: null,
  });

  try {
    const response = await postJson({
      baseUrl,
      path: "/api/review/devices/pair",
      reviewKey: "test-review-key",
      body: {
        deviceName: "Móvil Eduardo",
      },
    });

    assert.equal(response.status, 503);

    assert.equal(response.body.error, "review_device_storage_unavailable");
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/review/devices/pair creates a device token", async () => {
  const { collection, calls } = createFakeDeviceCollection();

  const { server, baseUrl } = await startTestServer({
    deviceCollection: collection,
  });

  try {
    const response = await postJson({
      baseUrl,
      path: "/api/review/devices/pair",
      reviewKey: "test-review-key",
      body: {
        deviceName: "Móvil Eduardo",
      },
    });

    assert.equal(response.status, 201);

    assert.equal(response.body.ok, true);

    assert.equal(response.body.deviceId, "device-1");

    assert.equal(typeof response.body.deviceToken, "string");

    assert.equal(response.body.deviceToken.startsWith("krd_"), true);

    assert.equal(typeof response.body.tokenId, "string");

    assert.deepEqual(response.body.permissions, [
      "review:read",
      "review:update-label",
      "samples:create",
    ]);

    assert.equal(calls.insertedDocuments.length, 1);

    const inserted = calls.insertedDocuments[0];

    assert.equal(inserted.name, "Móvil Eduardo");

    assert.equal(inserted.permissions.includes("review:read"), true);

    assert.equal(inserted.permissions.includes("samples:create"), true);

    assert.equal(inserted.tokenHash.length, 64);

    assert.equal(Object.hasOwn(inserted, "deviceToken"), false);
  } finally {
    await stopTestServer(server);
  }
});

test("POST /api/review/devices/pair maps storage errors to 500", async () => {
  const { collection } = createFakeDeviceCollection({
    insertError: new Error("Sensitive insert failure"),
  });

  const { server, baseUrl } = await startTestServer({
    deviceCollection: collection,
  });

  try {
    const response = await postJson({
      baseUrl,
      path: "/api/review/devices/pair",
      reviewKey: "test-review-key",
      body: {
        deviceName: "Móvil Eduardo",
      },
    });

    assert.equal(response.status, 500);

    assert.equal(response.body.error, "review_device_pairing_failed");

    assert.equal(
      JSON.stringify(response.body).includes("Sensitive insert failure"),
      false,
    );
  } finally {
    await stopTestServer(server);
  }
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEVICE_TOKEN_PREFIX,
  DEFAULT_DEVICE_PERMISSIONS,
  ReviewDeviceAuthError,
  buildDeviceToken,
  parseDeviceToken,
  hashDeviceTokenSecret,
  timingSafeStringEqual,
  normalizeDeviceName,
  normalizePermissions,
  hasPermission,
  isRevoked,
  isExpired,
  createReviewDevice,
  authenticateReviewDevice,
} = require("../../services/review_device_service");

function createFakeCollection() {
  const documents = new Map();

  const calls = {
    insertedDocuments: [],
    findQueries: [],
    updateQueries: [],
    updateOperations: [],
  };

  return {
    calls,

    collection: {
      async insertOne(document) {
        const insertedId = `device-${documents.size + 1}`;

        const storedDocument = {
          _id: insertedId,
          ...document,
        };

        documents.set(document.tokenId, storedDocument);

        calls.insertedDocuments.push(storedDocument);

        return {
          insertedId,
        };
      },

      async findOne(query) {
        calls.findQueries.push(query);

        return documents.get(query.tokenId) ?? null;
      },

      async updateOne(query, operation) {
        calls.updateQueries.push(query);

        calls.updateOperations.push(operation);

        const current = documents.get(query.tokenId);

        if (!current) {
          return {
            matchedCount: 0,
            modifiedCount: 0,
          };
        }

        documents.set(query.tokenId, {
          ...current,
          ...operation.$set,
        });

        return {
          matchedCount: 1,
          modifiedCount: 1,
        };
      },
    },

    setDevice(document) {
      documents.set(document.tokenId, document);
    },
  };
}

test("buildDeviceToken and parseDeviceToken round-trip", () => {
  const token = buildDeviceToken({
    tokenId: "abc123",
    tokenSecret: "secret456",
  });

  assert.equal(token, `${DEVICE_TOKEN_PREFIX}_abc123_secret456`);

  assert.deepEqual(parseDeviceToken(token), {
    tokenId: "abc123",
    tokenSecret: "secret456",
  });
});

test("parseDeviceToken rejects invalid values", () => {
  assert.equal(parseDeviceToken(null), null);

  assert.equal(parseDeviceToken(""), null);

  assert.equal(parseDeviceToken("wrong_abc_secret"), null);

  assert.equal(parseDeviceToken("krd_only-two-parts"), null);
});

test("hashDeviceTokenSecret is deterministic", () => {
  const first = hashDeviceTokenSecret({
    tokenId: "token-id",
    tokenSecret: "secret",
  });

  const second = hashDeviceTokenSecret({
    tokenId: "token-id",
    tokenSecret: "secret",
  });

  assert.equal(first, second);

  assert.notEqual(
    first,
    hashDeviceTokenSecret({
      tokenId: "token-id",
      tokenSecret: "other-secret",
    }),
  );
});

test("timingSafeStringEqual compares strings safely", () => {
  assert.equal(timingSafeStringEqual("abc", "abc"), true);

  assert.equal(timingSafeStringEqual("abc", "abd"), false);

  assert.equal(timingSafeStringEqual("abc", "longer"), false);
});

test("normalizeDeviceName returns a safe name", () => {
  assert.equal(normalizeDeviceName("  Móvil Eduardo  "), "Móvil Eduardo");

  assert.equal(normalizeDeviceName(""), "Unnamed device");

  assert.equal(normalizeDeviceName(null), "Unnamed device");
});

test("normalizePermissions keeps only allowed permissions", () => {
  assert.deepEqual(
    normalizePermissions([
      "review:read",
      "unknown",
      "samples:create",
      "review:read",
    ]),
    ["review:read", "samples:create"],
  );

  assert.deepEqual(normalizePermissions([]), DEFAULT_DEVICE_PERMISSIONS);
});

test("hasPermission checks device permissions", () => {
  const device = {
    permissions: ["review:read"],
  };

  assert.equal(
    hasPermission({
      device,
      requiredPermission: "review:read",
    }),
    true,
  );

  assert.equal(
    hasPermission({
      device,
      requiredPermission: "samples:create",
    }),
    false,
  );

  assert.equal(
    hasPermission({
      device,
      requiredPermission: null,
    }),
    true,
  );
});

test("isRevoked detects revoked devices", () => {
  assert.equal(
    isRevoked({
      revokedAt: null,
    }),
    false,
  );

  assert.equal(
    isRevoked({
      revokedAt: new Date(),
    }),
    true,
  );
});

test("isExpired detects expired devices", () => {
  const now = new Date("2026-08-13T10:00:00.000Z");

  assert.equal(
    isExpired(
      {
        expiresAt: null,
      },
      now,
    ),
    false,
  );

  assert.equal(
    isExpired(
      {
        expiresAt: new Date("2026-08-13T09:59:59.000Z"),
      },
      now,
    ),
    true,
  );

  assert.equal(
    isExpired(
      {
        expiresAt: new Date("2026-08-13T10:00:01.000Z"),
      },
      now,
    ),
    false,
  );
});

test("createReviewDevice inserts a hashed token and returns the plain token once", async () => {
  const { collection, calls } = createFakeCollection();

  const result = await createReviewDevice({
    collection,
    deviceName: "Móvil Eduardo",
    permissions: ["review:read"],
    now: new Date("2026-08-13T10:00:00.000Z"),
  });

  assert.equal(result.deviceId, "device-1");

  assert.equal(result.deviceToken.startsWith(`${DEVICE_TOKEN_PREFIX}_`), true);

  assert.deepEqual(result.permissions, ["review:read"]);

  assert.equal(calls.insertedDocuments.length, 1);

  const inserted = calls.insertedDocuments[0];

  assert.equal(inserted.name, "Móvil Eduardo");

  assert.equal(inserted.tokenHash.length, 64);

  assert.equal(Object.hasOwn(inserted, "deviceToken"), false);
});

test("authenticateReviewDevice accepts a valid token with permission", async () => {
  const { collection, calls } = createFakeCollection();

  const created = await createReviewDevice({
    collection,
    deviceName: "Móvil Eduardo",
    permissions: ["review:read"],
  });

  const authenticated = await authenticateReviewDevice({
    collection,
    deviceToken: created.deviceToken,
    requiredPermission: "review:read",
    now: new Date("2026-08-13T10:00:00.000Z"),
  });

  assert.equal(authenticated.name, "Móvil Eduardo");

  assert.deepEqual(authenticated.permissions, ["review:read"]);

  assert.equal(calls.updateQueries.length, 1);

  assert.equal(calls.updateOperations[0].$set.lastUsedAt instanceof Date, true);
});

test("authenticateReviewDevice rejects invalid token format", async () => {
  const { collection } = createFakeCollection();

  await assert.rejects(
    () =>
      authenticateReviewDevice({
        collection,
        deviceToken: "invalid",
      }),
    (error) =>
      error instanceof ReviewDeviceAuthError &&
      error.code === "review_device_token_required" &&
      error.statusCode === 401,
  );
});

test("authenticateReviewDevice rejects an unknown token", async () => {
  const { collection } = createFakeCollection();

  const token = buildDeviceToken({
    tokenId: "unknown",
    tokenSecret: "secret",
  });

  await assert.rejects(
    () =>
      authenticateReviewDevice({
        collection,
        deviceToken: token,
      }),
    (error) =>
      error.code === "review_device_token_invalid" && error.statusCode === 403,
  );
});

test("authenticateReviewDevice rejects a token with the wrong secret", async () => {
  const { collection } = createFakeCollection();

  const created = await createReviewDevice({
    collection,
    deviceName: "Móvil Eduardo",
  });

  const parsed = parseDeviceToken(created.deviceToken);

  const wrongToken = buildDeviceToken({
    tokenId: parsed.tokenId,
    tokenSecret: "wrong-secret",
  });

  await assert.rejects(
    () =>
      authenticateReviewDevice({
        collection,
        deviceToken: wrongToken,
      }),
    (error) => error.code === "review_device_token_invalid",
  );
});

test("authenticateReviewDevice rejects revoked devices", async () => {
  const { collection, setDevice } = createFakeCollection();

  const tokenId = "token-id";

  const tokenSecret = "secret";

  setDevice({
    tokenId,
    tokenHash: hashDeviceTokenSecret({
      tokenId,
      tokenSecret,
    }),
    name: "Revoked",
    permissions: ["review:read"],
    revokedAt: new Date(),
    expiresAt: null,
  });

  const token = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  await assert.rejects(
    () =>
      authenticateReviewDevice({
        collection,
        deviceToken: token,
        requiredPermission: "review:read",
      }),
    (error) => error.code === "review_device_token_revoked",
  );
});

test("authenticateReviewDevice rejects missing permissions", async () => {
  const { collection } = createFakeCollection();

  const created = await createReviewDevice({
    collection,
    deviceName: "Móvil Eduardo",
    permissions: ["review:read"],
  });

  await assert.rejects(
    () =>
      authenticateReviewDevice({
        collection,
        deviceToken: created.deviceToken,
        requiredPermission: "review:update-label",
      }),
    (error) => error.code === "review_device_permission_denied",
  );
});

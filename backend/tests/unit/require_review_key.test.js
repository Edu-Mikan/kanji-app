"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REVIEW_KEY_HEADER,
  normalizeReviewKey,
  reviewKeysMatch,
  createRequireReviewKey,
} = require("../../middleware/require_review_key");

function createRequest({ reviewKey, useGet = true } = {}) {
  const headers = {};

  if (reviewKey !== undefined) {
    headers[REVIEW_KEY_HEADER] = reviewKey;
  }

  const request = {
    headers,
  };

  if (useGet) {
    request.get = (headerName) => headers[headerName.toLowerCase()];
  }

  return request;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,

    status(statusCode) {
      this.statusCode = statusCode;

      return this;
    },

    json(body) {
      this.body = body;

      return this;
    },
  };
}

function executeMiddleware({ configuredKey, providedKey, useGet = true }) {
  const middleware = createRequireReviewKey({
    configuredKey,
  });

  const request = createRequest({
    reviewKey: providedKey,
    useGet,
  });

  const response = createResponse();

  let nextCalled = false;

  middleware(request, response, () => {
    nextCalled = true;
  });

  return {
    request,
    response,
    nextCalled,
  };
}

test("normalizeReviewKey accepts strings and trims whitespace", () => {
  assert.equal(normalizeReviewKey("  secret-key  "), "secret-key");

  assert.equal(normalizeReviewKey(null), "");

  assert.equal(normalizeReviewKey(123), "");
});

test("reviewKeysMatch accepts identical non-empty keys", () => {
  assert.equal(reviewKeysMatch("secret-key", "secret-key"), true);
});

test("reviewKeysMatch trims key whitespace", () => {
  assert.equal(reviewKeysMatch("  secret-key ", "secret-key"), true);
});

test("reviewKeysMatch rejects different keys with the same length", () => {
  assert.equal(reviewKeysMatch("secret-key-a", "secret-key-b"), false);
});

test("reviewKeysMatch rejects keys with different lengths", () => {
  assert.equal(reviewKeysMatch("short", "longer-secret"), false);
});

test("reviewKeysMatch rejects empty keys", () => {
  assert.equal(reviewKeysMatch("", ""), false);

  assert.equal(reviewKeysMatch("provided", ""), false);
});

test("middleware returns 503 when administration is not configured", () => {
  const result = executeMiddleware({
    configuredKey: "",
    providedKey: "provided-key",
  });

  assert.equal(result.nextCalled, false);

  assert.equal(result.response.statusCode, 503);

  assert.deepEqual(result.response.body, {
    ok: false,
    error: "review_admin_not_configured",
    message: "Review administration is not configured.",
  });
});

test("middleware returns 401 when the header is missing", () => {
  const result = executeMiddleware({
    configuredKey: "configured-key",
    providedKey: undefined,
  });

  assert.equal(result.nextCalled, false);

  assert.equal(result.response.statusCode, 401);

  assert.equal(result.response.body.error, "review_admin_key_required");
});

test("middleware returns 401 when the header is blank", () => {
  const result = executeMiddleware({
    configuredKey: "configured-key",
    providedKey: "   ",
  });

  assert.equal(result.nextCalled, false);

  assert.equal(result.response.statusCode, 401);

  assert.equal(result.response.body.error, "review_admin_key_required");
});

test("middleware returns 403 when the key is invalid", () => {
  const result = executeMiddleware({
    configuredKey: "configured-key",
    providedKey: "incorrect-key",
  });

  assert.equal(result.nextCalled, false);

  assert.equal(result.response.statusCode, 403);

  assert.equal(result.response.body.error, "review_admin_key_invalid");
});

test("middleware calls next when the key is valid", () => {
  const result = executeMiddleware({
    configuredKey: "configured-key",
    providedKey: "configured-key",
  });

  assert.equal(result.nextCalled, true);

  assert.equal(result.response.statusCode, 200);

  assert.equal(result.response.body, null);
});

test("middleware can read the key directly from request headers", () => {
  const result = executeMiddleware({
    configuredKey: "configured-key",
    providedKey: "configured-key",
    useGet: false,
  });

  assert.equal(result.nextCalled, true);
});

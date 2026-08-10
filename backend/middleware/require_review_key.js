"use strict";

const crypto = require("node:crypto");

const REVIEW_KEY_HEADER = "x-review-key";

function normalizeReviewKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function reviewKeysMatch(providedKey, configuredKey) {
  const normalizedProvidedKey = normalizeReviewKey(providedKey);

  const normalizedConfiguredKey = normalizeReviewKey(configuredKey);

  if (
    normalizedProvidedKey.length === 0 ||
    normalizedConfiguredKey.length === 0
  ) {
    return false;
  }

  const providedBuffer = Buffer.from(normalizedProvidedKey, "utf8");

  const configuredBuffer = Buffer.from(normalizedConfiguredKey, "utf8");

  if (providedBuffer.length !== configuredBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, configuredBuffer);
}

function createRequireReviewKey({
  configuredKey = process.env.REVIEW_ADMIN_KEY,
} = {}) {
  return function requireReviewKey(req, res, next) {
    const normalizedConfiguredKey = normalizeReviewKey(configuredKey);

    if (normalizedConfiguredKey.length === 0) {
      return res.status(503).json({
        ok: false,
        error: "review_admin_not_configured",
        message: "Review administration is not configured.",
      });
    }

    const providedKey =
      req.get?.(REVIEW_KEY_HEADER) ?? req.headers?.[REVIEW_KEY_HEADER];

    if (normalizeReviewKey(providedKey).length === 0) {
      return res.status(401).json({
        ok: false,
        error: "review_admin_key_required",
        message: "The review administration key is required.",
      });
    }

    if (!reviewKeysMatch(providedKey, normalizedConfiguredKey)) {
      return res.status(403).json({
        ok: false,
        error: "review_admin_key_invalid",
        message: "The review administration key is invalid.",
      });
    }

    return next();
  };
}

module.exports = {
  REVIEW_KEY_HEADER,
  normalizeReviewKey,
  reviewKeysMatch,
  createRequireReviewKey,
};

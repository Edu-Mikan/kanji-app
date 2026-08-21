"use strict";

const express = require("express");

const {
  REVIEW_KEY_HEADER,
  normalizeReviewKey,
  reviewKeysMatch,
  createRequireReviewKey,
} = require("../middleware/require_review_key");

const {
  ReviewDeviceAuthError,
  authenticateReviewDevice,
  createReviewDevice,
} = require("../services/review_device_service");

const {
  FeedbackReviewValidationError,
  listReviewSamples,
  updateReviewSampleLabel,
} = require("../services/feedback_review_service");

function createFeedbackReviewRouter({
  getCollection,
  getDeviceCollection = null,
  configuredKey = process.env.REVIEW_ADMIN_KEY,
} = {}) {
  if (typeof getCollection !== "function") {
    throw new Error("getCollection must be a function.");
  }

  const router = express.Router();

  const requireReviewKey = createRequireReviewKey({
    configuredKey,
  });

  //router.use(requireReviewKey);

  function getProvidedReviewKey(req) {
    return req.get?.(REVIEW_KEY_HEADER) ?? req.headers?.[REVIEW_KEY_HEADER];
  }

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

  async function requireReviewReadAccess(req, res, next) {
    const providedKey = getProvidedReviewKey(req);

    const normalizedProvidedKey = normalizeReviewKey(providedKey);

    const normalizedConfiguredKey = normalizeReviewKey(configuredKey);

    if (normalizedProvidedKey.length > 0) {
      if (normalizedConfiguredKey.length === 0) {
        return res.status(503).json({
          ok: false,
          error: "review_admin_not_configured",
          message: "Review administration is not configured.",
        });
      }

      if (reviewKeysMatch(normalizedProvidedKey, normalizedConfiguredKey)) {
        return next();
      }

      return res.status(403).json({
        ok: false,
        error: "review_admin_key_invalid",
        message: "The review administration key is invalid.",
      });
    }

    const deviceToken = getBearerToken(req);

    if (deviceToken.length === 0) {
      return res.status(401).json({
        ok: false,
        error: "review_authorization_required",
        message: "A review administration key or device token is required.",
      });
    }

    if (typeof getDeviceCollection !== "function") {
      return res.status(503).json({
        ok: false,
        error: "review_device_storage_unavailable",
        message: "The review device storage is unavailable.",
      });
    }

    const deviceCollection = getDeviceCollection();

    try {
      req.reviewDevice = await authenticateReviewDevice({
        collection: deviceCollection,
        deviceToken,
        requiredPermission: "review:read",
      });

      return next();
    } catch (error) {
      if (error instanceof ReviewDeviceAuthError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.code,
          message: error.message,
        });
      }

      console.error("Error authenticating review device:", error);

      return res.status(500).json({
        ok: false,
        error: "review_device_auth_failed",
        message: "The review device could not be authenticated.",
      });
    }
  }

  async function requireReviewLabelUpdateAccess(req, res, next) {
    const deviceToken = getBearerToken(req);

    if (deviceToken.length === 0) {
      return res.status(401).json({
        ok: false,
        error: "review_authorization_required",
        message: "A paired review device token is required to update labels.",
      });
    }

    if (typeof getDeviceCollection !== "function") {
      return res.status(503).json({
        ok: false,
        error: "review_device_storage_unavailable",
        message: "The review device storage is unavailable.",
      });
    }

    const deviceCollection = getDeviceCollection();

    try {
      req.reviewDevice = await authenticateReviewDevice({
        collection: deviceCollection,
        deviceToken,
        requiredPermission: "review:update-label",
      });

      return next();
    } catch (error) {
      if (error instanceof ReviewDeviceAuthError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.code,
          message: error.message,
        });
      }

      console.error("Error authenticating review label update:", error);

      return res.status(500).json({
        ok: false,
        error: "review_device_auth_failed",
        message: "The review device could not be authenticated.",
      });
    }
  }

  router.post("/devices/pair", requireReviewKey, async (req, res) => {
    try {
      if (typeof getDeviceCollection !== "function") {
        return res.status(503).json({
          ok: false,
          error: "review_device_storage_unavailable",
          message: "The review device storage is unavailable.",
        });
      }

      const deviceCollection = getDeviceCollection();

      if (!deviceCollection) {
        return res.status(503).json({
          ok: false,
          error: "review_device_storage_unavailable",
          message: "The review device storage is unavailable.",
        });
      }

      const deviceName =
        typeof req.body?.deviceName === "string"
          ? req.body.deviceName
          : "Unnamed device";

      const result = await createReviewDevice({
        collection: deviceCollection,
        deviceName,
        permissions: ["review:read", "review:update-label", "samples:create"],
      });

      return res.status(201).json({
        ok: true,
        deviceId: result.deviceId,
        deviceToken: result.deviceToken,
        tokenId: result.tokenId,
        permissions: result.permissions,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      console.error("Error pairing review device:", error);

      return res.status(500).json({
        ok: false,
        error: "review_device_pairing_failed",
        message: "The review device could not be paired.",
      });
    }
  });

  router.get("/samples", requireReviewReadAccess, async (req, res) => {
    try {
      const collection = getCollection();

      if (!collection) {
        return res.status(503).json({
          ok: false,
          error: "review_storage_unavailable",
          message: "The review sample storage is unavailable.",
        });
      }

      const result = await listReviewSamples({
        collection,
        query: req.query,
      });

      return res.json({
        ok: true,
        ...result,
      });
    } catch (error) {
      if (error instanceof FeedbackReviewValidationError) {
        return res.status(error.statusCode).json({
          ok: false,
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      console.error("Error listing review samples:", error);

      return res.status(500).json({
        ok: false,
        error: "review_samples_query_failed",
        message: "The review samples could not be retrieved.",
      });
    }
  });

  router.patch(
    "/samples/:recognitionId/label",
    requireReviewLabelUpdateAccess,
    async (req, res) => {
      try {
        const collection = getCollection();

        if (!collection) {
          return res.status(503).json({
            ok: false,
            error: "review_storage_unavailable",
            message: "The review sample storage is unavailable.",
          });
        }

        const result = await updateReviewSampleLabel({
          collection,
          recognitionId: req.params.recognitionId,
          isCorrect: req.body?.isCorrect,
          reviewDevice: req.reviewDevice,
        });

        if (!result) {
          return res.status(404).json({
            ok: false,
            error: "review_sample_not_found",
            message: "The review sample was not found.",
          });
        }

        return res.json({
          ok: true,
          changed: result.changed,
          sample: result.sample,
        });
      } catch (error) {
        if (error instanceof FeedbackReviewValidationError) {
          return res.status(error.statusCode).json({
            ok: false,
            error: error.code,
            message: error.message,
            details: error.details,
          });
        }

        console.error("Error updating review sample label:", error);

        return res.status(500).json({
          ok: false,
          error: "review_sample_label_update_failed",
          message: "The review sample label could not be updated.",
        });
      }
    },
  );

  return router;
}

module.exports = {
  createFeedbackReviewRouter,
};

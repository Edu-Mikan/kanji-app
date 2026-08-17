"use strict";

const express = require("express");

const { createReviewDevice } = require("../services/review_device_service");

const { createRequireReviewKey } = require("../middleware/require_review_key");

const {
  FeedbackReviewValidationError,
  listReviewSamples,
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

  router.use(requireReviewKey);

  router.post("/devices/pair", async (req, res) => {
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
        permissions: ["review:read", "samples:create"],
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

  router.get("/samples", async (req, res) => {
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

  return router;
}

module.exports = {
  createFeedbackReviewRouter,
};

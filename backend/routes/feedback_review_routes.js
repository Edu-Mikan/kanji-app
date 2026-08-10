"use strict";

const express = require("express");

const { createRequireReviewKey } = require("../middleware/require_review_key");

const {
  FeedbackReviewValidationError,
  listReviewSamples,
} = require("../services/feedback_review_service");

function createFeedbackReviewRouter({
  getCollection,
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

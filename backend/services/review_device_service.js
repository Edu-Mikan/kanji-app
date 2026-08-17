"use strict";

const crypto = require("node:crypto");

const DEVICE_TOKEN_PREFIX = "krd";

const DEFAULT_DEVICE_PERMISSIONS = ["review:read", "samples:create"];

const ALLOWED_DEVICE_PERMISSIONS = [
  "review:read",
  "samples:create",
  "review:update-label",
  "review:approve",
  "review:exclude",
];

class ReviewDeviceAuthError extends Error {
  constructor(message, code, statusCode = 401) {
    super(message);

    this.name = "ReviewDeviceAuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function createTokenId() {
  return crypto.randomBytes(8).toString("hex");
}

function createTokenSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function buildDeviceToken({ tokenId, tokenSecret }) {
  return [DEVICE_TOKEN_PREFIX, tokenId, tokenSecret].join("_");
}

function parseDeviceToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const normalized = token.trim();

  const parts = normalized.split("_");

  if (
    parts.length !== 3 ||
    parts[0] !== DEVICE_TOKEN_PREFIX ||
    parts[1].length === 0 ||
    parts[2].length === 0
  ) {
    return null;
  }

  return {
    tokenId: parts[1],
    tokenSecret: parts[2],
  };
}

function hashDeviceTokenSecret({ tokenId, tokenSecret }) {
  return crypto
    .createHash("sha256")
    .update(`${tokenId}.${tokenSecret}`, "utf8")
    .digest("hex");
}

function timingSafeStringEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left, "utf8");

  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeDeviceName(value) {
  if (typeof value !== "string") {
    return "Unnamed device";
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return "Unnamed device";
  }

  return normalized.slice(0, 120);
}

function normalizePermissions(permissions = DEFAULT_DEVICE_PERMISSIONS) {
  if (!Array.isArray(permissions)) {
    return [...DEFAULT_DEVICE_PERMISSIONS];
  }

  const normalized = new Set();

  for (const permission of permissions) {
    if (typeof permission !== "string") {
      continue;
    }

    const value = permission.trim();

    if (ALLOWED_DEVICE_PERMISSIONS.includes(value)) {
      normalized.add(value);
    }
  }

  if (normalized.size === 0) {
    return [...DEFAULT_DEVICE_PERMISSIONS];
  }

  return [...normalized].sort();
}

function hasPermission({ device, requiredPermission }) {
  if (!requiredPermission) {
    return true;
  }

  if (!Array.isArray(device?.permissions)) {
    return false;
  }

  return device.permissions.includes(requiredPermission);
}

function isRevoked(device) {
  return Boolean(device?.revokedAt);
}

function isExpired(device, now = new Date()) {
  if (!device?.expiresAt) {
    return false;
  }

  const expiresAt =
    device.expiresAt instanceof Date
      ? device.expiresAt
      : new Date(device.expiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt <= now;
}

async function createReviewDevice({
  collection,
  deviceName,
  permissions = DEFAULT_DEVICE_PERMISSIONS,
  now = new Date(),
  expiresAt = null,
}) {
  if (!collection || typeof collection.insertOne !== "function") {
    throw new Error("A MongoDB review devices collection is required.");
  }

  const tokenId = createTokenId();

  const tokenSecret = createTokenSecret();

  const deviceToken = buildDeviceToken({
    tokenId,
    tokenSecret,
  });

  const tokenHash = hashDeviceTokenSecret({
    tokenId,
    tokenSecret,
  });

  const document = {
    tokenId,
    tokenHash,
    name: normalizeDeviceName(deviceName),
    permissions: normalizePermissions(permissions),
    createdAt: now,
    lastUsedAt: null,
    revokedAt: null,
    expiresAt,
  };

  const result = await collection.insertOne(document);

  return {
    deviceId:
      result.insertedId === undefined ? null : String(result.insertedId),
    tokenId,
    deviceToken,
    permissions: document.permissions,
    expiresAt,
  };
}

async function authenticateReviewDevice({
  collection,
  deviceToken,
  requiredPermission = null,
  now = new Date(),
  updateLastUsedAt = true,
}) {
  if (!collection || typeof collection.findOne !== "function") {
    throw new ReviewDeviceAuthError(
      "Review device storage is unavailable.",
      "review_device_storage_unavailable",
      503,
    );
  }

  const parsedToken = parseDeviceToken(deviceToken);

  if (parsedToken === null) {
    throw new ReviewDeviceAuthError(
      "The review device token is required.",
      "review_device_token_required",
      401,
    );
  }

  const device = await collection.findOne({
    tokenId: parsedToken.tokenId,
  });

  if (!device) {
    throw new ReviewDeviceAuthError(
      "The review device token is invalid.",
      "review_device_token_invalid",
      403,
    );
  }

  const expectedHash = hashDeviceTokenSecret({
    tokenId: parsedToken.tokenId,
    tokenSecret: parsedToken.tokenSecret,
  });

  if (!timingSafeStringEqual(expectedHash, device.tokenHash)) {
    throw new ReviewDeviceAuthError(
      "The review device token is invalid.",
      "review_device_token_invalid",
      403,
    );
  }

  if (isRevoked(device)) {
    throw new ReviewDeviceAuthError(
      "The review device token has been revoked.",
      "review_device_token_revoked",
      403,
    );
  }

  if (isExpired(device, now)) {
    throw new ReviewDeviceAuthError(
      "The review device token has expired.",
      "review_device_token_expired",
      403,
    );
  }

  if (
    !hasPermission({
      device,
      requiredPermission,
    })
  ) {
    throw new ReviewDeviceAuthError(
      "The review device token does not have the required permission.",
      "review_device_permission_denied",
      403,
    );
  }

  if (updateLastUsedAt && typeof collection.updateOne === "function") {
    await collection.updateOne(
      {
        tokenId: parsedToken.tokenId,
      },
      {
        $set: {
          lastUsedAt: now,
        },
      },
    );
  }

  return {
    tokenId: device.tokenId,
    name: device.name,
    permissions: Array.isArray(device.permissions) ? device.permissions : [],
  };
}

module.exports = {
  DEVICE_TOKEN_PREFIX,
  DEFAULT_DEVICE_PERMISSIONS,
  ALLOWED_DEVICE_PERMISSIONS,
  ReviewDeviceAuthError,
  createTokenId,
  createTokenSecret,
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
};

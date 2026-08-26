"use strict";

const { sortKanjis, assertValidKanji } = require("./kanji_reference_catalog");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, message) {
  if (!isPlainObject(value)) {
    throw new Error(message);
  }
}

function normalizeKanjiArray(values, fieldName) {
  if (!Array.isArray(values)) {
    throw new Error(`${fieldName} must be an array.`);
  }

  for (const kanji of values) {
    assertValidKanji(kanji);
  }

  return sortKanjis(values);
}

function getDescriptorObject(descriptorCatalog) {
  assertPlainObject(
    descriptorCatalog,
    "Descriptor catalog must contain a descriptors object.",
  );

  const descriptors = Object.hasOwn(descriptorCatalog, "descriptors")
    ? descriptorCatalog.descriptors
    : descriptorCatalog;

  assertPlainObject(
    descriptors,
    "Descriptor catalog must contain a descriptors object.",
  );

  return descriptors;
}

function validateRequirements(requirements) {
  assertPlainObject(requirements, "Reference requirements must be an object.");

  if (requirements.schemaVersion !== 1) {
    throw new Error(
      "Unsupported reference requirements schema version: " +
        requirements.schemaVersion,
    );
  }

  return {
    externalUnseen: normalizeKanjiArray(
      requirements.externalUnseen,
      "externalUnseen",
    ),
    requiredKanjis: normalizeKanjiArray(
      requirements.requiredKanjis,
      "requiredKanjis",
    ),
  };
}

function buildOrderedSet(values) {
  return new Set(sortKanjis(values));
}

function buildFeedbackInspectionCatalogContext({
  catalog,
  descriptorCatalog,
  requirements,
}) {
  assertPlainObject(catalog, "Reference catalog must be an object.");

  for (const kanji of Object.keys(catalog)) {
    assertValidKanji(kanji);
  }

  const descriptors = getDescriptorObject(descriptorCatalog);

  for (const kanji of Object.keys(descriptors)) {
    assertValidKanji(kanji);
  }

  const normalizedRequirements = validateRequirements(requirements);

  return {
    canonicalKanjis: buildOrderedSet(Object.keys(catalog)),

    approvedDescriptorKanjis: buildOrderedSet(Object.keys(descriptors)),

    externalUnseenKanjis: buildOrderedSet(
      normalizedRequirements.externalUnseen,
    ),

    explicitRequirementKanjis: buildOrderedSet(
      normalizedRequirements.requiredKanjis,
    ),
  };
}

module.exports = {
  isPlainObject,
  assertPlainObject,
  normalizeKanjiArray,
  getDescriptorObject,
  validateRequirements,
  buildOrderedSet,
  buildFeedbackInspectionCatalogContext,
};

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareReferenceEntries,
  validateCatalogRegression,
} = require("../../scripts/validate_kanji_reference_catalog_regression");

function createStroke({ startX = 0, startY = 0, endX = 1, endY = 1 } = {}) {
  return {
    x: [startX, endX],
    y: [startY, endY],
  };
}

function createDescriptorCatalog() {
  return {
    schemaVersion: 1,
    descriptors: {
      一: {
        strokeCount: 1,
      },
      木: {
        strokeCount: 1,
      },
    },
  };
}

function createRequirements() {
  return {
    schemaVersion: 1,
    externalUnseen: ["力"],
    requiredKanjis: [],
  };
}

test("compareReferenceEntries accepts an exact match", () => {
  const strokes = [createStroke()];

  const result = compareReferenceEntries({
    kanji: "木",
    legacyStrokes: strokes,
    catalogStrokes: JSON.parse(JSON.stringify(strokes)),
  });

  assert.equal(result.exactMatch, true);

  assert.equal(result.legacySha256, result.catalogSha256);

  assert.deepEqual(result.errors, []);
});

test("compareReferenceEntries detects changed coordinates", () => {
  const result = compareReferenceEntries({
    kanji: "木",
    legacyStrokes: [createStroke()],
    catalogStrokes: [
      createStroke({
        endX: 0.9,
      }),
    ],
  });

  assert.equal(result.exactMatch, false);

  assert.notEqual(result.legacySha256, result.catalogSha256);

  assert.deepEqual(result.errors, ["reference_content_mismatch"]);
});

test("catalog regression passes with exact baseline and valid external unseen", () => {
  const oneReference = [
    createStroke({
      endY: 0,
    }),
  ];

  const treeReference = [createStroke()];

  const powerReference = [
    createStroke({
      startX: 1,
      endX: 0,
    }),
  ];

  const result = validateCatalogRegression({
    legacyDataset: {
      一: oneReference,
      木: treeReference,
    },
    referenceCatalog: {
      一: JSON.parse(JSON.stringify(oneReference)),
      力: powerReference,
      木: JSON.parse(JSON.stringify(treeReference)),
    },
    descriptorCatalog: createDescriptorCatalog(),
    requirements: createRequirements(),
  });

  assert.equal(result.passed, true);

  assert.equal(result.descriptorKanjiCount, 2);

  assert.equal(result.externalUnseenKanjiCount, 1);

  assert.equal(result.expectedCatalogKanjiCount, 3);

  assert.equal(result.actualCatalogKanjiCount, 3);

  assert.equal(result.exactMatchCount, 2);

  assert.equal(result.mismatchCount, 0);

  assert.deepEqual(result.externalUnseenKanjis, ["力"]);
});

test("catalog regression fails when a baseline reference changes", () => {
  const result = validateCatalogRegression({
    legacyDataset: {
      一: [
        createStroke({
          endY: 0,
        }),
      ],
      木: [createStroke()],
    },
    referenceCatalog: {
      一: [
        createStroke({
          endY: 0,
        }),
      ],
      力: [createStroke()],
      木: [
        createStroke({
          endX: 0.75,
        }),
      ],
    },
    descriptorCatalog: createDescriptorCatalog(),
    requirements: createRequirements(),
  });

  assert.equal(result.passed, false);

  assert.deepEqual(result.mismatchingKanjis, ["木"]);
});

test("catalog regression fails when external unseen is missing", () => {
  const result = validateCatalogRegression({
    legacyDataset: {
      一: [
        createStroke({
          endY: 0,
        }),
      ],
      木: [createStroke()],
    },
    referenceCatalog: {
      一: [
        createStroke({
          endY: 0,
        }),
      ],
      木: [createStroke()],
    },
    descriptorCatalog: createDescriptorCatalog(),
    requirements: createRequirements(),
  });

  assert.equal(result.passed, false);

  assert.deepEqual(result.missingCatalogKanjis, ["力"]);
});

test("catalog regression fails when catalog contains unexpected references", () => {
  const result = validateCatalogRegression({
    legacyDataset: {
      一: [
        createStroke({
          endY: 0,
        }),
      ],
      木: [createStroke()],
    },
    referenceCatalog: {
      一: [
        createStroke({
          endY: 0,
        }),
      ],
      力: [createStroke()],
      木: [createStroke()],
      山: [createStroke()],
    },
    descriptorCatalog: createDescriptorCatalog(),
    requirements: createRequirements(),
  });

  assert.equal(result.passed, false);

  assert.deepEqual(result.unexpectedCatalogKanjis, ["山"]);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFeedbackInspectionCatalogContext,
} = require("../../services/feedback_inspection_catalog_context");

function createReferenceStroke() {
  return {
    x: [0, 0.5, 1],
    y: [0, 0.5, 1],
  };
}

function createValidInput(overrides = {}) {
  return {
    catalog: {
      木: [createReferenceStroke()],
      力: [createReferenceStroke()],
      刀: [createReferenceStroke()],
    },
    descriptorCatalog: {
      schemaVersion: 1,
      descriptors: {
        木: {
          enabled: true,
          pattern: "tree_cross_pattern",
        },
        刀: {
          enabled: false,
          pattern: "blade_pattern",
        },
      },
    },
    requirements: {
      schemaVersion: 1,
      externalUnseen: ["力"],
      requiredKanjis: ["刀"],
    },
    ...overrides,
  };
}

test("buildFeedbackInspectionCatalogContext builds all kanji sets", () => {
  const context = buildFeedbackInspectionCatalogContext(createValidInput());

  assert.deepEqual([...context.canonicalKanjis], ["刀", "力", "木"]);

  assert.deepEqual([...context.approvedDescriptorKanjis], ["刀", "木"]);

  assert.deepEqual([...context.externalUnseenKanjis], ["力"]);

  assert.deepEqual([...context.explicitRequirementKanjis], ["刀"]);
});

test("descriptor presence means approved descriptor for catalog coverage", () => {
  const context = buildFeedbackInspectionCatalogContext(createValidInput());

  assert.equal(context.approvedDescriptorKanjis.has("木"), true);

  assert.equal(context.approvedDescriptorKanjis.has("刀"), true);

  assert.equal(context.approvedDescriptorKanjis.has("力"), false);
});

test("disabled descriptors remain approved for catalog coverage", () => {
  const context = buildFeedbackInspectionCatalogContext(createValidInput());

  assert.equal(context.approvedDescriptorKanjis.has("刀"), true);
});

test("context preserves overlapping catalog reasons", () => {
  const input = createValidInput({
    requirements: {
      schemaVersion: 1,
      externalUnseen: ["力", "木"],
      requiredKanjis: ["木", "刀"],
    },
  });

  const context = buildFeedbackInspectionCatalogContext(input);

  assert.equal(context.canonicalKanjis.has("木"), true);
  assert.equal(context.approvedDescriptorKanjis.has("木"), true);
  assert.equal(context.externalUnseenKanjis.has("木"), true);
  assert.equal(context.explicitRequirementKanjis.has("木"), true);
});

test("context sets use deterministic kanji ordering", () => {
  const input = createValidInput({
    catalog: {
      木: [createReferenceStroke()],
      一: [createReferenceStroke()],
      力: [createReferenceStroke()],
    },
    descriptorCatalog: {
      schemaVersion: 1,
      descriptors: {
        木: {},
        一: {},
      },
    },
    requirements: {
      schemaVersion: 1,
      externalUnseen: ["力"],
      requiredKanjis: ["木", "一"],
    },
  });

  const context = buildFeedbackInspectionCatalogContext(input);

  assert.deepEqual([...context.canonicalKanjis], ["一", "力", "木"]);

  assert.deepEqual([...context.approvedDescriptorKanjis], ["一", "木"]);

  assert.deepEqual([...context.explicitRequirementKanjis], ["一", "木"]);
});

test("context accepts a descriptor object without wrapper", () => {
  const input = createValidInput({
    descriptorCatalog: {
      木: {
        enabled: true,
      },
    },
  });

  const context = buildFeedbackInspectionCatalogContext(input);

  assert.deepEqual([...context.approvedDescriptorKanjis], ["木"]);
});

test("context rejects an invalid reference catalog", () => {
  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          catalog: [],
        }),
      ),
    /Reference catalog must be an object/,
  );

  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          catalog: null,
        }),
      ),
    /Reference catalog must be an object/,
  );
});

test("context rejects an invalid descriptor catalog", () => {
  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          descriptorCatalog: {
            descriptors: [],
          },
        }),
      ),
    /Descriptor catalog must contain a descriptors object/,
  );
});

test("context rejects an unsupported requirements schema", () => {
  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          requirements: {
            schemaVersion: 2,
            externalUnseen: [],
            requiredKanjis: [],
          },
        }),
      ),
    /Unsupported reference requirements schema version: 2/,
  );
});

test("context requires externalUnseen and requiredKanjis arrays", () => {
  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          requirements: {
            schemaVersion: 1,
            externalUnseen: null,
            requiredKanjis: [],
          },
        }),
      ),
    /externalUnseen must be an array/,
  );

  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          requirements: {
            schemaVersion: 1,
            externalUnseen: [],
            requiredKanjis: null,
          },
        }),
      ),
    /requiredKanjis must be an array/,
  );
});

test("context rejects invalid kanji values", () => {
  assert.throws(
    () =>
      buildFeedbackInspectionCatalogContext(
        createValidInput({
          requirements: {
            schemaVersion: 1,
            externalUnseen: ["力木"],
            requiredKanjis: [],
          },
        }),
      ),
    /Expected one kanji character/,
  );
});

test("context does not mutate source objects", () => {
  const input = createValidInput();
  const serializedBefore = JSON.stringify(input);

  buildFeedbackInspectionCatalogContext(input);

  assert.equal(JSON.stringify(input), serializedBefore);
});

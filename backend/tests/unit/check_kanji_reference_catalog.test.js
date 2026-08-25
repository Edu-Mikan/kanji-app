"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { calculateSha256 } = require("../../services/kanji_reference_catalog");

const {
  getRequiredKanjis,
  checkReferenceCatalog,
} = require("../../scripts/check_kanji_reference_catalog");

function createStroke() {
  return {
    x: [0, 1],
    y: [0, 1],
  };
}

function createFixture() {
  const catalog = {
    一: [createStroke()],
    力: [createStroke(), createStroke()],
  };

  const manifest = {
    schemaVersion: 1,
    catalog: {
      kanjiCount: 2,
      kanjis: ["一", "力"],
      sha256: calculateSha256(catalog),
    },
    entries: {
      一: {
        strokeCount: 1,
        entrySha256: calculateSha256(catalog["一"]),
      },
      力: {
        strokeCount: 2,
        entrySha256: calculateSha256(catalog["力"]),
      },
    },
  };

  const descriptorCatalog = {
    schemaVersion: 1,
    descriptors: {
      一: {
        strokeCount: 1,
      },
    },
  };

  const requirements = {
    schemaVersion: 1,
    externalUnseen: ["力"],
    requiredKanjis: [],
  };

  return {
    catalog,
    manifest,
    descriptorCatalog,
    requirements,
  };
}

test("getRequiredKanjis combines descriptors and requirements", () => {
  const result = getRequiredKanjis({
    descriptorCatalog: {
      descriptors: {
        木: {},
        一: {},
      },
    },
    requirements: {
      schemaVersion: 1,
      externalUnseen: ["力"],
      requiredKanjis: ["木"],
    },
  });

  assert.deepEqual(result, ["一", "力", "木"]);
});

test("catalog check passes for a consistent catalog and manifest", () => {
  const fixture = createFixture();

  const result = checkReferenceCatalog(fixture);

  assert.equal(result.passed, true);

  assert.deepEqual(result.failures, []);

  assert.equal(result.catalogKanjiCount, 2);

  assert.equal(result.requiredKanjiCount, 2);
});

test("catalog check fails when a required kanji is missing", () => {
  const fixture = createFixture();

  delete fixture.catalog["力"];

  const result = checkReferenceCatalog(fixture);

  assert.equal(result.passed, false);

  assert.equal(
    result.failures.some(
      (failure) => failure.code === "missing_required_kanjis",
    ),
    true,
  );
});

test("catalog check fails when the catalog hash changes", () => {
  const fixture = createFixture();

  fixture.catalog["一"][0].x[1] = 0.75;

  const result = checkReferenceCatalog(fixture);

  assert.equal(result.passed, false);

  assert.equal(
    result.failures.some((failure) => failure.code === "catalog_hash_mismatch"),
    true,
  );
});

test("catalog check fails when an entry hash changes", () => {
  const fixture = createFixture();

  fixture.manifest.entries["一"].entrySha256 = "invalid";

  const result = checkReferenceCatalog(fixture);

  assert.equal(result.passed, false);

  assert.equal(
    result.failures.some(
      (failure) => failure.code === "manifest_entry_mismatch",
    ),
    true,
  );
});

test("catalog check fails for invalid stroke geometry", () => {
  const fixture = createFixture();

  fixture.catalog["一"] = [
    {
      x: [0, 1],
      y: [0],
    },
  ];

  const result = checkReferenceCatalog(fixture);

  assert.equal(result.passed, false);

  assert.equal(
    result.failures.some(
      (failure) => failure.code === "invalid_reference_entries",
    ),
    true,
  );
});

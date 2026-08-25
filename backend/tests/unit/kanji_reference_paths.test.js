"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  BACKEND_DIRECTORY,
  REFERENCE_CATALOG_PATH,
  REFERENCE_MANIFEST_PATH,
  REFERENCE_REQUIREMENTS_PATH,
} = require("../../services/kanji_reference_paths");

test("reference paths are absolute and inside the backend data directory", () => {
  assert.equal(path.isAbsolute(REFERENCE_CATALOG_PATH), true);

  assert.equal(path.isAbsolute(REFERENCE_MANIFEST_PATH), true);

  assert.equal(path.isAbsolute(REFERENCE_REQUIREMENTS_PATH), true);

  assert.equal(
    REFERENCE_CATALOG_PATH,
    path.join(BACKEND_DIRECTORY, "data", "kanji_reference_catalog.json"),
  );

  assert.equal(
    REFERENCE_MANIFEST_PATH,
    path.join(
      BACKEND_DIRECTORY,
      "data",
      "kanji_reference_catalog.manifest.json",
    ),
  );

  assert.equal(
    REFERENCE_REQUIREMENTS_PATH,
    path.join(BACKEND_DIRECTORY, "data", "kanji_reference_requirements.json"),
  );
});

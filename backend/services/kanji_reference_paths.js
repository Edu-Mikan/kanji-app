"use strict";

const path = require("node:path");

const BACKEND_DIRECTORY = path.resolve(__dirname, "..");

const REFERENCE_CATALOG_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_catalog.json",
);

const REFERENCE_MANIFEST_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_catalog.manifest.json",
);

const REFERENCE_REQUIREMENTS_PATH = path.join(
  BACKEND_DIRECTORY,
  "data",
  "kanji_reference_requirements.json",
);

module.exports = {
  BACKEND_DIRECTORY,
  REFERENCE_CATALOG_PATH,
  REFERENCE_MANIFEST_PATH,
  REFERENCE_REQUIREMENTS_PATH,
};

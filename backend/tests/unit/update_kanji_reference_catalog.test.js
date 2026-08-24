"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectDescriptorKanjis,
  buildRequiredSources,
  updateReferenceCatalog,
} = require("../../scripts/update_kanji_reference_catalog");

function createTemporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kanji-reference-update-test-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeSvg({ directory, fileName, pathData }) {
  fs.mkdirSync(directory, {
    recursive: true,
  });

  fs.writeFileSync(
    path.join(directory, fileName),
    `<svg><path d="${pathData}"/></svg>`,
    "utf8",
  );
}

function createFixture(t) {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const descriptorPath = path.join(directory, "kanji_descriptors.json");

  const requirementsPath = path.join(
    directory,
    "kanji_reference_requirements.json",
  );

  const svgDirectory = path.join(directory, "kanji_svg");

  const catalogPath = path.join(
    directory,
    "data",
    "kanji_reference_catalog.json",
  );

  const manifestPath = path.join(
    directory,
    "data",
    "kanji_reference_catalog.manifest.json",
  );

  writeJson(descriptorPath, {
    schemaVersion: 1,
    descriptors: {
      一: {
        strokeCount: 1,
      },
      木: {
        strokeCount: 1,
      },
    },
  });

  writeJson(requirementsPath, {
    schemaVersion: 1,
    externalUnseen: ["力"],
    requiredKanjis: [],
  });

  writeSvg({
    directory: svgDirectory,
    fileName: "04e00.svg",
    pathData: "M0 0 L10 0",
  });

  writeSvg({
    directory: svgDirectory,
    fileName: "0529b.svg",
    pathData: "M0 0 L10 10",
  });

  writeSvg({
    directory: svgDirectory,
    fileName: "06728.svg",
    pathData: "M0 0 L0 10",
  });

  return {
    descriptorPath,
    requirementsPath,
    svgDirectory,
    catalogPath,
    manifestPath,
  };
}

test("collectDescriptorKanjis reads the descriptors wrapper", () => {
  assert.deepEqual(
    collectDescriptorKanjis({
      descriptors: {
        木: {},
        一: {},
      },
    }).sort(),
    ["一", "木"],
  );
});

test("buildRequiredSources keeps external unseen separate", () => {
  const sources = buildRequiredSources({
    descriptorCatalog: {
      descriptors: {
        一: {},
        木: {},
      },
    },
    requirements: {
      externalUnseen: ["力"],
      requiredKanjis: [],
    },
  });

  assert.deepEqual(sources, [
    {
      reason: "approved_descriptor",
      kanjis: ["一", "木"],
    },
    {
      reason: "external_unseen",
      kanjis: ["力"],
    },
    {
      reason: "explicit_requirement",
      kanjis: [],
    },
  ]);
});

test("dry-run generates the candidate without writing files", (t) => {
  const fixture = createFixture(t);

  const result = updateReferenceCatalog({
    ...fixture,
    apply: false,
    generatedAt: "2026-08-24T12:00:00.000Z",
  });

  assert.equal(result.changed, true);

  assert.equal(result.applied, false);

  assert.deepEqual(result.requiredKanjis, ["一", "力", "木"]);

  assert.deepEqual(result.generatedKanjis, ["一", "力", "木"]);

  assert.equal(fs.existsSync(fixture.catalogPath), false);

  assert.equal(fs.existsSync(fixture.manifestPath), false);
});

test("apply writes catalog and manifest", (t) => {
  const fixture = createFixture(t);

  const result = updateReferenceCatalog({
    ...fixture,
    apply: true,
    generatedAt: "2026-08-24T12:00:00.000Z",
  });

  assert.equal(result.applied, true);

  assert.equal(fs.existsSync(fixture.catalogPath), true);

  assert.equal(fs.existsSync(fixture.manifestPath), true);

  const catalog = JSON.parse(fs.readFileSync(fixture.catalogPath, "utf8"));

  const manifest = JSON.parse(fs.readFileSync(fixture.manifestPath, "utf8"));

  assert.deepEqual(Object.keys(catalog), ["一", "力", "木"]);

  assert.equal(manifest.catalog.kanjiCount, 3);

  assert.deepEqual(manifest.entries["力"].reasons, ["external_unseen"]);

  assert.equal(typeof manifest.entries["力"].sourceSvgSha256, "string");
});

test("second apply is idempotent and preserves existing files", (t) => {
  const fixture = createFixture(t);

  updateReferenceCatalog({
    ...fixture,
    apply: true,
    generatedAt: "2026-08-24T12:00:00.000Z",
  });

  const catalogBefore = fs.readFileSync(fixture.catalogPath, "utf8");

  const manifestBefore = fs.readFileSync(fixture.manifestPath, "utf8");

  const secondResult = updateReferenceCatalog({
    ...fixture,
    apply: true,
    generatedAt: "2026-08-25T12:00:00.000Z",
  });

  assert.equal(secondResult.changed, false);

  assert.equal(secondResult.applied, false);

  assert.deepEqual(secondResult.generatedKanjis, []);

  assert.deepEqual(secondResult.preservedKanjis, ["一", "力", "木"]);

  assert.equal(fs.readFileSync(fixture.catalogPath, "utf8"), catalogBefore);

  assert.equal(fs.readFileSync(fixture.manifestPath, "utf8"), manifestBefore);
});

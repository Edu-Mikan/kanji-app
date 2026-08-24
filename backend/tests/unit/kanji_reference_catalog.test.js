"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sortKanjis,
  serializeCanonicalJson,
  calculateSha256,
  normalizeRequiredKanjiSources,
  validateReferenceEntry,
  buildIncrementalCatalog,
  buildReferenceCatalogManifest,
} = require("../../services/kanji_reference_catalog");

function createStroke({ startX = 0, startY = 0, endX = 1, endY = 1 } = {}) {
  return {
    x: [startX, endX],
    y: [startY, endY],
  };
}

test("sortKanjis removes duplicates and uses code point order", () => {
  assert.deepEqual(sortKanjis(["木", "一", "力", "木"]), ["一", "力", "木"]);
});

test("canonical JSON is independent of object insertion order", () => {
  const left = {
    木: [createStroke()],
    一: [
      createStroke({
        endY: 0,
      }),
    ],
  };

  const right = {
    一: [
      createStroke({
        endY: 0,
      }),
    ],
    木: [createStroke()],
  };

  assert.equal(serializeCanonicalJson(left), serializeCanonicalJson(right));

  assert.equal(calculateSha256(left), calculateSha256(right));
});

test("normalizeRequiredKanjiSources combines reasons without duplicates", () => {
  const result = normalizeRequiredKanjiSources([
    {
      reason: "approved_descriptor",
      kanjis: ["木", "一"],
    },
    {
      reason: "external_unseen",
      kanjis: ["力"],
    },
    {
      reason: "pending_samples",
      kanjis: ["木", "力"],
    },
  ]);

  assert.deepEqual([...result.keys()], ["一", "力", "木"]);

  assert.deepEqual(result.get("力"), ["external_unseen", "pending_samples"]);

  assert.deepEqual(result.get("木"), [
    "approved_descriptor",
    "pending_samples",
  ]);
});

test("validateReferenceEntry accepts usable strokes", () => {
  const result = validateReferenceEntry({
    kanji: "力",
    strokes: [
      createStroke(),
      createStroke({
        startX: 1,
        endX: 0,
      }),
    ],
  });

  assert.equal(result.valid, true);

  assert.equal(result.strokeCount, 2);

  assert.deepEqual(result.errors, []);
});

test("validateReferenceEntry rejects mismatched coordinates", () => {
  const result = validateReferenceEntry({
    kanji: "力",
    strokes: [
      {
        x: [0, 1],
        y: [0],
      },
    ],
  });

  assert.equal(result.valid, false);

  assert.deepEqual(result.errors, ["invalid_stroke_0"]);
});

test("buildIncrementalCatalog preserves existing entries and generates only missing ones", () => {
  const generatedCalls = [];

  const existingReference = [
    createStroke({
      endY: 0,
    }),
  ];

  const result = buildIncrementalCatalog({
    existingCatalog: {
      一: existingReference,
    },
    requiredSources: [
      {
        reason: "approved_descriptor",
        kanjis: ["一", "木"],
      },
      {
        reason: "external_unseen",
        kanjis: ["力"],
      },
    ],
    buildEntry(kanji) {
      generatedCalls.push(kanji);

      return {
        strokes: [createStroke()],
        warnings: [],
        originalPathCount: 1,
        usefulStrokeCount: 1,
      };
    },
  });

  assert.deepEqual(generatedCalls, ["力", "木"]);

  assert.deepEqual(result.generatedKanjis, ["力", "木"]);

  assert.deepEqual(result.preservedKanjis, ["一"]);

  assert.strictEqual(result.catalog["一"], existingReference);

  assert.deepEqual(Object.keys(result.catalog), ["一", "力", "木"]);
});

test("buildIncrementalCatalog is idempotent when all references already exist", () => {
  let generationCount = 0;

  const catalog = {
    一: [
      createStroke({
        endY: 0,
      }),
    ],
    力: [createStroke()],
  };

  const result = buildIncrementalCatalog({
    existingCatalog: catalog,
    requiredSources: [
      {
        reason: "baseline",
        kanjis: ["一", "力"],
      },
    ],
    buildEntry() {
      generationCount++;

      return {
        strokes: [createStroke()],
      };
    },
  });

  assert.equal(generationCount, 0);

  assert.deepEqual(result.generatedKanjis, []);

  assert.deepEqual(result.preservedKanjis, ["一", "力"]);

  assert.deepEqual(result.catalog, catalog);
});

test("buildIncrementalCatalog rejects an invalid generated reference", () => {
  assert.throws(() => {
    buildIncrementalCatalog({
      existingCatalog: {},
      requiredSources: [
        {
          reason: "external_unseen",
          kanjis: ["力"],
        },
      ],
      buildEntry() {
        return {
          strokes: [],
        };
      },
    });
  }, /Generated reference is invalid for 力/);
});

test("manifest contains stable catalog and entry hashes", () => {
  const catalog = {
    一: [
      createStroke({
        endY: 0,
      }),
    ],
    力: [createStroke()],
  };

  const updateResult = {
    generatedKanjis: ["力"],
    preservedKanjis: ["一"],
    generationDetails: {
      一: {
        action: "preserved",
        reasons: ["approved_descriptor"],
      },
      力: {
        action: "generated",
        reasons: ["external_unseen"],
        warningCount: 0,
      },
    },
  };

  const manifest = buildReferenceCatalogManifest({
    catalog,
    updateResult,
    generatedAt: "2026-08-24T12:00:00.000Z",
    sourceDirectory: "./kanji_svg",
    generatorFile: "scripts/update_kanji_reference_catalog.js",
    generatorSha256: "generator-hash",
    sourceSvgSha256ByKanji: {
      一: "svg-hash-one",
      力: "svg-hash-power",
    },
  });

  assert.equal(manifest.catalog.kanjiCount, 2);

  assert.deepEqual(manifest.catalog.kanjis, ["一", "力"]);

  assert.equal(manifest.catalog.sha256, calculateSha256(catalog));

  assert.equal(manifest.entries["力"].sourceSvgSha256, "svg-hash-power");

  assert.deepEqual(manifest.entries["力"].reasons, ["external_unseen"]);

  assert.equal(manifest.entries["力"].strokeCount, 1);

  assert.equal(
    manifest.entries["力"].entrySha256,
    calculateSha256(catalog["力"]),
  );
});

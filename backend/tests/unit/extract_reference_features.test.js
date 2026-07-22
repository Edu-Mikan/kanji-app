const test = require("node:test");

const assert = require("node:assert/strict");

const {
  prepareReferenceStrokes,
  extractReferenceFeatures,
  analyzeReferenceGeometryQuality,
} = require("../../scripts/extract_reference_features");

function createSimpleStroke() {
  return {
    x: [0, 1],
    y: [0.5, 0.5],
  };
}

test("prepareReferenceStrokes should preserve raw, normalized and resampled strokes", () => {
  const rawStrokes = [createSimpleStroke()];

  const prepared = prepareReferenceStrokes(rawStrokes);

  assert.equal(prepared.raw, rawStrokes);

  assert.equal(prepared.normalized.length, 1);

  assert.equal(prepared.resampled.length, 1);

  assert.equal(prepared.resampled[0].x.length, 20);

  assert.equal(prepared.resampled[0].y.length, 20);
});

test("extractReferenceFeatures should generate geometry for a reference kanji", () => {
  const result = extractReferenceFeatures({
    kanji: "一",
    rawStrokes: [createSimpleStroke()],
  });

  assert.equal(result.kanji, "一");

  assert.equal(result.strokeCount, 1);

  assert.equal(result.reference.rawStrokeCount, 1);

  assert.ok(result.features.geometry);

  assert.equal(result.features.geometry.perStroke.length, 1);
});

test("analyzeReferenceGeometryQuality should report degenerate reference strokes", () => {
  const quality = analyzeReferenceGeometryQuality({
    features: {
      geometry: {
        perStroke: [
          {
            index: 0,
            width: 0,
            height: 0,
            length: 0,
            deltaX: 0,
            deltaY: 0,
          },
        ],
      },
    },
  });

  assert.equal(quality.ok, false);

  assert.equal(quality.warningCount, 1);

  assert.equal(quality.warnings[0].type, "degenerate_reference_stroke");

  assert.equal(quality.warnings[0].strokeIndex, 0);
});

test("analyzeReferenceGeometryQuality should accept non-degenerate reference strokes", () => {
  const quality = analyzeReferenceGeometryQuality({
    features: {
      geometry: {
        perStroke: [
          {
            index: 0,
            width: 0.5,
            height: 0.05,
            length: 0.5,
            deltaX: 0.5,
            deltaY: 0,
          },
        ],
      },
    },
  });

  assert.equal(quality.ok, true);

  assert.equal(quality.warningCount, 0);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_KANJI_DATASET_PATH,
  parseArgs,
  validateOptions,
  getReferenceStrokes,
  extractStrokeFeatures,
  classifyStrokeType,
  generateDescriptorCandidateFromReference,
} = require("../../scripts/generate_descriptor_candidate_from_reference");
test("parseArgs should use the incremental reference catalog by default", () => {
  const options = parseArgs([
    "--kanji",
    "一",
    "--out-json",
    "./candidate.json",
  ]);

  assert.equal(options.datasetPath, DEFAULT_KANJI_DATASET_PATH);

  assert.equal(
    options.datasetPath.endsWith("kanji_reference_catalog.json"),
    true,
  );
});

test("parseArgs should parse descriptor generation arguments", () => {
  const options = parseArgs([
    "--kanji",
    "一",
    "--dataset",
    "./kanji_full.json",
    "--out-json",
    "./candidate_reports_training/一_descriptor_candidate_from_reference.json",
  ]);

  assert.equal(options.kanji, "一");

  assert.ok(options.datasetPath.endsWith("kanji_full.json"));

  assert.ok(
    options.outputPath.endsWith("一_descriptor_candidate_from_reference.json"),
  );
});

test("validateOptions should reject missing kanji", () => {
  assert.throws(
    () =>
      validateOptions({
        datasetPath: "./kanji_full.json",
        outputPath: "./out.json",
      }),
    /Missing --kanji/,
  );
});

test("getReferenceStrokes should read root-level kanji entries", () => {
  const strokes = getReferenceStrokes(
    {
      一: [
        {
          x: [0, 1],
          y: [0, 0],
        },
      ],
    },
    "一",
  );

  assert.equal(strokes.length, 1);
});

test("extractStrokeFeatures should calculate horizontal stroke geometry", () => {
  const features = extractStrokeFeatures(
    {
      x: [0, 1],
      y: [0, 0],
    },
    0,
  );

  assert.equal(features.width, 1);

  assert.equal(features.height, 0);

  assert.equal(features.centerX, 0.5);

  assert.equal(features.angleAbs, 0);
});

test("classifyStrokeType should classify horizontal and vertical strokes", () => {
  assert.equal(
    classifyStrokeType({
      angleAbs: 0,
      width: 1,
      height: 0.05,
      deltaX: 1,
      deltaY: 0,
    }),
    "horizontal",
  );

  assert.equal(
    classifyStrokeType({
      angleAbs: 1.57,
      width: 0.05,
      height: 1,
      deltaX: 0,
      deltaY: 1,
    }),
    "vertical",
  );
});

test("generateDescriptorCandidateFromReference should create candidate descriptor", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "一",
    referenceStrokes: [
      {
        x: [0, 1],
        y: [0, 0],
      },
    ],
  });

  assert.equal(descriptor.kanji, "一");

  assert.equal(descriptor.enabled, false);

  assert.equal(descriptor.status, "candidate");

  assert.equal(descriptor.source, "auto_generated_from_reference");

  assert.equal(descriptor.strokeCount, 1);

  assert.equal(descriptor.strokes.length, 1);

  assert.ok(descriptor.hardChecks.includes("strokeCount"));
});

test("generateDescriptorCandidateFromReference should use horizontal global checks for single horizontal kanji", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "一",
    referenceStrokes: [
      {
        x: [0, 1],
        y: [0, 0],
      },
    ],
  });

  assert.deepEqual(descriptor.globalChecks.bboxHeight, {
    max: 0.25,
  });

  assert.deepEqual(descriptor.globalChecks.aspectRatio, {
    min: 3,
  });

  assert.deepEqual(descriptor.globalChecks.straightnessMean, {
    min: 0.65,
  });

  assert.equal(descriptor.hardChecks.includes("bboxHeight"), true);

  assert.equal(descriptor.hardChecks.includes("aspectRatio"), true);
});

test("generateDescriptorCandidateFromReference should use permissive horizontal width minimum for generated candidates", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "一",
    referenceStrokes: [
      {
        x: [0, 1],
        y: [0, 0],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].expected.width.min, 0.25);
});

test("generateDescriptorCandidateFromReference should use permissive vertical height minimum for generated candidates", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "丨",
    referenceStrokes: [
      {
        x: [0.5, 0.5],
        y: [0, 1],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].expected.height.min, 0.35);
});

test("generateDescriptorCandidateFromReference should use permissive diagonal width and height minimums", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "木",
    referenceStrokes: [
      {
        x: [0.8, 0.4],
        y: [0.3, 0.8],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].type, "left_diagonal");

  assert.equal(descriptor.strokes[0].expected.width.min, 0.08);

  assert.equal(descriptor.strokes[0].expected.height.min, 0.1);
});

test("generateDescriptorCandidateFromReference should allow wider generated vertical strokes", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "丨",
    referenceStrokes: [
      {
        x: [0.5, 0.55],
        y: [0, 1],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].type, "vertical");

  assert.equal(descriptor.strokes[0].expected.width.max, 0.4);

  assert.deepEqual(descriptor.strokes[0].expected.centerX, {
    min: 0.175,
    max: 0.875,
  });
});

test("generateDescriptorCandidateFromReference should use permissive diagonal centerX range", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "木",
    referenceStrokes: [
      {
        x: [0.4, 0.8],
        y: [0.3, 0.8],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].type, "right_diagonal");

  assert.deepEqual(descriptor.strokes[0].expected.centerX, {
    min: 0.05,
    max: 1,
  });
});

test("generateDescriptorCandidateFromReference should use permissive expected ranges for short horizontal marks", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "本",
    referenceStrokes: [
      {
        x: [0.3, 0.7],
        y: [0.7, 0.73],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].type, "horizontal");

  assert.deepEqual(descriptor.strokes[0].expected.angleAbs, {
    max: 1.05,
  });

  assert.equal(descriptor.strokes[0].expected.width.min, 0.08);

  assert.equal(descriptor.strokes[0].expected.height.max, 0.33);
});

test("generateDescriptorCandidateFromReference should use permissive horizontal centerY range", () => {
  const descriptor = generateDescriptorCandidateFromReference({
    kanji: "田",
    referenceStrokes: [
      {
        x: [0, 1],
        y: [0.4, 0.4],
      },
    ],
  });

  assert.equal(descriptor.strokes[0].type, "horizontal");

  assert.deepEqual(descriptor.strokes[0].expected.centerY, {
    min: 0.1,
    max: 0.7,
  });
});

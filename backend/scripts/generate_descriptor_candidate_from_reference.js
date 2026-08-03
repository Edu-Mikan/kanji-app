const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv) {
  const options = {
    kanji: null,
    datasetPath: null,
    outputPath: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    if (argument === "--kanji") {
      options.kanji = argv[index + 1];
      index++;
      continue;
    }

    if (argument === "--dataset") {
      options.datasetPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    if (argument === "--out-json") {
      options.outputPath = path.resolve(argv[index + 1]);
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Generate descriptor candidate from reference geometry

Usage:
  node scripts/generate_descriptor_candidate_from_reference.js \\
    --kanji 川 \\
    --dataset ./kanji_full.json \\
    --out-json ./candidate_reports_training/川_descriptor_candidate_from_reference.json
`);
}

function validateOptions(options) {
  if (options.help) {
    return;
  }

  if (!options.kanji) {
    throw new Error("Missing --kanji <kanji>");
  }

  if (!options.datasetPath) {
    throw new Error("Missing --dataset <path>");
  }

  if (!options.outputPath) {
    throw new Error("Missing --out-json <path>");
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getReferenceStrokes(dataset, kanji) {
  const strokes = dataset.kanjis?.[kanji] ?? dataset[kanji];

  if (!Array.isArray(strokes)) {
    throw new Error(`Reference strokes not found for kanji: ${kanji}`);
  }

  return strokes;
}

function finiteNumbers(values) {
  return values.filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
}

function calculatePathLength(points) {
  let length = 0;

  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];

    const dx = current.x - previous.x;
    const dy = current.y - previous.y;

    length += Math.hypot(dx, dy);
  }

  return length;
}

function extractStrokeFeatures(stroke, index) {
  const xValues = finiteNumbers(stroke.x ?? []);

  const yValues = finiteNumbers(stroke.y ?? []);

  if (xValues.length === 0 || yValues.length === 0) {
    throw new Error(`Invalid stroke geometry at index ${index}`);
  }

  if (xValues.length !== yValues.length) {
    throw new Error(`Mismatched x/y coordinate lengths at index ${index}`);
  }

  const points = xValues.map((x, pointIndex) => ({
    x,
    y: yValues[pointIndex],
  }));

  const minX = Math.min(...xValues);

  const maxX = Math.max(...xValues);

  const minY = Math.min(...yValues);

  const maxY = Math.max(...yValues);

  const width = maxX - minX;

  const height = maxY - minY;

  const firstPoint = points[0];

  const lastPoint = points[points.length - 1];

  const deltaX = lastPoint.x - firstPoint.x;

  const deltaY = lastPoint.y - firstPoint.y;

  const angleAbs = Math.atan2(Math.abs(deltaY), Math.abs(deltaX));

  const directDistance = Math.hypot(deltaX, deltaY);

  const pathLength = calculatePathLength(points);

  const straightness = pathLength > 0 ? directDistance / pathLength : 0;

  return {
    index,
    angleAbs,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
    minX,
    maxX,
    minY,
    maxY,
    deltaX,
    deltaY,
    straightness,
  };
}

function classifyStrokeType(features) {
  const absDeltaX = Math.abs(features.deltaX);

  const absDeltaY = Math.abs(features.deltaY);

  if (features.width < 0.08 && features.height < 0.08) {
    return "mark";
  }

  if (features.angleAbs <= 0.35 && features.width >= features.height) {
    return "horizontal";
  }

  if (features.angleAbs >= 1.15 && features.height >= features.width) {
    return "vertical";
  }

  if (absDeltaX > 0 && absDeltaY > 0) {
    return features.deltaX < 0 ? "left_diagonal" : "right_diagonal";
  }

  return "stroke";
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function buildRangeFromReference({
  value,
  minPadding = 0.15,
  maxPadding = 0.15,
  absoluteMin = 0,
  absoluteMax = 1,
}) {
  return {
    min: round(Math.max(absoluteMin, value - minPadding)),
    max: round(Math.min(absoluteMax, value + maxPadding)),
  };
}

function buildExpectedForStroke(type, features) {
  if (type === "horizontal") {
    const isShortHorizontal = features.width < 0.5;

    if (isShortHorizontal) {
      return {
        angleAbs: {
          max: 1.05,
        },
        width: {
          min: round(Math.max(0.05, features.width * 0.2)),
        },
        height: {
          max: round(Math.min(0.35, Math.max(0.08, features.height + 0.3))),
        },
        centerY: buildRangeFromReference({
          value: features.centerY,
          minPadding: 0.25,
          maxPadding: 0.25,
        }),
      };
    }

    return {
      angleAbs: {
        max: 0.65,
      },
      width: {
        min: round(Math.max(0.05, features.width * 0.3)),
      },
      height: {
        max: round(Math.min(0.45, Math.max(0.08, features.height + 0.2))),
      },
      centerY: buildRangeFromReference({
        value: features.centerY,
        minPadding: 0.25,
        maxPadding: 0.25,
      }),
    };
  }

  if (type === "vertical") {
    return {
      angleAbs: {
        min: 0.75,
      },
      height: {
        min: round(Math.max(0.05, features.height * 0.35)),
      },
      width: {
        max: round(Math.min(0.5, Math.max(0.08, features.width + 0.35))),
      },
      centerX: buildRangeFromReference({
        value: features.centerX,
        minPadding: 0.35,
        maxPadding: 0.35,
      }),
    };
  }

  if (type === "left_diagonal" || type === "right_diagonal") {
    return {
      angleAbs: {
        min: 0.15,
        max: 1.45,
      },
      width: {
        min: round(Math.max(0.05, features.width * 0.2)),
      },
      height: {
        min: round(Math.max(0.05, features.height * 0.2)),
      },
      centerX: buildRangeFromReference({
        value: features.centerX,
        minPadding: 0.55,
        maxPadding: 0.55,
      }),
      centerY: buildRangeFromReference({
        value: features.centerY,
        minPadding: 0.3,
        maxPadding: 0.3,
      }),
    };
  }

  return {
    width: {
      min: round(Math.max(0.02, features.width * 0.25)),
    },
    height: {
      min: round(Math.max(0.02, features.height * 0.25)),
    },
    centerX: buildRangeFromReference({
      value: features.centerX,
      minPadding: 0.35,
      maxPadding: 0.35,
    }),
    centerY: buildRangeFromReference({
      value: features.centerY,
      minPadding: 0.35,
      maxPadding: 0.35,
    }),
  };
}

function buildRoleId(type, index) {
  return `stroke${index}_${type}`;
}

function buildGlobalChecks(featuresByStroke) {
  const strokeTypes = featuresByStroke.map(classifyStrokeType);

  const isSingleHorizontal =
    featuresByStroke.length === 1 && strokeTypes[0] === "horizontal";

  if (isSingleHorizontal) {
    const stroke = featuresByStroke[0];

    return {
      bboxWidth: {
        min: round(Math.max(0.2, stroke.width * 0.45)),
      },
      bboxHeight: {
        max: 0.25,
      },
      aspectRatio: {
        min: 3,
      },
      straightnessMean: {
        min: 0.65,
      },
    };
  }

  const minX = Math.min(...featuresByStroke.map((stroke) => stroke.minX));

  const maxX = Math.max(...featuresByStroke.map((stroke) => stroke.maxX));

  const minY = Math.min(...featuresByStroke.map((stroke) => stroke.minY));

  const maxY = Math.max(...featuresByStroke.map((stroke) => stroke.maxY));

  const bboxWidth = maxX - minX;

  const bboxHeight = maxY - minY;

  const aspectRatio = bboxHeight > 0 ? bboxWidth / bboxHeight : null;

  const globalChecks = {
    bboxWidth: {
      min: round(Math.max(0.05, bboxWidth * 0.45)),
    },
    bboxHeight: {
      min: round(Math.max(0.05, bboxHeight * 0.45)),
    },
    straightnessMean: {
      min: 0.4,
    },
  };

  if (aspectRatio != null && Number.isFinite(aspectRatio)) {
    globalChecks.aspectRatio = {
      min: round(Math.max(0.1, aspectRatio * 0.35)),
      max: round(Math.min(10, aspectRatio * 2.5)),
    };
  }

  return globalChecks;
}

function generateDescriptorCandidateFromReference({ kanji, referenceStrokes }) {
  const featuresByStroke = referenceStrokes.map(extractStrokeFeatures);

  const strokes = featuresByStroke.map((features, index) => {
    const type = classifyStrokeType(features);

    const id = buildRoleId(type, index);

    return {
      id,
      type,
      referenceIndex: index,
      expected: buildExpectedForStroke(type, features),
      weights: {
        angleAbs: 2,
        width: 1,
        height: 1,
        centerX: 1,
        centerY: 1,
      },
    };
  });

  const hardChecks = [
    "strokeCount",
    "referenceStrokeCount",
    ...strokes.map((stroke) => `${stroke.id}.matches`),
    "bboxWidth",
    "bboxHeight",
  ];

  const globalChecks = buildGlobalChecks(featuresByStroke);

  if (globalChecks.aspectRatio) {
    hardChecks.push("aspectRatio");
  }

  return {
    kanji,
    enabled: false,
    status: "candidate",
    source: "auto_generated_from_reference",
    strokeCount: referenceStrokes.length,
    pattern: "auto_generated_reference_geometry",
    confidence: "low",
    description: `Descriptor candidato generado automáticamente desde la geometría de referencia para ${kanji}.`,
    strokes,
    relations: [],
    globalChecks,
    hardChecks,
    scoring: {
      validScore: 0.5,
      hardFailureScore: 10,
      softFailureMinScore: 0.75,
      softFailureMaxScore: 1.5,
    },
    debug: {
      notes:
        "Descriptor generado automáticamente. Debe calibrarse y revisarse antes de promocionarse a producción.",
      referenceFeatureSummary: featuresByStroke.map((features) => ({
        index: features.index,
        angleAbs: round(features.angleAbs),
        width: round(features.width),
        height: round(features.height),
        centerX: round(features.centerX),
        centerY: round(features.centerY),
        straightness: round(features.straightness),
        deltaX: round(features.deltaX),
        deltaY: round(features.deltaY),
      })),
    },
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  validateOptions(options);

  if (options.help) {
    printHelp();
    return;
  }

  const dataset = readJson(options.datasetPath);

  const referenceStrokes = getReferenceStrokes(dataset, options.kanji);

  const descriptor = generateDescriptorCandidateFromReference({
    kanji: options.kanji,
    referenceStrokes,
  });

  fs.mkdirSync(path.dirname(options.outputPath), {
    recursive: true,
  });

  fs.writeFileSync(
    options.outputPath,
    JSON.stringify(descriptor, null, 2),
    "utf8",
  );

  console.log("");
  console.log("DESCRIPTOR CANDIDATE FROM REFERENCE");
  console.log("===================================");
  console.log(`Kanji: ${descriptor.kanji}`);
  console.log(`Stroke count: ${descriptor.strokeCount}`);
  console.log(`Roles: ${descriptor.strokes.length}`);
  console.log(`Output: ${options.outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("");
    console.error("ERROR");
    console.error("-----");
    console.error(error.message);

    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  validateOptions,
  getReferenceStrokes,
  extractStrokeFeatures,
  classifyStrokeType,
  buildExpectedForStroke,
  generateDescriptorCandidateFromReference,
};

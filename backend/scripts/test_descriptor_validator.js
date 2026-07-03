const fs = require("fs");
const path = require("path");

const {
  loadKanjiDescriptors,
  getKanjiDescriptor,
} = require("../services/descriptor_loader");

const { validateByDescriptor } = require("../services/descriptor_validator");

function parseRecords(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [parsed];
  } catch {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/,$/, ""))
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function classifyResult(record, validation) {
  const manual = record.isCorrect;
  const automatic = validation?.isCorrect;

  if (manual === true && automatic === true) {
    return "TP";
  }

  if (manual === true && automatic === false) {
    return "FN";
  }

  if (manual === false && automatic === true) {
    return "FP";
  }

  if (manual === false && automatic === false) {
    return "TN";
  }

  return "UNKNOWN";
}

function main() {
  const samplesPath = process.argv[2] ?? "kanji_app.feedback_samples.json";
  const targetKanji = process.argv[3] ?? "八";

  const absoluteSamplesPath = path.resolve(process.cwd(), samplesPath);

  if (!fs.existsSync(absoluteSamplesPath)) {
    console.error(`No existe el fichero de muestras: ${absoluteSamplesPath}`);
    process.exit(1);
  }

  const allRecords = parseRecords(absoluteSamplesPath);
  const records = allRecords.filter(
    (record) =>
      record.kanji === targetKanji || record.expectedKanji === targetKanji,
  );

  const kanjiDescriptors = loadKanjiDescriptors();
  const descriptor = getKanjiDescriptor(kanjiDescriptors, targetKanji);

  if (!descriptor) {
    console.error(`No existe descriptor para el kanji: ${targetKanji}`);
    process.exit(1);
  }

  const counters = {
    TP: 0,
    TN: 0,
    FP: 0,
    FN: 0,
    UNKNOWN: 0,
  };

  console.log(`\nDescriptor test`);
  console.log(`Kanji: ${targetKanji}`);
  console.log(`Samples file: ${absoluteSamplesPath}`);
  console.log(`Records found: ${records.length}`);
  console.log(`Pattern: ${descriptor.pattern}`);
  console.log("=".repeat(80));

  for (const record of records) {
    const validation = validateByDescriptor({
      kanji: targetKanji,
      features: record.features,
      descriptor,
    });

    const resultType = classifyResult(record, validation);
    counters[resultType] += 1;

    const recognitionId = record.recognitionId ?? "(no recognitionId)";
    const manual = record.isCorrect;
    const automatic = validation?.isCorrect;
    const score = validation?.score;
    const descriptorMatchScore = validation?.descriptorMatchScore;

    console.log(`\n${recognitionId}`);
    console.log(`  result: ${resultType}`);
    console.log(`  manual isCorrect: ${manual}`);
    console.log(`  descriptor isCorrect: ${automatic}`);
    console.log(`  descriptor score: ${score}`);
    console.log(
      `  descriptorMatchScore: ${
        descriptorMatchScore != null
          ? descriptorMatchScore.toFixed(4)
          : descriptorMatchScore
      }`,
    );
    console.log(`  failedChecks: ${JSON.stringify(validation?.failedChecks)}`);
    console.log(
      `  hardFailedChecks: ${JSON.stringify(validation?.hardFailedChecks)}`,
    );
    console.log(`  roleMatches: ${JSON.stringify(validation?.roleMatches)}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("Summary");
  console.log(counters);

  const total = records.length || 1;
  const accuracy = (counters.TP + counters.TN) / total;

  console.log(`Accuracy: ${(accuracy * 100).toFixed(2)}%`);

  if (counters.FP > 0 || counters.FN > 0) {
    console.log(
      "\nHay falsos positivos o falsos negativos. Revisa los detalles anteriores.",
    );
  } else {
    console.log("\nSin falsos positivos ni falsos negativos en este conjunto.");
  }
}

main();

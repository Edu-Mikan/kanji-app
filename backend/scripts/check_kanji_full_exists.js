const fs = require("node:fs");
const path = require("node:path");

const kanjiFullPath = path.resolve("./kanji_full.json");

if (!fs.existsSync(kanjiFullPath)) {
  console.error("");
  console.error("ERROR");
  console.error("-----");
  console.error("Missing required file: ./kanji_full.json");
  console.error("");
  console.error(
    "This file is generated and intentionally not committed to Git.",
  );
  console.error("");
  console.error("Run this command before descriptor quality checks:");
  console.error("");
  console.error("  npm run generate:kanji-full");
  console.error("");

  process.exitCode = 1;
} else {
  console.log("Found ./kanji_full.json");
}

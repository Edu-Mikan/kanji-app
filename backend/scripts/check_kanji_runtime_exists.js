"use strict";

const fs = require("node:fs");
const path = require("node:path");

const runtimePath = path.resolve(process.cwd(), "kanji_runtime.json");

if (!fs.existsSync(runtimePath)) {
  console.error("");
  console.error("ERROR");
  console.error("-----");

  console.error("Missing required file: ./kanji_runtime.json");

  console.error("");

  console.error("Run this command before starting the backend:");

  console.error("");

  console.error("  npm run generate:kanji-runtime");

  process.exitCode = 1;
} else {
  console.log("Found ./kanji_runtime.json");
}

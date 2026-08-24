"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  isHanCharacter,
  addHanCharacters,
  getLessonFiles,
  collectLessonKanjis,
  collectTrainingKanjis,
  collectRuntimeKanjis,
  validateGeneratedRuntime,
} = require("../../scripts/generate_kanji_runtime");

function createTemporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kanji-runtime-test-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true,
  });

  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

test("isHanCharacter accepts one Han character", () => {
  assert.equal(isHanCharacter("力"), true);

  assert.equal(isHanCharacter("木"), true);

  assert.equal(isHanCharacter("A"), false);

  assert.equal(isHanCharacter(""), false);

  assert.equal(isHanCharacter("日本"), false);
});

test("addHanCharacters extracts only Han characters", () => {
  const kanjis = new Set();

  addHanCharacters(kanjis, "力A木1");

  assert.deepEqual([...kanjis], ["力", "木"]);
});

test("getLessonFiles returns only supported lesson files in stable order", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  writeJson(path.join(directory, "lecciones.json"), []);

  writeJson(path.join(directory, "lecciones_N1.json"), []);

  writeJson(path.join(directory, "lecciones_N5.json"), []);

  writeJson(path.join(directory, "lecciones_N6.json"), []);

  writeJson(path.join(directory, "training_kanji.json"), {});

  assert.deepEqual(getLessonFiles(directory), [
    "lecciones.json",
    "lecciones_N1.json",
    "lecciones_N5.json",
  ]);
});

test("collectLessonKanjis collects Han characters from lesson targets", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  writeJson(path.join(directory, "lecciones.json"), [
    {
      target: "日本",
    },
    {
      target: "力A",
    },
  ]);

  writeJson(path.join(directory, "lecciones_N1.json"), [
    {
      target: "木",
    },
  ]);

  const result = collectLessonKanjis({
    dataDirectory: directory,
  });

  assert.deepEqual(result.lessonFiles, ["lecciones.json", "lecciones_N1.json"]);

  assert.deepEqual([...result.kanjis], ["日", "本", "力", "木"]);
});

test("collectTrainingKanjis collects kanjis from all categories", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const trainingKanjiPath = path.join(directory, "training_kanji.json");

  writeJson(trainingKanjiPath, {
    categories: [
      {
        id: "baseline",
        kanjis: ["一", "木"],
      },
      {
        id: "external-unseen",
        kanjis: ["力", "木"],
      },
    ],
  });

  const result = collectTrainingKanjis({
    trainingKanjiPath,
  });

  assert.equal(result.categoryCount, 2);

  assert.deepEqual([...result.kanjis], ["一", "木", "力"]);
});

test("collectRuntimeKanjis combines lessons and training without duplicates", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  writeJson(path.join(directory, "lecciones.json"), [
    {
      target: "日本",
    },
    {
      target: "木",
    },
  ]);

  const trainingKanjiPath = path.join(directory, "training_kanji.json");

  writeJson(trainingKanjiPath, {
    categories: [
      {
        id: "training",
        kanjis: ["木", "力", "一"],
      },
    ],
  });

  const result = collectRuntimeKanjis({
    dataDirectory: directory,
    trainingKanjiPath,
  });

  assert.equal(result.lessonKanjiCount, 3);

  assert.equal(result.trainingCategoryCount, 1);

  assert.equal(result.trainingKanjiCount, 3);

  assert.equal(result.runtimeKanjis.length, 5);

  assert.deepEqual(
    new Set(result.runtimeKanjis),
    new Set(["一", "力", "日", "木", "本"]),
  );

  assert.equal(result.runtimeKanjis.includes("力"), true);
});

test("validateGeneratedRuntime accepts exact coverage", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const outputPath = path.join(directory, "kanji_runtime.json");

  writeJson(outputPath, {
    一: [
      {
        x: [0, 1],
        y: [0, 0],
      },
    ],
    力: [
      {
        x: [0, 1],
        y: [0, 1],
      },
    ],
  });

  const result = validateGeneratedRuntime({
    runtimeKanjis: ["一", "力"],
    outputPath,
  });

  assert.equal(result.generatedKanjiCount, 2);

  assert.deepEqual(result.missingKanjis, []);

  assert.deepEqual(result.unexpectedKanjis, []);

  assert.equal(result.outputSizeBytes > 0, true);
});

test("validateGeneratedRuntime rejects missing kanjis", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const outputPath = path.join(directory, "kanji_runtime.json");

  writeJson(outputPath, {
    一: [],
  });

  assert.throws(() => {
    validateGeneratedRuntime({
      runtimeKanjis: ["一", "力"],
      outputPath,
    });
  }, /missing kanjis: 力/);
});

test("validateGeneratedRuntime rejects unexpected kanjis", (t) => {
  const directory = createTemporaryDirectory();

  t.after(() => {
    fs.rmSync(directory, {
      recursive: true,
      force: true,
    });
  });

  const outputPath = path.join(directory, "kanji_runtime.json");

  writeJson(outputPath, {
    一: [],
    力: [],
  });

  assert.throws(() => {
    validateGeneratedRuntime({
      runtimeKanjis: ["一"],
      outputPath,
    });
  }, /unexpected kanjis: 力/);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = "scripts/inspect_mongo_feedback_samples.js";

function runCli(args, environmentOverrides = {}) {
  const environment = {
    ...process.env,
    ...environmentOverrides,
  };

  if (
    Object.hasOwn(environmentOverrides, "MONGO_URI") &&
    environmentOverrides.MONGO_URI === undefined
  ) {
    delete environment.MONGO_URI;
  }

  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
    env: environment,
  });
}

test("CLI prints help without requiring MongoDB", () => {
  const result = runCli(["--help"], {
    MONGO_URI: undefined,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.match(result.stdout, /MongoDB feedback sample inspector/);

  assert.match(result.stdout, /--out-json/);
  assert.match(result.stdout, /strictly read-only/i);
  assert.doesNotMatch(result.stdout, /--apply/);
});

test("CLI rejects --apply explicitly", () => {
  const result = runCli(["--apply"], {
    MONGO_URI: undefined,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERROR/);
  assert.match(result.stderr, /--apply is not supported/i);
});

test("CLI rejects an unknown argument", () => {
  const result = runCli(["--unknown-option"], {
    MONGO_URI: undefined,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ERROR/);
  assert.match(result.stderr, /Unknown argument: --unknown-option/);
});

test("CLI requires MONGO_URI without exposing a value", () => {
  const sensitiveUri =
    "mongodb://private-user:private-password" + "@private-host.invalid:27017";

  const result = runCli([], {
    MONGO_URI: undefined,
    TEST_SENSITIVE_MONGO_URI: sensitiveUri,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MONGO_URI is required/);

  const fullOutput = `${result.stdout}\n${result.stderr}`;

  assert.equal(fullOutput.includes("private-password"), false);

  assert.equal(fullOutput.includes(sensitiveUri), false);
});

test("CLI validates options before connecting to MongoDB", () => {
  const result = runCli(["--db", ""], {
    MONGO_URI: "mongodb://example.invalid:27017",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing value for --db/);

  assert.doesNotMatch(result.stderr, /example\.invalid/);
});

test("CLI module can be required without executing main", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      [
        `const cli = require("./${SCRIPT_PATH}");`,
        'if (typeof cli.parseArgs !== "function") {',
        '  throw new Error("parseArgs missing");',
        "}",
        'if (typeof cli.buildSafeConsoleSummary !== "function") {',
        '  throw new Error("buildSafeConsoleSummary missing");',
        "}",
      ].join("\n"),
    ],
    {
      cwd: BACKEND_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        MONGO_URI: "",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

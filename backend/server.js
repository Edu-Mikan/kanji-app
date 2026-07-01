const express = require("express");
const cors = require("cors");
const fs = require("fs");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const {
  normalizeStrokes,
  resampleStroke,
  getStrokeAngle,
  angleDifference,
  strokeLength,
  getStrokeVectors,
  compareStrokeShape,
  getDominantAngle,
  strokeBoundingBox,
  classifyAngle,
} = require("./services/stroke_utils");

const { extractAllFeatures } = require("./services/feature_extractor");
const { validateSimpleKanji } = require("./services/simple_kanji_rules");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/kanji_svg", express.static("kanji_svg"));

const PORT = process.env.PORT || 3000;
const ALGORITHM_VERSION = "heuristic-v2";
const TRAINING_DATA_SCHEMA_VERSION = 1;

const MONGO_URI = process.env.MONGO_URI;

// Como solo has podido añadir una variable en Render,
// dejamos estos valores fijos por defecto en el código.
const MONGO_DB_NAME = "kanji_app";
const MONGO_COLLECTION_FEEDBACK = "feedback_samples";

let mongoClient = null;
let feedbackCollection = null;
let mongoConnectionError = null;
let mongoConnectionAttemptedAt = null;

const kanjiDataset = JSON.parse(fs.readFileSync("./kanji_full.json", "utf-8"));

async function connectMongoIfConfigured() {
  mongoConnectionAttemptedAt = new Date().toISOString();
  mongoConnectionError = null;

  if (!MONGO_URI) {
    mongoConnectionError = "MONGO_URI no configurada";
    console.log("MONGO_URI no configurada. Se usará training_data.jsonl.");
    return;
  }

  if (feedbackCollection) {
    return;
  }

  console.log("Intentando conectar a MongoDB Atlas...");

  mongoClient = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  });

  await mongoClient.connect();

  const db = mongoClient.db(MONGO_DB_NAME);
  feedbackCollection = db.collection(MONGO_COLLECTION_FEEDBACK);

  await feedbackCollection.createIndex({ kanji: 1 });
  await feedbackCollection.createIndex({ expectedKanji: 1 });
  await feedbackCollection.createIndex({ isCorrect: 1 });
  await feedbackCollection.createIndex({ createdAt: -1 });
  await feedbackCollection.createIndex({ recognitionId: 1 });

  console.log(
    `Conectado a MongoDB: ${MONGO_DB_NAME}.${MONGO_COLLECTION_FEEDBACK}`,
  );
}

function prepareTrainingStrokes(strokes) {
  const normalized = normalizeStrokes(strokes);
  const resampled = normalized.map((s) => resampleStroke(s, 20));

  return {
    raw: strokes,
    normalized,
    resampled,
  };
}

// ================= TYPE =================
function getStrokeType(stroke) {
  const angle = Math.abs(getStrokeAngle(stroke));
  const a = angle > Math.PI / 2 ? Math.PI - angle : angle;

  if (a < 0.3) return "horizontal";
  if (a > 1.2) return "vertical";
  return "diagonal";
}

// ================= COMPARE =================
function compareStrokes(user, reference) {
  const complexity = reference.length;

  const userCount = user.length;
  const refCount = reference.length;

  const diff = Math.abs(userCount - refCount);
  const maxCount = Math.max(userCount, refCount);

  // 🔥 regla fuerte de strokes
  const ratio = diff / maxCount;

  // 🔥 BLOQUEO REAL por diferencia de strokes
  if (reference.length >= 6) {
    const diff = Math.abs(user.length - reference.length);

    if (diff >= 2) {
      return 10;
    }
  }

  // ================= HARD RULE: SIMPLE KANJI =================
  // 🔥 evita casos como 犬 vs 大
  if (complexity <= 4 && user.length < reference.length) {
    return 10;
  }

  // ================= SPECIAL CASE: 1 STROKE =================
  /* if (reference.length === 1 && user.length === 1) {
    const u = user[0];
    const r = reference[0];

    const uAngle = getDominantAngle(u);
    const rAngle = getDominantAngle(r);

    // 🔥 FIX IMPORTANTE: permitir líneas invertidas
    const angleDiff = Math.min(
      angleDifference(uAngle, rAngle),
      angleDifference(uAngle, rAngle + Math.PI),
    );

    // horizontales (一)
    if (Math.abs(uAngle) < 0.3 && Math.abs(rAngle) < 0.3) {
      return angleDiff * 0.3;
    }

    // orientación incorrecta → rechazo
    if (angleDiff > 0.4) {
      return 10;
    }

    const uLen = strokeLength(u);
    const rLen = strokeLength(r);

    const lenRatio = Math.abs(uLen - rLen) / (rLen + 1e-6);

    return angleDiff * 0.5 + lenRatio * 0.5;
  } */

  let totalError = 0;
  let used = new Array(reference.length).fill(false);

  // ================= HARD GLOBAL ORIENTATION CHECK =================
  // calculamos orientación global media
  const userAngles = user.map(getDominantAngle);
  const refAngles = reference.map(getDominantAngle);
  /*   

  // media absoluta (ignorando signo)
  const meanUserAngle =
    userAngles.reduce((a, b) => a + Math.abs(b), 0) / (userAngles.length || 1);

  const meanRefAngle =
    refAngles.reduce((a, b) => a + Math.abs(b), 0) / (refAngles.length || 1);

  // diferencia global
  const globalDiff = Math.abs(meanUserAngle - meanRefAngle);

  // 🔥 REGLA FUERTE: horizontal vs vertical
  if (globalDiff > 0.6) {
    return 9; // ❌ rechazo directo
  } */
  // ================= STRUCTURAL ORIENTATION CHECK =================

  const userTypes = user.map((s) => classifyAngle(getDominantAngle(s)));
  const refTypes = reference.map((s) => classifyAngle(getDominantAngle(s)));

  // ordenar para evitar problemas de orden de escritura
  userTypes.sort();
  refTypes.sort();

  // contar coincidencias
  let mismatch = 0;

  for (let i = 0; i < Math.min(userTypes.length, refTypes.length); i++) {
    if (userTypes[i] !== refTypes[i]) {
      mismatch++;
    }
  }

  // Para kanjis de 3 o mas trazos, rechazo duro por tipos.
  if (reference.length >= 3 && mismatch === refTypes.length) {
    return 10;
  }

  if (reference.length === 2 && mismatch === refTypes.length) {
    // Penalización moderada, pero dejamos que la comparación de forma decida.
    totalError += 0.25;
  }

  // 🔥 ordenar strokes por ángulo para mejorar matching
  const sortedUser = [...user].sort(
    (a, b) => getDominantAngle(a) - getDominantAngle(b),
  );

  const sortedRef = [...reference].sort(
    (a, b) => getDominantAngle(a) - getDominantAngle(b),
  );

  for (let i = 0; i < user.length; i++) {
    let bestError = Infinity;
    let bestIndex = -1;

    const u = sortedUser[i];

    for (let j = 0; j < reference.length; j++) {
      if (used[j]) continue;

      const r = sortedRef[j];
      const len = Math.min(u.x.length, r.x.length);

      // 🔥 NUEVO: error de forma real
      let error = compareStrokeShape(u, r) * 0.25;

      // orientación ligera

      //const angleDiff = angleDifference(getStrokeAngle(u), getStrokeAngle(r));
      // 🔥 NUEVO: usar ángulo dominante (mucho más preciso)
      const angleDiff = angleDifference(
        getDominantAngle(u),
        getDominantAngle(r),
      );

      // 🔥 diagonales (caso 八) → relajar
      if (angleDiff > 0.5 && angleDiff < 1.5) {
        error *= 0.7;
      }

      // 🔥 BONUS: relajar líneas rectas (horizontal/vertical)
      const uAngle = Math.abs(getDominantAngle(u));
      const rAngle = Math.abs(getDominantAngle(r));

      // horizontal
      if (uAngle < 0.2 && rAngle < 0.2) {
        error *= 0.7;
      }

      // vertical
      if (
        Math.abs(uAngle - Math.PI / 2) < 0.2 &&
        Math.abs(rAngle - Math.PI / 2) < 0.2
      ) {
        error *= 0.7;
      }

      const angleWeight = reference.length <= 3 ? 0.15 : 0.12;

      const angleTolerance = reference.length <= 3 ? 0.25 : 0.12;

      if (angleDiff > angleTolerance) {
        error += (angleDiff - angleTolerance) * angleWeight;
      }

      if (error < bestError) {
        bestError = error;
        bestIndex = j;
      }
    }

    if (bestIndex !== -1) {
      used[bestIndex] = true;
      totalError += bestError;
    } else {
      totalError += 0.5; // penalización fuerte
    }
  }

  // ================= UNUSED REFERENCE STROKES =================
  let unused = 0;
  for (let i = 0; i < used.length; i++) {
    if (!used[i]) unused++;
  }

  const missingRatio = unused / reference.length;

  // 🔥 penalización fuerte solo en complejos
  if (complexity >= 6) {
    totalError += missingRatio * 4.0;
  } else {
    totalError += missingRatio * 2.0;
  }

  // penalización extra por strokes de más
  if (user.length > reference.length) {
    totalError += (user.length - reference.length) * 1.2;
  }

  // ================= SCORE FINAL =================
  //let score = totalError / Math.max(user.length, reference.length);

  // ================= PARALLELISM CHECK =================
  // ================= PARALLELISM CHECK =================
  let parallelPenalty = 0;

  // 🔥 reutilizamos los ángulos ya calculados arriba
  for (let i = 0; i < Math.min(refAngles.length, userAngles.length); i++) {
    const diff = angleDifference(refAngles[i], userAngles[i]);

    if (diff > 0.4) {
      parallelPenalty += 0.8;
    }
  }

  totalError += parallelPenalty;

  // ================= SCRIBBLE DETECTION =================
  let totalLength = 0;

  for (let s of user) {
    totalLength += strokeLength(s);
  }

  const meanLength = totalLength / (user.length || 1);

  // 🔥 trazos muy pequeños → basura
  if (meanLength < 0.05) {
    return 10;
  }

  // ================= ANGLE VARIANCE =================
  let angles = user.map(getDominantAngle);
  let mean = angles.reduce((a, b) => a + b, 0) / (angles.length || 1);

  let variance =
    angles.reduce((sum, a) => {
      return sum + Math.pow(a - mean, 2);
    }, 0) / (angles.length || 1);

  // 🔥 todos los trazos iguales (|||| o /////)
  if (variance < 0.02 && user.length >= 3) {
    totalError += 2.5;
  }

  if (totalError > 20) {
    totalError = 20;
  }

  let score = totalError / reference.length;
  score = Math.min(score, 10);

  return score;
}

// ================= ENDPOINT =================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    mongoUriConfigured: Boolean(process.env.MONGO_URI),
    mongoConnected: Boolean(feedbackCollection),
    mongoConnectionAttemptedAt,
    mongoConnectionError,
    storage: feedbackCollection ? "mongo" : "jsonl",
    timestamp: new Date().toISOString(),
  });
});

/* app.post("/mongo/reconnect", async (req, res) => {
  try {
    feedbackCollection = null;
    mongoConnectionError = null;

    await connectMongoIfConfigured();

    res.json({
      ok: true,
      mongoUriConfigured: Boolean(process.env.MONGO_URI),
      mongoConnected: Boolean(feedbackCollection),
      storage: feedbackCollection ? "mongo" : "jsonl",
      mongoConnectionAttemptedAt,
      mongoConnectionError,
    });
  } catch (err) {
    mongoConnectionError = err.message;
    feedbackCollection = null;

    res.status(500).json({
      ok: false,
      mongoUriConfigured: Boolean(process.env.MONGO_URI),
      mongoConnected: false,
      storage: "jsonl",
      mongoConnectionAttemptedAt,
      mongoConnectionError: err.message,
    });
  }
});
 */
app.post("/recognize", async (req, res) => {
  try {
    const strokes = req.body.ink.strokes;
    const targetKanji = req.body.kanji;
    const referenceKanji = kanjiDataset[targetKanji];

    if (!referenceKanji) {
      return res.status(404).json({
        error: `Kanji not found in dataset: ${targetKanji}`,
      });
    }

    const recognitionId = crypto.randomUUID();
    const recognizeStartedAt = Date.now();
    const normalized = normalizeStrokes(strokes);
    const resampledUser = normalized.map((s) => resampleStroke(s, 20));
    const resampledRef = referenceKanji.map((s) => resampleStroke(s, 20));
    const heuristicScore = compareStrokes(resampledUser, resampledRef);

    const features = extractAllFeatures({
      userResampled: resampledUser,
      referenceResampled: resampledRef,
      userNormalized: normalized,
      score: heuristicScore,
    });

    const simpleValidation = validateSimpleKanji({
      kanji: targetKanji,
      features,
    });

    const validationStrategy = simpleValidation
      ? simpleValidation.strategy
      : "heuristic_score";

    const validationResult = simpleValidation
      ? simpleValidation.isCorrect
      : null;

    // Score final que verá frontend/test_screen.
    // Para kanjis con regla simple, la regla simple manda.
    let finalScore = heuristicScore;

    if (simpleValidation) {
      if (simpleValidation.isCorrect) {
        finalScore = Math.min(heuristicScore, 0.5);
      } else {
        const checks = simpleValidation.checks ?? {};

        const hardFailedChecksByStrategy = {
          cross_kanji: [
            "strokeCount",
            "referenceStrokeCount",
            "hasHorizontal",
            "hasVertical",
            "crosses",
            "verticalNearCenter",
            "horizontalNearCenter",
          ],

          roku_kanji: [
            "strokeCount",
            "referenceStrokeCount",
            "hasTopMark",
            "hasMiddleHorizontal",
            "hasTwoLowerStrokes",
            "leftDiagonal",
            "rightDiagonal",
            "topAboveHorizontal",
            "horizontalAboveLower",
            "leftRightSeparated",
            "lowerBelowHorizontal",
          ],

          three_horizontal_lines: [
            "strokeCount",
            "referenceStrokeCount",
            "topAboveMiddle",
            "middleAboveBottom",
            "bothGapsReasonable",
            "gapsBalanced",
          ],
          shichi_kanji: [
            "strokeCount",
            "referenceStrokeCount",
            "hasTopHorizontal",
            "hasSecondStroke",
            "secondStrokeDiagonalOrHook",
            "secondStrokeStartsNearTopZone",
            "secondStrokeOnRightSide",
            "secondStrokeExtendsDown",
            "topCrossesSecondXRange",
            "globalAspectReasonable",
          ],

          hachi_kanji: [
            "strokeCount",
            "referenceStrokeCount",
            "leftOnLeft",
            "rightOnRight",
            "leftRightSeparated",
            "leftDiagonal",
            "rightDiagonal",
            "rightTallerOrSimilar",
            "notTooHorizontal",
            "leftNotMuchHigherThanRight",
          ],
          default: [
            "strokeCount",
            "referenceStrokeCount",
            "topAboveMiddle",
            "middleAboveBottom",
            "bothGapsReasonable",
            "gapsBalanced",
          ],
        };

        const hardCheckNames =
          hardFailedChecksByStrategy[simpleValidation.strategy] ??
          hardFailedChecksByStrategy.default;

        const hardFailedChecks = hardCheckNames.filter(
          (checkName) => checks[checkName] === false,
        );

        const hasHardFailure =
          hardFailedChecks.length > 0 ||
          simpleValidation.reason === "missing_geometry_features" ||
          simpleValidation.reason === "invalid_stroke_count";

        if (hasHardFailure) {
          finalScore = 10;
        } else {
          // Fallo blando: no lo damos como perfecto,
          // pero tampoco lo hundimos a 10.
          finalScore = Math.min(Math.max(heuristicScore, 0.75), 1.5);
        }
      }
    }

    // Guardamos también el score heurístico original para debug.
    features.heuristicScore = heuristicScore;
    features.totalError = finalScore;

    // const logEntry = {
    //   kanji: targetKanji,
    //   features,
    //   score,
    //   timestamp: Date.now(),
    //   isCorrect: null,
    // };

    // guardar en fichero JSON (simple)
    //fs.appendFileSync("training_data.jsonl", JSON.stringify(logEntry) + "\n");

    res.send({
      kanji: targetKanji,
      //score: score,
      strokes: referenceKanji.length,

      score: finalScore,
      heuristicScore,

      features: features,
      algorithmVersion: ALGORITHM_VERSION,
      simpleValidation,
      validationStrategy,
      validationResult,
      recognitionId,
      timestamp: recognizeStartedAt,
      recognizeStartedAt,
      schemaVersion: TRAINING_DATA_SCHEMA_VERSION,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  }
});

app.post("/feedback", async (req, res) => {
  try {
    const {
      recognitionId,
      kanji,
      expectedKanji,
      features,
      score,
      isCorrect,
      strokes,
      source,
      validationStrategy,
      validationResult,
      simpleValidation,

      // Campos opcionales útiles para ML futuro
      sessionId,
      userId,
      durationMs,
      canvas,
      clientInfo,
      feedbackType,
    } = req.body;

    let strokesData = null;

    if (strokes && Array.isArray(strokes) && strokes.length > 0) {
      const prepared = prepareTrainingStrokes(strokes);

      strokesData = {
        strokesRaw: prepared.raw,
        strokesNormalized: prepared.normalized,
        strokesResampled: prepared.resampled,
      };
    }

    const now = Date.now();

    const entry = {
      schemaVersion: TRAINING_DATA_SCHEMA_VERSION,

      recognitionId: recognitionId ?? crypto.randomUUID(),

      source: source ?? "unknown",
      algorithmVersion: ALGORITHM_VERSION,

      // Mantengo kanji por compatibilidad
      kanji,

      // Nombre más claro para ML futuro
      expectedKanji: expectedKanji ?? kanji,

      features,
      score,

      // Feedback manual del usuario/tester
      isCorrect,

      // Tipo de feedback, por si más adelante tienes varios
      // Ej: "manual_debug", "user_feedback", "auto_log"
      feedbackType: feedbackType ?? "manual_debug",

      // Resultado de la estrategia automática del backend
      validationStrategy: validationStrategy ?? "unknown",
      validationResult: validationResult ?? null,
      simpleValidation: simpleValidation ?? null,

      // Contexto opcional
      sessionId: sessionId ?? null,
      userId: userId ?? null,
      durationMs: durationMs ?? null,
      canvas: canvas ?? null,
      clientInfo: clientInfo ?? null,

      ...(strokesData ?? {}),

      timestamp: now,
      createdAt: new Date(now).toISOString(),
    };

    let mongoInsertedId = null;

    if (feedbackCollection) {
      const result = await feedbackCollection.insertOne(entry);
      mongoInsertedId = result.insertedId;
    } else {
      fs.appendFileSync("training_data.jsonl", JSON.stringify(entry) + "\n");
    }

    res.json({
      ok: true,
      recognitionId: entry.recognitionId,
      savedTo: feedbackCollection ? "mongo" : "jsonl",
      mongoInsertedId,
    });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ error: "Error saving feedback" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  connectMongoIfConfigured().catch((err) => {
    mongoConnectionError = err.message;
    console.error(
      "No se pudo conectar a MongoDB. Se usará training_data.jsonl como fallback:",
      err,
    );
    feedbackCollection = null;
  });
});

const express = require("express");
const cors = require("cors");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/kanji_svg", express.static("kanji_svg"));

const PORT = process.env.PORT || 3000;
const ALGORITHM_VERSION = "heuristic-v1";
const kanjiDataset = JSON.parse(fs.readFileSync("./kanji_full.json", "utf-8"));

// ================= NORMALIZE =================
function normalizeStrokes(strokes) {
  let minX = Infinity,
    minY = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity;

  strokes.forEach((stroke) => {
    stroke.x.forEach((x) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    });
    stroke.y.forEach((y) => {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });

  const size = Math.max(maxX - minX, maxY - minY);

  // Evita división por cero si llega un trazo degenerado
  const safeSize = size === 0 ? 1 : size;

  return strokes.map((stroke) => ({
    x: stroke.x.map((x) => (x - minX) / safeSize),
    y: stroke.y.map((y) => (y - minY) / safeSize),
  }));
}

// ================= RESAMPLE =================
function resampleStroke(stroke, n = 20) {
  const newX = [];
  const newY = [];
  const total = stroke.x.length;

  if (total === 0) return { x: [], y: [] };

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const idx = t * (total - 1);

    const i1 = Math.floor(idx);
    const i2 = Math.ceil(idx);
    const ratio = idx - i1;

    const x = stroke.x[i1] * (1 - ratio) + stroke.x[i2] * ratio;
    const y = stroke.y[i1] * (1 - ratio) + stroke.y[i2] * ratio;

    newX.push(x);
    newY.push(y);
  }

  return { x: newX, y: newY };
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

// ================= ANGLE =================
function getStrokeAngle(stroke) {
  const dx = stroke.x[stroke.x.length - 1] - stroke.x[0];
  const dy = stroke.y[stroke.y.length - 1] - stroke.y[0];
  return Math.atan2(dy, dx);
}

function angleDifference(a1, a2) {
  let diff = Math.abs(a1 - a2);

  // normalizar a [0, π]
  if (diff > Math.PI) {
    diff = 2 * Math.PI - diff;
  }

  // 🔥 CLAVE ABSOLUTA: orientación (no dirección)
  // hace que θ y θ+π sean equivalentes
  if (diff > Math.PI / 2) {
    diff = Math.PI - diff;
  }

  return diff;
}

// ================= LENGTH =================
function strokeLength(stroke) {
  let len = 0;
  for (let i = 1; i < stroke.x.length; i++) {
    const dx = stroke.x[i] - stroke.x[i - 1];
    const dy = stroke.y[i] - stroke.y[i - 1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

// ================= VECTORS =================
function getStrokeVectors(stroke) {
  let vectors = [];
  for (let i = 0; i < stroke.x.length - 1; i++) {
    vectors.push({
      dx: stroke.x[i + 1] - stroke.x[i],
      dy: stroke.y[i + 1] - stroke.y[i],
    });
  }
  return vectors;
}

// ================= SHAPE =================
function compareStrokeShape(u, r) {
  const uv = getStrokeVectors(u);
  const rv = getStrokeVectors(r);

  let error = 0;
  const len = Math.min(uv.length, rv.length);

  for (let i = 0; i < len; i++) {
    const dot = uv[i].dx * rv[i].dx + uv[i].dy * rv[i].dy;
    const magU = Math.sqrt(uv[i].dx ** 2 + uv[i].dy ** 2);
    const magR = Math.sqrt(rv[i].dx ** 2 + rv[i].dy ** 2);

    const cos = dot / (magU * magR + 1e-6);
    //error += 1 - cos; // diferencia angular real

    let local = 1 - cos;

    // 🔥 ignorar micro-error (importante)
    if (local < 0.05) local = 0;

    error += local;
  }

  return error / (len || 1);
}

// ================= TYPE =================
function getStrokeType(stroke) {
  const angle = Math.abs(getStrokeAngle(stroke));
  const a = angle > Math.PI / 2 ? Math.PI - angle : angle;

  if (a < 0.3) return "horizontal";
  if (a > 1.2) return "vertical";
  return "diagonal";
}

// ================= DOMINANT ANGLE =================
function getDominantAngle(stroke) {
  let sum = 0;
  for (let i = 0; i < stroke.x.length - 1; i++) {
    const dx = stroke.x[i + 1] - stroke.x[i];
    const dy = stroke.y[i + 1] - stroke.y[i];
    sum += Math.atan2(dy, dx);
  }
  return sum / (stroke.x.length - 1 || 1);
}

// ================= BOUNDING BOX =================
function strokeBoundingBox(stroke) {
  return {
    minX: Math.min(...stroke.x),
    maxX: Math.max(...stroke.x),
    minY: Math.min(...stroke.y),
    maxY: Math.max(...stroke.y),
  };
}

function classifyAngle(angle) {
  // 🔥 normalizar a [0, π]
  let a = Math.abs(angle);

  if (a > Math.PI) {
    a = 2 * Math.PI - a;
  }

  if (a > Math.PI / 2) {
    a = Math.PI - a;
  }

  // 🔥 ahora sí clasificar correctamente
  if (a < 0.3) return "horizontal";
  if (Math.abs(a - Math.PI / 2) < 0.3) return "vertical";

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

  // 🔥 regla fuerte SOLO si completamente incoherente
  // 🔥 SOLO aplicar para 2 o más strokes
  if (reference.length >= 2 && mismatch === refTypes.length) {
    return 10;
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

  let score = totalError / reference.length;
  score = Math.min(score, 10);

  if (totalError > 8) {
    totalError = 8;
  }

  return score;
}

// ================= ENDPOINT =================
app.post("/recognize", async (req, res) => {
  try {
    const strokes = req.body.ink.strokes;
    const targetKanji = req.body.kanji;
    const referenceKanji = kanjiDataset[targetKanji];
    const normalized = normalizeStrokes(strokes);
    const resampledUser = normalized.map((s) => resampleStroke(s, 20));
    const resampledRef = referenceKanji.map((s) => resampleStroke(s, 20));

    // console.log("USER STROKES COUNT:", resampledUser.length);
    // console.log("REF STROKES COUNT:", resampledRef.length);

    // resampledUser.forEach((s, i) => {
    //   console.log("User stroke", i, "points:", s.x.length);
    // });

    const score = compareStrokes(resampledUser, resampledRef);

    // console.log(
    //   "User strokes:",
    //   strokes,
    //   "\nTarget kanji:",
    //   targetKanji,
    //   "Score:",
    //   score,
    // );

    const features = extractFeatures(resampledUser, resampledRef, score);

    const logEntry = {
      kanji: targetKanji,
      features,
      score,
      timestamp: Date.now(),

      // 🔴 ESTE LO COMPLETARÁS LUEGO DESDE FRONTEND
      isCorrect: null,
    };

    // guardar en fichero JSON (simple)
    //fs.appendFileSync("training_data.jsonl", JSON.stringify(logEntry) + "\n");

    // ================= FEATURE EXTRACTION =================
    function extractFeatures(user, reference, score) {
      let strokeErrors = [];
      let angleDiffs = [];

      for (let i = 0; i < Math.min(user.length, reference.length); i++) {
        const u = user[i];
        const r = reference[i];

        const len = Math.min(u.x.length, r.x.length);
        let error = 0;

        for (let k = 0; k < len; k++) {
          const dx = u.x[k] - r.x[k];
          const dy = u.y[k] - r.y[k];
          error += dx * dx + dy * dy;
        }

        error = Math.sqrt(error / len);
        strokeErrors.push(error);

        const aDiff = angleDifference(getStrokeAngle(u), getStrokeAngle(r));

        angleDiffs.push(aDiff);
      }

      return {
        strokeCountUser: user.length,
        strokeCountRef: reference.length,

        totalError: score,

        meanStrokeError:
          strokeErrors.reduce((a, b) => a + b, 0) / (strokeErrors.length || 1),

        maxStrokeError: Math.max(...strokeErrors, 0),

        angleDiffMean:
          angleDiffs.reduce((a, b) => a + b, 0) / (angleDiffs.length || 1),

        angleDiffMax: Math.max(...angleDiffs, 0),

        unusedStrokes: Math.abs(user.length - reference.length),
      };
    }

    res.send({
      kanji: targetKanji,
      score: score,
      strokes: referenceKanji.length,
      features: features,
      algorithmVersion: ALGORITHM_VERSION,
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error");
  }
});

app.post("/feedback", (req, res) => {
  try {
    const { kanji, features, score, isCorrect, strokes, source } = req.body;

    let strokesData = null;

    if (strokes && Array.isArray(strokes) && strokes.length > 0) {
      const prepared = prepareTrainingStrokes(strokes);

      strokesData = {
        strokesRaw: prepared.raw,
        strokesNormalized: prepared.normalized,
        strokesResampled: prepared.resampled,
      };
    }

    const entry = {
      source: source ?? "unknown",
      algorithmVersion: ALGORITHM_VERSION,
      kanji,
      features,
      score,
      isCorrect,
      ...(strokesData ?? {}),
      timestamp: Date.now(),
    };

    fs.appendFileSync("training_data.jsonl", JSON.stringify(entry) + "\n");

    res.json({ ok: true });
  } catch (err) {
    console.error("Error saving feedback:", err);
    res.status(500).json({ error: "Error saving feedback" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

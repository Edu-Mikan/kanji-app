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

module.exports = {
  normalizeStrokes,
  resampleStroke,
  strokeLength,
  getStrokeAngle,
  angleDifference,
  classifyAngle,
  getDominantAngle,
  strokeBoundingBox,
  getStrokeVectors,
  compareStrokeShape,
};

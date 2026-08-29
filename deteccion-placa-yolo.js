/**
 * deteccion-placa-yolo.js — Detección automática de la POSICIÓN de la
 * placa dentro del video, usando un modelo YOLOv8 ("license_plate_detector")
 * exportado a ONNX y ejecutado 100% en el navegador con onnxruntime-web
 * (WebAssembly, sin servidor).
 *
 * Este módulo reemplaza el recuadro guía FIJO que tenías antes: en vez de
 * exigir que el usuario encuadre la placa en una zona exacta de la
 * pantalla, el modelo la encuentra sola en cualquier parte del cuadro,
 * sin importar la distancia o el ángulo del vehículo — esto es lo que
 * corrige el problema de "no enfoca bien".
 *
 * El OCR (lectura de los caracteres) sigue haciéndose con Tesseract.js
 * exactamente como ya lo tenías en app.js; este módulo SOLO se encarga
 * de encontrar el recuadro donde está la placa antes de recortarla.
 *
 * REQUISITOS EN TU index.html (o el HTML que carga app.js):
 *
 *   <script src="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js"></script>
 *   <script src="deteccion-placa-yolo.js"></script>
 *   <script src="app.js"></script>
 *
 * (el orden importa: onnxruntime-web y este archivo deben cargar ANTES
 * que app.js, porque app.js llama a inicializarModeloYolo/detectarPlacaYolo).
 *
 * Y debes subir el archivo 'license_plate_detector.onnx' a la MISMA
 * carpeta de GitHub Pages donde está este script (mismo nivel que app.js).
 *
 * Si por cualquier motivo el modelo no carga (sin internet al CDN, el
 * .onnx no está publicado, etc.), este módulo simplemente reporta que
 * no está listo — app.js ya sabe volver al recuadro fijo de siempre en
 * ese caso, así que nunca se pierde la función existente.
 */

const YOLO_MODEL_URL = 'license_plate_detector.onnx';
const YOLO_INPUT_SIZE = 640;
const YOLO_SCORE_THRESHOLD = 0.35; // confianza mínima para aceptar una detección
const YOLO_IOU_THRESHOLD = 0.45;   // para descartar cajas duplicadas superpuestas (NMS)
const ORT_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

let _sesionYolo = null;
let _yoloListo = false;
let _yoloFallo = false; // true si no se pudo cargar (p. ej. sin internet al CDN)
let _yoloInicializando = null; // promesa en curso, para no cargar el modelo 2 veces

// Carga el modelo UNA sola vez (llamadas repetidas reutilizan la misma
// sesión). Se debe llamar antes de iniciar el escaneo de la cámara.
// Devuelve una promesa que resuelve a true/false según si quedó listo.
function inicializarModeloYolo() {
  if (_yoloListo || _yoloFallo) return Promise.resolve(_yoloListo);
  if (_yoloInicializando) return _yoloInicializando;

  if (typeof ort === 'undefined') {
    console.warn('[YOLO placas] onnxruntime-web no está cargado en la página; se usará el recuadro guía fijo como respaldo.');
    _yoloFallo = true;
    return Promise.resolve(false);
  }

  ort.env.wasm.wasmPaths = ORT_WASM_BASE_URL;

  _yoloInicializando = ort.InferenceSession.create(YOLO_MODEL_URL, { executionProviders: ['wasm'] })
    .then(function (sesion) {
      _sesionYolo = sesion;
      _yoloListo = true;
      return true;
    })
    .catch(function (err) {
      console.warn('[YOLO placas] No se pudo cargar license_plate_detector.onnx, se usará el recuadro guía fijo como respaldo:', err);
      _yoloFallo = true;
      return false;
    })
    .finally(function () { _yoloInicializando = null; });

  return _yoloInicializando;
}

function yoloEstaListo() { return _yoloListo; }
function yoloFallo() { return _yoloFallo; }

/**
 * Prepara el tensor de entrada 640x640 a partir del frame de video con
 * la técnica de "letterbox": mantiene la proporción original de la
 * imagen y rellena los bordes sobrantes con gris neutro, exactamente
 * como se hace al entrenar modelos YOLO. Guarda la escala y el relleno
 * usados para poder des-transformar las cajas detectadas de vuelta a
 * coordenadas del video real.
 */
function _letterboxDesdeVideo(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const escala = Math.min(YOLO_INPUT_SIZE / vw, YOLO_INPUT_SIZE / vh);
  const nuevoAncho = Math.round(vw * escala);
  const nuevoAlto = Math.round(vh * escala);
  const padX = Math.floor((YOLO_INPUT_SIZE - nuevoAncho) / 2);
  const padY = Math.floor((YOLO_INPUT_SIZE - nuevoAlto) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = YOLO_INPUT_SIZE;
  canvas.height = YOLO_INPUT_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(114,114,114)'; // relleno gris estándar de YOLO
  ctx.fillRect(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE);
  ctx.drawImage(video, 0, 0, vw, vh, padX, padY, nuevoAncho, nuevoAlto);

  const img = ctx.getImageData(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE).data;

  // El modelo espera CHW (canales primero), RGB, normalizado 0-1.
  const tam = YOLO_INPUT_SIZE * YOLO_INPUT_SIZE;
  const datos = new Float32Array(tam * 3);
  for (let i = 0; i < tam; i++) {
    datos[i] = img[i * 4] / 255;               // R
    datos[tam + i] = img[i * 4 + 1] / 255;      // G
    datos[2 * tam + i] = img[i * 4 + 2] / 255;  // B
  }

  return {
    tensor: new ort.Tensor('float32', datos, [1, 3, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE]),
    escala: escala, padX: padX, padY: padY
  };
}

// Intersección sobre unión de dos cajas {x1,y1,x2,y2} — para el NMS.
function _iou(a, b) {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter);
}

/**
 * Ejecuta el modelo sobre el frame actual del video y devuelve la caja
 * de la placa con MAYOR confianza, en coordenadas de píxel del video
 * ORIGINAL (no del tensor 640x640 interno). Devuelve null si no
 * encuentra ninguna placa por encima del umbral de confianza.
 *
 * video: el elemento <video> con la cámara activa (debe tener
 *        videoWidth/videoHeight ya disponibles).
 */
function detectarPlacaYolo(video) {
  if (!_yoloListo || !_sesionYolo) return Promise.resolve(null);

  const prep = _letterboxDesdeVideo(video);
  return _sesionYolo.run({ images: prep.tensor }).then(function (salida) {
    const clave = Object.keys(salida)[0]; // normalmente 'output0'
    const datos = salida[clave].data;      // plano: [1,5,8400] -> 5*8400 floats
    const numAnchors = salida[clave].dims[2];

    // Formato de salida (YOLOv8 detección, 1 sola clase, sin NMS interno):
    // fila 0 = cx, fila 1 = cy, fila 2 = w, fila 3 = h, fila 4 = score,
    // todo en coordenadas de píxel del tensor 640x640, score ya en 0-1.
    let candidatas = [];
    for (let i = 0; i < numAnchors; i++) {
      const score = datos[4 * numAnchors + i];
      if (score < YOLO_SCORE_THRESHOLD) continue;
      const cx = datos[i];
      const cy = datos[numAnchors + i];
      const w = datos[2 * numAnchors + i];
      const h = datos[3 * numAnchors + i];
      candidatas.push({
        x1: cx - w / 2, y1: cy - h / 2,
        x2: cx + w / 2, y2: cy + h / 2,
        score: score
      });
    }

    if (!candidatas.length) return null;

    // NMS simple: ordenar por confianza y descartar cajas que se
    // solapen demasiado con una ya aceptada (normalmente detecciones
    // repetidas de la misma placa).
    candidatas.sort(function (a, b) { return b.score - a.score; });
    const finales = [];
    for (let i = 0; i < candidatas.length; i++) {
      let solapa = false;
      for (let j = 0; j < finales.length; j++) {
        if (_iou(candidatas[i], finales[j]) > YOLO_IOU_THRESHOLD) { solapa = true; break; }
      }
      if (!solapa) finales.push(candidatas[i]);
    }

    const mejor = finales[0];

    // Deshacer el letterbox: pasar de coordenadas 640x640 a coordenadas
    // reales del video, restando el relleno y dividiendo por la escala.
    const x1v = (mejor.x1 - prep.padX) / prep.escala;
    const y1v = (mejor.y1 - prep.padY) / prep.escala;
    const x2v = (mejor.x2 - prep.padX) / prep.escala;
    const y2v = (mejor.y2 - prep.padY) / prep.escala;

    return {
      x1: Math.max(0, x1v), y1: Math.max(0, y1v),
      x2: Math.min(video.videoWidth, x2v), y2: Math.min(video.videoHeight, y2v),
      score: mejor.score
    };
  }).catch(function (err) {
    console.warn('[YOLO placas] Error en inferencia:', err);
    return null;
  });
}

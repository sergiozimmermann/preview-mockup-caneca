import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import './style.css';

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const group = new THREE.Group();
scene.add(group);

let mugMesh, innerMesh, topRim, bottomRim, handleMesh, artTexture;
let autoSpin = true;
let isExporting = false;
const clock = new THREE.Clock();

const ambient = new THREE.HemisphereLight(0xffffff, 0x1d2430, Number($('ambientPower').value));
scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 2.8);
key.position.set(-4, 6, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 1.2);
fill.position.set(4, 2, -3);
scene.add(fill);

function cmToScene(cm) { return cm / 4; }

function makeRoundedRectCanvasTexture(img, options) {
  const mugHeight = Number($('mugHeight').value);
  const mugDiameter = Number($('mugDiameter').value);
  const artW = Number($('artWidth').value);
  const artH = Number($('artHeight').value);
  const topMargin = Number($('topMargin').value);

  const circumference = Math.PI * mugDiameter;
  // The texture canvas represents the whole mug circumference.
  // The 21 cm artwork is centered inside that circumference, leaving the handle margins.
  const widthRatio = Math.min(1, artW / circumference);
  const heightRatio = Math.min(1, artH / mugHeight);
  const yOffsetRatio = topMargin / mugHeight;

  // 4096 keeps text/logos sharp on the 3D mug.
  const texW = 4096;
  const texH = 2048;
  const c = document.createElement('canvas');
  c.width = texW;
  c.height = texH;
  const ctx = c.getContext('2d');

  // Base white ceramic.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, texW, texH);

  const drawW = texW * widthRatio;
  const drawH = texH * heightRatio;
  const drawX = (texW - drawW) / 2;
  const drawY = texH * yOffsetRatio;

  // Crop/cover image into 21 × 9.7 art area without distortion.
  const srcRatio = img.width / img.height;
  const dstRatio = artW / artH;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, drawW, drawH);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  options.widthRatio = widthRatio;
  options.heightRatio = heightRatio;
  options.yOffsetRatio = yOffsetRatio;
  return texture;
}

function buildMug() {
  const params = readParams();
  group.clear();
  if (artTexture) artTexture.dispose();

  const radius = cmToScene(params.diameter / 2);
  const height = cmToScene(params.height);
  const segments = Math.max(64, Math.min(512, Number($('segments').value) || 192));
  const imageMapping = {};

  const radialSegments = segments;
  const heightSegments = 1;
  const geo = new THREE.CylinderGeometry(radius, radius, height, radialSegments, heightSegments, true);
  geo.rotateY(Math.PI); // Keeps the centered art area opposite to the handle at the default front view.

  const whiteTexture = new THREE.CanvasTexture(makeWhiteCanvas());
  whiteTexture.colorSpace = THREE.SRGBColorSpace;
  const texture = currentImage ? makeRoundedRectCanvasTexture(currentImage, imageMapping) : whiteTexture;

  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.34,
    metalness: 0,
    side: THREE.DoubleSide
  });
  mugMesh = new THREE.Mesh(geo, mat);
  group.add(mugMesh);

  const innerGeo = new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, height * 0.98, radialSegments, 1, true);
  const innerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color($('insideColor').value), roughness: 0.4, side: THREE.BackSide });
  innerMesh = new THREE.Mesh(innerGeo, innerMat);
  innerMesh.position.y = 0.005;
  group.add(innerMesh);

  topRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.96, radius * 0.04, 18, radialSegments),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28 })
  );
  topRim.rotation.x = Math.PI / 2;
  topRim.position.y = height / 2;
  group.add(topRim);

  bottomRim = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.93, radius * 0.025, 14, radialSegments),
    new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.35 })
  );
  bottomRim.rotation.x = Math.PI / 2;
  bottomRim.position.y = -height / 2;
  group.add(bottomRim);

  handleMesh = makeHandle(radius, height);
  group.add(handleMesh);

  // Handle at 0°. Printable preview center is opposite, 180°.
  handleMesh.rotation.y = 0;
  mugMesh.rotation.y = THREE.MathUtils.degToRad(Number($('oppositeCenterDeg').value) - 180);

  artTexture = texture;
  updateCamera();
}

// function makeHandle(radius, height) {
//   const curve = new THREE.CatmullRomCurve3([
//     new THREE.Vector3(radius * 1.02, height * 0.30, 0),
//     new THREE.Vector3(radius * 1.58, height * 0.26, 0),
//     new THREE.Vector3(radius * 1.75, 0, 0),
//     new THREE.Vector3(radius * 1.58, -height * 0.26, 0),
//     new THREE.Vector3(radius * 1.02, -height * 0.30, 0)
//   ]);
//   const tube = new THREE.TubeGeometry(curve, 80, radius * 0.09, 20, false);
//   const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32 });
//   const mesh = new THREE.Mesh(tube, mat);
//   const capGeo = new THREE.SphereGeometry(thickness * 0.95, 24, 16);
//   const capA = new THREE.Mesh(capGeo, mat);
//   const capB = new THREE.Mesh(capGeo, mat);
//   capA.position.copy(curve.getPoint(0));
//   capB.position.copy(curve.getPoint(1));

//   const handleGroup = new THREE.Group();
//   handleGroup.add(mesh, capA, capB);
//   return handleGroup;
// }

function makeHandle(radius, height) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(radius * 1.02, height * 0.30, 0),
    new THREE.Vector3(radius * 1.58, height * 0.26, 0),
    new THREE.Vector3(radius * 1.75, 0, 0),
    new THREE.Vector3(radius * 1.58, -height * 0.26, 0),
    new THREE.Vector3(radius * 1.02, -height * 0.30, 0)
  ]);
  const thickness = radius * 0.13;
  const tubeGeo = new THREE.TubeGeometry(curve, 96, thickness, 24, false);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.08, envMapIntensity: 1.05 });
  const mesh = new THREE.Mesh(tubeGeo, mat);

  const capGeo = new THREE.SphereGeometry(thickness * 1, 24, 16);
  const capA = new THREE.Mesh(capGeo, mat);
  const capB = new THREE.Mesh(capGeo, mat);
  capA.position.copy(curve.getPoint(0));
  capB.position.copy(curve.getPoint(1));

  const handleGroup = new THREE.Group();
  handleGroup.add(mesh, capA, capB);
  return handleGroup;
}

function makeWhiteCanvas() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

function readParams() {
  return {
    height: Number($('mugHeight').value),
    diameter: Number($('mugDiameter').value),
    artWidth: Number($('artWidth').value),
    artHeight: Number($('artHeight').value),
    topMargin: Number($('topMargin').value)
  };
}

function updateCamera() {
  const zoom = Number($('cameraZoom').value);
  const height = Number($('cameraHeight').value);
  camera.position.set(0, height, zoom);
  camera.lookAt(0, 0, 0);
}

function resizeToDisplay() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needsResize = canvas.width !== width || canvas.height !== height;
  if (needsResize) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function renderFrame() {
  // Durante a exportação o canvas muda para 1080p/2K/4K.
  // O loop de preview NÃO pode redimensionar/renderizar por cima, senão o vídeo gravado
  // pode sair com blocos sólidos/cores estranhas em alguns navegadores.
  if (!isExporting) {
    resizeToDisplay();
    if (autoSpin) group.rotation.y -= clock.getDelta() * 0.35;
    else clock.getDelta();
    renderer.render(scene, camera);
  } else {
    clock.getDelta();
  }
  requestAnimationFrame(renderFrame);
}

let currentImage = null;
let currentImageFilename = '';

function previewVideoFilename(ext) {
  const baseName = currentImageFilename.replace(/\.[^.]+$/, '') || 'caneca-360';
  return `preview ${baseName}.${ext}`;
}

$('artFile').addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  currentImageFilename = file.name;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    currentImage = img;
    buildMug();
    $('renderBtn').disabled = false;
    $('snapshotBtn').disabled = false;
    $('status').textContent = `Imagem carregada: ${img.width}×${img.height}px. Se não estiver em 19.5:9, ela será cortada centralizada.`;
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

for (const id of ['mugHeight','mugDiameter','artWidth','artHeight','topMargin','segments','insideColor','oppositeCenterDeg']) {
  $(id).addEventListener('input', buildMug);
}
$('cameraZoom').addEventListener('input', updateCamera);
$('cameraHeight').addEventListener('input', updateCamera);
$('ambientPower').addEventListener('input', () => ambient.intensity = Number($('ambientPower').value));

$('snapshotBtn').addEventListener('click', () => {
  autoSpin = false;
  group.rotation.y = Math.PI;
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.href = renderer.domElement.toDataURL('image/png');
  a.download = 'preview-caneca.png';
  a.click();
  autoSpin = true;
});

$('renderBtn').addEventListener('click', renderVideo);

async function renderVideo() {
  if (!currentImage) return;
  const [w, h] = $('resolution').value.split('x').map(Number);
  const fps = Number($('fps').value);
  const duration = Number($('duration').value);
  const bitrate = Number($('bitrate').value);

  if ('VideoEncoder' in window && await canUseMp4Encoder(w, h, fps, bitrate)) {
    await renderVideoMp4WebCodecs(w, h, fps, duration, bitrate);
  } else {
    await renderVideoRealtimeWebm(w, h, fps, duration, bitrate);
  }
}

async function renderVideoMp4WebCodecs(w, h, fps, duration, bitrate) {
  const totalFrames = Math.round(fps * duration);
  const oldSize = new THREE.Vector2();
  renderer.getSize(oldSize);
  const oldPixelRatio = renderer.getPixelRatio();
  const oldAspect = camera.aspect;

  autoSpin = false;
  isExporting = true;
  $('renderBtn').disabled = true;
  $('snapshotBtn').disabled = true;
  $('downloadLink').hidden = true;
  $('status').textContent = 'Renderizando MP4 frame a frame... mantenha esta aba aberta.';

  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const codec = await pickMp4Codec(w, h, fps, bitrate);
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: w, height: h },
    fastStart: 'in-memory'
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => { throw err; }
  });

  encoder.configure({
    codec,
    width: w,
    height: h,
    bitrate,
    framerate: fps,
    avc: { format: 'avc' }
  });

  const frameDurationUs = Math.round(1_000_000 / fps);

  try {
    for (let frame = 0; frame < totalFrames; frame++) {
      const t = frame / totalFrames;
      group.rotation.y = -Math.PI * 2 * t;
      renderer.render(scene, camera);
      renderer.getContext().flush();

      const bitmap = await createImageBitmap(renderer.domElement);
      const videoFrame = new VideoFrame(bitmap, {
        timestamp: frame * frameDurationUs,
        duration: frameDurationUs
      });
      encoder.encode(videoFrame, { keyFrame: frame % fps === 0 });
      videoFrame.close();
      bitmap.close?.();

      if (frame % 3 === 0 || frame === totalFrames - 1) {
        $('status').textContent = `Renderizando MP4 ${Math.round((frame + 1) / totalFrames * 100)}%...`;
        await nextPaint();
      }
    }

    await encoder.flush();
    encoder.close();
    muxer.finalize();

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    showDownload(blob, previewVideoFilename('mp4'), 'Baixar vídeo MP4');
    $('status').textContent = `Vídeo MP4 pronto: ${duration}s, ${fps} FPS, ${w}×${h}.`;
  } catch (err) {
    console.error(err);
    $('status').textContent = 'O encoder MP4 falhou neste navegador. Tentando exportar WEBM em tempo real...';
    try { encoder.close(); } catch {}
    await renderVideoRealtimeWebm(w, h, fps, duration, bitrate, { alreadyPrepared: true, oldSize, oldPixelRatio, oldAspect });
    return;
  } finally {
    restorePreview(oldSize, oldPixelRatio, oldAspect);
  }
}

async function renderVideoRealtimeWebm(w, h, fps, duration, bitrate, reuse = null) {
  const totalFrames = Math.round(fps * duration);
  const oldSize = reuse?.oldSize || new THREE.Vector2();
  if (!reuse) renderer.getSize(oldSize);
  const oldPixelRatio = reuse?.oldPixelRatio || renderer.getPixelRatio();
  const oldAspect = reuse?.oldAspect || camera.aspect;

  autoSpin = false;
  isExporting = true;
  $('renderBtn').disabled = true;
  $('snapshotBtn').disabled = true;
  $('downloadLink').hidden = true;
  $('status').textContent = 'Renderizando WEBM em tempo real... não minimize esta aba.';

  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  const stream = renderer.domElement.captureStream(fps);
  const mime = pickMime();
  const recorderOptions = mime ? { mimeType: mime, videoBitsPerSecond: bitrate } : { videoBitsPerSecond: bitrate };
  const recorder = new MediaRecorder(stream, recorderOptions);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise(resolve => recorder.onstop = resolve);
  recorder.start();

  const startTime = performance.now();
  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / totalFrames;
    group.rotation.y = -Math.PI * 2 * t;
    renderer.render(scene, camera);
    renderer.getContext().flush();
    $('status').textContent = `Renderizando WEBM ${Math.round((frame + 1) / totalFrames * 100)}%...`;

    // Mantém a gravação sincronizada com o relógio real.
    // MediaRecorder depende do tempo real; renderizar frames rápido demais gera duração errada.
    const nextFrameTime = startTime + ((frame + 1) * 1000 / fps);
    await waitUntil(nextFrameTime);
  }
  recorder.stop();
  await done;
  stream.getTracks().forEach(t => t.stop());

  const finalMime = recorder.mimeType || mime || 'video/webm';
  const blob = new Blob(chunks, { type: finalMime });
  showDownload(blob, previewVideoFilename('webm'), 'Baixar vídeo WEBM');

  if (!reuse) restorePreview(oldSize, oldPixelRatio, oldAspect);
  $('status').textContent = `Vídeo WEBM pronto. Se a duração vier sem metadados, converta com o comando do README.`;
}

async function canUseMp4Encoder(w, h, fps, bitrate) {
  if (!('VideoEncoder' in window) || !('VideoFrame' in window) || !('createImageBitmap' in window)) return false;
  return Boolean(await pickMp4Codec(w, h, fps, bitrate));
}

async function pickMp4Codec(w, h, fps, bitrate) {
  const codecs = [
    'avc1.64002a', // H.264 High, bom para 4K quando suportado
    'avc1.640028',
    'avc1.4d402a',
    'avc1.42e01f'
  ];
  for (const codec of codecs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: w,
        height: h,
        bitrate,
        framerate: fps,
        avc: { format: 'avc' }
      });
      if (support.supported) return codec;
    } catch {}
  }
  return '';
}

function showDownload(blob, filename, label) {
  const url = URL.createObjectURL(blob);
  const a = $('downloadLink');
  a.href = url;
  a.download = filename;
  a.textContent = label;
  a.hidden = false;
}

function restorePreview(oldSize, oldPixelRatio, oldAspect) {
  isExporting = false;
  renderer.setPixelRatio(oldPixelRatio);
  renderer.setSize(oldSize.x, oldSize.y, false);
  camera.aspect = oldAspect;
  camera.updateProjectionMatrix();
  $('renderBtn').disabled = false;
  $('snapshotBtn').disabled = false;
  autoSpin = true;
}

function waitUntil(targetTime) {
  const now = performance.now();
  const ms = Math.max(0, targetTime - now);
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nextPaint() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    // MP4 fica por último porque em alguns navegadores o MediaRecorder gera artefatos.
    'video/mp4;codecs=avc1.42E01E'
  ];
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

buildMug();
renderFrame();

import * as THREE from './vendor/three.module.js';

const $ = (id) => document.getElementById(id);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const storage = {
  get(key, fallback = null) { try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* storage can be blocked in private iframes */ } }
};
const lerp = (a, b, amount) => a + (b - a) * amount;
const TAU = Math.PI * 2;

/* -------------------------------------------------------------------------- */
/*  Water Game Arcade EX — 3D game layer                                     */
/*  The original 2D canvas simulation is replaced by a small custom 3D       */
/*  renderer: the rings, water, poles, particles and cabinet lighting are    */
/*  all actual Three.js objects.                                              */
/* -------------------------------------------------------------------------- */

const TOTAL_RINGS = 20;
const MIN_PER_POLE = 5;
const BASE_Y = -2.78;
// El tanque ocupa todo el volumen jugable. WATER_Y se conserva como altura de
// aparición para repartir los aros; WATER_TOP es la superficie real del agua.
const WATER_Y = -1.72;
const WATER_TOP = 2.55;
const RING_STEP = 0.34;
const RING_RADIUS = 0.34;
const GRAVITY = -5.6;
const NOZZLE_Y = BASE_Y + 0.12;
const JET_X = [-3.35, 0, 3.35];
const JET_COLORS = [0xff6b6b, 0x3fe2aa, 0x5bc8ff];
const GLYPHS = ['●', '■', '▲', '◆'];

const PALETTES = [
  { name: 'Normal', desc: 'Visión normal', colors: [
    { name: 'Bermellón', hex: '#e85b5b', glyph: '●' }, { name: 'Azul', hex: '#42b9f2', glyph: '■' },
    { name: 'Verde', hex: '#43d29c', glyph: '▲' }, { name: 'Dorado', hex: '#f0b84f', glyph: '◆' }
  ]},
  { name: 'Deuteranopia', desc: 'Rojo-verde', colors: [
    { name: 'Naranja', hex: '#f0a23a', glyph: '●' }, { name: 'Azul', hex: '#4ba9f2', glyph: '■' },
    { name: 'Rosa', hex: '#de81bc', glyph: '▲' }, { name: 'Crema', hex: '#f3df72', glyph: '◆' }
  ]},
  { name: 'Protanopia', desc: 'Ceguera al rojo', colors: [
    { name: 'Azul', hex: '#4ba9f2', glyph: '●' }, { name: 'Naranja', hex: '#f0a23a', glyph: '■' },
    { name: 'Magenta', hex: '#d47ac0', glyph: '▲' }, { name: 'Cian', hex: '#70d7f4', glyph: '◆' }
  ]},
  { name: 'Tritanopia', desc: 'Azul-amarillo', colors: [
    { name: 'Rojo', hex: '#ef6868', glyph: '●' }, { name: 'Magenta', hex: '#d47ac0', glyph: '■' },
    { name: 'Verde', hex: '#43d29c', glyph: '▲' }, { name: 'Gris', hex: '#a8b2bc', glyph: '◆' }
  ]},
  { name: 'Alto contraste', desc: 'Máxima diferenciación', colors: [
    { name: 'Blanco', hex: '#ffffff', glyph: '●' }, { name: 'Rojo', hex: '#ff3030', glyph: '■' },
    { name: 'Azul', hex: '#315cff', glyph: '▲' }, { name: 'Amarillo', hex: '#fff000', glyph: '◆' }
  ]}
];

const LEVELS = [
  null,
  { name: 'Clásico', poles: [{ x: -2.55, h: 2.55, spd: 0 }, { x: 0, h: 3.28, spd: 0 }, { x: 2.55, h: 2.55, spd: 0 }] },
  { name: 'Alturas', poles: [{ x: -3.0, h: 2.2, spd: 0 }, { x: 0, h: 3.36, spd: 0 }, { x: 3.0, h: 2.2, spd: 0 }] },
  { name: 'Escalera', poles: [{ x: -3.15, h: 3.25, spd: 0 }, { x: 0, h: 2.55, spd: 0 }, { x: 3.15, h: 2.0, spd: 0 }] },
  { name: 'Movimiento', poles: [{ x: -2.55, h: 2.25, spd: 0 }, { x: 0, h: 3.1, spd: .75 }, { x: 2.55, h: 2.25, spd: 0 }] },
  { name: 'Caos', poles: [{ x: -2.95, h: 2.35, spd: 1.1 }, { x: 0, h: 3.25, spd: .62 }, { x: 2.95, h: 2.2, spd: 1.38 }] },
  { name: 'Colores', poles: [
    { x: -2.55, h: 2.55, spd: 0, rc: 0, rn: 3 }, { x: 0, h: 3.28, spd: 0, rc: 1, rn: 3 }, { x: 2.55, h: 2.55, spd: 0, rc: 2, rn: 3 }
  ]},
  { name: 'Prisma', poles: [
    { x: -3, h: 2.2, spd: 0, rc: 3, rn: 3 }, { x: 0, h: 3.36, spd: 0, rc: 0, rn: 3 }, { x: 3, h: 2.2, spd: 0, rc: 1, rn: 3 }
  ]},
  { name: 'Arcoíris', poles: [
    { x: -3.15, h: 3.25, spd: 0, rc: 2, rn: 4 }, { x: 0, h: 2.55, spd: 0, rc: 3, rn: 3 }, { x: 3.15, h: 2.0, spd: 0, rc: 0, rn: 3 }
  ]},
  { name: 'Flujo', poles: [
    { x: -2.55, h: 2.25, spd: 0, rc: 1, rn: 3 }, { x: 0, h: 3.1, spd: .78, rc: 2, rn: 4 }, { x: 2.55, h: 2.25, spd: 0, rc: 3, rn: 3 }
  ]},
  { name: 'Maestro', poles: [
    { x: -2.95, h: 2.35, spd: 1.1, rc: 0, rn: 3 }, { x: 0, h: 3.25, spd: .62, rc: 1, rn: 4 }, { x: 2.95, h: 2.2, spd: 1.38, rc: 2, rn: 3 }
  ]}
];
const TOTAL_LEVELS = LEVELS.length - 1;

let paletteIndex = Number(storage.get('wrt_pal') || 0);
if (!Number.isFinite(paletteIndex) || paletteIndex < 0 || paletteIndex >= PALETTES.length) paletteIndex = 0;
let currentLevel = Number(storage.get('wrt_current_level') || 1);
let maxLevel = Number(storage.get('wrt_mlv') || 1);
maxLevel = clamp(Number.isFinite(maxLevel) ? maxLevel : 1, 1, TOTAL_LEVELS);
currentLevel = clamp(Number.isFinite(currentLevel) ? currentLevel : 1, 1, maxLevel);

const state = {
  score: 0,
  elapsed: 0,
  tiltX: 0,
  tiltY: 0,
  gameOver: false,
  winQueued: false,
  paused: true,
  lastFrame: 0,
  currentCombo: 1,
  lastUiScore: -1
};
const input = { jets: [false, false, false], keys: {}, gyro: false };
let rings = [];
let poles = [];
let particles = [];
let bubbles = [];
let waveTime = 0;
let jSoundTimer = 0;
let toastTimer = 0;
let playerName = storage.get('wrt_pname') || '';
let scoreTab = 'local';
let globalMode = 'today';
let globalLevel = 1;
let gyroOffset = { gamma: 0, beta: 0 };
let latestOrientation = { gamma: 0, beta: 60 };

/* -------------------------------------------------------------------------- */
/* Three.js scene                                                             */
/* -------------------------------------------------------------------------- */

const canvas = $('gameCanvas');
const waterScreen = $('waterScreen');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06182d, 8, 20);
const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
camera.position.set(0, .05, 14.8);
// El centro queda equilibrado entre el suelo y las puntas de los palos.
const cameraTarget = new THREE.Vector3(0, -.15, 0);
camera.lookAt(cameraTarget);

const ambientLight = new THREE.HemisphereLight(0x9be9ff, 0x061224, 1.65);
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xd7f8ff, 2.7);
keyLight.position.set(-4, 7, 7);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x26bbff, 6, 12, 2);
rimLight.position.set(4, 1.6, 3.4);
scene.add(rimLight);
const warmLight = new THREE.PointLight(0xffa84e, 3.2, 9, 2);
warmLight.position.set(-3.8, -2.25, 2.7);
scene.add(warmLight);

const world = new THREE.Group();
scene.add(world);
const backgroundGroup = new THREE.Group();
const stageGroup = new THREE.Group();
const poleGroup = new THREE.Group();
const ringGroup = new THREE.Group();
const effectGroup = new THREE.Group();
world.add(backgroundGroup, stageGroup, poleGroup, ringGroup, effectGroup);

function makeGradientTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#1f648a');
  g.addColorStop(.33, '#0e4168');
  g.addColorStop(.72, '#072647');
  g.addColorStop(1, '#031324');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  const glow = ctx.createRadialGradient(250, 120, 10, 250, 180, 330);
  glow.addColorStop(0, 'rgba(112,233,255,.27)');
  glow.addColorStop(1, 'rgba(112,233,255,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(160,240,255,${Math.random() * .10})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 8, 1);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const background = new THREE.Mesh(
  new THREE.PlaneGeometry(14, 8),
  new THREE.MeshBasicMaterial({ map: makeGradientTexture(), side: THREE.DoubleSide })
);
background.position.set(0, -.15, -2.45);
backgroundGroup.add(background);

const starPositions = new Float32Array(90 * 3);
for (let i = 0; i < 90; i++) {
  starPositions[i * 3] = (Math.random() - .5) * 12;
  starPositions[i * 3 + 1] = -2.7 + Math.random() * 6.4;
  starPositions[i * 3 + 2] = -1.8 + Math.random() * .8;
}
const stars = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions, 3)),
  new THREE.PointsMaterial({ color: 0xb6efff, size: .028, transparent: true, opacity: .7, depthWrite: false })
);
backgroundGroup.add(stars);

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x382a27, roughness: .78, metalness: .05 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(12, .22, 5.7), floorMaterial);
floor.position.set(0, BASE_Y - .2, .15);
floor.receiveShadow = true;
stageGroup.add(floor);
const floorTrim = new THREE.Mesh(new THREE.BoxGeometry(12, .035, 5.76), new THREE.MeshStandardMaterial({ color: 0x9c7a5b, roughness: .5, metalness: .12 }));
floorTrim.position.set(0, BASE_Y - .065, .15);
stageGroup.add(floorTrim);

const tankHeight = WATER_TOP - BASE_Y;
const waterVolume = new THREE.Mesh(
  new THREE.BoxGeometry(11.7, tankHeight, 4.95),
  new THREE.MeshPhysicalMaterial({ color: 0x167ca9, roughness: .12, metalness: .08, transmission: .12, transparent: true, opacity: .20, depthWrite: false, side: THREE.DoubleSide })
);
waterVolume.position.set(0, BASE_Y + tankHeight / 2, .1);
waterVolume.receiveShadow = true;
stageGroup.add(waterVolume);

// Lámina vertical que mantiene el aspecto de juguete lleno de agua incluso
// cuando la cámara del móvil mira de frente al tanque.
const waterBackdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(11.7, tankHeight, 48, 24),
  new THREE.MeshPhysicalMaterial({ color: 0x0c78aa, emissive: 0x052d51, emissiveIntensity: .65, roughness: .18, metalness: .08, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide })
);
waterBackdrop.position.set(0, BASE_Y + tankHeight / 2, -1.88);
stageGroup.add(waterBackdrop);

const waterGeometry = new THREE.PlaneGeometry(11.7, 4.95, 48, 18);
waterGeometry.rotateX(-Math.PI / 2);
const waterBaseZ = new Float32Array(waterGeometry.attributes.position.count);
for (let i = 0; i < waterGeometry.attributes.position.count; i++) waterBaseZ[i] = waterGeometry.attributes.position.getZ(i);
const waterSurface = new THREE.Mesh(
  waterGeometry,
  new THREE.MeshPhysicalMaterial({ color: 0x42c8ee, emissive: 0x063f66, emissiveIntensity: .6, roughness: .12, metalness: .22, transparent: true, opacity: .34, depthWrite: false, side: THREE.DoubleSide })
);
waterSurface.position.set(0, WATER_TOP, .1);
waterSurface.receiveShadow = true;
stageGroup.add(waterSurface);

const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x89eaff, emissive: 0x0c5f7e, emissiveIntensity: .75, roughness: .28, metalness: .48 });
for (const x of [-5.98, 5.98]) {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.08, tankHeight + .28, 5.1), edgeMaterial);
  edge.position.set(x, BASE_Y + tankHeight / 2, .08);
  edge.castShadow = true;
  stageGroup.add(edge);
}
const backRail = new THREE.Mesh(new THREE.BoxGeometry(11.95, .055, .055), edgeMaterial);
backRail.position.set(0, WATER_TOP, -1.95);
stageGroup.add(backRail);

const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: 0xc8f7ff, transparent: true, opacity: .33, roughness: .02, metalness: .1 });
const bubbleGroup = new THREE.Group();
effectGroup.add(bubbleGroup);
for (let i = 0; i < 28; i++) {
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .045, 8, 8), bubbleMaterial.clone());
  bubble.position.set((Math.random() - .5) * 10.8, BASE_Y + .16 + Math.random() * (tankHeight - .38), -.8 + Math.random() * 2.1);
  bubble.userData.speed = .05 + Math.random() * .13;
  bubble.userData.phase = Math.random() * TAU;
  bubbleGroup.add(bubble);
  bubbles.push(bubble);
}

const particlePositions = new Float32Array(480 * 3);
const particlePoints = new THREE.Points(
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(particlePositions, 3)),
  new THREE.PointsMaterial({ color: 0xa7efff, size: .085, transparent: true, opacity: .88, blending: THREE.AdditiveBlending, depthWrite: false })
);
particlePoints.frustumCulled = false;
effectGroup.add(particlePoints);

const jetBeams = [];
const nozzles = [];
for (let j = 0; j < 3; j++) {
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: 0x20333d, metalness: .75, roughness: .2, emissive: JET_COLORS[j], emissiveIntensity: .1 });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.17, .22, .24, 18), nozzleMaterial);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(JET_X[j], NOZZLE_Y, .72);
  nozzle.castShadow = true;
  effectGroup.add(nozzle);
  nozzles.push(nozzle);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(.31, 2.8, 20, 1, true),
    new THREE.MeshPhysicalMaterial({ color: JET_COLORS[j], emissive: JET_COLORS[j], emissiveIntensity: 1.1, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  beam.position.set(JET_X[j], NOZZLE_Y + 1.38, .58);
  effectGroup.add(beam);
  jetBeams.push(beam);
}

const glyphTextureCache = new Map();
function glyphTexture(text, dark = false) {
  const key = `${text}-${dark}`;
  if (glyphTextureCache.has(key)) return glyphTextureCache.get(key);
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = dark ? 'rgba(0,16,30,.74)' : 'rgba(255,255,255,.74)';
  ctx.font = '700 36px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 32, 33);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  glyphTextureCache.set(key, texture);
  return texture;
}

function roundedRect(ctx, x, y, width, height, radius) {
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, width, height, radius); return; }
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

function labelSprite(text, color = '#8deeff') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(3,16,28,.78)';
  roundedRect(ctx, 8, 9, 240, 46, 14); ctx.fill();
  ctx.strokeStyle = color; ctx.globalAlpha = .65; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = color; ctx.font = '700 25px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 33);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(.84, .21, 1);
  sprite.userData.canvas = c;
  sprite.userData.texture = texture;
  return sprite;
}
function updateLabel(sprite, text, color = '#8deeff') {
  const c = sprite.userData.canvas;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(3,16,28,.78)'; roundedRect(ctx, 8, 9, 240, 46, 14); ctx.fill();
  ctx.strokeStyle = color; ctx.globalAlpha = .65; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = color; ctx.font = '700 25px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 33);
  sprite.userData.texture.needsUpdate = true;
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse((obj) => {
      if (obj.geometry && obj.geometry !== waterGeometry) obj.geometry.dispose?.();
      if (obj.material && obj.material.map && !obj.userData?.shared) obj.material.map.dispose?.();
      if (obj.material && !obj.userData?.shared) obj.material.dispose?.();
    });
  }
}

function createPole(def) {
  const group = new THREE.Group();
  group.position.set(def.x, BASE_Y, 0);
  const capacity = Math.max(5, Math.floor((def.h - .18) / RING_STEP));
  const hasRequirement = def.rc !== undefined;
  const reqColor = hasRequirement ? PALETTES[paletteIndex].colors[def.rc].hex : '#b4e6f5';
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: reqColor, emissive: reqColor, emissiveIntensity: hasRequirement ? .28 : .08, roughness: .24, metalness: .42, transparent: true, opacity: .82 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.075, .12, def.h, 18), shaftMaterial);
  shaft.position.y = def.h / 2;
  shaft.castShadow = true;
  group.add(shaft);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: hasRequirement ? reqColor : 0x84b2c6, emissive: hasRequirement ? reqColor : 0x123c50, emissiveIntensity: .16, roughness: .3, metalness: .62 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.38, .48, .18, 24), baseMaterial);
  base.position.y = .09; base.castShadow = true; group.add(base);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.22, .045, 8, 24), baseMaterial);
  collar.rotation.x = Math.PI / 2; collar.position.y = .2; group.add(collar);
  const top = new THREE.Mesh(new THREE.SphereGeometry(.14, 18, 12), shaftMaterial);
  top.position.y = def.h; top.castShadow = true; group.add(top);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 8), new THREE.MeshBasicMaterial({ color: hasRequirement ? reqColor : 0x7feaff }));
  beacon.position.set(0, def.h + .12, 0); group.add(beacon);
  const label = labelSprite('0/5', hasRequirement ? reqColor : '#8deeff');
  label.position.set(0, def.h + .45, .12); group.add(label);
  const reqLabel = hasRequirement ? labelSprite(`${PALETTES[paletteIndex].colors[def.rc].glyph} 0/${def.rn}`, reqColor) : null;
  if (reqLabel) { reqLabel.scale.set(.84, .19, 1); reqLabel.position.set(0, -.22, .13); group.add(reqLabel); }
  poleGroup.add(group);
  return {
    group, shaft, top, beacon, label, reqLabel, x: def.x, baseX: def.x, h: def.h, spd: def.spd || 0, phase: Math.random() * TAU,
    capacity, reqColor: hasRequirement ? def.rc : -1, reqCount: def.rn || 0, rings: [], stress: 0, rejectCd: 0, lastColor: -1, combo: 0, vX: 0
  };
}

function createRing(ci, index) {
  const info = PALETTES[paletteIndex].colors[ci];
  const color = new THREE.Color(info.hex);
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .28, roughness: .2, metalness: .32 });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, .088, 16, 36), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.rotation.set(Math.random() * .35, Math.random() * .35, Math.random() * TAU);
  const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(info.glyph, ['#ffffff', '#f3df72', '#fff000'].includes(info.hex.toLowerCase())), transparent: true, depthTest: false }));
  glyph.userData.shared = true;
  glyph.scale.set(.27, .27, 1); glyph.position.z = .12; mesh.add(glyph);
  ringGroup.add(mesh);
  return {
    mesh, ci, color: info.hex, glyph: info.glyph, index, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    scored: false, pole: null, stackIndex: -1, targetY: 0, points: 0, spin: (Math.random() - .5) * 2.2,
    seed: Math.random() * TAU
  };
}

function resetRings() {
  clearGroup(ringGroup);
  rings = [];
  let index = 0;
  for (let ci = 0; ci < 4; ci++) {
    for (let n = 0; n < 5; n++) {
      const ring = createRing(ci, index++);
      ring.x = -4.45 + Math.random() * 8.9;
      ring.y = BASE_Y + .35 + Math.random() * (WATER_TOP - BASE_Y - 1.05);
      ring.z = -.5 + Math.random() * 1.55;
      ring.vx = (Math.random() - .5) * .55;
      ring.vy = (Math.random() - .5) * .35;
      ring.mesh.position.set(ring.x, ring.y, ring.z);
      rings.push(ring);
    }
  }
  // Mezcla la secuencia para que cada partida tenga una distribución distinta.
  for (let i = rings.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rings[i], rings[j]] = [rings[j], rings[i]];
  }
}

function updatePoleLabel(pole) {
  const color = pole.reqColor >= 0 ? PALETTES[paletteIndex].colors[pole.reqColor].hex : '#8deeff';
  const labelText = pole.rings.length >= pole.capacity ? `✓${pole.rings.length}` : `${pole.rings.length}/${MIN_PER_POLE}`;
  const labelColor = pole.rings.length >= MIN_PER_POLE ? '#52e4ae' : color;
  const labelKey = `${labelText}|${labelColor}`;
  if (pole._labelKey !== labelKey) {
    updateLabel(pole.label, labelText, labelColor);
    pole._labelKey = labelKey;
  }
  if (pole.reqLabel) {
    const req = PALETTES[paletteIndex].colors[pole.reqColor];
    const count = pole.rings.filter((ring) => ring.ci === pole.reqColor).length;
    const reqText = `${req.glyph} ${count}/${pole.reqCount}`;
    const reqColor = count >= pole.reqCount ? '#52e4ae' : req.hex;
    const reqKey = `${reqText}|${reqColor}`;
    if (pole._reqLabelKey !== reqKey) {
      updateLabel(pole.reqLabel, reqText, reqColor);
      pole._reqLabelKey = reqKey;
    }
  }
}

function initGame(level = currentLevel) {
  currentLevel = clamp(level, 1, maxLevel);
  storage.set('wrt_current_level', String(currentLevel));
  state.score = 0; state.elapsed = 0; state.tiltX = 0; state.tiltY = 0; state.gameOver = false; state.winQueued = false; state.currentCombo = 1;
  input.jets.fill(false); input.keys = {};
  clearGroup(poleGroup);
  poles = LEVELS[currentLevel].poles.map(createPole);
  resetRings();
  updateUI(true);
  $('endOv').classList.remove('show');
  $('menuLevel').textContent = currentLevel;
}

/* -------------------------------------------------------------------------- */
/* Water and gameplay physics                                                 */
/* -------------------------------------------------------------------------- */

function updateWater(dt) {
  waveTime += dt;
  const pos = waterGeometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = waterBaseZ[i];
    const wave = Math.sin(x * 1.25 + waveTime * 2.0) * .035 + Math.cos(z * 1.5 - waveTime * 1.35) * .026 + Math.sin((x + z) * 2.8 + waveTime * 1.1) * .014;
    pos.setZ(i, z + wave);
  }
  pos.needsUpdate = true;
  if (Math.floor(waveTime * 30) % 2 === 0) waterGeometry.computeVertexNormals();
  stars.rotation.z = Math.sin(waveTime * .08) * .012;
  bubbles.forEach((bubble, index) => {
    bubble.position.y += bubble.userData.speed * dt;
    bubble.position.x += Math.sin(waveTime * .7 + bubble.userData.phase) * .0015;
    if (bubble.position.y > WATER_TOP - .12) {
      bubble.position.y = BASE_Y + .13;
      bubble.position.x = (Math.random() - .5) * 10.7;
      bubble.position.z = -.8 + Math.random() * 2.1;
    }
    const pulse = .8 + Math.sin(waveTime * 2 + index) * .2;
    bubble.scale.setScalar(pulse);
  });
}

function jetDirection(index) {
  const swing = Math.sin(state.elapsed * 1.8 + index * 2.1) * .36 + state.tiltX * .045;
  return new THREE.Vector3(Math.sin(swing), Math.cos(swing), 0);
}

function updateJetVisuals(dt) {
  for (let j = 0; j < 3; j++) {
    const active = input.jets[j] && !state.paused && !state.gameOver;
    const beam = jetBeams[j];
    const nozzle = nozzles[j];
    const direction = jetDirection(j);
    const length = 2.8;
    beam.position.set(JET_X[j] + direction.x * length / 2, NOZZLE_Y + direction.y * length / 2, .58);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    beam.material.opacity = lerp(beam.material.opacity, active ? .24 : 0, Math.min(1, dt * 13));
    beam.material.emissiveIntensity = active ? 1.35 + Math.sin(state.elapsed * 18) * .25 : .5;
    nozzle.material.emissiveIntensity = active ? .75 : .1;
    nozzle.scale.setScalar(active ? 1.06 + Math.sin(state.elapsed * 20) * .04 : 1);
  }
}

function spawnJetParticles(index) {
  const direction = jetDirection(index);
  for (let i = 0; i < 5; i++) {
    const spread = (Math.random() - .5) * .22;
    particles.push({
      x: JET_X[index] + spread, y: NOZZLE_Y + .16, z: .55 + (Math.random() - .5) * .16,
      vx: direction.x * (1.8 + Math.random() * 1.8) + (Math.random() - .5) * .65,
      vy: direction.y * (4.2 + Math.random() * 2.5), vz: (Math.random() - .5) * .5,
      life: .46 + Math.random() * .5, maxLife: .9, size: .6 + Math.random() * .6
    });
  }
  if (particles.length > 460) particles.splice(0, particles.length - 460);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; p.vy -= 2.1 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.life <= 0 || p.y < BASE_Y - .2) particles.splice(i, 1);
  }
  const positions = particlePoints.geometry.attributes.position.array;
  for (let i = 0; i < 480; i++) {
    const p = particles[i];
    positions[i * 3] = p ? p.x : -100;
    positions[i * 3 + 1] = p ? p.y : -100;
    positions[i * 3 + 2] = p ? p.z : -100;
  }
  particlePoints.geometry.attributes.position.needsUpdate = true;
}

function updateTilt(dt) {
  if (input.gyro) {
    // El giroscopio escribe el valor directamente desde onOrientation.
  } else {
    let x = 0; let y = 0;
    if (input.keys.ArrowLeft) x -= 1;
    if (input.keys.ArrowRight) x += 1;
    if (input.keys.ArrowUp) y -= 1;
    if (input.keys.ArrowDown) y += 1;
    if (x !== 0) state.tiltX = clamp(state.tiltX + x * dt * 1.8, -1, 1);
    else state.tiltX *= Math.exp(-dt * 4.8);
    if (y !== 0) state.tiltY = clamp(state.tiltY + y * dt * 1.8, -1, 1);
    else state.tiltY *= Math.exp(-dt * 4.8);
  }
  const horizontalWidth = 43;
  const verticalWidth = 43;
  const hx = Math.abs(state.tiltX) * horizontalWidth;
  const hy = Math.abs(state.tiltY) * verticalWidth;
  const hFill = $('hFill'); const vFill = $('vFill');
  hFill.style.width = `${hx}px`; hFill.style.left = `${state.tiltX < 0 ? horizontalWidth - hx : horizontalWidth}px`;
  vFill.style.width = `${hy}px`; vFill.style.left = `${state.tiltY < 0 ? verticalWidth - hy : verticalWidth}px`;
}

function updatePoles(dt) {
  for (const pole of poles) {
    const previousX = pole.x;
    if (pole.spd) {
      pole.phase += pole.spd * dt;
      pole.x = pole.baseX + Math.sin(pole.phase) * .94;
      pole.vX = (pole.x - previousX) / Math.max(dt, .001);
      pole.group.position.x = pole.x - pole.baseX;
    } else {
      pole.vX = 0;
    }
    pole.rejectCd = Math.max(0, pole.rejectCd - dt);
    if (!pole.rings.length) {
      pole.stress = Math.max(0, pole.stress - dt * 3.6);
      continue;
    }
    let pressure = Math.abs(state.tiltX) * .11 + (state.tiltY < -.15 ? Math.abs(state.tiltY) * .08 : 0);
    for (let j = 0; j < 3; j++) {
      if (!input.jets[j]) continue;
      const distance = Math.abs(pole.x - JET_X[j]);
      if (distance < 1.55) pressure += (1 - distance / 1.55) * (.52 + Math.min(.24, jSoundTimer * .1));
    }
    if (pressure > .025) pole.stress += pressure * dt;
    else pole.stress = Math.max(0, pole.stress - dt * 1.7);
    const comboCount = countColorCombos(pole).combos;
    const ejectMultiplier = comboCount >= 1 ? 1.55 : 1;
    if (pole.rejectCd <= 0 && pole.stress > 2.35 / ejectMultiplier) {
      if (pole.stress > 4.2 / ejectMultiplier) ejectAll(pole);
      else ejectRing(pole.rings[pole.rings.length - 1], true);
      pole.rejectCd = .72;
      pole.stress = .05;
    }
    const danger = clamp(pole.stress / 2.35, 0, 1);
    pole.shaft.material.emissiveIntensity = .12 + danger * .9;
    pole.top.material.emissiveIntensity = .15 + danger * 1.2;
    pole.beacon.material.color.set(danger > .72 ? 0xff4c62 : pole.reqColor >= 0 ? PALETTES[paletteIndex].colors[pole.reqColor].hex : 0x7feaff);
    const labelText = pole.rings.length >= pole.capacity ? `✓${pole.rings.length}` : `${pole.rings.length}/${MIN_PER_POLE}`;
    const labelColor = danger > .72 ? '#ff6672' : pole.rings.length >= MIN_PER_POLE ? '#52e4ae' : pole.reqColor >= 0 ? PALETTES[paletteIndex].colors[pole.reqColor].hex : '#8deeff';
    const labelKey = `${labelText}|${labelColor}`;
    if (pole._labelKey !== labelKey) { updateLabel(pole.label, labelText, labelColor); pole._labelKey = labelKey; }
    for (const ring of pole.rings) {
      const dangerShake = danger * danger * .045;
      ring.x = pole.x; ring.y = ring.targetY; ring.z = .04;
      ring.mesh.position.x = pole.x + (Math.random() - .5) * dangerShake;
      ring.mesh.position.y = ring.targetY + (Math.random() - .5) * dangerShake;
      ring.mesh.position.z = .04 + Math.sin(state.elapsed * 2 + ring.seed) * danger * .035;
      ring.mesh.rotation.z += ring.spin * dt * .15;
      ring.mesh.rotation.x = Math.sin(state.elapsed * 1.7 + ring.seed) * danger * .06;
    }
    if (pole.reqLabel) {
      const req = PALETTES[paletteIndex].colors[pole.reqColor];
      const count = pole.rings.filter((ring) => ring.ci === pole.reqColor).length;
      const reqText = `${req.glyph} ${count}/${pole.reqCount}`;
      const reqColor = count >= pole.reqCount ? '#52e4ae' : req.hex;
      const reqKey = `${reqText}|${reqColor}`;
      if (pole._reqLabelKey !== reqKey) { updateLabel(pole.reqLabel, reqText, reqColor); pole._reqLabelKey = reqKey; }
    }
  }
}

function applyJets(dt) {
  for (let j = 0; j < 3; j++) {
    if (!input.jets[j]) continue;
    jSoundTimer += dt;
    if (jSoundTimer > .11) { sfxJet(); jSoundTimer = 0; }
    const direction = jetDirection(j);
    for (const ring of rings) {
      if (ring.scored) continue;
      const dx = ring.x - JET_X[j]; const dy = ring.y - NOZZLE_Y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 2.9 || Math.abs(dx) > 1.18) continue;
      const falloff = Math.pow(1 - distance / 2.9, 1.25) * (1 - Math.abs(dx) / 1.18);
      ring.vx += direction.x * falloff * 7.1 * dt;
      ring.vy += direction.y * falloff * 8.2 * dt;
      ring.vz += (0 - ring.z) * falloff * .7 * dt;
      ring.spin += (Math.random() - .5) * falloff * .025;
    }
    spawnJetParticles(j);
  }
}

function updateFreeRing(ring, dt) {
  // El agua ocupa el tanque completo; la superficie superior solo marca el
  // límite visual. Así los aros mantienen flotación también a la altura de
  // los palos y vuelven a caer sobre ellos al soltar el chorro.
  const inWater = ring.y < WATER_TOP;
  ring.vy += (inWater ? GRAVITY * .52 : GRAVITY) * dt;
  if (inWater) {
    ring.vy += 1.35 * dt;
    ring.vx *= Math.exp(-dt * 1.25);
    ring.vz *= Math.exp(-dt * 1.8);
  } else {
    ring.vx *= Math.exp(-dt * .08);
  }
  ring.vx += state.tiltX * 1.85 * dt;
  ring.vy += -state.tiltY * 1.1 * dt;
  ring.x += ring.vx * dt; ring.y += ring.vy * dt; ring.z += ring.vz * dt;
  if (ring.x < -4.72) { ring.x = -4.72; ring.vx = Math.abs(ring.vx) * .45; }
  if (ring.x > 4.72) { ring.x = 4.72; ring.vx = -Math.abs(ring.vx) * .45; }
  if (ring.y < BASE_Y + .27) { ring.y = BASE_Y + .27; ring.vy = Math.abs(ring.vy) * .34; ring.vx *= .72; }
  if (ring.y > 2.62) { ring.y = 2.62; ring.vy = -Math.abs(ring.vy) * .45; }
  ring.mesh.position.set(ring.x, ring.y, ring.z);
  ring.mesh.rotation.z += ring.spin * dt + ring.vx * dt * .08;
  ring.mesh.rotation.x = Math.sin(state.elapsed * .8 + ring.seed) * .12 + ring.vz * .08;
  ring.mesh.rotation.y += dt * .2;
}

function updateScoring(dt) {
  for (const ring of rings) {
    if (ring.scored) continue;
    for (const pole of poles) {
      if (pole.rejectCd > 0 || pole.rings.length >= pole.capacity) continue;
      const topY = BASE_Y + pole.h;
      if (Math.abs(ring.x - pole.x) > .43 || Math.abs(ring.z) > 1.05) continue;
      if (ring.y < topY - .26 || ring.y > topY + .52 || ring.vy > -.02) continue;
      scoreRing(ring, pole);
      break;
    }
  }
}

function countColorCombos(pole) {
  const counts = {};
  for (const ring of pole.rings) counts[ring.ci] = (counts[ring.ci] || 0) + 1;
  const combos = Object.values(counts).filter((value) => value >= 5).length;
  return { combos, counts };
}

function scoreRing(ring, pole) {
  ring.scored = true; ring.pole = pole; ring.stackIndex = pole.rings.length;
  ring.x = pole.x; ring.y = BASE_Y + .23 + ring.stackIndex * RING_STEP; ring.z = .04; ring.targetY = ring.y;
  ring.vx = 0; ring.vy = 0; ring.vz = 0;
  pole.rings.push(ring);
  const combo = pole.lastColor === ring.ci ? pole.combo + 1 : 1;
  pole.lastColor = ring.ci; pole.combo = combo; ring.points = 100 * combo;
  state.score += ring.points; state.currentCombo = Math.max(state.currentCombo, combo);
  spawnScorePop(ring, `+${ring.points}`, combo);
  sfxScore(combo); vibrate(combo > 1 ? 26 : 12);
  updateUI(true);
  if (ring.points > 100) showToast(`COMBO x${combo}`);
  if (rings.filter((item) => item.scored).length >= TOTAL_RINGS && poles.every((item) => item.rings.length >= MIN_PER_POLE) && colorRequirementsMet()) {
    if (!state.winQueued) { state.winQueued = true; window.setTimeout(showEnd, 720); }
  }
}

function recalculatePole(pole) {
  pole.rings.forEach((ring, index) => {
    ring.stackIndex = index; ring.targetY = BASE_Y + .23 + index * RING_STEP; ring.x = pole.x; ring.y = ring.targetY; ring.mesh.position.set(ring.x, ring.y, .04);
  });
  const last = pole.rings[pole.rings.length - 1];
  pole.lastColor = last ? last.ci : -1;
  pole.combo = last ? pole.rings.slice().reverse().findIndex((ring) => ring.ci !== last.ci) : 0;
  if (pole.combo < 0) pole.combo = pole.rings.length;
  else if (last) pole.combo = pole.combo + 1;
  updatePoleLabel(pole);
}

function ejectRing(ring, fromStress = false) {
  if (!ring || !ring.scored || !ring.pole) return;
  const pole = ring.pole;
  const index = pole.rings.indexOf(ring);
  if (index >= 0) pole.rings.splice(index, 1);
  state.score = Math.max(0, state.score - (ring.points || 100));
  ring.scored = false; ring.pole = null; ring.stackIndex = -1; ring.points = 0;
  ring.x = pole.x + (Math.random() - .5) * .25; ring.y = ring.targetY + .08; ring.z = .18;
  ring.vx = (Math.random() - .5) * 2.1 + pole.vX * .035; ring.vy = 1.0 + Math.random() * .8; ring.vz = (Math.random() - .5) * .5;
  ring.mesh.position.set(ring.x, ring.y, ring.z);
  recalculatePole(pole);
  if (fromStress) { sfxFail(); showToast('TENSIÓN · ARO EXPULSADO'); vibrate(35); }
  updateUI(true);
}

function ejectAll(pole) {
  const falling = [...pole.rings].reverse();
  falling.forEach((ring) => ejectRing(ring));
  sfxFail(); showToast('TENSIÓN MÁXIMA · PALO VACÍO'); vibrate([40, 25, 70]);
}

function colorRequirementsMet() {
  return poles.every((pole) => pole.reqColor < 0 || pole.rings.filter((ring) => ring.ci === pole.reqColor).length >= pole.reqCount);
}

function updateCamera(dt) {
  camera.position.x = lerp(camera.position.x, state.tiltX * .28, Math.min(1, dt * 2.2));
  camera.position.y = lerp(camera.position.y, .05 + state.tiltY * .12, Math.min(1, dt * 2.2));
  camera.position.z = lerp(camera.position.z, camera.userData.fitZ || 14.8, Math.min(1, dt * 2.2));
  cameraTarget.x = state.tiltX * .06;
  cameraTarget.y = -.15 + state.tiltY * .04;
  camera.lookAt(cameraTarget);
}

function updateGame(dt) {
  updateCamera(dt);
  if (state.paused || state.gameOver) {
    updateWater(dt);
    updateJetVisuals(dt);
    updateParticles(dt);
    return;
  }
  state.elapsed += dt;
  $('tV').textContent = formatTime(state.elapsed);
  updateTilt(dt);
  updateWater(dt);
  updateJetVisuals(dt);
  updatePoles(dt);
  applyJets(dt);
  for (const ring of rings) {
    if (!ring.scored) updateFreeRing(ring, dt);
  }
  updateScoring(dt);
  updateParticles(dt);
  updateUI();
}

/* -------------------------------------------------------------------------- */
/* UI, scoring and local/cloud persistence                                    */
/* -------------------------------------------------------------------------- */

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
function timeBonus(seconds) {
  if (seconds < 120) return 2000;
  if (seconds < 180) return 1500;
  if (seconds < 300) return 1000;
  if (seconds < 600) return 500;
  return 200;
}
function colorBonus() {
  let total = 0; const details = [];
  for (let i = 0; i < poles.length; i++) {
    const { combos, counts } = countColorCombos(poles[i]);
    if (combos >= 2) {
      total += 1500;
      const names = Object.keys(counts).filter((ci) => counts[ci] >= 5).map((ci) => PALETTES[paletteIndex].colors[ci].name).join(' + ');
      details.push(`Palo ${i + 1}: doble combo (${names}) +1500`);
    } else if (combos === 1) {
      total += 500;
      const ci = Object.keys(counts).find((key) => counts[key] >= 5);
      details.push(`Palo ${i + 1}: 5+ ${PALETTES[paletteIndex].colors[ci].name} +500`);
    }
  }
  return { total, details };
}
function requirementBonus() {
  let total = 0; const details = [];
  for (let i = 0; i < poles.length; i++) {
    const pole = poles[i]; if (pole.reqColor < 0) continue;
    const count = pole.rings.filter((ring) => ring.ci === pole.reqColor).length;
    if (count >= pole.reqCount) {
      const points = 300 + (count - pole.reqCount) * 100; total += points;
      details.push(`Palo ${i + 1}: ${count}× ${PALETTES[paletteIndex].colors[pole.reqColor].name} +${points}`);
    }
  }
  return { total, details };
}

function updateUI(force = false) {
  const scored = rings.filter((ring) => ring.scored).length;
  const maxCombo = Math.max(1, ...poles.map((pole) => pole.combo || 1));
  if (force || state.lastUiScore !== state.score) {
    $('sV').textContent = state.score;
    $('rV').textContent = `${scored}/${TOTAL_RINGS}`;
    $('cV').textContent = `x${maxCombo}`;
    $('lV').textContent = currentLevel;
    $('rV').style.color = poles.length && poles.every((pole) => pole.rings.length >= MIN_PER_POLE) && colorRequirementsMet() ? '#52e4ae' : '';
    state.lastUiScore = state.score;
  }
}

function spawnScorePop(ring, text, combo) {
  const projected = ring.mesh.position.clone().project(camera);
  const rect = waterScreen.getBoundingClientRect();
  const x = (projected.x * .5 + .5) * rect.width;
  const y = (-projected.y * .5 + .5) * rect.height;
  const el = document.createElement('div'); el.className = 'score-pop'; el.textContent = combo > 1 ? `${text} · x${combo}` : text;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  if (combo >= 4) el.style.color = '#ff7cf1'; else if (combo >= 2) el.style.color = '#ffd166';
  waterScreen.appendChild(el); window.setTimeout(() => el.remove(), 1100);
}

function showToast(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1500);
}

function showEnd() {
  if (state.gameOver) return;
  state.gameOver = true; state.paused = true; input.jets.fill(false);
  musicWin();
  const time = timeBonus(state.elapsed); const colors = colorBonus(); const requirements = requirementBonus();
  const total = state.score + time + colors.total + requirements.total;
  if (currentLevel >= maxLevel) {
    maxLevel = currentLevel >= TOTAL_LEVELS ? TOTAL_LEVELS : currentLevel + 1;
    storage.set('wrt_mlv', String(maxLevel));
  }
  saveScore(total, state.elapsed, currentLevel);
  const last = currentLevel >= TOTAL_LEVELS;
  $('endTitle').textContent = last ? '🎮 ¡GRAN MAESTRO!' : currentLevel === 5 ? '🎨 ¡MODO COLOR DESBLOQUEADO!' : `🏆 ¡NIVEL ${currentLevel} COMPLETADO!`;
  $('eNext').textContent = last ? '🔄 JUGAR NIVEL 1' : `▶ NIVEL ${currentLevel + 1}`;
  let html = `<tr><th colspan="2">NIVEL ${currentLevel} · ${LEVELS[currentLevel].name}</th></tr>`;
  html += `<tr><td>Aros ensartados</td><td>${rings.filter((ring) => ring.scored).length}/20</td></tr>`;
  html += `<tr><td>Tiempo</td><td>${formatTime(state.elapsed)}</td></tr>`;
  html += '<tr><th colspan="2">PUNTUACIÓN</th></tr>';
  html += `<tr><td>Base + combos</td><td>${state.score}</td></tr>`;
  html += `<tr><td>Bonus de tiempo</td><td>+${time}</td></tr>`;
  colors.details.forEach((detail) => { html += `<tr><td>${detail}</td><td></td></tr>`; });
  requirements.details.forEach((detail) => { html += `<tr><td>${detail}</td><td></td></tr>`; });
  html += `<tr class="total"><td>TOTAL</td><td>${total}</td></tr>`;
  $('eTable').innerHTML = html;
  $('endOv').classList.add('show');
  sfxWin(); vibrate([30, 20, 30, 70]);
}

function getLocalScores() {
  try { return JSON.parse(storage.get('wrt_s6') || '[]'); } catch { return []; }
}
function saveScore(points, time, level) {
  const now = new Date(); const scores = getLocalScores();
  scores.push({ p: points, t: time, lv: level, ts: Date.now(), d: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`, name: playerName || 'Anónimo' });
  scores.sort((a, b) => b.p - a.p); scores.splice(20);
  storage.set('wrt_s6', JSON.stringify(scores));
  window.saveGlobalScore?.({ name: playerName || 'Anónimo', score: points, time, level, date: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}` });
  window.saveUserProgress?.({ name: playerName || 'Anónimo', maxLevel });
}

function renderLocalScores() {
  const scores = getLocalScores();
  if (!scores.length) { $('sList').innerHTML = '<div class="empty-state">Sin puntuaciones locales.<br>¡Juega para registrar la primera!</div>'; return; }
  $('sList').innerHTML = scores.map((item, index) => `<div class="score-row"><span class="rank">#${index + 1}</span><span class="player">${escapeHtml(item.name || 'Anónimo')}</span><span class="points">${item.p} pts</span><span class="score-meta">Lv${item.lv || 1} · ${formatTime(item.t || 0)}</span></div>`).join('');
}
async function renderGlobalScores() {
  if (!window.fbEnabled) { $('sList').innerHTML = '<div class="empty-state">🔧 Ranking global no disponible.<br>Las puntuaciones locales siguen funcionando.</div>'; return; }
  $('sList').innerHTML = '<div class="empty-state">Cargando puntuaciones<span class="loadingDots">...</span></div>';
  const scores = await window.getGlobalScores?.({ today: globalMode === 'today', level: globalMode === 'level' ? globalLevel : null, limit: 50 }) || [];
  if (!scores.length) { $('sList').innerHTML = '<div class="empty-state">Todavía no hay puntuaciones en esta vista.<br>¡Sé el primero!</div>'; return; }
  $('sList').innerHTML = scores.map((item, index) => `<div class="score-row${item.isMe ? ' me' : ''}"><span class="rank">#${index + 1}</span><span class="player">${escapeHtml(item.name || 'Anónimo')}</span><span class="points">${item.score} pts</span><span class="score-meta">Lv${item.level || 1} · ${formatTime(item.time || 0)}</span></div>`).join('');
}
function renderScores() {
  $('tabLocal').classList.toggle('active', scoreTab === 'local'); $('tabGlobal').classList.toggle('active', scoreTab === 'global');
  $('globalSubTabs').style.display = scoreTab === 'global' ? 'flex' : 'none'; $('levelPicker').style.display = scoreTab === 'global' && globalMode === 'level' ? 'flex' : 'none';
  document.querySelectorAll('[data-gmode]').forEach((button) => button.classList.toggle('active', button.dataset.gmode === globalMode));
  document.querySelectorAll('[data-lv]').forEach((button) => button.classList.toggle('active', Number(button.dataset.lv) === globalLevel));
  if (scoreTab === 'local') renderLocalScores(); else renderGlobalScores();
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function updateProfile() {
  $('playerNameInput').value = playerName;
  const scores = getLocalScores();
  $('profMaxLv').textContent = maxLevel >= TOTAL_LEVELS ? '✓ TODOS' : maxLevel;
  $('profGames').textContent = scores.length;
  $('profBest').textContent = scores.length ? scores[0].p : 0;
}
function updateOnlineStatus() {
  const dot = $('onlineDot'); const status = $('onlineStatus');
  if (window.fbEnabled && window.fbUser) { dot.className = 'online-dot on'; status.textContent = playerName ? `Online · ${playerName}` : 'Online · sesión anónima'; }
  else if (window.fbEnabled) { dot.className = 'online-dot'; status.textContent = 'Conectando servicio...'; }
  else { dot.className = 'online-dot off'; status.textContent = 'Solo local · sin conexión'; }
}

/* -------------------------------------------------------------------------- */
/* Menus and controls                                                         */
/* -------------------------------------------------------------------------- */

function setPanel(id) { document.querySelectorAll('#menuOv .panel').forEach((panel) => panel.classList.remove('show')); $(id).classList.add('show'); }
function openMenu() { state.paused = true; setPanel('pMain'); buildLevelSelector(); $('menuOv').classList.add('show'); musicMenu(); updateOnlineStatus(); }
function startGame() { $('menuOv').classList.remove('show'); $('tutOv').classList.remove('show'); $('endOv').classList.remove('show'); initGame(currentLevel); state.paused = false; musicGame(); }
function buildLevelSelector() {
  const target = $('lvSel'); target.innerHTML = '';
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    if (i === 6) { const separator = document.createElement('div'); separator.className = 'level-separator'; separator.textContent = '🎨 MODO COLOR'; target.appendChild(separator); }
    const button = document.createElement('button'); const hasColor = LEVELS[i].poles.some((pole) => pole.rc !== undefined);
    button.className = `level-btn${i === currentLevel ? ' current' : ''}${i > maxLevel ? ' locked' : ''}${hasColor ? ' color-mode' : ''}`;
    button.innerHTML = `${i}<span>${LEVELS[i].name}</span>`; button.disabled = i > maxLevel;
    if (i <= maxLevel) button.addEventListener('click', () => { currentLevel = i; storage.set('wrt_current_level', String(i)); buildLevelSelector(); $('menuLevel').textContent = i; initGame(currentLevel); state.paused = true; });
    target.appendChild(button);
  }
}
function buildGlobalLevelPicker() {
  const target = $('levelPicker');
  target.innerHTML = '';
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const button = document.createElement('button');
    button.className = `sub-tab${i === globalLevel ? ' active' : ''}`;
    button.dataset.lv = String(i);
    button.textContent = i >= 6 ? `${i}🎨` : String(i);
    button.addEventListener('click', () => { globalLevel = i; renderScores(); });
    target.appendChild(button);
  }
}

let tutorialStep = 0;
function openTutorial() { tutorialStep = 0; $('menuOv').classList.remove('show'); $('tutOv').classList.add('show'); updateTutorial(); }
function closeTutorial() { $('tutOv').classList.remove('show'); openMenu(); }
function updateTutorial() {
  const steps = document.querySelectorAll('.tutorial-step'); const dots = $('tutDots'); dots.innerHTML = '';
  steps.forEach((step, index) => { step.classList.toggle('active', index === tutorialStep); const dot = document.createElement('span'); dot.className = `tutorial-dot${index === tutorialStep ? ' active' : ''}`; dots.appendChild(dot); });
  $('tutNext').textContent = tutorialStep === steps.length - 1 ? '✓ ENTENDIDO' : 'SIGUIENTE →';
}
function toggleFullscreen() {
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)?.call(document.documentElement);
    else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  } catch { showToast('Pantalla completa no disponible'); }
}
function showFullscreenInfo() { $('fsInfo').innerHTML = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '<div style="font-size:28px">📤</div><b>Safari</b><br>Compartir → Añadir a pantalla de inicio' : 'Pulsa <b>F11</b> o usa el botón ⛶ de la esquina.<br><br>En móvil, añade el juego a la pantalla de inicio para una experiencia inmersiva.'; }
function vibrate(pattern) { navigator.vibrate?.(pattern); }

function bindHold(button, on, off) {
  const start = (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); on(); button.classList.add('pressed'); };
  const end = (event) => { event.preventDefault(); off(); button.classList.remove('pressed'); };
  button.addEventListener('pointerdown', start); button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end); button.addEventListener('pointerleave', end);
}

document.querySelectorAll('[data-jet]').forEach((button) => { const index = Number(button.dataset.jet); bindHold(button, () => { ensureAudio(); if (!state.paused && !state.gameOver) { input.jets[index] = true; vibrate(8); } }, () => { input.jets[index] = false; }); });
document.querySelectorAll('[data-tilt]').forEach((button) => {
  const map = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }; const key = map[button.dataset.tilt];
  bindHold(button, () => { if (!state.paused && !state.gameOver) input.keys[key] = true; }, () => { input.keys[key] = false; });
});

document.addEventListener('keydown', (event) => {
  if ($('tutOv').classList.contains('show')) {
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (tutorialStep >= 5) closeTutorial(); else { tutorialStep++; updateTutorial(); } }
    else if (event.key === 'ArrowLeft' && tutorialStep > 0) { event.preventDefault(); tutorialStep--; updateTutorial(); }
    else if (event.key === 'Escape') closeTutorial();
    return;
  }
  const key = event.key.toLowerCase();
  if (['a', 's', 'd'].includes(key) && !state.paused && !state.gameOver) { input.jets[{ a: 0, s: 1, d: 2 }[key]] = true; document.querySelector(`[data-jet="${{ a: 0, s: 1, d: 2 }[key]}"]`)?.classList.add('pressed'); }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !state.paused && !state.gameOver) { event.preventDefault(); input.keys[event.key] = true; document.querySelector(`[data-tilt="${{ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key]}"]`)?.classList.add('pressed'); }
  if (key === 'r' && !state.paused && !state.gameOver) { initGame(currentLevel); state.paused = false; }
});
document.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (['a', 's', 'd'].includes(key)) { const index = { a: 0, s: 1, d: 2 }[key]; input.jets[index] = false; document.querySelector(`[data-jet="${index}"]`)?.classList.remove('pressed'); }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { input.keys[event.key] = false; const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[event.key]; document.querySelector(`[data-tilt="${dir}"]`)?.classList.remove('pressed'); }
});

$('mPlay').addEventListener('click', () => { ensureAudio(); startGame(); });
$('mTut').addEventListener('click', openTutorial);
$('tutNext').addEventListener('click', () => { if (tutorialStep >= 5) closeTutorial(); else { tutorialStep++; updateTutorial(); } });
$('tutSkip').addEventListener('click', closeTutorial);
$('mAcc').addEventListener('click', () => { buildPaletteGrid(); setPanel('pAcc'); });
$('aBack').addEventListener('click', () => setPanel('pMain'));
$('mScores').addEventListener('click', () => { scoreTab = 'local'; renderScores(); setPanel('pScores'); });
$('sBack').addEventListener('click', () => setPanel('pMain'));
$('tabLocal').addEventListener('click', () => { scoreTab = 'local'; renderScores(); });
$('tabGlobal').addEventListener('click', () => { scoreTab = 'global'; renderScores(); });
document.querySelectorAll('[data-gmode]').forEach((button) => button.addEventListener('click', () => { globalMode = button.dataset.gmode; renderScores(); }));
$('mProfile').addEventListener('click', () => { updateProfile(); setPanel('pProfile'); });
$('profBack').addEventListener('click', () => setPanel('pMain'));
$('saveNameBtn').addEventListener('click', () => { playerName = $('playerNameInput').value.trim().slice(0, 15); storage.set('wrt_pname', playerName); window.saveUserProgress?.({ name: playerName, maxLevel }); updateOnlineStatus(); $('saveNameBtn').textContent = '✓'; window.setTimeout(() => $('saveNameBtn').textContent = '✓', 800); });
$('playerNameInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('saveNameBtn').click(); });
$('mFS').addEventListener('click', () => { showFullscreenInfo(); setPanel('pFS'); });
$('fBack').addEventListener('click', () => setPanel('pMain'));
$('bFS').addEventListener('click', toggleFullscreen);
$('bMe').addEventListener('click', openMenu);
$('bRe').addEventListener('click', () => { ensureAudio(); initGame(currentLevel); state.paused = false; musicGame(); });
$('eNext').addEventListener('click', () => { currentLevel = currentLevel >= TOTAL_LEVELS ? 1 : currentLevel + 1; initGame(currentLevel); state.paused = false; $('endOv').classList.remove('show'); musicGame(); buildLevelSelector(); });
$('eMenu').addEventListener('click', () => { $('endOv').classList.remove('show'); openMenu(); });
$('eShare').addEventListener('click', () => { const message = `🎮 Water Game Arcade EX 3D · Nivel ${currentLevel}\n🏆 ${state.score + timeBonus(state.elapsed)} pts · ⏱️ ${formatTime(state.elapsed)}\n¡Supérame!`; if (navigator.share) navigator.share({ title: 'Water Game Arcade EX 3D', text: message }).catch(() => {}); else navigator.clipboard?.writeText(message).then(() => showToast('Resultado copiado')).catch(() => showToast(message)); });

function buildPaletteGrid() {
  $('palGrid').innerHTML = '';
  PALETTES.forEach((palette, index) => {
    const card = document.createElement('div'); card.className = `palette-card${index === paletteIndex ? ' active' : ''}`;
    card.innerHTML = `<div class="palette-name">${palette.name}<br><span class="palette-desc">${palette.desc}</span></div><div class="palette-dots">${palette.colors.map((color) => `<span class="palette-dot" style="background:${color.hex};color:${['#ffffff', '#f3df72', '#fff000'].includes(color.hex.toLowerCase()) ? '#112' : '#fff'}">${color.glyph}</span>`).join('')}</div>`;
    card.addEventListener('click', () => { paletteIndex = index; storage.set('wrt_pal', String(index)); buildPaletteGrid(); initGame(currentLevel); state.paused = true; });
    $('palGrid').appendChild(card);
  });
}

/* -------------------------------------------------------------------------- */
/* Audio                                                                      */
/* -------------------------------------------------------------------------- */

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioContext = null;
let soundOn = storage.get('wrt_snd') !== '0';
let musicOn = storage.get('wrt_mus') === '1';
let musicTimer = 0;
function ensureAudio() { if (!AudioContextClass) return; if (!audioContext) audioContext = new AudioContextClass(); if (audioContext.state === 'suspended') audioContext.resume(); }
function tone(frequency, duration, volume = .08, type = 'sine') { if (!soundOn || !audioContext) return; const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration); }
function sfxJet() { tone(160 + Math.random() * 35, .06, .025, 'triangle'); }
function sfxScore(combo = 1) { tone(420 + combo * 80, .16, .06, 'triangle'); if (combo > 1) window.setTimeout(() => tone(660 + combo * 70, .18, .05, 'sine'), 70); }
function sfxFail() { tone(130, .22, .07, 'sawtooth'); window.setTimeout(() => tone(94, .28, .05, 'sawtooth'), 100); }
function sfxWin() { [523, 659, 784, 1047].forEach((frequency, index) => window.setTimeout(() => tone(frequency, .45, .08, 'triangle'), index * 130)); }
function musicMenu() { if (musicOn) scheduleMusic([196, 261, 329, 392], 0); }
function musicGame() { if (musicOn) scheduleMusic([130, 155, 196, 233], 0); }
function musicWin() { if (musicOn) scheduleMusic([523, 659, 784, 1047], 0); }
function scheduleMusic(notes, index) { if (!musicOn || !audioContext) return; window.clearTimeout(musicTimer); tone(notes[index % notes.length], .65, .018, 'sine'); musicTimer = window.setTimeout(() => scheduleMusic(notes, index + 1), 820); }
$('bSnd').addEventListener('click', () => { ensureAudio(); soundOn = !soundOn; storage.set('wrt_snd', soundOn ? '1' : '0'); $('bSnd').textContent = soundOn ? '🔊' : '🔇'; });
$('bMus').addEventListener('click', () => { ensureAudio(); musicOn = !musicOn; storage.set('wrt_mus', musicOn ? '1' : '0'); $('bMus').textContent = musicOn ? '♫' : '♪'; if (musicOn) musicMenu(); else window.clearTimeout(musicTimer); });
$('bSnd').textContent = soundOn ? '🔊' : '🔇'; $('bMus').textContent = musicOn ? '♫' : '♪';

/* -------------------------------------------------------------------------- */
/* Gyroscope                                                                  */
/* -------------------------------------------------------------------------- */

function calibrateGyro() { gyroOffset = { gamma: latestOrientation.gamma, beta: latestOrientation.beta - 60 }; $('gyroInd').classList.add('calibrating'); window.setTimeout(() => $('gyroInd').classList.remove('calibrating'), 500); tone(800, .12, .08); }
function onOrientation(event) {
  if (event.gamma != null) latestOrientation.gamma = event.gamma;
  if (event.beta != null) latestOrientation.beta = event.beta;
  if (!input.gyro || state.paused) return;
  state.tiltX = clamp((latestOrientation.gamma - gyroOffset.gamma) / 25, -1, 1);
  state.tiltY = clamp((latestOrientation.beta - 60 - gyroOffset.beta) / 28, -1, 1);
}
function enableGyro() {
  input.gyro = true; window.addEventListener('deviceorientation', onOrientation); $('mGyro').textContent = '✅ GIROSCOPIO ACTIVO'; $('mGyro').classList.remove('button-red'); $('mGyro').classList.add('button-green'); $('gyroInd').classList.add('visible'); $('gyroDot').classList.add('on');
  $('tRow').style.opacity = '.42'; showToast('Giroscopio activado');
}
function setupGyro() {
  if (!('DeviceOrientationEvent' in window)) return;
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    $('mGyro').style.display = 'block'; $('mGyro').addEventListener('click', () => DeviceOrientationEvent.requestPermission().then((result) => { if (result === 'granted') enableGyro(); }).catch(() => showToast('Permiso de giroscopio rechazado')));
  } else {
    window.addEventListener('deviceorientation', (event) => { if (event.gamma != null || event.beta != null) { enableGyro(); } }, { once: true });
  }
  $('gyroInd').addEventListener('click', calibrateGyro);
}

/* -------------------------------------------------------------------------- */
/* Optional Firebase cloud ranking                                            */
/* -------------------------------------------------------------------------- */

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAim5A296syoSKyz5DvtxoamjK2k_7P8Zo',
  authDomain: 'water-game-arcade-ex.firebaseapp.com',
  projectId: 'water-game-arcade-ex',
  storageBucket: 'water-game-arcade-ex.firebasestorage.app',
  messagingSenderId: '303642977554',
  appId: '1:303642977554:web:948c3fe8dc0ccc4525ffcb',
  measurementId: 'G-L8ET96N6VP'
};
let cloudDb = null; let cloudAuth = null;
async function connectCloud() {
  try {
    const [appApi, firestore, authApi] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js')
    ]);
    const app = appApi.initializeApp(FIREBASE_CONFIG);
    cloudDb = firestore.getFirestore(app); cloudAuth = authApi.getAuth(app); window.fbEnabled = true;
    window.saveGlobalScore = async (data) => { if (!cloudDb) return; try { await firestore.addDoc(firestore.collection(cloudDb, 'leaderboard'), { ...data, uid: window.fbUser?.uid || 'anon', timestamp: firestore.serverTimestamp() }); } catch (error) { console.warn('Cloud score:', error); } };
    window.saveUserProgress = async (data) => { if (!cloudDb || !window.fbUser) return; try { await firestore.setDoc(firestore.doc(cloudDb, 'users', window.fbUser.uid), { ...data, lastUpdated: firestore.serverTimestamp() }, { merge: true }); } catch (error) { console.warn('Cloud progress:', error); } };
    window.getGlobalScores = async (options = {}) => {
      if (!cloudDb) return [];
      try {
        const queryRef = firestore.query(firestore.collection(cloudDb, 'leaderboard'), firestore.orderBy('score', 'desc'), firestore.limit(200));
        const snapshot = await firestore.getDocs(queryRef); let values = [];
        snapshot.forEach((doc) => values.push({ id: doc.id, ...doc.data(), isMe: window.fbUser && doc.data().uid === window.fbUser.uid }));
        if (options.today) { const start = new Date(); start.setHours(0, 0, 0, 0); values = values.filter((item) => item.timestamp?.seconds && item.timestamp.seconds * 1000 >= start.getTime()); }
        if (options.level) values = values.filter((item) => item.level === options.level);
        return values.slice(0, options.limit || 50);
      } catch (error) { console.warn('Cloud scores:', error); return []; }
    };
    authApi.onAuthStateChanged(cloudAuth, async (user) => {
      if (!user) return;
      window.fbUser = user;
      updateOnlineStatus();
      try {
        const snapshot = await firestore.getDoc(firestore.doc(cloudDb, 'users', user.uid));
        if (!snapshot.exists()) return;
        const remote = snapshot.data();
        const remoteMax = clamp(Number(remote.maxLevel || 1), 1, TOTAL_LEVELS);
        if (remoteMax > maxLevel) { maxLevel = remoteMax; storage.set('wrt_mlv', String(maxLevel)); buildLevelSelector(); }
        if (!playerName && remote.name) { playerName = String(remote.name).slice(0, 15); storage.set('wrt_pname', playerName); }
        updateOnlineStatus();
      } catch (error) { console.info('Cloud progress unavailable:', error); }
    });
    await authApi.signInAnonymously(cloudAuth);
    updateOnlineStatus();
  } catch (error) {
    window.fbEnabled = false; updateOnlineStatus(); console.info('Firebase no disponible; modo local activo.');
  }
}
window.fbEnabled = false; window.fbUser = null;

/* -------------------------------------------------------------------------- */
/* Resize and render loop                                                     */
/* -------------------------------------------------------------------------- */

function resizeRenderer() {
  const rect = waterScreen.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const aspect = rect.width / rect.height;
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = aspect;
  // Encuadra el tanque completo. En móvil el ancho útil suele ser menor que
  // la altura, así que la distancia se calcula también con el FOV horizontal.
  const fieldWidth = 12.8;
  const fieldHeight = 6.6;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const fitVertical = (fieldHeight / 2) / Math.tan(verticalFov / 2);
  const fitHorizontal = (fieldWidth / 2) / Math.tan(horizontalFov / 2);
  camera.userData.fitZ = Math.max(14.8, fitVertical, fitHorizontal) + .55;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRenderer);
if ('ResizeObserver' in window) new ResizeObserver(resizeRenderer).observe(waterScreen);

function renderLoop(timestamp) {
  if (!state.lastFrame) state.lastFrame = timestamp;
  const dt = Math.min(.034, Math.max(.001, (timestamp - state.lastFrame) / 1000)); state.lastFrame = timestamp;
  updateGame(dt); renderer.render(scene, camera); requestAnimationFrame(renderLoop);
}

/* Initial state */
buildLevelSelector(); buildGlobalLevelPicker(); buildPaletteGrid(); initGame(currentLevel); setupGyro(); updateOnlineStatus(); resizeRenderer(); connectCloud(); requestAnimationFrame(renderLoop);

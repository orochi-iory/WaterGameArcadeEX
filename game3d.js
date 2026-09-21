import * as THREE from './vendor/three.module.js';
import * as CANNON from './vendor/cannon-es.js';

const $ = (id) => document.getElementById(id);
const MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768;
const WATER_GRID_X = MOBILE_DEVICE ? 24 : 48;
const WATER_GRID_Y = MOBILE_DEVICE ? 10 : 18;
const BACKDROP_GRID_Y = MOBILE_DEVICE ? 12 : 24;
const BUBBLE_COUNT = MOBILE_DEVICE ? 12 : 28;
const PARTICLE_CAPACITY = MOBILE_DEVICE ? 220 : 480;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const storage = {
  get(key, fallback = null) { try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { window.localStorage.setItem(key, value); } catch { /* storage can be blocked in private iframes */ } }
};
const lerp = (a, b, amount) => a + (b - a) * amount;
const TAU = Math.PI * 2;

/* -------------------------------------------------------------------------- */
/*  Water Game Arcade EX — 3D game layer                                     */
/*  The original 2D canvas simulation is replaced by a Three.js scene whose  */
/*  ring and pole dynamics are solved by Cannon-es; water, particles and     */
/*  cabinet lighting remain actual Three.js objects.                          */
/* -------------------------------------------------------------------------- */

const TOTAL_RINGS = 20;
const MIN_PER_POLE = 5;
const BASE_Y = -2.78;
// El tanque ocupa todo el volumen jugable. WATER_Y se conserva como altura de
// aparición para repartir los aros; WATER_TOP es la superficie real del agua.
const WATER_Y = -1.72;
const WATER_TOP = 2.55;
const RING_STEP = .18;
const RING_LOCK_SPEED = 1.55;
const RING_RADIUS = 0.27;
const RING_TUBE = .065;
const RING_HOLE_RADIUS = RING_RADIUS - RING_TUBE;
const RING_MASS = .72;
const RING_BUOYANCY_FORCE = 3.5;
const POLE_TIP_RADIUS = .11;
// Radio máximo en el que la punta puede entrar físicamente por el hueco.
// No hay tolerancia visual extra: fuera de este radio Cannon colisiona.
const RING_CAPTURE_RADIUS = Math.max(.06, RING_HOLE_RADIUS - POLE_TIP_RADIUS);
const ringFlatQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
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
  winTimer: 0,
  paused: true,
  lastFrame: 0,
  currentCombo: 1,
  lastUiScore: -1
};
const input = {
  jets: [false, false, false], keys: {}, gyro: false,
  pointerJets: [false, false, false], keyboardJets: [false, false, false], gamepadJets: [false, false, false],
  pointerKeys: {}, keyboardKeys: {}, gamepadKeys: {}
};
function refreshJetInput(index) {
  input.jets[index] = Boolean(input.pointerJets[index] || input.keyboardJets[index] || input.gamepadJets[index]);
  const button = document.querySelector(`[data-jet="${index}"]`);
  button?.classList.toggle('pressed', input.jets[index]); button?.setAttribute('aria-pressed', String(input.jets[index]));
}
function refreshTiltInput(key) {
  input.keys[key] = Boolean(input.pointerKeys[key] || input.keyboardKeys[key] || input.gamepadKeys[key]);
  const direction = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[key];
  if (direction) {
    const button = document.querySelector(`[data-tilt="${direction}"]`);
    button?.classList.toggle('pressed', input.keys[key]); button?.setAttribute('aria-pressed', String(input.keys[key]));
  }
}

let rings = [];
let poles = [];
let physicsPoleBodies = [];
let physicsRingBodies = [];
let particles = [];
let bubbles = [];
let waveTime = 0;
let waterUpdateFrame = 0;
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE_DEVICE, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x061b31, 1);
renderer.setPixelRatio(MOBILE_DEVICE ? Math.min(window.devicePixelRatio || 1, 1.35) : Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = MOBILE_DEVICE ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = MOBILE_DEVICE ? 1 : 1.18;
renderer.shadowMap.enabled = !MOBILE_DEVICE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x06182d, 8, 20);

/* -------------------------------------------------------------------------- */
/* Cannon-es rigid-body world                                                 */
/* -------------------------------------------------------------------------- */
const physicsWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
physicsWorld.allowSleep = true;
physicsWorld.solver.iterations = MOBILE_DEVICE ? 6 : 10;
physicsWorld.solver.tolerance = .001;
const ringPhysicsMaterial = new CANNON.Material('ring');
const tankPhysicsMaterial = new CANNON.Material('tank');
physicsWorld.defaultContactMaterial.friction = .18;
physicsWorld.defaultContactMaterial.restitution = .28;
physicsWorld.addContactMaterial(new CANNON.ContactMaterial(ringPhysicsMaterial, tankPhysicsMaterial, { friction: .18, restitution: .28 }));
const physicsGround = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
physicsGround.addShape(new CANNON.Box(new CANNON.Vec3(6, .11, 2.85)));
physicsGround.position.set(0, BASE_Y - .2, .15);
physicsWorld.addBody(physicsGround);
const physicsSideWalls = [];
for (const x of [-5.85, 5.85]) {
  const wall = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(.08, 3.1, 2.7)));
  wall.position.set(x, -.1, .15); physicsWorld.addBody(wall); physicsSideWalls.push(wall);
}
// La profundidad sigue existiendo en Cannon-es, pero se limita a un carril
// cercano al diámetro de las bases: el jugador puede concentrarse en X/Y.
for (const z of [-.84, .84]) {
  const wall = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(6, 3.1, .08)));
  wall.position.set(0, -.1, z); physicsWorld.addBody(wall); physicsSideWalls.push(wall);
}
const physicsFixedStep = 1 / 60;
let physicsAccumulator = 0;
const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
camera.position.set(0, .05, 14.8);
// El centro queda equilibrado entre el suelo y las puntas de los palos.
const cameraTarget = new THREE.Vector3(0, -.15, 0);
camera.lookAt(cameraTarget);

const ambientLight = new THREE.HemisphereLight(0x9be9ff, 0x061224, 1.65);
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xd7f8ff, 2.7);
keyLight.position.set(-4, 7, 7);
keyLight.castShadow = !MOBILE_DEVICE;
keyLight.shadow.mapSize.set(MOBILE_DEVICE ? 512 : 1024, MOBILE_DEVICE ? 512 : 1024);
keyLight.shadow.camera.left = -7;
keyLight.shadow.camera.right = 7;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x26bbff, MOBILE_DEVICE ? 3.2 : 6, 12, 2);
rimLight.position.set(4, 1.6, 3.4);
rimLight.visible = !MOBILE_DEVICE;
scene.add(rimLight);
const warmLight = new THREE.PointLight(0xffa84e, MOBILE_DEVICE ? 1.6 : 3.2, 9, 2);
warmLight.position.set(-3.8, -2.25, 2.7);
warmLight.visible = !MOBILE_DEVICE;
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
  g.addColorStop(0, '#35b7d1');
  g.addColorStop(.26, '#147ea6');
  g.addColorStop(.62, '#0a4d76');
  g.addColorStop(1, '#062a4c');
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
  new THREE.PlaneGeometry(20, 14),
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

// Decoración marina fuera de la zona de juego. Está en el grupo de fondo y
// nunca participa en las colisiones: solo aporta la sensación de juguete
// acuático lleno de algas, rocas y pequeños detalles de acuario.
const marineDecor = new THREE.Group();
backgroundGroup.add(marineDecor);
const seaweedMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x1d9c78, emissive: 0x063d38, emissiveIntensity: .45, roughness: .72 }),
  new THREE.MeshStandardMaterial({ color: 0x42c48c, emissive: 0x075442, emissiveIntensity: .35, roughness: .68 }),
  new THREE.MeshStandardMaterial({ color: 0x75c765, emissive: 0x174a27, emissiveIntensity: .28, roughness: .74 })
];
function addSeaweed(x, height, materialIndex, phase = 0) {
  const points = [
    new THREE.Vector3(x, BASE_Y - .08, -2.04),
    new THREE.Vector3(x + Math.sin(phase) * .18, BASE_Y + height * .32, -2.04),
    new THREE.Vector3(x - Math.cos(phase) * .17, BASE_Y + height * .68, -2.04),
    new THREE.Vector3(x + Math.sin(phase + 1.2) * .22, BASE_Y + height, -2.04)
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const blade = new THREE.Mesh(new THREE.TubeGeometry(curve, MOBILE_DEVICE ? 10 : 18, .055, MOBILE_DEVICE ? 5 : 7, false), seaweedMaterials[materialIndex % seaweedMaterials.length]);
  blade.castShadow = !MOBILE_DEVICE;
  marineDecor.add(blade);
}
addSeaweed(-5.15, 2.25, 0, .3); addSeaweed(-4.78, 1.65, 1, 1.1); addSeaweed(-4.42, 2.55, 2, 2.2);
addSeaweed(5.12, 2.05, 1, 2.8); addSeaweed(4.76, 1.55, 0, 1.7); addSeaweed(4.42, 2.4, 2, .5);
const rockMaterials = [
  new THREE.MeshStandardMaterial({ color: 0x5d7380, roughness: .88, metalness: .05, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x806a65, roughness: .9, metalness: .04, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x466d72, roughness: .85, metalness: .04, flatShading: true })
];
[[-5.35, .48, .2, 0], [-4.55, .34, .16, 1], [5.3, .44, .2, 2], [4.58, .3, .15, 0]].forEach(([x, size, z, materialIndex], index) => {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMaterials[materialIndex]);
  rock.position.set(x, BASE_Y + size * .38, -2.08 - z);
  rock.scale.set(1.25, .72 + (index % 2) * .18, .8);
  rock.rotation.set(.12 * index, .4 * index, .2 * index);
  rock.castShadow = !MOBILE_DEVICE;
  marineDecor.add(rock);
});

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x17657b, roughness: .55, metalness: .08 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(12, .22, 5.7), floorMaterial);
floor.position.set(0, BASE_Y - .2, .15);
floor.receiveShadow = !MOBILE_DEVICE;
stageGroup.add(floor);
const floorTrim = new THREE.Mesh(new THREE.BoxGeometry(12, .035, 5.76), new THREE.MeshStandardMaterial({ color: 0x35d2bd, emissive: 0x063f4a, emissiveIntensity: .32, roughness: .25, metalness: .08 }));
floorTrim.position.set(0, BASE_Y - .065, .15);
stageGroup.add(floorTrim);

const tankHeight = WATER_TOP - BASE_Y;
const waterVolumeMaterial = MOBILE_DEVICE
  ? new THREE.MeshBasicMaterial({ color: 0x2ad0ef, transparent: true, opacity: .045, depthWrite: false, side: THREE.DoubleSide })
  : new THREE.MeshPhysicalMaterial({ color: 0x2ad0ef, roughness: .18, metalness: .02, transmission: .08, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide });
const waterVolume = new THREE.Mesh(
  new THREE.BoxGeometry(11.7, tankHeight, 4.95),
  waterVolumeMaterial
);
waterVolume.position.set(0, BASE_Y + tankHeight / 2, .1);
waterVolume.receiveShadow = !MOBILE_DEVICE;
stageGroup.add(waterVolume);

function makeWaterTexture() {
  const c = document.createElement('canvas');
  c.width = MOBILE_DEVICE ? 512 : 768; c.height = MOBILE_DEVICE ? 320 : 512;
  const ctx = c.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, c.height);
  gradient.addColorStop(0, 'rgba(63, 215, 240, .86)');
  gradient.addColorStop(.42, 'rgba(18, 133, 183, .82)');
  gradient.addColorStop(1, 'rgba(5, 57, 103, .92)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, c.width, c.height);
  const glow = ctx.createRadialGradient(390, 170, 20, 390, 190, 420);
  glow.addColorStop(0, 'rgba(157, 246, 255, .34)');
  glow.addColorStop(1, 'rgba(157, 246, 255, 0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, c.width, c.height);
  const waterRows = MOBILE_DEVICE ? 9 : 14;
  for (let row = 0; row < waterRows; row++) {
    const y = 24 + row * (MOBILE_DEVICE ? 34 : 38);
    ctx.beginPath();
    for (let x = -30; x <= c.width + 30; x += 18) {
      const wave = Math.sin(x * .024 + row * .8) * 8 + Math.sin(x * .057 - row) * 3;
      if (x === -30) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = `rgba(173, 247, 255, ${.045 + (row % 3) * .018})`;
    ctx.lineWidth = row % 4 === 0 ? 3 : 1.5; ctx.stroke();
  }
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = `rgba(190, 251, 255, ${.08 + Math.random() * .13})`;
    ctx.beginPath(); ctx.arc(Math.random() * c.width, 25 + Math.random() * (c.height - 50), 1 + Math.random() * 3, 0, TAU); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Lámina de fondo: da color y una distorsión acuática legible sin poner un
// filtro azul opaco delante de los aros.
const waterBackdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(11.7, tankHeight, WATER_GRID_X, BACKDROP_GRID_Y),
  new THREE.MeshBasicMaterial({ map: makeWaterTexture(), transparent: true, opacity: .78, depthWrite: false, side: THREE.DoubleSide })
);
waterBackdrop.position.set(0, BASE_Y + tankHeight / 2, -1.88);
stageGroup.add(waterBackdrop);
const waterBackdropBaseZ = new Float32Array(waterBackdrop.geometry.attributes.position.count);
for (let i = 0; i < waterBackdropBaseZ.length; i++) waterBackdropBaseZ[i] = waterBackdrop.geometry.attributes.position.getZ(i);

const waterGeometry = new THREE.PlaneGeometry(11.7, 4.95, WATER_GRID_X, WATER_GRID_Y);
waterGeometry.rotateX(-Math.PI / 2);
const waterBaseZ = new Float32Array(waterGeometry.attributes.position.count);
for (let i = 0; i < waterGeometry.attributes.position.count; i++) waterBaseZ[i] = waterGeometry.attributes.position.getZ(i);
const waterSurfaceMaterial = MOBILE_DEVICE
  ? new THREE.MeshBasicMaterial({ color: 0x63e7f4, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide })
  : new THREE.MeshPhysicalMaterial({ color: 0x63e7f4, emissive: 0x0b6d91, emissiveIntensity: .8, roughness: .1, metalness: .12, transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide });
const waterSurface = new THREE.Mesh(waterGeometry, waterSurfaceMaterial);
waterSurface.position.set(0, WATER_TOP, .1);
waterSurface.receiveShadow = !MOBILE_DEVICE;
stageGroup.add(waterSurface);

const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x55e7e0, emissive: 0x0c5f7e, emissiveIntensity: .72, roughness: .18, metalness: .08 });
for (const x of [-5.98, 5.98]) {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.08, tankHeight + .28, 5.1), edgeMaterial);
  edge.position.set(x, BASE_Y + tankHeight / 2, .08);
  edge.castShadow = true;
  stageGroup.add(edge);
}
const backRail = new THREE.Mesh(new THREE.BoxGeometry(11.95, .055, .055), edgeMaterial);
backRail.position.set(0, WATER_TOP, -1.95);
stageGroup.add(backRail);
const plasticRimMaterial = new THREE.MeshStandardMaterial({ color: 0x2bd6bd, emissive: 0x07534e, emissiveIntensity: .38, roughness: .2, metalness: .06 });
const topRim = new THREE.Mesh(new THREE.BoxGeometry(12.05, .16, 5.18), plasticRimMaterial);
topRim.position.set(0, WATER_TOP + .08, .08); topRim.castShadow = true; stageGroup.add(topRim);
const bottomRim = new THREE.Mesh(new THREE.BoxGeometry(12.05, .14, 5.18), plasticRimMaterial);
bottomRim.position.set(0, BASE_Y - .03, .08); bottomRim.castShadow = true; stageGroup.add(bottomRim);

const bubbleMaterial = MOBILE_DEVICE
  ? new THREE.MeshBasicMaterial({ color: 0xc8f7ff, transparent: true, opacity: .24, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0xc8f7ff, transparent: true, opacity: .33, roughness: .02, metalness: .1 });
const bubbleGroup = new THREE.Group();
effectGroup.add(bubbleGroup);
for (let i = 0; i < BUBBLE_COUNT; i++) {
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .045, MOBILE_DEVICE ? 5 : 8, MOBILE_DEVICE ? 5 : 8), bubbleMaterial);
  bubble.position.set((Math.random() - .5) * 10.8, BASE_Y + .16 + Math.random() * (tankHeight - .38), -.8 + Math.random() * 2.1);
  bubble.userData.speed = .05 + Math.random() * .13;
  bubble.userData.phase = Math.random() * TAU;
  bubbleGroup.add(bubble);
  bubbles.push(bubble);
}

const particlePositions = new Float32Array(PARTICLE_CAPACITY * 3);
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
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.17, .22, .24, MOBILE_DEVICE ? 10 : 18), nozzleMaterial);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(JET_X[j], NOZZLE_Y, .72);
  nozzle.castShadow = true;
  effectGroup.add(nozzle);
  nozzles.push(nozzle);

  const beamMaterial = MOBILE_DEVICE
    ? new THREE.MeshBasicMaterial({ color: JET_COLORS[j], transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    : new THREE.MeshPhysicalMaterial({ color: JET_COLORS[j], emissive: JET_COLORS[j], emissiveIntensity: 1.1, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(.31, 4.7, MOBILE_DEVICE ? 10 : 20, 1, true),
    beamMaterial
  );
  beam.position.set(JET_X[j], NOZZLE_Y + 2.35, .58);
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
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: reqColor, emissive: reqColor, emissiveIntensity: hasRequirement ? .52 : .3, roughness: .28, metalness: .08, transparent: true, opacity: .96 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.075, .12, def.h, MOBILE_DEVICE ? 10 : 18), shaftMaterial);
  shaft.position.y = def.h / 2;
  shaft.castShadow = true;
  group.add(shaft);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: hasRequirement ? reqColor : 0x5bd8e4, emissive: hasRequirement ? reqColor : 0x0c526e, emissiveIntensity: .3, roughness: .22, metalness: .1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.38, .48, .18, MOBILE_DEVICE ? 12 : 24), baseMaterial);
  base.position.y = .09; base.castShadow = true; group.add(base);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.22, .045, MOBILE_DEVICE ? 6 : 8, MOBILE_DEVICE ? 14 : 24), baseMaterial);
  collar.rotation.x = Math.PI / 2; collar.position.y = .2; group.add(collar);
  const top = new THREE.Mesh(new THREE.SphereGeometry(POLE_TIP_RADIUS, MOBILE_DEVICE ? 10 : 18, MOBILE_DEVICE ? 8 : 12), shaftMaterial);
  top.position.y = def.h; top.castShadow = true; group.add(top);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.055, MOBILE_DEVICE ? 7 : 12, MOBILE_DEVICE ? 5 : 8), new THREE.MeshBasicMaterial({ color: hasRequirement ? reqColor : 0x7feaff }));
  beacon.position.set(0, def.h + .12, 0); group.add(beacon);
  const label = labelSprite('0/5', hasRequirement ? reqColor : '#8deeff');
  label.position.set(0, def.h + .45, .12); group.add(label);
  const reqLabel = hasRequirement ? labelSprite(`${PALETTES[paletteIndex].colors[def.rc].glyph} 0/${def.rn}`, reqColor) : null;
  if (reqLabel) { reqLabel.scale.set(.84, .19, 1); reqLabel.position.set(0, -.22, .13); group.add(reqLabel); }
  poleGroup.add(group);
  return {
    group, shaft, top, beacon, label, reqLabel, x: def.x, baseX: def.x, h: def.h, spd: def.spd || 0, phase: Math.random() * TAU,
    capacity, reqColor: hasRequirement ? def.rc : -1, reqCount: def.rn || 0, rings: [], pending: [], stress: 0, rejectCd: 0, lastColor: -1, combo: 0, vX: 0
  };
}

function createRing(ci, index) {
  const info = PALETTES[paletteIndex].colors[ci];
  const color = new THREE.Color(info.hex);
  const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .62, roughness: .28, metalness: .08 });
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, MOBILE_DEVICE ? 10 : 16, MOBILE_DEVICE ? 24 : 36), material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // Un aro real cae plano sobre un palo vertical: el agujero mira hacia arriba.
  // El eje Z del TorusGeometry se gira al eje Y para que no quede de canto.
  mesh.rotation.set(Math.PI / 2, 0, 0);
  const glyph = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(info.glyph, ['#ffffff', '#f3df72', '#fff000'].includes(info.hex.toLowerCase())), transparent: true, depthTest: false }));
  glyph.userData.shared = true;
  glyph.scale.set(.21, .21, 1); glyph.position.set(0, .095, 0); mesh.add(glyph);
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.045, MOBILE_DEVICE ? 5 : 8, MOBILE_DEVICE ? 4 : 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  marker.position.set(RING_RADIUS * .78, 0, 0); mesh.add(marker);
  ringGroup.add(mesh);
  return {
    mesh, marker, ci, color: info.hex, glyph: info.glyph, index, x: 0, y: 0, z: 0,
    scored: false, threading: false, locked: false, locking: false, pole: null, stackIndex: -1, lockTargetY: 0, points: 0,
    angle: Math.random() * TAU, spin: (Math.random() - .5) * 1.4,
    pitch: (Math.random() - .5) * .12, roll: (Math.random() - .5) * .12
  };
}

function createRingPhysicsBody(ring) {
  const body = new CANNON.Body({ mass: RING_MASS, material: ringPhysicsMaterial });
  body.linearDamping = .16;
  body.angularDamping = .24;
  body.allowSleep = false;
  const segments = MOBILE_DEVICE ? 12 : 16;
  const tangentHalfLength = RING_RADIUS * Math.sin(Math.PI / segments) * 1.18;
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * TAU;
    const offset = new CANNON.Vec3(Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS);
    const shape = new CANNON.Box(new CANNON.Vec3(RING_TUBE * 1.08, RING_TUBE * .8, tangentHalfLength));
    const rotation = new CANNON.Quaternion();
    rotation.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    body.addShape(shape, offset, rotation);
  }
  body.position.set(ring.x, ring.y, ring.z);
  body.quaternion.setFromEuler(ring.pitch, ring.angle, ring.roll, 'XYZ');
  body.angularVelocity.set((Math.random() - .5) * .5, ring.spin, (Math.random() - .5) * .5);
  body.userData = { ring };
  physicsWorld.addBody(body);
  ring.body = body;
  physicsRingBodies.push(body);
}

function createPolePhysicsBody(pole) {
  const body = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
  const shaft = new CANNON.Cylinder(.075, .12, pole.h, MOBILE_DEVICE ? 8 : 12);
  body.addShape(shaft, new CANNON.Vec3(0, pole.h / 2, 0));
  body.addShape(new CANNON.Sphere(POLE_TIP_RADIUS), new CANNON.Vec3(0, pole.h, 0));
  body.addShape(new CANNON.Cylinder(.42, .48, .18, MOBILE_DEVICE ? 8 : 12), new CANNON.Vec3(0, .09, 0));
  body.position.set(pole.x, BASE_Y, 0);
  body.userData = { pole };
  physicsWorld.addBody(body);
  pole.body = body;
  physicsPoleBodies.push(body);
}

function rebuildPhysicsLevel() {
  physicsPoleBodies.forEach((body) => physicsWorld.removeBody(body));
  physicsRingBodies.forEach((body) => physicsWorld.removeBody(body));
  physicsPoleBodies = []; physicsRingBodies = [];
  poles.forEach(createPolePhysicsBody);
  rings.forEach(createRingPhysicsBody);
  physicsWorld.broadphase.dirty = true;
}

function setRingVisualPosition(ring, x, y, z) {
  ring.mesh.position.set(x * visualScaleX, y, z);
}
function resetRings() {
  clearGroup(ringGroup);
  rings = [];
  let index = 0;
  for (let ci = 0; ci < 4; ci++) {
    for (let n = 0; n < 5; n++) {
      const ring = createRing(ci, index++);
      // Cada aro nace cerca del carril de un palo, pero deliberadamente fuera
      // de su radio de entrada. Nunca aparece ya atravesando la punta: el
      // jugador debe elevarlo y corregir X/Y para que cruce la bola del palo.
      const spawnPole = poles[ring.index % poles.length];
      const side = Math.random() < .5 ? -1 : 1;
      ring.x = spawnPole.baseX + side * (.84 + Math.random() * .14);
      ring.y = BASE_Y + .35 + Math.random() * (WATER_TOP - BASE_Y - 1.05);
      ring.z = (Math.random() - .5) * .56;
      while (poles.some((pole) => Math.hypot(ring.x - pole.baseX, ring.z) < .84)) {
        ring.x += side * .08;
      }
      setRingVisualPosition(ring, ring.x, ring.y, ring.z);
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

let visualScaleX = 1;

// El modelo nació con proporción panorámica, pero el juguete se juega sobre
// todo en móvil. Comprimimos solo la composición horizontal para que el
// acuario llene una pantalla cuadrada; los aros y las bases compensan esa
// escala para conservar círculos y volumen.
function applyVisualScale(aspect = 1) {
  visualScaleX = clamp(aspect * .5, .3, 1);
  [stageGroup, poleGroup, effectGroup].forEach((group) => { group.scale.x = visualScaleX; });
  ringGroup.scale.x = 1;
  marineDecor.scale.x = visualScaleX;
  poles.forEach((pole) => { pole.group.scale.x = 1 / visualScaleX; });
  rings.forEach((ring) => { ring.mesh.scale.setScalar(1); setRingVisualPosition(ring, ring.x, ring.y, ring.z); });
  nozzles.forEach((nozzle) => { nozzle.scale.x = 1 / visualScaleX; });
  jetBeams.forEach((beam) => { beam.scale.x = 1 / visualScaleX; });
}

function initGame(level = currentLevel) {
  currentLevel = clamp(level, 1, maxLevel);
  storage.set('wrt_current_level', String(currentLevel));
  state.score = 0; state.elapsed = 0; state.tiltX = 0; state.tiltY = 0; state.gameOver = false; state.winQueued = false; window.clearTimeout(state.winTimer); state.winTimer = 0; state.currentCombo = 1;
  input.jets.fill(false);
  input.pointerJets.fill(false); input.keyboardJets.fill(false); input.gamepadJets.fill(false);
  input.keys = {}; input.pointerKeys = {}; input.keyboardKeys = {}; input.gamepadKeys = {};
  document.querySelectorAll('.control-btn').forEach((button) => { button.classList.remove('pressed'); button.setAttribute('aria-pressed', 'false'); });
  clearGroup(poleGroup);
  poles = LEVELS[currentLevel].poles.map(createPole);
  resetRings();
  rebuildPhysicsLevel();
  physicsAccumulator = 0;
  const screenAspect = waterScreen.clientWidth && waterScreen.clientHeight ? waterScreen.clientWidth / waterScreen.clientHeight : 1;
  applyVisualScale(screenAspect);
  updateUI(true);
  $('endOv').classList.remove('show');
  $('menuLevel').textContent = currentLevel;
}

/* -------------------------------------------------------------------------- */
/* Water and gameplay physics                                                 */
/* -------------------------------------------------------------------------- */

function updateWater(dt) {
  waveTime += dt;
  waterUpdateFrame++;
  const animateSurface = !MOBILE_DEVICE || waterUpdateFrame % 2 === 0;
  if (animateSurface) {
    const pos = waterGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = waterBaseZ[i];
      const wave = Math.sin(x * 1.25 + waveTime * 2.0) * .035 + Math.cos(z * 1.5 - waveTime * 1.35) * .026 + Math.sin((x + z) * 2.8 + waveTime * 1.1) * .014;
      pos.setZ(i, z + wave);
    }
    pos.needsUpdate = true;
    if (!MOBILE_DEVICE && Math.floor(waveTime * 30) % 2 === 0) waterGeometry.computeVertexNormals();
    const backPos = waterBackdrop.geometry.attributes.position;
    for (let i = 0; i < backPos.count; i++) {
      const x = backPos.getX(i); const y = backPos.getY(i);
      backPos.setZ(i, waterBackdropBaseZ[i] + Math.sin(x * .8 + waveTime * 1.4) * .018 + Math.cos(y * 1.3 - waveTime) * .012);
    }
    backPos.needsUpdate = true;
  }
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
  return new THREE.Vector3(
    Math.sin(swing),
    Math.cos(swing),
    Math.sin(state.elapsed * 1.15 + index * 1.7) * .12 + state.tiltY * .08
  ).normalize();
}

function updateJetVisuals(dt) {
  for (let j = 0; j < 3; j++) {
    const active = input.jets[j] && !state.paused && !state.gameOver;
    const beam = jetBeams[j];
    const nozzle = nozzles[j];
    const direction = jetDirection(j);
    const length = 4.7;
    beam.position.set(JET_X[j] + direction.x * length / 2, NOZZLE_Y + direction.y * length / 2, .58);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    beam.material.opacity = lerp(beam.material.opacity, active ? .24 : 0, Math.min(1, dt * 13));
    beam.material.emissiveIntensity = active ? 1.35 + Math.sin(state.elapsed * 18) * .25 : .5;
    nozzle.material.emissiveIntensity = active ? .75 : .1;
    const pulse = active ? 1.06 + Math.sin(state.elapsed * 20) * .04 : 1;
    nozzle.scale.set(pulse / visualScaleX, pulse, pulse);
  }
}

function updateJetEffects(dt) {
  const active = input.jets.map((jet, index) => jet && !state.paused && !state.gameOver ? index : -1).filter((index) => index >= 0);
  if (!active.length) { jSoundTimer = 0; return; }
  jSoundTimer += dt;
  if (jSoundTimer > .11) { sfxJet(); jSoundTimer = 0; }
  active.forEach((index) => spawnJetParticles(index));
}

function spawnJetParticles(index) {
  const direction = jetDirection(index);
  for (let i = 0; i < (MOBILE_DEVICE ? 3 : 5); i++) {
    const spread = (Math.random() - .5) * .22;
    particles.push({
      x: JET_X[index] + spread, y: NOZZLE_Y + .16, z: .55 + (Math.random() - .5) * .16,
      vx: direction.x * (1.8 + Math.random() * 1.8) + (Math.random() - .5) * .65,
      vy: direction.y * (4.2 + Math.random() * 2.5), vz: direction.z * (2.1 + Math.random() * 1.2) + (Math.random() - .5) * .5,
      life: .46 + Math.random() * .5, maxLife: .9, size: .6 + Math.random() * .6
    });
  }
  if (particles.length > PARTICLE_CAPACITY) particles.splice(0, particles.length - PARTICLE_CAPACITY);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; p.vy -= 2.1 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.life <= 0 || p.y < BASE_Y - .2) particles.splice(i, 1);
  }
  const positions = particlePoints.geometry.attributes.position.array;
  for (let i = 0; i < PARTICLE_CAPACITY; i++) {
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

function countColorCombos(pole) {
  const counts = {};
  for (const ring of pole.rings) counts[ring.ci] = (counts[ring.ci] || 0) + 1;
  const combos = Object.values(counts).filter((value) => value >= 5).length;
  return { combos, counts };
}

function colorRequirementsMet() {
  return poles.every((pole) => pole.reqColor < 0 || pole.rings.filter((ring) => ring.ci === pole.reqColor).length >= pole.reqCount);
}

const cannonForce = new CANNON.Vec3();
const cannonPoint = new CANNON.Vec3();
function submergedFraction(y) {
  return clamp((WATER_TOP - y + RING_TUBE) / (RING_TUBE * 2.2), 0, 1);
}

function updatePhysicsPoleMotion(dt) {
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
    if (pole.body) {
      pole.body.position.x = pole.x;
      pole.body.velocity.set(pole.vX, 0, 0);
      pole.body.aabbNeedsUpdate = true;
      pole.body.updateAABB();
    }
    updatePolePenalty(pole, dt);
    updatePoleLabel(pole);
  }
  // SAP conserva una lista ordenada; un nivel con palos móviles debe volver a
  // ordenarla antes de buscar contactos para no perder choques al cruzar X.
  physicsWorld.broadphase.dirty = true;
}

function updatePolePenalty(pole, dt) {
  const occupied = pole.rings.length;
  if (!occupied) {
    pole.stress = Math.max(0, pole.stress - dt * 3.6);
    pole.shaft.material.emissiveIntensity = .3;
    pole.top.material.emissiveIntensity = .15;
    return;
  }
  let pressure = Math.abs(state.tiltX) * .11 + Math.abs(state.tiltY) * .09;
  for (let j = 0; j < 3; j++) {
    if (!input.jets[j]) continue;
    const distance = Math.abs(pole.x - JET_X[j]);
    if (distance < 1.55) pressure += (1 - distance / 1.55) * (.52 + Math.min(.24, jSoundTimer * .1));
  }
  if (pressure > .025) pole.stress += pressure * dt;
  else pole.stress = Math.max(0, pole.stress - dt * 1.7);
  pole.rejectCd = Math.max(0, pole.rejectCd - dt);
  const comboCount = countColorCombos(pole).combos;
  const ejectMultiplier = comboCount >= 1 ? 1.55 : 1;
  if (pole.rejectCd <= 0 && pole.stress > 2.35 / ejectMultiplier) {
    if (pole.stress > 4.2 / ejectMultiplier) ejectAllFromPole(pole);
    else ejectPoleRing(pole.rings[pole.rings.length - 1], true);
    pole.rejectCd = .72;
    pole.stress = .05;
  }
  const danger = clamp(pole.stress / 2.35, 0, 1);
  pole.shaft.material.emissiveIntensity = .3 + danger * .9;
  pole.top.material.emissiveIntensity = .15 + danger * 1.2;
  pole.beacon.material.color.set(danger > .72 ? 0xff4c62 : pole.reqColor >= 0 ? PALETTES[paletteIndex].colors[pole.reqColor].hex : 0x7feaff);
}

function applyCannonForces(dt) {
  const elapsed = state.elapsed;
  for (const ring of rings) {
    const body = ring.body;
    if (!body) continue;
    const submerged = submergedFraction(body.position.y);
    if (ring.locked) continue;
    const activeFactor = ring.threading ? .18 : 1;
    body.force.y += submerged * RING_BUOYANCY_FORCE;
    const currentX = Math.sin(elapsed * .9 + body.position.y * .8 + body.position.z * 1.7) * .22 + Math.cos(elapsed * .55 + body.position.x * .35) * .1;
    const currentZ = Math.cos(elapsed * .8 + body.position.x * .6) * .16 + Math.sin(elapsed * .47 + body.position.y) * .08;
    body.force.x += (currentX - body.velocity.x) * RING_MASS * .42 * submerged;
    body.force.z += (currentZ - body.velocity.z) * RING_MASS * .42 * submerged;
    body.force.x += state.tiltX * RING_MASS * 3.4;
    // El control vertical vuelve a ser el centro de la jugabilidad: ↑ / ↓ y
    // beta del giroscopio elevan o bajan el aro. Z sigue siendo físico, pero
    // solo recibe una componente pequeña dentro del carril estrecho.
    body.force.y += -state.tiltY * RING_MASS * 4.4;
    body.force.z += state.tiltY * RING_MASS * .7;
    body.torque.x += -body.angularVelocity.x * (1.1 + submerged * 1.8);
    body.torque.z += -body.angularVelocity.z * (1.1 + submerged * 1.8);

    for (let j = 0; j < 3; j++) {
      if (!input.jets[j]) continue;
      const direction = jetDirection(j);
      const dx = body.position.x - JET_X[j];
      const dz = body.position.z;
      const radial = Math.hypot(dx, dz);
      const widthFalloff = clamp(1 - radial / 1.55, 0, 1);
      const dy = Math.max(0, body.position.y - NOZZLE_Y);
      if (widthFalloff <= 0 || body.position.y < NOZZLE_Y - .25) continue;
      const heightFalloff = clamp(1 - dy / 5.25, .16, 1);
      const falloff = Math.pow(widthFalloff * heightFalloff, .82) * activeFactor;
      cannonForce.set(direction.x * 7.8 * falloff, direction.y * 10.8 * falloff, direction.z * 7.8 * falloff);
      cannonPoint.set((JET_X[j] - body.position.x) * .5, -.24, -body.position.z * .5);
      body.applyForce(cannonForce, cannonPoint);
    }
  }
}

function removePendingRing(ring, pole) {
  const index = pole.pending.indexOf(ring);
  if (index >= 0) pole.pending.splice(index, 1);
}

function rebuildPoleCombo(pole) {
  const last = pole.rings[pole.rings.length - 1];
  pole.lastColor = last ? last.ci : -1;
  pole.combo = 0;
  if (!last) return;
  for (let index = pole.rings.length - 1; index >= 0 && pole.rings[index].ci === last.ci; index--) pole.combo++;
}

function makeRingKinematic(ring) {
  const body = ring.body;
  body.type = CANNON.Body.KINEMATIC;
  body.mass = 0;
  body.updateMassProperties();
  body.force.set(0, 0, 0);
  body.torque.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.velocity.set(0, -RING_LOCK_SPEED, 0);
  body.collisionResponse = true;
  body.wakeUp();
}

function makeRingDynamic(ring, pole) {
  const body = ring.body;
  body.type = CANNON.Body.DYNAMIC;
  body.mass = RING_MASS;
  body.updateMassProperties();
  body.force.set(0, 0, 0);
  body.torque.set(0, 0, 0);
  body.velocity.set(pole?.vX * .15 + (Math.random() - .5) * .65, .85 + Math.random() * .45, (Math.random() - .5) * .55);
  body.angularVelocity.set((Math.random() - .5) * 2.2, (Math.random() - .5) * 2.8, (Math.random() - .5) * 2.2);
  body.collisionResponse = true;
  body.wakeUp();
}

function registerPhysicsScore(ring, pole) {
  removePendingRing(ring, pole);
  ring.threading = false; ring.scored = true; ring.locked = true; ring.locking = true; ring.pole = pole;
  ring.stackIndex = pole.rings.length;
  ring.lockTargetY = BASE_Y + .24 + ring.stackIndex * RING_STEP;
  pole.rings.push(ring);
  makeRingKinematic(ring);
  const combo = pole.lastColor === ring.ci ? pole.combo + 1 : 1;
  pole.lastColor = ring.ci; pole.combo = combo; ring.points = 100 * combo;
  state.score += ring.points; state.currentCombo = Math.max(state.currentCombo, combo);
  spawnScorePop(ring, `+${ring.points}`, combo);
  sfxScore(combo); vibrate(combo > 1 ? 26 : 12);
  updateUI(true); updatePoleLabel(pole);
  if (ring.points > 100) showToast(`COMBO x${combo}`);
  if (rings.filter((item) => item.scored).length >= TOTAL_RINGS && poles.every((item) => item.rings.length >= MIN_PER_POLE) && colorRequirementsMet()) {
    if (!state.winQueued) {
      state.winQueued = true;
      state.winTimer = window.setTimeout(() => { state.winTimer = 0; showEnd(); }, 720);
    }
  }
}

function ejectPoleRing(ring, fromPenalty = false) {
  if (!ring || !ring.scored || !ring.pole) return;
  const pole = ring.pole;
  const index = pole.rings.indexOf(ring);
  if (index >= 0) pole.rings.splice(index, 1);
  state.score = Math.max(0, state.score - (ring.points || 100));
  ring.scored = false; ring.locked = false; ring.locking = false; ring.threading = false;
  ring.pole = null; ring.stackIndex = -1; ring.lockTargetY = 0; ring.points = 0;
  makeRingDynamic(ring, pole);
  rebuildPoleCombo(pole);
  if (state.winQueued) { state.winQueued = false; window.clearTimeout(state.winTimer); state.winTimer = 0; }
  if (fromPenalty) { sfxFail(); showToast('TENSIÓN · ARO EXPULSADO'); vibrate(35); }
  updateUI(true); updatePoleLabel(pole);
}

function ejectAllFromPole(pole) {
  [...pole.rings].reverse().forEach((ring) => ejectPoleRing(ring));
  sfxFail(); showToast('TENSIÓN MÁXIMA · PALO VACÍO'); vibrate([40, 25, 70]);
}

function checkPhysicsPoleEntries() {
  for (const ring of rings) {
    const body = ring.body;
    if (!body || ring.scored) continue;
    if (ring.threading) {
      const pole = ring.pole;
      const horizontal = Math.hypot(body.position.x - pole.x, body.position.z);
      // En cuanto el cuerpo cruza por debajo de la esfera de la punta, el
      // enceste ya cuenta. No se espera a que repose ni se recoloca el aro.
      if (body.position.y < BASE_Y + pole.h - .03 && horizontal < .18) registerPhysicsScore(ring, pole);
      else if (body.position.y > BASE_Y + pole.h + .28 && horizontal > .24) {
        ring.threading = false; ring.pole = null; removePendingRing(ring, pole);
      }
      continue;
    }
    if (body.velocity.y >= -.04) continue;
    for (const pole of poles) {
      if (pole.rings.length + pole.pending.length >= pole.capacity) continue;
      const topY = BASE_Y + pole.h;
      const dx = body.position.x - pole.x;
      const radial = Math.hypot(dx, body.position.z);
      if (body.position.y < topY - .14 || body.position.y > topY + .48 || radial > RING_CAPTURE_RADIUS) continue;
      ring.threading = true; ring.pole = pole; ring.stackIndex = pole.rings.length + pole.pending.length;
      pole.pending.push(ring); body.wakeUp();
      break;
    }
  }
}

function advanceLockedRings() {
  for (const ring of rings) {
    if (!ring.locked || !ring.body) continue;
    const pole = ring.pole;
    ring.body.velocity.x = pole?.vX || 0;
    ring.body.velocity.z = 0;
    ring.body.velocity.y = ring.locking ? -RING_LOCK_SPEED : 0;
  }
}

function finishLockedRings() {
  for (const ring of rings) {
    if (!ring.locked || !ring.locking || !ring.body) continue;
    if (ring.body.position.y > ring.lockTargetY) continue;
    ring.body.position.y = ring.lockTargetY;
    ring.body.velocity.set(0, 0, 0);
    ring.locking = false;
    ring.body.aabbNeedsUpdate = true;
    ring.body.updateAABB();
  }
}

function syncPhysicsToScene() {
  for (const ring of rings) {
    const body = ring.body;
    if (!body) continue;
    ring.x = body.position.x; ring.y = body.position.y; ring.z = body.position.z;
    setRingVisualPosition(ring, ring.x, ring.y, ring.z);
    ring.mesh.quaternion.copy(body.quaternion).multiply(ringFlatQuaternion);
  }
}

function stepCannonPhysics(dt) {
  physicsAccumulator = Math.min(physicsAccumulator + Math.min(dt, .05), .12);
  let steps = 0;
  while (physicsAccumulator >= physicsFixedStep && steps < 4) {
    updatePhysicsPoleMotion(physicsFixedStep);
    advanceLockedRings();
    applyCannonForces(physicsFixedStep);
    physicsWorld.step(physicsFixedStep);
    checkPhysicsPoleEntries();
    finishLockedRings();
    physicsAccumulator -= physicsFixedStep; steps++;
  }
  syncPhysicsToScene();
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
  updateGamepad();
  updateCamera(dt);
  if (state.paused || state.gameOver) {
    updateWater(dt);
    updateJetVisuals(dt);
    updateParticles(dt);
    syncPhysicsToScene();
    return;
  }
  state.elapsed += dt;
  $('tV').textContent = formatTime(state.elapsed);
  updateTilt(dt);
  updateWater(dt);
  updateJetVisuals(dt);
  updateJetEffects(dt);
  stepCannonPhysics(dt);
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
  state.winTimer = 0;
  state.gameOver = true; state.paused = true;
  input.pointerJets.fill(false); input.keyboardJets.fill(false); input.gamepadJets.fill(false);
  input.pointerKeys = {}; input.keyboardKeys = {}; input.gamepadKeys = {}; input.keys = {};
  input.jets.fill(false); document.querySelectorAll('.control-btn').forEach((button) => { button.classList.remove('pressed'); button.setAttribute('aria-pressed', 'false'); });
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
  const start = (event) => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); on(); };
  const end = (event) => { event.preventDefault(); off(); };
  button.addEventListener('pointerdown', start); button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end); button.addEventListener('pointerleave', end); button.addEventListener('lostpointercapture', end);
}

document.querySelectorAll('[data-jet]').forEach((button) => {
  const index = Number(button.dataset.jet);
  bindHold(button, () => { ensureAudio(); if (!state.paused && !state.gameOver) { input.pointerJets[index] = true; refreshJetInput(index); vibrate(8); } }, () => { input.pointerJets[index] = false; refreshJetInput(index); });
});
document.querySelectorAll('[data-tilt]').forEach((button) => {
  const map = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }; const key = map[button.dataset.tilt];
  bindHold(button, () => { if (!state.paused && !state.gameOver) { input.pointerKeys[key] = true; refreshTiltInput(key); } }, () => { input.pointerKeys[key] = false; refreshTiltInput(key); });
});

let activeGamepadIndex = -1;
function updateGamepad() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads() || [];
  let pad = activeGamepadIndex >= 0 ? pads[activeGamepadIndex] : null;
  if (!pad) {
    activeGamepadIndex = -1;
    for (let index = 0; index < pads.length; index++) {
      if (pads[index]) { activeGamepadIndex = index; pad = pads[index]; break; }
    }
  }
  if (!pad) {
    for (let index = 0; index < 3; index++) { input.gamepadJets[index] = false; refreshJetInput(index); }
    Object.keys(input.gamepadKeys).forEach((key) => { input.gamepadKeys[key] = false; refreshTiltInput(key); });
    return;
  }
  const buttonPressed = (index) => Boolean(pad.buttons[index]?.pressed);
  const axes = pad.axes || [];
  const jets = [buttonPressed(0), buttonPressed(1), buttonPressed(2)];
  jets.forEach((pressed, index) => { input.gamepadJets[index] = pressed; refreshJetInput(index); });
  const directions = {
    ArrowLeft: buttonPressed(14) || (axes[0] || 0) < -.35,
    ArrowRight: buttonPressed(15) || (axes[0] || 0) > .35,
    ArrowUp: buttonPressed(12) || (axes[1] || 0) < -.35,
    ArrowDown: buttonPressed(13) || (axes[1] || 0) > .35
  };
  Object.entries(directions).forEach(([key, pressed]) => { input.gamepadKeys[key] = pressed; refreshTiltInput(key); });
}

document.addEventListener('keydown', (event) => {
  if ($('tutOv').classList.contains('show')) {
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (tutorialStep >= 5) closeTutorial(); else { tutorialStep++; updateTutorial(); } }
    else if (event.key === 'ArrowLeft' && tutorialStep > 0) { event.preventDefault(); tutorialStep--; updateTutorial(); }
    else if (event.key === 'Escape') closeTutorial();
    return;
  }
  const key = event.key.toLowerCase();
  if (['a', 's', 'd'].includes(key) && !state.paused && !state.gameOver) {
    const index = { a: 0, s: 1, d: 2 }[key]; input.keyboardJets[index] = true; refreshJetInput(index);
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && !state.paused && !state.gameOver) {
    event.preventDefault(); input.keyboardKeys[event.key] = true; refreshTiltInput(event.key);
  }
  if (key === 'r' && !state.paused && !state.gameOver) { initGame(currentLevel); state.paused = false; }
});
document.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  if (['a', 's', 'd'].includes(key)) { const index = { a: 0, s: 1, d: 2 }[key]; input.keyboardJets[index] = false; refreshJetInput(index); }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { input.keyboardKeys[event.key] = false; refreshTiltInput(event.key); }
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
  applyVisualScale(aspect);
  // El escenario se compacta horizontalmente en pantallas casi cuadradas.
  // Así la cámara no tiene que alejarse para encajar un tanque panorámico y
  // desaparecen las franjas negras que dejaban el juego como una miniatura.
  const fieldWidth = 12.8 * visualScaleX;
  const fieldHeight = 6.2;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const fitVertical = (fieldHeight / 2) / Math.tan(verticalFov / 2);
  const fitHorizontal = (fieldWidth / 2) / Math.tan(horizontalFov / 2);
  camera.userData.fitZ = Math.max(7.2, fitVertical, fitHorizontal) + .35;
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

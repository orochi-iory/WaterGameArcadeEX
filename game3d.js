import * as THREE from './vendor/three.module.js';
import * as CANNON from './vendor/cannon-es.js';

const $ = (id) => document.getElementById(id);
const MOBILE_DEVICE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768;
const WATER_GRID_X = MOBILE_DEVICE ? 24 : 48;
const WATER_GRID_Y = MOBILE_DEVICE ? 10 : 18;
const BACKDROP_GRID_Y = MOBILE_DEVICE ? 12 : 24;
const BUBBLE_COUNT = MOBILE_DEVICE ? 12 : 28;
const PARTICLE_CAPACITY = MOBILE_DEVICE ? 220 : 480;
const JET_BUBBLE_COUNT = MOBILE_DEVICE ? 6 : 12;
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
// La colisión coincide con la cara superior del floorTrim visible.
const PHYSICS_FLOOR_TOP = BASE_Y - .0475;
// El tanque ocupa todo el volumen jugable. WATER_Y se conserva como altura de
// aparición para repartir los aros; WATER_TOP es la superficie real del agua.
const WATER_Y = -1.72;
const WATER_TOP = 2.55;
// Render y física 2.5D: una lámina estrecha, no un cubo navegable.
const PLAY_DEPTH = 1.1;
const RING_RADIUS = 0.27;
const RING_TUBE = .065;
const RING_STACK_STEP = RING_TUBE * 2 + .015;
const RING_COLLISION_TUBE = RING_TUBE;
const RING_HOLE_RADIUS = RING_RADIUS - RING_TUBE;
const RING_OUTER_RADIUS = RING_RADIUS + RING_TUBE;
const RING_MASS = .72;
// Un aro que ha tocado el interior del palo gana peso, pero conserva una
// posibilidad real de volver a salir si un chorro lo levanta.
const RING_SEATED_MASS = RING_MASS * 2;

const RING_BUOYANCY_FORCE = 3.5;
const POLE_SHAFT_TOP_RADIUS = .075;
const POLE_SHAFT_RADIUS = .12;
const POLE_TIP_RADIUS = .11;
// Entrada física estricta, usada cuando el aro llega sin asistencia.
const RING_ENTRY_RADIUS = Math.max(.01, RING_HOLE_RADIUS - POLE_TIP_RADIUS);
// Ventana corta para conservar un contacto Cannon con el eje o la punta
// mientras el centro termina de llegar al borde interior. No guía por sí sola.
const RING_CAPTURE_RADIUS = RING_OUTER_RADIUS + POLE_TIP_RADIUS;
// Ventana estrecha para reconocer el contacto del borde interior del agujero.
// La captura ya no se activa por rozar el diámetro exterior del aro.
const RING_INNER_CONTACT_RADIUS = RING_ENTRY_RADIUS + .03;
const RING_CAPTURE_VERTICAL = RING_OUTER_RADIUS + POLE_TIP_RADIUS + .1;
const RING_ORIENTATION_ASSIST = .62;
const RING_SEAT_MAX_TILT = Math.PI / 6;
const RING_SEAT_LEVELING_STIFFNESS = 9;
const RING_SEAT_LEVELING_DAMPING = 2.2;
const RING_SEAT_STIFFNESS = 1.0;
const RING_SEAT_DAMPING = .8;
const RING_SEAT_HORIZONTAL_STIFFNESS = 4.8;
const RING_SEAT_HORIZONTAL_DAMPING = 2.4;
const RING_SEATED_CONTROL_ACCELERATION = 9;
const TILT_PENALTY_ACTIVATION_SECONDS = 3;
const TILT_PENALTY_RELEASE_RATE = 3;
const RING_PAIR_MIN_DISTANCE = .5;
const RING_PAIR_SEPARATION_STIFFNESS = 34;
const RING_PAIR_SEPARATION_DAMPING = 7;
const FLOOR_SUPPORT_STIFFNESS = 720;
const FLOOR_SUPPORT_DAMPING = 90;
const FLOOR_SUPPORT_MAX_FORCE = 320;
const ringFlatQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const GRAVITY = -5.6;
const NOZZLE_Y = BASE_Y - .02;
const NOZZLE_Z = PLAY_DEPTH / 2 - .28;
const JET_FIELD_RADIUS = 1.82;
const JET_FORCE_X = 9.4;
const JET_FORCE_Y = 13.2;
const JET_X = [-3.35, 0, 3.35];
const JET_COLORS = [0xff6b6b, 0x3fe2aa, 0x5bc8ff];
const PALETTES = [
  { name: 'Normal', desc: 'Visión normal', colors: [
    { name: 'Bermellón', hex: '#e85b5b' }, { name: 'Azul', hex: '#42b9f2' },
    { name: 'Verde', hex: '#43d29c' }, { name: 'Dorado', hex: '#f0b84f' }
  ]},
  { name: 'Deuteranopia', desc: 'Rojo-verde', colors: [
    { name: 'Naranja', hex: '#f0a23a' }, { name: 'Azul', hex: '#4ba9f2' },
    { name: 'Rosa', hex: '#de81bc' }, { name: 'Crema', hex: '#f3df72' }
  ]},
  { name: 'Protanopia', desc: 'Ceguera al rojo', colors: [
    { name: 'Azul', hex: '#4ba9f2' }, { name: 'Naranja', hex: '#f0a23a' },
    { name: 'Magenta', hex: '#d47ac0' }, { name: 'Cian', hex: '#70d7f4' }
  ]},
  { name: 'Tritanopia', desc: 'Azul-amarillo', colors: [
    { name: 'Rojo', hex: '#ef6868' }, { name: 'Magenta', hex: '#d47ac0' },
    { name: 'Verde', hex: '#43d29c' }, { name: 'Gris', hex: '#a8b2bc' }
  ]},
  { name: 'Alto contraste', desc: 'Máxima diferenciación', colors: [
    { name: 'Blanco', hex: '#ffffff' }, { name: 'Rojo', hex: '#ff3030' },
    { name: 'Azul', hex: '#315cff' }, { name: 'Amarillo', hex: '#fff000' }
  ]}
];

const LEVELS = [
  null,
  { name: 'Clásico', poles: [{ x: -2.75, h: 2.55, spd: 0 }, { x: 0, h: 3.28, spd: 0 }, { x: 2.75, h: 2.55, spd: 0 }] },
  { name: 'Alturas', poles: [{ x: -3.2, h: 2.2, spd: 0 }, { x: 0, h: 3.36, spd: 0 }, { x: 3.2, h: 2.2, spd: 0 }] },
  { name: 'Escalera', poles: [{ x: -3.35, h: 3.25, spd: 0 }, { x: 0, h: 2.55, spd: 0 }, { x: 3.35, h: 2.0, spd: 0 }] },
  { name: 'Movimiento', poles: [{ x: -2.9, h: 2.25, spd: 0 }, { x: 0, h: 3.1, spd: .75 }, { x: 2.9, h: 2.25, spd: 0 }] },
  { name: 'Caos', poles: [{ x: -3.35, h: 2.35, spd: 1.1 }, { x: 0, h: 3.25, spd: .62 }, { x: 3.35, h: 2.2, spd: 1.38 }] },
  { name: 'Colores', poles: [
    { x: -2.75, h: 2.55, spd: 0, rc: 0, rn: 3 }, { x: 0, h: 3.28, spd: 0, rc: 1, rn: 3 }, { x: 2.75, h: 2.55, spd: 0, rc: 2, rn: 3 }
  ]},
  { name: 'Prisma', poles: [
    { x: -3.2, h: 2.2, spd: 0, rc: 3, rn: 3 }, { x: 0, h: 3.36, spd: 0, rc: 0, rn: 3 }, { x: 3.2, h: 2.2, spd: 0, rc: 1, rn: 3 }
  ]},
  { name: 'Arcoíris', poles: [
    { x: -3.35, h: 3.25, spd: 0, rc: 2, rn: 4 }, { x: 0, h: 2.55, spd: 0, rc: 3, rn: 3 }, { x: 3.35, h: 2.0, spd: 0, rc: 0, rn: 3 }
  ]},
  { name: 'Flujo', poles: [
    { x: -2.9, h: 2.25, spd: 0, rc: 1, rn: 3 }, { x: 0, h: 3.1, spd: .78, rc: 2, rn: 4 }, { x: 2.9, h: 2.25, spd: 0, rc: 3, rn: 3 }
  ]},
  { name: 'Maestro', poles: [
    { x: -3.35, h: 2.35, spd: 1.1, rc: 0, rn: 3 }, { x: 0, h: 3.25, spd: .62, rc: 1, rn: 4 }, { x: 3.35, h: 2.2, spd: 1.38, rc: 2, rn: 3 }
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
physicsWorld.solver.iterations = MOBILE_DEVICE ? 10 : 16;
physicsWorld.solver.tolerance = .00025;
const ringPhysicsMaterial = new CANNON.Material('ring');
const tankPhysicsMaterial = new CANNON.Material('tank');
physicsWorld.defaultContactMaterial.friction = .018;
physicsWorld.defaultContactMaterial.restitution = .34;
// Contactos lubricados: el aro conserva el rebote, pero no pierde toda la
// velocidad al rozar un palo, una pared o la base.
physicsWorld.addContactMaterial(new CANNON.ContactMaterial(ringPhysicsMaterial, tankPhysicsMaterial, { friction: .004, restitution: .46 }));
const physicsGround = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
// Conserva la cara superior en la misma cota que el suelo visual, pero con
// más espesor hacia abajo para que un aro no pueda atravesarlo por tunneling.
physicsGround.addShape(new CANNON.Box(new CANNON.Vec3(6, .22, 2.85)));
physicsGround.position.set(0, PHYSICS_FLOOR_TOP - .22, .15);
physicsWorld.addBody(physicsGround);
const physicsSideWalls = [];
for (const x of [-5.94, 5.94]) {
  const wall = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(.08, 3.1, 2.7)));
  wall.position.set(x, -.1, .15); physicsWorld.addBody(wall); physicsSideWalls.push(wall);
}
// La profundidad se limita al mismo orden de magnitud que la base: las
// caras interiores quedan a Z = ±.48, justo alrededor del radio de .48.
for (const z of [-(PLAY_DEPTH / 2 + .01), PLAY_DEPTH / 2 + .01]) {
  const wall = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(6, 3.1, .08)));
  wall.position.set(0, -.1, z); physicsWorld.addBody(wall); physicsSideWalls.push(wall);
}
// Techo físico invisible justo sobre la superficie. Impide que un chorro
// saque los aros del encuadre sin convertirse en un elemento visual.
const physicsCeiling = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
physicsCeiling.addShape(new CANNON.Box(new CANNON.Vec3(6, .08, PLAY_DEPTH / 2 + .01)));
// Límite superior invisible, apenas por encima de la superficie visible.
physicsCeiling.position.set(0, WATER_TOP + .10, 0);
physicsWorld.addBody(physicsCeiling);
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
const floor = new THREE.Mesh(new THREE.BoxGeometry(12, .22, PLAY_DEPTH + .28), floorMaterial);
floor.position.set(0, BASE_Y - .2, 0);
floor.receiveShadow = !MOBILE_DEVICE;
stageGroup.add(floor);
const floorTrim = new THREE.Mesh(new THREE.BoxGeometry(12, .035, PLAY_DEPTH + .34), new THREE.MeshStandardMaterial({ color: 0x35d2bd, emissive: 0x063f4a, emissiveIntensity: .32, roughness: .25, metalness: .08 }));
floorTrim.position.set(0, BASE_Y - .065, 0);
stageGroup.add(floorTrim);

const tankHeight = WATER_TOP - BASE_Y;
const waterVolumeMaterial = MOBILE_DEVICE
  ? new THREE.MeshBasicMaterial({ color: 0x2ad0ef, transparent: true, opacity: .045, depthWrite: false, side: THREE.DoubleSide })
  : new THREE.MeshPhysicalMaterial({ color: 0x2ad0ef, roughness: .18, metalness: .02, transmission: .08, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide });
const waterVolume = new THREE.Mesh(
  new THREE.BoxGeometry(11.7, tankHeight, PLAY_DEPTH),
  waterVolumeMaterial
);
waterVolume.position.set(0, BASE_Y + tankHeight / 2, 0);
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
waterBackdrop.position.set(0, BASE_Y + tankHeight / 2, -PLAY_DEPTH / 2 - .01);
stageGroup.add(waterBackdrop);
const waterBackdropBaseZ = new Float32Array(waterBackdrop.geometry.attributes.position.count);
for (let i = 0; i < waterBackdropBaseZ.length; i++) waterBackdropBaseZ[i] = waterBackdrop.geometry.attributes.position.getZ(i);

const waterGeometry = new THREE.PlaneGeometry(11.7, PLAY_DEPTH, WATER_GRID_X, WATER_GRID_Y);
waterGeometry.rotateX(-Math.PI / 2);
const waterBaseZ = new Float32Array(waterGeometry.attributes.position.count);
for (let i = 0; i < waterGeometry.attributes.position.count; i++) waterBaseZ[i] = waterGeometry.attributes.position.getZ(i);
const waterSurfaceMaterial = MOBILE_DEVICE
  ? new THREE.MeshBasicMaterial({ color: 0x63e7f4, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide })
  : new THREE.MeshPhysicalMaterial({ color: 0x63e7f4, emissive: 0x0b6d91, emissiveIntensity: .8, roughness: .1, metalness: .12, transparent: true, opacity: .24, depthWrite: false, side: THREE.DoubleSide });
const waterSurface = new THREE.Mesh(waterGeometry, waterSurfaceMaterial);
waterSurface.position.set(0, WATER_TOP, 0);
waterSurface.receiveShadow = !MOBILE_DEVICE;
stageGroup.add(waterSurface);

const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x55e7e0, emissive: 0x0c5f7e, emissiveIntensity: .72, roughness: .18, metalness: .08 });
for (const x of [-5.98, 5.98]) {
  const edge = new THREE.Mesh(new THREE.BoxGeometry(.08, tankHeight + .28, PLAY_DEPTH + .18), edgeMaterial);
  edge.position.set(x, BASE_Y + tankHeight / 2, 0);
  edge.castShadow = true;
  stageGroup.add(edge);
}
const backRail = new THREE.Mesh(new THREE.BoxGeometry(11.95, .055, .055), edgeMaterial);
backRail.position.set(0, WATER_TOP, -PLAY_DEPTH / 2);
stageGroup.add(backRail);
const plasticRimMaterial = new THREE.MeshStandardMaterial({ color: 0x2bd6bd, emissive: 0x07534e, emissiveIntensity: .38, roughness: .2, metalness: .06 });
const topRim = new THREE.Mesh(new THREE.BoxGeometry(12.05, .16, PLAY_DEPTH + .22), plasticRimMaterial);
topRim.position.set(0, WATER_TOP + .08, 0); topRim.castShadow = true; stageGroup.add(topRim);
const bottomRim = new THREE.Mesh(new THREE.BoxGeometry(12.05, .14, PLAY_DEPTH + .22), plasticRimMaterial);
bottomRim.position.set(0, BASE_Y - .03, 0); bottomRim.castShadow = true; stageGroup.add(bottomRim);

const bubbleMaterial = MOBILE_DEVICE
  ? new THREE.MeshBasicMaterial({ color: 0xc8f7ff, transparent: true, opacity: .24, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0xc8f7ff, transparent: true, opacity: .33, roughness: .02, metalness: .1 });
const bubbleGroup = new THREE.Group();
effectGroup.add(bubbleGroup);
for (let i = 0; i < BUBBLE_COUNT; i++) {
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(.025 + Math.random() * .045, MOBILE_DEVICE ? 5 : 8, MOBILE_DEVICE ? 5 : 8), bubbleMaterial);
  bubble.position.set((Math.random() - .5) * 10.8, BASE_Y + .16 + Math.random() * (tankHeight - .38), -PLAY_DEPTH / 2 + Math.random() * PLAY_DEPTH);
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

const nozzles = [];
const jetRims = [];
const jetRipples = [];
const jetBubbles = [];
for (let j = 0; j < 3; j++) {
  // Sustituye la antigua bola/boquilla por un hueco empotrado en el suelo:
  // disco oscuro, borde metálico y una pequeña vibración de agua alrededor.
  const nozzleMaterial = new THREE.MeshStandardMaterial({ color: 0x061722, metalness: .62, roughness: .34, emissive: JET_COLORS[j], emissiveIntensity: .06 });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.145, .18, .026, MOBILE_DEVICE ? 16 : 24), nozzleMaterial);
  nozzle.position.set(JET_X[j], BASE_Y - .103, NOZZLE_Z);
  nozzle.castShadow = !MOBILE_DEVICE;
  effectGroup.add(nozzle);
  nozzles.push(nozzle);

  const rimMaterial = new THREE.MeshStandardMaterial({ color: JET_COLORS[j], emissive: JET_COLORS[j], emissiveIntensity: .18, roughness: .28, metalness: .35 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.17, .022, MOBILE_DEVICE ? 6 : 8, MOBILE_DEVICE ? 16 : 24), rimMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(JET_X[j], BASE_Y - .082, NOZZLE_Z);
  effectGroup.add(rim);
  jetRims.push(rim);

  const ripple = new THREE.Mesh(
    new THREE.TorusGeometry(.12, .012, MOBILE_DEVICE ? 5 : 7, MOBILE_DEVICE ? 16 : 24),
    new THREE.MeshBasicMaterial({ color: JET_COLORS[j], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  ripple.rotation.x = Math.PI / 2;
  ripple.position.set(JET_X[j], NOZZLE_Y + .025, NOZZLE_Z - .015);
  effectGroup.add(ripple);
  jetRipples.push(ripple);

}

// Burbujas pequeñas y desfasadas sustituyen al cono direccional: hacen visible
// la actividad del chorro sin dibujar una flecha rígida sobre el tablero.
const jetBubbleGeometry = new THREE.SphereGeometry(.022, MOBILE_DEVICE ? 5 : 7, MOBILE_DEVICE ? 5 : 7);
for (let i = 0; i < JET_BUBBLE_COUNT; i++) {
  const bubble = new THREE.Mesh(jetBubbleGeometry, bubbleMaterial);
  bubble.visible = false;
  bubble.userData.jet = i % 3;
  bubble.userData.progress = Math.random();
  bubble.userData.phase = Math.random() * TAU;
  bubble.userData.size = .65 + Math.random() * .75;
  bubbleGroup.add(bubble);
  jetBubbles.push(bubble);
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
  ctx.fillStyle = color; ctx.font = '700 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 33);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.02, .26, 1);
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
  ctx.fillStyle = color; ctx.font = '700 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 33);
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
  const capacity = Math.max(5, Math.floor((def.h - .18) / RING_STACK_STEP));
  const hasRequirement = def.rc !== undefined;
  const reqColor = hasRequirement ? PALETTES[paletteIndex].colors[def.rc].hex : '#b4e6f5';
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: reqColor, emissive: reqColor, emissiveIntensity: hasRequirement ? .52 : .3, roughness: .28, metalness: .08, transparent: true, opacity: .96 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(POLE_SHAFT_TOP_RADIUS, POLE_SHAFT_RADIUS, def.h, MOBILE_DEVICE ? 10 : 18), shaftMaterial);
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
  const reqLabel = hasRequirement ? labelSprite(`0/${def.rn}`, reqColor) : null;
  if (reqLabel) { reqLabel.scale.set(.96, .23, 1); reqLabel.position.set(0, -.24, .13); group.add(reqLabel); }
  poleGroup.add(group);
  return {
    group, shaft, top, beacon, label, reqLabel, x: def.x, baseX: def.x, h: def.h, spd: def.spd || 0, phase: Math.random() * TAU,
    capacity, reqColor: hasRequirement ? def.rc : -1, reqCount: def.rn || 0, rings: [], lastColor: -1, combo: 0, vX: 0, previousX: def.x,
    // Penalización independiente: el temporizador se llena en 3 s y se vacía
    // tres veces más deprisa al soltar ↑/↓. Al vaciarse después de un disparo
    // permite repetir la expulsión en otros 3 s de presión continua.
    tiltPenaltyCharge: 0
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
  ringGroup.add(mesh);
  return {
    mesh, ci, color: info.hex, index, x: 0, y: 0, z: 0, previousX: 0, previousY: 0, previousZ: 0,
    scored: false, pole: null, contactPole: null, capturePole: null, seatPole: null, seatTargetY: 0, escapePole: null, descentAssist: 0, points: 0,
    angle: Math.random() * TAU, spin: (Math.random() - .5) * 1.4,
    pitch: (Math.random() - .5) * .12, roll: (Math.random() - .5) * .12
  };
}

function clearRingPoleCapture(ring) {
  ring.contactPole = null;
  ring.capturePole = null;
  if (ring.scored || !ring.body || ring.body.mass === RING_MASS) return;
  ring.body.mass = RING_MASS;
  ring.body.updateMassProperties();
  ring.body.wakeUp();
}

function beginRingPoleCapture(ring, pole) {
  if (ring.scored || pole.rings.length >= pole.capacity) return;
  ring.contactPole = pole;
  ring.capturePole = pole;
  if (ring.body.mass !== RING_SEATED_MASS) {
    ring.body.mass = RING_SEATED_MASS;
    ring.body.updateMassProperties();
    ring.body.wakeUp();
  }
}

function handleRingPoleContact(ring, event) {
  const poleBody = event.body;
  const pole = poleBody?.userData?.pole;
  const contact = event.contact;
  if (ring.scored || !pole || !contact || pole.rings.length >= pole.capacity) return;
  // Algunas parejas de formas invierten si/sj dentro de Cannon; buscamos la
  // forma del palo por identidad para no confundirla con un segmento del aro.
  const poleShape = poleBody.shapes.includes(contact.si) ? contact.si : contact.sj;
  if (poleShape !== poleBody.shapes[0] && poleShape !== poleBody.shapes[1]) return;
  const topY = BASE_Y + pole.h;
  const radial = Math.hypot(ring.body.position.x - pole.x, ring.body.position.z);
  if (radial > RING_CAPTURE_RADIUS || ring.body.position.y < topY - RING_CAPTURE_VERTICAL - .12 || ring.body.position.y > topY + RING_CAPTURE_VERTICAL + .12) return;
  // Guardamos el contacto físico; la masa solo cambia cuando el centro ha
  // llegado al borde interior del agujero, no al primer roce exterior.
  ring.contactPole = pole;
  if (radial <= RING_INNER_CONTACT_RADIUS && ring.body.velocity.y <= .2) beginRingPoleCapture(ring, pole);
}

function createRingPhysicsBody(ring) {
  const body = new CANNON.Body({ mass: RING_MASS, material: ringPhysicsMaterial });
  body.linearDamping = .10;
  body.angularDamping = .15;
  body.linearFactor.set(1, 1, 0); // 2.5D: Z es grosor de contacto, no un carril de juego.
  body.allowSleep = false;
  // El aro es un compuesto de segmentos que sigue el toro visual. Hay más
  // lados que antes para que el hueco físico no sea una aproximación grosera.
  const segments = MOBILE_DEVICE ? 20 : 28;
  const tangentHalfLength = RING_RADIUS * Math.sin(Math.PI / segments);
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * TAU;
    const offset = new CANNON.Vec3(Math.cos(angle) * RING_RADIUS, 0, Math.sin(angle) * RING_RADIUS);
    const shape = new CANNON.Box(new CANNON.Vec3(RING_COLLISION_TUBE, RING_TUBE, tangentHalfLength));
    const rotation = new CANNON.Quaternion();
    rotation.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    body.addShape(shape, offset, rotation);
  }
  body.position.set(ring.x, ring.y, ring.z);
  ring.previousX = body.position.x; ring.previousY = body.position.y; ring.previousZ = body.position.z;
  body.quaternion.setFromEuler(ring.pitch, ring.angle, ring.roll, 'XYZ');
  body.angularVelocity.set((Math.random() - .5) * .5, ring.spin, (Math.random() - .5) * .5);
  body.userData = { ring };
  body.addEventListener('collide', (event) => handleRingPoleContact(ring, event));
  physicsWorld.addBody(body);
  ring.body = body;
  physicsRingBodies.push(body);
}

function createPolePhysicsBody(pole) {
  const body = new CANNON.Body({ mass: 0, material: tankPhysicsMaterial });
  // Mismo radio y misma resolución que CylinderGeometry del modelo visual.
  const shaft = new CANNON.Cylinder(POLE_SHAFT_TOP_RADIUS, POLE_SHAFT_RADIUS, pole.h, MOBILE_DEVICE ? 10 : 18);
  body.addShape(shaft, new CANNON.Vec3(0, pole.h / 2, 0));
  body.addShape(new CANNON.Sphere(POLE_TIP_RADIUS), new CANNON.Vec3(0, pole.h, 0));
  body.addShape(new CANNON.Cylinder(.38, .48, .18, MOBILE_DEVICE ? 12 : 24), new CANNON.Vec3(0, .09, 0));
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
      // jugador debe elevarlo y corregir X/Y para que cruce la punta del palo.
      const spawnPole = poles[ring.index % poles.length];
      const side = Math.random() < .5 ? -1 : 1;
      ring.x = spawnPole.baseX + side * (.84 + Math.random() * .14);
      ring.y = BASE_Y + .35 + Math.random() * (WATER_TOP - BASE_Y - 1.05);
      ring.z = 0;
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
    const reqText = `${count}/${pole.reqCount}`;
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
  jetRims.forEach((rim) => { rim.scale.x = 1 / visualScaleX; });
  jetRipples.forEach((ripple) => { ripple.scale.x = 1 / visualScaleX; });
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
      bubble.position.z = -PLAY_DEPTH / 2 + Math.random() * PLAY_DEPTH;
    }
    const pulse = .8 + Math.sin(waveTime * 2 + index) * .2;
    bubble.scale.setScalar(pulse);
  });
}

function jetDirection(index) {
  const swing = Math.sin(state.elapsed * 1.8 + index * 2.1) * .48 + Math.sin(state.elapsed * 4.7 + index) * .06 + state.tiltX * .045;
  // El chorro trabaja en el plano X/Y. El grosor Z existe solo para que
  // Cannon pueda resolver contactos entre cuerpos con volumen.
  return new THREE.Vector3(Math.sin(swing), Math.cos(swing), 0).normalize();
}

function updateJetVisuals(dt) {
  for (let j = 0; j < 3; j++) {
    const active = input.jets[j] && !state.paused && !state.gameOver;
    const nozzle = nozzles[j];
    const rim = jetRims[j];
    const ripple = jetRipples[j];
    nozzle.material.emissiveIntensity = active ? .5 + Math.sin(state.elapsed * 22 + j) * .12 : .06;
    rim.material.emissiveIntensity = active ? .75 + Math.sin(state.elapsed * 18 + j) * .18 : .16;
    const pulse = active ? 1.08 + Math.sin(state.elapsed * 20 + j) * .05 : 1;
    nozzle.scale.set(pulse / visualScaleX, pulse, pulse);
    rim.scale.set(pulse / visualScaleX, pulse, pulse);
    const ripplePulse = active ? .82 + (Math.sin(state.elapsed * 7.5 + j * 1.9) + 1) * .16 : .75;
    ripple.scale.set(ripplePulse / visualScaleX, ripplePulse, ripplePulse);
    ripple.material.opacity = lerp(ripple.material.opacity, active ? .28 + Math.sin(state.elapsed * 14 + j) * .06 : 0, Math.min(1, dt * 9));
  }
}

function updateJetBubbles(dt) {
  const activeJets = input.jets.map((jet, index) => jet && !state.paused && !state.gameOver ? index : -1).filter((index) => index >= 0);
  jetBubbles.forEach((bubble) => {
    const jet = bubble.userData.jet;
    if (!activeJets.includes(jet)) {
      bubble.visible = false;
      bubble.userData.progress = Math.random() * .18;
      return;
    }
    bubble.visible = true;
    bubble.userData.progress += dt * (.38 + bubble.userData.size * .16);
    if (bubble.userData.progress > 1.08) bubble.userData.progress = Math.random() * .12;
    const direction = jetDirection(jet);
    const sideX = -direction.y;
    const sideY = direction.x;
    const distance = .08 + bubble.userData.progress * 2.35;
    const drift = Math.sin(waveTime * 5.2 + bubble.userData.phase + bubble.userData.progress * 4) * (.035 + bubble.userData.progress * .065);
    bubble.position.set(
      JET_X[jet] + direction.x * distance + sideX * drift,
      NOZZLE_Y + .08 + direction.y * distance + sideY * drift,
      NOZZLE_Z + Math.cos(waveTime * 4.4 + bubble.userData.phase) * .045
    );
    const pulse = bubble.userData.size * (.72 + Math.sin(waveTime * 6 + bubble.userData.phase) * .18);
    bubble.scale.setScalar(pulse);
  });
}

function updateJetEffects(dt) {
  updateJetBubbles(dt);
  const active = input.jets.map((jet, index) => jet && !state.paused && !state.gameOver ? index : -1).filter((index) => index >= 0);
  if (!active.length) { jSoundTimer = 0; return; }
  jSoundTimer += dt;
  if (jSoundTimer > .11) { sfxJet(); jSoundTimer = 0; }
  active.forEach((index) => spawnJetParticles(index));
}

function spawnJetParticles(index) {
  const direction = jetDirection(index);
  for (let i = 0; i < (MOBILE_DEVICE ? 4 : 7); i++) {
    const spread = (Math.random() - .5) * .34;
    particles.push({
      x: JET_X[index] + spread, y: NOZZLE_Y + .08 + Math.random() * .06, z: NOZZLE_Z + (Math.random() - .5) * .05,
      vx: direction.x * (2.8 + Math.random() * 2.6) + (Math.random() - .5) * 1.05,
      vy: direction.y * (5.2 + Math.random() * 3.2), vz: (Math.random() - .5) * .18,
      life: .52 + Math.random() * .62, maxLife: 1.1, size: .6 + Math.random() * .6, phase: Math.random() * TAU
    });
  }
  if (particles.length > PARTICLE_CAPACITY) particles.splice(0, particles.length - PARTICLE_CAPACITY);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vx += Math.sin(waveTime * 9 + p.phase) * .9 * dt;
    p.vy -= 2.1 * dt;
    p.vy += Math.cos(waveTime * 7 + p.phase) * .28 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
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

function verticalPenaltyPressed() {
  return Boolean(input.keys.ArrowUp || input.keys.ArrowDown);
}

function updateTiltPenalty(dt) {
  const pressed = verticalPenaltyPressed();
  let expelled = 0;
  for (const pole of poles) {
    // Un palo sin aros no puede recibir la penalización; si quedaba carga
    // pendiente, la devuelve rápidamente igual que al soltar el control.
    if (!pressed || pole.rings.length === 0) {
      pole.tiltPenaltyCharge = Math.max(0, pole.tiltPenaltyCharge - dt * TILT_PENALTY_RELEASE_RATE);
      continue;
    }
    pole.tiltPenaltyCharge = Math.min(
      TILT_PENALTY_ACTIVATION_SECONDS,
      pole.tiltPenaltyCharge + dt
    );
    if (pole.tiltPenaltyCharge < TILT_PENALTY_ACTIVATION_SECONDS) continue;

    // Se expulsa el aro superior ya asentado usando exactamente la salida
    // física existente: detachScoredRing libera el cuerpo y launchEscapingRing
    // aplica el impulso Cannon-es, sin recolocar ni teletransportar el aro.
    const ring = pole.rings[pole.rings.length - 1];
    pole.tiltPenaltyCharge = 0;
    if (!ring) continue;
    detachScoredRing(ring, pole, true);
    expelled++;
  }
  if (expelled > 0) {
    sfxRingRelease();
    vibrate(35);
    showToast(expelled === 1 ? 'PENALIZACIÓN · ARO EXPULSADO' : `PENALIZACIÓN · ${expelled} AROS EXPULSADOS`);
  }
}

function updateTiltPenaltyIndicators() {
  const indicators = $('indicators');
  const hFill = $('hFill');
  const vFill = $('vFill');
  const held = !state.paused && !state.gameOver && verticalPenaltyPressed();
  const maxCharge = poles.reduce((highest, pole) => Math.max(highest, pole.tiltPenaltyCharge || 0), 0);
  const progress = clamp(maxCharge / TILT_PENALTY_ACTIVATION_SECONDS, 0, 1);
  const active = held && progress > 0;
  if (!active) {
    indicators.classList.remove('penalty');
    indicators.style.removeProperty('--penalty-alpha');
    hFill.style.removeProperty('opacity');
    vFill.style.removeProperty('opacity');
    return;
  }

  // El pulso se acelera con la carga: el jugador ve la penalización antes de
  // la expulsión y recibe una alarma cada vez más insistente al seguir pulsando.
  const flashRate = 2.4 + progress * 8;
  const pulse = .28 + .72 * ((Math.sin(state.elapsed * TAU * flashRate) + 1) * .5);
  indicators.classList.add('penalty');
  indicators.style.setProperty('--penalty-alpha', pulse.toFixed(3));
  indicators.style.setProperty('--penalty-progress', progress.toFixed(3));
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
const ringLocalNormal = new CANNON.Vec3(0, 1, 0);
const ringWorldNormal = new CANNON.Vec3();
const floorShapeQuaternion = new CANNON.Quaternion();
const floorShapeCenter = new CANNON.Vec3();
const floorShapeAxisX = new CANNON.Vec3();
const floorShapeAxisY = new CANNON.Vec3();
const floorShapeAxisZ = new CANNON.Vec3();
const pairWorldNormal = new CANNON.Vec3();
function submergedFraction(y) {
  return clamp((WATER_TOP - y + RING_TUBE) / (RING_TUBE * 2.2), 0, 1);
}

function updatePhysicsPoleMotion(dt) {
  for (const pole of poles) {
    const previousX = pole.x;
    pole.previousX = previousX;
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
    updatePoleLabel(pole);
  }
  // SAP conserva una lista ordenada; un nivel con palos móviles debe volver a
  // ordenarla antes de buscar contactos para no perder choques al cruzar X.
  physicsWorld.broadphase.dirty = true;
}

function ringLowestPointY(body) {
  let lowest = Infinity;
  for (let index = 0; index < body.shapes.length; index++) {
    const shape = body.shapes[index];
    const halfExtents = shape.halfExtents;
    if (!halfExtents) continue;
    body.quaternion.mult(body.shapeOrientations[index], floorShapeQuaternion);
    body.quaternion.vmult(body.shapeOffsets[index], floorShapeCenter);
    floorShapeAxisX.set(halfExtents.x, 0, 0); floorShapeQuaternion.vmult(floorShapeAxisX, floorShapeAxisX);
    floorShapeAxisY.set(0, halfExtents.y, 0); floorShapeQuaternion.vmult(floorShapeAxisY, floorShapeAxisY);
    floorShapeAxisZ.set(0, 0, halfExtents.z); floorShapeQuaternion.vmult(floorShapeAxisZ, floorShapeAxisZ);
    const extentY = Math.abs(floorShapeAxisX.y) + Math.abs(floorShapeAxisY.y) + Math.abs(floorShapeAxisZ.y);
    lowest = Math.min(lowest, body.position.y + floorShapeCenter.y - extentY);
  }
  return lowest;
}

function applyFloorContactSupport(body) {
  // El contacto Cannon sigue siendo la defensa principal. Esta fuerza física
  // solo entra si la geometría inferior del aro ya ha penetrado el suelo, para
  // recuperar un cuerpo que haya cruzado la superficie durante un paso discreto.
  // Se calcula con el punto inferior real de todos los Box del aro compuesto,
  // no con el centro del cuerpo, porque el aro puede estar girado al caer.
  const lowest = ringLowestPointY(body);
  const predictedLowest = lowest + Math.min(0, body.velocity.y) * physicsFixedStep;
  const penetration = PHYSICS_FLOOR_TOP - Math.min(lowest, predictedLowest);
  if (penetration <= 0) return;

  const downwardSpeed = Math.max(0, -body.velocity.y);
  const supportForce = penetration * FLOOR_SUPPORT_STIFFNESS + downwardSpeed * FLOOR_SUPPORT_DAMPING;
  body.force.y += Math.min(FLOOR_SUPPORT_MAX_FORCE, Math.max(0, supportForce));

  // Si un paso discreto ya dejó el volumen bajo la cara superior, un impulso
  // corto y físico corta la velocidad de entrada. No corrige la posición ni la
  // rotación: el solver y la gravedad siguen resolviendo el contacto.
  if (lowest < PHYSICS_FLOOR_TOP - .002 && downwardSpeed > .08) {
    const recoverySpeed = Math.min(2.4, downwardSpeed * .6 + penetration / physicsFixedStep * .35);
    body.applyImpulse(new CANNON.Vec3(0, recoverySpeed * body.mass, 0), body.position);
  }
}

function applyRingOrientationAssist(ring, body, submerged) {
  // La asistencia se basa en la caída del cuerpo, no en qué chorro está activo.
  // Así el agua puede hacerlo girar libremente y solo la gravedad suaviza la
  // orientación durante el descenso.
  const previousDrop = Math.max(0, (Number.isFinite(ring.previousY) ? ring.previousY : body.position.y) - body.position.y);
  const speedDescent = clamp((-body.velocity.y - .08) / 2.6, 0, 1);
  const stepDescent = clamp(previousDrop / .045, 0, 1);
  const descentTarget = Math.max(speedDescent, stepDescent);
  ring.descentAssist = lerp(ring.descentAssist, descentTarget, .18);
  if (ring.descentAssist < .015) return;
  body.quaternion.vmult(ringLocalNormal, ringWorldNormal);
  const captureBoost = ring.capturePole ? 1.3 : 1;
  const strength = RING_ORIENTATION_ASSIST * (.25 + ring.descentAssist * .75) * captureBoost * (.55 + submerged * .45);
  // n × up: torque that makes the annulus horizontal without freezing its
  // yaw, spin or collision response.
  body.torque.x += -ringWorldNormal.z * strength;
  body.torque.z += ringWorldNormal.x * strength;
  body.torque.x += -body.angularVelocity.x * (.24 + strength * .22);
  body.torque.z += -body.angularVelocity.z * (.24 + strength * .22);
}

function applyRingSeatLevelingAssist(ring, body) {
  if (!ring.scored || !ring.seatPole) return;
  body.quaternion.vmult(ringLocalNormal, ringWorldNormal);
  const tilt = Math.acos(clamp(ringWorldNormal.y, -1, 1));
  const softStart = RING_SEAT_MAX_TILT * .55;
  if (tilt <= softStart) return;
  const excessTilt = tilt - softStart;
  const strength = Math.min(12, excessTilt * RING_SEAT_LEVELING_STIFFNESS);
  // Ayuda física hacia la horizontal solo cuando se acerca al límite de 30°.
  // El yaw y el giro sobre el propio eje quedan libres.
  body.torque.x += -ringWorldNormal.z * strength - body.angularVelocity.x * RING_SEAT_LEVELING_DAMPING;
  body.torque.z += ringWorldNormal.x * strength - body.angularVelocity.z * RING_SEAT_LEVELING_DAMPING;
}

function updateRingCapture(ring, body) {
  if (ring.scored) return;
  const contactPole = ring.contactPole;
  if (contactPole && !ring.capturePole) {
    const topY = BASE_Y + contactPole.h;
    const radial = Math.hypot(body.position.x - contactPole.x, body.position.z);
    const outsideContact = contactPole.rings.length >= contactPole.capacity
      || body.position.y < topY - RING_CAPTURE_VERTICAL - .12
      || body.position.y > topY + RING_CAPTURE_VERTICAL + .12
      || radial > RING_CAPTURE_RADIUS + .16;
    if (outsideContact) {
      clearRingPoleCapture(ring);
      return;
    }
    if (radial <= RING_INNER_CONTACT_RADIUS && body.position.y <= topY + RING_CAPTURE_VERTICAL && body.velocity.y <= .2) {
      beginRingPoleCapture(ring, contactPole);
    }
  }
  const pole = ring.capturePole;
  if (!pole) return;
  const topY = BASE_Y + pole.h;
  const radial = Math.hypot(body.position.x - pole.x, body.position.z);
  if (pole.rings.length >= pole.capacity || body.position.y < topY - RING_CAPTURE_VERTICAL - .12 || body.position.y > topY + RING_CAPTURE_VERTICAL + .12 || radial > RING_INNER_CONTACT_RADIUS + .16) {
    clearRingPoleCapture(ring);
    return;
  }
  // La guía solo actúa mientras el aro desciende; no lo ancla ni lo acompaña
  // como un carril si un chorro consigue levantarlo.
  if (body.velocity.y > .2) return;
  const centering = 1 - clamp(radial / (RING_INNER_CONTACT_RADIUS + .001), 0, 1);
  const stiffness = 1.1 + centering * 2.8;
  body.force.x += (pole.x - body.position.x) * stiffness - (body.velocity.x - pole.vX) * (.65 + centering * .55);
}

function applyRingSeatForce(ring, body) {
  const pole = ring.seatPole;
  if (!ring.scored || !pole) return false;
  const targetY = ring.seatTargetY;
  // Una guía horizontal más firme evita que un aro ya puntuado quede
  // enganchado por el borde mientras sigue cayendo, sin fijar su posición.
  body.force.x += (pole.x - body.position.x) * RING_SEAT_HORIZONTAL_STIFFNESS - (body.velocity.x - pole.vX) * RING_SEAT_HORIZONTAL_DAMPING;
  body.force.y += (targetY - body.position.y) * RING_SEAT_STIFFNESS - body.velocity.y * RING_SEAT_DAMPING;
  return true;
}

function ringSeatIsStable(ring) {
  if (!ring.scored || !ring.seatPole || !ring.body) return false;
  ring.body.quaternion.vmult(ringLocalNormal, pairWorldNormal);
  return Math.abs(ring.body.position.x - ring.seatPole.x) < .18
    && Math.abs(ring.body.position.y - ring.seatTargetY) < .28
    && pairWorldNormal.y > Math.cos(RING_SEAT_MAX_TILT);
}

function applyRingPairSeparation() {
  for (let firstIndex = 0; firstIndex < rings.length; firstIndex++) {
    const first = rings[firstIndex];
    if (!first.body) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < rings.length; secondIndex++) {
      const second = rings[secondIndex];
      if (!second.body) continue;
      const sameSeatPole = first.scored && second.scored && first.seatPole === second.seatPole;
      const firstSettled = sameSeatPole && ringSeatIsStable(first);
      const secondSettled = sameSeatPole && ringSeatIsStable(second);
      if (firstSettled && secondSettled) continue;
      const dx = second.body.position.x - first.body.position.x;
      const dy = second.body.position.y - first.body.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= RING_PAIR_MIN_DISTANCE) continue;
      const safeDistance = Math.max(distance, .001);
      const nx = distance > .001 ? dx / safeDistance : (firstIndex % 2 ? -1 : 1);
      const ny = distance > .001 ? dy / safeDistance : 0;
      const relativeVelocity = (second.body.velocity.x - first.body.velocity.x) * nx + (second.body.velocity.y - first.body.velocity.y) * ny;
      const separationForce = Math.max(0, (RING_PAIR_MIN_DISTANCE - distance) * RING_PAIR_SEPARATION_STIFFNESS - relativeVelocity * RING_PAIR_SEPARATION_DAMPING);
      first.body.force.x -= nx * separationForce;
      first.body.force.y -= ny * separationForce;
      second.body.force.x += nx * separationForce;
      second.body.force.y += ny * separationForce;
    }
  }
}

function applyCannonForces(dt) {
  const elapsed = state.elapsed;
  applyRingPairSeparation();
  for (const ring of rings) {
    const body = ring.body;
    if (!body) continue;
    const submerged = submergedFraction(body.position.y);
    applyRingSeatForce(ring, body);
    applyFloorContactSupport(body);
    body.force.y += submerged * RING_BUOYANCY_FORCE;
    applyRingOrientationAssist(ring, body, submerged);
    applyRingSeatLevelingAssist(ring, body);
    updateRingCapture(ring, body);
    const currentX = Math.sin(elapsed * .9 + body.position.y * .8) * .22 + Math.cos(elapsed * .55 + body.position.x * .35) * .1;
    const controlMass = ring.scored ? body.mass : RING_MASS;
    body.force.x += (currentX - body.velocity.x) * RING_MASS * .42 * submerged;
    body.force.x += state.tiltX * controlMass * 3.4;
    // El control vertical sigue siendo el centro de la jugabilidad: ↑ / ↓ y
    // beta del giroscopio también pueden levantar un aro ensartado. Z no es
    // un control: solo conserva el grosor volumétrico de los contactos 3D.
    const verticalControlAcceleration = ring.scored ? RING_SEATED_CONTROL_ACCELERATION : 4.4;
    body.force.y += -state.tiltY * controlMass * verticalControlAcceleration;
    body.torque.x += -body.angularVelocity.x * (1.1 + submerged * 1.8);
    body.torque.z += -body.angularVelocity.z * (1.1 + submerged * 1.8);

    for (let j = 0; j < 3; j++) {
      if (!input.jets[j]) continue;
      const direction = jetDirection(j);
      const dx = body.position.x - JET_X[j];
      const dz = body.position.z;
      const radial = Math.hypot(dx, dz);
      const widthFalloff = clamp(1 - radial / JET_FIELD_RADIUS, 0, 1);
      const dy = Math.max(0, body.position.y - NOZZLE_Y);
      if (widthFalloff <= 0 || body.position.y < NOZZLE_Y - .2) continue;
      const heightFalloff = clamp(1 - dy / 5.45, .2, 1);
      const falloff = Math.pow(widthFalloff * heightFalloff, .72);
      const turbulenceX = Math.sin(elapsed * 8.2 + body.position.y * 2.3 + j * 1.7) * 1.35
        + Math.cos(elapsed * 5.4 + body.position.x * 2.8 - j) * .75;
      const turbulenceY = Math.sin(elapsed * 6.7 + body.position.x * 1.9 + j * 2.2) * .7;
      cannonForce.set(
        (direction.x * JET_FORCE_X + turbulenceX) * falloff,
        (direction.y * JET_FORCE_Y + turbulenceY) * falloff,
        0
      );
      // Cannon recibe el punto en coordenadas de mundo: el chorro empuja la
      // zona inferior del aro, no un punto calculado como si fuese local.
      cannonPoint.set(body.position.x, body.position.y - .24, 0);
      body.applyForce(cannonForce, cannonPoint);
    }
  }
}

function rebuildPoleCombo(pole) {
  const last = pole.rings[pole.rings.length - 1];
  pole.lastColor = last ? last.ci : -1;
  pole.combo = 0;
  if (!last) return;
  for (let index = pole.rings.length - 1; index >= 0 && pole.rings[index].ci === last.ci; index--) pole.combo++;
}

function launchEscapingRing(ring, pole) {
  const body = ring.body;
  const escapeSide = Math.sign(body.position.x - pole.x) || (Math.random() < .5 ? -1 : 1);
  body.force.set(0, 0, 0);
  body.torque.set(0, 0, 0);
  // Un aro penalizado puede estar asentado muy abajo del palo. El impulso
  // vertical se calcula para darle altura suficiente para superar la punta,
  // pero sigue siendo un lanzamiento Cannon-es: no se corrige su posición ni
  // se fija la trayectoria. Los aros que ya salen por la punta reciben como
  // mínimo el impulso de escape original.
  const distanceToTip = Math.max(0, BASE_Y + pole.h - body.position.y);
  const launchClearance = clamp(distanceToTip + .35, .35, 3.65);
  const launchVelocity = Math.sqrt(2 * Math.abs(GRAVITY) * launchClearance) + .35;
  const upwardImpulse = clamp(launchVelocity * body.mass, .82, 6);
  body.applyImpulse(new CANNON.Vec3(
    escapeSide * (1.2 + Math.random() * .25) + pole.vX * .1,
    upwardImpulse,
    0
  ), body.position);
  body.angularVelocity.x += (Math.random() - .5) * 2.2;
  body.angularVelocity.y += (Math.random() - .5) * 2.8;
  body.angularVelocity.z += (Math.random() - .5) * 2.2;
  body.wakeUp();
}

function reflowPoleSeats(pole) {
  pole.rings.forEach((ring, index) => {
    ring.seatTargetY = BASE_Y + .24 + index * RING_STACK_STEP;
  });
}

function guideScoredRingIntoPole(ring, pole) {
  const body = ring.body;
  const xError = clamp(pole.x - body.position.x, -.16, .16);
  const relativeXVelocity = body.velocity.x - pole.vX;
  // Pequeño impulso físico de entrada: corrige el roce justo al puntuar,
  // pero no teletransporta ni congela el cuerpo.
  body.applyImpulse(new CANNON.Vec3(
    clamp(xError * 1.35 - relativeXVelocity * .12, -.28, .28),
    0,
    0
  ), body.position);
  body.wakeUp();
}

function registerPhysicsScore(ring, pole) {
  const stackIndex = pole.rings.length;
  ring.scored = true; ring.pole = pole; ring.contactPole = null; ring.capturePole = null;
  ring.seatPole = pole;
  ring.seatTargetY = BASE_Y + .24 + stackIndex * RING_STACK_STEP;
  ring.body.mass = RING_SEATED_MASS;
  ring.body.updateMassProperties();
  guideScoredRingIntoPole(ring, pole);
  pole.rings.push(ring);
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

function detachScoredRing(ring, pole, launch = false) {
  const index = pole.rings.indexOf(ring);
  if (index >= 0) pole.rings.splice(index, 1);
  reflowPoleSeats(pole);
  state.score = Math.max(0, state.score - (ring.points || 100));
  ring.body.mass = RING_MASS;
  ring.body.updateMassProperties();
  ring.scored = false; ring.pole = null; ring.contactPole = null; ring.capturePole = null; ring.seatPole = null; ring.seatTargetY = 0; ring.escapePole = launch ? pole : null; ring.points = 0;
  rebuildPoleCombo(pole);
  if (state.winQueued) { state.winQueued = false; window.clearTimeout(state.winTimer); state.winTimer = 0; }
  if (launch) launchEscapingRing(ring, pole);
  updateUI(true); updatePoleLabel(pole);
}

function releaseRingOverTip(ring) {
  if (!ring || !ring.scored || !ring.pole) return;
  detachScoredRing(ring, ring.pole, true);
  sfxRingRelease();
  vibrate(35);
}

function ringCrossedPoleTip(ring, pole, thresholdY, allowedRadius = RING_ENTRY_RADIUS) {
  const body = ring.body;
  const previousY = Number.isFinite(ring.previousY) ? ring.previousY : body.position.y;
  const drop = previousY - body.position.y;
  // Se comprueba el cruce del plano central de la punta, no una posición
  // recolocada después. La ayuda de captura no amplía el radio del agujero.
  if (body.position.y >= thresholdY || previousY < thresholdY || drop <= .0001) return false;
  const crossingT = clamp((previousY - thresholdY) / drop, 0, 1);
  const previousPoleX = Number.isFinite(pole.previousX) ? pole.previousX : pole.x;
  const crossingX = lerp(ring.previousX, body.position.x, crossingT);
  const crossingZ = lerp(ring.previousZ, body.position.z, crossingT);
  const crossingPoleX = lerp(previousPoleX, pole.x, crossingT);
  return Math.hypot(crossingX - crossingPoleX, crossingZ) <= allowedRadius;
}

function ringCrossedPoleTipUpward(ring, pole, thresholdY, allowedRadius = RING_CAPTURE_RADIUS) {
  const body = ring.body;
  const previousY = Number.isFinite(ring.previousY) ? ring.previousY : body.position.y;
  const rise = body.position.y - previousY;
  if (body.position.y <= thresholdY || previousY > thresholdY || rise <= .0001) return false;
  const crossingT = clamp((thresholdY - previousY) / rise, 0, 1);
  const previousPoleX = Number.isFinite(pole.previousX) ? pole.previousX : pole.x;
  const crossingX = lerp(ring.previousX, body.position.x, crossingT);
  const crossingZ = lerp(ring.previousZ, body.position.z, crossingT);
  const crossingPoleX = lerp(previousPoleX, pole.x, crossingT);
  return Math.hypot(crossingX - crossingPoleX, crossingZ) <= allowedRadius;
}

function updateEscapingRingState(ring) {
  const pole = ring.escapePole;
  if (!pole) return false;
  const radial = Math.hypot(ring.body.position.x - pole.x, ring.body.position.z);
  if (ring.body.position.y > BASE_Y + pole.h + RING_CAPTURE_VERTICAL || radial > RING_CAPTURE_RADIUS + .16) {
    ring.escapePole = null;
    return false;
  }
  return true;
}

function checkSeatedRingExits() {
  for (const ring of rings) {
    if (!ring.scored || !ring.seatPole || !ring.body) continue;
    const pole = ring.seatPole;
    if (ringCrossedPoleTipUpward(ring, pole, BASE_Y + pole.h, RING_CAPTURE_RADIUS)) releaseRingOverTip(ring);
  }
}

function checkPhysicsPoleEntries() {
  for (const ring of rings) {
    const body = ring.body;
    if (!body || ring.scored || updateEscapingRingState(ring)) continue;
    for (const pole of poles) {
      if (pole.rings.length >= pole.capacity) continue;
      // La captura ayuda a centrar, pero solo admite la tolerancia estrecha
      // del contacto interior; nunca la ventana exterior de un simple roce.
      const allowedRadius = ring.capturePole === pole ? RING_INNER_CONTACT_RADIUS : RING_ENTRY_RADIUS;
      if (!ringCrossedPoleTip(ring, pole, BASE_Y + pole.h, allowedRadius)) continue;
      registerPhysicsScore(ring, pole);
      break;
    }
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
    applyCannonForces(physicsFixedStep);
    for (const ring of rings) {
      if (!ring.body) continue;
      ring.previousX = ring.body.position.x;
      ring.previousY = ring.body.position.y;
      ring.previousZ = ring.body.position.z;
    }
    physicsWorld.step(physicsFixedStep);
    checkSeatedRingExits();
    checkPhysicsPoleEntries();
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
    updateTiltPenaltyIndicators();
    updateWater(dt);
    updateJetVisuals(dt);
    updateParticles(dt);
    syncPhysicsToScene();
    return;
  }
  state.elapsed += dt;
  $('tV').textContent = formatTime(state.elapsed);
  updateTilt(dt);
  updateTiltPenalty(dt);
  updateTiltPenaltyIndicators();
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
  let held = false;
  const start = (event) => {
    event.preventDefault();
    if (held) return;
    held = true;
    button.setPointerCapture?.(event.pointerId);
    on();
  };
  const end = (event) => {
    event.preventDefault();
    if (!held) return;
    held = false;
    off();
  };
  // No se libera en pointerleave: con pointer capture algunos navegadores
  // emiten ese evento aunque el dedo siga manteniendo el botón pulsado.
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', end);
  button.addEventListener('pointercancel', end);
  button.addEventListener('lostpointercapture', end);
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
    card.innerHTML = `<div class="palette-name">${palette.name}<br><span class="palette-desc">${palette.desc}</span></div><div class="palette-dots">${palette.colors.map((color) => `<span class="palette-dot" style="background:${color.hex}" aria-label="${color.name}"></span>`).join('')}</div>`;
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
let musicMode = 'menu';
let musicFilter = null;
let musicOutput = null;
let musicDelay = null;
let musicDelayGain = null;
const UNDERWATER_SCALE = [0, 2, 3, 5, 7, 10, 12];
const UNDERWATER_ROOTS = [110, 116.54, 103.83, 123.47, 107.83];
const UNDERWATER_MOTIFS = [
  [0, 2, 4, 3, 1, 2, 5, 3, 0, 2, 3, 4],
  [0, 1, 3, 5, 3, 2, 4, 1, 0, 2, 5, 3],
  [2, 4, 5, 3, 1, 0, 2, 4, 3, 5, 2, 1],
  [0, 3, 2, 5, 4, 2, 1, 3, 0, 2, 4, 5],
  [1, 2, 4, 5, 3, 1, 0, 2, 3, 5, 4, 2]
];
function ensureAudio() { if (!AudioContextClass) return; if (!audioContext) audioContext = new AudioContextClass(); if (audioContext.state === 'suspended') audioContext.resume(); }
function ensureMusicBus() {
  if (!audioContext || musicFilter) return;
  musicFilter = audioContext.createBiquadFilter();
  musicFilter.type = 'lowpass';
  musicFilter.frequency.value = 1650;
  musicFilter.Q.value = .42;
  musicOutput = audioContext.createGain(); musicOutput.gain.value = .42;
  musicDelay = audioContext.createDelay(.32); musicDelay.delayTime.value = .12;
  musicDelayGain = audioContext.createGain(); musicDelayGain.gain.value = .16;
  musicFilter.connect(musicOutput); musicOutput.connect(audioContext.destination);
  musicFilter.connect(musicDelay); musicDelay.connect(musicDelayGain); musicDelayGain.connect(audioContext.destination);
}
function tone(frequency, duration, volume = .08, type = 'sine') { if (!soundOn || !audioContext) return; const oscillator = audioContext.createOscillator(); const gain = audioContext.createGain(); oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration); }
function underwaterTone(frequency, duration, volume = .03, type = 'sine', detune = 0) {
  if (!soundOn || !audioContext) return;
  ensureMusicBus();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const lfo = audioContext.createOscillator();
  const lfoGain = audioContext.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now); oscillator.detune.value = detune;
  lfo.frequency.value = .22 + Math.random() * .12; lfoGain.gain.value = 2.5; lfo.connect(lfoGain); lfoGain.connect(oscillator.detune);
  gain.gain.setValueAtTime(.0001, now); gain.gain.linearRampToValueAtTime(volume, now + .06); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(gain); gain.connect(musicFilter);
  oscillator.start(now); lfo.start(now); oscillator.stop(now + duration + .04); lfo.stop(now + duration + .04);
}
function sfxJet() { tone(160 + Math.random() * 35, .06, .025, 'triangle'); }
function sfxScore(combo = 1) { tone(420 + combo * 80, .16, .06, 'triangle'); if (combo > 1) window.setTimeout(() => tone(660 + combo * 70, .18, .05, 'sine'), 70); }
function sfxRingRelease() { tone(130, .22, .07, 'sawtooth'); window.setTimeout(() => tone(94, .28, .05, 'sawtooth'), 100); }
function sfxWin() { [523, 659, 784, 1047].forEach((frequency, index) => window.setTimeout(() => tone(frequency, .45, .08, 'triangle'), index * 130)); }
function musicMenu() { if (musicOn) { musicMode = 'menu'; scheduleMusic(0); } }
function musicGame() { if (musicOn) { musicMode = 'game'; scheduleMusic(0); } }
function musicWin() { if (musicOn) { musicMode = 'win'; scheduleMusic(0); } }
function scheduleMusic(index = 0) {
  window.clearTimeout(musicTimer);
  if (!musicOn || !audioContext) return;
  ensureMusicBus();
  const variant = musicMode === 'game' ? (currentLevel - 1) % UNDERWATER_MOTIFS.length : 0;
  const motif = musicMode === 'win' ? [0, 2, 4, 6, 5, 6, 4, 2] : musicMode === 'menu' ? [0, 2, 3, 5, 3, 2, 0, 1] : UNDERWATER_MOTIFS[variant];
  const root = musicMode === 'menu' ? 146.83 : musicMode === 'win' ? 261.63 : UNDERWATER_ROOTS[variant] * (currentLevel > 5 ? 1.0293 : 1);
  const step = musicMode === 'win' ? .3 : musicMode === 'menu' ? .72 : .62;
  const scaleIndex = motif[index % motif.length];
  const octave = musicMode === 'game' && index % 12 > 8 ? 1 : 0;
  const note = root * Math.pow(2, (UNDERWATER_SCALE[scaleIndex] + octave * 12) / 12);
  underwaterTone(note, step * 1.15, musicMode === 'win' ? .034 : .027, 'sine', Math.sin(index * .8) * 4);
  if (musicMode === 'game' && index % 3 === 0) underwaterTone(root * .5, step * 1.55, .012, 'triangle', -3);
  if (musicMode === 'game' && index % 4 === 2) underwaterTone(root * 1.498, step * 1.1, .009, 'sine', 5);
  if (musicMode === 'win' && index === 0) underwaterTone(root * .5, 1.8, .016, 'triangle');
  if (musicFilter) musicFilter.frequency.setTargetAtTime(musicMode === 'game' ? 1450 + variant * 125 : 1750, audioContext.currentTime, .25);
  musicTimer = window.setTimeout(() => scheduleMusic(index + 1), step * 1000);
}
$('bSnd').addEventListener('click', () => { ensureAudio(); soundOn = !soundOn; storage.set('wrt_snd', soundOn ? '1' : '0'); $('bSnd').textContent = soundOn ? '🔊' : '🔇'; });
$('bMus').addEventListener('click', () => { ensureAudio(); musicOn = !musicOn; storage.set('wrt_mus', musicOn ? '1' : '0'); $('bMus').textContent = musicOn ? '♫' : '♪'; if (musicOn) musicMenu(); else { window.clearTimeout(musicTimer); musicMode = 'off'; } });
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
  const fieldHeight = 7.4;
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

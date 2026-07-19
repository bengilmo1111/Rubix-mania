import * as THREE from 'three';
import './style.css';

type Axis = 'x' | 'y' | 'z';
type CubeMove = { axis: Axis; layer: number; quarterTurns: -1 | 1 };
type Vec3Int = { x: number; y: number; z: number };

type Cubelet = {
  id: string;
  home: Vec3Int;
  coord: Vec3Int;
  group: THREE.Group;
  highlight: THREE.Mesh;
};

type TurnCandidate = {
  axis: Axis;
  layer: number;
  unitX: number;
  unitY: number;
};

type TurnGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  hitNormalWorld: THREE.Vector3;
  hitCubelet: Cubelet;
  anchorPointWorld: THREE.Vector3;
  candidates: TurnCandidate[];
  locked: boolean;
  axis: Axis | null;
  layer: number;
  sign: -1 | 1;
  angle: number;
  selected: Cubelet[];
  dragUnitX: number;
  dragUnitY: number;
};

type ActivePointer = { x: number; y: number; startedOnCube: boolean };

type OrbitGesture = {
  lastCenterX: number;
  lastCenterY: number;
  lastDistance: number | null;
};

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const moveCountEl = document.querySelector<HTMLElement>('#move-count')!;
const hintCard = document.querySelector<HTMLElement>('#hint-card')!;
const statusPill = document.querySelector<HTMLElement>('#status-pill')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const scrambleBtn = document.querySelector<HTMLButtonElement>('#scramble-btn')!;
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!;
const viewBtn = document.querySelector<HTMLButtonElement>('#view-btn')!;
const menuBtn = document.querySelector<HTMLButtonElement>('#menu-btn')!;
const gameMenu = document.querySelector<HTMLElement>('#game-menu')!;
const confirmDialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
const confirmTitle = document.querySelector<HTMLElement>('#confirm-title')!;
const confirmCopy = document.querySelector<HTMLElement>('#confirm-copy')!;
const confirmAction = document.querySelector<HTMLButtonElement>('#confirm-action')!;
const levelBtn = document.querySelector<HTMLButtonElement>('#level-btn')!;
const levelSelect = document.querySelector<HTMLElement>('#level-select')!;
const levelButtons = [...document.querySelectorAll<HTMLButtonElement>('.level-option')];

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x07091c, 0.035);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const cubeRoot = new THREE.Group();
scene.add(cubeRoot);

const turnPivot = new THREE.Group();
cubeRoot.add(turnPivot);

scene.add(new THREE.HemisphereLight(0xa8b7ff, 0x160e32, 2.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 4.3);
keyLight.position.set(4, 7, 6);
keyLight.castShadow = true;
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x7766ff, 24, 18);
rimLight.position.set(-5, 2, -4);
scene.add(rimLight);

const glow = new THREE.Mesh(
  new THREE.CircleGeometry(2.7, 64),
  new THREE.MeshBasicMaterial({ color: 0x6954ff, transparent: true, opacity: 0.085, depthWrite: false })
);
glow.position.set(0, -2.15, 0);
glow.rotation.x = -Math.PI / 2;
scene.add(glow);

const starGeometry = new THREE.BufferGeometry();
const starCount = 1500;
const starPositions = new Float32Array(starCount * 3);
const starSeeds = new Float32Array(starCount);
for (let i = 0; i < starCount; i++) {
  const radius = THREE.MathUtils.randFloat(11, 38);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.cos(phi);
  starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  starSeeds[i] = Math.random();
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xdce4ff,
    size: 0.09,
    transparent: true,
    opacity: 0.98,
    sizeAttenuation: true,
    depthWrite: false
  })
);
scene.add(stars);

const brightStarGeometry = new THREE.BufferGeometry();
const brightStarCount = 120;
const brightStarPositions = new Float32Array(brightStarCount * 3);
for (let i = 0; i < brightStarCount; i++) {
  const radius = THREE.MathUtils.randFloat(12, 32);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  brightStarPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  brightStarPositions[i * 3 + 1] = radius * Math.cos(phi);
  brightStarPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}
brightStarGeometry.setAttribute('position', new THREE.BufferAttribute(brightStarPositions, 3));
const brightStars = new THREE.Points(
  brightStarGeometry,
  new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.18,
    transparent: true,
    opacity: 0.96,
    sizeAttenuation: true,
    depthWrite: false
  })
);
scene.add(brightStars);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let size = 3;
const spacing = 1.08;
let half = (size - 1) / 2;
const cubelets: Cubelet[] = [];
const moveHistory: CubeMove[] = [];
let moveCount = 0;
let turnGesture: TurnGesture | null = null;
let orbitGesture: OrbitGesture | null = null;
const activePointers = new Map<number, ActivePointer>();
let viewMode = false;
let animating = false;
let levelSelectOpen = false;
let statusTimeout = 0;
let pendingDangerAction: 'scramble' | 'reset' | null = null;

let cameraYaw = Math.PI / 4;
let cameraPitch = 0.42;
let cameraDistance = 7.3;
let minCameraDistance = 5.4;
let maxCameraDistance = 10.5;

const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x111522,
  roughness: 0.28,
  metalness: 0.14
});
const edgeMaterial = new THREE.MeshStandardMaterial({
  color: 0x252b3e,
  roughness: 0.45,
  metalness: 0.08
});

const stickerMaterials: Record<string, THREE.MeshStandardMaterial> = {
  px: new THREE.MeshStandardMaterial({ color: 0xf25f5c, roughness: 0.24 }),
  nx: new THREE.MeshStandardMaterial({ color: 0xff9f1c, roughness: 0.24 }),
  py: new THREE.MeshStandardMaterial({ color: 0xffe66d, roughness: 0.24 }),
  ny: new THREE.MeshStandardMaterial({ color: 0xf7f7ff, roughness: 0.24 }),
  pz: new THREE.MeshStandardMaterial({ color: 0x43d17d, roughness: 0.24 }),
  nz: new THREE.MeshStandardMaterial({ color: 0x5968ff, roughness: 0.24 })
};

const roundedBox = new THREE.BoxGeometry(0.98, 0.98, 0.98, 3, 3, 3);
roundedBox.computeVertexNormals();
const stickerGeometry = new THREE.BoxGeometry(0.76, 0.76, 0.055, 2, 2, 1);

// Additive glow overlay used to highlight the layer a gesture will turn.
const highlightGeometry = new THREE.BoxGeometry(1.07, 1.07, 1.07);
const highlightMaterial = new THREE.MeshBasicMaterial({
  color: 0x8fc8ff,
  transparent: true,
  opacity: 0.5,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

function createSticker(material: THREE.Material, normal: THREE.Vector3): THREE.Mesh {
  const sticker = new THREE.Mesh(stickerGeometry, material);
  sticker.position.copy(normal).multiplyScalar(0.515);
  sticker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  sticker.castShadow = false;
  sticker.receiveShadow = false;
  sticker.userData.isSticker = true;
  return sticker;
}

function makeCubelet(x: number, y: number, z: number): Cubelet {
  const group = new THREE.Group();
  const body = new THREE.Mesh(roundedBox, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isBody = true;
  group.add(body);

  const bevelShell = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.985, 0.985, 0.985)),
    new THREE.LineBasicMaterial({ color: edgeMaterial.color, transparent: true, opacity: 0.5 })
  );
  // Decorative wireframe only — never hit-test it. Three.js raycasts lines with
  // a loose screen-space threshold, so leaving it interactive makes every grab
  // resolve to whichever cubelet's edges are nearest the ray (always the far
  // corner), selecting the wrong layer.
  bevelShell.raycast = () => {};
  group.add(bevelShell);

  if (x === size - 1) group.add(createSticker(stickerMaterials.px, new THREE.Vector3(1, 0, 0)));
  if (x === 0) group.add(createSticker(stickerMaterials.nx, new THREE.Vector3(-1, 0, 0)));
  if (y === size - 1) group.add(createSticker(stickerMaterials.py, new THREE.Vector3(0, 1, 0)));
  if (y === 0) group.add(createSticker(stickerMaterials.ny, new THREE.Vector3(0, -1, 0)));
  if (z === size - 1) group.add(createSticker(stickerMaterials.pz, new THREE.Vector3(0, 0, 1)));
  if (z === 0) group.add(createSticker(stickerMaterials.nz, new THREE.Vector3(0, 0, -1)));

  const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
  highlight.visible = false;
  highlight.castShadow = false;
  highlight.receiveShadow = false;
  highlight.raycast = () => {};
  group.add(highlight);

  const cubelet: Cubelet = {
    id: `${x}-${y}-${z}`,
    home: { x, y, z },
    coord: { x, y, z },
    group,
    highlight
  };

  group.userData.cubelet = cubelet;
  group.traverse((child) => { child.userData.cubelet = cubelet; });
  setCubeletTransform(cubelet);
  cubeRoot.add(group);
  return cubelet;
}

function setCubeletTransform(cubelet: Cubelet) {
  cubelet.group.position.set(
    (cubelet.coord.x - half) * spacing,
    (cubelet.coord.y - half) * spacing,
    (cubelet.coord.z - half) * spacing
  );
}
const shadowPlane = new THREE.Mesh(
  new THREE.CircleGeometry(2.25, 64),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -2.12;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

// Distance from the cube centre to the outer face of an edge cubelet.
function cubeExtent(): number {
  return (size - 1) / 2 * spacing + 0.5;
}

// Reframe the camera, floor shadow and glow so every cube size fills a
// similar fraction of the screen and rests on the same visual ground plane.
function frameCubeForSize() {
  const extent = cubeExtent();
  cameraDistance = extent / 0.145;
  minCameraDistance = cameraDistance * 0.72;
  maxCameraDistance = cameraDistance * 1.65;
  const bottom = -extent;
  const groundScale = extent / cubeExtentFor(2);
  shadowPlane.position.y = bottom - 0.05;
  shadowPlane.scale.setScalar(groundScale);
  glow.position.y = bottom - 0.1;
  glow.scale.setScalar(groundScale);
}

function cubeExtentFor(n: number): number {
  return (n - 1) / 2 * spacing + 0.5;
}

function buildCube(nextSize: number) {
  cubelets.forEach(c => cubeRoot.remove(c.group));
  cubelets.length = 0;
  size = nextSize;
  half = (size - 1) / 2;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) cubelets.push(makeCubelet(x, y, z));
    }
  }
  moveHistory.length = 0;
  moveCount = 0;
  moveCountEl.textContent = '0';
  frameCubeForSize();
  updateCamera();
  updateButtons();
}

function updateCamera() {
  camera.position.set(
    Math.sin(cameraYaw) * Math.cos(cameraPitch) * cameraDistance,
    Math.sin(cameraPitch) * cameraDistance,
    Math.cos(cameraYaw) * Math.cos(cameraPitch) * cameraDistance
  );
  camera.lookAt(0, 0, 0);
}

function setPointerFromEvent(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function firstCubeHit(event: PointerEvent): THREE.Intersection | null {
  setPointerFromEvent(event);
  const hits = raycaster.intersectObjects(cubelets.map(c => c.group), true);
  return hits.find(hit => (hit.object as THREE.Mesh).isMesh && hit.object.userData.cubelet) ?? null;
}

function worldNormalForHit(hit: THREE.Intersection): THREE.Vector3 {
  const normal = hit.face?.normal.clone() ?? new THREE.Vector3(0, 0, 1);
  return normal.transformDirection(hit.object.matrixWorld).round();
}

function axisVector(axis: Axis): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(1, 0, 0);
  if (axis === 'y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function coordForAxis(coord: Vec3Int, axis: Axis): number {
  return coord[axis];
}

function projectWorldPoint(point: THREE.Vector3): THREE.Vector2 {
  const projected = point.clone().project(camera);
  return new THREE.Vector2(
    (projected.x * 0.5 + 0.5) * canvas.clientWidth,
    (-projected.y * 0.5 + 0.5) * canvas.clientHeight
  );
}

function getTurnCandidates(normal: THREE.Vector3, anchorPointWorld: THREE.Vector3, cubelet: Cubelet): TurnCandidate[] {
  const anchorLocal = cubeRoot.worldToLocal(anchorPointWorld.clone());
  const startScreen = projectWorldPoint(anchorPointWorld);
  const candidates: TurnCandidate[] = [];

  for (const axis of ['x', 'y', 'z'] as Axis[]) {
    const axisVec = axisVector(axis);
    if (Math.abs(axisVec.dot(normal)) > 0.5) continue;

    const movedLocal = anchorLocal.clone().applyAxisAngle(axisVec, 0.18);
    const movedWorld = cubeRoot.localToWorld(movedLocal);
    const movedScreen = projectWorldPoint(movedWorld);
    const direction = movedScreen.sub(startScreen);
    const length = direction.length();
    if (length < 0.5) continue;

    direction.divideScalar(length);
    candidates.push({
      axis,
      layer: coordForAxis(cubelet.coord, axis),
      unitX: direction.x,
      unitY: direction.y
    });
  }

  return candidates;
}

function chooseTurn(candidates: TurnCandidate[], dx: number, dy: number): TurnCandidate | null {
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return null;
  const swipeX = dx / length;
  const swipeY = dy / length;

  let best: TurnCandidate | null = null;
  let bestAlignment = -Infinity;
  for (const candidate of candidates) {
    const alignment = Math.abs(swipeX * candidate.unitX + swipeY * candidate.unitY);
    if (alignment > bestAlignment) {
      bestAlignment = alignment;
      best = candidate;
    }
  }
  return best;
}

function setHighlight(cubelet: Cubelet, on: boolean, opacity: number) {
  cubelet.highlight.visible = on;
  if (on) (cubelet.highlight.material as THREE.MeshBasicMaterial).opacity = opacity;
}

function clearHighlights() {
  cubelets.forEach(c => { c.highlight.visible = false; });
}

// Gentle glow on the single grabbed piece before a direction is chosen.
function highlightCubelet(cubelet: Cubelet) {
  clearHighlights();
  setHighlight(cubelet, true, 0.38);
}

// Bright glow on the whole row / column / face that will turn, so it is clear
// which of the two possible moves the current swipe direction commits to.
function highlightLayer(axis: Axis, layer: number) {
  cubelets.forEach(c => setHighlight(c, coordForAxis(c.coord, axis) === layer, 0.6));
}

function detachSelected(selected: Cubelet[]) {
  turnPivot.rotation.set(0, 0, 0);
  turnPivot.position.set(0, 0, 0);
  selected.forEach(c => turnPivot.attach(c.group));
}

function returnSelected(selected: Cubelet[]) {
  turnPivot.updateMatrixWorld(true);
  selected.forEach(c => cubeRoot.attach(c.group));
  turnPivot.rotation.set(0, 0, 0);
}

function setPivotAngle(axis: Axis, angle: number) {
  turnPivot.rotation.set(0, 0, 0);
  turnPivot.rotation[axis] = angle;
}

function rotateCoord(coord: Vec3Int, axis: Axis, quarterTurns: -1 | 1): Vec3Int {
  const centered = new THREE.Vector3(coord.x - half, coord.y - half, coord.z - half);
  centered.applyAxisAngle(axisVector(axis), quarterTurns * Math.PI / 2);
  return {
    x: Math.round(centered.x + half),
    y: Math.round(centered.y + half),
    z: Math.round(centered.z + half)
  };
}

function snapQuaternion(q: THREE.Quaternion) {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  e.x = Math.round(e.x / (Math.PI / 2)) * (Math.PI / 2);
  e.y = Math.round(e.y / (Math.PI / 2)) * (Math.PI / 2);
  e.z = Math.round(e.z / (Math.PI / 2)) * (Math.PI / 2);
  q.setFromEuler(e).normalize();
}

function commitSelected(selected: Cubelet[], move: CubeMove) {
  selected.forEach(cubelet => {
    cubelet.coord = rotateCoord(cubelet.coord, move.axis, move.quarterTurns);
    snapQuaternion(cubelet.group.quaternion);
    setCubeletTransform(cubelet);
  });
}

function animatePivot(
  selected: Cubelet[],
  axis: Axis,
  from: number,
  to: number,
  duration: number,
  onDone: () => void
) {
  animating = true;
  const start = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const actualDuration = reduced ? 1 : duration;

  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / actualDuration);
    const eased = 1 - Math.pow(1 - t, 3);
    setPivotAngle(axis, THREE.MathUtils.lerp(from, to, eased));
    if (t < 1) requestAnimationFrame(frame);
    else {
      onDone();
      animating = false;
      updateButtons();
    }
  };
  requestAnimationFrame(frame);
}

function completePreview(gesture: TurnGesture, commit: boolean, record = true) {
  if (!gesture.axis || !gesture.selected.length) return;
  const target = commit ? gesture.sign * Math.PI / 2 : 0;
  animatePivot(gesture.selected, gesture.axis, gesture.angle, target, commit ? 180 : 150, () => {
    if (commit) {
      const move: CubeMove = {
        axis: gesture.axis!,
        layer: gesture.layer,
        quarterTurns: gesture.sign
      };
      returnSelected(gesture.selected);
      commitSelected(gesture.selected, move);
      if (record) {
        moveHistory.push(move);
        moveCount++;
        moveCountEl.textContent = String(moveCount);
        hintCard.classList.add('hidden');
      }
      if (isSolved()) showStatus('Cube solved! ✦');
    } else {
      returnSelected(gesture.selected);
      gesture.selected.forEach(setCubeletTransform);
    }
  });
}

function performMove(move: CubeMove, record = true, duration = 160): Promise<void> {
  return new Promise(resolve => {
    const selected = cubelets.filter(c => coordForAxis(c.coord, move.axis) === move.layer);
    detachSelected(selected);
    animatePivot(selected, move.axis, 0, move.quarterTurns * Math.PI / 2, duration, () => {
      returnSelected(selected);
      commitSelected(selected, move);
      if (record) {
        moveHistory.push(move);
        moveCount++;
        moveCountEl.textContent = String(moveCount);
      }
      resolve();
    });
  });
}

function isSolved(): boolean {
  const faceKeys = [
    { normal: new THREE.Vector3(1,0,0), coord: 'x' as Axis, value: size - 1 },
    { normal: new THREE.Vector3(-1,0,0), coord: 'x' as Axis, value: 0 },
    { normal: new THREE.Vector3(0,1,0), coord: 'y' as Axis, value: size - 1 },
    { normal: new THREE.Vector3(0,-1,0), coord: 'y' as Axis, value: 0 },
    { normal: new THREE.Vector3(0,0,1), coord: 'z' as Axis, value: size - 1 },
    { normal: new THREE.Vector3(0,0,-1), coord: 'z' as Axis, value: 0 }
  ];

  return faceKeys.every(face => {
    const candidates = cubelets.filter(c => coordForAxis(c.coord, face.coord) === face.value);
    const outwardHomeFaces = candidates.map(c => {
      const inv = c.group.quaternion.clone().invert();
      return face.normal.clone().applyQuaternion(inv).round();
    });
    const first = outwardHomeFaces[0];
    return outwardHomeFaces.every(n => n.equals(first));
  });
}

function showStatus(message: string) {
  statusPill.textContent = message;
  statusPill.classList.add('show');
  window.clearTimeout(statusTimeout);
  statusTimeout = window.setTimeout(() => statusPill.classList.remove('show'), 1500);
}

function updateButtons() {
  undoBtn.disabled = animating || moveHistory.length === 0;
  scrambleBtn.disabled = animating;
  resetBtn.disabled = animating;
  viewBtn.disabled = animating;
}

function getPointerCenter(): { x: number; y: number } {
  const values = [...activePointers.values()];
  const total = values.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / values.length, y: total.y / values.length };
}

function getPointerDistance(): number | null {
  const values = [...activePointers.values()];
  if (values.length < 2) return null;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

function beginOrbitFromPointers() {
  const center = getPointerCenter();
  orbitGesture = {
    lastCenterX: center.x,
    lastCenterY: center.y,
    lastDistance: getPointerDistance()
  };
}

function cancelTurnPreviewForOrbit() {
  if (!turnGesture) return;
  clearHighlights();
  const gesture = turnGesture;
  turnGesture = null;
  if (gesture.locked && gesture.axis) completePreview(gesture, false, false);
}

canvas.addEventListener('pointerdown', event => {
  if (animating || levelSelectOpen) return;
  canvas.setPointerCapture(event.pointerId);
  const hit = firstCubeHit(event);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startedOnCube: Boolean(hit) });

  // Two or more fingers always orbit + pinch-zoom, wherever they landed.
  if (activePointers.size >= 2) {
    cancelTurnPreviewForOrbit();
    beginOrbitFromPointers();
    return;
  }

  // Single pointer: orbit when the View lock is on or the gesture starts off
  // the cube (empty space). Otherwise grab the cubelet and twist its layer.
  if (viewMode || !hit) {
    beginOrbitFromPointers();
    return;
  }

  const cubelet = hit.object.userData.cubelet as Cubelet;
  const anchorPointWorld = hit.point.clone();
  const hitNormalWorld = worldNormalForHit(hit);
  const candidates = getTurnCandidates(hitNormalWorld, anchorPointWorld, cubelet);
  if (candidates.length < 2) {
    // Grazing hit — couldn't resolve two turn directions. Fall back to orbit
    // so a gesture on the cube never feels dead.
    beginOrbitFromPointers();
    return;
  }
  highlightCubelet(cubelet);
  turnGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    lastTime: event.timeStamp,
    velocity: 0,
    hitNormalWorld,
    hitCubelet: cubelet,
    anchorPointWorld,
    candidates,
    locked: false,
    axis: null,
    layer: 0,
    sign: 1,
    angle: 0,
    selected: [],
    dragUnitX: 0,
    dragUnitY: 0
  };
});

canvas.addEventListener('pointermove', event => {
  if (!activePointers.has(event.pointerId)) return;
  const previousPointer = activePointers.get(event.pointerId)!;
  activePointers.set(event.pointerId, { ...previousPointer, x: event.clientX, y: event.clientY });

  if (orbitGesture) {
    const center = getPointerCenter();
    const dx = center.x - orbitGesture.lastCenterX;
    const dy = center.y - orbitGesture.lastCenterY;
    cameraYaw -= dx * 0.008;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.006, -0.85, 0.95);

    const distance = getPointerDistance();
    if (distance !== null && orbitGesture.lastDistance !== null) {
      const pinchDelta = distance - orbitGesture.lastDistance;
      cameraDistance = THREE.MathUtils.clamp(cameraDistance - pinchDelta * 0.018, minCameraDistance, maxCameraDistance);
    }

    orbitGesture.lastCenterX = center.x;
    orbitGesture.lastCenterY = center.y;
    orbitGesture.lastDistance = distance;
    updateCamera();
    return;
  }

  if (turnGesture?.pointerId === event.pointerId) {
    const totalDx = event.clientX - turnGesture.startX;
    const totalDy = event.clientY - turnGesture.startY;
    const distance = Math.hypot(totalDx, totalDy);
    const dt = Math.max(1, event.timeStamp - turnGesture.lastTime);
    turnGesture.velocity = Math.hypot(event.clientX - turnGesture.lastX, event.clientY - turnGesture.lastY) / dt;
    turnGesture.lastX = event.clientX;
    turnGesture.lastY = event.clientY;
    turnGesture.lastTime = event.timeStamp;

    if (!turnGesture.locked && distance > 5) {
      const choice = chooseTurn(turnGesture.candidates, totalDx, totalDy);
      if (choice) {
        turnGesture.axis = choice.axis;
        turnGesture.layer = choice.layer;
        turnGesture.dragUnitX = choice.unitX;
        turnGesture.dragUnitY = choice.unitY;
        const signedProjection = totalDx * choice.unitX + totalDy * choice.unitY;
        turnGesture.sign = signedProjection >= 0 ? 1 : -1;
        turnGesture.selected = cubelets.filter(c => coordForAxis(c.coord, choice.axis) === choice.layer);
        detachSelected(turnGesture.selected);
        turnGesture.locked = true;
        highlightLayer(choice.axis, choice.layer);
      }
    }

    if (turnGesture.locked && turnGesture.axis) {
      const signedDrag = totalDx * turnGesture.dragUnitX + totalDy * turnGesture.dragUnitY;
      const angle = THREE.MathUtils.clamp(signedDrag * 0.0125, -1.82, 1.82);
      turnGesture.angle = angle;
      turnGesture.sign = angle >= 0 ? 1 : -1;
      setPivotAngle(turnGesture.axis, angle);
    }
  }
});

function endPointer(event: PointerEvent) {
  activePointers.delete(event.pointerId);
  clearHighlights();

  if (turnGesture?.pointerId === event.pointerId) {
    const gesture = turnGesture;
    turnGesture = null;
    if (gesture.locked && gesture.axis) {
      const commit = Math.abs(gesture.angle) >= THREE.MathUtils.degToRad(42) || gesture.velocity > 0.65;
      completePreview(gesture, commit);
    }
  }

  if (activePointers.size === 0) orbitGesture = null;
  else beginOrbitFromPointers();
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

undoBtn.addEventListener('click', async () => {
  if (animating) return;
  const last = moveHistory.pop();
  if (!last) return;
  await performMove({ ...last, quarterTurns: (last.quarterTurns * -1) as -1 | 1 }, false);
  moveCount = Math.max(0, moveCount - 1);
  moveCountEl.textContent = String(moveCount);
  showStatus('Move undone');
  updateButtons();
});

async function scrambleCube() {
  if (animating) return;
  showStatus('Scrambling…');
  const moves: CubeMove[] = [];
  let previousAxis: Axis | null = null;
  const turns = size === 2 ? 12 : size === 3 ? 25 : 40;
  for (let i = 0; i < turns; i++) {
    const axes: Axis[] = ['x', 'y', 'z'];
    let axis = axes[Math.floor(Math.random() * axes.length)];
    while (axis === previousAxis) axis = axes[Math.floor(Math.random() * axes.length)];
    previousAxis = axis;
    moves.push({
      axis,
      layer: Math.floor(Math.random() * size),
      quarterTurns: Math.random() > 0.5 ? 1 : -1
    });
  }
  for (const move of moves) await performMove(move, false, 80);
  moveHistory.length = 0;
  moveCount = 0;
  moveCountEl.textContent = '0';
  showStatus('Your turn!');
  updateButtons();
}

function resetCube() {
  if (animating) return;
  cubelets.forEach(c => {
    c.coord = { ...c.home };
    c.group.quaternion.identity();
    setCubeletTransform(c);
  });
  moveHistory.length = 0;
  moveCount = 0;
  moveCountEl.textContent = '0';
  showStatus('Cube reset');
  updateButtons();
}

function closeGameMenu() {
  gameMenu.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}

function requestDangerAction(action: 'scramble' | 'reset') {
  pendingDangerAction = action;
  closeGameMenu();
  const isScramble = action === 'scramble';
  confirmTitle.textContent = isScramble ? 'Scramble this cube?' : 'Reset this cube?';
  confirmCopy.textContent = isScramble
    ? 'Your current progress will be replaced with a new random puzzle.'
    : 'Your current progress will be cleared and the cube returned to solved.';
  confirmAction.textContent = isScramble ? 'Scramble' : 'Reset';
  confirmDialog.showModal();
}

menuBtn.addEventListener('click', () => {
  const willOpen = gameMenu.hidden;
  gameMenu.hidden = !willOpen;
  menuBtn.setAttribute('aria-expanded', String(willOpen));
});

scrambleBtn.addEventListener('click', () => requestDangerAction('scramble'));
resetBtn.addEventListener('click', () => requestDangerAction('reset'));

confirmDialog.addEventListener('close', async () => {
  const action = pendingDangerAction;
  pendingDangerAction = null;
  if (confirmDialog.returnValue !== 'confirm' || !action) return;
  if (action === 'scramble') await scrambleCube();
  else resetCube();
});

document.addEventListener('pointerdown', event => {
  if (gameMenu.hidden) return;
  const target = event.target as Node;
  if (!gameMenu.contains(target) && !menuBtn.contains(target)) closeGameMenu();
});

function openLevelSelect() {
  levelSelectOpen = true;
  closeGameMenu();
  levelButtons.forEach(b => b.classList.toggle('active', Number(b.dataset.size) === size));
  levelSelect.classList.add('open');
}

function selectLevel(nextSize: number) {
  const rebuild = nextSize !== size || cubelets.length === 0;
  levelSelectOpen = false;
  levelSelect.classList.remove('open');
  if (rebuild) {
    buildCube(nextSize);
    hintCard.classList.remove('hidden');
    showStatus(`${nextSize}×${nextSize} · fresh cube`);
  }
}

levelBtn.addEventListener('click', openLevelSelect);
levelButtons.forEach(btn => btn.addEventListener('click', () => selectLevel(Number(btn.dataset.size))));
levelSelect.addEventListener('pointerdown', event => {
  // Tapping the dimmed backdrop cancels — but only once a cube already exists.
  if (event.target === levelSelect && cubelets.length > 0) {
    levelSelectOpen = false;
    levelSelect.classList.remove('open');
  }
});

viewBtn.addEventListener('click', () => {
  viewMode = !viewMode;
  viewBtn.classList.toggle('active', viewMode);
  viewBtn.setAttribute('aria-pressed', String(viewMode));
  const label = viewBtn.querySelector('span');
  if (label) label.textContent = viewMode ? 'Done' : 'View';
  showStatus(viewMode ? 'Look lock — drag anywhere to orbit' : 'Twist mode — drag off the cube to orbit');
});

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.fov = width < 520 ? 42 : 36;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
updateCamera();
resize();
updateButtons();
openLevelSelect();

const clock = new THREE.Clock();
function render() {
  const elapsed = clock.getElapsedTime();
  stars.rotation.y = elapsed * 0.006;
  stars.rotation.x = Math.sin(elapsed * 0.08) * 0.025;
  brightStars.rotation.y = -elapsed * 0.003;
  brightStars.rotation.z = Math.sin(elapsed * 0.06) * 0.02;
  glow.material.opacity = 0.075 + Math.sin(elapsed * 1.2) * 0.012;
  if (!turnGesture && !animating) cubeRoot.position.y = Math.sin(elapsed * 0.85) * 0.055;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

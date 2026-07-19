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
  locked: boolean;
  axis: Axis | null;
  layer: number;
  sign: -1 | 1;
  angle: number;
  selected: Cubelet[];
};

type OrbitGesture = {
  pointerId: number;
  lastX: number;
  lastY: number;
};

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!;
const moveCountEl = document.querySelector<HTMLElement>('#move-count')!;
const hintCard = document.querySelector<HTMLElement>('#hint-card')!;
const statusPill = document.querySelector<HTMLElement>('#status-pill')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const scrambleBtn = document.querySelector<HTMLButtonElement>('#scramble-btn')!;
const resetBtn = document.querySelector<HTMLButtonElement>('#reset-btn')!;
const viewBtn = document.querySelector<HTMLButtonElement>('#view-btn')!;

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
const starCount = 900;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const radius = THREE.MathUtils.randFloat(11, 38);
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.cos(phi);
  starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
}
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xdce4ff,
    size: 0.055,
    transparent: true,
    opacity: 0.88,
    sizeAttenuation: true,
    depthWrite: false
  })
);
scene.add(stars);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const size = 2;
const spacing = 1.08;
const half = (size - 1) / 2;
const cubelets: Cubelet[] = [];
const moveHistory: CubeMove[] = [];
let moveCount = 0;
let turnGesture: TurnGesture | null = null;
let orbitGesture: OrbitGesture | null = null;
let animating = false;
let statusTimeout = 0;

let cameraYaw = Math.PI / 4;
let cameraPitch = 0.42;
const cameraDistance = 7.3;

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
  pz: new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.24 }),
  nz: new THREE.MeshStandardMaterial({ color: 0x5968ff, roughness: 0.24 })
};

const roundedBox = new THREE.BoxGeometry(0.98, 0.98, 0.98, 3, 3, 3);
roundedBox.computeVertexNormals();
const stickerGeometry = new THREE.BoxGeometry(0.76, 0.76, 0.055, 2, 2, 1);

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
  group.add(bevelShell);

  if (x === size - 1) group.add(createSticker(stickerMaterials.px, new THREE.Vector3(1, 0, 0)));
  if (x === 0) group.add(createSticker(stickerMaterials.nx, new THREE.Vector3(-1, 0, 0)));
  if (y === size - 1) group.add(createSticker(stickerMaterials.py, new THREE.Vector3(0, 1, 0)));
  if (y === 0) group.add(createSticker(stickerMaterials.ny, new THREE.Vector3(0, -1, 0)));
  if (z === size - 1) group.add(createSticker(stickerMaterials.pz, new THREE.Vector3(0, 0, 1)));
  if (z === 0) group.add(createSticker(stickerMaterials.nz, new THREE.Vector3(0, 0, -1)));

  const cubelet: Cubelet = {
    id: `${x}-${y}-${z}`,
    home: { x, y, z },
    coord: { x, y, z },
    group
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

for (let x = 0; x < size; x++) {
  for (let y = 0; y < size; y++) {
    for (let z = 0; z < size; z++) cubelets.push(makeCubelet(x, y, z));
  }
}

const shadowPlane = new THREE.Mesh(
  new THREE.CircleGeometry(2.25, 64),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -2.12;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

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
  return hits.find(hit => hit.object.userData.cubelet) ?? null;
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

function chooseTurn(normal: THREE.Vector3, dx: number, dy: number, cubelet: Cubelet) {
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const screenDirection = new THREE.Vector3();

  camera.getWorldDirection(screenDirection);
  right.crossVectors(screenDirection, camera.up).normalize();
  up.crossVectors(right, screenDirection).normalize();

  const swipeWorld = right.multiplyScalar(dx).add(up.multiplyScalar(-dy)).normalize();
  const tangent = swipeWorld.clone().sub(normal.clone().multiplyScalar(swipeWorld.dot(normal))).normalize();

  const rotationAxisWorld = new THREE.Vector3().crossVectors(normal, tangent);
  const abs = [Math.abs(rotationAxisWorld.x), Math.abs(rotationAxisWorld.y), Math.abs(rotationAxisWorld.z)];
  const axis: Axis = abs[0] > abs[1] && abs[0] > abs[2] ? 'x' : abs[1] > abs[2] ? 'y' : 'z';
  const axisVec = axisVector(axis);
  const sign = (rotationAxisWorld.dot(axisVec) >= 0 ? 1 : -1) as -1 | 1;

  return { axis, layer: coordForAxis(cubelet.coord, axis), sign };
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

canvas.addEventListener('pointerdown', event => {
  if (animating || turnGesture || orbitGesture) return;
  canvas.setPointerCapture(event.pointerId);
  const hit = firstCubeHit(event);

  if (hit) {
    const cubelet = hit.object.userData.cubelet as Cubelet;
    turnGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      hitNormalWorld: worldNormalForHit(hit),
      hitCubelet: cubelet,
      locked: false,
      axis: null,
      layer: 0,
      sign: 1,
      angle: 0,
      selected: []
    };
  } else {
    orbitGesture = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  }
});

canvas.addEventListener('pointermove', event => {
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
      const choice = chooseTurn(turnGesture.hitNormalWorld, totalDx, totalDy, turnGesture.hitCubelet);
      turnGesture.axis = choice.axis;
      turnGesture.layer = choice.layer;
      turnGesture.sign = choice.sign;
      turnGesture.selected = cubelets.filter(c => coordForAxis(c.coord, choice.axis) === choice.layer);
      detachSelected(turnGesture.selected);
      turnGesture.locked = true;
    }

    if (turnGesture.locked && turnGesture.axis) {
      const signedDistance = distance * turnGesture.sign;
      const angle = THREE.MathUtils.clamp(signedDistance * 0.0125, -1.82, 1.82);
      turnGesture.angle = angle;
      const effectiveSign = angle >= 0 ? 1 : -1;
      turnGesture.sign = effectiveSign;
      setPivotAngle(turnGesture.axis, angle);
    }
  } else if (orbitGesture?.pointerId === event.pointerId) {
    const dx = event.clientX - orbitGesture.lastX;
    const dy = event.clientY - orbitGesture.lastY;
    cameraYaw -= dx * 0.008;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.006, -0.85, 0.95);
    orbitGesture.lastX = event.clientX;
    orbitGesture.lastY = event.clientY;
    updateCamera();
  }
});

function endPointer(event: PointerEvent) {
  if (turnGesture?.pointerId === event.pointerId) {
    const gesture = turnGesture;
    turnGesture = null;
    if (gesture.locked && gesture.axis) {
      const commit = Math.abs(gesture.angle) >= THREE.MathUtils.degToRad(42) || gesture.velocity > 0.65;
      completePreview(gesture, commit);
    }
  }
  if (orbitGesture?.pointerId === event.pointerId) orbitGesture = null;
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

scrambleBtn.addEventListener('click', async () => {
  if (animating) return;
  showStatus('Scrambling…');
  const moves: CubeMove[] = [];
  let previousAxis: Axis | null = null;
  for (let i = 0; i < 10; i++) {
    const axes: Axis[] = ['x', 'y', 'z'];
    let axis = axes[Math.floor(Math.random() * axes.length)];
    while (axis === previousAxis) axis = axes[Math.floor(Math.random() * axes.length)];
    previousAxis = axis;
    moves.push({
      axis,
      layer: Math.random() > 0.5 ? 0 : size - 1,
      quarterTurns: Math.random() > 0.5 ? 1 : -1
    });
  }
  for (const move of moves) await performMove(move, false, 80);
  moveHistory.length = 0;
  moveCount = 0;
  moveCountEl.textContent = '0';
  showStatus('Your turn!');
  updateButtons();
});

resetBtn.addEventListener('click', () => {
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
});

viewBtn.addEventListener('click', () => {
  cameraYaw = Math.PI / 4;
  cameraPitch = 0.42;
  updateCamera();
  showStatus('View reset');
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

const clock = new THREE.Clock();
function render() {
  const elapsed = clock.getElapsedTime();
  stars.rotation.y = elapsed * 0.004;
  stars.rotation.x = Math.sin(elapsed * 0.08) * 0.025;
  const glowMaterial = glow.material as THREE.MeshBasicMaterial;
  glowMaterial.opacity = 0.075 + Math.sin(elapsed * 1.2) * 0.012;
  if (!turnGesture && !animating) cubeRoot.position.y = Math.sin(elapsed * 0.85) * 0.055;
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();

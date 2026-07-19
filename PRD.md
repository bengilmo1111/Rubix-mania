# Rubix Mania — Product Requirements Document

## 1. Product vision

Rubix Mania is a playful, mobile-first voxel cube puzzle set against a deep starfield. Players physically push cube rows with their finger: a layer follows the swipe immediately, then either springs back or completes a quarter-turn once the gesture crosses an accessible commitment threshold.

The first release proves the interaction with a 2×2 cube. The underlying puzzle model must support later 3×3 and 4×4 cubes without replacing the core architecture.

## 2. Core principles

1. **Tactile before technical** — every gesture should feel like pushing a real toy.
2. **Preview before commitment** — the selected layer moves from the first meaningful swipe and only commits after a threshold or confident flick.
3. **Mobile first** — portrait phones are the primary target, including mid-range Android devices.
4. **Forgiving interaction** — reversing a swipe reverses the preview; uncertain gestures can safely spring back.
5. **Cube state is exact** — visual transforms animate from a discrete logical state and snap to exact quarter-turns.
6. **Playful space identity** — the cube floats in a calm, layered starfield rather than a generic 3D scene.

## 3. Prototype scope

### Included

- Functional 2×2 voxel cube
- Six temporary colour faces
- Pointer Events for touch and mouse
- Swipe-to-preview layer turning
- Direction locking after a small dead zone
- Threshold or flick-based commit
- Spring-back on cancelled moves
- Empty-space camera orbit
- Exact 90° snapping and logical-state updates
- Scramble, undo, reset, view reset
- Move counter and solved-state detection
- Responsive portrait and landscape layout
- Animated procedural starfield
- Reduced-motion support

### Deferred

- Casper’s sixth picture face split across tiles
- Final five-colour face scheme
- 3×3 and 4×4 modes
- Guided lessons, timer, personal bests
- Sound, haptics, skins, progression
- Daily challenges and PWA installation

## 4. Layer-turn interaction

1. Pointer begins on a visible cubelet face.
2. The game stores the hit face normal, cubelet and starting position.
3. After a small dead zone, the dominant projected face direction locks.
4. The corresponding layer immediately follows the pointer.
5. Rotation is proportional to swipe distance and capped just past 90°.
6. Crossing about 42° commits the intended direction.
7. On release:
   - commit beyond the angle threshold;
   - or commit on a confident high-velocity flick;
   - otherwise animate back to zero.
8. Additional puzzle gestures are ignored during snap animation.
9. Coordinates and orientations are snapped to exact discrete values.

## 5. Camera interaction

- Pointer starting outside the cube rotates the view.
- Orbit has no roll and a limited vertical range.
- Reset View restores a readable three-quarter view.
- Camera movement never alters puzzle state.

## 6. Visual direction

- Deep navy-black space backdrop
- Layered stars with gentle motion
- Chunky dark voxel cubelets
- Slight gaps between pieces
- Raised rounded colour tiles
- Soft ambient and rim lighting
- Translucent, mobile-safe controls
- Bright playful Rubix Mania title

## 7. Puzzle model

Each cubelet has a stable ID, home integer coordinate, current integer coordinate, discrete orientation, local sticker definitions, and a Three.js object reference.

```ts
type CubeMove = {
  axis: 'x' | 'y' | 'z';
  layer: number;
  quarterTurns: -1 | 1;
};
```

Cube size is a constructor-level concern so the state system can later generate 3×3 and 4×4 puzzles.

## 8. Accessibility

- Minimum 44px touch targets
- Large bottom controls
- High-contrast labels and focus states
- Reduced-motion support
- One gesture performs at most one quarter-turn
- Reversible preview before release
- No precision tapping required

## 9. Performance

- Target 60 FPS on modern phones
- Remain usable at 30 FPS on mid-range Android
- Cap device pixel ratio
- Share geometry and materials
- Avoid per-frame allocation in the render loop
- Never cause horizontal page scrolling

## 10. Technology

- Vite
- TypeScript
- Three.js
- Vanilla DOM UI
- Local state only

## 11. Acceptance criteria

1. Responsive full-screen star scene loads.
2. A readable 2×2 cube can be orbited.
3. Swiping a visible row previews immediately.
4. Early release springs back smoothly.
5. Release beyond threshold completes exactly 90°.
6. Repeated moves do not introduce visible drift.
7. Scramble uses legal moves.
8. Undo reverses the latest committed move.
9. Reset restores the solved cube.
10. Touch and mouse both work.
11. Narrow portrait screens have no side scrolling.
12. Architecture supports a later picture face and larger cube sizes.

## 12. Next milestone

After validating gestures on real phones:

- Replace one temporary colour face with Casper’s image face.
- Split the image into 2×2 tile regions.
- Preserve tile orientation through cube moves.
- Use five coloured faces plus the reconstructed picture as the main solve reward.

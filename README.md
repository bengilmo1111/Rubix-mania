# Rubix Mania

A mobile-first voxel cube prototype floating in space.

## Prototype features

- Functional 2×2 cube
- Swipe directly on a row to preview its rotation
- Release past the threshold to complete the turn
- Release early to spring the row back
- Drag empty space to orbit the view
- Scramble, undo, reset, and view reset
- Move counting and solved detection
- Responsive portrait/landscape layout
- Procedural animated starfield

## Run locally

```bash
npm install
npm run dev
```

Open the local URL on desktop, or expose the Vite dev server to your phone:

```bash
npm run dev -- --host
```

## Production build

```bash
npm run build
```

## Controls

- **Swipe on cube:** preview and turn a layer
- **Drag empty space:** orbit camera
- **Scramble:** generate a legal 10-move scramble
- **Undo:** reverse the latest player move
- **Reset:** return to solved state
- **View:** restore the default camera angle

## Product spec

See [PRD.md](./PRD.md).

## Next step

Test the gesture interpretation on real phones, then add Casper’s five-colour scheme and picture-tile sixth face.

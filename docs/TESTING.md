# Testing

Results recorded on 2026-10-16 on Windows 11, Node 22.14.0, headless Chromium (Playwright 1.64, software WebGL via SwiftShader).

## Commands

| Check | Command | What it covers |
|---|---|---|
| Types | `npm run typecheck` | TypeScript strict, `noUncheckedIndexedAccess` |
| Unit | `npm test` | Definition validity, validation-gate rejections, oxygenation labelling, canonical flow order, flow streams (order, containment, connectivity, sides), reducer (select, layers, isolate, reset, tour clamping), search |
| Assets | `npm run validate:assets` | GLB sha256 = provenance, node set = geometry record, finite positions in a 0.2 m box, unit normals, indices in range, triangle counts, attribution text |
| Build | `npm run build` | Type check + production bundle |
| E2E | `npm run build && npm run e2e` | See the list below; screenshots go to `docs/screenshots/` |
| Dependencies | `npm audit` | Run at install: 0 vulnerabilities reported by the npm registry advisory database on 2026-10-16 |

## E2E scenarios (`tests/e2e/lab.spec.ts`)

1. The model loads with no console errors.
2. Clicking the model selects the structure under the pointer; a drag rotates without changing the selection.
3. Search by abbreviation (LAD) and synonym (bicuspid); a no-match message; Escape restores the list.
4. Layer toggles hide and show structures; chambers start hidden.
5. Isolate, Zoom to and Reset (selection, isolate and layers all restored).
6. Camera presets change the rendered view.
7. Labels mode: at least 4 labels, none overlapping; an occluded interior structure is not labelled.
8. Blood-flow mode lists the circuit in the canonical order; Pause and Play work.
9. Guided tour: Next, Back, jump to a step, Finish.
10. Keyboard: arrow keys orbit; Escape clears the selection.
11. Phone (390×844): no horizontal overflow; the Structures dock button opens the panel; picking a structure closes it and shows the details sheet.
12. `?nowebgl`: a fallback message; the structure list and details still work.
13. A missing model (HTTP 404): an error alert; Try again refetches and loads.
14. Reduced motion: flow mode runs without errors.
15. Uncluttered screen: no details sheet until something is selected; no disclaimer or learning-goal text on the main screen; model note and sources are folded away.
16. About (ⓘ) sheet: shows the BodyParts3D CC BY 4.0 credit and disclaimers; closes with Escape and with ✕; also opens from "Source & credits".

## Results

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** (0 errors) |
| `npm test` | **Pass**: 26/26 tests in 2 files |
| `npm run validate:assets` | **Pass**: 34 nodes, 85,624 triangles, sha256 `be55fe1cc557…` |
| `npm run build` | **Pass**. JS bundle is 1,420 kB (394 kB gzip); Vite warns about chunk size, see Known issues |
| `npm run e2e` | **Pass**: 16/16 in 5.6 min (software WebGL), after the light-theme layout change |
| `npm audit` | 0 vulnerabilities at install time |
| Live site (2026-10-18) | **Pass**: https://heart-anatomy-lab.vercel.app returns the page; `models/heart.glb` is served with the recorded sha256 `be55fe1c…`; the model renders in headless Chromium with no console errors |

Two defects were caught by E2E and fixed before this run:

- **Try again** reused the loader's cached failure.
- A 60 s test budget was too short for software rendering; it is now 120 s.

Defects found in manual browser QA and fixed:

- Materials were attached twice under React StrictMode, so highlighting and see-through walls did nothing.
- Labels were shown for structures hidden behind others.
- Labels appeared before the model had loaded.
- The chordae tendineae note was wrong. The chordae are part of the valve meshes, which was confirmed by isolating the meshes.

Defect found while building the lungs lab (shared label code) and fixed here:

- The label visibility throttle read the render clock, which does not advance while the canvas renders on demand. After the camera stopped, labels could keep stale anchors or occlusion. It now uses wall-clock time. Clean re-run from `heart/` on 2026-10-17: typecheck pass, unit **26/26**, build pass, E2E **16/16** (4.7 min).

## Known issues

- The JS bundle is large (1.4 MB; three.js + drei in one chunk). Planned: lazy-load the 3D chunk behind the poster and import drei per component.
- `heart.glb` is 2.4 MB uncompressed. Planned: meshopt compression with per-node structure kept (and a validator check that node names survive).
- The off-model tags ("To the right lung") can sit close to the viewer edge at some zoom levels.
- three.js logs a deprecation warning for `THREE.Clock` (from @react-three/fiber internals). It does not affect behaviour.

## Not verified

- **Physical devices and GPUs.** All browser tests ran with software WebGL in headless Chromium. Frame rate on a real mid-range laptop or phone, and real multitouch (pinch and two-finger pan), have not been tested.
- **Other browsers.** Firefox and Safari were not run.
- **Automated accessibility audit.** axe-core is not installed, so no automated audit was run. Keyboard paths and ARIA labels were checked by hand and by the E2E tests only.
- **Memory over long sessions.** Materials and particle geometry are disposed on unmount, but heap growth over repeated mode switches was not measured.
- **Anatomical review.** The structure map follows BodyParts3D names and FMA ids, and the text was checked against OpenStax A&P 2e §19.1. No anatomist or physician has reviewed it.

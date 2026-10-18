# Human Heart Anatomy — Interactive 3D Learning Lab

**Live:** https://heart-anatomy-lab.vercel.app

An interactive 3D heart for secondary-school and first-year biology:

- Select, search and isolate the chambers, valves, great vessels, coronary arteries and cardiac veins.
- Follow animated blood through the pulmonary and systemic circuits.
- Walk through an 11-step guided tour.

It is the first simulation of a planned spec-driven simulation platform. The lab renders a validated `SimulationDefinition` (plain data), so future simulations, including AI-generated ones, go through the same validation gate.

**Educational only.** This is not a clinical tool, and the text has not been reviewed by a physician. The 3D model is the BodyParts3D adult male reference heart (© DBCLS, CC BY 4.0); see [public/ATTRIBUTION.md](public/ATTRIBUTION.md).

## Run

Requires Node.js ≥ 22.12 and npm.

```sh
npm install
npm run dev            # http://localhost:5180
```

Production build and preview:

```sh
npm run build          # type-check + vite build → dist/
npm run preview        # http://localhost:5181
```

## Check

```sh
npm run typecheck
npm test                       # unit tests (Vitest)
npm run validate:assets        # model hash, nodes, geometry sanity, attribution
npx playwright install chromium   # once
npm run build && npm run e2e   # browser tests (Playwright, headless Chromium)
```

See [docs/TESTING.md](docs/TESTING.md) for what each check covers and what is not verified.

## Rebuild the heart model

`public/models/heart.glb` is generated, not hand-made:

```sh
node tools/extract-heart.mjs "<path to a BodyParts3D atlas build with atlas.json>"
node tools/validate-assets.mjs
```

The structure-to-element map is in `src/heart/source/structures.source.json`. The extraction is deterministic: the same input gives a byte-identical GLB, whose sha256 is recorded in `src/heart/generated/provenance.json` and `public/ATTRIBUTION.md`.

## Layout

| Path | What |
|---|---|
| `src/contract/` | `SimulationDefinition` schema (zod), approved-asset registry, validation gate |
| `src/heart/` | Heart definition (structures, layers, flow path, tour, sources), geometry-derived flow streams and label anchors |
| `src/app/` | Pure state reducer, search, React context |
| `src/viewer/` | three.js / react-three-fiber scene: model, camera rig, flow particles, labels |
| `src/ui/` | Panels: structures, details, flow, tour |
| `tools/` | Model extraction and asset validation |
| `tests/unit`, `tests/e2e` | Vitest and Playwright suites |
| `docs/` | Research audit, architecture, testing, AI-generation design |

## Deploy

The site is a Vercel project (Vite preset, output `dist/`) connected to [github.com/Niyaz-05/heart-anatomy-lab](https://github.com/Niyaz-05/heart-anatomy-lab). Every push to `main` deploys to https://heart-anatomy-lab.vercel.app; pushes to other branches get preview URLs.

## Licences

- **3D model:** BodyParts3D, CC BY 4.0. Attribution and the list of changes are in `public/ATTRIBUTION.md`.
- **Explanatory text:** written for this project, with each source cited.
- **Application code:** no licence has been chosen yet; it is the owner's decision.

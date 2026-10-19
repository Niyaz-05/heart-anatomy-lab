# Architecture

## Principle: simulations are validated data

The runtime does not contain "the heart app". It renders a **`SimulationDefinition`** (`src/contract/schema.ts`), which holds:

- assets, named by id from an approved registry;
- structures, layers and camera presets;
- flow paths, tour steps, learning objectives, sources and disclaimers.

`src/heart/definition.ts` is one such definition. Before anything renders, `validateDefinition()` (`src/contract/validate.ts`) checks it:

1. **Schema.** Types, lengths and kebab-case ids. URLs must be https and appear only in sources.
2. **Cross-references.** Unique ids; layers, structures, sources and camera presets exist; zones list their neighbours; tour steps point at real flow steps.
3. **Assets.** Every asset id is in `APPROVED_ASSETS` (`src/contract/assets.ts`), and every `mesh` structure has a node of the same name in that asset.

It returns all issues at once (`ValidationIssue[]`), which suits an automated repair step. If validation fails, the app shows the issues instead of rendering a partial simulation.

A definition can never carry code, a file path or an arbitrary URL for an asset. That is the property the future AI generator relies on (see `AI_GENERATION.md`).

## Module boundaries

```
contract/   schema · approved assets · validation          (no React, no three)
heart/      definition (data) · flowPath · anchors          (no React; reads generated geometry)
app/        state reducer · search · context                (React only in LabContext)
viewer/     HeartViewer · HeartModel · CameraRig · FlowParticles · LabelLayer   (three / R3F)
ui/         StructurePanel · DetailPanel · FlowPanel · TourPanel               (DOM only)
tools/      extract-heart · bake-shading · validate-assets  (Node build-time)
```

- **State** (`app/state.ts`) is a pure reducer. It covers selection, hover, visible layers, isolate, labels, mode, flow play state, tour index and camera requests. Visibility rules are pure functions (`isVisible`, `highlightedIds`, `focusIds`) shared by the scene and the panels, so the list's "hidden" tags always agree with the 3D view.
- **The scene only reads state.** Picking dispatches `select`. Camera moves are *requests* with a nonce, so "Front" pressed twice re-frames twice.
- **Geometry facts are generated at build time** by `tools/extract-heart.mjs` into `src/heart/generated/geometry.json`. They include bounds, centroids, principal axes, chamber interior points (point-in-mesh tested), vessel centrelines and surface anchors. The flow path and label anchors come from these facts, not from hand-placed coordinates.

## Rendering

- three.js 0.186 via @react-three/fiber 9 and drei 10, the same stack as the Heart Atlas viewer. The renderer runs on demand (`frameloop="demand"`) except while the flow animation plays. Device pixel ratio is capped at 2.
- One `MeshStandardMaterial` per structure. Selection, hover, dimming and see-through walls are material changes; `needsUpdate` is flagged only when transparency flips, to avoid shader recompiles.
- Picking uses R3F pointer events. Hidden meshes pass the event on. A press that moved more than 5 px counts as a rotate, not a pick.
- **Labels** (`LabelLayer`) are DOM elements positioned each frame. Each surface structure is labelled at a camera-facing vertex near its middle. One raycast per label hides it when another opaque structure blocks the view, and a greedy pass hides overlaps. The raycasts are throttled and rerun only when the camera, the label set or the visible meshes change.
- **Flow** (`FlowParticles`) uses instanced spheres moving along centripetal Catmull–Rom curves through the measured waypoints, coloured by the stream's oxygen content. Off-model legs (to the lungs and body) are dashed and labelled. With reduced motion, the particles are drawn still.
- **Failure paths:**
  - No WebGL: a fallback note, with all panels still working.
  - Model load error or lost GPU context: an error alert with **Try again**, which clears the loader cache.
  - Invalid definition: an issue list.

## The real-tissue look

The heart is drawn as it looks in a fresh specimen:

- red-brown muscle, with yellow epicardial fat in the grooves along the coronary vessels;
- pale fibrous valves and pale artery walls;
- dark purple-red veins;
- blood in the chambers bright red (oxygen-rich) or dark red (oxygen-poor), never blue.

In the blood-flow animation the dark red is drawn slightly purple, so the two streams are easy to tell apart. `src/viewer/tissue.ts` and `src/viewer/Lighting.tsx` are the same files in the heart, lungs and brain labs.

- **Material.** `MeshPhysicalMaterial` with a clear coat (moist surface) and sheen (velvety tissue), plus a shader hook that:
  - reads the baked `_TISSUE` attribute;
  - darkens folds and grooves by ambient occlusion, including their reflections;
  - varies the colour with noise;
  - tints the baked fat;
  - adds a soft warm rim where the surface turns away, a cheap stand-in for light scattering under living tissue.
- **Lighting.** Image-based light from three's built-in `RoomEnvironment` (no download), a warm key, a soft back light and a fill. Neutral tone mapping keeps reds true (ACES turned the red muscle yellowish).
- **Quality.**
  - **High:** draws the coat and sheen.
  - **Low:** leaves them out (a much cheaper shader).
  - **Choosing:** low is picked on software renderers and when animation frames stay above 50 ms. `?quality=high|low` overrides it.
- **Bake.** `tools/bake-shading.mjs` (config in `tools/bake.config.json`) writes `_TISSUE` into the model:
  - **r:** ambient occlusion, from 48 fixed rays per vertex through a `three-mesh-bvh` tree;
  - **g:** colour noise;
  - **b:** an epicardial-fat mask, for wall vertices within about 3 mm of a coronary artery or cardiac vein *and* in a concave groove.

  It is deterministic and updates the output hash in `provenance.json`. Run it after the extraction.

## Asset pipeline

```
BodyParts3D 4.0 OBJ  ──(Human Atlas converter, MIT)──▶  atlas.json + *.bin
   (DBCLS, CC BY 4.0)                                   (metres, Y-up, simplified ≤0.2 %)
        │
        └──(tools/extract-heart.mjs, then tools/bake-shading.mjs)──▶ public/models/heart.glb  (34 nodes, 85,624 triangles, 2.6 MB)
                                        src/heart/generated/geometry.json
                                        src/heart/generated/provenance.json  (sha256 of every input and the output)
```

`tools/validate-assets.mjs` checks:

- the output hash against provenance;
- that the node set equals the geometry record;
- positions are finite, normals are unit length and indices are in range;
- the triangle counts;
- that the attribution file names the dataset, licence and hash.

## Not yet built (see IMPLEMENTATION_PLAN.md)

- The cardiac cycle (valve opening by phase).
- Mesh compression (meshopt) and code-splitting of the 1.4 MB JS bundle.
- The AI generation service (`AI_GENERATION.md`).

/**
 * The simulation contract. A SimulationDefinition is plain, serialisable data: it names approved
 * assets by id, lists the structures and layers a learner can work with, and declares the
 * learning content (flow paths, tour steps, objectives). The runtime renders any definition that
 * passes these schemas and the cross-reference checks in validate.ts. AI-generated definitions go
 * through the same gate, so nothing in here may carry a URL, file path or code.
 */
import { z } from 'zod';

/** Lower-case kebab-case ids keep definitions portable and safe to use as DOM/URL keys. */
export const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'ids are lower-case kebab-case').max(64);
const Text = (max: number) => z.string().trim().min(1).max(max);
const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const Oxygenation = z.enum(['oxygen-poor', 'oxygen-rich', 'not-applicable']);
export type Oxygenation = z.infer<typeof Oxygenation>;

export const Source = z.object({
  id: Id,
  citation: Text(400),
  url: z.url({ protocol: /^https$/ }).optional(),
  license: Text(80).optional(),
});
export type Source = z.infer<typeof Source>;

export const AssetRef = z.object({
  /** Key into the approved asset registry (assets.ts); never a path or URL. */
  id: Id,
  role: z.enum(['anatomy-model']),
});

export const Layer = z.object({
  id: Id,
  label: Text(60),
  description: Text(300),
  visibleByDefault: z.boolean(),
});
export type Layer = z.infer<typeof Layer>;

export const AnatomicalStructure = z.object({
  id: Id,
  label: Text(80),
  synonyms: z.array(Text(80)).max(12),
  layer: Id,
  /** mesh: a node of the same id exists in the model. zone: no geometry; shown via `between`. */
  kind: z.enum(['mesh', 'zone']),
  between: z.array(Id).min(2).max(4).optional(),
  summary: Text(400),
  function: Text(600),
  inflow: Text(300).optional(),
  outflow: Text(300).optional(),
  blood: Oxygenation,
  related: z.array(Id).max(12),
  /** What the 3D model does and does not show for this structure. */
  modelNote: Text(400).optional(),
  sources: z.array(Id).min(1).max(6),
});
export type AnatomicalStructure = z.infer<typeof AnatomicalStructure>;

export const CameraPreset = z.object({
  id: Id,
  label: Text(40),
  /** Unit-ish vector from the model centre towards the camera, in model axes. */
  direction: Vec3,
  up: Vec3.optional(),
});
export type CameraPreset = z.infer<typeof CameraPreset>;

export const FlowStep = z.object({
  /** A structure on the model, or an off-model stage drawn schematically. */
  structure: Id.optional(),
  offModel: z.enum(['body', 'lungs']).optional(),
  label: Text(80),
  blood: Oxygenation,
  note: Text(300).optional(),
}).refine((s) => (s.structure === undefined) !== (s.offModel === undefined), {
  message: 'a flow step names exactly one of structure or offModel',
});
export type FlowStep = z.infer<typeof FlowStep>;

export const FlowPath = z.object({
  id: Id,
  label: Text(80),
  description: Text(400),
  steps: z.array(FlowStep).min(2).max(40),
});
export type FlowPath = z.infer<typeof FlowPath>;

export const TourStep = z.object({
  id: Id,
  title: Text(80),
  body: Text(700),
  focus: z.array(Id).max(8),
  camera: Id.optional(),
  /** Flow step index this tour step corresponds to, if any. */
  flowStep: z.number().int().min(0).optional(),
});
export type TourStep = z.infer<typeof TourStep>;

export const LearningObjective = z.object({ id: Id, text: Text(200) });

export const SimulationDefinition = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  title: Text(100),
  domain: z.enum(['biology']),
  simulationType: z.enum(['3d-anatomy']),
  audience: Text(120),
  summary: Text(500),
  learningObjectives: z.array(LearningObjective).min(1).max(12),
  assets: z.array(AssetRef).min(1).max(4),
  layers: z.array(Layer).min(1).max(16),
  structures: z.array(AnatomicalStructure).min(1).max(200),
  cameraPresets: z.array(CameraPreset).min(1).max(12),
  defaultCamera: Id,
  flowPaths: z.array(FlowPath).max(4),
  tour: z.array(TourStep).max(40),
  sources: z.array(Source).min(1).max(40),
  disclaimers: z.array(Text(400)).min(1).max(6),
});
export type SimulationDefinition = z.infer<typeof SimulationDefinition>;

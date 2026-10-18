import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useLab } from '../app/LabContext';
import { focusIds, highlightedIds, isVisible } from '../app/state';
import { baseColour, HIGHLIGHT, HOVER } from './palette';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/heart.glb`;

const GREY = new THREE.Color('#8a8a8a');
const HIGHLIGHT_COLOUR = new THREE.Color(HIGHLIGHT);

/** Pointer travel (px) above which a press is treated as a drag (rotate), not a pick. */
const CLICK_SLOP = 5;

interface Part {
  id: string;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  base: THREE.Color;
  layer: string;
}

export function HeartModel({ onReady }: { onReady?: () => void }) {
  const { def, state, dispatch } = useLab();
  const gltf = useGLTF(MODEL_URL);
  const invalidate = useThree((s) => s.invalidate);

  // One material per structure so highlight and visibility are independent.
  const parts = useMemo(() => {
    const out = new Map<string, Part>();
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const id = o.name || o.parent?.name || '';
      const s = def.structures.find((x) => x.id === id);
      if (!s) return;
      const base = new THREE.Color(baseColour(s));
      const material = new THREE.MeshStandardMaterial({
        color: base.clone(),
        roughness: s.layer === 'valve' ? 0.55 : 0.62,
        metalness: 0.02,
        side: THREE.DoubleSide,
      });
      out.set(id, { id, mesh: o, material, base, layer: s.layer });
    });
    return out;
  }, [gltf, def]);

  // Attach materials in an effect, not in useMemo: StrictMode may run the memo twice, and the
  // meshes must carry the materials this component actually updates. Dispose them on unmount.
  useLayoutEffect(() => {
    for (const p of parts.values()) {
      p.mesh.material = p.material;
      p.mesh.userData.structureId = p.id;
    }
    onReady?.();
    return () => parts.forEach((p) => p.material.dispose());
  }, [parts, onReady]);

  const focus = focusIds(def, state);
  const lit = highlightedIds(def, focus);
  // Interior structures in focus (chambers, valves) need the walls see-through to be visible.
  const seeInside = [...lit].some((id) => {
    const layer = def.structures.find((s) => s.id === id)?.layer;
    return layer === 'chamber' || layer === 'valve';
  });
  const flow = state.mode === 'flow' || (state.mode === 'tour' && def.tour[state.tourIndex]?.flowStep !== undefined);

  useEffect(() => {
    for (const p of parts.values()) {
      const visible = isVisible(def, state, p.id);
      p.mesh.visible = visible;
      const isLit = lit.has(p.id);
      const isHover = state.hovered === p.id && !isLit;
      p.material.emissive.set(isLit ? HIGHLIGHT : isHover ? HOVER : '#000000');
      p.material.emissiveIntensity = isLit ? 0.55 : isHover ? 0.35 : 0;
      // Dim the rest while something is in focus, so the focus reads without hiding context.
      const dim = lit.size > 0 && !isLit;
      p.material.color.copy(p.base);
      if (isLit) p.material.color.lerp(HIGHLIGHT_COLOUR, 0.35);
      else if (dim) p.material.color.lerp(GREY, 0.45);

      let opacity = 1;
      if (flow && !isLit && p.layer !== 'valve') opacity = 0.2;
      else if (seeInside && p.layer === 'wall' && !isLit) opacity = 0.18;
      else if (dim && (p.layer === 'vessel' || p.layer === 'wall')) opacity = 0.55;
      const transparent = opacity < 1;
      // Changing `transparent` changes the shader program; only flag an update when it flips.
      if (p.material.transparent !== transparent) p.material.needsUpdate = true;
      p.material.transparent = transparent;
      p.material.opacity = opacity;
      p.material.depthWrite = !transparent;
      p.mesh.renderOrder = transparent ? 1 : 0;
    }
    invalidate();
  }, [parts, def, state, lit, seeInside, flow, invalidate]);

  const pick = (e: ThreeEvent<MouseEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible) return; // let the event reach the next hit
    e.stopPropagation();
    if (e.delta > CLICK_SLOP) return;
    dispatch({ type: 'select', id });
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    const id = e.object.userData.structureId as string | undefined;
    if (!id || !e.object.visible) return;
    e.stopPropagation();
    dispatch({ type: 'hover', id });
    document.body.style.cursor = 'pointer';
  };
  const out = (e: ThreeEvent<PointerEvent>) => {
    if (e.object.userData.structureId === state.hovered) dispatch({ type: 'hover', id: null });
    document.body.style.cursor = '';
  };

  return <primitive object={gltf.scene} onClick={pick} onPointerOver={over} onPointerOut={out} />;
}

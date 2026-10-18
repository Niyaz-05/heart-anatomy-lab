import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { buildFlowStreams, type FlowStream } from '../heart/flowPath';
import { BLOOD } from './palette';

/** Particles per metre of path; keeps density even across short and long streams. */
const DENSITY = 260;
/** Path speed in metres per second at the model's scale (schematic, not a measured velocity). */
const SPEED = 0.028;

/** One tag per off-model leg; the four pulmonary veins share the lung ends, so they carry none. */
const OFF_MODEL_TAG: Record<string, string> = {
  'superior-vena-cava': 'From the upper body',
  'inferior-vena-cava': 'From the lower body',
  'right-pulmonary-artery': 'To the right lung',
  'left-pulmonary-artery': 'To the left lung',
  'left-heart': 'To the body',
};

interface Track {
  stream: FlowStream;
  curve: THREE.CatmullRomCurve3;
  length: number;
  count: number;
  offset: number;
}

/**
 * Schematic blood flow: particles travel along curves through measured waypoints, coloured by
 * the stream's oxygen content. Off-model legs (to the lungs and the body) are dashed and labelled.
 * With reduced motion the particles are drawn still, spaced along the path.
 */
export function FlowParticles({ playing, reducedMotion }: { playing: boolean; reducedMotion: boolean }) {
  const streams = useMemo(() => buildFlowStreams(), []);
  const tracks = useMemo<Track[]>(() => {
    let offset = 0;
    return streams.map((stream) => {
      const curve = new THREE.CatmullRomCurve3(stream.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
      const length = curve.getLength();
      const count = Math.max(4, Math.round(length * DENSITY));
      const t = { stream, curve, length, count, offset };
      offset += count;
      return t;
    });
  }, [streams]);
  const total = tracks.reduce((n, t) => n + t.count, 0);

  const mesh = useRef<THREE.InstancedMesh>(null);
  const phase = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.0014, 10, 8), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  const tmp = useMemo(() => new THREE.Object3D(), []);
  const point = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const colour = new THREE.Color();
    for (const t of tracks) {
      colour.set(BLOOD[t.stream.blood]);
      for (let i = 0; i < t.count; i++) m.setColorAt(t.offset + i, colour);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    place(0);
    invalidate();
    // place() only reads refs and tracks, so tracks is the real dependency.
  }, [tracks]);

  function place(time: number) {
    const m = mesh.current;
    if (!m) return;
    for (const t of tracks) {
      const shift = (time * SPEED) / t.length;
      for (let i = 0; i < t.count; i++) {
        const u = (((i / t.count + shift) % 1) + 1) % 1;
        t.curve.getPointAt(u, point);
        tmp.position.copy(point);
        tmp.updateMatrix();
        m.setMatrixAt(t.offset + i, tmp.matrix);
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }

  useFrame((_, dt) => {
    if (!playing || reducedMotion) return;
    phase.current += Math.min(dt, 0.05);
    place(phase.current);
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[geometry, material, total]} frustumCulled={false} renderOrder={2} />
      {tracks.map((t) => (
        <group key={t.stream.id}>
          {t.stream.offModel.map((leg, i) => {
            const a = t.stream.points[leg.from]!, b = t.stream.points[leg.to]!;
            const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
            return (
              <group key={i}>
                <Line points={[a, b]} color={BLOOD[t.stream.blood]} lineWidth={1.5} dashed dashSize={0.003} gapSize={0.002} />
                {OFF_MODEL_TAG[t.stream.id] && (
                  <Html position={mid} center zIndexRange={[5, 0]} className="offmodel-tag">
                    {OFF_MODEL_TAG[t.stream.id]}
                  </Html>
                )}
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

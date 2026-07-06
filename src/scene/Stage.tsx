import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  Sparkles,
} from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Robot } from "./Robot";
import { Drone } from "./Drone";
import type { Theme } from "../config";

export type WorkerId = "unit01" | "unit02";

interface StageProps {
  move: { clip: string; nonce: number };
  expression: string;
  theme: Theme;
  worker?: WorkerId;
  onFinished: () => void;
  onTap: () => void;
  onFps: (fps: number) => void;
}

/** Floor ring + volumetric beam — the hologram projector the unit stands on. */
function ProjectorRing({ theme }: { theme: Theme }) {
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);

  const hot = useMemo(
    () => new THREE.Color(theme.accent).multiplyScalar(2.2),
    [theme.accent],
  );

  useFrame((state) => {
    const pulse = 0.75 + Math.sin(state.clock.elapsedTime * 1.6) * 0.25;
    const ring = ringRef.current;
    if (ring) {
      (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
    const beam = beamRef.current;
    if (beam) {
      beam.rotation.y = state.clock.elapsedTime * 0.12;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.03 + pulse * 0.03;
    }
  });

  return (
    <group>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[1.52, 1.62, 96]} />
        <meshBasicMaterial color={hot} transparent toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0]}>
        <ringGeometry args={[1.2, 1.5, 96]} />
        <meshBasicMaterial
          color={theme.accent}
          transparent
          opacity={0.1}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={beamRef} position={[0, 1.85, 0]}>
        <cylinderGeometry args={[0.95, 1.56, 3.7, 64, 1, true]} />
        <meshBasicMaterial
          color={theme.accent}
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function FpsProbe({ onFps }: { onFps: (fps: number) => void }) {
  const acc = useRef({ time: 0, frames: 0 });
  useFrame((_, delta) => {
    acc.current.time += delta;
    acc.current.frames += 1;
    if (acc.current.time >= 0.5) {
      onFps(Math.round(acc.current.frames / acc.current.time));
      acc.current.time = 0;
      acc.current.frames = 0;
    }
  });
  return null;
}

export function Stage({
  move,
  expression,
  theme,
  worker = "unit01",
  onFinished,
  onTap,
  onFps,
}: StageProps) {
  return (
    <Canvas
      camera={{ position: [0, 2.0, 7.8], fov: 38 }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true, // enables the capture-frame button
      }}
      dpr={[1, 2]}
    >
      <color attach="background" args={[theme.bg]} />
      <fog attach="fog" args={[theme.bg, 10, 24]} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 7, 4]} intensity={1.3} />
      <pointLight position={[-4.5, 2.5, -3]} intensity={36} color={theme.accent} />
      <pointLight position={[4.5, 1.5, 3.5]} intensity={26} color={theme.accent2} />

      <Environment resolution={256}>
        <Lightformer
          form="rect"
          intensity={2.2}
          color={theme.accent}
          position={[-4, 2.5, 3]}
          scale={[6, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2.2}
          color={theme.accent2}
          position={[4, -1, 3]}
          scale={[6, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.2}
          color="#ffffff"
          position={[0, 5, -4]}
          scale={[9, 3, 1]}
        />
      </Environment>

      <Suspense fallback={null}>
        {worker === "unit02" ? (
          <Drone
            move={move}
            expression={expression}
            theme={theme}
            onFinished={onFinished}
            onTap={onTap}
          />
        ) : (
          <Robot
            move={move}
            expression={expression}
            theme={theme}
            onFinished={onFinished}
            onTap={onTap}
          />
        )}
      </Suspense>

      <ProjectorRing theme={theme} />

      <Grid
        position={[0, -0.005, 0]}
        infiniteGrid
        cellSize={0.55}
        sectionSize={2.75}
        cellThickness={0.6}
        sectionThickness={1.1}
        cellColor={theme.accent}
        sectionColor={theme.accent2}
        fadeDistance={17}
        fadeStrength={2.4}
        followCamera={false}
      />

      <Sparkles
        count={90}
        scale={[7, 4.5, 7]}
        position={[0, 2, 0]}
        size={2.2}
        speed={0.32}
        opacity={0.55}
        color={theme.accent}
      />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.55}
        scale={11}
        blur={2.4}
        far={4.2}
        color={theme.shadow}
      />

      <OrbitControls
        makeDefault
        target={[0, 1.55, 0]}
        enablePan={false}
        minDistance={4.5}
        maxDistance={11}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 1.95}
        autoRotate
        autoRotateSpeed={0.55}
      />

      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          intensity={0.9}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.2}
          radius={0.8}
        />
        <Vignette eskil={false} offset={0.22} darkness={0.78} />
      </EffectComposer>

      <FpsProbe onFps={onFps} />
    </Canvas>
  );
}

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Float,
  Lightformer,
  RoundedBox,
  Sparkles,
} from "@react-three/drei";
import type { Theme } from "../config";

/* "Holo-Core" — the Hyluxtic power source. An iridescent core suspended in a
   holographic gyroscope, sharing the projector-deck design language of the
   UNIT-01 stage. Deliberately rendered without post-processing so the hero
   stays light next to the main stage canvas. */

function Ring({
  radius,
  tilt,
  speed,
  color,
  opacity,
}: {
  radius: number;
  tilt: [number, number, number];
  speed: number;
  color: THREE.Color;
  opacity: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * speed;
  });
  return (
    <group rotation={tilt}>
      <mesh ref={ref}>
        <torusGeometry args={[radius, 0.016, 16, 128]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Satellites({ color }: { color: THREE.Color }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.rotation.y = t * 0.4;
    g.rotation.x = Math.sin(t * 0.2) * 0.25;
  });
  return (
    <group ref={ref}>
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 2.15, 0, Math.sin(angle) * 2.15]}>
            <sphereGeometry args={[0.05, 16, 16]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Branded face texture — a glowing "H" on dark glass, redrawn per theme. */
function useBrandTexture(color: string) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0b0616";
      ctx.fillRect(0, 0, 256, 256);
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.strokeRect(16, 16, 224, 224);
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 165px Archivo, 'Arial Black', sans-serif";
      ctx.shadowColor = color;
      ctx.shadowBlur = 34;
      ctx.fillStyle = color;
      ctx.fillText("H", 128, 138);
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.85;
      ctx.font = "900 150px Archivo, 'Arial Black', sans-serif";
      ctx.fillText("H", 128, 138);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [color]);
}

function Core({ theme }: { theme: Theme }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Group>(null);

  const accent = useMemo(() => new THREE.Color(theme.accent), [theme.accent]);
  const accent2 = useMemo(() => new THREE.Color(theme.accent2), [theme.accent2]);
  const hotAccent = useMemo(
    () => new THREE.Color(theme.accent).multiplyScalar(1.6),
    [theme.accent],
  );

  useFrame((state, delta) => {
    const core = coreRef.current;
    if (core) {
      core.rotation.y += delta * 0.25;
      core.rotation.x += delta * 0.1;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.03;
      core.scale.setScalar(pulse);
    }
    // Pointer parallax — the whole assembly leans toward the cursor.
    const g = groupRef.current;
    if (g) {
      const soft = 1 - Math.exp(-delta * 2.5);
      g.rotation.y += (state.pointer.x * 0.4 - g.rotation.y) * soft;
      g.rotation.x += (-state.pointer.y * 0.25 - g.rotation.x) * soft;
    }
  });

  const brandTexture = useBrandTexture(theme.accent);

  return (
    <group ref={groupRef}>
      <Float speed={1.6} rotationIntensity={0.15} floatIntensity={0.7}>
        {/* the $HLUX core — glowing branded cube */}
        <group ref={coreRef}>
          <RoundedBox args={[1.55, 1.55, 1.55]} radius={0.14} smoothness={4}>
            <meshBasicMaterial map={brandTexture} toneMapped={false} />
          </RoundedBox>
          {/* additive halo shell */}
          <mesh scale={1.12}>
            <boxGeometry args={[1.55, 1.55, 1.55]} />
            <meshBasicMaterial
              color={accent}
              transparent
              opacity={0.08}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
        {/* wireframe shell */}
        <mesh scale={1.5} rotation={[0.5, 0.7, 0.2]}>
          <icosahedronGeometry args={[1.05, 1]} />
          <meshBasicMaterial
            color={accent}
            wireframe
            transparent
            opacity={0.12}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {/* gyroscope rings */}
        <Ring radius={1.9} tilt={[Math.PI / 2.4, 0, 0]} speed={0.5} color={hotAccent} opacity={0.85} />
        <Ring radius={2.2} tilt={[Math.PI / 1.7, 0.5, 0]} speed={-0.32} color={accent2} opacity={0.5} />
        <Ring radius={2.5} tilt={[0.35, 0.2, 0.6]} speed={0.18} color={accent} opacity={0.3} />
        <Satellites color={accent2} />
      </Float>
      <Sparkles count={50} scale={[6, 6, 6]} size={1.8} speed={0.28} opacity={0.5} color={theme.accent} />
    </group>
  );
}

export function HeroOrnament({ theme }: { theme: Theme }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6.4], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 1.5]}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[-4, 3, 4]} intensity={26} color={theme.accent} />
      <pointLight position={[4, -2, 3]} intensity={18} color={theme.accent2} />
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2} color={theme.accent} position={[-4, 2, 3]} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={2} color={theme.accent2} position={[4, -1, 3]} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={1} color="#ffffff" position={[0, 5, -3]} scale={[8, 3, 1]} />
      </Environment>
      <Core theme={theme} />
    </Canvas>
  );
}

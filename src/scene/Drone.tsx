import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { ONE_SHOT, type Theme } from "../config";

/* UNIT-02 — a fully procedural hologram drone. No model file, no external
   asset: chassis built from primitives, an animated face screen drawn on a
   CanvasTexture, and gestures computed in code. Same contract as Robot.tsx
   (move / expression / onFinished / onTap), so the whole TRANSMIT + AI stack
   drives it unchanged. */

interface DroneProps {
  move: { clip: string; nonce: number };
  expression: string;
  theme: Theme;
  talking?: boolean;
  onFinished: () => void;
  onTap: () => void;
}

/* one-shot gesture durations in seconds */
const DURATIONS: Record<string, number> = {
  Wave: 1.7,
  Yes: 1.3,
  No: 1.3,
  ThumbsUp: 1.5,
  Punch: 1.0,
  Jump: 1.2,
  Death: 2.6,
};

const HOVER_Y = 1.78; // torso center height above the projector ring

/* ---------- face screen ---------- */

type FaceState = "Neutral" | "Angry" | "Surprised" | "Sad" | "Off";

function drawFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: FaceState,
  color: string,
  t: number,
  pupilX: number,
  pupilY: number,
  talking: boolean,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#020509";
  ctx.fillRect(0, 0, w, h);
  if (state === "Off") {
    // faint static line — powered down
    ctx.strokeStyle = "rgba(120,140,180,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h / 2);
    ctx.lineTo(w * 0.8, h / 2);
    ctx.stroke();
    return;
  }

  const blinkPhase = t % 3.7;
  const blinking = blinkPhase > 3.55;
  const cx = w / 2 + pupilX * w * 0.06;
  const cy = h * 0.42 + pupilY * h * 0.08;
  const gap = w * 0.17;
  const eyeW = w * 0.085;
  const eyeH = blinking ? h * 0.04 : h * 0.3;

  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";

  const eye = (ex: number) => {
    if (state === "Surprised" && !blinking) {
      ctx.beginPath();
      ctx.arc(ex, cy, eyeW * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#020509";
      ctx.beginPath();
      ctx.arc(ex, cy, eyeW * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      return;
    }
    if (state === "Sad" && !blinking) {
      ctx.beginPath();
      ctx.ellipse(ex, cy + h * 0.05, eyeW * 0.8, eyeH * 0.32, 0, 0, Math.PI, false);
      ctx.fill();
      return;
    }
    // neutral / angry: rounded vertical bars
    const hh = eyeH;
    ctx.beginPath();
    ctx.roundRect(ex - eyeW / 2, cy - hh / 2, eyeW, hh, eyeW / 2);
    ctx.fill();
    if (state === "Angry" && !blinking) {
      // slanted brow cutting the top of each eye
      ctx.fillStyle = "#020509";
      ctx.beginPath();
      const dir = ex < cx ? 1 : -1;
      ctx.moveTo(ex - eyeW, cy - hh * 0.7);
      ctx.lineTo(ex + eyeW, cy - hh * 0.7 + dir * hh * 0.55);
      ctx.lineTo(ex + eyeW, cy - hh);
      ctx.lineTo(ex - eyeW, cy - hh);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
    }
  };
  eye(cx - gap);
  eye(cx + gap);

  // mouth
  const my = h * 0.74;
  ctx.lineWidth = h * 0.045;
  ctx.beginPath();
  if (talking) {
    // animated speech bars — the unit is talking
    const open = Math.abs(Math.sin(t * 11)) * 0.6 + Math.abs(Math.sin(t * 17)) * 0.4;
    const mw = w * 0.14;
    const mh = h * (0.05 + open * 0.16);
    ctx.roundRect(cx - mw / 2, my - mh / 2, mw, mh, Math.min(mw, mh) / 2);
    ctx.fill();
  } else if (state === "Surprised") {
    ctx.arc(cx, my, w * 0.035, 0, Math.PI * 2);
    ctx.stroke();
  } else if (state === "Sad") {
    ctx.arc(cx, my + h * 0.09, w * 0.08, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (state === "Angry") {
    ctx.moveTo(cx - w * 0.07, my + h * 0.03);
    ctx.lineTo(cx + w * 0.07, my - h * 0.01);
    ctx.stroke();
  } else {
    // neutral: gentle smile that subtly "breathes"
    const smile = 0.2 + Math.sin(t * 0.9) * 0.04;
    ctx.arc(cx, my - h * 0.06, w * 0.09, Math.PI * smile, Math.PI * (1 - smile));
    ctx.stroke();
  }
}

/* ---------- drone ---------- */

export function Drone({
  move,
  expression,
  theme,
  talking = false,
  onFinished,
  onTap,
}: DroneProps) {
  const rootRef = useRef<THREE.Group>(null); // lean/parallax
  const bodyRef = useRef<THREE.Group>(null); // hover + gesture translation
  const headRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const foreLRef = useRef<THREE.Group>(null);
  const foreRRef = useRef<THREE.Group>(null);
  const thrusterRef = useRef<THREE.Mesh>(null);
  const antennaTipRef = useRef<THREE.Mesh>(null);

  /* gesture clock */
  const gesture = useRef({ clip: "Idle", nonce: 0, start: 0, finished: false });
  const clockRef = useRef(0);
  useEffect(() => {
    gesture.current = {
      clip: move.clip,
      nonce: move.nonce,
      start: clockRef.current,
      finished: false,
    };
  }, [move.clip, move.nonce]);

  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  /* materials — same two-tone language as UNIT-01 */
  const materials = useMemo(() => {
    const shell = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(theme.body),
      metalness: 0.85,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
      iridescence: 0.85,
      iridescenceIOR: 1.6,
      emissive: new THREE.Color(theme.emissive),
      emissiveIntensity: 0.5,
      envMapIntensity: 2.0,
      flatShading: true,
    });
    const frame = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#141924"),
      metalness: 1,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.4,
      envMapIntensity: 1.5,
    });
    const glow = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.eyes),
      toneMapped: false,
    });
    const beam = new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.accent),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return { shell, frame, glow, beam };
  }, [theme]);

  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials],
  );

  /* face screen texture */
  const face = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    return { canvas, texture, material };
  }, []);

  useEffect(
    () => () => {
      face.texture.dispose();
      face.material.dispose();
    },
    [face],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    clockRef.current = t;
    const g = gesture.current;
    const gt = t - g.start; // local gesture time
    const clip = g.clip;
    const isDead = clip === "Death";

    /* one-shot completion */
    const dur = DURATIONS[clip];
    if (dur !== undefined && ONE_SHOT.has(clip) && !g.finished && gt >= dur) {
      g.finished = true;
      onFinishedRef.current();
    }

    /* ---- compute pose targets ---- */
    let bodyY = Math.sin(t * 1.8) * 0.08; // hover bob
    let bodyX = 0;
    let bodyZ = 0;
    let rotY = 0;
    let rotX = 0;
    let rotZ = 0;
    let headX = 0;
    let headY = 0;
    // rest arm pose
    let armRz = -0.18;
    let armRx = 0.12;
    let armLz = 0.18;
    let armLx = 0.12;
    let foreR = 0.3;
    let foreL = 0.3;

    const ease = (k: number) => 1 - Math.exp(-delta * k);

    switch (clip) {
      case "Wave": {
        const w = Math.min(gt * 4, 1);
        armRz = -0.18 - w * 2.15;
        foreR = 0.4 + Math.sin(gt * 11) * 0.55 * w;
        headX = -0.08 * w;
        rotZ = 0.06 * w;
        break;
      }
      case "Yes":
        headX = Math.sin(gt * 8) * 0.34 * Math.exp(-gt * 0.9);
        break;
      case "No":
        headY = Math.sin(gt * 8) * 0.45 * Math.exp(-gt * 0.9);
        break;
      case "ThumbsUp": {
        const w = Math.min(gt * 5, 1);
        armRz = -0.18 - w * 1.1;
        armRx = 0.12 - w * 0.9;
        foreR = 0.3 + w * 1.4;
        rotX = -0.06 * w;
        bodyY += 0.06 * Math.sin(Math.min(gt * 3, Math.PI));
        break;
      }
      case "Punch": {
        const p = Math.sin(Math.min(gt / 0.9, 1) * Math.PI);
        armRx = 0.12 - p * 1.7;
        foreR = 0.3 + p * 0.2;
        bodyZ = p * 0.35;
        rotY = -p * 0.25;
        break;
      }
      case "Jump": {
        const p = Math.sin(Math.min(gt / 1.1, 1) * Math.PI);
        bodyY += p * 0.85;
        armRz = -0.18 - p * 0.7;
        armLz = 0.18 + p * 0.7;
        rotX = -p * 0.12;
        break;
      }
      case "Dance": {
        bodyY += Math.sin(gt * 6) * 0.14;
        rotY = Math.sin(gt * 3) * 0.45;
        rotZ = Math.sin(gt * 6) * 0.09;
        armRz = -0.4 + Math.sin(gt * 6) * 0.8;
        armLz = 0.4 + Math.sin(gt * 6 + Math.PI) * 0.8;
        foreR = 0.8 + Math.sin(gt * 12) * 0.3;
        foreL = 0.8 + Math.cos(gt * 12) * 0.3;
        headY = Math.sin(gt * 3) * 0.2;
        break;
      }
      case "Walking": {
        bodyX = Math.sin(gt * 0.85) * 0.9;
        rotY = Math.cos(gt * 0.85) * 0.55;
        rotZ = -Math.cos(gt * 0.85) * 0.07;
        armRx = 0.12 + Math.sin(gt * 2.2) * 0.18;
        armLx = 0.12 - Math.sin(gt * 2.2) * 0.18;
        break;
      }
      case "Running": {
        bodyX = Math.sin(gt * 1.7) * 1.15;
        rotY = Math.cos(gt * 1.7) * 0.7;
        rotX = 0.22;
        rotZ = -Math.cos(gt * 1.7) * 0.12;
        armRx = -0.3;
        armLx = -0.3;
        foreR = 1.0;
        foreL = 1.0;
        break;
      }
      case "Death": {
        const p = Math.min(gt / 1.7, 1);
        const s = p * p * (3 - 2 * p); // smoothstep
        bodyY = Math.sin(t * 1.8) * 0.08 * (1 - s) - s * 1.32;
        rotX = s * 0.28;
        rotZ = s * 0.18;
        headX = s * 0.6;
        armRz = -0.18 + s * 0.12;
        armLz = 0.18 - s * 0.12;
        armRx = 0.12 + s * 0.75;
        armLx = 0.12 + s * 0.75;
        foreR = 0.3 - s * 0.25;
        foreL = 0.3 - s * 0.25;
        break;
      }
      default: {
        // Idle — occasional glance around
        headY = Math.sin(t * 0.45) * 0.14;
        headX = Math.sin(t * 0.3) * 0.05;
      }
    }

    /* ---- apply with damping ---- */
    const body = bodyRef.current;
    if (body) {
      body.position.y += (bodyY - body.position.y) * ease(8);
      body.position.x += (bodyX - body.position.x) * ease(4);
      body.position.z += (bodyZ - body.position.z) * ease(10);
      body.rotation.y += (rotY - body.rotation.y) * ease(5);
      body.rotation.x += (rotX - body.rotation.x) * ease(6);
      body.rotation.z += (rotZ - body.rotation.z) * ease(6);
    }
    const head = headRef.current;
    if (head) {
      head.rotation.x += (headX - head.rotation.x) * ease(9);
      head.rotation.y += (headY - head.rotation.y) * ease(9);
    }
    const damp = (ref: React.RefObject<THREE.Group | null>, x: number, z: number) => {
      const j = ref.current;
      if (!j) return;
      j.rotation.x += (x - j.rotation.x) * ease(9);
      j.rotation.z += (z - j.rotation.z) * ease(9);
    };
    damp(armRRef, armRx, armRz);
    damp(armLRef, armLx, armLz);
    const fr = foreRRef.current;
    if (fr) fr.rotation.x += (-foreR - fr.rotation.x) * ease(9);
    const fl = foreLRef.current;
    if (fl) fl.rotation.x += (-foreL - fl.rotation.x) * ease(9);

    /* lean toward cursor (root), suppressed while dead */
    const root = rootRef.current;
    if (root) {
      const soft = ease(3);
      const tx = isDead ? 0 : state.pointer.x * 0.3;
      const ty = isDead ? 0 : -state.pointer.y * 0.07;
      root.rotation.y += (tx - root.rotation.y) * soft;
      root.rotation.x += (ty - root.rotation.x) * soft;
    }

    /* thruster + antenna pulse; fade out when dead */
    const deadFade = isDead ? Math.max(0, 1 - gt / 1.2) : 1;
    const thr = thrusterRef.current;
    if (thr) {
      (thr.material as THREE.MeshBasicMaterial).opacity =
        (0.22 + Math.sin(t * 7) * 0.1) * deadFade;
      thr.scale.y = 1 + Math.sin(t * 9) * 0.15;
    }
    const tip = antennaTipRef.current;
    if (tip) {
      const s = (0.8 + Math.sin(t * 4) * 0.25) * (isDead ? 0.25 : 1);
      tip.scale.setScalar(s);
    }

    /* face screen (redrawn every other frame) */
    if (Math.floor(t * 30) % 2 === 0) {
      const ctx = face.canvas.getContext("2d");
      if (ctx) {
        const faceState: FaceState = isDead
          ? "Off"
          : (["Neutral", "Angry", "Surprised", "Sad"].includes(expression)
              ? (expression as FaceState)
              : "Neutral");
        drawFace(
          ctx,
          face.canvas.width,
          face.canvas.height,
          faceState,
          theme.eyes,
          t,
          state.pointer.x,
          state.pointer.y,
          talking && !isDead,
        );
        face.texture.needsUpdate = true;
      }
    }
  });

  return (
    <group ref={rootRef} position={[0, HOVER_Y, 0]}>
      <group
        ref={bodyRef}
        onClick={(e) => {
          e.stopPropagation();
          onTap();
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "auto";
        }}
      >
        {/* head */}
        <group ref={headRef} position={[0, 0.78, 0]}>
          <mesh material={materials.shell}>
            <boxGeometry args={[1.0, 0.62, 0.62]} />
          </mesh>
          {/* face bezel + screen */}
          <mesh position={[0, 0, 0.315]} material={materials.frame}>
            <boxGeometry args={[0.84, 0.48, 0.02]} />
          </mesh>
          <mesh position={[0, 0, 0.33]} material={face.material}>
            <planeGeometry args={[0.76, 0.4]} />
          </mesh>
          {/* ear pods */}
          <mesh position={[-0.54, 0, 0]} material={materials.frame}>
            <cylinderGeometry args={[0.1, 0.1, 0.1, 16]} />
          </mesh>
          <mesh position={[0.54, 0, 0]} material={materials.frame}>
            <cylinderGeometry args={[0.1, 0.1, 0.1, 16]} />
          </mesh>
          {/* antenna */}
          <mesh position={[0.3, 0.42, 0]} material={materials.frame}>
            <cylinderGeometry args={[0.015, 0.015, 0.24, 8]} />
          </mesh>
          <mesh ref={antennaTipRef} position={[0.3, 0.56, 0]} material={materials.glow}>
            <sphereGeometry args={[0.045, 12, 12]} />
          </mesh>
        </group>

        {/* torso — faceted, tapering to a hologram tip */}
        <mesh position={[0, 0, 0]} material={materials.shell}>
          <cylinderGeometry args={[0.52, 0.3, 0.72, 8]} />
        </mesh>
        {/* chest core light */}
        <mesh position={[0, 0.05, 0.28]} material={materials.glow}>
          <circleGeometry args={[0.07, 16]} />
        </mesh>
        {/* collar */}
        <mesh position={[0, 0.42, 0]} material={materials.frame}>
          <cylinderGeometry args={[0.4, 0.52, 0.12, 8]} />
        </mesh>
        {/* waist segments */}
        <mesh position={[0, -0.5, 0]} material={materials.frame}>
          <cylinderGeometry args={[0.24, 0.14, 0.22, 8]} />
        </mesh>
        <mesh position={[0, -0.74, 0]} material={materials.shell}>
          <cylinderGeometry args={[0.13, 0.05, 0.24, 8]} />
        </mesh>
        {/* glowing waist ring */}
        <mesh position={[0, -0.38, 0]} rotation-x={Math.PI / 2} material={materials.glow}>
          <torusGeometry args={[0.27, 0.02, 8, 32]} />
        </mesh>
        {/* thruster beam */}
        <mesh ref={thrusterRef} position={[0, -1.12, 0]} material={materials.beam}>
          <coneGeometry args={[0.16, 0.55, 12, 1, true]} />
        </mesh>

        {/* arms */}
        <group ref={armRRef} position={[-0.66, 0.3, 0]}>
          <mesh material={materials.frame}>
            <sphereGeometry args={[0.13, 12, 12]} />
          </mesh>
          <mesh position={[0, -0.26, 0]} material={materials.shell}>
            <capsuleGeometry args={[0.085, 0.3, 4, 10]} />
          </mesh>
          <group ref={foreRRef} position={[0, -0.5, 0]}>
            <mesh position={[0, -0.16, 0]} material={materials.frame}>
              <capsuleGeometry args={[0.07, 0.24, 4, 10]} />
            </mesh>
            <mesh position={[0, -0.37, 0]} material={materials.shell}>
              <sphereGeometry args={[0.11, 12, 12]} />
            </mesh>
          </group>
        </group>
        <group ref={armLRef} position={[0.66, 0.3, 0]}>
          <mesh material={materials.frame}>
            <sphereGeometry args={[0.13, 12, 12]} />
          </mesh>
          <mesh position={[0, -0.26, 0]} material={materials.shell}>
            <capsuleGeometry args={[0.085, 0.3, 4, 10]} />
          </mesh>
          <group ref={foreLRef} position={[0, -0.5, 0]}>
            <mesh position={[0, -0.16, 0]} material={materials.frame}>
              <capsuleGeometry args={[0.07, 0.24, 4, 10]} />
            </mesh>
            <mesh position={[0, -0.37, 0]} material={materials.shell}>
              <sphereGeometry args={[0.11, 12, 12]} />
            </mesh>
          </group>
        </group>
      </group>

      {/* ambient particles around the drone */}
      <Sparkles count={24} scale={[2.6, 2.2, 2.6]} size={1.6} speed={0.3} opacity={0.5} color={theme.accent} />
    </group>
  );
}

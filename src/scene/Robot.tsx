import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { ONE_SHOT, type Theme } from "../config";

interface RobotProps {
  move: { clip: string; nonce: number };
  expression: string;
  theme: Theme;
  onFinished: () => void;
  onTap: () => void;
}

const ROBOT_HEIGHT = 3.1;

export function Robot({ move, expression, theme, onFinished, onTap }: RobotProps) {
  const leanRef = useRef<THREE.Group>(null);
  const rigRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/robot.glb");
  const { actions, mixer } = useAnimations(animations, rigRef);

  // Capture each mesh's factory material name once, before any override.
  const originalMaterialName = useMemo(() => {
    const map = new Map<string, string>();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        map.set(mesh.uuid, mesh.material.name);
      }
    });
    return map;
  }, [scene]);

  // Normalize once: scale to a known height, feet on the floor, centered.
  useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    scene.scale.setScalar(ROBOT_HEIGHT / size.y);
    scene.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(scene);
    const center = scaled.getCenter(new THREE.Vector3());
    scene.position.x -= center.x;
    scene.position.z -= center.z;
    scene.position.y -= scaled.min.y;
  }, [scene]);

  // Two-tone physically-based hologram materials, re-tinted per theme.
  const materials = useMemo(() => {
    const shell = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(theme.body),
      metalness: 0.85,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
      iridescence: 0.85,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [120, 480],
      emissive: new THREE.Color(theme.emissive),
      emissiveIntensity: 0.5,
      envMapIntensity: 2.0,
    });
    const frame = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#141924"),
      metalness: 1,
      roughness: 0.32,
      clearcoat: 0.6,
      clearcoatRoughness: 0.4,
      envMapIntensity: 1.5,
    });
    // Face plate + joints: dark glass that glows — bloom picks this up.
    const glow = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#04060a"),
      metalness: 0.7,
      roughness: 0.35,
      emissive: new THREE.Color(theme.eyes),
      emissiveIntensity: 1.7,
      envMapIntensity: 1.2,
    });
    return { shell, frame, glow };
  }, [theme]);

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = originalMaterialName.get(mesh.uuid);
      mesh.material =
        name === "Main"
          ? materials.shell
          : name === "Black"
            ? materials.glow
            : materials.frame;
    });
  }, [scene, materials, originalMaterialName]);

  useEffect(
    () => () => {
      materials.shell.dispose();
      materials.frame.dispose();
      materials.glow.dispose();
    },
    [materials],
  );

  // Play the requested clip; one-shots clamp and report back, loops run forever.
  useEffect(() => {
    const action = actions[move.clip];
    if (!action) return;
    action.reset().fadeIn(0.3).play();
    if (ONE_SHOT.has(move.clip)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    return () => {
      action.fadeOut(0.3);
    };
  }, [move.clip, move.nonce, actions]);

  const moveRef = useRef(move.clip);
  moveRef.current = move.clip;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    const handle = () => {
      if (ONE_SHOT.has(moveRef.current)) onFinishedRef.current();
    };
    mixer.addEventListener("finished", handle);
    return () => mixer.removeEventListener("finished", handle);
  }, [mixer]);

  // Facial morph targets, eased toward the selected expression.
  const morphMeshes = useMemo(() => {
    const list: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        list.push(mesh);
      }
    });
    return list;
  }, [scene]);

  useFrame((state, delta) => {
    const ease = 1 - Math.exp(-delta * 8);
    for (const mesh of morphMeshes) {
      const dict = mesh.morphTargetDictionary;
      const influences = mesh.morphTargetInfluences;
      if (!dict || !influences) continue;
      for (const [name, index] of Object.entries(dict)) {
        const current = influences[index] ?? 0;
        const target = name === expression ? 1 : 0;
        influences[index] = current + (target - current) * ease;
      }
    }

    // Subtle whole-body lean toward the cursor — the unit notices you.
    const lean = leanRef.current;
    if (lean) {
      const soft = 1 - Math.exp(-delta * 3);
      lean.rotation.y += (state.pointer.x * 0.3 - lean.rotation.y) * soft;
      lean.rotation.x += (-state.pointer.y * 0.07 - lean.rotation.x) * soft;
    }
  });

  return (
    <group ref={leanRef}>
      <group ref={rigRef}>
        <primitive
          object={scene}
          onClick={(e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            onTap();
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        />
      </group>
    </group>
  );
}

useGLTF.preload("/robot.glb");

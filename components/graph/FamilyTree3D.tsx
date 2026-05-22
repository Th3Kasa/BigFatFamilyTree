"use client";

import { useMemo, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useLoader, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type {
  PersonInput,
  RelationshipInput,
} from "@/lib/graph/transform";

type Props = {
  people: PersonInput[];
  relationships: RelationshipInput[];
  lang: "ar" | "en";
};

type Vec3 = [number, number, number];

function display(p: PersonInput, lang: "ar" | "en") {
  return (
    (lang === "ar"
      ? p.given_ar ?? p.given_en
      : p.given_en ?? p.given_ar) ?? "?"
  );
}

function familyOf(p: PersonInput, lang: "ar" | "en") {
  return (
    (lang === "ar"
      ? p.family_name_ar ?? p.family_name_en
      : p.family_name_en ?? p.family_name_ar) ?? ""
  );
}

function initialsOf(p: PersonInput, lang: "ar" | "en") {
  const g = display(p, lang);
  const f = familyOf(p, lang);
  return (
    (g.charAt(0) || "?").toUpperCase() + ((f.charAt(0) || "")).toUpperCase()
  );
}

/**
 * Compute generation depth for every person via BFS from roots
 * (people who have no parents in the dataset).
 */
function computeGenerations(people: PersonInput[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const idSet = new Set(byId.keys());
  const generation = new Map<string, number>();

  const roots = people.filter(
    (p) =>
      (!p.father_id || !idSet.has(p.father_id)) &&
      (!p.mother_id || !idSet.has(p.mother_id)),
  );

  type QItem = { id: string; gen: number };
  const queue: QItem[] = roots.map((r) => ({ id: r.id, gen: 0 }));

  // Children index for fast lookup
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    for (const parent of [p.father_id, p.mother_id]) {
      if (!parent || !idSet.has(parent)) continue;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(p.id);
    }
  }

  while (queue.length) {
    const { id, gen } = queue.shift()!;
    const existing = generation.get(id);
    if (existing !== undefined && existing <= gen) continue;
    generation.set(id, gen);
    const kids = childrenOf.get(id) ?? [];
    for (const cid of kids) queue.push({ id: cid, gen: gen + 1 });
  }

  // Fallback for people whose ancestors are missing
  for (const p of people) {
    if (!generation.has(p.id)) generation.set(p.id, 0);
  }
  return generation;
}

/**
 * Compute 3D positions: generations stack on Y, people within a generation
 * arranged on a ring in X/Z plane (sphere-ish overall feel).
 */
function computePositions(people: PersonInput[]): Map<string, Vec3> {
  const generation = computeGenerations(people);
  const byGen = new Map<number, PersonInput[]>();
  for (const p of people) {
    const g = generation.get(p.id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(p);
  }

  const positions = new Map<string, Vec3>();
  const generations = [...byGen.keys()].sort((a, b) => a - b);

  for (const g of generations) {
    const members = byGen.get(g)!;
    const count = members.length;
    const radius = Math.max(2, count * 0.9);
    members.forEach((p, idx) => {
      const angle = (idx / Math.max(count, 1)) * Math.PI * 2;
      // Stagger Z slightly with a phase shift per generation to break flatness
      const phaseShift = g * 0.4;
      const x = Math.cos(angle + phaseShift) * radius;
      const z = Math.sin(angle + phaseShift) * radius * 0.65;
      const y = -g * 3.2;
      positions.set(p.id, [x, y, z]);
    });
  }

  return positions;
}

function PortraitBillboard({
  person,
  position,
  lang,
  onClick,
}: {
  person: PersonInput;
  position: Vec3;
  lang: "ar" | "en";
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Make the photo plane always face the camera
  useFrame(({ camera }) => {
    if (groupRef.current) groupRef.current.quaternion.copy(camera.quaternion);
  });

  return (
    <group position={position} ref={groupRef} onClick={onClick}>
      {/* Background ring colored by gender */}
      <mesh ref={meshRef}>
        <circleGeometry args={[0.95, 32]} />
        <meshBasicMaterial
          color={
            person.gender === "f"
              ? "#fda4af"
              : person.gender === "m"
                ? "#e36a36"
                : "#cbb4a8"
          }
          transparent
          opacity={0.85}
        />
      </mesh>
      <Suspense fallback={null}>
        {person.photo_url ? (
          <PhotoPlane url={person.photo_url} />
        ) : (
          <InitialsPlane initials={initialsOf(person, lang)} />
        )}
      </Suspense>

      <Html
        position={[0, -1.15, 0]}
        center
        distanceFactor={10}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="whitespace-nowrap rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-md"
          style={{
            color: "oklch(0.18 0.04 15)",
            fontFamily: "var(--font-display)",
          }}
        >
          {display(person, lang)}
        </div>
      </Html>
    </group>
  );
}

function PhotoPlane({ url }: { url: string }) {
  // Three's TextureLoader handles same-origin images. Public Supabase URLs work.
  const tex = useLoader(THREE.TextureLoader, url);
  return (
    <mesh>
      <circleGeometry args={[0.8, 48]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function InitialsPlane({ initials }: { initials: string }) {
  return (
    <>
      <mesh>
        <circleGeometry args={[0.8, 48]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <Html
        center
        style={{ pointerEvents: "none" }}
        distanceFactor={8}
      >
        <span
          className="text-base font-semibold"
          style={{ color: "oklch(0.34 0.13 18)", fontFamily: "var(--font-display)" }}
        >
          {initials}
        </span>
      </Html>
    </>
  );
}

function Edge3D({ from, to, color, dashed }: { from: Vec3; to: Vec3; color: string; dashed?: boolean }) {
  return (
    <Line
      points={[from, to]}
      color={color}
      lineWidth={1.4}
      dashed={dashed}
      dashSize={0.25}
      gapSize={0.18}
      transparent
      opacity={0.55}
    />
  );
}

export function FamilyTree3D({ people, relationships, lang }: Props) {
  const router = useRouter();

  const positions = useMemo(() => computePositions(people), [people]);

  const visiblePeople = useMemo(
    () => people.filter((p) => !p.is_placeholder),
    [people],
  );

  const parentEdges = useMemo(() => {
    const out: { from: Vec3; to: Vec3; key: string }[] = [];
    for (const p of visiblePeople) {
      const pPos = positions.get(p.id);
      if (!pPos) continue;
      for (const parentId of [p.father_id, p.mother_id]) {
        if (!parentId) continue;
        const parentPos = positions.get(parentId);
        if (!parentPos) continue;
        out.push({ from: parentPos, to: pPos, key: `pc-${parentId}-${p.id}` });
      }
    }
    return out;
  }, [visiblePeople, positions]);

  const spouseEdges = useMemo(() => {
    const out: {
      from: Vec3;
      to: Vec3;
      key: string;
      status: "current" | "divorced" | "widowed";
    }[] = [];
    for (const r of relationships) {
      if (r.type !== "spouse") continue;
      const a = positions.get(r.person_a_id);
      const b = positions.get(r.person_b_id);
      if (!a || !b) continue;
      out.push({
        from: a,
        to: b,
        key: `sp-${r.id}`,
        status: (r.status ?? "current") as "current" | "divorced" | "widowed",
      });
    }
    return out;
  }, [relationships, positions]);

  function gotoPerson(p: PersonInput) {
    router.push(`/person/${p.slug ?? p.id}`);
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 18], fov: 50 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: "100%", height: "100%" }}
    >
      <color attach="background" args={["#fbf6ee"]} />
      <fog attach="fog" args={["#fbf6ee", 25, 60]} />

      <ambientLight intensity={0.85} />
      <directionalLight position={[5, 10, 5]} intensity={0.6} />
      <pointLight position={[-10, -10, -10]} intensity={0.25} color="#e36a36" />

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate={false}
        zoomSpeed={0.7}
        panSpeed={0.6}
        rotateSpeed={0.6}
        minDistance={4}
        maxDistance={60}
        makeDefault
      />

      {/* Parent-child edges in burgundy */}
      {parentEdges.map((e) => (
        <Edge3D key={e.key} from={e.from} to={e.to} color="#7a1f3d" />
      ))}

      {/* Spouse edges in rose, dashed for divorced */}
      {spouseEdges.map((e) => (
        <Edge3D
          key={e.key}
          from={e.from}
          to={e.to}
          color={e.status === "current" ? "#c93d5a" : "#a8a098"}
          dashed={e.status !== "current"}
        />
      ))}

      {/* Person portraits */}
      {visiblePeople.map((p) => {
        const pos = positions.get(p.id);
        if (!pos) return null;
        return (
          <PortraitBillboard
            key={p.id}
            person={p}
            position={pos}
            lang={lang}
            onClick={() => gotoPerson(p)}
          />
        );
      })}
    </Canvas>
  );
}

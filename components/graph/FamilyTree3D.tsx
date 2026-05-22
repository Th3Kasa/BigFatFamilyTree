"use client";

import {
  useMemo,
  useRef,
  useState,
  useEffect,
  Suspense,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { Canvas, useLoader, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
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
type LivePositions = Map<string, THREE.Vector3>;

const EDGE_SEGMENTS = 32;
// Click is treated as "drag" once the pointer moves more than this many px
const DRAG_THRESHOLD_PX = 6;

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

function computeGenerations(people: PersonInput[]) {
  const idSet = new Set(people.map((p) => p.id));
  const generation = new Map<string, number>();
  const roots = people.filter(
    (p) =>
      (!p.father_id || !idSet.has(p.father_id)) &&
      (!p.mother_id || !idSet.has(p.mother_id)),
  );
  const childrenOf = new Map<string, string[]>();
  for (const p of people) {
    for (const parent of [p.father_id, p.mother_id]) {
      if (!parent || !idSet.has(parent)) continue;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(p.id);
    }
  }
  type QItem = { id: string; gen: number };
  const queue: QItem[] = roots.map((r) => ({ id: r.id, gen: 0 }));
  while (queue.length) {
    const { id, gen } = queue.shift()!;
    const existing = generation.get(id);
    if (existing !== undefined && existing <= gen) continue;
    generation.set(id, gen);
    const kids = childrenOf.get(id) ?? [];
    for (const cid of kids) queue.push({ id: cid, gen: gen + 1 });
  }
  for (const p of people) if (!generation.has(p.id)) generation.set(p.id, 0);
  return generation;
}

/**
 * Top-down family-tree layout in 3D.
 *
 * - Generations stack on the Y axis (grandparents top → grandchildren below).
 * - Within a generation, members are sorted so siblings stay adjacent,
 *   spouses cluster next to each other, and children sit roughly below the
 *   midpoint of their parents.
 * - Slight Z zig-zag per generation breaks the flat look without
 *   sacrificing readability.
 */
function computeInitialPositions(people: PersonInput[]): Map<string, Vec3> {
  const generation = computeGenerations(people);
  const byGen = new Map<number, PersonInput[]>();
  for (const p of people) {
    const g = generation.get(p.id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(p);
  }

  const positions = new Map<string, Vec3>();
  const generations = [...byGen.keys()].sort((a, b) => a - b);
  const SPACING_X = 3.2;
  const SPACING_Y = 4.4;

  // First pass: place root generation in declaration order
  for (const g of generations) {
    const members = byGen.get(g)!;
    // Sort so children fall under their parent midpoints when their parents
    // are already positioned. For the root generation this is just declaration order.
    members.sort((a, b) => {
      const ax = avgParentX(a, positions);
      const bx = avgParentX(b, positions);
      if (ax !== null && bx !== null) return ax - bx;
      if (ax !== null) return -1;
      if (bx !== null) return 1;
      // Stable fallback by name so layout is deterministic
      const aName = (a.given_en ?? a.given_ar ?? a.id).toLowerCase();
      const bName = (b.given_en ?? b.given_ar ?? b.id).toLowerCase();
      return aName.localeCompare(bName);
    });

    const count = members.length;
    const startX = -((count - 1) * SPACING_X) / 2;
    members.forEach((p, idx) => {
      const x = startX + idx * SPACING_X;
      const y = -g * SPACING_Y;
      // Small Z zig-zag for depth — even generations forward, odd back
      const z = g % 2 === 0 ? 0.4 : -0.4;
      positions.set(p.id, [x, y, z]);
    });
  }
  return positions;
}

function avgParentX(
  p: PersonInput,
  positions: Map<string, Vec3>,
): number | null {
  const xs: number[] = [];
  if (p.father_id) {
    const v = positions.get(p.father_id);
    if (v) xs.push(v[0]);
  }
  if (p.mother_id) {
    const v = positions.get(p.mother_id);
    if (v) xs.push(v[0]);
  }
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Constellation node: a small bright sphere + halo + bloom-friendly emissive.
 * Photo / initials only appear on hover or selection.
 */
function ConstellationNode({
  person,
  livePositionsRef,
  lang,
  selected,
  onSelect,
  onActivate,
  pointerRef,
  setOrbitEnabled,
}: {
  person: PersonInput;
  livePositionsRef: React.MutableRefObject<LivePositions>;
  lang: "ar" | "en";
  selected: boolean;
  onSelect: (id: string) => void;
  /** Treats this as a "real" tap — open profile. Only fires for clean clicks (no drag). */
  onActivate: () => void;
  pointerRef: React.MutableRefObject<THREE.Vector3 | null>;
  setOrbitEnabled: (b: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const seed = useRef(Math.random() * Math.PI * 2);
  const basePos = useRef<THREE.Vector3>(
    livePositionsRef.current.get(person.id)?.clone() ?? new THREE.Vector3(),
  );
  const currentPos = useRef<THREE.Vector3>(basePos.current.clone());
  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);
  // Track screen movement during a pointer-down→up so we can suppress click after drag
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const didMove = useRef(false);

  const { camera, gl, raycaster } = useThree();
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const dragOffset = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  // Brand palette — match the logo (burgundy / orange-coral / rose)
  const accent =
    person.gender === "f"
      ? "#c93d5a"     // logo rose
      : person.gender === "m"
        ? "#e36a36"   // logo orange-coral
        : "#7a1f3d";  // logo burgundy

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (!isDragging.current) {
      const t = state.clock.getElapsedTime() + seed.current;
      const bobY = Math.sin(t * 0.7) * 0.05;
      const wobbleX = Math.cos(t * 0.5) * 0.04;

      let cursorOffsetX = 0;
      let cursorOffsetY = 0;
      const ptr = pointerRef.current;
      if (ptr) {
        const dx = ptr.x - basePos.current.x;
        const dy = ptr.y - basePos.current.y;
        const dist = Math.hypot(dx, dy);
        const range = 5;
        if (dist < range) {
          const influence = (1 - dist / range) * 0.15;
          cursorOffsetX = dx * influence;
          cursorOffsetY = dy * influence;
        }
      }

      const targetX = basePos.current.x + wobbleX + cursorOffsetX;
      const targetY = basePos.current.y + bobY + cursorOffsetY;
      const targetZ = basePos.current.z;

      const damp = Math.min(1, delta * 6);
      currentPos.current.x += (targetX - currentPos.current.x) * damp;
      currentPos.current.y += (targetY - currentPos.current.y) * damp;
      currentPos.current.z += (targetZ - currentPos.current.z) * damp;

      groupRef.current.position.copy(currentPos.current);
    }

    const live = livePositionsRef.current.get(person.id);
    if (live) live.copy(currentPos.current);

    groupRef.current.quaternion.copy(camera.quaternion);
  });

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      downAt.current = { x: e.clientX, y: e.clientY };
      didMove.current = false;
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      dragPlane.setFromNormalAndCoplanarPoint(camDir, currentPos.current);
      ndc.set(
        (e.clientX / gl.domElement.clientWidth) * 2 - 1,
        -(e.clientY / gl.domElement.clientHeight) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hitPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, hitPoint);
      dragOffset.copy(currentPos.current).sub(hitPoint);
      isDragging.current = true;
      setOrbitEnabled(false);
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [camera, dragOffset, dragPlane, gl, ndc, raycaster, setOrbitEnabled],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isDragging.current) return;
      e.stopPropagation();
      if (downAt.current) {
        const dx = e.clientX - downAt.current.x;
        const dy = e.clientY - downAt.current.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) didMove.current = true;
      }
      ndc.set(
        (e.clientX / gl.domElement.clientWidth) * 2 - 1,
        -(e.clientY / gl.domElement.clientHeight) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        const next = hitPoint.add(dragOffset);
        basePos.current.copy(next);
        currentPos.current.copy(next);
        if (groupRef.current) groupRef.current.position.copy(next);
        const live = livePositionsRef.current.get(person.id);
        if (live) live.copy(next);
      }
    },
    [camera, dragOffset, dragPlane, gl, ndc, raycaster, livePositionsRef, person.id],
  );

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isDragging.current) return;
      e.stopPropagation();
      isDragging.current = false;
      setOrbitEnabled(true);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      // Treat as a clean click only if pointer barely moved
      if (!didMove.current) {
        onSelect(person.id);
      }
      downAt.current = null;
    },
    [onSelect, person.id, setOrbitEnabled],
  );

  // Label appears on hover or when selected; the portrait itself is always shown.
  const showLabel = hovered || selected;
  const photoRadius = 0.55;

  return (
    <group
      ref={groupRef}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Outer glowing halo (gets bloomed) */}
      <mesh>
        <sphereGeometry args={[selected ? 1.05 : hovered ? 0.95 : 0.85, 24, 24]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={selected ? 0.35 : hovered ? 0.28 : 0.20}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Inner accent ring around the photo */}
      <mesh>
        <ringGeometry args={[photoRadius + 0.04, photoRadius + 0.14, 64]} />
        <meshBasicMaterial
          color={accent}
          transparent
          opacity={selected ? 0.95 : hovered ? 0.85 : 0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Photo (or initials) — always visible */}
      <Suspense fallback={
        <mesh>
          <circleGeometry args={[photoRadius, 48]} />
          <meshBasicMaterial color="#1a1014" />
        </mesh>
      }>
        {person.photo_url ? (
          <PhotoPlane url={person.photo_url} radius={photoRadius} />
        ) : (
          <InitialsPlane initials={initialsOf(person, lang)} accent={accent} radius={photoRadius} />
        )}
      </Suspense>

      {/* Name label — fixed screen size (no distanceFactor) so it stays readable */}
      <Html
        position={[0, -1.0, 0]}
        center
        style={{ pointerEvents: "none" }}
      >
        <div
          className="whitespace-nowrap rounded-full px-3 py-1 text-base font-semibold tracking-wide backdrop-blur-md"
          style={{
            background: showLabel ? "rgba(22, 14, 18, 0.92)" : "rgba(22, 14, 18, 0.78)",
            color: "#fbf6ee",
            border: `1px solid ${accent}${showLabel ? "cc" : "88"}`,
            boxShadow: `0 0 ${showLabel ? "24px" : "14px"} ${accent}${showLabel ? "aa" : "66"}`,
            fontFamily: "var(--font-display)",
            fontSize: 16,
            letterSpacing: "0.01em",
            transition: "all 200ms ease-out",
          }}
        >
          {display(person, lang)}
        </div>
      </Html>
    </group>
  );
}

function PhotoPlane({ url, radius = 0.55 }: { url: string; radius?: number }) {
  const tex = useLoader(THREE.TextureLoader, url);
  return (
    <mesh>
      <circleGeometry args={[radius, 64]} />
      {/* toneMapped:true keeps faces sharp instead of getting blown out by Bloom */}
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function InitialsPlane({
  initials,
  accent,
  radius = 0.55,
}: {
  initials: string;
  accent: string;
  radius?: number;
}) {
  return (
    <>
      <mesh>
        <circleGeometry args={[radius, 64]} />
        <meshBasicMaterial color="#1a1014" />
      </mesh>
      <Html center style={{ pointerEvents: "none" }} distanceFactor={9}>
        <span
          className="text-sm font-semibold"
          style={{ color: accent, fontFamily: "var(--font-display)" }}
        >
          {initials}
        </span>
      </Html>
    </>
  );
}

/**
 * Constellation edge: thin glowing line, additive blending, dashes for divorced.
 * Recomputes its Bezier path every frame from the shared live positions.
 */
function ConstellationEdge({
  fromId,
  toId,
  livePositionsRef,
  color,
  dashed,
  opacity = 0.55,
  lift = 0.4,
}: {
  fromId: string;
  toId: string;
  livePositionsRef: React.MutableRefObject<LivePositions>;
  color: string;
  dashed?: boolean;
  opacity?: number;
  lift?: number;
}) {
  const { geometry, material, line } = useMemo(() => {
    const arr = new Float32Array(EDGE_SEGMENTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = dashed
      ? new THREE.LineDashedMaterial({
          color,
          dashSize: 0.22,
          gapSize: 0.18,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        } as THREE.LineDashedMaterialParameters)
      : new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    return { geometry: geo, material: mat, line: l };
  }, [color, dashed, opacity]);

  const tmps = useMemo(
    () => ({
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      perp: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(() => {
    const from = livePositionsRef.current.get(fromId);
    const to = livePositionsRef.current.get(toId);
    if (!from || !to) return;

    tmps.start.copy(from);
    tmps.end.copy(to);
    tmps.dir.subVectors(tmps.end, tmps.start);
    const length = tmps.dir.length();
    if (length === 0) return;

    tmps.perp.set(-tmps.dir.z, 0, tmps.dir.x).normalize();
    tmps.mid.copy(tmps.start).lerp(tmps.end, 0.5);
    tmps.mid.add(
      tmps.perp.multiplyScalar(lift * Math.min(2, length * 0.18)),
    );
    tmps.mid.y += lift * 0.3;

    const arr = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < EDGE_SEGMENTS; i++) {
      const t = i / (EDGE_SEGMENTS - 1);
      const u = 1 - t;
      arr[i * 3]     = u * u * tmps.start.x + 2 * u * t * tmps.mid.x + t * t * tmps.end.x;
      arr[i * 3 + 1] = u * u * tmps.start.y + 2 * u * t * tmps.mid.y + t * t * tmps.end.y;
      arr[i * 3 + 2] = u * u * tmps.start.z + 2 * u * t * tmps.mid.z + t * t * tmps.end.z;
    }
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    geometry.boundingSphere = null;
    if (dashed) line.computeLineDistances();
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <primitive object={line} />;
}

/** Slow drifting starfield to add depth and atmosphere */
function Starfield({ count = 1200 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 60 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 8;
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#f6c7a0",
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.getElapsedTime() * 0.005;
  });

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <points ref={ref} geometry={geometry} material={material} />;
}

function CursorTracker({
  pointerRef,
}: {
  pointerRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const { camera, pointer } = useThree();
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    [],
  );
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useFrame(() => {
    raycaster.setFromCamera(pointer, camera);
    const v = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, v)) {
      pointerRef.current = v;
    }
  });
  return null;
}

function SceneContent({
  people,
  relationships,
  lang,
  onPersonActivate,
}: Props & { onPersonActivate: (p: PersonInput) => void }) {
  const initialPositions = useMemo(
    () => computeInitialPositions(people),
    [people],
  );
  const visiblePeople = useMemo(
    () => people.filter((p) => !p.is_placeholder),
    [people],
  );

  const livePositionsRef = useRef<LivePositions>(new Map());
  useMemo(() => {
    const map = livePositionsRef.current;
    for (const [id, [x, y, z]] of initialPositions.entries()) {
      const existing = map.get(id);
      if (existing) existing.set(x, y, z);
      else map.set(id, new THREE.Vector3(x, y, z));
    }
    for (const id of [...map.keys()]) {
      if (!initialPositions.has(id)) map.delete(id);
    }
  }, [initialPositions]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const pointerRef = useRef<THREE.Vector3 | null>(null);

  const parentEdges = useMemo(() => {
    const out: { fromId: string; toId: string; key: string }[] = [];
    for (const p of visiblePeople) {
      if (!initialPositions.has(p.id)) continue;
      for (const parentId of [p.father_id, p.mother_id]) {
        if (!parentId || !initialPositions.has(parentId)) continue;
        out.push({ fromId: parentId, toId: p.id, key: `pc-${parentId}-${p.id}` });
      }
    }
    return out;
  }, [visiblePeople, initialPositions]);

  const spouseEdges = useMemo(() => {
    const out: {
      fromId: string;
      toId: string;
      key: string;
      status: "current" | "divorced" | "widowed";
    }[] = [];
    for (const r of relationships) {
      if (r.type !== "spouse") continue;
      if (!initialPositions.has(r.person_a_id) || !initialPositions.has(r.person_b_id)) continue;
      out.push({
        fromId: r.person_a_id,
        toId: r.person_b_id,
        key: `sp-${r.id}`,
        status: (r.status ?? "current") as "current" | "divorced" | "widowed",
      });
    }
    return out;
  }, [relationships, initialPositions]);

  return (
    <>
      <CursorTracker pointerRef={pointerRef} />

      <OrbitControls
        enabled={orbitEnabled}
        enablePan
        enableZoom
        enableRotate
        zoomSpeed={0.7}
        panSpeed={0.6}
        rotateSpeed={0.6}
        minDistance={4}
        maxDistance={80}
        enableDamping
        dampingFactor={0.08}
        makeDefault
      />

      <Starfield />

      {parentEdges.map((e) => (
        <ConstellationEdge
          key={e.key}
          fromId={e.fromId}
          toId={e.toId}
          livePositionsRef={livePositionsRef}
          color="#e36a36"
          opacity={0.50}
          lift={0.6}
        />
      ))}

      {spouseEdges.map((e) => (
        <ConstellationEdge
          key={e.key}
          fromId={e.fromId}
          toId={e.toId}
          livePositionsRef={livePositionsRef}
          color={e.status === "current" ? "#c93d5a" : "#9a8a8e"}
          dashed={e.status !== "current"}
          opacity={0.55}
          lift={0.2}
        />
      ))}

      {visiblePeople.map((p) => (
        <ConstellationNode
          key={p.id}
          person={p}
          livePositionsRef={livePositionsRef}
          lang={lang}
          selected={selectedId === p.id}
          onSelect={setSelectedId}
          onActivate={() => onPersonActivate(p)}
          pointerRef={pointerRef}
          setOrbitEnabled={setOrbitEnabled}
        />
      ))}
    </>
  );
}

export function FamilyTree3D({ people, relationships, lang }: Props) {
  const router = useRouter();
  const [hint, setHint] = useState(true);

  function gotoPerson(p: PersonInput) {
    router.push(`/person/${p.slug ?? p.id}`);
  }

  return (
    <div className="relative h-full w-full" style={{ background: "#160a14" }}>
      <Canvas
        camera={{ position: [0, 1, 26], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#160a14"]} />
        <fog attach="fog" args={["#160a14", 28, 95]} />

        {/* Warm low-key lighting; the glow comes from bloom on emissive halos */}
        <ambientLight intensity={0.35} color="#f3d6b6" />
        <pointLight position={[0, 5, 10]} intensity={0.5} color="#e36a36" />
        <pointLight position={[-12, -8, -5]} intensity={0.4} color="#c93d5a" />

        <Suspense fallback={null}>
          <SceneContent
            people={people}
            relationships={relationships}
            lang={lang}
            onPersonActivate={gotoPerson}
          />
        </Suspense>

        <EffectComposer multisampling={0}>
          <Bloom
            intensity={1.4}
            luminanceThreshold={0.2}
            luminanceSmoothing={0.7}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      {hint && (
        <button
          type="button"
          onClick={() => setHint(false)}
          className="absolute bottom-6 right-6 z-10 max-w-[18rem] rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-left text-[11px] leading-snug text-white/75 shadow-[0_18px_44px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors hover:bg-black/55"
        >
          <div className="font-semibold text-white mb-1">
            {lang === "ar" ? "أوامر العرض ثلاثي الأبعاد" : "Constellation controls"}
          </div>
          {lang === "ar" ? (
            <>
              • اسحب: لتدوير المنظر
              <br />
              • انقر + اسحب على نقطة: لتحريكها (الروابط تتبع)
              <br />
              • انقر مرة: لإبرازها
              <br />
              • انقر مرتين: لفتح الملف
            </>
          ) : (
            <>
              • Drag empty space: rotate
              <br />
              • Click + drag a node: move it (edges follow live)
              <br />
              • Single click: highlight + reveal face
              <br />
              • Double-click: open profile
            </>
          )}
          <span className="mt-2 block text-[9px] uppercase tracking-[0.16em] text-white/40">
            {lang === "ar" ? "اضغط للإخفاء" : "tap to dismiss"}
          </span>
        </button>
      )}
    </div>
  );
}

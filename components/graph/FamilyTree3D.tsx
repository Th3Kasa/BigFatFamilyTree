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

/**
 * Live-positions store.
 *
 * Shared between every PortraitNode (writers) and every CurvedEdge (readers).
 * Both sides read/write THREE.Vector3 instances inside useFrame so positions
 * stay perfectly in sync at 60fps without ever triggering a React re-render.
 *
 * This is the canonical R3F pattern for ref-based shared mutable state.
 */
type LivePositions = Map<string, THREE.Vector3>;

const EDGE_SEGMENTS = 48;

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
  for (const g of generations) {
    const members = byGen.get(g)!;
    const count = members.length;
    const radius = Math.max(2.5, count * 1.1);
    members.forEach((p, idx) => {
      const angle = (idx / Math.max(count, 1)) * Math.PI * 2;
      const phase = g * 0.35;
      const x = Math.cos(angle + phase) * radius;
      const z = Math.sin(angle + phase) * radius * 0.7;
      const y = -g * 3.6;
      positions.set(p.id, [x, y, z]);
    });
  }
  return positions;
}

function PortraitNode({
  person,
  livePositionsRef,
  lang,
  selected,
  onSelect,
  onClick,
  pointerRef,
  setOrbitEnabled,
}: {
  person: PersonInput;
  livePositionsRef: React.MutableRefObject<LivePositions>;
  lang: "ar" | "en";
  selected: boolean;
  onSelect: (id: string) => void;
  onClick: () => void;
  pointerRef: React.MutableRefObject<THREE.Vector3 | null>;
  setOrbitEnabled: (b: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const seed = useRef(Math.random() * Math.PI * 2);
  // The "rest" position the node returns to when no drag is in progress.
  // Only changed by drag. Drift + cursor pull animate around this value.
  const basePos = useRef<THREE.Vector3>(
    livePositionsRef.current.get(person.id)?.clone() ?? new THREE.Vector3(),
  );
  // Currently rendered position. Lerps toward (basePos + ambient drift + cursor).
  const currentPos = useRef<THREE.Vector3>(basePos.current.clone());
  const [hovered, setHovered] = useState(false);
  const isDragging = useRef(false);

  const { camera, gl, raycaster } = useThree();
  const dragPlane = useMemo(() => new THREE.Plane(), []);
  const dragOffset = useMemo(() => new THREE.Vector3(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  // Publish currentPos to the shared live-positions map every frame so edges
  // (which also useFrame off this same ref) read the latest value.
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (!isDragging.current) {
      const t = state.clock.getElapsedTime() + seed.current;
      const bobY = Math.sin(t * 0.7) * 0.08;
      const wobbleX = Math.cos(t * 0.5) * 0.04;

      let cursorOffsetX = 0;
      let cursorOffsetY = 0;
      const ptr = pointerRef.current;
      if (ptr) {
        const dx = ptr.x - basePos.current.x;
        const dy = ptr.y - basePos.current.y;
        const dist = Math.hypot(dx, dy);
        const range = 4;
        if (dist < range) {
          const influence = (1 - dist / range) * 0.18;
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

    // Always publish current position to the shared live store, dragging or not
    const live = livePositionsRef.current.get(person.id);
    if (live) live.copy(currentPos.current);

    // Face the camera
    groupRef.current.quaternion.copy(camera.quaternion);
  });

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      onSelect(person.id);
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
    [camera, dragOffset, dragPlane, gl, ndc, raycaster, onSelect, person.id, setOrbitEnabled],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!isDragging.current) return;
      e.stopPropagation();
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
    },
    [setOrbitEnabled],
  );

  const ringColor =
    person.gender === "f"
      ? "#fda4af"
      : person.gender === "m"
        ? "#e36a36"
        : "#cbb4a8";

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        if (isDragging.current) return;
        e.stopPropagation();
        onSelect(person.id);
        onClick();
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <mesh>
        <ringGeometry args={[1.0, 1.18, 64]} />
        <meshBasicMaterial
          color={selected ? "#e36a36" : ringColor}
          transparent
          opacity={selected ? 0.9 : hovered ? 0.6 : 0.35}
        />
      </mesh>
      <mesh>
        <circleGeometry args={[0.95, 64]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.85} />
      </mesh>

      <Suspense fallback={null}>
        {person.photo_url ? (
          <PhotoPlane url={person.photo_url} />
        ) : (
          <InitialsPlane initials={initialsOf(person, lang)} />
        )}
      </Suspense>

      <Html
        position={[0, -1.25, 0]}
        center
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur-md"
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
  const tex = useLoader(THREE.TextureLoader, url);
  return (
    <mesh>
      <circleGeometry args={[0.8, 64]} />
      <meshBasicMaterial map={tex} transparent />
    </mesh>
  );
}

function InitialsPlane({ initials }: { initials: string }) {
  return (
    <>
      <mesh>
        <circleGeometry args={[0.8, 64]} />
        <meshBasicMaterial color="white" />
      </mesh>
      <Html center style={{ pointerEvents: "none" }} distanceFactor={8}>
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

/**
 * Curved edge that re-samples a quadratic Bezier between two LIVE node positions
 * every frame, mutating its BufferGeometry position attribute in place.
 * No React re-renders during drag.
 */
function CurvedEdge({
  fromId,
  toId,
  livePositionsRef,
  color,
  dashed,
  opacity = 0.7,
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
  // Allocate geometry + material + line once. R3F handles ref reconciliation.
  const { geometry, material, line } = useMemo(() => {
    const arr = new Float32Array(EDGE_SEGMENTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = dashed
      ? new THREE.LineDashedMaterial({
          color,
          dashSize: 0.22,
          gapSize: 0.16,
          transparent: true,
          opacity,
        })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    return { geometry: geo, material: mat, line: l };
  }, [color, dashed, opacity]);

  // Pre-allocated temp vectors (avoid GC churn in the per-frame loop)
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
      // Quadratic Bezier: B(t) = u²·P0 + 2u·t·P1 + t²·P2
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
  onPersonClick,
}: Props & { onPersonClick: (p: PersonInput) => void }) {
  const initialPositions = useMemo(
    () => computeInitialPositions(people),
    [people],
  );
  const visiblePeople = useMemo(
    () => people.filter((p) => !p.is_placeholder),
    [people],
  );

  // Single shared live-positions store. Keys are person ids; values are
  // THREE.Vector3 instances that BOTH the node (writer) and edge (reader)
  // mutate / read in useFrame. Cheap, GC-free, and React stays out of it.
  const livePositionsRef = useRef<LivePositions>(new Map());
  useMemo(() => {
    const map = livePositionsRef.current;
    // Sync map to current people list, preserving existing Vector3 instances
    // so they remain shared across re-renders.
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
        minDistance={5}
        maxDistance={70}
        enableDamping
        dampingFactor={0.08}
        makeDefault
      />

      {parentEdges.map((e) => (
        <CurvedEdge
          key={e.key}
          fromId={e.fromId}
          toId={e.toId}
          livePositionsRef={livePositionsRef}
          color="#7a1f3d"
          opacity={0.7}
          lift={0.6}
        />
      ))}

      {spouseEdges.map((e) => (
        <CurvedEdge
          key={e.key}
          fromId={e.fromId}
          toId={e.toId}
          livePositionsRef={livePositionsRef}
          color={e.status === "current" ? "#c93d5a" : "#a8a098"}
          dashed={e.status !== "current"}
          opacity={0.7}
          lift={0.2}
        />
      ))}

      {visiblePeople.map((p) => (
        <PortraitNode
          key={p.id}
          person={p}
          livePositionsRef={livePositionsRef}
          lang={lang}
          selected={selectedId === p.id}
          onSelect={setSelectedId}
          onClick={() => onPersonClick(p)}
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
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 2, 22], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#fbf6ee"]} />
        <fog attach="fog" args={["#fbf6ee", 28, 70]} />

        <ambientLight intensity={0.75} />
        <directionalLight position={[6, 12, 6]} intensity={0.55} color="#fff5e6" />
        <pointLight position={[-12, -10, -8]} intensity={0.35} color="#e36a36" />
        <pointLight position={[10, -8, 6]} intensity={0.25} color="#c93d5a" />

        <Suspense fallback={null}>
          <SceneContent
            people={people}
            relationships={relationships}
            lang={lang}
            onPersonClick={gotoPerson}
          />
        </Suspense>
      </Canvas>

      {hint && (
        <button
          type="button"
          onClick={() => setHint(false)}
          className="glass-2 absolute bottom-6 right-6 z-10 max-w-[16rem] rounded-2xl border border-[var(--border)] px-4 py-3 text-left text-[11px] leading-snug text-[var(--muted-foreground)] shadow-[var(--shadow-floating)] transition-colors hover:bg-[var(--card)]"
        >
          <div className="font-semibold text-[var(--foreground)] mb-1">
            {lang === "ar" ? "أوامر العرض ثلاثي الأبعاد" : "3D controls"}
          </div>
          {lang === "ar" ? (
            <>
              • اسحب: لتدوير المنظر
              <br />
              • انقر + اسحب على وجه: لتحريكه (الروابط تتبع)
              <br />
              • التمرير: للتكبير
              <br />
              • انقر مرتين: للذهاب إلى الملف
            </>
          ) : (
            <>
              • Drag empty space: rotate
              <br />
              • Click + drag a portrait: move it (edges follow live)
              <br />
              • Scroll: zoom
              <br />
              • Click a portrait twice: open profile
            </>
          )}
          <span className="mt-2 block text-[9px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]/70">
            {lang === "ar" ? "اضغط للإخفاء" : "tap to dismiss"}
          </span>
        </button>
      )}
    </div>
  );
}

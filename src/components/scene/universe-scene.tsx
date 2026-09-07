"use client";

import { CameraControls, Line } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { categories, type CategoryFilter } from "@/data/technologies";
import { useCatalog } from "../catalog-provider";
import { TechnologyNode } from "./technology-node";

export interface UniverseSceneProps {
  selectedId: string | null;
  hoveredId: string | null;
  activeCategory: CategoryFilter;
  isAutoRotate: boolean;
  reducedMotion: boolean;
  resetKey: number;
  zoomRequest: { direction: 1 | -1; key: number } | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onReady: () => void;
  onInteract: () => void;
  onUnavailable: () => void;
}

function Starfield({ reducedMotion }: { reducedMotion: boolean }) {
  const points = useRef<THREE.Points>(null);
  const [attributes] = useState(() => {
    const positions = new Float32Array(2600 * 3);
    const colors = new Float32Array(2600 * 3);
    let seed = 42;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < 2600; i++) {
      positions[i * 3] = (random() - 0.5) * 160;
      positions[i * 3 + 1] = (random() - 0.5) * 100;
      positions[i * 3 + 2] = -15 - random() * 80;
      const brightness = 0.2 + random() * 0.65;
      colors[i * 3] = brightness * 0.7;
      colors[i * 3 + 1] = brightness * 0.82;
      colors[i * 3 + 2] = brightness;
    }
    return { positions, colors };
  });
  useFrame((_, delta) => { if (points.current && !reducedMotion) points.current.rotation.z += delta * 0.0015; });
  return <points ref={points} raycast={() => null}><bufferGeometry><bufferAttribute attach="attributes-position" args={[attributes.positions, 3]} /><bufferAttribute attach="attributes-color" args={[attributes.colors, 3]} /></bufferGeometry><pointsMaterial size={0.065} vertexColors transparent opacity={0.75} sizeAttenuation depthWrite={false} /></points>;
}

function ConnectionLines({ selectedId, activeCategory }: Pick<UniverseSceneProps, "selectedId" | "activeCategory">) {
  const { relationships, technologyById } = useCatalog();
  const connectionGeometry = useMemo(() => relationships.map((edge) => {
  const { source: sourceId, target: targetId } = edge;
  const a = new THREE.Vector3(...technologyById[sourceId].position);
  const b = new THREE.Vector3(...technologyById[targetId].position);
  const midpoint = a.clone().lerp(b, 0.5);
  midpoint.z -= a.distanceTo(b) * 0.09;
  if (edge.kind === "dependency") { midpoint.y += 0.45; midpoint.z += sourceId < targetId ? 0.5 : -0.5; }
  return { edge, sourceId, targetId, points: new THREE.QuadraticBezierCurve3(a, midpoint, b).getPoints(24) };
}), [relationships, technologyById]);
  return <group>{connectionGeometry.map(({ edge, sourceId, targetId, points }) => {
    const source = technologyById[sourceId];
    const target = technologyById[targetId];
    const active = selectedId === sourceId || selectedId === targetId;
    const dimmed = selectedId ? !active : activeCategory !== "All" && source.category !== activeCategory && target.category !== activeCategory;
    return <Line key={edge.id} points={points} color={edge.kind === "dependency" ? "#ffc479" : active ? categories[technologyById[selectedId!].category].color : "#7099b6"} dashed={edge.kind === "dependency"} dashSize={0.12} gapSize={0.08} transparent opacity={dimmed ? 0.035 : active ? 0.65 : 0.16} lineWidth={active ? 1.2 : 0.65} depthWrite={false} />;
  })}</group>;
}

function OrbitGuides() {
  const ellipse = (radius: number, tilt: number) => Array.from({ length: 181 }, (_, index) => {
    const angle = (index / 180) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * tilt - 0.3, Math.sin(angle) * 2 - 4);
  });
  return <group rotation={[0, 0, -0.22]}><Line points={ellipse(10.8, 0.65)} color="#667da1" transparent opacity={0.1} lineWidth={0.6} /><Line points={ellipse(12.1, 0.68)} color="#667da1" transparent opacity={0.065} lineWidth={0.6} dashed dashSize={0.07} gapSize={0.23} /></group>;
}

function CameraRig({ selectedId, isAutoRotate, reducedMotion, resetKey, zoomRequest, onInteract }: UniverseSceneProps) {
  const { technologyById } = useCatalog();
  const controls = useRef<CameraControls>(null);
  const { size } = useThree();
  const isMobile = size.width <= 700;
  const overviewDistance = Math.max(23, (isMobile ? 20.5 : 22) / (2 * Math.tan(THREE.MathUtils.degToRad(22.5)) * (size.width / size.height)));

  useEffect(() => {
    const controller = controls.current;
    if (!controller) return;
    if (selectedId) {
      const [x, y, z] = technologyById[selectedId].position;
      // Offset the target to leave room for the HTML inspector on desktop.
      void controller.setLookAt(x + 0.6, y + 1.1, z + (isMobile ? 15 : 12), x + (isMobile ? 0 : 2.0), y + (isMobile ? -1.5 : 0.25), z, !reducedMotion);
    } else {
      void controller.setLookAt(0, 1.6, overviewDistance, 0, 0.8, 0, !reducedMotion);
    }
  }, [selectedId, resetKey, isMobile, overviewDistance, reducedMotion, technologyById]);

  useEffect(() => { if (zoomRequest) void controls.current?.dolly(zoomRequest.direction * 2.8, !reducedMotion); }, [zoomRequest, reducedMotion]);
  useFrame((_, delta) => {
    if (isAutoRotate && !selectedId && !reducedMotion) void controls.current?.rotate(delta * 0.025, 0, false);
  });

  return <CameraControls ref={controls} makeDefault minDistance={5} maxDistance={Math.max(55, overviewDistance + 10)} smoothTime={0.8} draggingSmoothTime={0.16} minPolarAngle={Math.PI * 0.15} maxPolarAngle={Math.PI * 0.85} onStart={onInteract} />;
}

function SceneContent(props: UniverseSceneProps) {
  const { technologies, getConnectedIds } = useCatalog();
  const connectedIds = props.selectedId ? getConnectedIds(props.selectedId) : [];
  const { onReady } = props;
  useEffect(() => { onReady(); }, [onReady]);
  return <>
    <ambientLight intensity={0.6} />
    <pointLight position={[0, 8, 10]} intensity={30} color="#b6d9ff" />
    <Starfield reducedMotion={props.reducedMotion} />
    <OrbitGuides />
    <ConnectionLines selectedId={props.selectedId} activeCategory={props.activeCategory} />
    {technologies.map((technology) => <TechnologyNode key={technology.id} technology={technology} selected={props.selectedId === technology.id} connected={connectedIds.includes(technology.id)} hovered={props.hoveredId === technology.id} reducedMotion={props.reducedMotion} dimmed={props.selectedId ? props.selectedId !== technology.id && !connectedIds.includes(technology.id) : props.activeCategory !== "All" && props.activeCategory !== technology.category} onHover={props.onHover} onSelect={props.onSelect} />)}
    <CameraRig {...props} />
  </>;
}

export default function UniverseScene(props: UniverseSceneProps) {
  const [available] = useState(() => {
    // Canvas fallback children mount even when WebGL works; detect support explicitly.
    const context = document.createElement("canvas").getContext("webgl2");
    context?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(context);
  });
  const { onUnavailable } = props;
  useEffect(() => { if (!available) onUnavailable(); }, [available, onUnavailable]);
  if (!available) return <div className="scene-fallback">WebGL is unavailable.<br />Explore the technology directory instead.</div>;
  return <Canvas className="universe-canvas" camera={{ position: [0, 1.6, 23], fov: 45, near: 0.1, far: 200 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }} onPointerMissed={() => props.onHover(null)}>
    <SceneContent {...props} />
  </Canvas>;
}

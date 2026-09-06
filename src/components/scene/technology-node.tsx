"use client";

import { Billboard, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { categories, type Technology } from "@/data/technologies";
import { TechnologyIcon } from "@/components/technology-icon";

const glowVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const glowFragment = `varying vec2 vUv; uniform vec3 color; uniform float strength; void main() { float d = length(vUv - 0.5) * 2.0; float glow = pow(max(0.0, 1.0 - d), 3.5); gl_FragColor = vec4(color, glow * strength); }`;

export function TechnologyNode({ technology, selected, connected, dimmed, hovered, reducedMotion, onHover, onSelect }: {
  technology: Technology;
  selected: boolean;
  connected: boolean;
  dimmed: boolean;
  hovered: boolean;
  reducedMotion: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const core = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Group>(null);
  const color = categories[technology.category].color;
  const emphasized = selected || hovered;
  const size = technology.size;

  useFrame((_, delta) => {
    if (!core.current) return;
    if (!reducedMotion) {
      core.current.rotation.y += delta * 0.16;
      core.current.rotation.z += delta * 0.07;
      if (ring.current) ring.current.rotation.z += delta * 0.1;
    }
    const scale = emphasized ? 1.2 : 1;
    core.current.scale.setScalar(THREE.MathUtils.damp(core.current.scale.x, scale, 6, delta));
  });

  return (
    <group position={technology.position}>
      <Billboard>
        <mesh scale={size * (emphasized ? 9 : 7)} raycast={() => null}>
          <planeGeometry />
          <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} vertexShader={glowVertex} fragmentShader={glowFragment} uniforms={{ color: { value: new THREE.Color(color) }, strength: { value: dimmed ? 0.1 : emphasized ? 1.1 : 0.65 } }} />
        </mesh>
      </Billboard>
      <mesh ref={core}>
        {technology.category === "Web" ? <icosahedronGeometry args={[size, 1]} /> : technology.category === "Backend" ? <dodecahedronGeometry args={[size, 0]} /> : technology.category === "Database" ? <octahedronGeometry args={[size, 0]} /> : <icosahedronGeometry args={[size, 0]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dimmed ? 0.08 : emphasized ? 1.2 : 0.45} transparent opacity={dimmed ? 0.15 : 0.5} roughness={0.3} metalness={0.5} wireframe />
      </mesh>
      <Billboard>
        <group ref={ring} rotation={[0, 0, 0.4]}>
          <mesh raycast={() => null}>
            <ringGeometry args={[size * 1.44, size * 1.46, 80, 1, 0, Math.PI * 1.35]} />
            <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.05 : emphasized ? 0.65 : 0.23} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh raycast={() => null}>
            <ringGeometry args={[size * 1.7, size * 1.71, 80, 1, Math.PI, Math.PI * 0.55]} />
            <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.03 : 0.3} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      </Billboard>
      <Html center position={[0, 0, size + 0.05]} distanceFactor={23} zIndexRange={[30, 10]}>
        <button className={`node-target${emphasized ? " is-emphasized" : ""}${dimmed ? " is-dimmed" : ""}${connected ? " is-connected" : ""}`} style={{ "--node-color": color, "--node-size": `${size * 76}px` } as React.CSSProperties}
          aria-label={`Explore ${technology.name}, ${technology.category}`} aria-pressed={selected}
          onPointerEnter={(event) => { if (event.pointerType !== "touch") onHover(technology.id); }}
          onPointerLeave={() => onHover(null)} onFocus={() => onHover(technology.id)} onBlur={() => onHover(null)}
          onClick={(event) => { event.stopPropagation(); onHover(null); onSelect(technology.id); }}>
          <TechnologyIcon symbol={technology.symbol} className="node-symbol" />
          <span className="node-label">{technology.name}<span className="node-category">{selected ? "IN FOCUS" : connected ? "CONNECTED" : categories[technology.category].label}</span></span>
        </button>
      </Html>
    </group>
  );
}

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { useRef, useState, useMemo, useEffect, useCallback } from "react";
import * as THREE from "three";

// ── Constants ─────────────────────────────────────────────────────────────────

const POINT_NO         = 200;
const SPEED            = 0.00065;
const Z_RANGE: [number, number] = [-1, 2];
const MAX_DIST_SQ      = 3.2 * 3.2;
const CHAIN_MAX_DEPTH  = 14;
const LINE_DRAW_SPEED  = 6;
const LINE_STAGGER     = 0.06;
const LINE_AGE         = 8;
const LINE_FADE_RATE   = 0.5;
const AUTO_CHAIN_MS    = 11000;
const BUCKET_SIZE      = 1.8;
const BG_COLOR         = "#050b14";

// Mostly white/pale — only a faint blue-teal accent
const PALETTE = [
  "#ffffff",
  "#ffffff",
  "#ffffff",
  "#dce8ff", // very pale blue-white
  "#dce8ff",
  "#b8d4f0", // soft blue-grey
  "#9ec8e8", // muted sky
  "#cce0f5", // near-white blue
];

// ── Types ─────────────────────────────────────────────────────────────────────

type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector2;
  color: THREE.Color;
  hex: string;
  size: number;
};

type LineAnim = { progress: number; opacity: number; age: number; delay: number };

type ActiveLine = {
  id: number;
  fromIdx: number;
  toIdx: number;
  hex: string;
  anim: LineAnim;
};

type Ripple = { id: number; x: number; y: number };

// ── Spatial hashing ───────────────────────────────────────────────────────────

function buildBuckets(particles: Particle[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < particles.length; i++) {
    const { x, y, z } = particles[i].pos;
    const key = `${Math.floor(x / BUCKET_SIZE)},${Math.floor(y / BUCKET_SIZE)},${Math.floor(z / BUCKET_SIZE)}`;
    let b = map.get(key);
    if (!b) { b = []; map.set(key, b); }
    b.push(i);
  }
  return map;
}

function getCandidates(buckets: Map<string, number[]>, x: number, y: number, z: number): number[] {
  const bx = Math.floor(x / BUCKET_SIZE);
  const by = Math.floor(y / BUCKET_SIZE);
  const bz = Math.floor(z / BUCKET_SIZE);
  const result: number[] = [];
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        const arr = buckets.get(`${bx + dx},${by + dy},${bz + dz}`);
        if (arr) result.push(...arr);
      }
  return result;
}

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = `
  attribute float size;
  attribute vec3 particleColor;
  varying vec3 vColor;
  void main() {
    vColor = particleColor;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (22.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAG = `
  varying vec3 vColor;
  uniform float opacity;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    float core = 1.0 - smoothstep(0.0, 0.22, d);
    float halo = 1.0 - smoothstep(0.1, 0.5, d);
    float a = (core * 0.95 + halo * 0.38) * opacity;
    gl_FragColor = vec4(vColor, a);
  }
`;

// ── AnimatedLine ──────────────────────────────────────────────────────────────

function AnimatedLine({ line, particlesRef }: { line: ActiveLine; particlesRef: React.RefObject<Particle[]> }) {
  const [obj] = useState(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(line.hex),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return new THREE.Line(geo, mat);
  });

  useFrame(() => {
    if (line.anim.delay > 0) return;
    const pts = particlesRef.current;
    const from = pts[line.fromIdx]?.pos;
    const to   = pts[line.toIdx]?.pos;
    if (!from || !to) return;

    const lerped = from.clone().lerp(to, line.anim.progress);
    const arr = obj.geometry.attributes.position.array as Float32Array;
    arr[0] = from.x;   arr[1] = from.y;   arr[2] = from.z;
    arr[3] = lerped.x; arr[4] = lerped.y; arr[5] = lerped.z;
    obj.geometry.attributes.position.needsUpdate = true;
    (obj.material as THREE.LineBasicMaterial).opacity = line.anim.opacity;
  });

  return <primitive object={obj} />;
}

// ── ClickHandler (inside Canvas for camera access) ────────────────────────────

function ClickHandler({ buildChainRef }: { buildChainRef: React.RefObject<((x: number, y: number, z: number) => void) | null> }) {
  const { camera } = useThree();

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const plane    = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const worldPos = new THREE.Vector3();
    const ndc      = new THREE.Vector2();

    const handler = (e: MouseEvent) => {
      ndc.set(
        (e.clientX / window.innerWidth)  *  2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, worldPos)) {
        buildChainRef.current?.(worldPos.x, worldPos.y, worldPos.z);
      }
    };

    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [camera, buildChainRef]);

  return null;
}

// ── RippleOverlay ─────────────────────────────────────────────────────────────

function RippleOverlay() {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const id = idRef.current++;
      setRipples(p => [...p, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setRipples(p => p.filter(r => r.id !== id)), 950);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {ripples.map(r => (
        <div key={r.id} style={{ position: "absolute", left: r.x, top: r.y }}>
          <div className="bg-ripple-ring" />
          <div className="bg-ripple-ring bg-ripple-ring--b" />
        </div>
      ))}
    </div>
  );
}

// ── BackgroundContent ─────────────────────────────────────────────────────────

function BackgroundContent({ buildChainRef }: { buildChainRef: React.RefObject<((x: number, y: number, z: number) => void) | null> }) {
  const { viewport } = useThree();

  const pointsRef  = useRef<THREE.Points>(null!);
  const linesRef   = useRef<ActiveLine[]>([]);
  const lineIdRef  = useRef(0);
  const fadeOpRef  = useRef(0);
  const particlesRef = useRef<Particle[]>([]);

  const [displayLines, setDisplayLines] = useState<ActiveLine[]>([]);

  // ── Particles ───────────────────────────────────────────────────────────────
  const { particles, posArr, colArr, sizeArr } = useMemo(() => {
    const w = viewport.width;
    const h = viewport.height;
    const pts: Particle[] = [];
    const posArr  = new Float32Array(POINT_NO * 3);
    const colArr  = new Float32Array(POINT_NO * 3);
    const sizeArr = new Float32Array(POINT_NO);

    for (let i = 0; i < POINT_NO; i++) {
      const hex   = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const isHub = Math.random() < 0.04;
      const size  = isHub ? 4 + Math.random() * 3 : 1.2 + Math.random() * 1.8;
      const color = new THREE.Color(hex);
      const angle = Math.random() * Math.PI * 2;
      const spd   = SPEED * (0.5 + Math.random() * 0.8);
      const pos   = new THREE.Vector3(
        (Math.random() - 0.5) * w,
        (Math.random() - 0.5) * h,
        Z_RANGE[0] + Math.random() * (Z_RANGE[1] - Z_RANGE[0])
      );

      pts.push({
        pos,
        vel: new THREE.Vector2(Math.cos(angle) * spd, Math.sin(angle) * spd),
        color,
        hex,
        size,
      });

      posArr[i * 3]     = pos.x;
      posArr[i * 3 + 1] = pos.y;
      posArr[i * 3 + 2] = pos.z;
      colArr[i * 3]     = color.r;
      colArr[i * 3 + 1] = color.g;
      colArr[i * 3 + 2] = color.b;
      sizeArr[i]        = size;
    }
    return { particles: pts, posArr, colArr, sizeArr };
  }, [viewport.width, viewport.height]);

  particlesRef.current = particles;

  // ── Geometry & material ──────────────────────────────────────────────────────
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position",      new THREE.BufferAttribute(posArr,  3));
    g.setAttribute("particleColor", new THREE.BufferAttribute(colArr,  3));
    g.setAttribute("size",          new THREE.BufferAttribute(sizeArr, 1));
    return g;
  }, [posArr, colArr, sizeArr]);

  const shaderMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms:       { opacity: { value: 0 } },
    vertexShader:   VERT,
    fragmentShader: FRAG,
    transparent:    true,
    blending:       THREE.AdditiveBlending,
    depthWrite:     false,
  }), []);

  // ── Chain builder ────────────────────────────────────────────────────────────
  const buildChain = useCallback((startX: number, startY: number, startZ: number) => {
    const pts = particlesRef.current;
    if (!pts.length) return;

    // Build buckets once for the whole chain traversal
    const buckets = buildBuckets(pts);
    const visited = new Set<number>();
    const pairs: [number, number, string][] = [];

    // Find nearest particle to click position
    const startVec = new THREE.Vector3(startX, startY, startZ);
    const startCands = getCandidates(buckets, startX, startY, startZ);
    if (!startCands.length) return;

    let startIdx = startCands[0];
    let minD = Infinity;
    for (const idx of startCands) {
      const d = pts[idx].pos.distanceToSquared(startVec);
      if (d < minD) { minD = d; startIdx = idx; }
    }

    visited.add(startIdx);
    let curIdx = startIdx;
    const maxDepth = Math.ceil(Math.random() * CHAIN_MAX_DEPTH);

    for (let depth = 0; depth < maxDepth; depth++) {
      const cur = pts[curIdx];
      const nearby = getCandidates(buckets, cur.pos.x, cur.pos.y, cur.pos.z)
        .filter(idx => !visited.has(idx) && pts[idx].pos.distanceToSquared(cur.pos) < MAX_DIST_SQ)
        .sort((a, b) => pts[a].pos.distanceToSquared(cur.pos) - pts[b].pos.distanceToSquared(cur.pos));

      if (!nearby.length) break;

      // Pick from top 5 for more varied, less linear paths
      const nextIdx = nearby[Math.floor(Math.random() * Math.min(5, nearby.length))];
      pairs.push([curIdx, nextIdx, cur.hex]);
      visited.add(nextIdx);
      curIdx = nextIdx;
    }

    const newLines: ActiveLine[] = pairs.map(([from, to, hex], i) => ({
      id:      lineIdRef.current++,
      fromIdx: from,
      toIdx:   to,
      hex,
      anim:    { progress: 0, opacity: 1, age: 0, delay: i * LINE_STAGGER },
    }));

    linesRef.current = [...linesRef.current, ...newLines];
    setDisplayLines([...linesRef.current]);
  }, []);

  buildChainRef.current = buildChain;

  // ── Auto chains ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const fire = () => {
      const pts = particlesRef.current;
      if (!pts.length) return;
      const rand = pts[Math.floor(Math.random() * pts.length)];
      buildChain(rand.pos.x, rand.pos.y, rand.pos.z);
    };
    const init = setTimeout(fire, 1200);
    const id   = setInterval(fire, AUTO_CHAIN_MS);
    return () => { clearTimeout(init); clearInterval(id); };
  }, [buildChain]);

  // ── Fade in ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let raf: number;
    const tick = () => {
      fadeOpRef.current = Math.min(1, fadeOpRef.current + 0.012);
      if (fadeOpRef.current < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Per-frame: physics + line animation ──────────────────────────────────────
  useFrame((_, delta) => {
    const hw = viewport.width  / 2;
    const hh = viewport.height / 2;
    const pts = particlesRef.current;
    const posAttr = pointsRef.current?.geometry.attributes.position;

    // Move particles
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      if (p.pos.x < -hw || p.pos.x > hw) p.vel.x *= -1;
      if (p.pos.y < -hh || p.pos.y > hh) p.vel.y *= -1;
      if (posAttr) {
        (posAttr.array as Float32Array)[i * 3]     = p.pos.x;
        (posAttr.array as Float32Array)[i * 3 + 1] = p.pos.y;
        (posAttr.array as Float32Array)[i * 3 + 2] = p.pos.z;
      }
    }
    if (posAttr) posAttr.needsUpdate = true;

    // Fade in shader
    shaderMat.uniforms.opacity.value = fadeOpRef.current;

    // Tick line animations (mutate in place — no React state per frame)
    let hasExpired = false;
    for (const line of linesRef.current) {
      if (line.anim.delay > 0) {
        line.anim.delay -= delta;
        continue;
      }
      if (line.anim.progress < 1) {
        line.anim.progress = Math.min(1, line.anim.progress + delta * LINE_DRAW_SPEED);
      } else {
        line.anim.age += delta;
        if (line.anim.age > LINE_AGE) {
          line.anim.opacity = Math.max(0, line.anim.opacity - delta * LINE_FADE_RATE);
          if (line.anim.opacity <= 0) hasExpired = true;
        }
      }
    }

    if (hasExpired) {
      linesRef.current = linesRef.current.filter(l => l.anim.opacity > 0);
      setDisplayLines([...linesRef.current]);
    }
  });

  return (
    <>
      <mesh position={[0, 0, -5]}>
        <planeGeometry args={[300, 300]} />
        <meshBasicMaterial color={BG_COLOR} />
      </mesh>

      <points ref={pointsRef} geometry={geometry} material={shaderMat} />

      {displayLines.map(line => (
        <AnimatedLine key={line.id} line={line} particlesRef={particlesRef} />
      ))}
    </>
  );
}

// ── Background (main export) ──────────────────────────────────────────────────

function Background() {
  const buildChainRef = useRef<((x: number, y: number, z: number) => void) | null>(null);

  return (
    <>
      <RippleOverlay />
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }} style={{ width: "100%", height: "100%" }}>
        <BackgroundContent buildChainRef={buildChainRef} />
        <ClickHandler     buildChainRef={buildChainRef} />
      </Canvas>
    </>
  );
}

export default Background;

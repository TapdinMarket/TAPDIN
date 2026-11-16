'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { MotionValue } from 'motion/react';
import { cn } from '@/lib/format';
import { BAKU_GEO, REGION_GEO } from './geo';
import { decodeLand, GLOBE_LAND } from './land-data';

/**
 * The tapdıq Earth: dotted continents, an atmosphere, four routes converging on Baku and small cargo
 * aircraft flying them. This is a brand visualisation — the aircraft are decorative and do not
 * represent real shipments.
 *
 * Plain three.js (no React renderer): one draw loop, a handful of draw calls, paused when off-screen.
 */
/** `soon`: announced region (COMING_SOON) — dashed, dim route, no aircraft. */
export type GlobeRegion = { key: string; name: string; soon?: boolean };

type Props = {
  regions: GlobeRegion[];
  /** Short tag shown next to coming-soon region labels. */
  soonLabel?: string;
  baku: string;
  selected: string | null;
  onSelect?: (key: string | null) => void;
  /** Optional 0 → 1 scroll progress that moves the camera through the hero scenes. */
  progress?: MotionValue<number>;
  /** Small / touch screens: fewer points, lower pixel ratio. */
  lite?: boolean;
  /** Reduced motion: nothing moves on its own. */
  still?: boolean;
  className?: string;
};

const ORANGE = new THREE.Color('#ff5a1f');
const RAD = Math.PI / 180;

function toVec(lat: number, lon: number, r = 1) {
  const la = lat * RAD;
  const lo = lon * RAD;
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo) * r, Math.sin(la) * r, Math.cos(la) * Math.cos(lo) * r);
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Camera choreography for the hero scroll. `wide` / `tall` are globe offsets for landscape / portrait stages.
type Key = { p: number; z: number; wideX: number; tallY: number; y: number; lon: number; lat: number; sway: number; dim: number; labels: number; boost: number };
const KEYS: Key[] = [
  { p: 0, z: 3.75, wideX: 0.78, tallY: -0.46, y: 0, lon: 60, lat: 30, sway: 30, dim: 1, labels: 1, boost: 0 },
  { p: 0.17, z: 3.75, wideX: 0.78, tallY: -0.46, y: 0, lon: 60, lat: 30, sway: 30, dim: 1, labels: 1, boost: 0 },
  { p: 0.4, z: 2.7, wideX: 0.62, tallY: -0.42, y: 0, lon: 72, lat: 34, sway: 12, dim: 1, labels: 1, boost: 0.4 },
  { p: 0.52, z: 2.05, wideX: 0.42, tallY: -0.32, y: 0, lon: 56, lat: 40, sway: 4, dim: 1, labels: 1, boost: 1 },
  { p: 0.66, z: 1.85, wideX: 0.3, tallY: -0.26, y: 0, lon: 50, lat: 40, sway: 2, dim: 1, labels: 0.6, boost: 1 },
  { p: 0.78, z: 3.0, wideX: 0, tallY: 0, y: -1.5, lon: 50, lat: 16, sway: 4, dim: 0.85, labels: 0, boost: 0.3 },
  { p: 0.9, z: 3.0, wideX: 0, tallY: 0, y: -1.56, lon: 50, lat: 16, sway: 6, dim: 0.8, labels: 0, boost: 0.2 },
  { p: 1, z: 3.2, wideX: 0, tallY: 0, y: -1.72, lon: 58, lat: 16, sway: 8, dim: 0.5, labels: 0, boost: 0 },
];
function keyAt(p: number): Key {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = smooth(a.p, b.p, p);
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Key)[]) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const DOT_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aCity;
  uniform float uPixel;
  uniform vec3 uLight;
  varying float vLight;
  varying float vCity;
  varying float vSeed;
  varying float vFacing;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * position);
    vLight = dot(n, normalize(uLight));
    vFacing = dot(n, normalize(-mv.xyz));
    vCity = aCity;
    vSeed = aSeed;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = mix(1.55, 2.9, aCity) * uPixel * (3.3 / -mv.z);
  }
`;
const DOT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying float vLight;
  varying float vCity;
  varying float vSeed;
  varying float vFacing;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float day = smoothstep(-0.3, 0.65, vLight);
    vec3 land = mix(vec3(0.27, 0.27, 0.26), vec3(0.88, 0.87, 0.83), day);
    float twinkle = 0.7 + 0.3 * sin(uTime * 1.4 + vSeed * 60.0);
    vec3 city = mix(vec3(1.0, 0.45, 0.14), vec3(1.0, 0.72, 0.45), day * 0.7) * twinkle;
    vec3 color = mix(land, city, vCity);
    float alpha = smoothstep(0.5, 0.28, d) * smoothstep(0.0, 0.3, vFacing) * mix(0.8, 1.0, vCity);
    gl_FragColor = vec4(color, alpha);
  }
`;
const CORE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float light = dot(vNormal, normalize(uLight));
    vec3 base = mix(vec3(0.022, 0.022, 0.022), vec3(0.085, 0.084, 0.08), smoothstep(-0.25, 0.9, light));
    float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.2);
    vec3 color = base + vec3(0.62, 0.6, 0.56) * rim * (0.16 + 0.34 * smoothstep(-0.4, 0.7, light));
    gl_FragColor = vec4(color, 1.0);
  }
`;
const ATMO_FRAGMENT = /* glsl */ `
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float g = clamp(-dot(vNormal, vView) / 0.5, 0.0, 1.0);
    float lit = 0.35 + 0.65 * smoothstep(-0.6, 0.7, dot(vNormal.xy, normalize(uLight).xy));
    float a = pow(g, 2.6) * 0.55 * lit;
    gl_FragColor = vec4(vec3(0.86, 0.84, 0.8) * a, a);
  }
`;
const ARC_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const ARC_FRAGMENT = /* glsl */ `
  uniform float uHead;
  uniform float uLit;
  uniform float uActive;
  uniform float uSoon;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float t = vUv.x;
    if (uSoon > 0.5) {
      // Planned route: a quiet dashed line, no traffic.
      float dash = step(0.45, fract(t * 34.0));
      float a = (0.09 + 0.2 * uActive) * dash;
      vec3 c = mix(vec3(0.55, 0.54, 0.51), uColor, uActive * 0.45);
      gl_FragColor = vec4(c * a, a);
      return;
    }
    float behind = step(t, uHead);
    float trail = smoothstep(uHead - 0.3, uHead, t) * behind;
    float lit = behind * 0.3 * uLit;
    float a = 0.11 + 0.3 * uActive + trail * 0.95 + lit;
    vec3 color = mix(vec3(0.62, 0.61, 0.58), uColor, clamp(trail + lit * 2.2 + uActive * 0.7, 0.0, 1.0));
    gl_FragColor = vec4(color * a, a);
  }
`;

/** A small cargo aircraft built from primitives: long fuselage, swept wings, T-tail, two engines. Nose points to +Z. */
function makePlane() {
  const group = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0xf4f2ec });
  const accent = new THREE.MeshBasicMaterial({ color: 0xff5a1f });
  const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.0046, 0.046, 4, 10), body);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.0013, 0.009), body);
    wing.position.set(side * 0.0135, 0, 0.001);
    wing.rotation.y = side * 0.42;
    const stabiliser = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.0011, 0.005), body);
    stabiliser.position.set(side * 0.006, 0.001, -0.0235);
    stabiliser.rotation.y = side * 0.38;
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.008, 8), body);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.012, -0.0028, 0.004);
    group.add(wing, stabiliser, engine);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.0013, 0.0095, 0.008), accent);
  fin.position.set(0, 0.0055, -0.0225);
  group.add(fin);
  return group;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,150,90,1)');
  gradient.addColorStop(0.25, 'rgba(255,90,31,0.55)');
  gradient.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export function Globe({ regions, soonLabel, baku, selected, onSelect, progress, lite = false, still = false, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<Record<string, HTMLElement | null>>({});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Latest props for the draw loop.
  const live = useRef({ selected, hovered, still });
  live.current = { selected, hovered, still };

  const drawn = regions.filter((r) => REGION_GEO[r.key]);
  const regionKeys = drawn.map((r) => `${r.key}${r.soon ? ':soon' : ''}`).join(',');

  useEffect(() => {
    const container = host.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    const lightDir = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.copy(lightDir).multiplyScalar(5);
    scene.add(sun);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(item: T) => {
      disposables.push(item);
      return item;
    };

    // ── stars / ambient particles ──
    {
      const count = lite ? 140 : 320;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(7 + Math.random() * 5);
        v.z = -Math.abs(v.z) - 2;
        positions.set([v.x, v.y, v.z], i * 3);
      }
      const geometry = track(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = track(new THREE.PointsMaterial({ color: 0xcbc9c1, size: 1.4 * pixelRatio, sizeAttenuation: false, transparent: true, opacity: 0.45, depthWrite: false }));
      scene.add(new THREE.Points(geometry, material));
    }

    const globe = new THREE.Group();
    globe.rotation.order = 'XYZ';
    scene.add(globe);

    // ── core + atmosphere ──
    const lightUniform = { value: lightDir };
    const coreGeometry = track(new THREE.SphereGeometry(0.994, 64, 48));
    const coreMaterial = track(new THREE.ShaderMaterial({ vertexShader: CORE_VERTEX, fragmentShader: CORE_FRAGMENT, uniforms: { uLight: lightUniform } }));
    globe.add(new THREE.Mesh(coreGeometry, coreMaterial));
    const atmoGeometry = track(new THREE.SphereGeometry(1.16, 48, 32));
    const atmoMaterial = track(
      new THREE.ShaderMaterial({
        vertexShader: CORE_VERTEX,
        fragmentShader: ATMO_FRAGMENT,
        uniforms: { uLight: lightUniform },
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const atmosphere = new THREE.Mesh(atmoGeometry, atmoMaterial);
    scene.add(atmosphere);

    // ── continents as points, a few of them lit like cities ──
    const land = decodeLand(GLOBE_LAND);
    const stride = lite ? 2 : 1;
    const pointCount = Math.floor(land.length / 2 / stride);
    const positions = new Float32Array(pointCount * 3);
    const seeds = new Float32Array(pointCount);
    const cities = new Float32Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
      const v = toVec(land[i * stride * 2] / 100, land[i * stride * 2 + 1] / 100, 1);
      positions.set([v.x, v.y, v.z], i * 3);
      // Deterministic pseudo-random so the globe looks the same on every visit.
      const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
      seeds[i] = seed;
      cities[i] = seed > 0.955 ? 1 : 0;
    }
    const dotGeometry = track(new THREE.BufferGeometry());
    dotGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    dotGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    dotGeometry.setAttribute('aCity', new THREE.BufferAttribute(cities, 1));
    const dotMaterial = track(
      new THREE.ShaderMaterial({
        vertexShader: DOT_VERTEX,
        fragmentShader: DOT_FRAGMENT,
        uniforms: { uTime: { value: 0 }, uPixel: { value: pixelRatio }, uLight: lightUniform },
        transparent: true,
        depthWrite: false,
      }),
    );
    globe.add(new THREE.Points(dotGeometry, dotMaterial));

    // ── Baku ──
    const bakuPos = toVec(BAKU_GEO[0], BAKU_GEO[1], 1.012);
    const glowMap = track(glowTexture());
    const bakuGlowMaterial = track(new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const bakuGlow = new THREE.Sprite(bakuGlowMaterial);
    bakuGlow.position.copy(bakuPos);
    const markerGeometry = track(new THREE.SphereGeometry(1, 16, 12));
    const bakuMaterial = track(new THREE.MeshBasicMaterial({ color: 0xfff1e8 }));
    const bakuDot = new THREE.Mesh(markerGeometry, bakuMaterial);
    bakuDot.position.copy(bakuPos);
    bakuDot.scale.setScalar(0.014);
    const ringGeometry = track(new THREE.RingGeometry(0.86, 1, 48));
    const bakuRingMaterial = track(new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const bakuRing = new THREE.Mesh(ringGeometry, bakuRingMaterial);
    bakuRing.position.copy(bakuPos);
    bakuRing.lookAt(bakuPos.clone().multiplyScalar(2));
    globe.add(bakuGlow, bakuDot, bakuRing);

    // ── routes, markers, aircraft ──
    const keys = regionKeys ? regionKeys.split(',') : [];
    const routes = keys.map((entry, index) => {
      const [key, flag] = entry.split(':');
      const soon = flag === 'soon';
      const [lat, lon] = REGION_GEO[key];
      const start = toVec(lat, lon);
      const end = toVec(BAKU_GEO[0], BAKU_GEO[1]);
      const angle = start.angleTo(end);
      const lift = 0.09 + 0.2 * (angle / Math.PI);
      const axis = new THREE.Vector3().crossVectors(start, end).normalize();
      const pointAt = (t: number, target = new THREE.Vector3()) =>
        target
          .copy(start)
          .applyAxisAngle(axis, angle * t)
          .multiplyScalar(1.012 + lift * Math.sin(Math.PI * t));
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, i) => pointAt(i / 48)));
      const geometry = track(new THREE.TubeGeometry(curve, 120, 0.0038, 6, false));
      const material = track(
        new THREE.ShaderMaterial({
          vertexShader: ARC_VERTEX,
          fragmentShader: ARC_FRAGMENT,
          uniforms: { uHead: { value: 0 }, uLit: { value: 0 }, uActive: { value: 0 }, uSoon: { value: soon ? 1 : 0 }, uColor: { value: ORANGE } },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      globe.add(new THREE.Mesh(geometry, material));

      const markerPos = toVec(lat, lon, 1.012);
      const markerMaterial = track(new THREE.MeshBasicMaterial({ color: soon ? 0x8b8a84 : ORANGE }));
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(markerPos);
      marker.scale.setScalar(0.011);
      const haloMaterial = track(new THREE.MeshBasicMaterial({ color: soon ? 0x8b8a84 : ORANGE, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      const halo = new THREE.Mesh(ringGeometry, haloMaterial);
      halo.position.copy(markerPos);
      halo.lookAt(markerPos.clone().multiplyScalar(2));
      globe.add(marker, halo);

      // No aircraft on routes that are not open yet.
      const plane = makePlane();
      plane.visible = false;
      if (!soon) globe.add(plane);
      return { key, soon, index, pointAt, material, markerPos, halo, haloMaterial, plane, period: 10.5 + index * 1.9, offset: index * 3.3, active: 0, wasFlying: false };
    });

    // ── interaction state ──
    const state = { yaw: -60 * RAD, pitch: 27 * RAD, dragYaw: 0, dragPitch: 0, lastDrag: -10, parX: 0, parY: 0, parTX: 0, parTY: 0, pulse: 0, time: 0, width: 1, height: 1, planeScale: 1.5 };
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-globe-label]')) return;
      pointerId = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      setDragging(true);
    };
    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (e.pointerType === 'mouse') {
        state.parTX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        state.parTY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      }
      if (pointerId !== e.pointerId) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      // On touch, a mostly vertical gesture is the page scrolling — leave it alone.
      if (e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx) * 1.2) return;
      state.dragYaw += dx * 0.0055;
      state.dragPitch = Math.max(-0.7, Math.min(0.7, state.dragPitch + dy * 0.004));
      state.lastDrag = state.time;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return;
      pointerId = null;
      setDragging(false);
    };
    const onLeave = () => {
      state.parTX = 0;
      state.parTY = 0;
    };
    container.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    container.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;
      state.width = width;
      state.height = height;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dotMaterial.uniforms.uPixel.value = pixelRatio * Math.max(0.75, Math.min(1.5, Math.min(width, height) / 640));
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let visible = true;
    const intersection = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { rootMargin: '120px' });
    intersection.observe(container);

    const world = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const toCamera = new THREE.Vector3();
    const ahead = new THREE.Vector3();
    const basisX = new THREE.Vector3();
    const basisY = new THREE.Vector3();
    const basisZ = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const TAN = Math.tan((35 / 2) * RAD);

    const placeLabel = (key: string, local: THREE.Vector3, fade: number) => {
      const el = labelRefs.current[key];
      if (!el) return;
      world.copy(local).applyMatrix4(globe.matrixWorld);
      normal.copy(world).sub(globe.position).normalize();
      toCamera.copy(camera.position).sub(world).normalize();
      const facing = normal.dot(toCamera);
      world.project(camera);
      const opacity = Math.min(1, Math.max(0, (facing - 0.08) / 0.2)) * fade;
      el.style.transform = `translate3d(${((world.x + 1) / 2) * state.width}px, ${((1 - world.y) / 2) * state.height}px, 0)`;
      el.style.opacity = opacity.toFixed(3);
      el.style.pointerEvents = opacity > 0.4 ? 'auto' : 'none';
    };

    let frame = 0;
    let last = performance.now();
    let first = true;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden) return;
      const { selected: sel, hovered: hov, still: frozen } = live.current;
      if (!frozen) state.time += dt;
      const time = frozen ? 4.2 : state.time;

      // camera + composition
      const k = keyAt(progress ? progress.get() : 0);
      const aspect = state.width / state.height;
      const fit = Math.max(1, 1.12 / (TAN * 3.75 * aspect));
      const wide = smooth(0.85, 1.25, aspect);
      camera.position.set(0, 0, k.z * fit);
      globe.position.set(k.wideX * wide, k.tallY * (1 - wide) * fit + k.y * (0.55 + 0.45 * fit), 0);
      atmosphere.position.copy(globe.position);

      // orientation: scene target, or the selected route's midpoint
      let lon = k.lon;
      let lat = k.lat;
      let sway = k.sway;
      const focus = sel && REGION_GEO[sel] && k.labels > 0.5 ? sel : null;
      if (focus) {
        const mid = toVec(REGION_GEO[focus][0], REGION_GEO[focus][1]).add(toVec(BAKU_GEO[0], BAKU_GEO[1])).normalize();
        lon = Math.atan2(mid.x, mid.z) / RAD;
        lat = Math.asin(mid.y) / RAD;
        sway = 3;
      }
      if (state.time - state.lastDrag > 2.2 && pointerId === null) {
        const ease = Math.exp(-dt * 0.9);
        state.dragYaw *= ease;
        state.dragPitch *= ease;
      }
      state.parX += (state.parTX - state.parX) * Math.min(1, dt * 3);
      state.parY += (state.parTY - state.parY) * Math.min(1, dt * 3);
      const targetYaw = -(lon + sway * Math.sin(time * 0.11)) * RAD + state.dragYaw + state.parX * 0.07;
      const targetPitch = lat * 0.9 * RAD + state.dragPitch + state.parY * 0.05;
      const follow = first ? 1 : Math.min(1, dt * 2.6);
      state.yaw += (targetYaw - state.yaw) * follow;
      state.pitch += (targetPitch - state.pitch) * follow;
      globe.rotation.set(state.pitch, state.yaw, 0);
      globe.updateMatrixWorld();

      // routes and aircraft
      const radiusPx = (state.height / 2 / (TAN * camera.position.z)) * 1;
      const planeScale = Math.max(0.85, Math.min(1.9, 400 / radiusPx));
      for (const r of routes) {
        const cycle = ((time + r.offset) % r.period) / r.period;
        const u = cycle / 0.86;
        const flying = u <= 1 && !r.soon;
        const eased = flying ? 0.45 * u + 0.55 * u * u * (3 - 2 * u) : 1;
        if (r.wasFlying && !flying) state.pulse = 1;
        r.wasFlying = flying;
        r.material.uniforms.uHead.value = eased;
        r.material.uniforms.uLit.value = flying ? 1 : 1 - (cycle - 0.86) / 0.14;
        const wanted = sel === r.key || hov === r.key ? 1 : 0;
        r.active += (Math.max(wanted, r.soon ? 0 : k.boost * 0.55) - r.active) * Math.min(1, dt * 5);
        r.material.uniforms.uActive.value = r.active;

        r.plane.visible = flying;
        if (flying) {
          r.pointAt(eased, r.plane.position);
          r.pointAt(Math.min(1, eased + 0.01), ahead);
          basisZ.copy(ahead).sub(r.plane.position).normalize();
          basisY.copy(r.plane.position).normalize();
          basisX.crossVectors(basisY, basisZ).normalize();
          basisY.crossVectors(basisZ, basisX).normalize();
          r.plane.quaternion.setFromRotationMatrix(matrix.makeBasis(basisX, basisY, basisZ));
          r.plane.scale.setScalar(planeScale * smooth(0, 0.07, u) * (1 - smooth(0.94, 1, u)));
        }
        const beat = 0.5 + 0.5 * Math.sin(time * 1.8 + r.index);
        r.halo.scale.setScalar(0.022 + 0.012 * beat + 0.02 * r.active);
        r.haloMaterial.opacity = (r.soon ? 0.4 : 1) * (0.35 + 0.3 * (1 - beat) + 0.35 * r.active);
      }

      // destination
      state.pulse *= Math.exp(-dt * 1.3);
      const breathe = 0.5 + 0.5 * Math.sin(time * 1.5);
      bakuGlow.scale.setScalar(0.13 + 0.03 * breathe + 0.16 * state.pulse);
      bakuGlowMaterial.opacity = 0.75 + 0.25 * state.pulse;
      bakuRing.scale.setScalar(0.03 + 0.012 * breathe + 0.07 * (1 - Math.exp(-state.pulse * 3)));
      bakuRingMaterial.opacity = 0.75 - 0.35 * breathe;

      dotMaterial.uniforms.uTime.value = time;
      canvas.style.opacity = String(k.dim);
      renderer.render(scene, camera);

      for (const r of routes) placeLabel(r.key, r.markerPos, k.labels);
      placeLabel('BAKU', bakuPos, Math.min(1, k.labels + 0.0));
      if (first) {
        first = false;
        setReady(true);
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      container.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      container.removeEventListener('pointerleave', onLeave);
      routes.forEach((r) =>
        r.plane.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }),
      );
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [regionKeys, lite, progress]);

  return (
    <div ref={host} className={cn('relative size-full touch-pan-y select-none', dragging ? 'cursor-grabbing' : 'cursor-grab', className)}>
      {/* Fallback / loading visual: a lit sphere drawn with CSS, replaced by the WebGL scene when it is ready. */}
      <div
        className={cn('pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-1000 lg:justify-end lg:pr-[8%]', ready && !failed ? 'opacity-0' : 'opacity-100')}
        aria-hidden
      >
        <div className="aspect-square h-[62%] max-w-[86%] rounded-full bg-[radial-gradient(circle_at_32%_28%,#2a2a28,#0c0c0b_58%,#060606_72%)] shadow-[0_0_120px_-20px_rgb(203_201_193/0.18)]" />
      </div>
      <canvas ref={canvasRef} className={cn('absolute inset-0 size-full transition-[filter] duration-1000', ready ? '' : 'invisible')} aria-hidden />

      {!failed && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {drawn.map((r) => {
            const active = selected === r.key || hovered === r.key;
            return (
              <button
                key={r.key}
                type="button"
                data-globe-label
                ref={(el) => {
                  labelRefs.current[r.key] = el;
                }}
                aria-pressed={selected === r.key}
                onPointerEnter={() => setHovered(r.key)}
                onPointerLeave={() => setHovered((h) => (h === r.key ? null : h))}
                onFocus={() => setHovered(r.key)}
                onBlur={() => setHovered((h) => (h === r.key ? null : h))}
                onClick={() => onSelect?.(selected === r.key ? null : r.key)}
                className="group absolute top-0 left-0 cursor-pointer opacity-0 will-change-transform"
              >
                <span
                  className={cn(
                    'absolute top-0 left-3.5 flex h-7 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium tracking-[0.14em] whitespace-nowrap uppercase backdrop-blur-sm transition-colors duration-300',
                    r.soon
                      ? active
                        ? 'border-dashed border-white/50 bg-black/70 text-ink'
                        : 'border-dashed border-white/20 bg-black/45 text-muted group-hover:border-white/50'
                      : active
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-white/15 bg-black/45 text-ink-soft group-hover:border-accent',
                  )}
                >
                  {r.name}
                  {r.soon && soonLabel && <span className="text-[9px] tracking-[0.18em] text-accent">{soonLabel}</span>}
                </span>
                <span className="absolute -top-4 -left-4 size-8" />
              </button>
            );
          })}
          <span
            ref={(el) => {
              labelRefs.current.BAKU = el;
            }}
            className="absolute top-0 left-0 opacity-0 will-change-transform"
          >
            <span className="absolute top-3 left-0 -translate-x-1/2 font-display text-[13px] font-semibold tracking-[0.18em] whitespace-nowrap text-ink uppercase [text-shadow:0_1px_12px_rgb(0_0_0/0.9)]">
              {baku}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

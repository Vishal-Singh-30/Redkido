'use client'

import { useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * The hero's ambient layer.
 *
 * FIRST ATTEMPT, AND WHY IT WAS WRONG
 * A wireframe icosahedron in a particle halo. It was legible as "3D", but it
 * read as a network/globe motif — hard triangulated lines crossing straight
 * through the headline. That is a SaaS/crypto vocabulary. This is a warm,
 * editorial agency whose portfolio is skincare, fragrance and interiors, and
 * the object competed with the type instead of sitting behind it.
 *
 * WHAT THIS IS INSTEAD
 * The original page already stated its visual language: two soft radial red
 * glows behind the copy (.hero-glow / .hero-glow-2). So rather than introducing
 * a new object, this animates that same language — a single full-bleed plane
 * running a domain-warped noise field in the existing palette, drifting slowly
 * enough that you notice it only if you look. No edges, no geometry, no
 * silhouette. Atmosphere, not an object.
 *
 * KEEPING IT OUT OF THE WAY
 *  - a radial mask suppresses the field through the middle, where the headline
 *    sits, and lets it bloom toward the corners
 *  - peak alpha is ~0.5, over an off-white page
 *  - it renders at BELOW native resolution (see dpr) — for a soft gradient the
 *    upscale is free antialiasing, and it costs a fraction of the fill rate
 *
 * Cost: one full-screen quad, one draw call, no geometry, no textures, no lights.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  // highp, not mediump: simplex noise multiplies by 34 and wraps at 289, and at
  // mediump those magnitudes lose enough mantissa to produce visible banding
  // and blocky artifacts in the gradient on some GPUs.
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform float uAspect;
  uniform vec2  uMouse;

  // Palette lifted straight from :root in globals.css — no new colours.
  const vec3 SAND      = vec3(0.969, 0.957, 0.937); // --off-white #f7f4ee
  const vec3 RED       = vec3(0.910, 0.212, 0.169); // --red       #e8362b
  const vec3 RED_SOFT  = vec3(1.000, 0.365, 0.278); // --red-2     #ff5d47
  const vec3 RED_DEEP  = vec3(0.549, 0.122, 0.122); // --red-deep  #8c1f1f

  // --- compact 2D simplex noise -------------------------------------------
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                            + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                            dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  // Three octaves is plenty for something this soft; more just costs fill rate.
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 2; i++) {
      v += a * snoise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= uAspect;

    // Very slow. The field should never look like it is "playing".
    float t = uTime * 0.035;

    // Pointer nudges the field rather than steering it — barely perceptible,
    // enough that the page feels responsive to a cursor.
    p += uMouse * 0.06;

    // Domain warp: the thing that makes noise read as flowing ink rather than
    // as static. Feed the field through itself twice.
    vec2 q = vec2(fbm(p * 0.30 + t), fbm(p * 0.30 + vec2(4.3, 1.7) - t));
    vec2 r = vec2(fbm(p * 0.26 + 0.55 * q + vec2(1.7, 9.2) + t * 0.7),
                  fbm(p * 0.26 + 0.55 * q + vec2(8.3, 2.8) - t * 0.6));
    float f = fbm(p * 0.34 + 0.75 * r);

    // 0..1, biased so most of the frame stays pale.
    float n = smoothstep(-0.55, 0.55, f);

    vec3 col = mix(SAND, RED_SOFT, smoothstep(0.30, 0.92, n));
    col = mix(col, RED, smoothstep(0.55, 1.00, n) * 0.85);
    col = mix(col, RED_DEEP, smoothstep(0.80, 1.05, n) * 0.35);

    // Hollow out the centre so the headline always sits on clean paper, and
    // fade the outer edge so the layer never shows a boundary.
    float d = length(p * vec2(0.62, 1.05));
    float centre = smoothstep(0.20, 1.05, d);
    float edge   = 1.0 - smoothstep(1.25, 1.95, d);

    float alpha = n * centre * edge * 0.85;

    gl_FragColor = vec4(col, alpha);
  }
`

function GradientField() {
  const material = useRef<THREE.ShaderMaterial>(null)
  const { viewport } = useThree()
  const mouse = useRef(new THREE.Vector2(0, 0))

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    }),
    [],
  )

  useFrame((state, delta) => {
    const m = material.current
    if (!m) return
    m.uniforms.uTime.value += delta
    m.uniforms.uAspect.value = viewport.width / viewport.height
    // Damped, frame-rate independent, so it eases rather than snaps.
    const k = 1 - Math.pow(0.02, delta)
    mouse.current.x += (state.pointer.x - mouse.current.x) * k
    mouse.current.y += (state.pointer.y - mouse.current.y) * k
    m.uniforms.uMouse.value.copy(mouse.current)
  })

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={material}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

export function HeroScene() {
  return (
    <Canvas
      // Deliberately BELOW device resolution. This is a blurred gradient, so
      // upscaling is free smoothing and the fill-rate saving is large.
      dpr={[0.5, 0.85]}
      camera={{ position: [0, 0, 1], fov: 50 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
      style={{ background: 'transparent' }}
    >
      <GradientField />
    </Canvas>
  )
}

export default HeroScene

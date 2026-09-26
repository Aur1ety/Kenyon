// Glow shaders for the cell bodies, the schematic wiring lines and the dopamine pulses.
// Additive blending on an opaque black canvas: overlapping cells add up like light.

export const pointVertex = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSizeScale;
  uniform float uVisible[7];
  uniform float uFocus;          // -1 = no focus; otherwise the class index to emphasise
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aLevel;        // brightness, 0 (dark) .. ~1.4 (firing)
  attribute float aShape;        // 0 scanned soma, 1 point on the neurite, 2 display stand-in
  attribute float aClass;
  varying vec3 vColor;
  varying float vLevel;
  varying float vShape;
  varying float vDepth;
  void main() {
    int c = int(aClass + 0.5);
    float vis = 1.0;
    for (int k = 0; k < 7; k++) { if (k == c) vis = uVisible[k]; }
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float lvl = clamp(aLevel, 0.0, 1.6);
    float grow = 0.6 + 0.7 * lvl;
    float focus = (uFocus < 0.0) ? 1.0 : ((abs(aClass - uFocus) < 0.5) ? 1.35 : 0.35);
    gl_PointSize = vis * max(1.5, aSize * grow * uSizeScale * uPixelRatio / -mv.z);
    vColor = aColor;
    vLevel = lvl * focus;
    vShape = aShape;
    vDepth = clamp((-mv.z - 4.0) / 12.0, 0.0, 1.0);
  }
`;

export const pointFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vLevel;
  varying float vShape;
  varying float vDepth;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float r = sqrt(r2);
    float halo = exp(-r2 * 5.5);
    float core = smoothstep(0.42, 0.0, r);
    float a;
    if (vShape > 1.5) {
      // display stand-in: hollow ring, so it never passes for a scanned soma
      a = smoothstep(0.14, 0.0, abs(r - 0.66)) + halo * 0.12;
    } else if (vShape > 0.5) {
      // scanned point on the neurite: ring with a dot
      a = smoothstep(0.14, 0.0, abs(r - 0.66)) * 0.8 + smoothstep(0.28, 0.0, r) * 0.8;
    } else {
      a = halo * 0.55 + core * 0.75;
    }
    float depthFade = mix(1.0, 0.55, vDepth);
    vec3 col = vColor * (0.10 + 0.95 * vLevel) + vec3(1.0) * core * max(vLevel - 0.75, 0.0) * 0.9;
    gl_FragColor = vec4(col * a * depthFade, 1.0);
  }
`;

export const lineVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const lineFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor * vAlpha * uOpacity, 1.0);
  }
`;

export const pulseVertex = /* glsl */ `
  uniform float uPixelRatio;
  uniform float uSizeScale;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aLevel;
  varying vec3 vColor;
  varying float vLevel;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uSizeScale * uPixelRatio / -mv.z;
    vColor = aColor;
    vLevel = aLevel;
  }
`;

export const pulseFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vLevel;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float halo = exp(-r2 * 4.0);
    float core = exp(-r2 * 26.0);
    vec3 col = vColor * halo * 0.9 + vec3(1.0) * core * 0.8;
    gl_FragColor = vec4(col * vLevel, 1.0);
  }
`;

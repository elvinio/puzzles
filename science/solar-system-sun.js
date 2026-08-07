/* ============================================================================
   solar-system-sun.js — the Sun, rendered as a star rather than a texture.

   Four layers, drawn in this order:

     1. A Perlin cube map. A 4-D simplex noise field is baked into the six
        faces of a cube texture every frame. The fourth dimension is time, so
        the pattern boils rather than merely scrolls.
     2. The photosphere. A sphere that samples the cube map three times, along
        three slowly counter-rotating axes, and adds the samples together. That
        is what stops the granulation from looking like a rotating pattern: no
        single layer is ever on screen for long. Brightness is mapped to colour
        through (b, b², b⁴), a cheap stand-in for a black-body ramp — dim parts
        go red, hot parts run through orange to white.
     3. The corona. A ring of camera-facing quads hugging the limb.
     4. Rays and prominences. Tens of thousands of hair-thin ribbons pushed out
        along the surface normal (rays) or arced between two nearby footpoints
        (prominences), all displaced by a domain-warped sine noise so they
        writhe. These are the expensive layers, so they are built the first
        time they are needed and faded out again when you fly away.

   Everything is authored against a sphere of radius 1.5 and then scaled to
   whatever the orrery wants, so the numbers below can be compared directly
   against the shader constants they came from.
   ========================================================================== */
import * as THREE from 'three';

const REF_R = 1.5;          // radius the shaders were written against
const GLOW_R = 0.993;       // corona sits a hair inside the limb, so it tucks under it

/* The orrery renders with a logarithmic depth buffer, which changes how depth
   is written. Stock materials get this injected for them; ours have to ask. */
const chunk = THREE.ShaderChunk;
const LOG_PARS_V = chunk.logdepthbuf_pars_vertex;
const LOG_V = chunk.logdepthbuf_vertex;
const LOG_PARS_F = chunk.logdepthbuf_pars_fragment;
const LOG_F = chunk.logdepthbuf_fragment;
const COMMON = chunk.common;                 // logdepthbuf_vertex needs isPerspectiveMatrix()

/* How much of the Sun fades in from the side facing you, used for the reveal
   when you fly in. At uVisibility = 1 this is a no-op and everything is solid. */
const VISIBILITY = `
uniform float uVisibility;
uniform float uDirection;
uniform vec3  uLightView;

float getAlpha(vec3 n){
  float nDotL = dot(n, uLightView) * uDirection;
  return smoothstep(1.0, 1.5, nDotL + uVisibility * 2.5);
}
`;

// ── 1. The noise field ─────────────────────────────────────────────────────
const PERLIN_VS = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/* Ashima/Gustavson 4-D simplex noise, unchanged. The fourth coordinate is fed
   from the clock, which is what makes the granulation churn in place. */
const PERLIN_FS = `
varying vec3 vWorld;
uniform float uTime;
uniform float uSpatialFrequency;
uniform float uTemporalFrequency;
uniform float uH;
uniform float uContrast;
uniform float uFlatten;

#ifndef OCTAVES
#define OCTAVES 5
#endif

vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
float mod289(float x){ return x - floor(x * (1.0/289.0)) * 289.0; }

vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
float permute(float x){ return mod289(((x * 34.0) + 1.0) * x); }

vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float taylorInvSqrt(float r){ return 1.79284291400159 - 0.85373472095314 * r; }

vec4 grad4(float j, vec4 ip) {
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p, s;

  p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w   = 1.5 - dot(abs(p.xyz), ones.xyz);
  s     = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;

  return p;
}

#define F4 0.309016994374947451

float snoise(vec4 v) {
  const vec4 C = vec4(
    0.138196601125011,
    0.276393202250021,
    0.414589803375032,
   -0.447213595499958
  );

  vec4 i  = floor(v + dot(v, vec4(F4)));
  vec4 x0 = v - i + dot(i, C.xxxx);

  vec4 i0;
  vec3 isX  = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);

  i0.x   = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y  += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z  += isYZ.z;
  i0.w  += 1.0 - isYZ.z;

  vec4 i3 = clamp(i0,     0.0, 1.0);
  vec4 i2 = clamp(i0-1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0-2.0, 0.0, 1.0);

  vec4 x1 = x0 - i1 + C.xxxx;
  vec4 x2 = x0 - i2 + C.yyyy;
  vec4 x3 = x0 - i3 + C.zzzz;
  vec4 x4 = x0 + C.wwww;

  i = mod289(i);
  float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
  vec4 j1  = permute(permute(permute(permute(
               i.w + vec4(i1.w, i2.w, i3.w, 1.0)) + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
               + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
               + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

  vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);

  vec4 p0 = grad4(j0,   ip);
  vec4 p1 = grad4(j1.x, ip);
  vec4 p2 = grad4(j1.y, ip);
  vec4 p3 = grad4(j1.z, ip);
  vec4 p4 = grad4(j1.w, ip);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  p4 *= taylorInvSqrt(dot(p4,p4));

  vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
  m0 = m0 * m0; m1 = m1 * m1;

  return 49.0 * (
    dot(m0*m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) +
    dot(m1*m1, vec2(dot(p3, x3), dot(p4, x4)))
  );
}

vec2 fbm(vec4 p){
  float a = 1.0;
  float f = 1.0;
  vec2 sum = vec2(0.0);
  for (int i = 0; i < OCTAVES; i++){
      sum.x += snoise(p * f) * a;
      p.w += 100.0;
      sum.y += snoise(p * f) * a;
      a *= uH;
      f *= 2.0;
  }
  return sum;
}

void main(){
    vec3 world = normalize(vWorld);
    world += 12.45;

    vec4 p = vec4(world * uSpatialFrequency, uTime * uTemporalFrequency);
    vec2 f = fbm(p) * uContrast + 0.5;

    // A second, much coarser field gates the first. That is what pushes the
    // granulation into distinct cells instead of an even wash of noise.
    vec4 p2 = vec4(world * 2.0, uTime * uTemporalFrequency);
    float modulate = max(snoise(p2), 0.0);
    float x = mix(f.x, f.x * modulate, uFlatten);

    gl_FragColor = vec4(x, f.y, f.y, x);
}
`;

// ── 2. The photosphere ─────────────────────────────────────────────────────
const SUN_VS = `
${COMMON}
${LOG_PARS_V}

varying vec3 vWorld;
varying vec3 vNormalView;
varying vec3 vNormalWorld;
varying vec3 vLayer0;
varying vec3 vLayer1;
varying vec3 vLayer2;

uniform float uTime;

mat2 rot(float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

/* Three lookups into the same cube map, each spun about a different axis and
   offset by a third of a turn, so they never line up. */
void setLayers(vec3 p){
    float t = uTime;

    vec3 p1 = p;
    p1.yz = rot(t) * p1.yz;
    vLayer0 = p1;

    p1 = p;
    p1.zx = rot(t + 2.094) * p1.zx;
    vLayer1 = p1;

    p1 = p;
    p1.xy = rot(t - 4.188) * p1.xy;
    vLayer2 = p1;
}

void main(){
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;

    vNormalView  = normalize(normalMatrix * normal);
    vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    setLayers(normalize(normal));

    gl_Position = projectionMatrix * viewMatrix * world;
    ${LOG_V}
}
`;

const SUN_FS = `
${LOG_PARS_F}
${VISIBILITY}

varying vec3 vWorld;
varying vec3 vNormalView;
varying vec3 vNormalWorld;
varying vec3 vLayer0;
varying vec3 vLayer1;
varying vec3 vLayer2;

uniform samplerCube uPerlinCube;

uniform float uFresnelPower;
uniform float uFresnelInfluence;
uniform float uTint;
uniform float uBase;
uniform float uBrightnessOffset;
uniform float uBrightness;

/* Brightness to colour. Red first, then orange, then white as it climbs —
   the same order a poker goes through in a fire, and for the same reason. */
vec3 brightnessToColor(float b){
  b *= uTint;
  return (vec3(b, b*b, b*b*b*b) / uTint) * uBrightness;
}

float ocean(){
    float s = 0.0;
    s += textureCube(uPerlinCube, vLayer0).r;
    s += textureCube(uPerlinCube, vLayer1).r;
    s += textureCube(uPerlinCube, vLayer2).r;
    return s * 0.3333333;
}

void main(){
    ${LOG_F}

    vec3 Vview = normalize((viewMatrix * vec4(vWorld - cameraPosition, 0.0)).xyz);
    float nDotV = dot(vNormalView, -Vview);
    float fresnel = pow(1.0 - nDotV, uFresnelPower) * uFresnelInfluence;

    float brightness = ocean() * uBase + uBrightnessOffset + fresnel;
    vec3 col = clamp(brightnessToColor(brightness), 0.0, 1.0);

    float a = getAlpha(normalize(vNormalWorld));

    gl_FragColor = vec4(col, a);
}
`;

// ── 3. The corona ──────────────────────────────────────────────────────────
/* A ring of quads turned to face the camera. Built in world units and placed
   relative to the model's origin, so it follows the Sun wherever it is put. */
const GLOW_VS = `
${COMMON}
${LOG_PARS_V}

attribute vec3 aPos;

varying float vRadial;
varying vec3 vWorld;

uniform float uRadius;
uniform vec3 uCamUp;
uniform vec3 uCamPos;

void main(void){
  vRadial = aPos.z;

  vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam  = normalize(uCamPos - centre);
  vec3 side   = normalize(cross(toCam, uCamUp));

  vec3 p = aPos.x * side + aPos.y * uCamUp;
  p *= 1.0 + aPos.z * uRadius;

  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(centre + p, 1.0);
  ${LOG_V}
}
`;

const GLOW_FS = `
${LOG_PARS_F}
${VISIBILITY}

varying float vRadial;
varying vec3 vWorld;

uniform float uTint;
uniform float uBrightness;
uniform float uFalloffColor;

vec3 brightnessToColor(float b){
  b *= uTint;
  return (vec3(b, b*b, b*b*b*b) / uTint) * uBrightness;
}

void main(void){
    ${LOG_F}

    float alpha = (1.0 - vRadial);
    alpha *= alpha;
    float brightness = 1.0 + alpha * uFalloffColor;
    alpha *= getAlpha(normalize(vWorld));
    gl_FragColor = vec4(brightnessToColor(brightness) * alpha, alpha);
}
`;

/* Four octaves of sine noise, each one warping the coordinates of the next.
   Cheap, and it curls in a way plain fbm does not. Shared by rays and loops. */
const TWISTED_SINE = `
#define m4  mat4( 0.00, 0.80, 0.60, -0.4, -0.80,  0.36, -0.48, -0.5, -0.60, -0.48, 0.64, 0.2, 0.40, 0.30, 0.20, 0.4)

vec4 twistedSineNoise(vec4 q, float falloff){
    float a = 1.0;
    float f = 1.0;
    vec4 sum = vec4(0.0);
    for (int i = 0; i < 4; i++) {
        q = m4 * q;
        vec4 s = sin(q.ywxz * f) * a;
        q += s;
        sum += s;
        a *= falloff;
        f /= falloff;
    }
    return sum;
}
`;

// ── 4a. Rays ───────────────────────────────────────────────────────────────
const RAYS_VS = `
${COMMON}
${LOG_PARS_V}

attribute vec3 aPos;
attribute vec3 aPos0;
attribute vec4 aWireRandom;

varying float vUVY;
varying float vOpacity;
varying vec3 vColor;
varying vec3 vNormal;

uniform float uHueSpread;
uniform float uHue;
uniform float uLength;
uniform float uWidth;
uniform float uTime;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform float uScale;
uniform vec3  uCamPos;
uniform float uOpacity;

${TWISTED_SINE}

vec3 getPos(float phase){
    float size = aWireRandom.z + 0.2;
    float d = phase * uLength * size;
    vec3 p = aPos0 + aPos0 * d;
    p += twistedSineNoise(vec4(p * uNoiseFrequency, uTime), 0.707).xyz * (d * uNoiseAmplitude);
    return p;
}

vec3 spectrum(in float d)
{
    return smoothstep(0.25, 0., abs(d + vec3(-0.375, -0.5, -0.625)));
}

void main(void) {
    vUVY = aPos.z;

    // Two samples a hair apart give the ribbon its direction, which is what we
    // need to widen it sideways from the camera's point of view.
    vec3 p  = getPos(aPos.x);
    vec3 p1 = getPos(aPos.x + 0.01);

    vec3 p0w = (modelMatrix * vec4(p , 1.0)).xyz;
    vec3 p1w = (modelMatrix * vec4(p1, 1.0)).xyz;

    vec3 dirW  = normalize(p1w - p0w);
    vec3 vW    = normalize(p0w - uCamPos);
    vec3 sideW = normalize(cross(vW, dirW));

    // Looking straight down a ribbon leaves no sideways to speak of.
    if (length(sideW) < 1e-6) {
        vec3 up = (abs(dirW.y) < 0.99) ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        sideW = normalize(cross(up, dirW));
    }

    float width = uWidth * uScale * aPos.z * (1.0 - aPos.x);
    vec3 pWorld = p0w + sideW * width;

    vNormal  = normalize(pWorld - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
    vOpacity = uOpacity * (0.5 + aWireRandom.w);
    vColor   = spectrum(aWireRandom.w * uHueSpread + uHue);

    gl_Position = projectionMatrix * viewMatrix * vec4(pWorld, 1.0);
    ${LOG_V}
}
`;

const RAYS_FS = `
${LOG_PARS_F}
${VISIBILITY}

varying float vUVY;
varying float vOpacity;
varying vec3  vColor;
varying vec3  vNormal;

void main(void) {
    ${LOG_F}

    float alpha = 1.0 - smoothstep(0.0, 1.0, abs(vUVY));
    alpha *= alpha;
    alpha *= vOpacity;
    alpha *= getAlpha(vNormal);

    gl_FragColor = vec4(vColor * alpha, alpha);
}
`;

// ── 4b. Prominences ────────────────────────────────────────────────────────
const LOOPS_VS = `
${COMMON}
${LOG_PARS_V}

attribute vec3 aPos;
attribute vec3 aPos0;
attribute vec3 aPos1;
attribute vec4 aWireRandom;

varying float vUVY;
varying float vOpacity;
varying vec3  vColor;
varying vec3  vNormal;

uniform float uWidth;
uniform float uAmp;
uniform float uTime;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform float uScale;
uniform vec3  uCamPos;
uniform float uOpacity;
uniform float uHueSpread;
uniform float uHue;

${TWISTED_SINE}

/* An arc between two footpoints, bulged out by a half sine so it leaves and
   returns to the surface cleanly, then shaken about by the noise. */
vec3 getPosOBJ(float phase, float animPhase){
  float size = distance(aPos0, aPos1);
  vec3  n    = normalize((aPos0 + aPos1) * 0.5);

  vec3 p = mix(aPos0, aPos1, phase);

  float amp = sin(phase * 3.14159265) * size * uAmp;
  amp *= animPhase;

  p += n * amp;
  p += twistedSineNoise(vec4(p * uNoiseFrequency, uTime), 0.707).xyz * (amp * uNoiseAmplitude);

  return p;
}

#define hue(v) ( .6 + .6 * cos( 6.3*(v) + vec3(0.0,23.0,21.0) ) )

void main(void){
  vUVY = aPos.z;

  float animPhase = fract(uTime * 0.3 * (aWireRandom.y * 0.5) + aWireRandom.x);

  vec3 pOBJ  = getPosOBJ(aPos.x,        animPhase);
  vec3 p1OBJ = getPosOBJ(aPos.x + 0.01, animPhase);

  vec3 pW  = (modelMatrix * vec4(pOBJ , 1.0)).xyz;
  vec3 p1W = (modelMatrix * vec4(p1OBJ, 1.0)).xyz;

  vec3 dirW  = normalize(p1W - pW);
  vec3 vW    = normalize(pW - uCamPos);
  vec3 sideW = normalize(cross(vW, dirW));

  float R = length(aPos0) * uScale;
  float width = uWidth * uScale * aPos.z * (1.0 + animPhase) * R;

  pW += sideW * width;

  vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vNormal = normalize(pW - centre);

  // Hide the loop while it is still buried in the photosphere, and let it
  // thin out again as it finishes its cycle.
  float lenW = length(pW - centre);
  vOpacity  = smoothstep(R, R * 1.03, lenW);
  vOpacity *= (1.0 - animPhase);
  vOpacity *= uOpacity;

  vColor = hue(aWireRandom.w * uHueSpread + uHue);

  gl_Position = projectionMatrix * viewMatrix * vec4(pW, 1.0);
  ${LOG_V}
}
`;

const LOOPS_FS = `
${LOG_PARS_F}
${VISIBILITY}

varying float vUVY;
varying float vOpacity;
varying vec3  vColor;
varying vec3  vNormal;

uniform float uAlphaBlended;

void main(void){
    ${LOG_F}

    float alpha = smoothstep(1.0, 0.0, abs(vUVY));
    alpha *= alpha;
    alpha *= vOpacity;
    alpha *= getAlpha(vNormal);

    gl_FragColor = vec4(vColor * alpha, alpha * uAlphaBlended);
}
`;

// ── Geometry ───────────────────────────────────────────────────────────────
const rand = Math.random;

function randomUnit(v) {
  const z = rand() * 2 - 1;
  const t = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return v.set(r * Math.cos(t), r * Math.sin(t), z);
}

/** Ribbons pointing straight out from the surface. */
function raysGeometry(lineCount, lineLength) {
  const verts = lineCount * lineLength * 2;
  const aPos = new Float32Array(verts * 3);
  const aPos0 = new Float32Array(verts * 3);
  const aWireRandom = new Float32Array(verts * 4);
  const indices = new Uint16Array(lineCount * (lineLength - 1) * 6);

  const base = new THREE.Vector3(), jitter = new THREE.Vector3(), held = new THREE.Vector3();
  let ip = 0, i0 = 0, ir = 0, ii = 0;
  let d = 0, ph = 0;

  for (let v = 0; v < lineCount; v++) {
    // Rays come in tufts: most of the time we stay near the previous root, so
    // they clump the way real spicules do instead of spreading evenly.
    if (rand() < 0.1 || v === 0) {
      randomUnit(held).normalize();
      d = rand();
      ph = rand();
    }
    base.copy(held).add(randomUnit(jitter).multiplyScalar(0.025)).normalize();
    const rnd = [d, ph, rand(), rand()];

    for (let m = 0; m < lineLength; m++) {
      const vertBase = 2 * (v * lineLength + m);
      for (let y = 0; y <= 1; y++) {
        aPos[ip++] = (m + 0.5) / lineLength;
        aPos[ip++] = (v + 0.5) / lineCount;
        aPos[ip++] = 2 * y - 1;
        for (let t = 0; t < 4; t++) aWireRandom[ir++] = rnd[t];
        aPos0[i0++] = base.x * REF_R;
        aPos0[i0++] = base.y * REF_R;
        aPos0[i0++] = base.z * REF_R;
      }
      if (m < lineLength - 1) {
        indices[ii++] = vertBase;
        indices[ii++] = vertBase + 1;
        indices[ii++] = vertBase + 2;
        indices[ii++] = vertBase + 2;
        indices[ii++] = vertBase + 1;
        indices[ii++] = vertBase + 3;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aPos', new THREE.BufferAttribute(aPos, 3));
  geo.setAttribute('aPos0', new THREE.BufferAttribute(aPos0, 3));
  geo.setAttribute('aWireRandom', new THREE.BufferAttribute(aWireRandom, 4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

/** Ribbons arcing between two footpoints a little way apart. */
function loopsGeometry(lineCount, lineLength) {
  const verts = lineCount * lineLength * 2;
  const aPos = new Float32Array(verts * 3);
  const aPos0 = new Float32Array(verts * 3);
  const aPos1 = new Float32Array(verts * 3);
  const aWireRandom = new Float32Array(verts * 4);
  const indices = new Uint16Array(lineCount * (lineLength - 1) * 6);

  const held = new THREE.Vector3(), anchor = new THREE.Vector3();
  const foot0 = new THREE.Vector3(), foot1 = new THREE.Vector3(), g = new THREE.Vector3();
  let ip = 0, i0 = 0, i1 = 0, ir = 0, ii = 0;
  let a = 0, b = 0;

  for (let v = 0; v < lineCount; v++) {
    // A new active region every so often; the loops in between share it, which
    // is what makes them read as one arcade rather than scattered threads.
    if (rand() < 0.025 || v === 0) {
      randomUnit(anchor).normalize();
      held.copy(anchor).add(randomUnit(g).multiplyScalar(0.4)).normalize();
      a = rand();
      b = rand();
    }
    foot0.copy(anchor).add(randomUnit(g).multiplyScalar(0.02)).normalize();
    foot1.copy(held).add(randomUnit(g).multiplyScalar(0.075)).normalize();
    const rnd = [a, b, rand(), rand()];

    for (let m = 0; m < lineLength; m++) {
      const vertBase = 2 * (v * lineLength + m);
      for (let y = 0; y <= 1; y++) {
        aPos[ip++] = (m + 0.5) / lineLength;
        aPos[ip++] = (v + 0.5) / lineCount;
        aPos[ip++] = 2 * y - 1;
        for (let t = 0; t < 4; t++) aWireRandom[ir++] = rnd[t];
        aPos0[i0++] = foot0.x * REF_R;
        aPos0[i0++] = foot0.y * REF_R;
        aPos0[i0++] = foot0.z * REF_R;
        aPos1[i1++] = foot1.x * REF_R;
        aPos1[i1++] = foot1.y * REF_R;
        aPos1[i1++] = foot1.z * REF_R;
      }
      if (m < lineLength - 1) {
        indices[ii++] = vertBase;
        indices[ii++] = vertBase + 1;
        indices[ii++] = vertBase + 2;
        indices[ii++] = vertBase + 2;
        indices[ii++] = vertBase + 1;
        indices[ii++] = vertBase + 3;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aPos', new THREE.BufferAttribute(aPos, 3));
  geo.setAttribute('aPos0', new THREE.BufferAttribute(aPos0, 3));
  geo.setAttribute('aPos1', new THREE.BufferAttribute(aPos1, 3));
  geo.setAttribute('aWireRandom', new THREE.BufferAttribute(aWireRandom, 4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

/** The corona ring: a fan of quads from the limb outwards. */
function glowGeometry(radius, segments = 134) {
  const positions = new Float32Array(segments * 2 * 3);
  const indices = new Uint16Array(segments * 6);
  let p = 0, o = 0;

  for (let a = 0; a < segments; a++) {
    const s = (a / segments) * Math.PI * 2;
    const sx = Math.sin(s) * radius, sy = Math.cos(s) * radius;
    positions[p++] = sx; positions[p++] = sy; positions[p++] = 0;
    positions[p++] = sx; positions[p++] = sy; positions[p++] = 1;
  }
  for (let a = 0; a < segments; a++) {
    const i0 = 2 * a, i1 = i0 + 1;
    const i2 = 2 * ((a + 1) % segments), i3 = i2 + 1;
    indices[o++] = i0; indices[o++] = i1; indices[o++] = i2;
    indices[o++] = i2; indices[o++] = i1; indices[o++] = i3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('aPos', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

// ── Assembly ───────────────────────────────────────────────────────────────
/**
 * Build the Sun.
 *
 * `radius` is in scene units. The caller adds `group` to the scene, spins
 * `spin` at whatever rate it likes, and calls `update` once a frame before
 * rendering. `setDetail(true)` brings in the rays and prominences — they cost
 * real money, so they are only built the first time they are asked for.
 */
export function initSun({ renderer, radius, lowres = false }) {
  const scale = radius / REF_R;

  const group = new THREE.Group();
  const spin = new THREE.Group();       // granulation, rays and loops turn with the star
  group.add(spin);

  const core = new THREE.Group();
  core.scale.setScalar(scale);
  spin.add(core);

  const lightDir = new THREE.Vector3(0, 0, 1);

  // ── the baked noise ──
  const cubeSize = lowres ? 256 : 512;
  const cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, generateMipmaps: false
  });
  const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
  const perlinScene = new THREE.Scene();
  const perlinMat = new THREE.ShaderMaterial({
    vertexShader: PERLIN_VS,
    fragmentShader: PERLIN_FS,
    defines: { OCTAVES: lowres ? 4 : 5 },
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uSpatialFrequency: { value: 6 },
      uTemporalFrequency: { value: 0.1 },
      uH: { value: 1 },
      uContrast: { value: 0.25 },
      uFlatten: { value: 0.72 }
    }
  });
  perlinScene.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), perlinMat));

  // ── the photosphere ──
  const sunMat = new THREE.ShaderMaterial({
    vertexShader: SUN_VS,
    fragmentShader: SUN_FS,
    uniforms: {
      uTime: { value: 0 },
      uPerlinCube: { value: cubeRT.texture },
      uFresnelPower: { value: 1 },
      uFresnelInfluence: { value: 0.8 },
      uTint: { value: 0.2 },
      uBase: { value: 4 },
      uBrightnessOffset: { value: 1 },
      uBrightness: { value: 0.6 },
      uVisibility: { value: 1 },
      uDirection: { value: 1 },
      uLightView: { value: lightDir }
    }
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(REF_R, 64, 48), sunMat);
  core.add(sphere);

  // ── the corona ──
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VS,
    fragmentShader: GLOW_FS,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uRadius: { value: 0.4 },
      uTint: { value: 0.4 },
      uBrightness: { value: 1.06 },
      uFalloffColor: { value: 0.5 },
      uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      uCamPos: { value: new THREE.Vector3() },
      uVisibility: { value: 1 },
      uDirection: { value: 1 },
      uLightView: { value: lightDir }
    }
  });
  const glow = new THREE.Mesh(glowGeometry(radius * GLOW_R), glowMat);
  glow.frustumCulled = false;
  glow.renderOrder = 2;
  group.add(glow);                       // does not spin: a ring has no grain

  // ── rays and prominences, built on demand ──
  let rays = null, loops = null;
  let detail = false;
  let reveal = 0;                        // 0 hidden, 1 fully out

  function buildDetail() {
    const raysMat = new THREE.ShaderMaterial({
      vertexShader: RAYS_VS,
      fragmentShader: RAYS_FS,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uScale: { value: scale },
        uWidth: { value: lowres ? 0.05 : 0.03 },
        uLength: { value: 0.45 },
        uOpacity: { value: lowres ? 0.075 : 0.05 },
        uNoiseFrequency: { value: 8 },
        uNoiseAmplitude: { value: 0.4 },
        uHueSpread: { value: 0.2 },
        uHue: { value: 0.2 },
        uVisibility: { value: 0 },
        uDirection: { value: 1 },
        uLightView: { value: lightDir }
      }
    });
    rays = new THREE.Mesh(
      raysGeometry(lowres ? 1024 : 3072, lowres ? 4 : 6), raysMat
    );
    rays.frustumCulled = false;
    rays.renderOrder = 3;
    core.add(rays);

    const loopsMat = new THREE.ShaderMaterial({
      vertexShader: LOOPS_VS,
      fragmentShader: LOOPS_FS,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uScale: { value: scale },
        uWidth: { value: lowres ? 0.01 : 0.005 },
        uAmp: { value: 0.5 },
        uOpacity: { value: lowres ? 0.4 : 0.28 },
        uAlphaBlended: { value: 0.65 },
        uNoiseFrequency: { value: 4 },
        uNoiseAmplitude: { value: 0.2 },
        uHueSpread: { value: 0.16 },
        uHue: { value: 0 },
        uVisibility: { value: 0 },
        uDirection: { value: 1 },
        uLightView: { value: lightDir }
      }
    });
    loops = new THREE.Mesh(
      loopsGeometry(lowres ? 512 : 1536, lowres ? 10 : 14), loopsMat
    );
    loops.frustumCulled = false;
    loops.renderOrder = 1;
    core.add(loops);
  }

  // ── per-frame ──
  const _camPos = new THREE.Vector3();
  const _camUp = new THREE.Vector3();
  const _centre = new THREE.Vector3();
  let time = 0;
  let bakeTick = 0;

  function update(dt, camera) {
    time += dt;

    camera.updateMatrixWorld();
    camera.getWorldPosition(_camPos);
    group.getWorldPosition(_centre);
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    /* Baking six cube faces of five-octave 4-D noise is the single most
       expensive thing here. Up close it earns its keep; from across the solar
       system the Sun is a few pixels wide, so we let it go stale. */
    const every = detail ? 1 : 6;
    if (bakeTick++ % every === 0) {
      perlinMat.uniforms.uTime.value = time * 0.1;
      cubeCam.update(renderer, perlinScene);
    }

    sunMat.uniforms.uTime.value = time * 0.04;

    glowMat.uniforms.uCamUp.value.copy(_camUp);
    glowMat.uniforms.uCamPos.value.copy(_camPos);

    // Ease the rays and loops in and out rather than popping them.
    const want = detail ? 1 : 0;
    if (reveal !== want) {
      reveal += Math.sign(want - reveal) * Math.min(dt * 1.6, Math.abs(want - reveal));
      if (reveal > 0 && !rays) buildDetail();
    }
    if (rays) {
      const on = reveal > 0.001;
      rays.visible = loops.visible = on;
      if (on) {
        // Light the reveal from wherever you happen to be watching.
        lightDir.copy(_camPos).sub(_centre).normalize();
        for (const m of [rays.material, loops.material]) {
          m.uniforms.uTime.value = time;
          m.uniforms.uCamPos.value.copy(_camPos);
          m.uniforms.uVisibility.value = reveal;
        }
      }
    }
  }

  return {
    group,
    spin,
    mesh: sphere,
    update,
    setDetail(on) { detail = !!on; },
    get detail() { return detail; }
  };
}

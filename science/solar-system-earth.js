/* ============================================================================
   solar-system-earth.js — Earth's day/night terminator and atmosphere.

   A hand-written GLSL take on three.js's WebGPU/TSL example at
   threejs.org/examples/webgpu_tsl_earth.html: real day/night/normal/specular
   maps (solar-system-textures.js loads them from textures/earth/) driving
   plain THREE.ShaderMaterial rather than TSL nodes.

   Two meshes, both self-lit — like the Sun (solar-system-sun.js), Earth
   works out its own light direction rather than going through the scene's
   PointLight, so the night side can glow with city lights instead of just
   going dark:

     1. The surface. Perturbs the geometric normal with the normal map, blends
        the day and night maps by the angle to the Sun, adds a tight specular
        glint on open ocean (masked by the specular map), then tints the limb
        towards the atmosphere colour.
     2. The atmosphere. A slightly larger, back-facing shell whose fresnel
        rim shifts from blue on the dayside to orange at the terminator and
        fades out on the night side.
   ========================================================================== */
import * as THREE from 'three';

/* The orrery renders with a logarithmic depth buffer; stock materials get
   this injected for them, raw ShaderMaterials have to ask (see
   solar-system-sun.js for the same pattern). */
const chunk = THREE.ShaderChunk;
const LOG_PARS_V = chunk.logdepthbuf_pars_vertex;
const LOG_V = chunk.logdepthbuf_vertex;
const LOG_PARS_F = chunk.logdepthbuf_pars_fragment;
const LOG_F = chunk.logdepthbuf_fragment;
const COMMON = chunk.common;

// ── 1. The surface ───────────────────────────────────────────────────────
const SURFACE_VS = `
${COMMON}
${LOG_PARS_V}

varying vec2 vUv;
varying vec3 vNormalWorld;
varying vec3 vWorld;

void main(){
  vUv = uv;
  vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;
  ${LOG_V}
}
`;

const SURFACE_FS = `
${LOG_PARS_F}

varying vec2 vUv;
varying vec3 vNormalWorld;
varying vec3 vWorld;

uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uNormalMap;
uniform sampler2D uSpecularMap;
uniform vec3 uSunDir;
uniform vec3 uAmbient;
uniform vec3 uDayAtmosphere;
uniform vec3 uTwilightAtmosphere;

// Tangent-space normal mapping without precomputed tangents (Lengyel's
// method): builds a local frame from screen-space derivatives of the world
// position and UV, since the sphere geometry carries no tangent attribute.
vec3 perturbNormal(vec3 N, vec3 worldPos, vec2 uv, vec3 mapN) {
  vec3 dp1 = dFdx(worldPos);
  vec3 dp2 = dFdy(worldPos);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
  mat3 TBN = mat3(T * invmax, B * invmax, N);
  return normalize(TBN * mapN);
}

void main(){
  ${LOG_F}

  vec3 geomN = normalize(vNormalWorld);
  vec3 mapN = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
  vec3 n = perturbNormal(geomN, vWorld, vUv, mapN);
  float sunDot = dot(n, uSunDir);

  vec3 night = texture2D(uNightMap, vUv).rgb;
  vec3 day = texture2D(uDayMap, vUv).rgb;
  float water = texture2D(uSpecularMap, vUv).r;

  // A gentle Lambertian-style falloff so noon reads brighter than dawn,
  // without a full lighting model.
  day *= mix(0.55, 1.0, clamp(sunDot, 0.0, 1.0));

  float dayStrength = smoothstep(-0.25, 0.5, sunDot);
  vec3 surface = mix(night + uAmbient, day, dayStrength);

  // A tight specular sparkle where sunlight glances off open ocean — masked
  // by the specular map, which reads bright over water and dark over land.
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 reflected = reflect(-uSunDir, n);
  float glint = pow(max(dot(reflected, viewDir), 0.0), 140.0);
  surface += glint * water * dayStrength * 0.8;

  // Tint the limb towards the atmosphere colour, brightest at grazing
  // angles. Uses the smooth geometric normal so the rim stays spherical
  // rather than picking up terrain relief.
  float fresnel = 1.0 - abs(dot(viewDir, geomN));
  vec3 atmosphereColor = mix(uTwilightAtmosphere, uDayAtmosphere, smoothstep(-0.25, 0.75, sunDot));
  float atmosphereMix = clamp(smoothstep(-0.5, 1.0, sunDot) * pow(fresnel, 2.0), 0.0, 1.0);
  surface = mix(surface, atmosphereColor, atmosphereMix);

  gl_FragColor = vec4(surface, 1.0);
}
`;

// ── 2. The atmosphere shell ──────────────────────────────────────────────
const ATMOSPHERE_VS = `
${COMMON}
${LOG_PARS_V}

varying vec3 vNormalWorld;
varying vec3 vWorld;

void main(){
  vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;
  ${LOG_V}
}
`;

const ATMOSPHERE_FS = `
${LOG_PARS_F}

varying vec3 vNormalWorld;
varying vec3 vWorld;

uniform vec3 uSunDir;
uniform vec3 uDayAtmosphere;
uniform vec3 uTwilightAtmosphere;

void main(){
  ${LOG_F}

  vec3 n = normalize(vNormalWorld);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float sunDot = dot(n, uSunDir);

  // This shell is 4% larger than the globe, so only a thin sliver near its
  // own limb ever pokes out past the opaque surface below. Remapping keeps
  // the glow inside that sliver rather than peaking exactly at the true
  // (razor-thin, invisible) horizon.
  float fresnel = 1.0 - abs(dot(viewDir, n));
  float remapped = 1.0 - (fresnel - 0.73) / (1.0 - 0.73);
  float alpha = clamp(pow(max(remapped, 0.0), 3.0), 0.0, 1.0);
  alpha *= smoothstep(-0.5, 1.0, sunDot);

  vec3 color = mix(uTwilightAtmosphere, uDayAtmosphere, smoothstep(-0.25, 0.75, sunDot));
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Build Earth's surface and atmosphere meshes.
 *
 * `maps` is the `{ day, night, normal, specular }` set from earthMaps(). The
 * caller adds both meshes to the scene (rotation, tilt etc. are its job,
 * same as any other planet) and calls `update(earthWorldPos)` once a frame —
 * the Sun sits at the scene origin, so that's all the direction math needs.
 */
export function buildEarth(radius, maps) {
  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: SURFACE_VS,
    fragmentShader: SURFACE_FS,
    extensions: { derivatives: true },
    uniforms: {
      uDayMap: { value: maps.day },
      uNightMap: { value: maps.night },
      uNormalMap: { value: maps.normal },
      uSpecularMap: { value: maps.specular },
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uAmbient: { value: new THREE.Color(0x2a3a6b) },
      uDayAtmosphere: { value: new THREE.Color(0x4db2ff) },
      uTwilightAtmosphere: { value: new THREE.Color(0xbc490b) }
    }
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 44), surfaceMat);

  const atmosphereMat = new THREE.ShaderMaterial({
    vertexShader: ATMOSPHERE_VS,
    fragmentShader: ATMOSPHERE_FS,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 0, 1) },
      uDayAtmosphere: surfaceMat.uniforms.uDayAtmosphere,
      uTwilightAtmosphere: surfaceMat.uniforms.uTwilightAtmosphere
    }
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.04, 48, 32), atmosphereMat);

  const _sunDir = new THREE.Vector3();
  function update(earthWorldPos) {
    _sunDir.copy(earthWorldPos).negate().normalize();   // the Sun sits at the origin
    surfaceMat.uniforms.uSunDir.value.copy(_sunDir);
    atmosphereMat.uniforms.uSunDir.value.copy(_sunDir);
  }

  return { surface, atmosphere, update };
}

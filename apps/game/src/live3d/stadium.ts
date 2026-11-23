/**
 * Procedural stadium of the 3D view (M7): mown pitch with its markings painted on a canvas
 * texture, goalposts with their padding, LED advertising boards, four stands filled with a crowd
 * in the clubs' colours, roofs and floodlight masts. Deterministic (no random numbers: hashes).
 *
 * World units are metres: X along the pitch (try lines at ±50, dead-ball lines at ±60), Z across
 * (touchlines at ±35), Y up.
 */
import * as THREE from "three";

export interface StadiumOptions {
  home: { fill: string; ring: string };
  away: { fill: string; ring: string };
  /** Text of the advertising boards. */
  boards: string;
  /** Share of seats taken (0..1). */
  crowd: number;
  wet: boolean;
}

const PX = 20; // canvas pixels per metre
const FIELD = { w: 132, d: 84 }; // textured area (pitch + surround)

const hash = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967295;
};

function pitchTexture(wet: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = FIELD.w * PX;
  c.height = FIELD.d * PX;
  const g = c.getContext("2d")!;
  const X = (x: number) => (x + FIELD.w / 2) * PX;
  const Z = (z: number) => (z + FIELD.d / 2) * PX;
  g.fillStyle = wet ? "#1d4a2c" : "#245a33";
  g.fillRect(0, 0, c.width, c.height);
  // Mowing stripes, every 5 m across the pitch.
  for (let x = -66, i = 0; x < 66; x += 5, i++) {
    g.fillStyle = i % 2 ? (wet ? "#22553a" : "#2c6a3c") : wet ? "#1e4d30" : "#276236";
    g.fillRect(X(x), Z(-39), 5 * PX, 78 * PX);
  }
  // Grain: tiny darker and lighter blades.
  for (let i = 0; i < 90000; i++) {
    const x = hash(i, 1) * c.width;
    const y = hash(i, 2) * c.height;
    g.fillStyle = hash(i, 3) > 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.035)";
    g.fillRect(x, y, 2, 2);
  }
  // In-goals a touch darker.
  g.fillStyle = "rgba(0,0,0,0.07)";
  g.fillRect(X(-60), Z(-35), 10 * PX, 70 * PX);
  g.fillRect(X(50), Z(-35), 10 * PX, 70 * PX);
  g.strokeStyle = "rgba(255,255,255,0.92)";
  g.lineCap = "butt";
  const line = (x1: number, z1: number, x2: number, z2: number, w = 0.12) => {
    g.lineWidth = w * PX;
    g.beginPath();
    g.moveTo(X(x1), Z(z1));
    g.lineTo(X(x2), Z(z2));
    g.stroke();
  };
  const dashedX = (x: number, w = 0.1) => {
    for (let z = -35; z < 35; z += 3) line(x, z + 0.5, x, Math.min(35, z + 1.6), w);
  };
  // Boundaries and lines (try lines, 22s, halfway, 10 m, 5 m and 15 m dashes).
  line(-60, -35, 60, -35);
  line(-60, 35, 60, 35);
  line(-60, -35, -60, 35);
  line(60, -35, 60, 35);
  for (const x of [-50, 50]) line(x, -35, x, 35, 0.16);
  for (const x of [-28, 28]) line(x, -35, x, 35);
  line(0, -35, 0, 35, 0.14);
  dashedX(-10);
  dashedX(10);
  dashedX(-45, 0.08);
  dashedX(45, 0.08);
  for (const z of [-30, -20, 20, 30]) for (let x = -47; x < 48; x += 5) line(x, z, x + 1, z, 0.09);
  // Painted logo in each in-goal.
  g.save();
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.font = `800 ${5.2 * PX}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (const [x, rot] of [[-55, -Math.PI / 2], [55, Math.PI / 2]] as const) {
    g.save();
    g.translate(X(x), Z(0));
    g.rotate(rot);
    g.fillText("OVALIE MANAGER", 0, 0);
    g.restore();
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function boardTexture(text: string, colour: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0e14";
  g.fillRect(0, 0, c.width, c.height);
  g.font = "700 40px 'Barlow Condensed', 'Arial Narrow', sans-serif";
  g.textBaseline = "middle";
  let x = 20;
  let k = 0;
  while (x < c.width) {
    g.fillStyle = k % 2 ? "#ffffff" : colour;
    const t = k % 2 ? "OVALIE MANAGER" : text;
    g.fillText(t.toUpperCase(), x, 34);
    x += g.measureText(t.toUpperCase()).width + 70;
    k++;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function posts(x: number, pad: string): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#f4f4f2", roughness: 0.4 });
  const padM = new THREE.MeshStandardMaterial({ color: pad, roughness: 0.7 });
  const upright = new THREE.CylinderGeometry(0.06, 0.07, 13, 10);
  for (const z of [-2.8, 2.8]) {
    const u = new THREE.Mesh(upright, white);
    u.position.set(x, 6.5, z);
    u.castShadow = true;
    g.add(u);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2, 0.5), padM);
    p.position.set(x, 1, z);
    p.castShadow = true;
    g.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.6, 10), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x, 3, 0);
  bar.castShadow = true;
  g.add(bar);
  return g;
}

/** A stand along an edge: stepped concrete deck, crowd, back wall and roof. */
function stand(length: number, depth: number, rise: number, opts: StadiumOptions, seed: number, colours: string[], roofed = true): { group: THREE.Group; crowd: THREE.InstancedMesh } {
  const group = new THREE.Group();
  const deck = new THREE.MeshStandardMaterial({ color: "#3a3f48", roughness: 0.95 });
  const rows = Math.floor(depth / 0.85);
  // Stepped deck as one extruded profile (along +Z away from the pitch, rising in Y).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let r = 0; r < rows; r++) {
    const z = (r / rows) * depth;
    const y = 1.2 + (r / rows) * rise;
    shape.lineTo(z, y);
    shape.lineTo(z + depth / rows, y);
  }
  shape.lineTo(depth, 0);
  shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  const deckMesh = new THREE.Mesh(geo, deck);
  // Profile drawn in (X=depth, Y=height), extruded along Z: rotate so depth runs along +Z and length along X.
  deckMesh.rotation.y = -Math.PI / 2;
  deckMesh.position.x = length / 2;
  deckMesh.receiveShadow = true;
  group.add(deckMesh);
  // Back wall and roof.
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, rise + 6, 0.6), new THREE.MeshStandardMaterial({ color: "#2a2e36", roughness: 0.9 }));
  wall.position.set(0, (rise + 6) / 2, depth + 0.3);
  group.add(wall);
  if (roofed) {
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.4, depth * 0.85), new THREE.MeshStandardMaterial({ color: "#c9ccd2", roughness: 0.6, metalness: 0.3 }));
  roof.position.set(0, rise + 6.5, depth * 0.55);
  roof.rotation.x = -0.08;
  group.add(roof);
  }

  // Crowd: one instance per occupied seat (a small block with its supporter's colour).
  const seats = Math.floor(length / 0.62);
  const body = new THREE.BoxGeometry(0.44, 0.62, 0.3);
  const count = rows * seats;
  const crowd = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < seats; s++) {
      if (hash(seed + r, s) > opts.crowd) continue;
      const x = -length / 2 + (s + 0.5) * (length / seats) + (hash(r, seed + s) - 0.5) * 0.12;
      const y = 1.2 + (r / rows) * rise + 0.39 + (hash(s, r + seed) - 0.5) * 0.08;
      const z = ((r + 0.5) / rows) * depth;
      m.makeTranslation(x, y, z);
      crowd.setMatrixAt(n, m);
      col.set(colours[Math.floor(hash(seed * 7 + s, r) * colours.length)]!);
      col.offsetHSL(0, 0, (hash(s * 3, r) - 0.5) * 0.12);
      crowd.setColorAt(n, col);
      n++;
    }
  }
  crowd.count = n;
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  group.add(crowd);
  // Heads, on top of each supporter.
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
  const skins = ["#f1c7a5", "#d9a37c", "#b57a55", "#8a5a3c", "#e8b896"];
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    crowd.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    m.makeTranslation(p.x, p.y + 0.52, p.z);
    heads.setMatrixAt(i, m);
    heads.setColorAt(i, col.set(skins[Math.floor(hash(i, seed) * skins.length)]!));
  }
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  group.add(heads);
  return { group, crowd };
}

function floodlight(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 38, 8), new THREE.MeshStandardMaterial({ color: "#9aa0a8", roughness: 0.5, metalness: 0.4 }));
  mast.position.y = 19;
  g.add(mast);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 0.6), new THREE.MeshStandardMaterial({ color: "#fdfbf2", emissive: "#fff6d8", emissiveIntensity: 1.2 }));
  panel.position.y = 38.5;
  g.add(panel);
  g.position.set(x, 0, z);
  g.lookAt(0, 0, 0);
  return g;
}

export function buildStadium(scene: THREE.Scene, opts: StadiumOptions): { crowds: THREE.InstancedMesh[] } {
  // Surround (track) and pitch.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), new THREE.MeshStandardMaterial({ color: "#1b2b22", roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.w, FIELD.d), new THREE.MeshStandardMaterial({ map: pitchTexture(opts.wet), roughness: opts.wet ? 0.55 : 0.92 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);

  scene.add(posts(-50, opts.home.fill), posts(50, opts.home.fill));

  // LED boards along the touchlines and behind the dead-ball lines.
  const boardMat = (len: number) => {
    const tex = boardTexture(opts.boards, opts.home.fill);
    tex.repeat.set(len / 60, 1);
    return new THREE.MeshStandardMaterial({ map: tex, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.5 });
  };
  for (const z of [-41, 41]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(124, 0.9, 0.15), boardMat(124));
    b.position.set(0, 0.45, z);
    if (z < 0) b.rotation.y = Math.PI;
    scene.add(b);
  }
  for (const x of [-65, 65]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(76, 0.9, 0.15), boardMat(76));
    b.position.set(x, 0.45, 0);
    b.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(b);
  }

  // Stands: the home supporters fill the main stands, a corner for the away fans.
  const homeCols = [opts.home.fill, opts.home.fill, opts.home.ring, "#2b2f38", "#d8d8d8", "#4a4f5a"];
  const awayCols = [opts.away.fill, opts.away.ring, "#2b2f38", opts.home.fill];
  const crowds: THREE.InstancedMesh[] = [];
  const add = (s: { group: THREE.Group; crowd: THREE.InstancedMesh }, x: number, z: number, rot: number) => {
    s.group.position.set(x, 0, z);
    s.group.rotation.y = rot;
    scene.add(s.group);
    crowds.push(s.crowd);
  };
  add(stand(128, 26, 15, opts, 11, homeCols), 0, -44, Math.PI); // far side (seen by the TV camera)
  // Camera side: a low open stand (the TV gantry stands above it).
  add(stand(128, 16, 7, opts, 23, homeCols, false), 0, 44, 0);
  add(stand(78, 18, 10, opts, 37, homeCols), -68, 0, -Math.PI / 2);
  add(stand(78, 18, 10, opts, 53, awayCols), 68, 0, Math.PI / 2);
  for (const [x, z] of [[-70, -48], [70, -48], [-70, 48], [70, 48]] as const) scene.add(floodlight(x, z));
  return { crowds };
}

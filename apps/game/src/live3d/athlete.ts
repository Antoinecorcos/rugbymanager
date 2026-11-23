/**
 * Procedural rugby player for the 3D view (M7): an articulated body (pelvis, torso, head, arms,
 * legs) built from simple shapes, dressed in the club's kit with the shirt number on the back, and
 * posed every frame from a gesture (run cycle, scrum bind, lineout jump, tackle, kick…). Joint
 * angles ease towards their target so that gestures blend into each other.
 *
 * Local frame: the player stands on the ground at the origin and faces +Z. Limb rotations about
 * X: a negative angle swings a hanging limb forwards.
 */
import * as THREE from "three";
import type { Gesture } from "./gestures";

export interface Kit {
  shirt: string;
  shorts: string;
  socks: string;
  /** Colour of the shirt number. */
  ink: string;
}

/** Shared geometries (created once). */
const GEO = (() => {
  const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10);
  return {
    torso: cap(0.19, 0.36),
    pelvis: cap(0.17, 0.12),
    head: new THREE.SphereGeometry(0.115, 16, 12),
    hair: new THREE.SphereGeometry(0.122, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    neck: cap(0.06, 0.06),
    upperArm: cap(0.068, 0.2),
    forearm: cap(0.056, 0.2),
    hand: new THREE.SphereGeometry(0.055, 8, 6),
    thigh: cap(0.088, 0.3),
    shin: cap(0.066, 0.3),
    boot: new THREE.BoxGeometry(0.11, 0.08, 0.27),
    number: new THREE.PlaneGeometry(0.26, 0.26),
  };
})();

const SKIN = ["#f1c7a5", "#d9a37c", "#b57a55", "#8a5a3c", "#5e3b28"];
const HAIR = ["#1b1410", "#3a2a1c", "#6b4a2b", "#a07a4a", "#1b1410", "#2a2a2a"];

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.75): THREE.MeshStandardMaterial {
  const key = `${color}:${roughness}`;
  let m = materialCache.get(key);
  if (!m) materialCache.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })));
  return m;
}

const numberCache = new Map<string, THREE.MeshBasicMaterial>();
function numberMaterial(n: number, ink: string): THREE.MeshBasicMaterial {
  const key = `${n}:${ink}`;
  let m = numberCache.get(key);
  if (m) return m;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = ink;
  g.font = "700 104px 'Barlow Condensed', 'Arial Narrow', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  numberCache.set(key, m);
  return m;
}

/** Deterministic small hash of a string (skin tone, hair, scrum cap). */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Angles {
  lean: number;
  twist: number;
  tilt: number;
  lift: number;
  crouch: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shL: number;
  shR: number;
  shLz: number;
  shRz: number;
  elL: number;
  elR: number;
  head: number;
}

const REST: Angles = { lean: 0.04, twist: 0, tilt: 0, lift: 0, crouch: 0, hipL: 0, hipR: 0, kneeL: 0.08, kneeR: 0.08, shL: 0.05, shR: 0.05, shLz: 0.14, shRz: -0.14, elL: -0.25, elR: -0.25, head: 0 };

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, y = 0, cast = true) => {
  const o = new THREE.Mesh(g, m);
  o.position.y = y;
  o.castShadow = cast;
  return o;
};

export class Athlete {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private pelvis = new THREE.Group();
  private torso = new THREE.Group();
  private headG = new THREE.Group();
  private shoulderL = new THREE.Group();
  private shoulderR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeL = new THREE.Group();
  private kneeR = new THREE.Group();
  private numberMesh: THREE.Mesh;
  private kit: Kit;
  private angles: Angles = { ...REST };
  private phase = 0;
  private yaw = 0;
  private placed = false;
  /** Position on the pitch (world X, Z). */
  readonly at = new THREE.Vector2();
  number = 0;

  constructor(kit: Kit, number: number, seed: string, opts: { scrumCap?: boolean; referee?: boolean } = {}) {
    this.kit = kit;
    const h = hashOf(seed);
    const skin = mat(SKIN[h % SKIN.length]!, 0.6);
    const hair = mat(HAIR[(h >>> 4) % HAIR.length]!, 0.9);
    const shirt = mat(kit.shirt, 0.8);
    const shorts = mat(kit.shorts, 0.8);
    const socks = mat(kit.socks, 0.85);
    const boots = mat(opts.referee ? "#111111" : (h >>> 8) % 3 === 0 ? "#f2f2f2" : "#151515", 0.4);
    // Body proportions vary a little: forwards are heavier.
    const bulk = 1 + (((h >>> 12) % 100) / 100 - 0.5) * 0.12 + (number >= 1 && number <= 8 ? 0.1 : 0);
    const tall = 1 + (((h >>> 18) % 100) / 100 - 0.5) * 0.08 + (number === 4 || number === 5 ? 0.05 : 0);

    this.root.add(this.body);
    this.body.add(this.pelvis);
    this.pelvis.position.y = 0.98;
    this.pelvis.add(mesh(GEO.pelvis, shorts, 0.02));
    this.pelvis.children[0]!.scale.set(1.2 * bulk, 1, 0.95 * bulk);
    this.pelvis.children[0]!.rotation.z = Math.PI / 2;

    this.pelvis.add(this.torso);
    this.torso.position.y = 0.1;
    const chest = mesh(GEO.torso, shirt, 0.3);
    chest.scale.set(1.3 * bulk, 1, 0.82 * bulk);
    this.torso.add(chest);
    this.numberMesh = new THREE.Mesh(GEO.number, numberMaterial(number, kit.ink));
    this.numberMesh.position.set(0, 0.34, -0.162 * bulk);
    this.numberMesh.rotation.y = Math.PI;
    this.numberMesh.visible = !opts.referee && number > 0;
    this.torso.add(this.numberMesh);

    this.torso.add(this.headG);
    this.headG.position.y = 0.6;
    this.headG.add(mesh(GEO.neck, skin, -0.04));
    this.headG.add(mesh(GEO.head, skin, 0.1));
    const cap = opts.scrumCap ? mesh(GEO.hair, mat(kit.shirt, 0.6), 0.115) : mesh(GEO.hair, hair, 0.12);
    cap.rotation.x = -0.25;
    this.headG.add(cap);

    for (const [sh, el, x] of [[this.shoulderL, this.elbowL, 1], [this.shoulderR, this.elbowR, -1]] as const) {
      this.torso.add(sh);
      sh.position.set(0.25 * bulk * x, 0.48, 0);
      sh.add(mesh(GEO.upperArm, shirt, -0.14));
      sh.add(el);
      el.position.y = -0.3;
      el.add(mesh(GEO.forearm, skin, -0.13));
      el.add(mesh(GEO.hand, skin, -0.29));
    }
    for (const [hip, knee, x] of [[this.hipL, this.kneeL, 1], [this.hipR, this.kneeR, -1]] as const) {
      this.pelvis.add(hip);
      hip.position.set(0.1 * bulk * x, 0, 0);
      const thigh = mesh(GEO.thigh, skin, -0.23);
      thigh.scale.set(bulk, tall, bulk);
      hip.add(thigh);
      const short = mesh(GEO.thigh, shorts, -0.1);
      short.scale.set(bulk * 1.12, 0.45, bulk * 1.12);
      hip.add(short);
      hip.add(knee);
      knee.position.y = -0.47 * tall;
      knee.add(mesh(GEO.shin, socks, -0.22));
      const boot = mesh(GEO.boot, boots, -0.47);
      boot.position.z = 0.05;
      knee.add(boot);
    }
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = false;
    });
  }

  setNumber(n: number): void {
    if (n === this.number) return;
    this.number = n;
    this.numberMesh.material = numberMaterial(n, this.kit.ink);
    this.numberMesh.visible = n > 0;
  }

  /** Places the player (world X, Z) and poses him for this frame. `dt` in seconds. */
  update(x: number, z: number, g: Gesture, dt: number, time: number): void {
    const moved = this.placed ? Math.hypot(x - this.at.x, z - this.at.y) : 0;
    this.at.set(x, z);
    this.placed = true;
    // Run cycle driven by the distance covered (about 2.3 m per stride cycle).
    this.phase = (this.phase + (moved / 2.3) * Math.PI * 2) % (Math.PI * 2);
    // Facing: pitch angle → yaw (the player faces +Z locally).
    const targetYaw = Math.PI / 2 - g.face;
    let dy = targetYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-dt * 9));
    this.root.position.set(x, 0, z);
    this.root.rotation.y = this.yaw;

    const target = poseFor(g, this.phase, time + (this.number % 7) * 0.37);
    const k = 1 - Math.exp(-dt * (g.kind === "run" || g.kind === "carry" ? 16 : 9));
    const a = this.angles as unknown as Record<string, number>;
    const t = target as unknown as Record<string, number>;
    for (const key of Object.keys(REST)) a[key] = a[key]! + (t[key]! - a[key]!) * k;
    this.apply();
  }

  private apply(): void {
    const a = this.angles;
    this.body.rotation.x = a.tilt;
    this.body.position.y = a.lift + (a.tilt > 0.6 ? 0.12 : 0);
    this.pelvis.position.y = 0.98 - a.crouch;
    this.torso.rotation.set(a.lean, a.twist, 0);
    this.headG.rotation.x = a.head - a.lean * 0.6;
    this.shoulderL.rotation.set(a.shL, 0, a.shLz);
    this.shoulderR.rotation.set(a.shR, 0, a.shRz);
    this.elbowL.rotation.x = a.elL;
    this.elbowR.rotation.x = a.elR;
    this.hipL.rotation.x = a.hipL;
    this.hipR.rotation.x = a.hipR;
    this.kneeL.rotation.x = a.kneeL;
    this.kneeR.rotation.x = a.kneeR;
  }

  /** World position of the hands (where a carried ball sits). */
  chestPoint(out: THREE.Vector3): THREE.Vector3 {
    const fwd = 0.3 + Math.sin(this.angles.lean) * 0.4;
    out.set(this.at.x + Math.sin(this.yaw) * fwd, Math.max(0.2, 1.15 - this.angles.crouch - this.angles.tilt * 0.6 + this.angles.lift), this.at.y + Math.cos(this.yaw) * fwd);
    return out;
  }

  get facing(): number {
    return this.yaw;
  }
}

/** Target joint angles for a gesture. */
export function poseFor(g: Gesture, phase: number, time: number): Angles {
  const p: Angles = { ...REST };
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const legs = (stride: number, bend: number) => {
    p.hipL = -stride * s;
    p.hipR = stride * s;
    p.kneeL = 0.15 + bend * Math.max(0, -c);
    p.kneeR = 0.15 + bend * Math.max(0, c);
  };
  const amt = g.amount;
  switch (g.kind) {
    case "idle":
      p.lean = 0.05 + Math.sin(time * 1.3) * 0.015;
      break;
    case "run": {
      legs(0.25 + 0.6 * amt, 0.5 + 0.9 * amt);
      p.shL = 0.8 * amt * s;
      p.shR = -0.8 * amt * s;
      p.elL = p.elR = -1.3;
      p.lean = 0.1 + 0.25 * amt;
      p.crouch = 0.03 * Math.abs(Math.sin(phase * 2)) * (0.5 + amt);
      break;
    }
    case "carry":
      legs(0.25 + 0.6 * amt, 0.5 + 0.9 * amt);
      p.shL = p.shR = -0.55;
      p.shLz = 0.35;
      p.shRz = -0.35;
      p.elL = p.elR = -1.5;
      p.lean = 0.15 + 0.25 * amt;
      break;
    case "scrum":
      p.lean = 1.35 * amt + 0.05;
      p.crouch = 0.3 * amt;
      p.hipL = 0.35 * amt + Math.sin(time * 4) * 0.05;
      p.hipR = 0.15 * amt;
      p.kneeL = p.kneeR = 0.55 * amt;
      p.shL = p.shR = -1.55 * amt;
      p.shLz = 0.75 * amt;
      p.shRz = -0.75 * amt;
      p.elL = p.elR = -0.4;
      p.head = 0.9 * amt;
      break;
    case "ruck":
      p.lean = 1.05 * amt;
      p.crouch = 0.22 * amt;
      p.hipL = 0.2;
      p.hipR = -0.3;
      p.kneeL = p.kneeR = 0.6 * amt;
      p.shL = p.shR = -1.25 * amt;
      p.elL = p.elR = -0.5;
      p.head = 0.6 * amt;
      break;
    case "maul":
      p.lean = 0.85;
      p.crouch = 0.15;
      legs(0.25, 0.6);
      p.shL = p.shR = -1.4;
      p.shLz = 0.5;
      p.shRz = -0.5;
      p.elL = p.elR = -1.0;
      p.head = 0.5;
      break;
    case "jump":
      p.lift = 1.0 * amt;
      p.shL = p.shR = -3.0 * amt;
      p.shLz = 0.15;
      p.shRz = -0.15;
      p.elL = p.elR = -0.15;
      p.kneeL = p.kneeR = 0.15 + 0.3 * (1 - amt);
      p.hipL = p.hipR = -0.1;
      break;
    case "lift":
      p.shL = p.shR = -2.7 * amt;
      p.elL = p.elR = -0.4;
      p.kneeL = p.kneeR = 0.35 * (1 - amt) + 0.1;
      p.lean = -0.05;
      break;
    case "throw":
      p.shL = p.shR = -2.9 + 1.9 * amt;
      p.elL = p.elR = -1.1 * (1 - amt);
      p.lean = -0.15 + 0.3 * amt;
      break;
    case "grounded":
      p.tilt = 1.5 * Math.max(0.3, amt);
      p.shL = p.shR = -2.2;
      p.kneeL = p.kneeR = 0.4;
      break;
    case "tackled":
      p.tilt = 1.35 * amt;
      p.shL = p.shR = -0.7;
      p.elL = p.elR = -1.4;
      p.hipL = -0.6 * amt;
      p.kneeL = 0.8 * amt;
      break;
    case "tackle":
      p.tilt = 1.2 * amt;
      p.shL = p.shR = -2.2;
      p.shLz = -0.3;
      p.shRz = 0.3;
      p.elL = p.elR = -1.0;
      p.hipL = 0.4 * amt;
      p.hipR = 0.6 * amt;
      p.head = 0.4;
      break;
    case "kick": {
      const back = amt < 0.4 ? amt / 0.4 : 1 - (amt - 0.4) / 0.6;
      const through = amt < 0.4 ? 0 : (amt - 0.4) / 0.6;
      p.hipR = 0.9 * back - 1.7 * through;
      p.kneeR = 1.3 * back + 0.1;
      p.hipL = 0.1;
      p.kneeL = 0.25;
      p.shL = -0.7;
      p.shLz = 0.8;
      p.shRz = -0.9;
      p.lean = 0.15 - 0.3 * through;
      break;
    }
    case "pass":
      p.lean = 0.45;
      p.crouch = 0.2;
      p.twist = 0.7 - 1.4 * amt;
      p.shL = p.shR = -1.3;
      p.elL = p.elR = -0.5;
      p.kneeL = p.kneeR = 0.5;
      break;
    case "catch":
      p.shL = p.shR = -2.4 * Math.max(0.4, amt);
      p.elL = p.elR = -0.6;
      p.lean = -0.1;
      break;
    case "dive":
      p.tilt = 1.45 * amt;
      p.lift = 0.2 * Math.sin(Math.PI * amt);
      p.shL = p.shR = -2.9;
      p.elL = p.elR = -0.2;
      p.hipL = p.hipR = 0.2;
      break;
    case "celebrate":
      p.lift = 0.12 * Math.abs(Math.sin(time * 5));
      p.shL = p.shR = -2.8;
      p.shLz = 0.45;
      p.shRz = -0.45;
      p.elL = p.elR = -0.3;
      p.lean = -0.1;
      break;
  }
  return p;
}

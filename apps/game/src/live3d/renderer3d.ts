/**
 * Three.js view of the live match (M7). Same contract as the PixiJS view (`LiveView`): the
 * playback hands it a frame (30 positions, the ball, the current action) every animation frame.
 * It poses the players (gestures), moves the ball, follows play with a TV direction and draws the
 * stadium, the crowd, the weather and the ball carrier's caption.
 */
import * as THREE from "three";
import type { Frame, LiveView, TeamColours } from "../live/renderer";
import { Athlete, type Kit } from "./athlete";
import { CUT_SHOTS, shotFor, toWorld, type CameraMode, type Shot } from "./director";
import { attackAngle, playerGestures, velocitiesBetween, type Gesture } from "./gestures";
import { buildStadium } from "./stadium";

export interface Match3DOptions {
  colours: [TeamColours, TeamColours];
  /** Club colours (primary, secondary) of each team, for shorts and socks. */
  clubColours: [[string, string], [string, string]];
  weather: string;
  /** Text of the advertising boards (competition). */
  boards: string;
}

const dark = (hex: string) => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.l;
};

function kitOf(c: TeamColours, club: [string, string]): Kit {
  // Shorts: the club's other colour, or navy/white for contrast; socks in the ring colour.
  const other = club[0].toLowerCase() === c.fill.toLowerCase() ? club[1] : club[0];
  const shorts = Math.abs(dark(other) - dark(c.fill)) > 0.12 ? other : dark(c.fill) > 0.5 ? "#1c2333" : "#f2f2f2";
  return { shirt: c.fill, shorts, socks: c.ring, ink: c.ink };
}

/** WebGL available in this browser? */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export class Match3DRenderer implements LiveView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 600);
  private host: HTMLElement;
  private athletes: [Athlete[], Athlete[]] = [[], []];
  private referee: Athlete;
  private refPos = new THREE.Vector2(0, 0);
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private tag: HTMLDivElement;
  private names: [(string | null)[], (string | null)[]] = [[], []];
  private numbers: [(number | null)[], (number | null)[]] = [[], []];
  private frame: Frame | null = null;
  private prev: Frame | undefined;
  private prevTime = 0;
  private ticks: ((ms: number) => void)[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private mode: CameraMode = "tv";
  private follow = true;
  private shot: Shot | null = null;
  private camPos = new THREE.Vector3(0, 30, 90);
  private camTarget = new THREE.Vector3();
  private rain: THREE.Points | null = null;
  private resize: ResizeObserver;
  private spin = 0;
  private destroyed = false;

  private constructor(host: HTMLElement, opts: Match3DOptions) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "Terrain : vue 3D du match en direct");
    canvas.setAttribute("role", "img");
    canvas.style.display = "block";
    host.appendChild(canvas);
    this.tag = document.createElement("div");
    this.tag.className = "live3d-tag";
    host.appendChild(this.tag);

    const wet = opts.weather === "wet";
    this.setupLights(opts.weather);
    buildStadium(this.scene, { home: opts.colours[0], away: opts.colours[1], boards: opts.boards, crowd: 0.86, wet });
    if (wet) this.rain = this.makeRain();

    for (const side of [0, 1] as const) {
      const kit = kitOf(opts.colours[side], opts.clubColours[side]);
      for (let slot = 1; slot <= 15; slot++) {
        const a = new Athlete(kit, slot, `${side}:${slot}`, { scrumCap: slot <= 8 && (slot * 7 + side) % 4 === 0 });
        a.root.visible = false;
        this.athletes[side].push(a);
        this.scene.add(a.root);
      }
    }
    this.referee = new Athlete({ shirt: "#1d2a2f", shorts: "#11161a", socks: "#1d2a2f", ink: "#ffffff" }, 0, "referee", { referee: true });
    this.scene.add(this.referee.root);

    // Rugby ball: an ellipsoid with a printed panel.
    const bc = document.createElement("canvas");
    bc.width = 128;
    bc.height = 64;
    const g = bc.getContext("2d")!;
    g.fillStyle = "#f4f1e8";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#c8102e";
    g.fillRect(0, 26, 128, 6);
    g.fillStyle = "#1f3b82";
    g.fillRect(0, 34, 128, 4);
    const tex = new THREE.CanvasTexture(bc);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
    this.ball.scale.set(0.1, 0.1, 0.15);
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
  }

  static async create(host: HTMLElement, opts: Match3DOptions): Promise<Match3DRenderer> {
    await document.fonts?.ready;
    const r = new Match3DRenderer(host, opts);
    r.start();
    return r;
  }

  private setupLights(weather: string): void {
    const wet = weather === "wet";
    const sky = wet ? "#7d8790" : weather === "windy" ? "#8fb2cf" : "#7fb0dc";
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 160, 420);
    this.scene.add(new THREE.HemisphereLight(wet ? "#c4ccd4" : "#dfeeff", "#2c3a2a", wet ? 1.3 : 1.05));
    const sun = new THREE.DirectionalLight(wet ? "#e6ebf0" : "#fff1d6", wet ? 0.9 : 2.3);
    sun.position.set(-60, 90, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -75;
    s.right = 75;
    s.top = 55;
    s.bottom = -55;
    s.near = 10;
    s.far = 260;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
  }

  private makeRain(): THREE.Points {
    const n = 9000;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = ((i * 7919) % 1600) / 10 - 80;
      pos[i * 3 + 1] = ((i * 104729) % 400) / 10;
      pos[i * 3 + 2] = ((i * 1299709) % 1100) / 10 - 55;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#d9e4ee", size: 0.09, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(pts);
    return pts;
  }

  private fit(): void {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private start(): void {
    const loop = (now: number) => {
      if (this.destroyed) return;
      const dt = this.last ? Math.min(100, now - this.last) : 16;
      this.last = now;
      for (const fn of this.ticks) fn(dt);
      this.draw(dt / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  onTick(fn: (deltaMs: number) => void): void {
    this.ticks.push(fn);
  }

  setFollow(on: boolean): void {
    this.follow = on;
  }

  /** Camera: TV direction, high camera, or the whole pitch. */
  setCamera(mode: CameraMode): void {
    this.mode = mode;
  }

  setNumbers(side: 0 | 1, numbers: (number | null)[], names?: (string | null)[]): void {
    this.numbers[side] = numbers;
    if (names) this.names[side] = names;
    numbers.forEach((n, i) => this.athletes[side][i]?.setNumber(n ?? 0));
  }

  render(frame: Frame): void {
    this.frame = frame;
  }

  private draw(dt: number): void {
    this.time += dt;
    const f = this.frame;
    // Nothing moves (pause, penalty decision, half-time): redraw about five times a second only.
    const still = !!f && f === this.drawnFrame && this.camera.position.distanceTo(this.camGoal) < 0.05;
    this.stillFor = still ? this.stillFor + dt : 0;
    if (this.stillFor > 0.4 && this.time - this.lastDraw < 0.2) return;
    if (f) this.update(f, dt);
    if (this.rain) this.animateRain(dt);
    this.renderer.render(this.scene, this.camera);
    this.drawnFrame = f;
    this.lastDraw = this.time;
  }

  private drawnFrame: Frame | null = null;
  private stillFor = 0;
  private lastDraw = 0;
  private camGoal = new THREE.Vector3();

  private update(f: Frame, dt: number): void {
    const now = this.time * 1000;
    // Velocities from the previous frame (the playback may hand the same frame twice).
    if (!this.prev || f !== this.prev) {
      const vel = velocitiesBetween(this.prev, f, Math.max(1, now - this.prevTime));
      this.gestures = playerGestures(f, vel);
      this.prev = f;
      this.prevTime = now;
    } else if (now - this.prevTime > 150) {
      // Paused or waiting: nobody is moving.
      this.gestures = playerGestures(f, velocitiesBetween(f, f, 1));
      this.prevTime = now;
    }
    for (const side of [0, 1] as const) {
      f.players[side].forEach((p, i) => {
        const a = this.athletes[side][i]!;
        a.root.visible = !!p;
        if (!p) return;
        const g: Gesture = this.gestures?.[side][i] ?? { kind: "idle", amount: 0, face: attackAngle(side) };
        const [x, , z] = toWorld(p.x, p.y);
        a.update(x, z, g, dt, this.time);
      });
    }
    this.updateReferee(f, dt);
    this.updateBall(f, dt);
    this.updateCamera(f, dt);
    this.updateTag(f);
  }

  private gestures: ReturnType<typeof playerGestures> | null = null;

  /** The referee keeps a few metres from the ball, on the defending side of play. */
  private updateReferee(f: Frame, dt: number): void {
    const [bx, , bz] = toWorld(f.ball.x, f.ball.y);
    const side = f.action?.side ?? 0;
    const tx = bx + (side === 0 ? 4 : -4);
    const tz = bz + (bz > 0 ? -5 : 5);
    const k = 1 - Math.exp(-dt * 2.2);
    const prevX = this.refPos.x;
    const prevZ = this.refPos.y;
    this.refPos.set(prevX + (tx - prevX) * k, prevZ + (tz - prevZ) * k);
    const vx = (this.refPos.x - prevX) / Math.max(dt, 1e-3);
    const vz = (this.refPos.y - prevZ) / Math.max(dt, 1e-3);
    const speed = Math.hypot(vx, vz);
    const penalty = f.action?.kind === "penalty" && f.action.phase !== "setup";
    const face = speed > 1.4 ? Math.atan2(vz, vx) : Math.atan2(bz - this.refPos.y, bx - this.refPos.x);
    const g: Gesture = penalty ? { kind: "catch", amount: 0.7, face } : speed > 1.4 ? { kind: "run", amount: Math.min(1, speed / 8), face } : { kind: "idle", amount: 0, face };
    this.referee.update(this.refPos.x, this.refPos.y, g, dt, this.time);
  }

  private tmp = new THREE.Vector3();

  private updateBall(f: Frame, dt: number): void {
    const carrier = f.carrier && f.height < 0.6 ? this.athletes[f.carrier.side][f.carrier.slot - 1] : undefined;
    const [bx, , bz] = toWorld(f.ball.x, f.ball.y);
    if (carrier && carrier.root.visible) {
      carrier.chestPoint(this.tmp);
      this.ball.position.copy(this.tmp);
      this.ball.rotation.set(0, carrier.facing + Math.PI / 2, 0.3);
    } else {
      this.ball.position.set(bx, Math.max(0.1, f.height), bz);
      if (f.height > 0.6 && f.action?.inAir) {
        // Spiral along the flight.
        const [tx, , tz] = toWorld(f.action.to.x, f.action.to.y);
        this.spin += dt * 14;
        this.ball.rotation.set(0, Math.atan2(tx - bx, tz - bz), 0);
        this.ball.rotateZ(this.spin);
      } else this.ball.rotation.set(Math.PI / 2, 0, 0);
    }
    this.ballShadow.position.set(this.ball.position.x, 0.02, this.ball.position.z);
    this.ballShadow.visible = this.ball.position.y > 0.5;
  }

  private updateCamera(f: Frame, dt: number): void {
    const mode: CameraMode = this.follow ? this.mode : "wide";
    const shot = shotFor(mode, f);
    const cut = !this.shot || (shot.name !== this.shot.name && (CUT_SHOTS.has(shot.name) || CUT_SHOTS.has(this.shot.name)));
    const pos = this.camGoal.set(...shot.position);
    const target = new THREE.Vector3(...shot.target);
    if (cut) {
      this.camPos.copy(pos);
      this.camTarget.copy(target);
      this.camera.fov = shot.fov;
    } else {
      const k = 1 - Math.exp(-dt * (shot.name === "main" ? 2.4 : 3.5));
      this.camPos.lerp(pos, k);
      this.camTarget.lerp(target, 1 - Math.exp(-dt * 3.2));
      this.camera.fov += (shot.fov - this.camera.fov) * k;
    }
    this.shot = shot;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.camera.updateProjectionMatrix();
  }

  /** TV caption above the ball carrier: shirt number and name. */
  private updateTag(f: Frame): void {
    const c = f.carrier;
    const a = c && this.athletes[c.side][c.slot - 1];
    const name = c ? this.names[c.side][c.slot - 1] : null;
    if (!c || !a || !a.root.visible || !name || f.height > 1) {
      this.tag.style.opacity = "0";
      return;
    }
    this.tmp.set(a.at.x, 2.35, a.at.y).project(this.camera);
    if (this.tmp.z > 1) {
      this.tag.style.opacity = "0";
      return;
    }
    const x = (this.tmp.x * 0.5 + 0.5) * this.host.clientWidth;
    const y = (-this.tmp.y * 0.5 + 0.5) * this.host.clientHeight;
    const text = `${this.numbers[c.side][c.slot - 1] ?? ""} ${name}`;
    if (this.tag.textContent !== text) this.tag.textContent = text;
    this.tag.dataset.side = String(c.side);
    this.tag.style.opacity = "1";
    this.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  private animateRain(dt: number): void {
    const attr = this.rain!.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i]! -= dt * 22;
      if (arr[i]! < 0) arr[i] = 40;
    }
    attr.needsUpdate = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.InstancedMesh) {
        o.geometry?.dispose?.();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.tag.remove();
  }
}

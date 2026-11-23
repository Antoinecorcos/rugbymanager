/**
 * PixiJS "TV" view of the pitch (GDD §8, M5): sober top-down pitch, players as numbered discs in
 * club colours, the ball with its shadow, a camera that follows play. World units are metres:
 * x along the pitch (home try line at 0, in-goals to -10 / 110), y across (0..70).
 */
import { Application, Container, Graphics, Text } from "pixi.js";
import type { PlayKind, Vec } from "@ovalie/engine";

export interface TeamColours {
  fill: string;
  ink: string;
  ring: string;
}

/** The action being shown (used by the 3D view for gestures and camera shots). */
export interface FrameAction {
  kind: PlayKind;
  detail?: string;
  /** Team acting / in possession. */
  side: 0 | 1;
  /** "setup": dead time before the action (set pieces); "action": the action; "done": it has ended. */
  phase: "setup" | "action" | "done";
  /** Progress within the phase, 0..1. */
  t: number;
  /** Ball path of the action. */
  from: Vec;
  to: Vec;
  inAir: boolean;
  /** Apex height of a kick (metres). */
  apex: number;
}

export interface Frame {
  players: [(Vec | null)[], (Vec | null)[]];
  ball: Vec;
  /** Ball height above the ground (metres). */
  height: number;
  carrier?: { side: 0 | 1; slot: number };
  action?: FrameAction;
}

/** What the live screen needs from a pitch view (2D PixiJS or 3D Three.js). */
export interface LiveView {
  onTick(fn: (deltaMs: number) => void): void;
  setFollow(on: boolean): void;
  /** Shirt numbers (and names) of the players in each slot. */
  setNumbers(side: 0 | 1, numbers: (number | null)[], names?: (string | null)[]): void;
  render(frame: Frame): void;
  destroy(): void;
}

const PITCH = { x0: -10, x1: 110, y0: 0, y1: 70 };
const MARGIN = 4;
const TOKEN_R = 1.05;
const FONT_PX = 64;

const hex = (c: string): number => parseInt(c.replace("#", ""), 16);

interface Token {
  root: Container;
  disc: Graphics;
  label: Text;
  number: number;
}

export class PitchRenderer implements LiveView {
  private app: Application;
  private world = new Container();
  private tokens: [Token[], Token[]] = [[], []];
  private ball = new Graphics();
  private ballShadow = new Graphics();
  private carrierRing = new Graphics();
  private colours: [TeamColours, TeamColours];
  private camX = 50;
  private camZoom = 1;
  private follow = true;
  private target = 50;
  private destroyed = false;

  private constructor(app: Application, colours: [TeamColours, TeamColours]) {
    this.app = app;
    this.colours = colours;
  }

  static async create(host: HTMLElement, colours: [TeamColours, TeamColours]): Promise<PitchRenderer> {
    await document.fonts?.ready;
    const app = new Application();
    await app.init({ resizeTo: host, antialias: true, background: "#0d1015", resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    host.appendChild(app.canvas);
    app.canvas.setAttribute("aria-label", "Terrain : vue du match en direct");
    app.canvas.setAttribute("role", "img");
    const r = new PitchRenderer(app, colours);
    r.build();
    app.ticker.add(() => r.updateCamera());
    return r;
  }

  /** Called every animation frame by the playback (Pixi's ticker drives it). */
  onTick(fn: (deltaMs: number) => void): void {
    this.app.ticker.add((t) => fn(t.deltaMS));
  }

  setFollow(on: boolean): void {
    this.follow = on;
  }

  private build(): void {
    this.app.stage.addChild(this.world);
    this.world.addChild(this.drawPitch());
    this.world.addChild(this.ballShadow);
    for (const side of [0, 1] as const) {
      for (let slot = 1; slot <= 15; slot++) {
        const t = this.makeToken(side, slot);
        this.tokens[side].push(t);
        this.world.addChild(t.root);
      }
    }
    this.world.addChild(this.carrierRing);
    this.world.addChild(this.ball);
    this.ballShadow.ellipse(0, 0, 0.42, 0.28).fill({ color: 0x000000, alpha: 0.35 });
    this.ball.ellipse(0, 0, 0.5, 0.33).fill({ color: 0xf1ede2 }).stroke({ width: 0.09, color: 0x3b2a1a });
    this.ball.moveTo(-0.22, 0).lineTo(0.22, 0).stroke({ width: 0.06, color: 0x3b2a1a });
    this.carrierRing.circle(0, 0, TOKEN_R + 0.35).stroke({ width: 0.18, color: 0xffffff, alpha: 0.9 });
  }

  private drawPitch(): Container {
    const c = new Container();
    const g = new Graphics();
    // Surround and grass with mowing stripes every 5 m.
    g.rect(PITCH.x0 - MARGIN, PITCH.y0 - MARGIN, PITCH.x1 - PITCH.x0 + 2 * MARGIN, PITCH.y1 - PITCH.y0 + 2 * MARGIN).fill({ color: 0x173a24 });
    for (let x = PITCH.x0, i = 0; x < PITCH.x1; x += 5, i++) {
      g.rect(x, 0, 5, 70).fill({ color: i % 2 ? 0x24683c : 0x215f37 });
    }
    // In-goals slightly darker.
    g.rect(-10, 0, 10, 70).fill({ color: 0x000000, alpha: 0.12 });
    g.rect(100, 0, 10, 70).fill({ color: 0x000000, alpha: 0.12 });
    const line = (x1: number, y1: number, x2: number, y2: number, w = 0.12, a = 0.85) => g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: 0xffffff, alpha: a });
    const dashed = (x: number, a = 0.7) => {
      for (let y = 0; y < 70; y += 3) line(x, y + 0.4, x, Math.min(70, y + 1.6), 0.1, a);
    };
    // Boundaries.
    line(-10, 0, 110, 0);
    line(-10, 70, 110, 70);
    line(-10, 0, -10, 70, 0.12, 0.6);
    line(110, 0, 110, 70, 0.12, 0.6);
    // Try lines, 22s, halfway, 10 m dashed lines.
    for (const x of [0, 100]) line(x, 0, x, 70, 0.16, 0.95);
    for (const x of [22, 78]) line(x, 0, x, 70, 0.12, 0.85);
    line(50, 0, 50, 70, 0.14, 0.9);
    dashed(40);
    dashed(60);
    // 5 m and 15 m dashes parallel to the touchlines, 5 m lines from the try lines.
    for (const y of [5, 15, 55, 65]) for (let x = 3; x < 100; x += 5) line(x, y, x + 1, y, 0.09, 0.55);
    dashed(5, 0.45);
    dashed(95, 0.45);
    // Posts (seen from above: crossbar between the uprights).
    for (const x of [0, 100]) {
      g.moveTo(x, 32.2).lineTo(x, 37.8).stroke({ width: 0.3, color: 0xf6f6f6 });
      g.circle(x, 32.2, 0.28).fill({ color: 0xffffff });
      g.circle(x, 37.8, 0.28).fill({ color: 0xffffff });
    }
    c.addChild(g);
    return c;
  }

  private makeToken(side: 0 | 1, slot: number): Token {
    const root = new Container();
    const disc = new Graphics();
    const label = new Text({ text: String(slot), style: { fontFamily: "Barlow Condensed, Arial Narrow, sans-serif", fontSize: FONT_PX, fontWeight: "700", fill: this.colours[side].ink } });
    label.anchor.set(0.5);
    label.scale.set((TOKEN_R * 1.25) / FONT_PX);
    const shadow = new Graphics().circle(0.18, 0.22, TOKEN_R).fill({ color: 0x000000, alpha: 0.28 });
    this.paintDisc(disc, side);
    root.addChild(shadow, disc, label);
    root.visible = false;
    return { root, disc, label, number: slot };
  }

  private paintDisc(disc: Graphics, side: 0 | 1): void {
    const c = this.colours[side];
    disc.clear();
    disc.circle(0, 0, TOKEN_R).fill({ color: hex(c.fill) }).stroke({ width: 0.16, color: hex(c.ring) });
  }

  /** Shirt numbers shown on the tokens (slot 1..15 → number worn, 16..23 for replacements). */
  setNumbers(side: 0 | 1, numbers: (number | null)[]): void {
    numbers.forEach((n, i) => {
      const t = this.tokens[side][i]!;
      if (n !== null && n !== t.number) {
        t.number = n;
        t.label.text = String(n);
      }
    });
  }

  render(frame: Frame): void {
    if (this.destroyed) return;
    for (const side of [0, 1] as const) {
      frame.players[side].forEach((p, i) => {
        const t = this.tokens[side][i]!;
        t.root.visible = !!p;
        if (p) t.root.position.set(p.x, p.y);
      });
    }
    const lift = frame.height;
    this.ballShadow.position.set(frame.ball.x + lift * 0.12, frame.ball.y + lift * 0.18);
    this.ball.position.set(frame.ball.x, frame.ball.y - lift * 0.35);
    this.ball.scale.set(1 + lift / 9);
    this.ballShadow.visible = lift > 0.3;
    const carrier = frame.carrier && frame.players[frame.carrier.side][frame.carrier.slot - 1];
    this.carrierRing.visible = !!carrier && lift < 0.5;
    if (carrier) this.carrierRing.position.set(carrier.x, carrier.y);
    this.target = frame.ball.x;
  }

  /** Smooth TV camera: follows the ball along the pitch, or shows the whole field. */
  private updateCamera(): void {
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;
    if (w <= 0 || h <= 0) return;
    const fullScale = Math.min(w / (PITCH.x1 - PITCH.x0 + 2 * MARGIN), h / (PITCH.y1 - PITCH.y0 + 2 * MARGIN));
    // Follow mode: about 62 m of pitch visible, but never narrower than the field's width.
    const followScale = Math.min(w / 62, h / (PITCH.y1 - PITCH.y0 + 2 * MARGIN));
    const zoom = this.follow ? Math.max(fullScale, followScale) : fullScale;
    this.camZoom += (zoom - this.camZoom) * 0.08;
    if (Math.abs(this.camZoom - zoom) < 0.001 || this.camZoom === 1) this.camZoom = zoom;
    const halfView = w / this.camZoom / 2;
    const minX = PITCH.x0 - MARGIN + halfView;
    const maxX = PITCH.x1 + MARGIN - halfView;
    const goal = this.follow && minX < maxX ? Math.max(minX, Math.min(maxX, this.target)) : 50;
    this.camX += (goal - this.camX) * 0.06;
    this.world.scale.set(this.camZoom);
    this.world.position.set(w / 2 - this.camX * this.camZoom, h / 2 - 35 * this.camZoom);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy(true, { children: true });
  }
}

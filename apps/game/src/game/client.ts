/** Interface side of the game: talks to the worker, keeps the latest world snapshot. */
import { useSyncExternalStore } from "react";
import type { ContinueResult, PenaltyRule, LiveChunk, LiveInfo, LiveSnapshot, ManagerProfile, PenaltyOption, Tactics, TargetedInstructions, World } from "@ovalie/engine";
import type { CatalogueClub, Envelope, ManagerPatch, Progress, Request, Response, SaveInfo } from "./protocol";

export interface GameState {
  world: World | null;
  /** A worker command is running (Continuer, match…). */
  busy: boolean;
  /** Date being simulated during "Continuer". */
  progressDate?: string;
  /** Why the last "Continuer" stopped. */
  lastStop?: ContinueResult;
  error?: string;
}

type Listener = () => void;

class GameClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, (r: Response) => void>();
  private listeners = new Set<Listener>();
  state: GameState = { world: null, busy: false };

  constructor() {
    this.worker = new Worker(new URL("../worker/game.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent<Envelope<Response> | Progress>) => {
      const msg = ev.data;
      if (msg.id === -1) {
        this.set({ progressDate: (msg as Progress).progress.date });
        return;
      }
      const env = msg as Envelope<Response>;
      this.pending.get(env.id)?.(env.body);
      this.pending.delete(env.id);
    };
  }

  private set(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private call(body: Request): Promise<Response> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => (r.kind === "error" ? reject(new Error(r.message)) : resolve(r)));
      this.worker.postMessage({ id, body } satisfies Envelope<Request>);
    });
  }

  /** Runs a command that returns a world, with the busy flag. */
  private async worldCall(body: Request, busy = true): Promise<Extract<Response, { kind: "world" }>> {
    if (busy) this.set({ busy: true, error: undefined });
    try {
      const r = (await this.call(body)) as Extract<Response, { kind: "world" }>;
      const patch: Partial<GameState> = { world: r.world, busy: false, progressDate: undefined };
      if (r.stop) patch.lastStop = r.stop;
      this.set(patch);
      return r;
    } catch (e) {
      this.set({ busy: false, progressDate: undefined, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  async catalogue(): Promise<CatalogueClub[]> {
    return ((await this.call({ kind: "catalogue" })) as Extract<Response, { kind: "catalogue" }>).clubs;
  }
  async saveInfo(): Promise<SaveInfo | null> {
    return ((await this.call({ kind: "saveInfo" })) as Extract<Response, { kind: "saveInfo" }>).info;
  }
  load = () => this.worldCall({ kind: "load" });
  newGame = (profile: ManagerProfile, clubId: string, seed: string) => this.worldCall({ kind: "newGame", profile, clubId, seed });
  continue = () => this.worldCall({ kind: "continue" });
  playMatch = () => this.worldCall({ kind: "playMatch" });
  updateManager = (patch: ManagerPatch) => this.worldCall({ kind: "updateManager", patch }, false);
  // ---- live match (no busy overlay: the match screen shows its own state)
  async liveStart(): Promise<{ info: LiveInfo; snapshot: LiveSnapshot }> {
    const r = (await this.call({ kind: "liveStart" })) as Extract<Response, { kind: "liveStart" }>;
    return { info: r.info, snapshot: r.snapshot };
  }
  private async chunk(body: Request): Promise<LiveChunk> {
    return ((await this.call(body)) as Extract<Response, { kind: "liveChunk" }>).chunk;
  }
  liveNext = (seconds?: number) => this.chunk(seconds === undefined ? { kind: "liveNext" } : { kind: "liveNext", seconds });
  liveDecide = (choice: PenaltyOption) => this.chunk({ kind: "liveDecide", choice });
  private async snap(body: Request): Promise<{ snapshot: LiveSnapshot; error?: string | null }> {
    const r = (await this.call(body)) as Extract<Response, { kind: "liveSnapshot" }>;
    return { snapshot: r.snapshot, error: r.error ?? null };
  }
  liveTactics = (tactics: Tactics) => this.snap({ kind: "liveTactics", tactics });
  liveTargets = (targets: TargetedInstructions | undefined) => this.snap({ kind: "liveTargets", targets });
  liveAutoSubs = (on: boolean) => this.snap({ kind: "liveAutoSubs", on });
  async liveRules(rules: PenaltyRule[]): Promise<void> {
    await this.call({ kind: "liveRules", rules });
  }
  liveSub = (offId: string, onId: string) => this.snap({ kind: "liveSub", offId, onId });
  liveCancelSub = (onId: string) => this.snap({ kind: "liveCancelSub", onId });
  liveFinish = () => this.worldCall({ kind: "liveFinish" }, false);
  async liveAbort(): Promise<void> {
    await this.call({ kind: "liveAbort" });
  }

  async deleteSave(): Promise<void> {
    await this.call({ kind: "deleteSave" });
  }
  quit(): void {
    this.set({ world: null, lastStop: undefined });
  }
}

export const game = new GameClient();

export function useGame(): GameState {
  return useSyncExternalStore(game.subscribe, () => game.state);
}

/** The world of a running career (screens are only shown with one). */
export function useWorld(): World {
  const w = useGame().world;
  if (!w?.manager) throw new Error("Aucune carrière en cours");
  return w;
}

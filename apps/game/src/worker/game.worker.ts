/// <reference lib="webworker" />
/** The game worker owns the world: every change happens here, the interface receives snapshots. */
import type { World } from "@ovalie/engine";
import type { Envelope, Progress, Request, Response } from "../game/protocol";
import { applyPatch, buildCatalogue, continueWithProgress, newCareer, playToday, saveInfoOf } from "../game/session";
import { CALENDAR, DATABASE } from "./database";
import { deleteSave, readSave, readSaveInfo, writeSave } from "./save";

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;

async function autosave(): Promise<void> {
  const info = world && saveInfoOf(world);
  if (world && info) await writeSave(info, world).catch((e) => console.warn("Sauvegarde impossible", e));
}

async function handle(req: Request, id: number): Promise<Response> {
  switch (req.kind) {
    case "catalogue":
      return { kind: "catalogue", clubs: buildCatalogue(DATABASE) };
    case "saveInfo":
      return { kind: "saveInfo", info: await readSaveInfo().catch(() => null) };
    case "load":
      world = (await readSave())?.world ?? null;
      return { kind: "world", world };
    case "deleteSave":
      await deleteSave();
      return { kind: "ok" };
    case "newGame":
      world = newCareer(DATABASE, CALENDAR, req.profile, req.clubId, req.seed);
      await autosave();
      return { kind: "world", world };
    case "continue": {
      if (!world) throw new Error("Aucune partie en cours");
      let last = 0;
      const stop = continueWithProgress(world, (date) => {
        const now = performance.now();
        if (now - last > 40) {
          last = now;
          self.postMessage({ id: -1, progress: { date } } satisfies Progress);
        }
      });
      await autosave();
      void id;
      return { kind: "world", world, stop };
    }
    case "playMatch": {
      if (!world) throw new Error("Aucune partie en cours");
      const playedFixtureId = playToday(world);
      await autosave();
      return playedFixtureId ? { kind: "world", world, playedFixtureId } : { kind: "world", world };
    }
    case "updateManager":
      if (!world) throw new Error("Aucune partie en cours");
      applyPatch(world, req.patch);
      void autosave();
      return { kind: "world", world };
  }
}

self.onmessage = async (ev: MessageEvent<Envelope<Request>>) => {
  const { id, body } = ev.data;
  let res: Response;
  try {
    res = await handle(body, id);
  } catch (e) {
    res = { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }
  self.postMessage({ id, body: res } satisfies Envelope<Response>);
};

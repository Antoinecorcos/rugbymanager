/// <reference lib="webworker" />
/** The game worker owns the world: every change happens here, the interface receives snapshots. */
import {
  ensureWorldExtensions,
  WORLD_VERSION,
  LiveSession,
  promoteYouth,
  releaseYouth,
  rushBack,
  setIndividualTraining,
  setStatus,
  talkToPlayer,
  answerPress,
  book,
  boardRequest,
  hireStaff,
  makeOffer,
  acceptJob,
  startNextSeason,
  editPlayer,
  editClub,
  scoutPlayer,
  type World,
} from "@ovalie/engine";
import type { GameAction } from "../game/protocol";
import type { Envelope, Progress, Request, Response } from "../game/protocol";
import { applyPatch, buildCatalogue, continueWithProgress, newCareer, playToday, saveInfoOf } from "../game/session";
import { CALENDAR, DATABASE } from "./database";
import { decodeSaveFile, deleteSave, encodeSaveFile, listSaves, readSave, writeSave } from "./save";

declare const self: DedicatedWorkerGlobalScope;

let world: World | null = null;
/** Save slot of the running career (autosaved after each change). */
let slot = "";
/** Live match in progress (not saved: a match left half-way is replayed from the kick-off). */
let live: LiveSession | null = null;

const liveSession = (): LiveSession => {
  if (!live) throw new Error("Aucun match en direct");
  return live;
};

async function autosave(): Promise<void> {
  const info = world && slot ? saveInfoOf(world, slot) : null;
  if (world && info) await writeSave(info, world).catch((e) => console.warn("Sauvegarde impossible", e));
}

async function handle(req: Request, id: number): Promise<Response> {
  switch (req.kind) {
    case "catalogue":
      return { kind: "catalogue", clubs: buildCatalogue(DATABASE) };
    case "saves":
      return { kind: "saves", saves: await listSaves().catch(() => []) };
    case "load": {
      const saved = await readSave(req.slot);
      if (!saved) throw new Error("Sauvegarde introuvable.");
      checkVersion(saved.world);
      world = saved.world;
      // Saves from older versions get the new parts of the world (staff, academies, relationships…).
      ensureWorldExtensions(world);
      // A manual copy is loaded as a new career slot: the copy itself stays as it was.
      slot = saved.info.kind === "manual" ? newSlot() : req.slot;
      await autosave();
      return { kind: "world", world };
    }
    case "deleteSave":
      await deleteSave(req.slot);
      return { kind: "ok" };
    case "saveAs": {
      if (!world) throw new Error("Aucune partie en cours");
      const info = saveInfoOf(world, `copie-${Date.now()}`, "manual", req.name.trim() || "Sauvegarde")!;
      await writeSave(info, world);
      return { kind: "saves", saves: await listSaves() };
    }
    case "exportSave": {
      const saved = req.slot ? await readSave(req.slot) : world && slot ? { info: saveInfoOf(world, slot)!, world } : undefined;
      if (!saved) throw new Error("Sauvegarde introuvable.");
      const data = await encodeSaveFile(saved.info, saved.world);
      const name = `${saved.info.clubName} ${saved.info.date}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase();
      return { kind: "file", name: `ovalie-${name}.ovalie`, data };
    }
    case "importSave": {
      const saved = await decodeSaveFile(req.data);
      checkVersion(saved.world);
      world = saved.world;
      ensureWorldExtensions(world);
      slot = newSlot();
      await autosave();
      return { kind: "world", world };
    }
    case "newGame":
      world = newCareer(DATABASE, CALENDAR, req.profile, req.clubId, req.seed);
      slot = newSlot();
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
    case "liveStart": {
      if (!world) throw new Error("Aucune partie en cours");
      live = new LiveSession(world);
      return { kind: "liveStart", info: live.info(world), snapshot: live.snapshot() };
    }
    case "liveNext":
      return { kind: "liveChunk", chunk: liveSession().next(req.seconds) };
    case "liveDecide":
      return { kind: "liveChunk", chunk: liveSession().decide(req.choice) };
    case "liveTactics":
      return { kind: "liveSnapshot", snapshot: liveSession().setTactics(req.tactics) };
    case "liveTargets":
      return { kind: "liveSnapshot", snapshot: liveSession().setTargets(req.targets) };
    case "liveRules":
      liveSession().setRules(req.rules);
      if (world?.manager) world.manager.penaltyRules = structuredClone(req.rules);
      return { kind: "ok" };
    case "liveAutoSubs":
      return { kind: "liveSnapshot", snapshot: liveSession().setAutoSubs(req.on) };
    case "liveSub": {
      const error = liveSession().substitute(req.offId, req.onId);
      return { kind: "liveSnapshot", snapshot: liveSession().snapshot(), error };
    }
    case "liveCancelSub":
      return { kind: "liveSnapshot", snapshot: liveSession().cancelSubstitution(req.onId) };
    case "liveFinish": {
      if (!world) throw new Error("Aucune partie en cours");
      const played = liveSession().finish(world);
      live = null;
      await autosave();
      return { kind: "world", world, playedFixtureId: played.id };
    }
    case "liveAbort":
      live = null;
      return { kind: "ok" };
    case "liveHalfTime": {
      if (!world) throw new Error("Aucune partie en cours");
      return { kind: "liveHalfTime", reaction: liveSession().halfTimeTalk(world, req.talk).reaction };
    }
    case "action": {
      if (!world) throw new Error("Aucune partie en cours");
      const r = act(world, req.action);
      void autosave();
      return { kind: "action", world, ...r };
    }
    case "updateManager":
      if (!world) throw new Error("Aucune partie en cours");
      applyPatch(world, req.patch);
      void autosave();
      return { kind: "world", world };
  }
}

const newSlot = () => `carriere-${Date.now()}`;

/** A save made by a newer version of the game cannot be read safely. */
function checkVersion(w: World): void {
  if ((w.version ?? 0) > WORLD_VERSION) throw new Error("Cette sauvegarde vient d'une version plus récente du jeu : mettez le jeu à jour pour la charger.");
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

/** Runs a squad action of the manager on the world. */
function act(w: World, a: GameAction): { error: string | null; talk?: Extract<ReturnType<typeof talkToPlayer>, { reaction: unknown }>; negotiation?: Extract<ReturnType<typeof makeOffer>, { outcome: unknown }>; message?: string } {
  switch (a.type) {
    case "talk": {
      const r = talkToPlayer(w, a.playerId, a.talk);
      return "error" in r ? { error: r.error } : { error: null, talk: r };
    }
    case "status":
      return { error: setStatus(w, a.playerId, a.status) };
    case "training": {
      const club = w.clubs[w.manager!.clubId]!;
      club.training = { ...a.plan };
      return { error: null };
    }
    case "individual":
      return { error: setIndividualTraining(w, a.playerId, a.focus, a.learning) };
    case "rushBack":
      return { error: rushBack(w, a.playerId) };
    case "promote":
      return { error: promoteYouth(w, a.playerId) };
    case "release":
      return { error: releaseYouth(w, a.playerId) };
    case "scout":
      return { error: scoutPlayer(w, a.playerId) };
    case "offer": {
      const r = makeOffer(w, a.playerId, a.offer);
      return "error" in r ? { error: r.error } : { error: null, negotiation: r };
    }
    case "boardRequest": {
      const r = boardRequest(w, a.kind);
      return { error: null, message: r.text };
    }
    case "press": {
      const f = w.fixtures.find((x) => x.id === a.fixtureId);
      if (!f) return { error: "Match introuvable." };
      return { error: null, message: answerPress(w, f, a.answers) };
    }
    case "hireStaff": {
      const club = w.clubs[w.manager!.clubId]!;
      const fin = club.finances;
      const error = hireStaff(w, a.staffId, (label, amount) => {
        if (fin && amount > fin.transferBudget) return false;
        if (fin) {
          book(w, fin, label, -amount, "transfers");
          fin.transferBudget -= amount;
        }
        return true;
      });
      return { error };
    }
    case "acceptJob": {
      const error = acceptJob(w, a.clubId);
      if (error) return { error };
      const club = w.clubs[a.clubId]!;
      // At the end of a season, the new job starts with the next season.
      if (w.date > w.calendar.end) {
        const r = startNextSeason(w);
        return { error: null, message: `Vous prenez les rênes de ${club.name} pour la saison ${r.season}.` };
      }
      return { error: null, message: `Vous êtes le nouveau manager de ${club.name}.` };
    }
    case "editPlayer":
      return { error: editPlayer(w, a.playerId, a.edit) };
    case "editClub":
      return { error: editClub(w, a.clubId, a.edit) };
    case "nextSeason": {
      if (w.date <= w.calendar.end) return { error: "La saison n'est pas terminée." };
      if (w.manager?.dismissed) return { error: "Vous n'avez plus de club." };
      const r = startNextSeason(w);
      return { error: null, message: `Saison ${r.season} : ${r.transfers} transferts, ${r.retired} retraites.` };
    }
  }
}

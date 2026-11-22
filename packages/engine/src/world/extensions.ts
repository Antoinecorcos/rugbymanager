/**
 * World extensions added after the first saves (M6a): staff, academies, the manager's squad
 * relationships. `ensureWorldExtensions` is idempotent: it completes a world created by an older
 * version of the game (save migration) and is run when a world is created.
 */
import { initAcademies } from "./academy.js";
import { initSquadRelations } from "./human.js";
import { initStaff, initStaffMarket } from "./staff.js";
import { initContracts } from "./contracts.js";
import { initFinances } from "./finances.js";
import { initBoard } from "./board.js";
import { initFreeAgents } from "./market.js";
import type { World } from "./types.js";

export const WORLD_VERSION = 3;

export function ensureWorldExtensions(w: World): World {
  initStaff(w);
  initAcademies(w);
  initSquadRelations(w);
  // M6b: contracts, free agents, staff market; the manager's accounts and board.
  initContracts(w);
  initFreeAgents(w);
  initStaffMarket(w);
  if (w.manager) {
    w.manager.reputation ??= w.manager.profile.start === "bigClub" ? 65 : 30;
    initFinances(w);
    initBoard(w);
  }
  w.version = WORLD_VERSION;
  return w;
}

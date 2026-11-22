/**
 * World extensions added after the first saves (M6a): staff, academies, the manager's squad
 * relationships. `ensureWorldExtensions` is idempotent: it completes a world created by an older
 * version of the game (save migration) and is run when a world is created.
 */
import { initAcademies } from "./academy.js";
import { initSquadRelations } from "./human.js";
import { initStaff } from "./staff.js";
import type { World } from "./types.js";

export const WORLD_VERSION = 2;

export function ensureWorldExtensions(w: World): World {
  initStaff(w);
  initAcademies(w);
  initSquadRelations(w);
  w.version = WORLD_VERSION;
  return w;
}

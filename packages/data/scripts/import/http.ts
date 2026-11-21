/**
 * Polite HTTP client for the data import: disk cache, throttling, retries.
 * Run scripts with NODE_USE_ENV_PROXY=1 when behind an HTTPS proxy (see package.json).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../.cache/http");
const USER_AGENT = "OvalieManagerDataImport/0.2 (non-commercial hobby rugby management game)";

const lastHit = new Map<string, number>();
const MIN_GAP_MS: Record<string, number> = { default: 150, "fr.wikipedia.org": 2500, "en.wikipedia.org": 2500, "www.wikidata.org": 2500 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** At most N requests in flight per host (Wikipedia: 1, others: 3). */
const MAX_IN_FLIGHT: Record<string, number> = { default: 3, "fr.wikipedia.org": 1, "en.wikipedia.org": 1, "www.wikidata.org": 1 };
const inFlight = new Map<string, number>();
const waiters = new Map<string, (() => void)[]>();

async function acquire(host: string): Promise<void> {
  const max = MAX_IN_FLIGHT[host] ?? MAX_IN_FLIGHT.default!;
  while ((inFlight.get(host) ?? 0) >= max) await new Promise<void>((r) => (waiters.get(host) ?? waiters.set(host, []).get(host)!).push(r));
  inFlight.set(host, (inFlight.get(host) ?? 0) + 1);
}

function release(host: string): void {
  inFlight.set(host, (inFlight.get(host) ?? 1) - 1);
  waiters.get(host)?.shift()?.();
}

export interface FetchOptions {
  /** Ignore the cache (re-download). */
  refresh?: boolean;
}

export function cachePath(url: string): string {
  return join(CACHE_DIR, createHash("sha1").update(url).digest("hex"));
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const p = cachePath(url);
  if (!opts.refresh && existsSync(p)) return readFileSync(p, "utf8");
  const host = new URL(url).host;
  await acquire(host);
  let body: string;
  try {
    body = await download(url, host);
  } finally {
    release(host);
  }
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(p, body);
  return body;
}

async function download(url: string, host: string): Promise<string> {
  const gap = MIN_GAP_MS[host] ?? MIN_GAP_MS.default!;
  for (let attempt = 0; attempt < 6; attempt++) {
    // Reserve the next start slot for this host (spaces out request starts).
    const slot = Math.max(Date.now(), (lastHit.get(host) ?? 0) + gap);
    lastHit.set(host, slot);
    if (slot > Date.now()) await sleep(slot - Date.now());
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "*/*" }, redirect: "follow" });
      if (res.status === 404) throw new NotFoundError(url);
      if (res.status === 429 || res.status >= 500) {
        await sleep(4000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const body = await res.text();
      // Wikimedia sometimes answers a rate-limit notice with a 200 status: never cache it.
      if (body.startsWith("You are making too many requests")) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      return body;
    } catch (e) {
      if (e instanceof NotFoundError) throw e;
      if (attempt === 5) throw e;
      await sleep(3000 * (attempt + 1));
    }
  }
  throw new Error(`Giving up on ${url}`);
}

export class NotFoundError extends Error {
  constructor(url: string) {
    super(`404 ${url}`);
  }
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  return JSON.parse(await fetchText(url, opts)) as T;
}

/** Runs async tasks with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

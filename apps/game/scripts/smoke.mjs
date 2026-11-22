/**
 * End-to-end smoke test of the interface (needs a built app: `pnpm --filter @ovalie/game build`).
 * Starts `vite preview`, plays a career start in Chromium (new career → Continuer → match preparation
 * → match → report → every screen), takes screenshots and fails on any console error.
 *   pnpm --filter @ovalie/game smoke [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { preview } from "vite";

// Playwright: a local install if there is one, else a global one (require resolves NODE_PATH).
const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));

const out = process.argv[2] ?? join(import.meta.dirname, "..", ".smoke");
mkdirSync(out, { recursive: true });
const server = await preview({ root: join(import.meta.dirname, ".."), preview: { port: 4179, strictPort: false }, logLevel: "warn" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const idle = () => page.waitForSelector(".overlay", { state: "detached", timeout: 60000 });
const step = (label) => console.log(`· ${label}`);

try {
  await page.goto(url);
  await page.getByText("Nouvelle carrière").waitFor();
  await page.getByText("Stade toulousain").waitFor();
  await shot("01-nouvelle-carriere");
  step("nouvelle carrière");
  await page.fill("#mgr-name", "Jean Testeur");
  await page.fill("#seed", "smoke");
  await page.getByText("Stade toulousain").click();
  await page.getByRole("button", { name: "Commencer la carrière" }).click();
  await page.locator(".page-head__title", { hasText: "Accueil" }).waitFor({ timeout: 60000 });
  await shot("02-accueil");
  step("accueil");

  // Continuer until match day.
  for (let i = 0; i < 30; i++) {
    const label = await page.locator(".btn-continue").innerText();
    if (/jour de match/i.test(label)) break;
    await page.locator(".topbar .btn--primary").click();
    await idle();
  }
  await page.locator(".topbar .btn--primary").click();
  await page.getByRole("button", { name: "Résultat immédiat" }).waitFor();
  await shot("03-preparation");
  step("préparation");
  const apply = page.getByRole("button", { name: "Appliquer" }).first();
  if (await apply.count()) await apply.click();

  await page.goto(`${url}#/composition`);
  await page.locator(".pitch .shirt").first().waitFor();
  await shot("04-composition-staff");
  // Take over: click shirt 10 then the second player of the list.
  await page.locator(".pitch__slot").nth(9).click();
  await page.locator(".pick").nth(1).click();
  await page.getByText("Je choisis").waitFor();
  await page.waitForTimeout(300);
  await shot("05-composition-manuelle");
  step("composition");

  await page.goto(`${url}#/preparation`);
  await page.getByRole("button", { name: "Résultat immédiat" }).click();
  await page.locator(".scoreboard").waitFor({ timeout: 60000 });
  await shot("06-compte-rendu");
  await page.getByRole("tab", { name: "Statistiques" }).click();
  await shot("07-compte-rendu-stats");
  await page.getByRole("tab", { name: "Joueurs" }).click();
  await shot("08-compte-rendu-joueurs");
  step("match joué");

  for (const [hash, name, sel] of [
    ["effectif", "09-effectif", ".table tbody tr"],
    ["tactique", "11-tactique", ".tactic"],
    ["calendrier", "12-calendrier", ".fixture-row"],
    ["competitions", "13-competitions", ".table tbody tr"],
    ["competitions/champions-cup", "14-champions-cup", ".table tbody tr"],
    ["club", "15-club", ".kv"],
    ["boite", "16-boite", ".news__item"],
    ["accueil", "17-accueil-apres-match", ".next-match"],
  ]) {
    await page.goto(`${url}#/${hash}`);
    await page.locator(sel).first().waitFor();
    await shot(name);
    if (hash === "effectif") {
      await page.locator(".table tbody tr").first().click();
      await page.locator(".attr-cols").waitFor();
      await shot("10-fiche-joueur");
    }
    step(hash);
  }

  // Reload: the autosave brings the career back.
  await page.reload();
  await page.getByRole("button", { name: "Reprendre" }).click();
  await page.locator(".topbar__club-name").waitFor();
  step("reprise de la sauvegarde");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${url}#/accueil`);
  await page.waitForTimeout(300);
  await shot("18-mobile-accueil");
} catch (e) {
  await shot("echec").catch(() => {});
  errors.push(String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) :\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`\n✓ Parcours complet sans erreur — captures dans ${out}`);

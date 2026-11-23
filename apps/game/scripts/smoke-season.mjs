/**
 * End-to-end test of the next season (M6c) — needs a built app.
 * Plays the whole 2026-27 season with instant results, then the end-of-season screen (verdict,
 * job offers, 1 July), the move to 2027-28, the inbox, the World Cup and the career history.
 * Screenshots, fails on any console error. Takes about twenty minutes.
 *   pnpm --filter @ovalie/game smoke:season [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { preview } from "vite";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const out = process.argv[2] ?? join(import.meta.dirname, "..", ".smoke");
mkdirSync(out, { recursive: true });
const server = await preview({ root: join(import.meta.dirname, ".."), preview: { port: 4183, strictPort: false }, logLevel: "warn" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const idle = () => page.waitForSelector(".overlay", { state: "detached", timeout: 120000 });
const step = (label) => console.log(`· ${label}`);
const title = (t) => page.locator(".page-head__title", { hasText: t }).waitFor({ timeout: 60000 });

try {
  await page.goto(url);
  await page.getByText("Stade toulousain").waitFor();
  await page.fill("#mgr-name", "Jean Testeur");
  await page.fill("#seed", "saison");
  await page.getByText("Stade toulousain").click();
  await page.getByRole("button", { name: "Commencer la carrière" }).click();
  await title("Accueil");

  let matches = 0;
  let over = false;
  for (let i = 0; i < 4000 && !over; i++) {
    if (await page.getByText("Vous êtes démis de vos fonctions").isVisible()) throw new Error("Licencié pendant la saison");
    const label = await page.locator(".btn-continue").innerText();
    if (/bilan/i.test(label)) {
      over = true;
      break;
    }
    await page.locator(".topbar .btn--primary").click();
    if (/jour de match/i.test(label)) {
      await page.getByRole("button", { name: "Résultat immédiat" }).click();
      await page.locator(".scoreboard").waitFor({ timeout: 60000 });
      if (++matches % 10 === 0) step(`${matches} matchs joués`);
    } else await idle();
  }
  if (!over) throw new Error(`Saison inachevée au bout de ${matches} matchs`);
  step(`saison 2026-2027 terminée (${matches} matchs)`);

  await page.locator(".topbar .btn--primary").click();
  await title("Bilan de la saison");
  await page.getByText("Le président", { exact: true }).waitFor();
  await shot("50-bilan-saison");
  await page.getByText("Au 1er juillet").scrollIntoViewIfNeeded();
  await shot("51-bilan-1er-juillet");
  await page.getByRole("button", { name: "Prolonger" }).first().click();
  await page.locator(".dialog").waitFor();
  await page.getByRole("button", { name: "Faire l'offre" }).click();
  await page.locator(".dialog .banner").first().waitFor();
  await page.locator(".dialog .icon-btn").click();
  step("bilan, verdict du président, offres et prolongation");

  await page.getByRole("button", { name: /Passer à la saison 2027-2028/ }).click();
  await title("Boîte de réception");
  await page.getByText(/Début de la saison 2027-2028/).first().waitFor();
  await shot("52-nouvelle-saison-boite");
  await page.goto(`${url}#/competitions/world-cup`);
  await page.getByText("Poule A").waitFor();
  await shot("53-coupe-du-monde-2027");
  await page.goto(`${url}#/club`);
  await page.getByText("Votre carrière").waitFor();
  await page.getByText("Votre carrière").scrollIntoViewIfNeeded();
  await shot("54-club-carriere");
  await page.goto(`${url}#/calendrier`);
  await page.waitForTimeout(500);
  await shot("55-calendrier-2027-2028");
  step("saison 2027-2028");
} catch (e) {
  await shot("echec-season").catch(() => {});
  errors.push(String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) :\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`\n✓ Saison suivante sans erreur — captures dans ${out}`);

/**
 * End-to-end test of the squad management screens (M6a) — needs a built app.
 * Training plan → squad (morale, status, academy, promotion) → player talk → medical → staff →
 * pre-match team talk → instant result (team talk in the report) → home dressing room.
 *   pnpm --filter @ovalie/game smoke:club [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { preview } from "vite";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));

const out = process.argv[2] ?? join(import.meta.dirname, "..", ".smoke");
mkdirSync(out, { recursive: true });
const server = await preview({ root: join(import.meta.dirname, ".."), preview: { port: 4181, strictPort: false }, logLevel: "warn" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const idle = () => page.waitForSelector(".overlay", { state: "detached", timeout: 60000 });
const step = (label) => console.log(`· ${label}`);
const title = (t) => page.locator(".page-head__title", { hasText: t }).waitFor({ timeout: 30000 });

try {
  await page.goto(url);
  await page.getByText("Stade toulousain").waitFor();
  await page.fill("#mgr-name", "Jean Testeur");
  await page.fill("#seed", "club");
  await page.getByText("Stade toulousain").click();
  await page.getByRole("button", { name: "Commencer la carrière" }).click();
  await title("Accueil");

  await page.goto(`${url}#/entrainement`);
  await title("Entraînement");
  await page.locator(".field select.select").first().selectOption("setPiece");
  await page.getByText("Intense", { exact: true }).click();
  await page.waitForTimeout(300);
  await shot("30-entrainement");
  step("entraînement");

  await page.goto(`${url}#/effectif`);
  await page.locator(".mood").first().waitFor();
  await shot("31-effectif-moral");
  await page.getByRole("tab", { name: /Centre de formation/ }).click();
  await page.getByRole("button", { name: "Intégrer à l'effectif" }).first().waitFor();
  await shot("32-centre-de-formation");
  await page.getByRole("button", { name: "Intégrer à l'effectif" }).first().click();
  await page.getByText(/rejoint l'effectif professionnel/).waitFor();
  step("effectif et centre de formation");

  await page.goto(`${url}#/joueur/antoine-dupont`);
  await page.getByRole("button", { name: "Encourager" }).click();
  await page.locator(".reply").waitFor();
  await page.locator(".reply").scrollIntoViewIfNeeded();
  await shot("33-joueur-relation");
  step("discussion avec un joueur");

  await page.goto(`${url}#/medical`);
  await title("Médical");
  await page.goto(`${url}#/staff`);
  await title("Staff");
  await shot("34-staff");
  step("médical et staff");

  for (let i = 0; i < 40; i++) {
    if (/jour de match/i.test(await page.locator(".btn-continue").innerText())) break;
    await page.locator(".topbar .btn--primary").click();
    await idle();
  }
  await page.locator(".topbar .btn--primary").click();
  await page.getByText("Causerie d'avant-match").waitFor();
  await page.getByText("Motivant", { exact: true }).click();
  await page.getByText("Causerie d'avant-match").scrollIntoViewIfNeeded();
  await shot("35-preparation-causerie");
  await page.getByRole("button", { name: "Résultat immédiat" }).click();
  await page.getByText(/Causerie : Motivant/).waitFor({ timeout: 60000 });
  step("causerie dans le compte rendu");

  // A few weeks later: dressing room, medical centre, progression.
  for (let i = 0; i < 6; i++) {
    const label = await page.locator(".btn-continue").innerText();
    await page.locator(".topbar .btn--primary").click();
    if (/jour de match/i.test(label)) {
      await page.getByRole("button", { name: "Résultat immédiat" }).click();
      await page.locator(".scoreboard").waitFor({ timeout: 60000 });
    } else await idle();
  }
  await page.goto(`${url}#/accueil`);
  await page.getByText("Vestiaire").waitFor();
  await shot("36-accueil-vestiaire");
  await page.goto(`${url}#/medical`);
  await title("Médical");
  await shot("37-medical");
  await page.goto(`${url}#/entrainement`);
  await title("Entraînement");
  await shot("38-entrainement-semaines");
  step("vestiaire, infirmerie et automatismes après quelques semaines");

  // Editor (M8): correct a player and a club, export the corrections.
  await page.goto(`${url}#/editeur`);
  await page.locator(".page-head__title", { hasText: "Éditeur" }).waitFor();
  await page.getByLabel("Rechercher un joueur").fill("Ntamack");
  await page.getByRole("button", { name: "Modifier" }).first().click();
  await page.locator(".editor").waitFor();
  await page.fill("#ed-level", "16.4");
  await page.fill("#ed-h", "184");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText(/modifications enregistrées/).waitFor();
  await shot("71-editeur-joueur");
  await page.locator(".dialog .icon-btn").click();
  await page.goto(`${url}#/club`);
  await page.getByRole("button", { name: "Modifier" }).click();
  await page.fill("#ec-rep", "160");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await page.getByText(/modifications enregistrées/).waitFor();
  await page.locator(".dialog .icon-btn").click();
  await page.goto(`${url}#/editeur`);
  await page.getByText(/1 joueur et 1 club corrigés/).waitFor();
  await shot("72-editeur");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter les corrections" }).click();
  if (!(await download).suggestedFilename().startsWith("ovalie-corrections")) throw new Error("Export des corrections : mauvais fichier");
  step("éditeur : joueur, club et export des corrections");
} catch (e) {
  await shot("echec-club").catch(() => {});
  errors.push(String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) :\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`\n✓ Gestion de l'effectif sans erreur — captures dans ${out}`);

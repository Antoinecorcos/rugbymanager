/**
 * End-to-end test of money and market (M6b) — needs a built app.
 * Finances → president → recruitment (search, scouting, negotiation) → renewal → staff market →
 * press conference → instant result. Screenshots, fails on any console error.
 *   pnpm --filter @ovalie/game smoke:market [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { preview } from "vite";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const out = process.argv[2] ?? join(import.meta.dirname, "..", ".smoke");
mkdirSync(out, { recursive: true });
const server = await preview({ root: join(import.meta.dirname, ".."), preview: { port: 4182, strictPort: false }, logLevel: "warn" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("dialog", (d) => d.accept());
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const idle = () => page.waitForSelector(".overlay", { state: "detached", timeout: 60000 });
const step = (label) => console.log(`· ${label}`);
const title = (t) => page.locator(".page-head__title", { hasText: t }).waitFor({ timeout: 30000 });

try {
  await page.goto(url);
  await page.getByText("Section paloise").waitFor();
  await page.fill("#mgr-name", "Jean Testeur");
  await page.fill("#seed", "market");
  await page.getByText("Section paloise").click();
  await page.getByRole("button", { name: "Commencer la carrière" }).click();
  await title("Accueil");

  await page.goto(`${url}#/finances`);
  await title("Finances");
  await shot("40-finances");
  await page.goto(`${url}#/club`);
  await page.getByText(/Le président/).first().waitFor();
  await shot("41-club-president");
  step("finances et président");

  await page.goto(`${url}#/recrutement`);
  await title("Recrutement");
  await page.locator(".filters select").first().selectOption("FH");
  await page.waitForTimeout(300);
  await shot("42-recrutement-recherche");
  await page.getByRole("button", { name: "Superviser" }).first().click();
  await page.getByText(/Supervision lancée/).waitFor();
  await page.getByRole("button", { name: "Négocier" }).nth(3).click();
  await page.locator(".dialog").waitFor();
  await page.getByRole("button", { name: "Faire l'offre" }).click();
  await page.locator(".dialog .banner").first().waitFor();
  await shot("43-negociation");
  await page.locator(".dialog .icon-btn").click();
  step("recherche, supervision et négociation");

  await page.getByRole("tab", { name: /Mes contrats/ }).click();
  await page.getByRole("button", { name: "Prolonger" }).first().click();
  await page.locator(".dialog").waitFor();
  await page.getByRole("button", { name: "Faire l'offre" }).click();
  await page.locator(".dialog .banner").first().waitFor();
  await shot("44-prolongation");
  await page.locator(".dialog .icon-btn").click();
  step("prolongation");

  await page.goto(`${url}#/staff`);
  await title("Staff");
  await page.getByText("Recruter un membre du staff").scrollIntoViewIfNeeded();
  await shot("45-staff-marche");
  await page.getByRole("button", { name: "Engager" }).first().click();
  await page.locator(".dialog.confirm").getByRole("button", { name: "Engager" }).click();
  await page.getByText(/rejoint votre staff|insuffisant/).waitFor();
  step("staff");

  await page.goto(`${url}#/joueur/antoine-dupont`);
  await page.getByText(/Estimations du staff/).waitFor();
  await shot("46-joueur-inconnu");
  step("fiche d'un joueur peu connu");

  for (let i = 0; i < 40; i++) {
    if (/jour de match/i.test(await page.locator(".btn-continue").innerText())) break;
    await page.locator(".topbar .btn--primary").click();
    await idle();
  }
  await page.locator(".topbar .btn--primary").click();
  await page.getByText("Conférence de presse").waitFor();
  const groups = await page.locator('input[type="radio"][name^="press-"]').evaluateAll((els) => [...new Set(els.map((e) => e.name))]);
  for (const name of groups) await page.locator(`input[name="${name}"]`).first().check();
  await page.getByRole("button", { name: "Répondre aux journalistes" }).click();
  await page.getByText(/« Jean Testeur/).waitFor();
  await page.getByText("Conférence de presse").scrollIntoViewIfNeeded();
  await shot("47-conference-de-presse");
  await page.getByRole("button", { name: "Résultat immédiat" }).click();
  await page.locator(".scoreboard").waitFor({ timeout: 60000 });
  await page.goto(`${url}#/finances`);
  await title("Finances");
  await shot("48-finances-apres-match");
  step("presse, match et billetterie");
} catch (e) {
  await shot("echec-market").catch(() => {});
  errors.push(String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) :\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`\n✓ Argent et marché sans erreur — captures dans ${out}`);

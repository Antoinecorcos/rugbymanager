/**
 * End-to-end test of the live match (needs a built app: `pnpm --filter @ovalie/game build`).
 * New career → Continuer → preparation → "Match en direct": watches the TV view, answers a penalty
 * decision, asks for a substitution, changes a tactic, then lets the match run to the final whistle
 * and opens the report. Takes screenshots and fails on any console error.
 *   pnpm --filter @ovalie/game smoke:live [dossier-captures]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { preview } from "vite";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));

const out = process.argv[2] ?? join(import.meta.dirname, "..", ".smoke");
mkdirSync(out, { recursive: true });
const server = await preview({ root: join(import.meta.dirname, ".."), preview: { port: 4180, strictPort: false }, logLevel: "warn" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const idle = () => page.waitForSelector(".overlay", { state: "detached", timeout: 60000 });
const step = (label) => console.log(`· ${label}`);
const clock = async () => (await page.locator(".scoreboard__clock").innerText()).trim();

try {
  await page.goto(url);
  await page.getByText("Stade toulousain").waitFor();
  await page.fill("#mgr-name", "Jean Testeur");
  await page.fill("#seed", "live");
  await page.getByText("Stade toulousain").click();
  await page.getByRole("button", { name: "Commencer la carrière" }).click();
  await page.locator(".page-head__title", { hasText: "Accueil" }).waitFor({ timeout: 60000 });
  for (let i = 0; i < 30; i++) {
    if (/jour de match/i.test(await page.locator(".btn-continue").innerText())) break;
    await page.locator(".topbar .btn--primary").click();
    await idle();
  }
  await page.locator(".topbar .btn--primary").click();
  await page.getByRole("button", { name: "Match en direct" }).waitFor();
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(300);
  await shot("20-preparation-consignes");
  await page.getByRole("button", { name: "Match en direct" }).click();
  await page.locator(".live canvas").waitFor({ timeout: 30000 });
  step("match en direct lancé");

  // Full match view for a few seconds.
  await page.getByRole("radio", { name: "Match complet" }).click().catch(() => page.getByText("Match complet").click());
  await page.waitForTimeout(6000);
  await shot("21-direct-match-complet");
  step(`vue TV — ${await clock()}`);

  // Penalty decision: speed up until the modal shows, answer it.
  await page.getByRole("radio", { name: "×4" }).click().catch(() => page.getByText("×4", { exact: true }).click());
  await page.locator(".decision").waitFor({ timeout: 240000 });
  await shot("22-direct-decision-penalite");
  await page.locator(".decision__option").first().click();
  step("décision de pénalité");

  // Substitution + live tactics.
  await page.getByRole("tab", { name: "Joueurs" }).click();
  await page.getByRole("button", { name: "Faire entrer" }).last().click();
  await page.locator(".roster__row.is-target").nth(11).click();
  await page.waitForTimeout(400);
  await shot("23-direct-joueurs");
  await page.getByRole("tab", { name: "Consignes" }).click();
  await page.waitForTimeout(300);
  await shot("24-direct-consignes");
  await page.getByRole("tab", { name: "Stats" }).click();
  await page.getByRole("tab", { name: "Direct" }).click();
  step("remplacement et consignes");

  // Highlights then the rest without images; answer decisions as they come (or let the countdown run once).
  await page.getByText("Temps forts", { exact: true }).click();
  await page.waitForTimeout(8000);
  await shot("25-direct-temps-forts");
  await page.getByText("Sans images", { exact: true }).click();
  let countdownSeen = false;
  for (let i = 0; i < 400; i++) {
    if (await page.locator(".modal-card__score").count()) break;
    if (await page.locator(".decision").count()) {
      if (!countdownSeen) {
        countdownSeen = true;
        await page.waitForTimeout(11000); // let the 10 s countdown apply the staff's advice
      } else await page.locator(".decision__option").first().click();
    }
    await page.waitForTimeout(250);
  }
  await page.locator(".modal-card__score").waitFor({ timeout: 60000 });
  await shot("26-direct-fin-du-match");
  step(`fin du match — ${await page.locator(".modal-card__score").innerText()}`);
  await page.getByRole("button", { name: "Voir le compte rendu" }).click();
  await page.locator(".page-head__title", { hasText: "Compte rendu" }).waitFor({ timeout: 30000 });
  await shot("27-compte-rendu-apres-direct");
  step("compte rendu");
} catch (e) {
  await shot("echec-direct").catch(() => {});
  errors.push(String(e));
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
if (errors.length) {
  console.error(`\n✗ ${errors.length} erreur(s) :\n` + errors.join("\n"));
  process.exit(1);
}
console.log(`\n✓ Match en direct sans erreur — captures dans ${out}`);

# Ovalie Manager (nom de travail)

Jeu de management rugby inspiré de Football Manager, non commercial, avec données réelles.

Avant toute tâche, lire :
- `docs/01-recherche-rugby.md` — le monde du rugby (règles, compétitions, économie)
- `docs/02-game-design.md` — le GDD validé (décisions marquées ✅ = ne pas remettre en cause sans le porteur du projet)
- `docs/03-roadmap.md` — stack et étapes (M0 → M8)
- `docs/04-moteur-de-match.md` — fonctionnement du moteur de match
- `docs/05-donnees-reelles.md` — base réelle (sources, notation, overrides, validation)
- `docs/06-monde-et-saison.md` — monde et saison (calendrier réel, formats, doublons, rotation) ; la partie démarre le 1er juillet 2026
- `docs/07-interface.md` — interface manager (`apps/game`) : architecture worker, carrière dans le moteur, système de design, écrans
- `docs/08-match-en-direct.md` — match en direct (M5) : trace, couche spatiale, LiveSession, écran PixiJS, décisions de pénalité
- `docs/09-effectif-et-humain.md` — effectif et humain (M6a) : moral, confiance, discussions, causeries, entraînement, progression, médical, staff, centre de formation
- `docs/10-argent-et-marche.md` — argent et marché (M6b) : contrats estimés, salary cap, JIFF, finances, président, transferts, supervision, presse
- `docs/11-saison-suivante.md` — saison suivante (M6c) : bilan et verdict du président, passage au 1er juillet, montées et descentes, calendrier généré (Coupe du monde 2027), offres d'emploi
- `docs/12-match-3d.md` — match en 3D (M7) : rendu Three.js, gestes, réalisation TV, stade procédural

Conventions :
- Documentation et textes du jeu en français ; code et identifiants en anglais.
- Le moteur (`packages/engine`) reste du TypeScript pur, déterministe (RNG à graine), sans dépendance UI.
- Toute modification du moteur de match doit garder les tests de calibrage au vert. La trace du direct ne doit jamais tirer de nombre aléatoire (test « never changes the match »).
- Interface (`apps/game`) : le worker possède le monde, l'interface ne fait que lire des instantanés ; la logique de jeu reste dans le moteur. La 3D (`src/live3d`) ne fait qu'illustrer la couche spatiale : gestes et réalisation TV restent des fonctions pures testées. Textes en français, tokens de `src/styles/tokens.css`, statuts toujours avec icône + libellé.
- Monde : toute nouvelle partie de l'état du monde doit être complétée par `ensureWorldExtensions` (migration des sauvegardes, idempotente).
- Données : `packages/data/raw` = faits importés, `overrides/` = corrections manuelles, `db/` = base générée (ne pas l'éditer à la main : `build-db`).

Commandes : `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm sim <graine>`, `pnpm calibrate 1000`,
`pnpm saison [graine] [--jusqua AAAA-MM-JJ] [--club id] [--saisons N]`, `pnpm jeu` (interface), `pnpm build`, `pnpm --filter @ovalie/game smoke`, `smoke:live`, `smoke:club`, `smoke:market` et `smoke:season` (parcours Chromium, après build), `pnpm --filter @ovalie/data build-db`, `pnpm --filter @ovalie/data season TOP14 5`,
imports : `import:fr`, `import:en`, `import:nationale`, `import:calendar`.

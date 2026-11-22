# Ovalie Manager (nom de travail)

Jeu de management rugby inspiré de Football Manager, non commercial, avec données réelles.

Avant toute tâche, lire :
- `docs/01-recherche-rugby.md` — le monde du rugby (règles, compétitions, économie)
- `docs/02-game-design.md` — le GDD validé (décisions marquées ✅ = ne pas remettre en cause sans le porteur du projet)
- `docs/03-roadmap.md` — stack et étapes (M0 → M8)
- `docs/04-moteur-de-match.md` — fonctionnement du moteur de match
- `docs/05-donnees-reelles.md` — base réelle (sources, notation, overrides, validation)
- `docs/06-monde-et-saison.md` — monde et saison (calendrier réel, formats, doublons, rotation) ; la partie démarre le 1er juillet 2026

Conventions :
- Documentation et textes du jeu en français ; code et identifiants en anglais.
- Le moteur (`packages/engine`) reste du TypeScript pur, déterministe (RNG à graine), sans dépendance UI.
- Toute modification du moteur de match doit garder les tests de calibrage au vert.
- Données : `packages/data/raw` = faits importés, `overrides/` = corrections manuelles, `db/` = base générée (ne pas l'éditer à la main : `build-db`).

Commandes : `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm sim <graine>`, `pnpm calibrate 1000`,
`pnpm saison [graine] [--jusqua AAAA-MM-JJ] [--club id]`, `pnpm --filter @ovalie/data build-db`, `pnpm --filter @ovalie/data season TOP14 5`,
imports : `import:fr`, `import:en`, `import:nationale`, `import:calendar`.

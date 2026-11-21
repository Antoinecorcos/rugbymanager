# Ovalie Manager

Jeu de management rugby (Top 14, Pro D2, Nationale, Champions & Challenge Cup) au niveau de profondeur de Football Manager.

Voir [`docs/`](docs/) : recherche, game design et feuille de route.

## Démarrer
```bash
pnpm install
pnpm test           # tests (dont calibrage du moteur sur les moyennes du Top 14)
pnpm sim brennus    # simule un match commenté
pnpm calibrate 1000 # rapport de calibrage
pnpm --filter @ovalie/data season TOP14 5   # saisons de Top 14 avec les vrais effectifs
pnpm --filter @ovalie/data build-db         # régénère la base de joueurs notés
```

Base réelle 2026-2027 : Top 14, Pro D2, Nationale, PREM et URC (voir [`docs/05-donnees-reelles.md`](docs/05-donnees-reelles.md)).

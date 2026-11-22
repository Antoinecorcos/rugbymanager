# Ovalie Manager

Jeu de management rugby (Top 14, Pro D2, Nationale, Champions & Challenge Cup) au niveau de profondeur de Football Manager.

Voir [`docs/`](docs/) : recherche, game design et feuille de route.

## Démarrer
```bash
pnpm install
pnpm jeu            # lance le jeu : http://localhost:5173
pnpm test           # tests (dont calibrage du moteur sur les moyennes du Top 14)
pnpm sim brennus    # simule un match commenté
pnpm calibrate 1000 # rapport de calibrage
pnpm saison         # la saison 2026-2027 complète, depuis le 1er juillet 2026
pnpm saison demo --jusqua 2026-11-30 --club toulouse
pnpm --filter @ovalie/data season TOP14 5   # saisons de Top 14 avec les vrais effectifs
pnpm --filter @ovalie/data build-db         # régénère la base de joueurs notés
```

Base réelle 2026-2027 : Top 14, Pro D2, Nationale, PREM et URC (voir [`docs/05-donnees-reelles.md`](docs/05-donnees-reelles.md)).
Monde et saison : calendrier réel, coupes d'Europe, internationaux et doublons (voir [`docs/06-monde-et-saison.md`](docs/06-monde-et-saison.md)).
Interface manager : nouvelle carrière, accueil, effectif, fiche joueur, tactique, composition, préparation de match, compte rendu, calendrier, compétitions (voir [`docs/07-interface.md`](docs/07-interface.md)).

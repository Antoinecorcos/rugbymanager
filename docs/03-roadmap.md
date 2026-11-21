# Feuille de route technique

## Stack retenue
| Couche | Technologie | Pourquoi |
|---|---|---|
| Moteur (match + monde) | **TypeScript pur**, sans dépendance UI, RNG à graine | Testable, déterministe, réutilisable, tourne dans un Web Worker |
| Données | JSON versionné + schémas **Zod**, base de partie en **SQLite** | Lisible, éditable, validé |
| Interface | **React + Vite**, design system maison | Itération rapide, UI dense et soignée |
| Match 2D | **PixiJS** | Rendu 2D très fluide (WebGL) |
| Match 3D | **Three.js** (modèles riggés + animations) | 3D dans le même code, sans changer de moteur |
| Desktop | **Tauri** | Application légère pour Windows, Mac et Linux |
| Tests | **Vitest** + tests de calibrage statistique | Le moteur doit produire des scores réalistes |

Monorepo **pnpm** :
```
packages/engine   → simulation (match, saison, transferts, finances)
packages/data     → schémas + base réelle + pipeline de notation
apps/game         → interface React + rendus 2D/3D
apps/desktop      → wrapper Tauri (plus tard)
docs/             → recherche, GDD, roadmap
```

## Étapes
| # | Étape | Livrable vérifiable |
|---|---|---|
| **M0** | Fondations | Monorepo, schémas de données (joueur, club, staff, compétition), RNG, CI de tests |
| **M1** | Moteur de match v1 (headless) | Simulation complète d'un match, stats de match, **calibrage sur les moyennes du Top 14** |
| **M2** | Base de données réelle | Effectifs Top 14 + Pro D2 réels avec notes, puis PREM, URC et Nationale |
| **M3** | Monde et saison | Calendrier réel, Top 14, Pro D2, Nationale et coupes d'Europe, phases finales, internationaux simulés, doublons |
| **M4** | Interface manager | Design system, accueil, effectif, fiche joueur, tactique, préparation de match, calendrier, classements |
| **M5** | Match en 2D en direct | Vue PixiJS, consignes, remplacements, **décisions de pénalité + désobéissance** |
| **M6** | Management profond | Transferts et agents, contrats, salary cap/JIFF, finances, président, presse, moral, entraînement, médical, formation, scouting |
| **M7** | Match en 3D | Three.js, modèles et animations, caméras TV |
| **M8** | Finitions | Sauvegardes, éditeur, application desktop Tauri, équilibrage |
| Plus tard | Extensions | Mode international, PREM et URC jouables, rugby féminin |

Le **moteur de match passe avant les données** : on le calibre sur des équipes réalistes générées, puis la vraie base vient se brancher dessus.

## Organisation des sessions
- Un seul repository.
- Idéalement **une session Claude par étape** (M1, M2…), pour garder un contexte propre. Chaque session démarre en lisant `docs/`.
- Chaque étape se termine par un commit et un récapitulatif de ce qui a été vérifié.

## Point technique : la collecte des données réelles
L'environnement cloud n'a accès qu'aux registres de paquets. Pour M2, il faudra soit **autoriser quelques domaines** (Wikipédia, site de la LNR…), soit passer par l'outil de lecture web page par page, plus lent.

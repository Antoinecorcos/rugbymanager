# Finitions (M8)

Dernière étape de la feuille de route :
- de vraies sauvegardes ;
- un éditeur dans le jeu ;
- une application de bureau ;
- une passe d'équilibrage sur plusieurs saisons.

Captures : `docs/captures/70-menu-sauvegardes.png`, `71-editeur-joueur.png`, `72-editeur.png`, `73-application-bureau.png`.

## Sauvegardes — `apps/game/src/worker/save.ts`
- **Une sauvegarde par carrière**, enregistrée automatiquement après chaque journée et chaque décision, comme avant.
- **Des copies nommées** : « Sauvegarder » (en bas du menu) → « Enregistrer une copie ». Une copie fige l'état du moment.
  - Quand on la charge, la carrière repart dans une nouvelle sauvegarde : la copie reste intacte, et on peut y revenir autant de fois qu'on veut.
- **Le menu principal** liste les parties : club, manager, date, saison, et les badges « Copie » et « ✎ Éditée ».
  - **Reprendre** relance la dernière carrière.
  - **Charger**, **Exporter** et **Supprimer** agissent sur chaque partie.
  - **Importer** charge un fichier.
- **Fichiers `.ovalie`** :
  - **contenu** : la partie compressée (gzip d'un JSON), environ 1 Mo pour une partie de près de 10 Mo en mémoire ;
  - **portabilité** : un fichier passe d'un navigateur ou d'un ordinateur à l'autre ;
  - **contrôles à l'import** : un fichier qui n'est pas une sauvegarde est refusé avec un message clair, de même qu'une sauvegarde faite par une version plus récente du jeu.
- **Compatibilité** : l'ancienne sauvegarde unique (M4 à M7) est reprise telle quelle comme une partie de la liste. `ensureWorldExtensions` complète toujours les parties anciennes au chargement.
- **Stockage** : la liste se lit dans un magasin de métadonnées léger, sans charger les mondes. Elle reste donc instantanée même avec beaucoup de parties.

## Éditeur — `packages/engine/src/world/editor.ts`, écran « Éditeur »
À la manière de l'éditeur de Football Manager, il corrige la partie en cours. On y accède depuis l'écran « Éditeur » (recherche de joueurs et de clubs) ou par le bouton « Modifier » d'une fiche joueur ou d'un club.

| Cible | Ce qu'on peut modifier |
|---|---|
| **Joueur** | Prénom, nom, nationalité, date de naissance, taille, poids ; **niveau** (tous les attributs bougent d'autant) ou attributs un par un (le niveau suit) ; potentiel ; personnalité cachée ; familiarité à chaque poste ; sélections ; statut JIFF ; **club** (transfert immédiat ou joueur libéré) et contrat (salaire, échéance, statut) ; soin d'une blessure. |
| **Club** | Nom, nom court, couleurs, réputation, budget, stade, capacité, président ; pour ton club, la trésorerie, le budget salarial et le budget de recrutement. |

- **Validation** : chaque modification est vérifiée (bornes de 1 à 20, au moins un poste, contrat au-delà de la saison en cours, couleurs au format #RRGGBB…). En cas d'erreur, rien n'est changé.
- **Partie « éditée »** : une partie modifiée est marquée comme telle, et le badge apparaît dans le menu.
- **Corriger la base réelle** : les corrections des joueurs et clubs **réels** (niveau, potentiel, postes, attributs, taille, poids, couleurs, réputation) sont gardées au format des overrides de la base. Les joueurs fictifs (générés, espoirs, joueurs libres) en sont exclus.
  1. « Exporter les corrections » produit un fichier JSON ;
  2. `pnpm --filter @ovalie/data import-edits <fichier>` le fusionne dans `packages/data/overrides/` (validé par les schémas zod, les joueurs inconnus sont ignorés) ;
  3. `build-db` reconstruit la base.

  Une erreur de notation repérée en jouant profite ainsi à toutes les futures parties.

## Application de bureau — `apps/desktop` (Tauri 2)
- **Le principe** : une fenêtre native (1 600 × 960, au moins 1 280 × 760) qui embarque le jeu web tel quel (`apps/game/dist`).
  - Les sauvegardes restent dans la base IndexedDB de l'application.
  - Exporter et importer passent par les **dialogues natifs** d'ouverture et d'enregistrement, avec les modules dialog et fs de Tauri et des permissions limitées à ces opérations. Dans le navigateur, le jeu garde le téléchargement classique.
- **Commandes** :

  | Commande | Effet |
  |---|---|
  | `pnpm bureau` | Le jeu en fenêtre de bureau, en développement |
  | `pnpm bureau:build` | Les installeurs de la plateforme courante |
  | `pnpm --filter @ovalie/desktop icons` | Régénère les icônes depuis `apps/desktop/icon-source.png` |

- **Installeurs pour les trois systèmes** : le workflow GitHub « Application de bureau » (`.github/workflows/desktop.yml`) construit pour Windows (MSI et setup), macOS (DMG) et Linux (deb, AppImage, rpm).
  - Il se lance à la main depuis l'onglet Actions, ou en poussant une étiquette `v*`.
  - Les installeurs sont joints au run.
- **Prérequis pour construire en local** : Rust stable et, sous Linux, WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev` et les paquets listés dans le workflow).

## Équilibrage — `pnpm equilibrage [graines] [saisons] [club]`
Le script joue plusieurs saisons sur la vraie base, pour plusieurs graines, avec un manager dont le staff compose l'équipe. Il mesure :
- les matchs du Top 14 face aux moyennes réelles ;
- le palmarès ;
- le niveau et l'âge des championnats ;
- la progression par âge ;
- les blessures longues ;
- le parcours du manager : classement, objectif, confiance, réputation, trésorerie.

### Corrections apportées
| Constat | Correction |
|---|---|
| Une nouvelle carrière, lancée sans recharger la page, héritait de la progression des joueurs de la précédente (les mondes partageaient les objets joueurs de la base) | `createWorld` copie les joueurs et les clubs. Test de non-régression. |
| Toulouse gagnait **8 Top 14 sur 8** : l'écart d'effectif (14,8 contre 13,9) ne laissait presque aucune place à l'exploit | **Forme du jour collective** dans le moteur de match (écart type 2,8 %), et en phase finale le **sang-froid dans les grands matchs** des titulaires. L'avantage du terrain passe de 3,5 % à 4,2 % pour garder le taux réel de victoires à domicile. Calibrage : 29/29. Toulouse : **5 titres sur 8**, puis Bordeaux-Bègles et le Stade rochelais. |
| Le **top 10 mondial montait** sans cesse (15,8 → 16,2 en deux saisons ; 10 joueurs à 16+ après trois saisons) : les jeunes internationaux atteignaient presque tous leur potentiel estimé | Frein à la progression au-dessus de 14,5 de niveau. Top 10 stable à 15,8 ; 3 joueurs à 16+ après trois saisons. |
| La **Nationale se renforçait** chaque été (+0,2 par saison) | Les espoirs de Nationale et de Pro D2 ont un potentiel plus modeste que ceux du Top 14. Un club de l'IA relégué perd une partie de ses meilleurs joueurs (clauses de relégation). Les clubs de l'IA ne recrutent l'été que des joueurs libres de leur standing. |

### Mesures après corrections
(3 graines × 3 saisons, Pau confié au staff.)

| Indicateur | Jeu | Réel / attendu |
|---|---|---|
| Points par match (Top 14) | 49,4 à 51,3 | 49,7 |
| Essais par match | 5,64 à 5,91 | 5,66 |
| Victoires à domicile | 59 à 73 % (66 % en moyenne) | 66 % |
| Nuls | 2,2 à 4,4 % | 2,3 % |
| Bonus offensifs / défensifs par match | 0,31 à 0,39 / 0,21 à 0,27 | 0,34 / 0,32 |
| Top 10 mondial (niveau) | 15,74 à 15,83 | stable |
| Niveau moyen Top 14 / Pro D2 / Nationale | Top 14 13,2 → 12,9 ; Pro D2 11,2 → 11,1 ; Nationale 8,9 → 9,3 (PREM 12,8, URC 12,4) | stable, hiérarchie conservée |
| Progression sur une saison | ≤ 21 ans +0,6 à +0,9 ; 22-29 ans +0,1 ; 30 ans et plus −0,6 | les jeunes progressent, les plus de 30 ans déclinent |
| Champions du Top 14 | Toulouse 5 fois sur 7, Lyon et Bordeaux-Bègles | Toulouse favori, mais pas imbattable |
| Manager de Pau confié au staff | objectifs tenus 5 fois sur 6, un licenciement en fin de première saison | le président juge vraiment |

## Corrections en passant
- **Causerie de mi-temps** : les options affichaient les touches 1 à 5 sans que le clavier réponde. C'est corrigé, comme pour les décisions de pénalité (touches 1 à 4).
- **Parcours `smoke:live`** : il répond aux décisions au clavier. Sous rendu WebGL logiciel, Playwright ne voit jamais les boutons « stables » au-dessus de la vue 3D.

## Vérification
- **Moteur** :
  - `test/m8.test.ts` : niveau et potentiel, refus des modifications invalides, transfert puis libération, club et comptes, corrections des seuls joueurs réels, copie des joueurs à la création du monde ;
  - calibrage : 29/29 sur 1 000 matchs.
- **Données**, `test/edits.test.ts` : les corrections exportées passent les schémas des overrides et se fusionnent champ par champ.
- **Jeu**, `test/game.test.ts` :
  - migration de l'ancienne sauvegarde ;
  - plusieurs emplacements triés, avec suppression ;
  - fichier compressé relu, et refus d'un fichier quelconque.
- **Parcours Chromium** :
  - `smoke` : copie nommée, export `.ovalie`, menu des sauvegardes, reprise ;
  - `smoke:club` : éditeur d'un joueur et d'un club, export des corrections.
- **Application de bureau** :
  - **Linux, vérifié** : construction du paquet `.deb` (3,25 Mo), puis lancement dans un écran virtuel. Le menu principal et le catalogue des clubs s'affichent dans WebKitGTK et le worker du jeu tourne (capture `73-application-bureau.png`).
  - **Pas encore essayé à la main** : les dialogues natifs d'export et d'import.
  - **Windows et macOS** : passent par le workflow GitHub, qui n'a pas pu être lancé depuis cette session.

## Limites
- Les tendances de long terme (au-delà de six saisons) restent à surveiller avec `pnpm equilibrage`. La Nationale gagne encore un peu de niveau les premières saisons, le temps que les nouvelles promotions d'espoirs fassent effet.
- **La Champions Cup reste trop toulousaine** : Toulouse l'a gagnée de 5 à 7 fois sur 7-8 saisons selon les mesures. Les clubs anglais et de l'URC sont un cran en dessous dans la base, car leurs notes sont moins précises (pas de minutes officielles, voir docs/05). Corriger les notes de Leinster, des Bulls ou de Northampton avec l'éditeur, puis `import-edits`, est la piste la plus juste.
- Les bonus défensifs (0,21 à 0,27 par match) restent un peu sous le réel (0,32), comme au calibrage depuis M1.
- L'éditeur ne crée pas de nouveaux joueurs ni de nouveaux clubs, et ne modifie pas le calendrier.
- L'application de bureau n'est pas signée : Windows et macOS afficheront un avertissement au premier lancement.

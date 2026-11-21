# Données réelles — base de joueurs et notation (M2)

Code : `packages/data`. Saison de référence : **2026-2027**, date de référence des âges : **21/11/2026**.

## Ce que contient la base

| Ligue | Clubs | Joueurs | Source des effectifs | Statut dans le jeu |
|---|---|---|---|---|
| Top 14 | 14 | 802 | Sites officiels LNR + Wikipédia FR | Jouable |
| Pro D2 | 16 | 794 | Sites officiels LNR + Wikipédia FR | Jouable |
| Nationale | 14 | 582 (dont 197 générés) | Wikipédia FR (9 clubs) ; 5 clubs complétés | Jouable |
| PREM | 10 | 415 | Wikipédia EN | Simulée en arrière-plan |
| URC | 16 | 754 | Wikipédia EN | Simulée en arrière-plan |

Pour chaque club : nom, ville, stade et capacité, président (LNR), entraîneur, budget (Top 14, Pro D2, Nationale), classement de la saison précédente, couleurs.
Pour chaque joueur : nom usuel, date de naissance, nationalité sportive, taille, poids, poste(s), sélections internationales, club précédent, année d'arrivée, statut « formé au club », statistiques de championnat des dernières saisons (LNR), puis **notes** (37 attributs visibles + 8 cachés, CA/PA).

## Organisation en trois couches

```
packages/data/
  raw/<ligue>/<club>.json   ← faits collectés (importés, relisibles, corrigeables)
  overrides/players.json    ← ajustements manuels (niveau, poste, attributs…)
  overrides/clubs.json      ← ajustements manuels des clubs (couleurs, réputation)
  db/<ligue>/<club>.json    ← base du jeu, générée : raw + notation + overrides
```

- `raw/` ne contient **que des faits** et leur source (`sources.lnr`, `sources.wikipedia`, `sources.wikidata`).
- `db/` est **générée** (`pnpm --filter @ovalie/data build-db`) de façon **déterministe** : un test vérifie qu'elle est à jour.
- Un joueur de `db/` garde à côté de ses notes un bloc `info` : sélections, origine, champs **estimés** (`estimated`), joueur **généré** (`generated`) et le **détail de sa note** (`rating`), pour que le jeu puisse l'expliquer (pilier 2 du GDD).

## Les sources

| Source | Ce qu'on y prend |
|---|---|
| `top14.lnr.fr`, `prod2.lnr.fr` (officiel) | Liste des effectifs, poste (groupe), taille, poids, âge, nationalité, statistiques de carrière par saison (matchs, minutes, points, essais, pénalités, drops, cartons), président, stade, capacité, date de fondation |
| `fr.wikipedia.org` | Date de naissance, nationalité sportive, sélections, club précédent, arrivée, formé au club, poste détaillé (pilier gauche/droit…), budgets, classement 2025-26, entraîneur, couleurs ; effectifs de Nationale ; classements réels 2021-2026 (calibrage) |
| `en.wikipedia.org` | Effectifs PREM et URC, date de naissance, taille, poids, poste, sélections, matchs joués pour le club actuel |

Le client HTTP (`scripts/import/http.ts`) met tout en cache dans `packages/data/.cache/` (non versionné), limite le débit par site et ne met jamais en cache une réponse d'erreur. Les requêtes sont envoyées avec un User-Agent générique.

**Appariement LNR ↔ Wikipédia** : la LNR publie les noms d'état civil (« Joel Merkler Perez », « Daniel Tupou »), Wikipédia les noms d'usage (« Joel Merkler », « Taniela Tupou »). On apparie par inclusion des mots du nom, puis par nom de famille + année de naissance (`scripts/import/match.ts`). Le nom d'usage est conservé dans le jeu.

## Le modèle de notation

Le **niveau** d'un joueur est une note globale sur l'échelle 1-20 du moteur (≈ 13 pour un titulaire de Top 14, ≈ 11 en Pro D2). Il est la somme de composantes explicables (`src/rating/level.ts`) :

| Composante | Calcul |
|---|---|
| **Club** (`club`) | Niveau impliqué par le temps de jeu en championnat sur 3 saisons (pondérées 1 / 1 / 0,45, la saison en cours au prorata des journées jouées) : `base de la compétition + bonus d'utilisation`. Base : Top 14 11,6 · Pro D2 10,1 · PREM 11,3 · URC 11,1 · Nationale 9,4. Le bonus d'utilisation va de −1,3 (jamais aligné) à +1,2 (titulaire indiscutable) ; il mélange la part des minutes disponibles et le statut quand le joueur est aligné, pour ne pas confondre un international (absent pendant les doublons) avec un remplaçant. Sans statistiques : base − 0,6. |
| **International** | Bonus de sélections : `poids de la nation × min(1,8 ; 0,5 + 0,35 × ln(1 + sélections/2))`. Poids : 1 pour les nations du top 8 mondial, 0,8-0,85 pour l'Italie, les Fidji et le pays de Galles, 0,65-0,7 pour la Géorgie, le Japon, les Samoa, les Tonga, ~0,5 pour les autres nations établies. Rugby à 7 : +0,25. |
| **Âge** | Encore en développement avant 22 ans (24 pour la 1re ligne et les 2e lignes), déclin après 30-33 ans selon le poste. Atténué quand les statistiques existent (elles reflètent déjà le niveau actuel). |
| **Force du club** | Écart du budget (ou, à défaut, du classement précédent) à la moyenne de la ligue ; pèse surtout quand on manque de statistiques. |
| **Override** | Niveau fixé à la main pour les joueurs majeurs (`overrides/players.json`, avec une note). |

La **qualité de la donnée** est mesurée par `evidence` (0 à 1 : part de la note fondée sur des minutes réelles).

Les **attributs** (`src/rating/attributes.ts`) partent du profil du poste du moteur (`rollAttributes`, bruit gaussien à graine = identifiant du joueur), puis sont corrigés par les faits :

- **Morphologie** (écart à la moyenne du poste) : poids → puissance, résistance aux contacts, mêlée, maul, vitesse ; taille → saut en touche, détente, jeu aérien.
- **Statistiques** : buteur désigné repéré par les pénalités et transformations réussies (points au pied par 80 minutes) ; finisseurs (essais par 80 min) ; discipline (cartons par 80 min).
- **Âge** : baisse de la vitesse, de l'accélération et de la récupération après 29 ans ; gain d'expérience (décisions, sang-froid, placement, leadership).
- **Sélections** : sang-froid, leadership, « grands matchs », professionnalisme.

Le **potentiel** (PA) = niveau + marge de progression selon l'âge (+3,2 à 19 ans, 0 à 29 ans).

**Postes** (`src/rating/positions.ts`) : le groupe officiel (LNR « 1ère ligne », Wikipédia EN « Props »…) borne les postes possibles ; l'infobox et la section du tableau Wikipédia précisent (pilier gauche/droit, 3e ligne aile/centre…) ; à défaut, la morphologie tranche (pilier ≥ 123 kg → droit, centre ≥ 98 kg → premier centre, 3e ligne léger → 7).

**Effectifs complétés** : un club doit pouvoir aligner 23 joueurs toute la saison. S'il manque des joueurs capables de tenir un poste (familiarité ≥ 14, minimums dans `SQUAD_MINIMUM`), le build ajoute des joueurs **fictifs** au niveau de la ligue, marqués `info.generated = true` et d'identifiant `gen-…`. Un club sans effectif publié reçoit un effectif type de 36 joueurs (`SQUAD_TEMPLATE`) : c'est le cas de 5 clubs de Nationale (Massy, Périgueux, Rennes, Orléans, Vienne). Ailleurs, seuls 9 joueurs de complément ont été nécessaires (1 en Pro D2, 2 en PREM, 6 en URC).

## Validation

1. **Saison réelle du Top 14 simulée** (`pnpm --filter @ovalie/data season TOP14 5`) : aller-retour avec les vrais effectifs, meilleur XV chaque semaine. **29/29 indicateurs** de calibrage dans la cible (voir `docs/exemples/saison-top14.txt`). Classement moyen sur 5 saisons : Toulouse 1er, puis La Rochelle, Toulon, UBB… et Vannes (promu) dernier. Toulouse gagne ~22 matchs sur 26.
2. **Pro D2** (`season PROD2 4`) : 27/29 ; la réussite des transformations (65 %) et les offloads (9,7) passent juste sous les fourchettes du Top 14, ce qui est cohérent avec un niveau inférieur. Montauban (relégué, gros budget) et Provence Rugby dominent ; les promus Nice et Narbonne sont en bas.
   **Nationale** : 22/29 seulement — matchs moins prolifiques (~39 points), buteurs moins adroits (54 % de transformations) ; les fourchettes du Top 14 ne s'appliquent pas à une division semi-professionnelle, mais des cibles propres à la Nationale restent à établir.
3. **Confrontations entre ligues** (`pnpm --filter @ovalie/data cross-league` : chaque club de Top 14, PREM et URC contre chaque club des deux autres ligues, aller-retour) : Top 14 ~63 % de victoires, PREM ~48 %, URC ~35 % (tirée vers le bas par les franchises galloises et italiennes), cohérent avec la domination française récente en Coupe d'Europe.
4. **Statistiques réelles** (`pnpm --filter @ovalie/data real-stats`) : moyennes des saisons régulières du Top 14 2021-2026 (910 matchs) d'après les classements Wikipédia : 49,7 points, 5,66 essais, 2,3 % de nuls, **0,34 bonus offensif** et 0,32 bonus défensif par match. La cible M1 du bonus offensif (0,08-0,32) était trop basse : elle passe à 0,22-0,45.
5. Tests (`packages/data/test`) : schémas, unicité des identifiants, profondeur de 1re ligne, part de mensurations réelles, faits connus (Dupont : demi de mêlée, 1m75, né le 15/11/1996), base à jour, hiérarchie Top 14 > Pro D2, calibrage d'une saison réelle.

## Limites connues (à reprendre)

- **Contrats et salaires** : inconnus pour la plupart des joueurs (seuls les effectifs publiés au format « Reff » donnent l'échéance, ex. Pau). M6 devra les estimer.
- **JIFF** : estimé (formé au club, nationalité française, ou arrivé en France avant 20 ans), marqué `estimated`.
- **PREM / URC** : pas de minutes officielles ; le temps de jeu est estimé à partir des matchs joués pour le club actuel (infobox Wikipédia), d'où une note moins précise (`evidence` plus faible). Les Springboks, qui jouent peu en club, sont corrigés par overrides.
- **Nationale** : pas de statistiques ni de mensurations officielles (FFR) ; 5 clubs complétés par des joueurs fictifs.
- **Pro D2** : les statistiques réelles (classements) ne sont pas encore lues (format de tableau différent).
- Le moteur produit un peu moins de bonus défensifs (~0,21) que la réalité (0,32) : les matchs serrés sont un peu rares. À retravailler avec le moteur, pas avec les données.
- Les overrides couvrent 86 joueurs majeurs (Top 14, PREM, URC) ; l'éditeur (M8) permettra d'en corriger d'autres.
- Les noms des joueurs générés viennent des listes fictives du moteur (`NAME_POOLS`).

## Commandes

```bash
pnpm --filter @ovalie/data import:fr         # Top 14 + Pro D2 (LNR + Wikipédia FR) → raw/fr
pnpm --filter @ovalie/data import:en         # PREM + URC (Wikipédia EN) → raw/prem, raw/urc
pnpm --filter @ovalie/data import:nationale  # Nationale (Wikipédia FR) → raw/nationale
pnpm --filter @ovalie/data build-db          # raw + overrides → db (+ tableau de force des clubs)
pnpm --filter @ovalie/data season TOP14 5    # saisons simulées + indicateurs de calibrage
pnpm --filter @ovalie/data match toulouse bordeaux-begles   # un vrai match commenté
pnpm --filter @ovalie/data cross-league      # Top 14 vs PREM vs URC
pnpm --filter @ovalie/data real-stats        # moyennes réelles du Top 14 (Wikipédia)
```

Les imports demandent l'accès réseau aux domaines `top14.lnr.fr`, `prod2.lnr.fr`, `fr.wikipedia.org`, `en.wikipedia.org` (déjà autorisés dans l'environnement cloud « rugbymanager »). Le build, les tests et les simulations fonctionnent hors ligne.

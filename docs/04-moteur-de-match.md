# Moteur de match — fonctionnement (M1)

Code : `packages/engine/src/match/engine.ts`. C'est une simulation **par phases**, déterministe (graine).

## Boucle
Le match est une suite de **relances** (`kickoff`, `openPlay`, `scrum`, `lineout`, `penalty`, `dropout22`, `dropoutGoalLine`, `conversion`). Chaque appel à `step()` résout une relance, émet des événements et programme la suivante.

```
coup d'envoi → réception → [phase de jeu : course au près | jeu au large | jeu au pied | drop]
            → contact (plaquage, franchissement, offload, en-avant, plaquage haut)
            → ruck (conservation rapide/normale/lente, grattage, pénalité) → phase suivante…
faute → pénalité → décision (points / touche / mêlée / jouer vite) → touche → maul…
```

## Ce qui décide d'une action
- **Attributs effectifs** = note × fatigue × forme du jour × familiarité au poste × domicile (sauf terrain neutre) × moral × effet du score (relâchement quand on mène largement, rage quand on est mené ; dans le dernier quart d'heure d'un match serré, l'équipe menée pousse et celle qui mène gère).
- **Forme du jour** (M8) : celle de chaque joueur (selon sa régularité), plus une **forme collective** de l'équipe (écart type 2,8 %), et en phase finale le **sang-froid dans les grands matchs** des titulaires. L'avantage du terrain vaut +4,2 % sur les attributs. Le favori peut donc passer à travers : sans forme collective, Toulouse gagnait le Top 14 à chaque saison.
- **Morphologie** : le poids et la taille entrent dans la mêlée, le maul, la touche et les contacts.
- **Organisation défensive** (0 à 1) : chute après un ruck rapide ou un franchissement, remonte sur un ballon lent ou une phase statique. C'est elle qui crée les brèches.
- **Tactiques** : forme d'attaque, jeu au pied, tempo, offloads, défense (glissée ou rush), contestation des rucks, touche (maul ou ballon rapide), intention en mêlée.
- **Arbitre** : sévérité au sol, en mêlée et sur les cartons (petit effet, comme validé).
- **Lois 2026** : rouge 20 min avec remplacement, HIA (12 min), mêlées simulées, pénalité ramenée aux 5 m, 50:22, la mi-temps qui ne se termine qu'au ballon mort, prolongations en phase finale.

## Décisions du coach
- `controller: "human"` : à chaque pénalité, `step()` s'arrête et expose `pendingDecision` (options, recommandation du staff, probabilité de réussite au pied). On répond avec `submitPenaltyDecision(choix)`.
- **Désobéissance du capitaine** : probabilité nulle si la confiance est ≥ 0,5. En dessous, elle monte au maximum à 6 %, modulée par le tempérament, le leadership et la fin de match. Elle produit un événement `captainOverride`.

## Discipline et cartons
Comme un arbitre de Top 14, le moteur sanctionne les fautes répétées, pas seulement les fautes graves.
- **Pénalités** : environ 19 à 20 par match pour les deux équipes. En Top 14, une équipe qui en concède 20 à elle seule passe pour indisciplinée.
- **Avertissement collectif** : quand une équipe enchaîne 3 pénalités en 6 minutes, ou 2 dans ses 22 mètres, l'arbitre appelle le capitaine (événement `teamWarning`, « L'arbitre appelle le capitaine… »). L'avertissement vaut 10 minutes et s'efface à la mi-temps.
- **Carton pour cumul** : la faute suivante de l'équipe avertie a de fortes chances de valoir un carton jaune « pour cumul de fautes ». Les autres cartons viennent du jeu déloyal, des fautes volontaires (« anti-jeu ») et des pénalités répétées d'un même joueur.
- **Sévérité de l'arbitre** : elle module toutes ces probabilités.
- **Résultat** (1 500 matchs) : 1,55 carton jaune et 0,10 rouge par match. Le Top 14 réel est entre 1,4 et 1,9 jaune par match selon les saisons. Avant, le moteur ne donnait que 0,64 jaune par match : la cible du calibrage passe de 0,45-1,2 à 1,1-2.

## Calibrage
`pnpm calibrate 1000` lance 1000 matchs entre 14 équipes de niveau Top 14 et compare 29 indicateurs à des fourchettes réalistes. Les mêmes contrôles tournent dans les tests (CI).
Résultat actuel : **29/29** (voir `docs/exemples/calibrage.txt`).

**M3** : l'effet « fin de match serré » fait passer le bonus défensif de 0,21 à 0,27 par match (réel : 0,32), toujours à 29/29.

**M2** : les fourchettes des points, essais, nuls et bonus ont été vérifiées sur les vraies saisons régulières du Top 14 2021-2026 (910 matchs, `pnpm --filter @ovalie/data real-stats`). Le bonus offensif réel est de 0,34 par match : la cible passe de 0,08-0,32 à **0,22-0,45** (bonus défensif : 0,20-0,40, réel 0,32). Les autres indicateurs (rucks, plaquages, touches…) restent des estimations.
Avec les **vrais effectifs** (`pnpm --filter @ovalie/data season TOP14 5`), le moteur reste à **29/29** (voir `docs/exemples/saison-top14.txt` et `docs/05-donnees-reelles.md`).

## Sélection automatique
`selectMatchTeam(effectif, options)` (`packages/engine/src/squad/selection.ts`) choisit les 23 d'un club : postes les plus rares d'abord (piliers, talonneur, 9, 10…), forte pénalité hors poste, **spécialiste obligatoire en 1re ligne**, banc 5-3 / 6-2 / 7-1, capitaine (leadership + niveau) et buteur (meilleur buteur des titulaires). Option `freshness` : les joueurs fatigués sont pénalisés (rotation, voir `docs/06-monde-et-saison.md`).

## Commandes
```bash
pnpm install
pnpm test                 # tous les tests
pnpm sim <graine> [--all] # un match commenté (--all = tous les événements)
pnpm calibrate 1000       # rapport de calibrage
```

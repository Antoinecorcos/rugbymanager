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
- **Attributs effectifs** = note × fatigue × forme du jour × familiarité au poste × domicile × moral × effet du score (relâchement quand on mène largement, rage quand on est mené).
- **Morphologie** : le poids et la taille entrent dans la mêlée, le maul, la touche et les contacts.
- **Organisation défensive** (0 à 1) : chute après un ruck rapide ou un franchissement, remonte sur un ballon lent ou une phase statique. C'est elle qui crée les brèches.
- **Tactiques** : forme d'attaque, jeu au pied, tempo, offloads, défense (glissée ou rush), contestation des rucks, touche (maul ou ballon rapide), intention en mêlée.
- **Arbitre** : sévérité au sol, en mêlée et sur les cartons (petit effet, comme validé).
- **Lois 2026** : rouge 20 min avec remplacement, HIA (12 min), mêlées simulées, pénalité ramenée aux 5 m, 50:22, la mi-temps qui ne se termine qu'au ballon mort, prolongations en phase finale.

## Décisions du coach
- `controller: "human"` : à chaque pénalité, `step()` s'arrête et expose `pendingDecision` (options, recommandation du staff, probabilité de réussite au pied). On répond avec `submitPenaltyDecision(choix)`.
- **Désobéissance du capitaine** : probabilité nulle si la confiance est ≥ 0,5. En dessous, elle monte au maximum à 6 %, modulée par le tempérament, le leadership et la fin de match. Elle produit un événement `captainOverride`.

## Calibrage
`pnpm calibrate 1000` lance 1000 matchs entre 14 équipes de niveau Top 14 et compare 29 indicateurs à des fourchettes réalistes. Les mêmes contrôles tournent dans les tests (CI).
Résultat actuel : **29/29** (voir `docs/exemples/calibrage.txt`).
⚠️ Les fourchettes sont des **estimations** à affiner avec les vraies statistiques en M2, notamment les bonus offensifs, en limite haute.

## Commandes
```bash
pnpm install
pnpm test                 # tous les tests
pnpm sim <graine> [--all] # un match commenté (--all = tous les événements)
pnpm calibrate 1000       # rapport de calibrage
```

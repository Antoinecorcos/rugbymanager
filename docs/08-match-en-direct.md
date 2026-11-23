# Match en direct (M5)

Le match du club du manager peut se jouer **en direct**. On le suit en vue TV, on prend les décisions sur pénalité, on fait les remplacements et on change les consignes pendant la rencontre.
Le bouton **Résultat immédiat** reste disponible : le match est alors simulé d'un coup et le staff prend toutes les décisions.

Captures : `docs/captures/direct-*.png`.

## Ce que voit le manager

| Zone | Contenu |
|---|---|
| Bandeau | Compétition, météo, arbitre, score, horloge, mode d'affichage, vitesse (×1, ×2, ×4), pause, « Terrain entier » / « Suivre le jeu », Quitter |
| Terrain (PixiJS) | Vue TV de dessus, sobre : pelouse rayée, lignes, poteaux, joueurs en pastilles numérotées aux couleurs des clubs, ballon avec son ombre (hauteur des coups de pied), anneau sur le porteur, caméra qui suit le ballon. Les deux derniers faits de jeu s'affichent en bas de l'écran |
| Direct | Le commentaire en français. Liseré bleu pour nous, orange pour l'adversaire ; les faits marquants en gras |
| Stats | Possession, occupation, mètres, franchissements, plaquages, rucks rapides, turnovers, touches, mêlées, pénalités, fautes de main… |
| Joueurs | Nos 15 avec leur condition, le banc (« Faire entrer » puis on clique sur le joueur qui sort), les changements demandés (annulables), les joueurs exclus ou sortis. Une case active ou coupe les remplacements prévus par le staff |
| Consignes | Passage au plan A ou B, les 9 consignes tactiques, les consignes ciblées, les règles de pénalité |

### Modes d'affichage
- **Match complet** : toutes les actions, environ 10 minutes à ×1 et moins de 3 minutes à ×4.
- **Temps forts** : les actions qui mènent à un fait de jeu (pénalité, turnover, maul, mêlée gagnée, essai…), avec les 4 actions qui précèdent.
- **Moments clés** : essais, franchissements, cartons, points au pied, 50:22, désobéissance du capitaine.
- **Sans images** : le match défile sans animation. **Les décisions sur pénalité restent au manager.**

### Décisions sur pénalité ✅
- À chaque pénalité pour notre équipe, le match s'arrête. Une fenêtre indique la distance de l'en-but, le score, la probabilité de réussite au pied et le **conseil du staff**.
- Le manager a **10 secondes** (anneau de décompte, touches 1 à 4). Sans réponse, le conseil du staff s'applique.
- **Règles automatiques** (préparation ou onglet Consignes) : les règles cochées décident sans pause, par exemple « Dans notre moitié : la touche » ou « Tir facile (≥ 70 %) : les points ». Elles sont enregistrées dans `ManagerState.penaltyRules`.
- **Désobéissance du capitaine** : depuis M6a, la confiance du capitaine est sa vraie confiance en vous (`docs/09-effectif-et-humain.md`). Sous 50, il peut rarement passer outre votre choix.

### Consignes ciblées (GDD §5)
Elles se règlent dans la préparation, pour le match à venir, ou pendant le match. Chacune agit sur un vrai mécanisme du moteur et peut se retourner contre nous :

| Consigne | Effet dans le moteur |
|---|---|
| Attaquer un défenseur | Ce joueur devient le plaqueur 5 fois plus souvent sur nos courses. Payant s'il plaque mal |
| Jouer au pied sur | Nos chandelles et nos longs coups de pied le visent (poids ×6 à la réception) |
| Cibler un pilier en mêlée | Le duel de notre pilier face à lui pèse sur toute la mêlée, en positif ou en négatif |
| Contester leurs touches au fond | +4 points de vol si nos sauteurs dominent (+1,5 sinon), mais leur maul est plus dur à arrêter |

### Arbitres
Les arbitres sont les vrais officiels des panels 2025-26 : France (Top 14, Pro D2, Nationale), Angleterre (PREM), URC, et des arbitres neutres pour les coupes d'Europe et les tests.
⚠️ Leurs **tendances sont estimées** (tirées autour de la moyenne de façon déterministe), car aucune donnée publique ne les mesure de façon fiable. Le calibrage reste donc inchangé.
L'arbitre d'un match est connu dès la préparation (`fixtureReferee`).

## Architecture

```
Moteur (packages/engine)
  match/engine.ts   MatchSimulation : trace des actions (option trace), setTactics, setTargets,
                    setAutoSubstitutions, requestSubstitution, snapshot()
  match/spatial.ts  stepPoses() : positions des 30 joueurs et trajectoire du ballon pour chaque action
  world/live.ts     LiveSession : match en direct du manager (morceaux, règles de pénalité, finish)
  world/referees.ts Arbitres et désignation par match
Interface (apps/game)
  worker            possède la LiveSession (messages live*)
  live/timeline.ts  rythme d'affichage et sélection des temps forts (pur, testable)
  live/player.ts    lecture : file d'actions, interpolation des positions, pas d'aperçu du futur
  live/renderer.ts  rendu PixiJS (terrain, pastilles, ballon, caméra)
  screens/LiveMatch.tsx  écran plein cadre
```

- **La trace ne change jamais le match.** Elle est enregistrée sans tirer aucun nombre aléatoire. Un test le vérifie sur 30 matchs, avec un résultat identique avec ou sans trace.
- **Le direct est fidèle au moteur calibré.** Un match en direct où l'on suit toujours le conseil du staff donne **exactement** le même résultat qu'un match simulé d'un coup (test `apps/game/test/live.test.ts`).
- **Couche spatiale** : elle illustre la simulation sans jamais la nourrir. Elle couvre la ligne de défense (déchirée quand l'organisation défensive est basse), le système en pods 1-3-3-1 en attaque, la mêlée, l'alignement en touche, le maul, la chasse et la réception des coups de pied, les renvois, les essais et les tirs au but. Elle est déterministe et alimente aussi la vue 3D (M7).
- **Pas de divulgation** : statistiques, score et commentaire ne montrent que les actions déjà affichées.
- **Pas de sauvegarde en cours de match** : un match quitté par fermeture de l'onglet est rejoué depuis le coup d'envoi (même graine). « Quitter » fait terminer le match par le staff et l'enregistre.

## Vérification
- Moteur : `test/live.test.ts` (trace sans effet, couverture complète des événements, tactique, remplacement, consignes ciblées, instantané) et `test/spatial.test.ts` (joueurs dans le terrain, défense du bon côté du ruck, mêlée groupée, ballon en l'air sur les coups de pied).
- Jeu : `test/live.test.ts` sur la vraie base (identité avec la simulation, règles de pénalité, remplacement et changement de tactique en direct).
- Parcours Chromium : `pnpm --filter @ovalie/game smoke:live`, après build. Il enchaîne nouvelle carrière, préparation, direct, décision, remplacement, consignes, temps forts, décompte de 10 s laissé à l'expiration, fin du match et compte rendu, sans erreur de console.
- Calibrage : 29/29.

## Limites et suites
- ~~Confiance du capitaine fixe ; causeries~~ : faits en M6a. La mi-temps du direct s'arrête pour la causerie.
- Les positions sont **plausibles, pas simulées** : le moteur reste un moteur par phases. Un joueur peut « glisser » d'un placement à l'autre. La vue 3D (M7, `docs/12-match-3d.md`) reprend cette couche avec des gestes animés.
- Les nations hors Nations Championship et Tournoi ne jouent toujours pas leurs matchs (M3).

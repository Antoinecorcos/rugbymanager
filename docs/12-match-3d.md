# Match en 3D (M7)

Le match en direct s'affiche désormais en **3D**, filmé comme une retransmission TV : stade, tribunes pleines, joueurs aux couleurs des clubs, ballon, arbitre, caméras qui changent selon les phases de jeu. La vue 2D de M5 reste disponible (« Vue 2D ») pour les machines modestes.

Captures : `docs/captures/6*.png`.

| Capture | Ce qu'elle montre |
|---|---|
| `60-direct-3d-realisation-tv` | Caméra principale, en tribune, qui suit le jeu |
| `61-direct-3d-camera-haute` | Caméra haute au-dessus d'une mêlée |
| `62-direct-3d-terrain-entier` | Vue du terrain entier |
| `63-direct-3d-touche` | Plan serré d'une touche |
| `64-direct-3d-maul` | Maul porté vers l'en-but |
| `65-direct-3d-essai` | Célébration après l'essai |
| `66-direct-3d-ruck` | Ruck : plaqué au sol, nettoyeurs qui poussent, demi de mêlée à la base, défense en ligne |

## Ce que voit le manager
- **Vue 3D par défaut.** Le bouton « Vue 2D » / « Vue 3D » du bandeau bascule entre les deux, et le choix est mémorisé. Sans WebGL, le jeu passe tout seul en 2D et le signale.
- **Caméras** :

  | Caméra | Plan |
  |---|---|
  | **Réalisation TV** (par défaut) | Un réalisateur automatique choisit le plan selon l'action (tableau suivant) |
  | **Caméra haute** | Une caméra aérienne suit le ballon |
  | **Terrain entier** (bouton existant) | Une vue fixe de tout le terrain |

- **Plans de la réalisation TV** :

  | Action | Plan |
  |---|---|
  | Jeu courant | Caméra principale en tribune, au niveau du ballon, longue focale, qui suit le jeu. Elle prend de la hauteur pendant les coups de pied. |
  | Mêlée et maul | Plan serré, bas, sur le côté |
  | Touche | Plan depuis le terrain vers la ligne de touche, avec le lanceur et l'alignement |
  | Pénalité tentée, transformation, drop | Caméra derrière le buteur, face aux poteaux |
  | Essai | Caméra basse près de l'en-but pour l'aplatissement et la célébration |

  On passe d'une caméra à l'autre par une **coupe franche**, comme à la télévision. La caméra principale, elle, se déplace en douceur.
- **Le stade** :
  - une pelouse tondue en bandes avec tout le marquage : en-buts, 22 m, 10 m, tirets des 5 et 15 m, et le nom du jeu peint dans les en-buts ;
  - des poteaux avec leurs protections aux couleurs du club qui reçoit ;
  - des panneaux LED au nom de la compétition ;
  - quatre tribunes et environ 13 000 spectateurs aux couleurs des deux clubs, avec un coin pour les visiteurs ;
  - des toits et des pylônes d'éclairage.
- **La météo** est celle de la fiche de match : grand soleil avec des ombres nettes, ciel couvert avec une pelouse plus sombre et de la pluie, ou ciel venteux.
- **Les joueurs** :
  - un corps articulé (bassin, buste, tête, bras, jambes) aux couleurs du club : maillot, short, chaussettes, et le numéro dans le dos ;
  - la carrure varie : les avants sont plus lourds, les deuxièmes-lignes plus grands ;
  - la couleur de peau, les cheveux, les crampons et quelques casques de mêlée chez les avants varient aussi ;
  - l'**arbitre**, en noir, suit le jeu à quelques mètres et lève le bras sur les pénalités ;
  - une **incrustation TV** au-dessus du porteur du ballon donne son numéro et son nom.
- **Les gestes** (`live3d/gestures.ts`) :
  - course (foulée selon la vitesse) et course ballon en main ;
  - mêlée liée, ruck penché sur le ballon, maul ;
  - en touche : saut du sauteur, soulevé par ses deux partenaires, lancer du talonneur, et contre-saut adverse ;
  - plaquage et joueur plaqué en fin de course, passe du demi de mêlée ;
  - coup de pied (élan puis frappe), réception bras levés, duel aérien ;
  - plongeon pour l'essai, célébration des coéquipiers.

  Les angles des articulations glissent d'un geste à l'autre, sans saut brusque.
- **Le ballon** est un ovale qui tourne en spirale en vol, avec son ombre au sol. Il est tenu contre la poitrine par le porteur.
- **Les tirs au but** (transformations, pénalités, drops) suivent leur résultat. Un tir réussi passe entre les poteaux (5,60 m d'écart), au-dessus de la barre (3 m), même depuis la touche ou de 50 m. Un tir manqué passe nettement à côté d'un poteau, à gauche ou à droite. De loin (plus de 38 m), il peut aussi retomber avant la ligne. Le moteur inscrit le résultat dans la trace (`made`), sans tirage de plus : la couche spatiale (`goalKickFlight`) en déduit la trajectoire.

## Rucks et fluidité
Les rucks étaient la phase la plus saccadée : un ruck de 2 à 5 secondes était montré en moins d'une demi-seconde, et chaque action démarrait et s'arrêtait net.

**Le ruck, d'après la règle 15 de World Rugby et la façon dont les équipes l'abordent :**
1. Le plaqué va au sol et place le ballon en arrière, vers son camp.
2. Le plaqueur lâche, roule hors du ruck, puis se relève sur le côté.
3. Le premier défenseur sur ses appuis se place au-dessus du ballon, mains dessus : c'est le gratteur.
4. Les deux premiers attaquants arrivent bas et le déblaient en poussant au-delà du ballon. Si le gratteur gagne le ballon (ballon volé, ballon non lâché), il reste dessus.
5. Le demi de mêlée arrive à la base, se baisse, sort le ballon et passe vers le côté ouvert.
6. Les autres défenseurs se placent derrière la ligne de hors-jeu (le point le plus en arrière du ruck), dans une posture « prêt » : genoux fléchis, mains devant.

**Comment c'est rendu :**
- **Le moteur dit qui fait quoi.** La trace donne le plaqueur, les deux soutiens, le gratteur et l'issue du ruck (rapide, normal, lent, ballon perdu, pénalité). Aucun tirage aléatoire de plus : le match est identique, ce que vérifie le test « never changes the match ».
- **La couche spatiale place chaque rôle**, avec une étape intermédiaire. Le gratteur arrive sur le ballon pendant que les soutiens arrivent derrière, puis il est repoussé (ou reste s'il gagne). Le demi de mêlée rejoint la base. Un plaqueur battu reste en arrière.
- **De nouveaux gestes** : gratteur, poussée des nettoyeurs (petits appuis rapides), gratteur repoussé (en arrière, bras écartés), plaqué qui place le ballon, demi de mêlée qui creuse, posture « prêt ». Le ballon passe dans les mains du demi de mêlée avant la passe.
- **Le mouvement est lissé** : chaque joueur suit sa position par un ressort amorti (`live3d/motion.ts`). Il garde son élan d'une action à l'autre au lieu de s'arrêter, ne dépasse jamais sa cible, et ne saute que si la cible est loin (temps forts qui sautent des actions, remplacement). Le porteur du ballon suit de plus près, pour garder le ballon en main.
- **Le temps d'un ruck** : il est montré 1,7 à 3,2 s à ×1 (au lieu de 0,4 s) et la caméra principale resserre un peu le cadre. Un match complet dure environ 15 minutes à ×1.

## Architecture
```
apps/game/src/live/renderer.ts     Frame (positions, ballon, action en cours) et interface LiveView
apps/game/src/live/player.ts       la lecture fournit aussi l'action en cours (type, phase, progression)
apps/game/src/live3d/gestures.ts   PUR : geste et orientation de chaque joueur à partir de l'image affichée (rôles du ruck)
apps/game/src/live3d/motion.ts     PUR : suivi des positions par ressort amorti (pas d'arrêt entre deux actions)
apps/game/src/live3d/director.ts   PUR : réalisation TV (plan, position, cible, focale)
apps/game/src/live3d/athlete.ts    joueur articulé (Three.js) et poses par geste
apps/game/src/live3d/stadium.ts    pelouse, poteaux, panneaux, tribunes, public, pylônes
apps/game/src/live3d/renderer3d.ts rendu Three.js (même contrat que le rendu PixiJS)
```
- **Même source que la 2D.** La 3D lit les mêmes images que la vue PixiJS : les positions de la couche spatiale du moteur (`stepPoses`), interpolées par la lecture. Elle ne fait qu'illustrer : le moteur et la trace ne changent pas, et la règle « pas d'aperçu du futur » est respectée. Les gestes et les plans ne regardent que l'action en cours.
- **Chargement à la demande.** Three.js 0.186 est chargé seulement à l'ouverture d'un match en 3D (morceau séparé de 150 ko compressés). L'interface générale ne s'alourdit pas.
- **Rien n'est téléchargé.** Joueurs, stade et textures sont générés dans le code, de façon déterministe (hachages, pas de hasard) : aucun modèle ni texture externe, aucune question de licence.
- **Économie** : quand l'image ne bouge plus (pause, décision de pénalité, mi-temps), la scène n'est redessinée qu'environ 5 fois par seconde.

## Vérification
- **Jeu**, `test/live3d.test.ts` (5 tests) :
  - avants liés en mêlée et orientés vers l'adversaire ;
  - en touche, le sauteur est un deuxième ou troisième-ligne, ses partenaires le soulèvent, et un adversaire conteste ;
  - coup de pied, plaquage et joueur plaqué, plongeon d'essai ;
  - course orientée dans le sens du déplacement ;
  - réalisation : caméra derrière le buteur pour une transformation, plan serré de mêlée une fois les joueurs en place, caméra principale en jeu courant, vue entière, coupes.
- **Parcours Chromium** `smoke:live` :
  - le direct s'ouvre en 3D ;
  - il passe par la caméra haute, le terrain entier, la vue 2D puis le retour à la 3D ;
  - puis il enchaîne la décision de pénalité, le remplacement, les consignes, les temps forts et la fin du match, sans erreur de console ;
  - il fonctionne aussi en rendu logiciel (SwiftShader).
- Calibrage : 29/29, puisque le moteur n'a pas changé.

## Limites et suites
- **Des joueurs stylisés, pas des modèles réalistes.** Il n'y a pas de visages ni de capture de mouvement : les gestes sont animés par le code. Pour aller vers le réalisme (modèles riggés au format glTF, animations capturées), il faudrait des fichiers 3D externes, avec leurs licences. Le rendu est prêt à les recevoir à la place du corps procédural.
- **Les positions restent celles de la couche spatiale** : plausibles, pas simulées, comme en 2D. La 3D rend plus visibles certains raccourcis, par exemple un joueur qui glisse d'un placement à l'autre pendant une mise en place.
- **Pas encore de ralentis**, de plans de banc ni de tableau d'affichage dans le stade. L'éclairage est toujours celui d'un après-midi (pas de match de nuit sous les projecteurs).
- **Performance** : environ 550 objets à dessiner, plus le public instancié et les ombres. C'est fluide sur une carte graphique récente. Sur une machine modeste, la vue 2D reste la bonne option.

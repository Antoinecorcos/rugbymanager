# Effectif et humain (M6a)

Première moitié du management en profondeur. Elle couvre le moral et la confiance, les discussions et les promesses, les causeries, l'entraînement et la progression, le médical, le staff et le centre de formation.
La seconde moitié (**M6b**) traitera de l'argent et du marché : contrats, transferts et agents, salary cap et JIFF, finances, président, presse.

Captures : `docs/captures/m6a-*.png`.

## Relations avec les joueurs (GDD §6.1) — `world/human.ts`

| Notion | Fonctionnement |
|---|---|
| **Moral** (0-100) | Évolue après chaque match (résultat, note personnelle) et chaque lundi : temps de jeu par rapport au statut, blessure, retour progressif vers 62. Pour le moteur, la moyenne des 23 donne le moral d'équipe, avec un effet en match de **±5 % au maximum** (62 = neutre) |
| **Confiance en vous** (0-100) | Progresse avec un temps de jeu conforme au statut et les promesses tenues ; chute avec les promesses rompues, les rétrogradations et les critiques injustes. **La confiance du capitaine alimente la désobéissance sur pénalité** (active sous 50) |
| **Statut** | Indispensable, Titulaire, Rotation, Remplaçant ou Espoir, proposé d'après la hiérarchie au poste. Chaque statut a un temps de jeu attendu (80 %, 60 %, 35 %, 12 %, 5 % de titularisations). Le changer fait réagir le joueur, surtout s'il est ambitieux |
| **Discussions** (une par semaine et par joueur) | Féliciter, Encourager, Critiquer, Promettre du temps de jeu, Demander d'être patient. La réaction dépend de la forme (notes récentes), du moral et de la personnalité : ambition, professionnalisme, tempérament |
| **Promesses** | Être titulaire dans 3 des 5 prochains matchs où il est disponible. Tenue : +12 confiance. Rompue : −20 confiance et −12 de moral, avec une nouvelle dans la boîte de réception |
| **Alertes** | Un joueur important au moral faible demande à vous parler (au plus une fois par mois) |
| **Clubs de l'IA** | Un moral de club qui suit les résultats (30-90, retour vers 60), avec le même effet en match |

**Causeries** (`teamTalkEffect`) :
- **avant le match**, choisie dans la préparation : calme, motivant, exigeant ou sans pression ;
- **à la mi-temps**, en direct : le match s'arrête et attend votre choix.

L'effet sur le moral du match va de −0,05 à +0,08 et dépend du contexte : favori ou outsider, écart au score à la pause, tempérament du groupe. Par exemple, un discours exigeant fonctionne avec un favori mais braque un groupe nerveux mené au score. La réaction du vestiaire s'affiche, et la causerie d'avant-match figure dans le compte rendu.

## Entraînement et progression (GDD §6.2, §3.3) — `world/training.ts`

**Programme collectif** (écran Entraînement) :

| Réglage | Choix | Effet |
|---|---|---|
| Intensité | Légère / Normale / Intense | Fraîcheur ±0,6 point par jour, progression ×0,85 / ×1 / ×1,15, risque de blessure à l'entraînement ×0,6 / ×1 / ×1,5 |
| Thème | Équilibré, Conquête, Attaque, Défense, Jeu au pied, Physique, Récupération | Fait monter les **automatismes** du secteur visé |
| Contacts | Peu / Normaux / Beaucoup | Automatismes de conquête et de défense, risque de blessure ×0,5 / ×1 / ×1,8 |

- **Automatismes** (0 à 1, 0,5 = neutre) : ils se rapprochent chaque lundi de la cible du programme, d'autant plus vite que l'entraîneur du secteur est bon. En match, ils jouent sur les attributs du secteur, de **−5 % à +5 %**. Le secteur « physique » ralentit la fatigue.
- **Progression des joueurs**, chaque lundi pour tous les joueurs du monde :
  - un jeune se rapproche de son potentiel ; c'est plus rapide avant 21 ans, avec du temps de jeu, un bon staff, de l'intensité et du professionnalisme ;
  - un vétéran décline après l'âge de pic (31 ans pour la 1re ligne, 30 pour les avants, 28 pour les ailiers, 29 pour les autres), d'abord physiquement ;
  - l'expérience fait monter les attributs mentaux.

  Les attributs bougent point par point, à partir d'une progression fractionnaire déterministe.
- **Entraînement individuel** : technique, mental, physique, ou **apprentissage d'un poste**. La familiarité monte jusqu'à 16/20, plus vite pour un joueur adaptable.
- **Ordres de grandeur sur une vraie saison** (`docs/exemples`, graine « m6a-real ») :

  | Âge | Progression moyenne |
  |---|---|
  | ≤ 20 ans | +1,0 niveau |
  | 21-23 ans | +0,5 |
  | 24-27 ans | stable |
  | 31-33 ans | −0,6 |
  | 34 ans et plus | −1,2 |

  Dupont passe de 16,6 à 16,4. On compte environ 7 blessures à l'entraînement par club et par saison avec un programme normal.

## Médical (GDD §3.4) — `world/medical.ts`
- **Dossier** pour chaque joueur : historique des blessures (match ou entraînement) et commotions sur la carrière.
- **Staff médical** : un bon kiné et un bon médecin raccourcissent les absences, jusqu'à −15 % ; un staff faible les allonge, jusqu'à +12 %.
- **Commotions** : chaque commotion des 12 derniers mois ajoute une semaine au protocole. À partir de la 3e, le médecin alerte ; à partir de la 4e, il évoque l'arrêt de carrière.
- **Risque de blessure** (faible, modéré ou élevé, avec ses raisons) : fatigue, fragilité, âge, retour récent, retour accéléré.
- **Accélérer le retour** : environ un tiers de l'absence restante en moins, mais le joueur reste **fragile 4 semaines** (risque de blessure doublé en match). Impossible après une commotion ou une deuxième fois de suite.

## Staff (GDD §6.3) — `world/staff.ts`
- **Neuf fonctions** : adjoint, avants, trois-quarts, défense, préparateur physique, kiné, médecin, analyste, responsable de la formation.
- ⚠️ La base réelle ne connaît que les entraîneurs principaux : **les adjoints sont fictifs**, générés avec une qualité à la mesure de la réputation du club.
- Le staff influence les automatismes, la progression, les absences et la qualité des jeunes. Recruter ou remplacer le staff relève de M6b, car il faut un budget.

## Centre de formation (GDD §6.7) — `world/academy.ts`
- **Composition** : chaque club de Top 14, Pro D2 et Nationale a 9 à 12 espoirs **fictifs** de 17 à 20 ans, tous JIFF, français à 90 %.
- **Potentiel** : la plupart plafonneront en Pro D2 ou en Nationale ; environ 2 par club ont un potentiel de Top 14. Depuis M8, les centres de Pro D2 et surtout de Nationale forment des espoirs au potentiel plus modeste.
- **Journée des espoirs** (16 mars) : 3 à 6 jeunes de 17 ans arrivent, avec l'avis du responsable de la formation.
- **Décisions du manager** : **intégrer un jeune à l'effectif** (statut Espoir, moral en hausse) ou le libérer.

## Sauvegardes
`ensureWorldExtensions` complète une partie créée avant M6a (staff, centres de formation, relations) au chargement. L'opération est idempotente et testée.

## Vérification
- Moteur, `test/m6a.test.ts` :
  - staff et centres de formation ;
  - migration des sauvegardes ;
  - journée des espoirs et intégration d'un jeune ;
  - progression des jeunes et déclin des vétérans sur une saison ;
  - déterminisme ;
  - automatismes et blessures selon l'intensité ;
  - commotions et retour accéléré ;
  - promesse rompue ;
  - effet des discussions et des rétrogradations ;
  - causeries et compte rendu.
- Le direct (M5) gère la pause de mi-temps. « Pas de causerie » laisse le match strictement identique à la simulation.
- Calibrage : 29/29 ; saisons réelles : tests de `packages/data` au vert.
- Parcours Chromium : `pnpm --filter @ovalie/game smoke:club`, plus `smoke` et `smoke:live`.

## Limites et suites
- **Une seule saison** : le passage à 2027-2028 manque encore, alors qu'il donnerait tout leur sens à la progression et à la formation (vieillissement, retraites, promotion des espoirs d'une saison sur l'autre). Je le propose pour M6b ou une étape dédiée.
- **Les clubs de l'IA n'intègrent pas leurs espoirs** et n'adaptent pas leur entraînement. Leur programme reste équilibré, donc leurs automatismes restent neutres.
- **Les causeries et les discussions restent simples** : pas de discours ciblé sur un joueur, pas de « groupes » dans le vestiaire.
- **Le staff ne se recrute pas encore** (M6b).

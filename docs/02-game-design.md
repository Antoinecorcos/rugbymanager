# Game Design Document — v1

> Nom de travail : **Ovalie Manager** (à confirmer).
> Référence de profondeur : Football Manager. Référence de pertinence : le dossier `01-recherche-rugby.md`.
> Statut : validé avec le porteur du projet le 21/11/2026 (décisions marquées ✅).

---

## 1. Vision

Un jeu de management rugby **aussi profond que Football Manager**, mais pensé rugby de bout en bout : un moteur de match par phases, la morphologie des joueurs, le banc comme arme, la santé et les collisions, le plafond salarial, les JIFF et un marché sans indemnités de transfert.
Le jeu n'est **pas commercial** : il utilise ✅ **les vrais noms, les vraies infos et des niveaux réalistes**.

Piliers de qualité :
1. **Le match doit raconter du rugby.** Un connaisseur doit reconnaître un pack qui domine, une défense qui monte vite ou un 10 qui gère.
2. **Chaque décision du manager a un effet visible et explicable** (rapports, stats, retours du staff).
3. **L'interface doit être claire**, là où FM26 a échoué : peu de clics, de l'information dense mais lisible.

---

## 2. Périmètre

### 2.1 Compétitions (version 1)
| Compétition | Statut | Détail |
|---|---|---|
| **Top 14** | ✅ Jouable | Format réel (26 journées, barrages, demies, finale, access match) |
| **Pro D2** | ✅ Jouable | 16 clubs, 30 journées, phases finales, montée/barrage |
| **Nationale** | ✅ Jouable (départ « sans diplôme ») | Effectifs réels si les données existent, sinon complétés |
| **Champions Cup** | ✅ Jouable | Fait partie de la saison d'un club. Règles 2026-27 (bonus à +3 essais **et** victoire, top 3 qualifiés + 4 meilleurs 4es) |
| **Challenge Cup** | ✅ Jouable | Idem, avec les invités (Black Lion, Cheetahs…) |
| **PREM, URC** | Simulées en arrière-plan | Effectifs réels complets, car ces clubs sont des adversaires européens et des acteurs du marché des transferts |
| **Six Nations, tests de novembre, Nations Championship** | Simulés en arrière-plan | Servent aux **convocations** : doublons, fatigue, blessures, valeur des joueurs |
| Super Rugby, Japon, R360 | Marché uniquement | Clubs acheteurs ou vendeurs, sans simulation de match |
| **Mode international** (sélectionneur) | 🔜 Plus tard | |
| PREM et URC jouables, rugby féminin | 🔜 Plus tard | |

### 2.2 Démarrage de carrière ✅
- **Option A — « Sans diplôme »** : réputation minimale, le manager postule à des clubs de Nationale ou de Pro D2.
- **Option B — « Gros club »** : choix libre parmi les 14 clubs du Top 14, avec un passé de coach reconnu.
- Le profil du manager se configure : âge, nationalité, ancien joueur (international, pro ou amateur), qualifications d'entraîneur, et **attributs de manager** (tactique, motivation, gestion des hommes, discipline, développement des jeunes, connaissance du rugby).

---

## 3. Les joueurs

### 3.1 Attributs (notes de 1 à 20) ✅
**Technique**
| Attribut | Effet principal |
|---|---|
| Passe | Précision et vitesse de passe, jeu au large |
| Jeu au pied (occupation) | Distance et précision en jeu courant |
| Jeu au pied tactique | Chandelles, rasants, petites diagonales, 50:22 |
| Buteur | Pénalités et transformations |
| Réception / jeu aérien | Ballons hauts, renvois |
| Manipulation | Ballons tombés, en-avant |
| Plaquage | Réussite et domination au plaquage |
| Grattage (jackal) | Turnovers au sol |
| Nettoyage / ruck | Efficacité au soutien offensif |
| Mêlée | Technique de mêlée (pondérée par le poste) |
| Lancer en touche | Talonneurs |
| Saut / contre en touche | Sauteurs |
| Maul | Conduite et défense de maul |
| Offload | Passe après contact |
| Appuis / feinte | Battre un défenseur |

**Mental** : décision, vision, anticipation, sang-froid, concentration, leadership, discipline (risque de pénalités et de cartons), agressivité, courage, travail (activité au soutien), placement (offensif et défensif), communication, **flair**.

**Physique** : vitesse, accélération, puissance, endurance, **résistance aux contacts**, agilité, équilibre, détente, récupération.

**Morphologie** (valeurs réelles) : taille en cm et poids en kg. Elles influencent directement la mêlée, le maul, la touche, la puissance au contact et la vitesse.

**Attributs cachés** (comme FM) : régularité, matchs importants, professionnalisme, ambition, loyauté, tempérament, **propension aux blessures**, adaptabilité.

### 3.2 Postes
- Note de familiarité de 1 à 20 par poste (1 à 15), plus des rôles. Exemples : *pilier de devoir*, *7 gratteur*, *8 perforateur*, *10 gestionnaire* ou *10 créateur*, *centre perforateur*, *ailier finisseur*, *arrière relanceur*.
- Les **piliers gauche et droit ne sont pas interchangeables** : forte pénalité en mêlée hors poste.
- **Spécialistes de première ligne obligatoires** sur la feuille (6 sur 23) pour avoir des mêlées contestées.

### 3.3 Potentiel, âge et développement
- CA/PA cachés (capacité actuelle et potentiel), comme FM.
- **Courbes d'âge par poste** : les avants mûrissent tard (pic à 28-32 ans, piliers jusqu'à 34-35), les ailiers déclinent plus tôt.
- La progression dépend des minutes jouées, de l'entraînement, du staff, de la personnalité et de la concurrence au poste.

### 3.4 Santé ✅
- **Fatigue de match** (condition), **fraîcheur** (sur plusieurs semaines), et **usure aux contacts**, une jauge cachée cumulative sur la saison.
- **Historique de commotions** : chaque commotion allonge l'arrêt suivant et augmente le risque. Le staff médical peut recommander un arrêt long ; dans les cas extrêmes, une retraite forcée.
- **Blessures typiques** du rugby, avec des durées réalistes : ligaments croisés, épaule, ischios, cheville, cervicales, commotion, fractures.

---

## 4. Le moteur de match ✅

### 4.1 Principe : une simulation par phases
Le match est une suite d'**événements de jeu** :
`coup d'envoi → réception → phase de jeu (carry / passe / jeu au pied) → contact → ruck → … → faute → pénalité → décision → touche → maul → essai → transformation…`

Chaque résolution utilise :
- les **attributs** des joueurs impliqués (porteur, plaqueur, soutiens, gratteur) ;
- la **fatigue** (condition actuelle) et la **morphologie** ;
- les **consignes tactiques** des deux équipes ;
- le **contexte** : score, temps restant, zone du terrain, météo, numéro de temps de jeu ;
- un **petit profil d'arbitre** (sévérité au ruck, en mêlée et sur les cartons), sans plus ✅ ;
- un **RNG déterministe** (graine), pour rejouer et tester.

### 4.2 Couche spatiale
- Les 30 joueurs ont une **position (x, y)** à chaque instant. Une « chorégraphie » de positionnement (lignes de défense, pods, couverture du fond) est générée à partir des consignes, puis animée.
- Cette couche alimente la **vue 2D** (étape 1), puis la **vue 3D** (étape 2), sans changer la simulation.

### 4.3 Vitesses d'affichage
- **Match complet**, **temps forts étendus**, **temps forts clés**, **résultat direct**.
- Objectif : un match regardable en **3 à 5 minutes** en mode temps forts.

### 4.4 Interventions du coach en direct
- Consignes : attaque (large / au près / au pied), défense (rush / glissade), rucks (contester / remplir la ligne), tempo, jeu au pied (occupation / pression), prise de risque.
- **Remplacements** : manuels ou programmés (par exemple « 1re ligne à la 50e »).
- **Décision sur pénalité** ✅ : à **chaque pénalité**, le coach choisit (pénalité, touche, mêlée, jouer vite ou renvoi en touche). Le jeu peut proposer une recommandation du staff.
  - Option de **règles automatiques** (« si l'écart est ≤ 3 et qu'on est dans les 30 m : pénalité »), pour ne pas tout interrompre.
  - **Désobéissance** ✅ : si la **confiance capitaine ↔ coach** est basse, le capitaine peut **rarement** passer outre. La probabilité de base est d'environ 0 % quand la confiance est bonne, et de quelques % au maximum quand elle est mauvaise. Elle est modulée par la personnalité du capitaine (leadership, tempérament, sang-froid) et par le contexte, la tentation étant plus forte en fin de match. L'événement est **affiché** (« Le capitaine ignore la consigne et choisit la touche ! ») et a des **conséquences** : moral, médias, relation avec le capitaine, voire choix d'un nouveau capitaine.

### 4.5 Règles implémentées (lois 2026)
Points, bonus par compétition, cartons jaunes (10 min), **rouge 20 min avec remplacement** et rouge définitif, TMO, HIA (remplacement temporaire de 12 min), mêlées simulées en cas de manque de premières lignes, remplacements définitifs sauf pour la 1re ligne, le saignement et la HIA, 50:22, renvoi depuis l'en-but, prolongations et règles de phases finales.

### 4.6 Calibrage
Le moteur sera calibré sur les **moyennes réelles du Top 14** (points, essais, pénalités, touches, mêlées, rucks, cartons et turnovers par match) avec des tests automatiques. Un moteur qui sort 80-3 tous les week-ends est un échec.

---

## 5. Préparation de match ✅
L'essentiel porte sur **notre stratégie** et sur **les forces et faiblesses de l'adversaire**.
- **Rapport de l'analyste** : style de l'adversaire, efficacité en mêlée et en touche, zones faibles en défense, joueurs clés, jeu au pied, discipline, banc. Le rapport est plus ou moins précis selon la qualité de l'analyste.
- **Plan de jeu** : plusieurs « plans » tactiques sauvegardés (plan A et plan B), choisis selon l'adversaire.
- **Consignes ciblées** : « cibler leur pilier droit en mêlée », « jouer au pied derrière leur ailier lent », « contester leurs touches au fond ».
- **Arbitre** : un **simple encart** (« sévère au sol, siffle beaucoup les hors-jeu »), avec un petit effet sur la discipline conseillée.
- **Composition** : titulaires, banc (5-3, 6-2 ou 7-1), capitaine, buteur, lanceur de combinaisons en touche.

---

## 6. Gestion du club (au plus près de FM) ✅

### 6.1 Effectif et vestiaire
- Moral, **dynamique d'équipe** (hiérarchie, leaders, groupes sociaux), promesses, discussions individuelles et collectives, causeries d'avant-match et de mi-temps.
- **Confiance coach ↔ joueur** par joueur, cruciale pour le capitaine.

### 6.2 Entraînement
- Programme hebdomadaire par séances : avants, mêlée, touche, défense, attaque, jeu au pied, physique, vidéo, récupération.
- **Gestion des contacts à l'entraînement** : plus de contacts améliore le collectif mais augmente le risque de blessure.
- Entraînement individuel par rôle, nouveau poste à apprendre, tutorat par un ancien.

### 6.3 Staff
Adjoints avants, mêlée, touche, défense, attaque, jeu au pied et skills ; préparateurs physiques ; médecin et kinés ; analyste ; recruteurs ; responsable du centre de formation ; nutritionniste ; préparateur mental. Chacun a ses propres attributs.

### 6.4 Recrutement, transferts et contrats (version rugby)
- **Scouting** avec **connaissance** des joueurs (attributs masqués tant qu'ils ne sont pas observés), réseau de recruteurs par zone (France, Îles du Pacifique, Afrique du Sud, Argentine, Géorgie…).
- **Marché en fin de contrat** : approches et **pré-contrats** 12 à 18 mois à l'avance, **rachats de contrat** (indemnités de rupture), **jokers médicaux** et **jokers Coupe du monde**, prêts rares.
- **Négociation avec les agents** : salaire, durée, primes de match et de victoire, logement et voiture, clauses (libération pour le Japon ou une sabbatique), statut dans l'équipe.
- **Concurrence** : Japon (salaires énormes), PREM, URC, R360 (événement à partir de 2028).
- **Éligibilité en sélection** : un joueur NZ ou anglais pèse le risque de perdre sa sélection.

### 6.5 Finances et règles de la ligue
- **Salary cap** (11 M€ en Top 14, avec les bonus internationaux) et **JIFF** : contrôle en temps réel, alertes, **sanctions** (retrait de points, amendes) en cas de dépassement.
- Revenus : billetterie, abonnements, hospitalités, **partenaires locaux**, droits TV, primes de compétition, subventions des collectivités, **apports du président**.
- Dépenses : salaires, staff, déplacements, infrastructures, centre de formation.

### 6.6 Président et direction
- Attentes par saison (maintien, phases finales, titre, Europe, JIFF, budget, **style de jeu**), confiance, risque de licenciement.
- Demandes possibles du manager : budget, infrastructures, staff, recrutement.

### 6.7 Formation
- **Centre de formation** (espoirs), arrivée annuelle de jeunes, statut JIFF, prêts en Pro D2 et en Nationale.

### 6.8 Médias et monde
- Conférences de presse, déclarations, rumeurs, **boîte de réception**, actualités (Midi Olympique-like), récompenses (meilleur joueur, équipe type, Oscars).
- Calendrier international : convocations, **doublons**, **convention FFR-LNR** (repos obligatoires des internationaux).

---

## 7. Données réelles ✅
- **Clubs** : Top 14, Pro D2, Nationale, PREM, URC, plus les clubs de Challenge Cup. Pour chaque club : stade, capacité, budget, salary cap, président, staff, historique et palmarès, couleurs.
- **Joueurs** : nom, date de naissance, nationalité(s), sélections, poste(s), taille, poids, club, contrat (si connu), statut JIFF.
- **Niveaux** : estimés par un pipeline de notation (niveau de la compétition, sélections, statistiques de la saison, âge, poste), puis **ajustés à la main** pour les joueurs majeurs. Un **éditeur intégré** permet de tout corriger.
- ⚠️ Les niveaux restent une **estimation réaliste**, pas une vérité : on itérera avec l'éditeur.

---

## 8. Interface et direction artistique
- **Desktop d'abord** (1920×1080 et plus), utilisable aussi sur portable.
- Thème sombre, couleurs du club du joueur comme accent, typographie forte, **cartes joueurs** lisibles, graphiques de stats, heatmaps.
- Navigation : barre latérale fixe (Accueil, Boîte de réception, Effectif, Tactique, Entraînement, Recrutement, Calendrier, Compétitions, Club, Finances, Staff, Médical) et bouton **Continuer** toujours visible.
- **Fiche joueur** : attributs sur un radar par famille, morphologie, historique, stats, santé et contrat.
- **Écran de match** : terrain en 2D, puis en 3D, avec timeline des événements, stats en direct, panneau de consignes et barres de fatigue.

# Dossier de recherche — Le monde du rugby, vu par un jeu de management

> Objectif : comprendre tout ce qui rend le rugby **différent du football**, pour que chaque mécanique du jeu soit pertinente.
> Données à jour à **novembre 2026** (saison 2026-27). Les points incertains sont marqués ⚠️ *à vérifier*.

---

## 1. Le jeu sur le terrain

### 1.1 Les bases
- **15 joueurs** par équipe, match de **2 × 40 min**. Le temps s'arrête (chrono arrêté) sur décision de l'arbitre.
- **Points** : essai 5 · transformation 2 · pénalité 3 · drop 3 · essai de pénalité 7 (sans transformation).
- La passe se fait **vers l'arrière** uniquement ; on avance en courant ou au pied.
- Le jeu est un enchaînement de **phases** : on compte les « temps de jeu » (1er temps, 2e temps…). Gagner l'avancée (« franchir la ligne d'avantage / gainline ») est l'enjeu central.

### 1.2 Les phases de jeu (le cœur de la simulation)
| Phase | Ce qui se passe | Ce qui la décide |
|---|---|---|
| **Mêlée** (scrum) | 8 avants contre 8 après en-avant / ballon injouable | Puissance des piliers & talonneur, technique, poids du pack, arbitre |
| **Touche** (lineout) | Lancer du talonneur, sauteurs soulevés | Précision du lancer, détente/taille des sauteurs, appel du « lanceur de combinaisons » |
| **Maul** | Groupe porteur debout qui avance (souvent après touche) | Poids et cohésion du pack, défense anti-maul |
| **Ruck** (regroupement) | Ballon au sol après plaquage, on se dispute la possession | Vitesse de soutien, **gratteurs** (jackal), nettoyeurs, arbitre |
| **Plaquage** | Le duel de base | Technique, puissance, placement — et **hauteur** (risque carton) |
| **Jeu au pied** | Occupation, jeu au pied de pression, chandelles, coups de pied rasants, **50:22** | Pied du 10/15/9, couverture du fond de terrain, chasse |
| **Coups de pied arrêtés** | Pénalités, transformations, drops | Précision du buteur, distance, angle, vent, pression |
| **Renvois / coups d'envoi** | Récupérer haut ou dégager | Sauteurs, chasseurs, stratégie |

**Fait clé (recherche académique)** : les équipes qui gagnent ont une **vitesse de ruck** plus élevée, un meilleur taux de plaquages réussis, moins de rucks et touches perdus, et plus de franchissements défensifs subis par l'adversaire. → Ce sont nos variables de simulation prioritaires.

### 1.3 Les 15 postes (et pourquoi ils comptent pour un jeu)
| N° | Poste | Profil type | Spécificité gameplay |
|---|---|---|---|
| 1 | Pilier gauche | 115-130 kg | Mêlée (côté « loose-head »). **Pas interchangeable** avec le 3 sans pénalité de performance |
| 2 | Talonneur | 100-115 kg | Lancer en touche + mêlée + souvent finisseur au maul |
| 3 | Pilier droit | 120-135 kg | Le poste le plus rare et le plus cher du marché |
| 4-5 | Deuxièmes lignes | 1,95-2,10 m | Touche, poids en mêlée, travail de l'ombre |
| 6-7 | Troisièmes lignes aile | 105-115 kg | Plaquage, **grattage**, vitesse au soutien (7 = « openside ») |
| 8 | Troisième ligne centre | 110-120 kg | Porteur de balle, départ de mêlée |
| 9 | Demi de mêlée | 75-90 kg | Vitesse de sortie de ruck, jeu au pied par-dessus (box kick), animateur |
| 10 | Demi d'ouverture | 80-95 kg | **Cerveau** : choix de jeu, jeu au pied, souvent buteur |
| 12-13 | Centres | 90-105 kg | 12 = puissance/jeu de passe, 13 = vitesse/défense en bout de ligne |
| 11-14 | Ailiers | 80-100 kg | Vitesse, finition, jeu aérien |
| 15 | Arrière | 85-95 kg | Couverture, réception, relance |

- **Polyvalence** : beaucoup de joueurs couvrent 2 postes (10/15, 12/13, 6/8, 4/5/6, 9/11…). Les **avants polyvalents** (2/3, 4/6) sont précieux sur le banc.
- La **morphologie** (taille, poids) est un attribut central — bien plus qu'au football.

### 1.4 Discipline & arbitrage (énorme impact sur le résultat)
- **Pénalités** : le rugby se gagne et se perd sur la discipline (hors-jeu, mains dans le ruck, mêlée). Une pénalité = 3 points ou touche en position d'attaque.
- **Carton jaune** : 10 min d'exclusion. **Bunker / TMO** : revue vidéo d'un jaune qui peut devenir rouge.
- **Carton rouge 20 min** : adopté en **droit commun au 1er juillet 2026** (Conseil World Rugby du 17 juin 2026) — le joueur expulsé peut être remplacé après 20 min. L'arbitre garde le pouvoir d'un **rouge définitif** (actes délibérés). La France y était opposée.
- **Rôle du TMO**, **brake foot en mêlée**, **restrictions des porteurs d'eau** : également passés en droit commun en 2026.
- **Hauteur de plaquage** : abaissée (taille/sternum) dans le rugby amateur dès juillet 2026, testée au Mondial U20 2026 ; pas encore pour l'élite. → piste de « réforme future » dans le jeu.
- **Chaque arbitre a son profil** : sévère au ruck, tolérant en mêlée, rapide à sortir les cartons… Les staffs pros préparent les matchs en fonction de l'arbitre. → **mécanique très « rugby », absente du foot**.

### 1.5 Remplacements, feuille de match & santé
- **23 joueurs** sur la feuille : 15 titulaires + **8 remplaçants**. Remplacements définitifs (sauf 1re ligne, saignement, HIA).
- Obligation d'avoir assez de **premières lignes** (6 sur 23 en général) pour les mêlées « contestées ». Sinon **mêlées simulées** (et l'équipe fautive joue à 14).
- **Composition du banc** : classique 5 avants/3 arrières, ou **6-2** voire **7-1** (« bomb squad » des Springboks) pour remplacer tout un pack à la 50e minute. → **choix tactique majeur** et propre au rugby.
- **Les remplaçants sont des « finisseurs »** : on fait entrer les premières lignes à 45-55 min de façon quasi systématique.
- **HIA (protocole commotion)** : remplacement temporaire de 12 min ; échec = sortie définitive et période de retour encadrée (souvent ≥ 12 jours). Les commotions répétées allongent l'indisponibilité.
- **Blessures typiques** : genou (LCA), épaule, ischios, cheville, commotion, cervicales. Les avants s'usent plus vite.
- **Charge de travail** : suivi GPS (distance, accélérations, « contacts »), le nombre de **collisions** est la vraie mesure de fatigue au rugby. Les clubs font tourner l'effectif (saison de 30+ matchs).

---

## 2. Les compétitions (saison 2026-27)

### 2.1 France — LNR
| Compétition | Format |
|---|---|
| **Top 14** | 14 clubs, 26 journées. Top 6 en phases finales : **barrages** (3v6, 4v5 chez le mieux classé), **demi-finales** sur terrain neutre, **finale au Stade de France** (Bouclier de Brennus). 14e relégué, **13e joue l'access match** contre le finaliste battu de Pro D2. Bonus offensif = **3 essais de plus** que l'adversaire ; bonus défensif = défaite de **≤ 5 points**. |
| **Pro D2** | 16 clubs, 30 journées, top 6 en phases finales. Champion promu direct. Liens avec la Nationale (retour à 2 montées/2 descentes directes prévu en 2027-28). |
| **Nationale / Nationale 2** | Semi-pro. Utile comme « mode carrière depuis le bas ». |

- **Champion 2026** : **Stade Toulousain** (4e titre d'affilée, 28-20 vs Montpellier, 27 juin 2026).
- **Les « doublons »** : le Top 14 **continue pendant le Tournoi des 6 Nations et les tests de novembre**. Les clubs perdent leurs internationaux plusieurs semaines. → mécanique de gestion d'effectif **typiquement française**.
- **Convention FFR-LNR** : liste élargie de joueurs du XV de France avec temps de jeu limité / semaines de repos obligatoires, compensations financières aux clubs.

### 2.2 Angleterre — PREM Rugby
- **10 clubs**, **ligue fermée** (franchise) à partir de 2026-27 : plus de promotion/relégation. Expansion à 12 visée pour 2029-30.
- Clubs : Bath, Bristol, Exeter, Gloucester, Harlequins, Leicester, Newcastle, Northampton, Sale, Saracens.
- Phases finales (top 4), finale à Twickenham.
- **Cap salarial £6,4 M**, **plancher de £5,4 M** introduit en 2026-27. Règle des joueurs « marquee » hors cap (1 ou 2 selon les saisons ⚠️ *à vérifier*). Clubs chroniquement **fragiles financièrement** (Wasps, Worcester, London Irish ont fait faillite en 2022-23).

### 2.3 United Rugby Championship (URC)
- **16 équipes** : Irlande (Leinster, Munster, Ulster, Connacht), Pays de Galles (Cardiff, Ospreys, Scarlets, Dragons), Écosse (Glasgow, Edinburgh), Italie (Benetton, Zebre), Afrique du Sud (Bulls, Stormers, Sharks, Lions).
- 18 journées, top 8 en quarts. Le **top 8 qualifie pour la Champions Cup** (avec priorités aux vainqueurs de coupe).
- **Spécificité** : les provinces irlandaises/écossaises/galloises sont **contrôlées par la fédération** (contrats centraux, gestion du temps de jeu des internationaux par la fédé). Modèle de gestion totalement différent d'un club privé français.
- Rumeur : suppression d'une région galloise et arrivée d'Ealing (Angleterre) en 2027-28 ⚠️.

### 2.4 Hémisphère Sud & reste du monde
- **Super Rugby Pacific** : 11 équipes en 2026 (5 NZ, 4 AUS, Fijian Drua, Moana Pasifika). **Moana Pasifika disparaît** (liquidation) → **10 équipes en 2027**, saison de 17 semaines, 16 matchs, finales 3v6 / 4v5. Calendrier février-juin.
- **Japan Rugby League One** : salaires très élevés, stars internationales en fin de carrière ou en « sabbatique ». Concurrent sérieux sur le marché des transferts.
- **Currie Cup** (Afrique du Sud), **NPC** (Nouvelle-Zélande), **Major League Rugby** (USA), **Súper Rugby Américas**.
- **R360** (ligue privée « rebelle ») : lancement **repoussé à 2028**. → Excellent événement narratif pour le jeu (offres mirobolantes, menace de bannissement des sélections).

### 2.5 Coupes d'Europe (EPCR)
- **Champions Cup** : 24 clubs (8 Top 14, 8 PREM, 8 URC), 4 poules de 6, 4 matchs de poule (pas de match retour), 8es → finale. **Finale 2027 à Lyon** (21-22 mai).
- **Nouveautés 2026-27** : bonus offensif **seulement si victoire avec 3 essais d'écart** ; **seulement les 3 premiers** de chaque poule qualifiés + 4 meilleurs 4es.
- **Challenge Cup** : la « petite » coupe, avec des invités (Black Lion — Géorgie, Cheetahs — Afrique du Sud…).
- **Domination française** : 6 Champions Cup d'affilée pour le Top 14 ; **UBB double tenante** (41-19 vs Leinster, Bilbao 2026). Montpellier a gagné la Challenge Cup 2026.

### 2.6 International
- **Six Nations** (février-mars) : France, Angleterre, Irlande, Écosse, Galles, Italie. Grand Chelem, Triple Couronne, Cuillère de bois.
- **Nations Championship** (nouveau, 2026) : 12 nations (6 Nations + NZ, Afrique du Sud, Australie, Argentine, Fidji, Japon) en 2 groupes de 6, matchs croisés en juillet et novembre, **Finals Weekend à Londres (28-29 nov. 2026)**. Pas de relégation en 2026-27. Joué les années sans Coupe du monde ni tournée des Lions. Le **Rugby Championship n'a pas lieu en 2026**.
- **Nations Cup** : la 2e division mondiale (Géorgie, Uruguay, Espagne, Portugal, Samoa, Tonga…). Promotion/relégation prévue à terme.
- **Coupe du monde 2027 (Australie)** : **24 équipes**, 6 poules de 4, **huitièmes de finale** (2 premiers + 4 meilleurs 3es), 1er oct. – 13 nov. 2027.
- **Lions britanniques et irlandais** : tournée tous les 4 ans (2025 en Australie).
- **Sevens** (rugby à 7, olympique) et **rugby féminin** (Coupe du monde 2025 gagnée par l'Angleterre, compétitions pros en croissance : Élite 1, PWR) → extensions possibles.

---

## 3. Économie & marché des joueurs (très différent du foot)

### 3.1 Salary caps
| Ligue | Plafond 2026-27 | Particularités |
|---|---|---|
| Top 14 | **11 M€** (puis +100 k€/an jusqu'à 11,3 M€ en 2029-30) | Bonus de plafond pour les clubs fournissant des internationaux (UBB 12,72 M€, Toulon 12,18 M€) ; contrats image et équipementiers hors cap ; **jokers médicaux / jokers Coupe du monde** |
| PREM | **£6,4 M** + plancher £5,4 M | Joueurs « marquee » hors cap ; crédits pour joueurs formés au club |
| URC | Pas de cap commun | Budgets fédéraux (Irlande très riche, Galles en crise) |
| Japon | Pas de cap | Salaires les plus élevés pour les stars |

- Les **sanctions de dépassement** sont réelles (Saracens relégués en 2020 pour fraude au cap). → mécanique de « risque » pour un manager tricheur.
- Budgets Top 14 : ~20-45 M€. Revenus : **sponsoring local** (énorme en France, « partenaires » PME), billetterie, droits TV (Canal+), hospitalités, subventions des collectivités. Le **président-mécène** est un archétype (Toulon, Racing, Lyon…).

### 3.2 Quotas & éligibilité
- **JIFF** (Joueurs Issus des Filières de Formation, France) : moyenne de **16 JIFF par feuille de match** sur la saison sinon retrait de points ⚠️ *seuils exacts à vérifier pour 2026-27*. Le statut JIFF s'obtient par 5 saisons en centre de formation/licence FFR avant 23 ans. → **contrainte de composition forte** qui valorise la formation.
- **Éligibilité internationale** : 5 ans de résidence (porté de 3 à 5 ans en 2022), ou ascendance (parents/grands-parents). **Changement de nation possible** après 3 ans sans sélection (règle 2022 → Tonga, Samoa, Fidji récupèrent des joueurs). Une fois sélectionné en test officiel, on est « capé » pour un pays.
- **Politiques de sélection des fédérations** :
  - **Nouvelle-Zélande** : seuls les joueurs sous contrat en NZ sont sélectionnables (sauf sabbatique négociée).
  - **Angleterre** : joueurs évoluant hors d'Angleterre non sélectionnables, sauf exceptions (règle assouplie récemment).
  - **Irlande** : contrats centraux IRFU, presque tous les internationaux jouent en Irlande.
  - **Afrique du Sud, Argentine, Fidji** : sélectionnent partout dans le monde.
  - **France** : joueurs du Top 14 de facto.
  → Pour un joueur, **partir à l'étranger = parfois renoncer à sa sélection**. Dilemme parfait pour des négociations.

### 3.3 Transferts & contrats
- Le marché fonctionne surtout **en fin de contrat** : **pas (ou peu) d'indemnités de transfert**, mais des **rachats de contrat** possibles (indemnités de rupture), parfois énormes.
- **Pré-contrats** signés très tôt (souvent 12-18 mois à l'avance), annonces en milieu de saison.
- **Prêts** rares mais existants ; **jokers médicaux** (remplacer un blessé longue durée hors période de mutation) ; **jokers Coupe du monde**.
- **Agents** très influents ; **clauses de sortie** pour les Japon/sabbatiques.
- **Fenêtre** : le mercato principal est l'été, avec annonces dès l'hiver.
- **Contrats « espoirs »** : centre de formation, puis premier contrat pro.

---

## 4. Staff & organisation d'un club pro
- **Président** (et actionnaire) → **Manager / Directeur du rugby** (le rôle du joueur) → **Entraîneur principal**.
- **Adjoints spécialisés** : avants, **mêlée**, **touche**, arrières/attaque, **défense**, jeu au pied, skills, **préparateurs physiques**, **analyste vidéo/data**, **médical** (médecin, kinés), **nutrition**, **psychologue/mental**, **recruteur**, **responsable du centre de formation**.
- **Leaders sur le terrain** : capitaine, **leader de touche (« lanceur de combinaisons »)**, leader de défense, **buteur désigné**, « finisseurs ».
- En France le duo **manager + entraîneur** est courant ; les directeurs sportifs portent aussi le recrutement.

---

## 5. La tactique (la matière première du gameplay)

### 5.1 Attaque
- **Structures de pods** : 1-3-3-1, 2-4-2, 3-3-2… (répartition des avants sur la largeur).
- **Jeu de « shape »** : ligne de passe derrière les avants, double rideau, leurres.
- **Jeu au près vs jeu au large**, **offload** (passe après contact), **pick and go** près de la ligne.
- **Stratégie de jeu au pied** : occupation (kick-to-territory), **jeu de pression** (chandelles, box kicks à disputer), « kick-chase », 50:22, coups de pied rasants dans le dos de la défense.
- **Choix sur pénalité** : prendre les points, **touche** (maul), mêlée, jouer vite. Dépend du score, du temps et de la confiance dans le maul.
- **Gestion de fin de match** : garder le ballon (« pick and go » pour tuer le temps), jouer au pied, chercher le drop.

### 5.2 Défense
- **Montée inversée / rush (blitz)** : pression agressive (Afrique du Sud, Irlande, France de Shaun Edwards).
- **Défense en glissade (drift)**, **parapluie (umbrella)**.
- **Engagement au ruck** : contester (grattage) ou ne pas s'engager et « remplir la ligne ».
- **Fond de terrain** : 2 ou 3 joueurs en couverture (selon le jeu au pied adverse).
- **Défense anti-maul** : contester tôt ou ne pas s'engager.

### 5.3 Phases statiques
- **Touche** : nombre de joueurs alignés (4 à 7), lancer devant/milieu/fond, combinaison maul vs ballon porté vs jeu en mouvement.
- **Mêlée** : pousser pour la pénalité, sortir vite, lancement de jeu du 8 ou du 9.

### 5.4 Style d'équipe & identité
- **Grands styles nationaux** : jeu de dépossession et de puissance (Afrique du Sud), jeu de mouvement (NZ, Fidji « flair »), jeu de structure et de phases (Irlande), jeu de turnover/contre-attaque (France).
- Les supporters et présidents attendent souvent un **style** (« le jeu toulousain »).

---

## 6. Données & statistiques d'un match pro
Ce que les analystes (Opta, Stats Perform, GPS Catapult/STATSports) mesurent — et donc ce que notre jeu doit produire :
- **Équipe** : possession, territoire, mètres gagnés, franchissements, temps de jeu, vitesse de ruck (< 3 s = rapide), % touche, % mêlée, pénalités concédées, turnovers, jeu au pied (nombre, mètres, 50:22), entrées dans les 22 et points par entrée.
- **Joueur** : courses (carries), mètres, défenseurs battus, franchissements, offloads, passes, plaquages (réussis/manqués/dominants), grattages, rucks nettoyés, ballons en touche gagnés/volés, % au pied, cartons, minutes, **nombre de contacts/collisions**.
- **Physique** : distance totale, distance à haute vitesse, sprints, accélérations, collisions/min.

---

## 7. Culture & narration (pour l'immersion)
- **Identité locale** forte en France (villes moyennes : Castres, Pau, Clermont, Brive, Bayonne), **derbies** (Bayonne-Biarritz, Toulouse-Castres, Clermont-Brive, Toulon-Racing…).
- **Le Bouclier de Brennus**, le « brennus soulevé sur la place du Capitole ».
- **Troisième mi-temps**, esprit de vestiaire, **capitaine charismatique**, « joueurs de devoir » vs « stars ».
- **Arbitre respecté** (on dit « Monsieur »), presse quotidienne (Midi Olympique, L'Équipe), consultants TV.
- **Joueurs du Pacifique** (Fidji, Samoa, Tonga) : nombreux dans le Top 14, enjeux de sélection et de famille.
- **Retraites anticipées** liées aux commotions → thème humain fort.

---

## 8. Ce qui existe déjà (la concurrence)
| Jeu | Constat |
|---|---|
| **Rugby Union Team Manager 4** (2022) | La référence « indé », avis Steam **mitigés**, interface datée, simulation textuelle |
| **National Rugby Manager** | Centré Top 14/Pro D2, avis **mitigés** (~50 avis) |
| **Blackout Rugby** | Manager multijoueur en ligne, profondeur tactique correcte, mais orienté free-to-play |
| **Rugby Management: School to Senior** | En développement, carrière depuis l'école |
| **Football Manager 26** (modèle) | Passage à **Unity**, nouveau moteur de match 3D très salué, tactiques **avec/sans ballon** ; **interface critiquée** (menus confus, bugs) |

→ **Il n'existe aucun « Football Manager du rugby » ambitieux et beau**. Le créneau est vide. Les leçons de FM26 : le moteur de match est ce qui fait vendre, **l'ergonomie de l'interface** est ce qui fait abandonner.

---

## 9. Licences & données réelles
- FM paie des **licences** (noms, logos, maillots, joueurs via FIFPro). Sans licence, un jeu **publié** ne peut pas utiliser logos, maillots ni (selon les pays) les noms/visages réels des joueurs.
- Approche classique des jeux indés : **base fictive livrée par défaut + éditeur / import de fichiers communautaires** pour les vrais noms.
- Pour un projet **perso non distribué**, les noms réels peuvent être utilisés dans une base locale ; à trancher dans le brainstorming.

---

## 10. Synthèse : ce qui doit être « rugby » dans le jeu (et pas du foot repeint)

1. **Un moteur de match basé sur les phases** (ruck, mêlée, touche, maul, jeu au pied), pas sur la possession continue.
2. **La morphologie** (taille/poids) et **la spécialisation des postes** (piliers non interchangeables, 1re ligne obligatoire).
3. **Le banc comme arme tactique** (5-3 / 6-2 / 7-1, timing des « finisseurs »).
4. **La discipline et l'arbitre** : profils d'arbitres, cartons, rouge 20 min, TMO.
5. **La santé** : collisions, HIA, commotions, rotation, saison longue, doublons.
6. **Le salary cap** + **les quotas JIFF** + les **politiques de sélection** des fédérations.
7. **Un marché sans indemnités de transfert** : fin de contrat, pré-contrats, rachats, jokers, Japon/R360 comme concurrents.
8. **Le calendrier international** : 6 Nations, Nations Championship, Coupe du monde, Lions → perte des internationaux.
9. **Les points bonus** et règles propres à chaque compétition (3 essais d'écart, défensif ≤ 5 ou ≤ 7).
10. **La culture** : identité de jeu attendue, président, territoire, derbies.

---

### Sources principales
- [Top 14 loosens salary cap — RugbyPass](https://www.rugbypass.com/news/top-14-loosens-salary-cap-ahead-of-new-season/) · [Club-by-club Top 14 salary cap 2026-27](https://www.rugbypass.com/news/club-by-club-top-14-salary-cap-revealed-for-2026-27-season/)
- [World Rugby — 2026-07 Law updates](https://passport.world.rugby/laws-of-the-game/whats-new/2026-07-law-updates/) · [World Rugby lowers tackle height in community rugby](https://www.world.rugby/news/1044753/world-rugby-lowers-legal-tackle-height-in-community-rugby) · [World Rugby Council approves law changes — rugby365](https://rugby365.com/countries/argentina/world-rugby-council-approves-law-changes-ahead-of-test-season/)
- [Nations Championship format — rugby.com.au](https://www.rugby.com.au/news/nations-championship-officially-launches-as-2026-fixtures-format-unveiled-20251117) · [World Rugby Nations Cup 2026](https://www.world.rugby/news/1043086/everything-you-need-to-know-about-the-world-rugby-nations-cup)
- [RWC 2027 format — World Rugby](https://www.world.rugby/news/1017765/rugby-world-cup-2027-all-you-need-to-know-about-the-draw-format-pools-and-dates)
- [Prem salary floor — The Star](https://www.thestar.com.my/sport/rugby/2026/03/27/rugby-english-prem-to-introduce-salary-floor) · [RFU confirms closed model — Sportcal](https://www.sportcal.com/news/rfu-confirms-separation-of-prem-and-champ-rugby-move-to-closed-model/) · [2026–27 Premiership Rugby](https://wiki.krisyotam.com/content/wikipedia_en_all_nopic_2026-03/2026%E2%80%9327_Premiership_Rugby)
- [Champions Cup 2026/27 changes — Irish Times](https://www.irishtimes.com/sport/rugby/2026/06/29/champions-cup-makes-changes-to-format-to-boost-competitiveness-in-pool-stage/) · [Scotsman](https://www.scotsman.com/sport/rugby-union/champions-cup-202627-everything-you-need-to-know-format-changes-new-bonus-point-system-final-venue-9287454)
- [URC 2026-27 — SA Rugby Mag](https://www.sarugbymag.co.za/blockbuster-start-to-2026-27-urc-season/) · [Planet Rugby](https://www.planetrugby.com/news/investec-champions-cup-2026-27-confirmed-every-team-who-has-qualified-fixture-dates-and-how-to-watch)
- [Super Rugby 2027 changes — rugby.com.au](https://www.rugby.com.au/news/expanded-season-singleelimination-finals-confirmed-for-2027-super-rugby-pacific-season-2026630) · [Moana Pasifika exit](https://www.rugby.com.au/news/new-zealand-rugby-confirm-moana-pasifikas-2027-super-rugby-pacific-departure-ten-team-competition-2026623)
- [R360 delayed to 2028 — Sky Sports](https://www.skysports.com/rugby-union/news/12321/13476440/r360-breakaway-rebel-rugby-tournament-announces-delay-of-launch-by-two-years-to-2028)
- [Toulouse 4e titre — rugby365](https://rugby365.com/tournaments/top-14/toulouse-secure-fourth-straight-top-14-title-in-storm-impacted-final/) · [UBB conserve la Champions Cup — Fox Sports](https://www.foxsports.com/articles/soccer/bordeaux-rout-leinster-in-champions-cup-final-and-seal-a-french-treble-of-european-titles)
- [Calendrier LNR 2026-27 — RugbyPass](https://www.rugbypass.com/news/le-calendrier-de-la-saison-2026-2027-est-connu-voici-les-trois-doublons-qui-concernent-le-top-14/) · [Convention FFR-LNR — Sud Radio](https://www.sudradio.fr/sud-radio/rugby-ce-quil-faut-retenir-de-la-nouvelle-convention-commune-entre-la-ffr-et-la-lnr)
- [Performance indicators in rugby union — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6988915)
- [FM26 review — PC Gamer](https://www.pcgamer.com/games/sports/football-manager-26-review) · [Operation Sports](https://www.operationsports.com/football-manager-26-review-a-brilliant-game-trapped-in-a-clunky-shell/)
- Steam : [Blackout Rugby](https://store.steampowered.com/app/1157960) · [Rugby Union Team Manager 4](https://store.steampowered.com/app/1880930) · [National Rugby Manager](https://store.steampowered.com/app/752640) · [Rugby Management: School to Senior](https://store.steampowered.com/app/4278850)

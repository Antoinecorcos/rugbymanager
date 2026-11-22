# Argent et marché (M6b)

Seconde moitié du management en profondeur. Elle couvre les contrats, le salary cap et le JIFF, les finances, le président, le marché des transferts à la française, la presse et le recrutement du staff.
**M6c** traitera du passage à la saison 2027-2028. Les arrivées convenues pendant la saison (pré-contrats, rachats) y prendront effet le 1er juillet.

Captures : `docs/captures/m6b-*.png`.

## Contrats — `world/contracts.ts`
- ⚠️ **Les salaires du rugby ne sont pas publics : ils sont estimés.**
  - **Le calcul** : un barème par championnat, selon le niveau, l'âge et les sélections. Le Top 14 a les salaires les plus hauts, puis la PREM, l'URC, la Pro D2 et la Nationale.
  - **Le recalage** : la masse salariale de chaque club est ajustée à son budget (environ 42 % pour le Top 14) et à son plafond. Le Top 14 vise 96 % du salary cap pour garder un peu de marge.
  - **Le résultat** : environ 920 k€ pour Dupont, une médiane du Top 14 entre 130 et 200 k€, et autour de 100 k€ en Pro D2.
- **Échéances** : réelles quand le club les publie (48 joueurs du Top 14), sinon estimées selon l'âge. Environ un tiers des contrats se terminent en juin 2027.
- **Salary cap 2026-27 du Top 14** : 11 M€, plus 120 k€ par international français, jusqu'à +1,7 M€ (Bordeaux-Bègles et Toulouse atteignent 12,7 M€). La PREM est plafonnée à 7,5 M€ (6,4 M£) ; l'URC et la Pro D2 n'ont pas de plafond dans le jeu.
- **JIFF** : la moyenne exigée de JIFF par feuille de match de championnat est de 16 en Top 14 (14 en Pro D2, valeur estimée). Elle est suivie sur tes feuilles de match.
  ⚠️ Les statuts JIFF des joueurs réels sont estimés (voir docs/05). Le président fixe donc l'objectif au niveau réaliste du club au départ, sans dépasser la règle.
- **Premier contrat** : un espoir intégré à l'effectif reçoit un contrat de trois saisons.

## Finances — `world/finances.ts`
- **Le budget réel** du club (clubs français) est réparti en postes estimés :

  | Recettes | Dépenses |
  |---|---|
  | Partenaires (42 %) | Masse salariale |
  | Droits TV et ligue (14 %) | Staff |
  | Collectivités (5 %) | Fonctionnement |
  | Billetterie | Déplacements |
  |  | Recrutement (rachats, commissions d'agents, indemnités) |

- **Billetterie** :
  - les **abonnements** (45 % de la billetterie attendue) sont encaissés en juillet ;
  - chaque match à domicile rapporte ensuite selon l'affluence (remplissage selon la forme, l'adversaire et l'enjeu) et le prix par spectateur, hospitalités comprises.
- **Primes** de qualification en phase finale, majorées en Champions Cup.
- **La saison démarre à l'équilibre** : ce sont les résultats, l'affluence et le recrutement qui font la différence. Avec le staff, Toulouse champion finit à +7 M€ et Pau 6e à +0,9 M€.
- **Écran Finances** : trésorerie, prévision de fin de saison, masse salariale (cette saison et la suivante) face au budget et au salary cap, JIFF, opérations, demandes au président.

## Président — `world/board.ts`
- **Objectifs fixés au départ** selon la force de l'effectif dans son championnat : titre, phases finales, top 8 ou maintien (Top 14) ; montée, phases finales ou maintien (Pro D2 et Nationale). S'y ajoutent le salary cap, le JIFF et l'équilibre des comptes.
- **Confiance** (0 à 100), qui évolue :
  - **après chaque match** : la victoire compte d'autant plus que l'adversaire est fort, la défaite d'autant plus qu'il est faible, et les phases finales pèsent double, voire triple pour une finale ;
  - **chaque lundi**, avec le classement par rapport à l'objectif ;
  - **chaque mois**, avec la trésorerie négative, un salary cap dépassé au-delà de la masse héritée, ou un JIFF sous l'objectif.
- **Alertes** : sous 40, le président s'inquiète ; sous 25, il pose un **ultimatum** ; sous 12, trois semaines après l'ultimatum et avec au moins 8 matchs joués, tu es **licencié**. La carrière s'arrête alors sur un écran de fin. L'ultimatum est levé si la confiance remonte au-dessus de 40.
- **Demandes** : une rallonge du budget salarial (+5 %, sans dépasser le salary cap) ou du budget de recrutement. Elles sont acceptées si la confiance est d'au moins 60 et les comptes positifs, une fois tous les 60 jours au plus.
- **Réputation du manager** : 65 au départ pour un gros club, 30 sans diplôme. Elle évolue avec les résultats et rend le club plus attractif.

## Marché à la française — `world/market.ts`
| Accord | Quand | Effet |
|---|---|---|
| **Pré-contrat** | Joueur en fin de contrat en juin, ou libre | Il arrive le **1er juillet** (M6c) |
| **Rachat de contrat** | Joueur sous contrat au-delà de juin | Indemnité d'environ la moitié du salaire restant (×1,6 pour un titulaire, ×2,5 pour un cadre) ; les cadres du Top 14 et de la PREM sont intransférables ; arrivée le 1er juillet |
| **Joker médical** | Un de tes joueurs est absent 10 semaines ou plus | **Arrivée immédiate**, contrat jusqu'à la fin de la saison |
| **Prolongation** | Tes propres joueurs | Nouveau contrat ; moral et confiance en hausse |

- **Exigences de l'agent** : un salaire sur le barème du championnat d'arrivée, majoré selon l'ambition, la descente de niveau et la perte de sa sélection. Il veut aussi une durée (selon l'âge) et un **statut**, c'est-à-dire le temps de jeu qu'il peut espérer dans ton effectif.
- **Intérêt du joueur**, avec ses raisons affichées :
  - l'attrait du championnat (le Top 14 d'abord) et le prestige du club ;
  - sa loyauté et sa préférence pour son pays ;
  - la **perte de sa sélection** : un Anglais qui quitte la PREM, un Irlandais ou un Gallois qui quitte l'URC, un international français qui quitte le Top 14 ;
  - ta réputation ;
  - pour tes propres joueurs, leur confiance et leur moral.
- **La négociation** : on fait une offre (salaire, durée, statut promis). L'agent accepte, refuse en reformulant sa demande, ou ferme la porte. Après trois tours sans accord, il ne répond plus pendant un mois. Le salary cap, le budget salarial et le budget de recrutement (indemnité et commission de 8 %) sont contrôlés avant chaque offre.
- **Clubs de l'IA**, chaque lundi d'octobre à mai : ils prolongent une partie de leurs joueurs, puis signent des pré-contrats aux postes où il leur manque du monde. Sur une saison, on compte environ 180 à 200 pré-contrats, cohérents d'une ligue à l'autre. Les départs du Top 14 vers l'étranger concernent surtout des étrangers qui rentrent chez eux.
- **Tes joueurs convoités** : un club de l'IA t'**approche d'abord**, ce qui déclenche une nouvelle ; il peut signer trois semaines plus tard si tu n'as pas prolongé le joueur.
- **Supervision** :
  - **ce que le staff sait d'un joueur** : tout pour ton club, environ 60 % pour ton championnat, 50 % pour un international, 25 % au-delà ;
  - **tant qu'il n'est pas supervisé**, son niveau est une fourchette et ses notes sont des estimations ;
  - **un rapport** arrive en une à deux semaines, avec six supervisions au maximum en parallèle, et révèle le niveau exact, les attributs et le potentiel.
- **Joueurs libres** : 45 joueurs **fictifs** sans club forment le vivier des jokers médicaux.
- **Écran Recrutement** : recherche filtrée, supervisions, accords et joueurs convoités, contrats de l'effectif avec prolongations. Les fiches joueur ont aussi des boutons Négocier, Prolonger et Superviser.

## Presse — `world/press.ts`
Avant chaque match, une conférence facultative pose trois questions selon le contexte : série en cours, adversaire, joueur cité, pression du président. Le ton de la réponse compte :
- confiant : un peu de moral en plus ;
- humble : le président apprécie ;
- combatif : plus de moral, mais le président tique ;
- évasif : léger agacement du président.

Les réponses agissent aussi sur le moral du joueur cité et produisent un titre dans la boîte de réception.

## Staff (suite de M6a) — `world/staff.ts`
- **Salaire** de chaque membre du staff estimé selon sa qualité et le championnat.
- **Marché du staff** : 36 candidats **fictifs**, quatre par fonction. En engager un remplace le titulaire, avec une indemnité de trois mois de salaire prise sur le budget de recrutement.

## Sauvegardes
`ensureWorldExtensions` (version 3 du monde) ajoute à une partie M6a les contrats, les finances, le président, les joueurs libres et le marché du staff.

## Vérification
- Moteur, `test/m6b.test.ts` (12 tests) :
  - contrats et salary cap ;
  - comptes mensuels et billetterie ;
  - objectifs et demandes ;
  - ultimatum puis licenciement ;
  - supervision ;
  - prolongation, contre-offre et blocage après trois tours ;
  - refus pour salary cap ;
  - pré-contrat et joker médical ;
  - marché de l'IA avec approche préalable ;
  - presse ;
  - recrutement du staff ;
  - migration.
- Jeu, `test/market.test.ts`, sur la vraie base : masses salariales sous le plafond, Dupont parmi les mieux payés, objectifs de Toulouse, pré-contrat d'un joueur de Pro D2 avec Pau.
- Calibrage : 29/29.
- Parcours Chromium : `pnpm --filter @ovalie/game smoke:market`, plus `smoke`, `smoke:club` et `smoke:live`.

## Limites et suites
- **Les salaires, les budgets par poste, les affluences et les prix sont estimés.** Les budgets PREM et URC ne sont pas connus : ils sont tirés de la réputation.
- **Les arrivées et départs convenus ne prennent effet qu'en M6c**, le 1er juillet. M6c traitera aussi les fins de contrat sans accord (prolongation ou départ), le vieillissement et les retraites, la sanction JIFF et les objectifs de la saison suivante.
- **Pas d'agents nommés, de clauses ni de primes de match.** Pas de prêts, rares en rugby.
- **Une seule offre de poste** : une fois licencié, on recommence une carrière depuis le menu ; les offres d'autres clubs viendront avec M6c.

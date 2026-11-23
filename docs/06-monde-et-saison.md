# Monde et saison (M3)

Code : `packages/engine/src/world/` (simulation, TypeScript pur et déterministe) et `packages/data` (calendrier réel, adaptateur base → monde).

## Démarrage de la partie : le 1er juillet 2026
La partie commence le **mercredi 1er juillet 2026**, au début de la saison 2026-2027 (c'est aussi le jour réel du tirage des poules européennes).

- Les **effectifs** sont ceux de la saison 2026-2027 (mercato d'été compris).
- Les **notes** n'utilisent que les statistiques connues au 1er juillet, c'est-à-dire jusqu'à la saison 2025-2026. Les statistiques 2026-2027 collectées en novembre sont « le futur » et sont ignorées (`DATABASE_STATS_SEASON`).
- Les **âges** sont calculés au 1er juillet 2026 (`DATABASE_REFERENCE_DATE`).
- Aucun résultat réel de 2026-2027 n'est importé : toute la saison est simulée.

## Le calendrier réel 2026-2027
`pnpm --filter @ovalie/data import:calendar` → `packages/data/calendar/2026-2027.json`.

| Compétition | Source | Contenu |
|---|---|---|
| Top 14 | Calendrier officiel LNR | 26 journées (182 matchs, du 5 sept. 2026 au 5 juin 2027) ; barrages le 12 juin, demi-finales le 19 juin, finale le 26 juin 2027, access match le 19 juin |
| Pro D2 | Calendrier officiel LNR | 30 journées (240 matchs, dès le 27 août 2026), barrages, demies, finale (5 juin), barrage d'accession |
| Nationale | **Généré** (la FFR ne publie pas de calendrier daté exploitable) | 26 journées le samedi, puis phases finales |
| PREM | Wikipédia EN | 18 journées (90 matchs), demies, finale à Twickenham |
| URC | Wikipédia EN | 18 journées (144 matchs), quarts, demies, finale |
| Champions Cup | Wikipédia EN | 4 poules de 6 (48 matchs, octobre à janvier) ; 8es, quarts, demies ; finale à Lyon le 22 mai 2027 |
| Challenge Cup | Wikipédia EN | 3 poules de 6 (dont les invités Black Lion et Cheetahs) ; 8es avec les 4 reversés de Champions Cup |
| Nations Championship | Wikipédia EN | Tests de juillet (J1 à J3) et de novembre (J4 à J6), finales de classement à Twickenham (27-29 nov.) |
| Tournoi des Six Nations 2027 | Wikipédia EN | 5 journées, du 5 février au 13 mars 2027 |

**Fenêtres internationales** (convocations) : tests de juillet (1er-19 juillet), tests de novembre (30 oct.-30 nov.), Tournoi (26 janv.-14 mars, pour les Six Nations et les nations du Rugby Europe Championship). En juillet et en novembre, toutes les nations convoquent.
Les **doublons** viennent du calendrier réel : le Top 14 joue les J8, J9 et J10 pendant les tests de novembre et les J16, J17 et J18 pendant le Tournoi.

Les **clubs invités** (Black Lion, Cheetahs) n'ont pas d'effectif publié : ils reçoivent un effectif généré à un niveau estimé (`levelHint`, environ celui d'un haut de tableau de Pro D2).

## La simulation, jour après jour
`createWorld(setup)` construit l'état initial ; `advanceDay(monde)` simule une journée, `advanceTo(monde, date)` va jusqu'à une date, `playSeason(monde)` joue toute la saison. L'état (`World`) est un objet JSON : il servira de base aux sauvegardes (M8).

Chaque jour :
1. **Convocations** si une fenêtre internationale commence : chaque nation choisit ses 32 joueurs (28 pour les nations hors compétition, uniquement parmi les joueurs déjà sélectionnés). Les joueurs blessés pour plus d'une semaine ne sont pas appelés.
2. **Phases finales** : un tour est créé dès que le précédent est terminé, à la date du calendrier.
3. **Matchs du jour** : sélection automatique des 23, simulation avec le moteur de match (graine = graine du monde + identifiant du match), puis mise à jour des statistiques, de la fraîcheur, des blessures et des sanctions.
4. **Récupération** de la fraîcheur, fin des blessures, des suspensions et des sélections.

### Disponibilité des joueurs
| État | Règle |
|---|---|
| **Blessure** | Durée donnée par le moteur de match (commotion, ischios, ligaments croisés…). Les blessures de 4 semaines ou plus font l'objet d'une actualité. |
| **Suspension** | Rouge de 20 minutes : 2 semaines ; rouge définitif : 4 semaines ; 3 cartons jaunes : 1 semaine. |
| **Sélection** | Le joueur est indisponible pour son club pendant toute la fenêtre. Il est ensuite mis au repos 10 jours (esprit de la convention FFR-LNR). |
| **Fraîcheur** (0-100) | Un match de 80 minutes coûte environ 30 points à un avant et 24 à un arrière (moins avec une bonne endurance) ; un jour de repos en rend environ 2,2. |
| **Rotation** | Hors matchs à élimination directe, un joueur est laissé au repos après 3 titularisations de suite ou si sa fraîcheur tombe sous 55, en gardant toujours au moins 26 joueurs disponibles. La sélection pénalise aussi les joueurs fatigués. |

Exemple (graine « ovalie ») : Antoine Dupont commence 15 matchs de Top 14, 8 de Champions Cup et 12 tests sur la saison.

### Formats des compétitions (2026-2027)
| Compétition | Format simulé |
|---|---|
| Top 14 | Top 6 : barrages 3e-6e et 4e-5e chez le mieux classé, demi-finales sur terrain neutre (1er contre le vainqueur de 4-5, 2e contre celui de 3-6), finale au Stade de France. Le 14e descend ; le 13e joue l'**access match** chez lui contre le finaliste battu de Pro D2. |
| Pro D2 | Top 6 de la même façon (demies chez le 1er et le 2e), finale sur terrain neutre ; le champion monte. Le 16e descend ; le 15e reçoit le finaliste battu de Nationale en barrage d'accession. |
| Nationale | Comme la Pro D2 ; le champion monte. **Pas de relégation** en 2026-2027 (passage à 16 clubs). |
| PREM | Top 4 : demies chez les 1er et 2e, finale à Twickenham. Ligue fermée. |
| URC | Top 8 : quarts (1-8, 4-5, 2-7, 3-6), demies et finale chez la meilleure tête de série. |
| Champions Cup | Les 3 premiers de chaque poule et les 4 meilleurs 4e/5e/6e sont classés de 1 à 16 : 8es (1 contre 16 … 8 contre 9), tableau fixe EPCR, finale à Lyon. Les 4 suivants sont reversés en Challenge Cup. |
| Challenge Cup | Les 4 premiers de chaque poule et les 4 reversés de Champions Cup, même tableau. |
| Nations Championship | Deux conférences de 6 ; chaque nation affronte les 6 de l'autre conférence ; finales de classement (1er contre 1er, etc.) à Twickenham. |
| Tournoi des Six Nations | Classement unique ; bonus de Grand Chelem (+3), Triple Couronne et Cuillère de bois. |

Points de bonus : Top 14, Pro D2 et Nationale « 3 essais de plus » et défaite de 5 points ou moins ; coupes d'Europe « 3 essais de plus » et défaite de 7 points ou moins ; PREM, URC et tests « 4 essais » et défaite de 7 points ou moins. Les finales sont jouées **sans avantage du terrain** (nouvelle option `neutral` du moteur de match).

### Sélections nationales
Les règles des fédérations (dossier de recherche §3.2) sont appliquées :

| Nation | Qui peut être sélectionné |
|---|---|
| Nouvelle-Zélande | Uniquement des joueurs sous contrat en Nouvelle-Zélande (aucun dans la base) |
| Angleterre | Uniquement des joueurs de PREM |
| Irlande | Uniquement des joueurs des provinces irlandaises |
| Australie | Les joueurs évoluant à l'étranger doivent avoir 30 sélections ou plus (« loi Giteau ») |
| Pays de Galles | Les joueurs évoluant à l'étranger doivent avoir 25 sélections ou plus |
| Autres nations | Aucune restriction de club |

Pour les nations dont les joueurs évoluent presque tous hors de la base (Nouvelle-Zélande, Australie, Japon), le monde crée des **joueurs virtuels** (identifiants `nat-…`, noms fictifs) au niveau de la nation. Ailleurs, des virtuels ne comblent que les manques d'effectif, au niveau des vrais sélectionnables, sans leur prendre leur place. Le niveau des nations (`NATION_LEVEL`) suit approximativement le classement World Rugby 2026.

## Bilan et actualités
- `seasonSummary(monde)` donne le palmarès, les montées et descentes entre Top 14, Pro D2 et Nationale, les meilleurs marqueurs (essais et points) de chaque compétition, l'ampleur des doublons et le nombre de blessures longues.
- `monde.news` contient les actualités datées, en français, rattachées aux clubs concernés (convocations, blessures longues, suspensions, phases finales, titres) : c'est la matière de la future boîte de réception (M4).

## Validation (tests `packages/engine/test/world.test.ts` et `packages/data/test/world.test.ts`)
- Calendrier : bon nombre de matchs par compétition, vraies dates du Top 14, uniquement des clubs connus, chaque club joue au plus une fois par journée.
- Saison complète depuis le 1er juillet : tous les matchs sont joués et chaque compétition a un champion, en environ 8 secondes.
- Formats : barrages, demi-finales, finale et access matches ; 8es européens avec les 4 reversés ; finales du Nations Championship ; finale du Top 14 sur terrain neutre.
- Montées et descentes cohérentes : autant de clubs montent que de clubs descendent.
- **Doublons** : aucun absent lors des premières journées ; plus de 30 internationaux absents lors des journées jouées pendant les tests de novembre et le Tournoi.
- Aucun club ne joue deux fois en moins de 4 jours.
- Charge de travail : Dupont entre 20 et 40 matchs sur la saison, au plus 18 titularisations en Top 14.
- Scores du Top 14 dans les fourchettes de calibrage ; meilleur réalisateur au-dessus de 150 points.
- Déterminisme : la même graine donne exactement la même saison.

Le moteur de match a été retouché pour M3 : dans le dernier quart d'heure d'un match serré (écart de 1 à 12 points), l'équipe menée pousse et celle qui mène gère. Le bonus défensif passe de 0,21 à 0,27 par match (0,32 dans la réalité) ; le calibrage reste à 29/29, sur équipes générées comme sur les vrais effectifs.

Exemples de sortie : `docs/exemples/saison-2026-2027.txt` (saison complète) et `docs/exemples/saison-toulouse-novembre.txt` (Toulouse au 30 novembre).

## Limites et suites
- **Saisons suivantes** : le passage à 2027-2028 et au-delà (montées et descentes, retraites, calendrier généré, Coupe du monde 2027 en Australie) est décrit dans `docs/11-saison-suivante.md`.
- Le calendrier de la Nationale est généré ; les dates des phases finales européennes sont celles annoncées par l'EPCR, faute de matchs déjà programmés.
- Les nations hors Nations Championship et Tournoi (Géorgie, Samoa, Tonga, Espagne…) convoquent leurs joueurs pendant les fenêtres, mais leurs matchs ne sont pas simulés.
- La convention FFR-LNR est simplifiée (repos de 10 jours après chaque fenêtre) ; la liste des joueurs protégés et les quotas de minutes viendront avec la gestion du club (M6).
- Arbitres : profil par défaut pour tous les matchs (profils réels en M5).
- Pas encore d'entraînement ni de progression des joueurs en cours de saison (M6).

## Commandes
```bash
pnpm saison                                            # saison complète 2026-2027 depuis le 1er juillet
pnpm saison mongraine --jusqua 2026-11-30 --club toulouse   # arrêt à une date, zoom sur un club
pnpm --filter @ovalie/data import:calendar             # ré-importe le calendrier réel (réseau)
```

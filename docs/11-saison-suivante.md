# Saison suivante (M6c)

Troisième et dernière partie du management en profondeur. Elle permet d'**enchaîner les saisons** : la saison 2026-2027 se termine le 30 juin 2027, la saison 2027-2028 commence le 1er juillet 2027, et ainsi de suite.

Captures : `docs/captures/5*.png` (parcours `smoke:season`).

## Fin de saison — `world/rollover.ts` (`closeSeason`)
Quand la saison se termine (« Continuer » s'arrête sur « Bilan de saison »), on passe par quatre étapes.

- **Le verdict du président** (`seasonVerdict`, `world/board.ts`) :
  - **le classement retenu** est celui de la saison régulière, amélioré par le parcours en phase finale (champion : 1er, finaliste : 2e au moins, demi-finaliste : 4e au moins) ;
  - **objectif atteint** : la confiance monte de 8 points, ou de 14 si l'objectif est dépassé d'au moins trois places, et la réputation gagne 3 points ;
  - **objectif manqué** : la confiance baisse de 3 points, plus 2,5 par place manquée (20 au plus), et la réputation recule ;
  - **un titre** ajoute 15 points de confiance pour le championnat, 8 pour une coupe d'Europe, et fait aussi monter la réputation ;
  - **sous 15 de confiance**, le manager n'est pas conservé pour la saison suivante.
- **La sanction JIFF** ⚠️ estimée. Si la moyenne de JIFF par feuille de match de championnat est sous la règle (16 en Top 14, 14 en Pro D2), le club commence la saison suivante avec des **points de pénalité** : deux points par JIFF manquant en moyenne, dix au plus. Le classement les affiche dans la colonne des ajustements.
- **L'archive de la saison** (`world.history`) garde, pour chaque saison :
  - le palmarès ;
  - les montées et descentes ;
  - pour le manager : le classement, l'objectif, la confiance, la réputation, la moyenne JIFF et les titres.
- **Les offres d'emploi** (`world/jobs.ts`) arrivent dans la boîte de réception.

Un club de Nationale relégué en **Nationale 2** sort des divisions simulées : son manager cherche alors un nouveau club.

## Offres d'emploi — `world/jobs.ts`
- **Qui propose** : les clubs du Top 14, de la Pro D2 et de la Nationale dont le standing correspond à ta réputation. Un club demande une réputation d'environ la moitié de la sienne : Toulouse demande 83, Bayonne 59, Agen 38, Albi 23.
- **Combien d'offres** : de zéro à trois, les clubs les plus ambitieux d'abord, avec une part de hasard.
- **Le contenu d'une offre** : l'objectif du président, selon la force de l'effectif dans son championnat. Elle reste valable 45 jours, ou 60 après un licenciement.
- **Quand elles arrivent** :
  - à la fin de chaque saison ;
  - après un **licenciement** en cours de saison. La réputation perd alors 6 points, et l'écran de fin de carrière propose les offres reçues.
- **Accepter une offre** (`acceptJob`) :
  - tu quittes ton club et son ancien entraîneur reprend sa place ;
  - le nouveau club t'ouvre ses comptes, son président fixe ses objectifs et tu découvres ses joueurs (relations) ;
  - en fin de saison, la prise de fonction se fait avec la saison suivante.
- **L'historique des clubs dirigés** est conservé (`manager.spells`) et affiché sur l'écran Club (« Votre carrière »).

## Passage au 1er juillet — `startNextSeason`
1. **Carrières des joueurs** :
   - les statistiques de la saison passent dans l'historique du joueur, affiché sur sa fiche ;
   - les sélections de la saison s'ajoutent à son total ;
   - la fatigue, les cartons et les convocations sont remis à zéro. Les blessures continuent.
2. **Montées et descentes** :

   | Mouvement | Règle |
   |---|---|
   | Top 14 → Pro D2 | Le 14e descend. Le 13e descend s'il perd l'access match. |
   | Pro D2 → Top 14 | Le champion monte. Le finaliste monte s'il gagne l'access match. |
   | Pro D2 → Nationale | Le 16e descend. Le 15e descend s'il perd son barrage. |
   | Nationale → Pro D2 | Le champion monte. Le finaliste monte s'il gagne son barrage. |
   | Nationale → Nationale 2 | Les deux derniers descendent, à partir de 2027-2028. Il n'y a pas de relégation en 2026-2027. |
   | Nationale 2 → Nationale | De quoi remettre la Nationale à 16 clubs. On reprend d'abord des clubs relégués les saisons précédentes. |

   - ⚠️ La Nationale 2 n'est pas dans la base réelle. Les clubs qui en montent sont **fictifs** (« Ovalie Club Atlantique »…) et marqués comme tels sur l'écran Club. Leur effectif est généré au niveau des plus faibles clubs de Nationale.
   - Un club qui change de division voit son **budget** évoluer : ×1,45 à la montée, avec un minimum selon la division, et ×0,68 à la descente.
3. **Retraites** :
   - automatique à 38 ans ;
   - en fin de contrat : 75 % de chances à 36-37 ans, 30 % à 34-35 ans, 10 % à 33 ans, un peu plus pour un joueur qui n'est plus dans les 23 meilleurs de son club ;
   - sous contrat : un quart des joueurs de 36 ans et plus arrêtent.
   - Un joueur qui a signé ailleurs pour la saison suivante ne prend pas sa retraite. Les clubs de l'IA ne font plus signer de pré-contrat après 34 ans.
4. **Transferts convenus** : les pré-contrats et les rachats signés pendant la saison prennent effet.
5. **Fins de contrat sans accord** :
   - **tes joueurs** partent libres. La boîte de réception te prévient le premier lundi de janvier, mars, mai et juin, en citant les meilleurs d'abord. L'écran de bilan les liste aussi, avec un bouton « Prolonger », tant que tu n'es pas passé à la saison suivante ;
   - **les clubs de l'IA** prolongent 85 % des 28 meilleurs joueurs de leur effectif et 40 % des autres, beaucoup moins après 33 ans ;
   - les **jokers** partent.
6. **Centres de formation** : à 21 ans, un espoir doit avoir trouvé sa place. Les clubs de l'IA l'intègrent s'il a le niveau, sinon il quitte le jeu. Chez toi, il part, sauf si tu l'as intégré avant.
7. **Effectifs** :
   - les clubs de l'IA se complètent jusqu'à leur taille cible (38 en Top 14 et en PREM, 34 en Pro D2, 32 en Nationale) ;
   - ils recrutent poste par poste, d'abord parmi les joueurs libres, sinon avec des joueurs fictifs ;
   - ton staff ne recrute que si ton effectif tombe sous 28 joueurs.
   - **Joueurs libres** :
     - les plus de 35 ans prennent leur retraite ;
     - le vivier garde ses 140 meilleurs joueurs ;
     - il est complété jusqu'à 45 joueurs fictifs au moins.
8. **Nouveau calendrier**, nouvelles compétitions et nouveaux viviers des sélections (les joueurs virtuels sont régénérés).
9. **Ton club** :
   - **les comptes** : la trésorerie est reportée et les totaux de la saison repartent de zéro ;
   - **le budget salarial** est recalculé, sous le salary cap ;
   - **le budget de recrutement** vaut 3 % du budget, plus un quart du bénéfice de la saison ;
   - **les objectifs** sont nouveaux (`newSeasonBoard`) et la confiance revient à mi-chemin de 60 ;
   - **les statuts** de l'effectif sont recalculés, sauf pour les joueurs à qui tu as promis un statut ;
   - **la boîte de réception** repart avec le résumé de l'été.
10. **Staff** : les membres vieillissent d'un an, et le marché du staff est renouvelé.

Le passage est **déterministe**, tiré de la graine de la partie et de la saison. Sur la vraie base, il prend environ 0,2 seconde. Le passage à 2027-2028 compte environ 200 transferts, 80 retraites, 150 prolongations de l'IA et 90 joueurs libérés. Sur quatre saisons enchaînées, le niveau moyen de chaque championnat reste stable : environ 13,1 pour le Top 14, 11,2 pour la Pro D2 et entre 9,1 et 9,6 pour la Nationale.

## Calendrier des saisons suivantes — `world/season-calendar.ts`
⚠️ Seul le calendrier 2026-2027 est réel. Les suivants sont **générés** à partir de la saison qui se termine.

- **Championnats** :
  - mêmes week-ends un an plus tard (52 semaines, donc même jour de la semaine) ;
  - nouvelles affiches tirées au sort en double aller-retour ;
  - si une division compte plus de clubs (la Nationale passe à 16), les journées en plus vont sur des week-ends libres ;
  - **URC** : un match contre chacun des 15 autres, puis le match retour contre les trois clubs de son groupe (Irlande, pays de Galles, Écosse-Italie, Afrique du Sud), aux journées 6, 12 et 18. Cela fait 18 journées, comme en vrai.
- **Coupes d'Europe** :
  - **Champions Cup** : les 8 premiers du Top 14, de la PREM et de l'URC de la saison précédente ;
  - **Challenge Cup** : les autres clubs de ces championnats et les invités (Cheetahs, Black Lion).
  - Les poules de six réunissent deux clubs de chaque championnat. En Champions Cup, la poule 1 reçoit les 1ers et 8es, la poule 2 les 2es et 7es, et ainsi de suite.
  - Chaque club joue les quatre clubs des autres championnats, deux fois à domicile et deux fois à l'extérieur, aux mêmes week-ends que l'année précédente.
- **Coupe du monde 2027** en Australie, du 1er octobre au 13 novembre 2027 :
  - **les poules réelles**, tirées le 3 décembre 2025 :

    | Poule | Équipes |
    |---|---|
    | A | Australie, Nouvelle-Zélande, Chili, Hong Kong |
    | B | Afrique du Sud, Italie, Géorgie, Roumanie |
    | C | Argentine, Fidji, Espagne, Canada |
    | D | Irlande, Écosse, Uruguay, Portugal |
    | E | France, Japon, États-Unis, Samoa |
    | F | Angleterre, pays de Galles, Tonga, Zimbabwe |

  - **le format** : trois journées de poule, puis les deux premiers de chaque poule et les quatre meilleurs troisièmes en huitièmes, sans revanche d'une poule. Viennent ensuite les quarts, les demies, le match pour la 3e place et la finale au Stadium Australia de Sydney.
  - ⚠️ Les dates exactes des matchs sont approximées : poules A et D le vendredi, B et E le samedi, C et F le dimanche.
  - **La fenêtre internationale** va du 2 août au 14 novembre : les internationaux quittent leurs clubs pendant les premières journées de Top 14, comme en 2023.
  - **Les joueurs d'une nation éliminée** rentrent dans leur club le lendemain de l'élimination.
- **Les autres années** :
  - **Six Nations** chaque année, aux mêmes week-ends, avec les réceptions inversées ;
  - **Nations Championship** les années paires (2028…) : trois journées en juillet dans l'hémisphère Sud, trois en novembre dans l'hémisphère Nord, puis les finales de classement à Twickenham ;
  - **tests de juillet et de novembre** les années sans compétition ;
  - **une Coupe du monde tous les quatre ans** : celle de 2031 a des poules générées par niveau.

## Jokers Coupe du monde — `world/market.ts`
- **Le principe** : pendant la fenêtre de la Coupe du monde, un club peut engager un joueur libre pour chacun de ses internationaux partis au tournoi.
- **L'arrivée** est immédiate. Le contrat s'arrête à la fin de la fenêtre (14 novembre 2027), puis le joueur repart libre.
- **La négociation** passe par le même écran que les autres offres (« Joker Coupe du monde »). Le joker médical reste prioritaire.

## Interface
- **Bilan de saison** :
  - **le verdict du président** : objectif atteint ou manqué, avec une icône et un libellé, la confiance, la réputation et la sanction JIFF ;
  - **les offres d'emploi**, à accepter directement ;
  - **le 1er juillet** : arrivées, départs signés et fins de contrat, avec un bouton « Prolonger » ;
  - **le palmarès, les montées et descentes, et le classement final** ;
  - le bouton **« Passer à la saison 2027-2028 »**.
- **Écran de licenciement** : les offres reçues, ou le retour au menu.
- **Club** : le tableau « Votre carrière », avec les saisons, les clubs, les classements, les objectifs et les titres. Les clubs fictifs portent un badge.
- **Fiche joueur** : son historique saison par saison (club, matchs, essais, points, sélections).
- **Compétitions** :
  - un onglet Coupe du monde, avec les poules A à F et la phase finale ;
  - la Nationale affiche ses places de relégation à partir de 2027-2028.

## Correction en passant
Les matchs à élimination directe sont ajoutés en fin de liste quand ils sont générés. Le « prochain match » prenait donc parfois un match de championnat plus lointain : le huitième de Champions Cup du 3 avril n'apparaissait pas comme jour de match. `nextFixture` et la liste des matchs du club prennent maintenant la date la plus proche. Le parcours `smoke:season` a révélé ce problème.

## Sauvegardes
`ensureWorldExtensions` (version 4 du monde) ajoute l'archive des saisons et l'historique des clubs du manager aux parties M6b. Toutes les nouvelles données sont optionnelles.

## Vérification
- Moteur, `test/m6c.test.ts` (10 tests) :
  - dates des journées en plus ;
  - schéma des poules de six ;
  - passage de saison complet : retraite, arrivée convenue, départ libre, historique, nouveau calendrier, objectifs et comptes ;
  - sanction JIFF au classement ;
  - Coupe du monde 2027 jouée jusqu'à la finale, sans revanche de poule en huitièmes, et retour de tous les internationaux ;
  - jokers Coupe du monde ;
  - offres d'emploi et changement de club ;
  - migration ;
  - prochain match après une phase finale ajoutée ;
  - rappels de fins de contrat.
- Jeu, `test/season.test.ts`, sur la vraie base : saison 2026-2027, puis passage à 2027-2028. On vérifie :
  - 14, 16 et 16 clubs dans les trois divisions ;
  - les 8 premiers du Top 14 en Champions Cup ;
  - les poules réelles de la Coupe du monde ;
  - le Tournoi inversé ;
  - des effectifs d'au moins 28 joueurs, tous sous contrat.
- **Plusieurs saisons d'affilée** : `pnpm saison <graine> --saisons 4`.
- **Parcours Chromium** : `pnpm --filter @ovalie/game smoke:season`. Il joue une saison entière en résultats immédiats, puis passe le bilan, change de saison et ouvre la Coupe du monde et l'historique. Il prend une vingtaine de minutes.

## Limites et suites
- **Seul le calendrier 2026-2027 est réel.** Les dates suivantes, l'échelle de la sanction JIFF, les budgets après une montée ou une descente et les probabilités de retraite sont des estimations.
- **La Nationale 2 n'est pas simulée.** Ses clubs (fictifs, ou relégués de Nationale) attendent leur remontée sans jouer.
- **Pas de nouveaux entraîneurs nommés dans les clubs de l'IA, ni de « mercato » de juillet-août pour l'IA.** Les clubs se complètent le 1er juillet.
- **Le manager ne négocie pas son propre contrat** et ne peut pas démissionner en cours de saison.

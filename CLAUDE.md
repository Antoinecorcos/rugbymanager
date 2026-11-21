# Ovalie Manager (nom de travail)

Jeu de management rugby inspiré de Football Manager, non commercial, avec données réelles.

Avant toute tâche, lire :
- `docs/01-recherche-rugby.md` — le monde du rugby (règles, compétitions, économie)
- `docs/02-game-design.md` — le GDD validé (décisions marquées ✅ = ne pas remettre en cause sans le porteur du projet)
- `docs/03-roadmap.md` — stack et étapes (M0 → M8)

Conventions :
- Documentation et textes du jeu en français ; code et identifiants en anglais.
- Le moteur (`packages/engine`) reste du TypeScript pur, déterministe (RNG à graine), sans dépendance UI.
- Toute modification du moteur de match doit garder les tests de calibrage au vert.

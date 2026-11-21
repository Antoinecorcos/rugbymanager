/** Curated mapping of LNR clubs (2026-2027) to their Wikipedia article, short name and city. */
export interface FrClubRef {
  slug: string; // LNR slug, also the club id in the game database
  site: "top14" | "prod2";
  wiki: string;
  name: string;
  shortName: string;
  city: string;
}

export const FR_CLUBS: FrClubRef[] = [
  { slug: "toulouse", site: "top14", wiki: "Stade toulousain", name: "Stade toulousain", shortName: "ST", city: "Toulouse" },
  { slug: "montpellier", site: "top14", wiki: "Montpellier Hérault Rugby", name: "Montpellier Hérault Rugby", shortName: "MHR", city: "Montpellier" },
  { slug: "paris", site: "top14", wiki: "Stade français Paris rugby", name: "Stade français Paris", shortName: "SF", city: "Paris" },
  { slug: "pau", site: "top14", wiki: "Section paloise (rugby à XV)", name: "Section paloise", shortName: "SP", city: "Pau" },
  { slug: "racing-92", site: "top14", wiki: "Racing 92", name: "Racing 92", shortName: "R92", city: "Nanterre" },
  { slug: "la-rochelle", site: "top14", wiki: "Stade rochelais", name: "Stade rochelais", shortName: "SR", city: "La Rochelle" },
  { slug: "clermont", site: "top14", wiki: "ASM Clermont Auvergne", name: "ASM Clermont Auvergne", shortName: "ASM", city: "Clermont-Ferrand" },
  { slug: "bordeaux-begles", site: "top14", wiki: "Union Bordeaux Bègles", name: "Union Bordeaux Bègles", shortName: "UBB", city: "Bordeaux" },
  { slug: "toulon", site: "top14", wiki: "Rugby club toulonnais", name: "RC Toulon", shortName: "RCT", city: "Toulon" },
  { slug: "castres", site: "top14", wiki: "Castres olympique", name: "Castres olympique", shortName: "CO", city: "Castres" },
  { slug: "lyon", site: "top14", wiki: "Lyon olympique universitaire rugby", name: "Lyon OU", shortName: "LOU", city: "Lyon" },
  { slug: "bayonne", site: "top14", wiki: "Aviron bayonnais rugby pro", name: "Aviron bayonnais", shortName: "AB", city: "Bayonne" },
  { slug: "perpignan", site: "top14", wiki: "Union sportive Arlequins perpignanais", name: "USA Perpignan", shortName: "USAP", city: "Perpignan" },
  { slug: "vannes", site: "top14", wiki: "Rugby club vannetais", name: "RC Vannes", shortName: "RCV", city: "Vannes" },
  { slug: "montauban", site: "prod2", wiki: "Union sportive montalbanaise", name: "US Montauban", shortName: "USM", city: "Montauban" },
  { slug: "colomiers", site: "prod2", wiki: "Colomiers Rugby", name: "Colomiers Rugby", shortName: "CR", city: "Colomiers" },
  { slug: "provence-rugby", site: "prod2", wiki: "Provence Rugby", name: "Provence Rugby", shortName: "PR", city: "Aix-en-Provence" },
  { slug: "oyonnax", site: "prod2", wiki: "Oyonnax Rugby", name: "Oyonnax Rugby", shortName: "OYO", city: "Oyonnax" },
  { slug: "valence-romans", site: "prod2", wiki: "Valence Romans Drôme Rugby", name: "Valence Romans Drôme Rugby", shortName: "VRDR", city: "Valence" },
  { slug: "brive", site: "prod2", wiki: "Club athlétique Brive Corrèze Limousin", name: "CA Brive", shortName: "CAB", city: "Brive-la-Gaillarde" },
  { slug: "agen", site: "prod2", wiki: "Sporting Union Agen Lot-et-Garonne", name: "SU Agen", shortName: "SUA", city: "Agen" },
  { slug: "grenoble", site: "prod2", wiki: "Football Club de Grenoble rugby", name: "FC Grenoble", shortName: "FCG", city: "Grenoble" },
  { slug: "angouleme", site: "prod2", wiki: "Soyaux Angoulême XV Charente", name: "Soyaux Angoulême XV", shortName: "SAXV", city: "Angoulême" },
  { slug: "biarritz", site: "prod2", wiki: "Biarritz olympique Pays basque", name: "Biarritz olympique", shortName: "BO", city: "Biarritz" },
  { slug: "dax", site: "prod2", wiki: "Union sportive dacquoise", name: "US Dax", shortName: "USD", city: "Dax" },
  { slug: "beziers", site: "prod2", wiki: "Association sportive de Béziers Hérault", name: "AS Béziers Hérault", shortName: "ASBH", city: "Béziers" },
  { slug: "nevers", site: "prod2", wiki: "USON Nevers Rugby", name: "USON Nevers", shortName: "USON", city: "Nevers" },
  { slug: "aurillac", site: "prod2", wiki: "Stade aurillacois Cantal Auvergne", name: "Stade aurillacois", shortName: "SA", city: "Aurillac" },
  { slug: "nice", site: "prod2", wiki: "Nissa Rugby", name: "Nissa Rugby", shortName: "NR", city: "Nice" },
  { slug: "narbonne", site: "prod2", wiki: "Racing Club narbonnais", name: "RC Narbonne", shortName: "RCN", city: "Narbonne" },
];

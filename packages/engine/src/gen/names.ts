/** Generic name pools for synthetic players (calibration teams, future youth intakes). */
export const NAME_POOLS: Record<string, { first: string[]; last: string[] }> = {
  FRA: {
    first: ["Antoine", "Romain", "Thomas", "Julien", "Hugo", "Louis", "Mathis", "Baptiste", "Clément", "Maxime", "Paul", "Théo", "Lucas", "Gaël", "Yoann", "Bastien", "Killian", "Arthur", "Anthony", "Cyril", "Grégory", "Jean-Baptiste", "Nolann", "Émilien", "Pierre", "Rémi", "Dorian", "Florian"],
    last: ["Lacoste", "Barrère", "Castagné", "Etchegaray", "Larrieu", "Cazalis", "Puyau", "Darrigrand", "Fourcade", "Lafitte", "Mourgues", "Ducasse", "Sallaberry", "Martel", "Bergès", "Pujol", "Garat", "Laborde", "Carrère", "Soubiron", "Bordenave", "Dulau", "Lassalle", "Rouquette", "Vidal", "Delmas", "Fabre", "Mazet", "Bonnet", "Courrèges"],
  },
  NZL: {
    first: ["Sam", "Jack", "Tama", "Liam", "Caleb", "Will", "Ethan", "Nikora", "Hamish", "Ofa", "Cam", "Riley", "Tamati", "Quinn", "Manaia"],
    last: ["Walker", "Taufa", "Henderson", "McLeod", "Tuilagi", "Paewai", "Ngata", "Robertson", "Faleolo", "Kingi", "Morrison", "Tipoki", "Fraser", "Latu", "Haumono"],
  },
  RSA: {
    first: ["Ruan", "Pieter", "Sipho", "Hendrik", "Dewald", "Thabo", "Lwazi", "Frikkie", "Morné", "Jaco", "Wian", "Bongani", "Kobus", "Werner", "Lunga"],
    last: ["Botha", "van Wyk", "Nkosi", "Pretorius", "Coetzee", "Mokoena", "Venter", "Fourie", "Erasmus", "Mahlangu", "Joubert", "Dlamini", "Swanepoel", "Burger", "Ndlovu"],
  },
  FIJ: {
    first: ["Semi", "Josua", "Levani", "Waisea", "Viliame", "Sitiveni", "Jone", "Mesake", "Peceli", "Eroni", "Isikeli", "Apenisa"],
    last: ["Naivalu", "Rokoduru", "Vakaloa", "Tikoisuva", "Qaranivalu", "Ravouvou", "Nadolo", "Sautu", "Delai", "Cakau", "Lomani", "Vuniwai"],
  },
  GEO: {
    first: ["Mamuka", "Beka", "Giorgi", "Luka", "Shalva", "Vasil", "Davit", "Tornike"],
    last: ["Beridze", "Kapanadze", "Tsiklauri", "Chikovani", "Maisuradze", "Gelashvili", "Kvaratskhelia", "Javakhishvili"],
  },
  ARG: {
    first: ["Julián", "Santiago", "Pablo", "Marcos", "Juan Martín", "Tomás", "Mateo", "Facundo", "Gonzalo"],
    last: ["Fernández", "Rossi", "Pereyra", "Acosta", "Ledesma", "Sosa", "Benítez", "Aguirre", "Molina"],
  },
};

export const NATIONALITY_WEIGHTS_TOP14: readonly (readonly [string, number])[] = [
  ["FRA", 70],
  ["NZL", 6],
  ["RSA", 7],
  ["FIJ", 7],
  ["GEO", 5],
  ["ARG", 5],
];

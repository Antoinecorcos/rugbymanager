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
  ENG: {
    first: ["Tom", "Ben", "Sam", "Joe", "Harry", "Ollie", "Jamie", "George", "Luke", "Alfie", "Charlie", "Freddie", "Will", "Henry"],
    last: ["Smith", "Roberts", "Hill", "Underwood", "Johnson", "Clarke", "Spencer", "Baxter", "Thompson", "Marler", "Walker", "Barnes", "Lewis", "Ford"],
  },
  IRL: {
    first: ["Conor", "Ciarán", "Seán", "Rónan", "Cian", "Darragh", "Jack", "Tadhg", "Peter", "Rob", "Craig", "Garry", "Eoin", "Niall"],
    last: ["O'Brien", "Murphy", "Ryan", "Kelly", "Doyle", "O'Connell", "Byrne", "Healy", "Kearney", "McGrath", "Daly", "Walsh", "Moore", "O'Sullivan"],
  },
  SCO: {
    first: ["Ali", "Rory", "Fraser", "Callum", "Ewan", "Hamish", "Stuart", "Jamie", "Kyle", "Magnus", "Duncan", "Gregor"],
    last: ["Gray", "Hogg", "Ritchie", "Watson", "Darge", "McInally", "Cherry", "Horne", "Dobie", "Steyn", "Turner", "Campbell"],
  },
  WAL: {
    first: ["Rhys", "Gareth", "Dafydd", "Iestyn", "Owain", "Taine", "Gruff", "Rhodri", "Aled", "Elis", "Morgan", "Tomos"],
    last: ["Jones", "Davies", "Evans", "Williams", "Thomas", "Morgan", "Price", "Rees", "Griffiths", "Lloyd", "Hughes", "Llewellyn"],
  },
  ITA: {
    first: ["Michele", "Giovanni", "Lorenzo", "Matteo", "Federico", "Paolo", "Leonardo", "Simone", "Danilo", "Juan Ignacio", "Marco", "Alessandro"],
    last: ["Rossi", "Ferrari", "Bianchi", "Fusco", "Riccioni", "Lamaro", "Negri", "Lynagh", "Allan", "Garbisi", "Ruzza", "Zuliani"],
  },
  AUS: {
    first: ["Jack", "Tom", "Harry", "Lachie", "Will", "Nick", "James", "Max", "Fraser", "Hamish", "Ryan", "Angus", "Tate", "Josh", "Matt"],
    last: ["Stewart", "McReight", "Kellaway", "Paisami", "Gordon", "Skelton", "Leota", "Wilson", "Daugunu", "Lonergan", "Tupou", "Swinton", "Philip", "Hooper", "Ikitau"],
  },
  JPN: {
    first: ["Kazuki", "Ryota", "Shota", "Takuya", "Yoshitaka", "Kotaro", "Seung", "Naoto", "Shuhei", "Atsushi", "Keita", "Daiki", "Tomoki", "Yutaka"],
    last: ["Himeno", "Matsushima", "Nakamura", "Tatafu", "Saito", "Sakate", "Inagaki", "Horikoshi", "Fukui", "Nagare", "Tanaka", "Ishida", "Watanabe", "Yamamoto"],
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

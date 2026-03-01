/** Pool of NPC first names. 200+ unique names — enough to cover max NPCs without repeats. */
const NAME_POOL: string[] = [
  // English
  "James", "Mary", "John", "Sarah", "Mike", "Emma", "David", "Lisa",
  "Chris", "Anna", "Tom", "Kate", "Ben", "Amy", "Dan", "Jess",
  "Sam", "Ella", "Alex", "Lucy", "Nick", "Zoe", "Max", "Mia",
  "Jake", "Lily", "Luke", "Ivy", "Ryan", "Ava", "Will", "Nora",
  "Jack", "Ruby", "Liam", "Rose", "Evan", "Hope", "Seth", "Dawn",
  "Owen", "Fern", "Cody", "Jade", "Troy", "Beth", "Clay", "June",
  "Dean", "Gwen", "Joel", "Lena", "Paul", "Rita", "Noah", "Thea",
  "Adam", "Vera", "Glen", "Wynn", "Dale", "Opal", "Kurt", "Nell",
  // Hispanic/Latin
  "Carlos", "Sofia", "Diego", "Luna", "Marco", "Rosa", "Pablo", "Elena",
  "Luis", "Ana", "Miguel", "Carmen", "Rafael", "Isabel", "Mateo", "Lucia",
  "Andres", "Camila", "Jorge", "Alma", "Felix", "Nadia", "Tomas", "Clara",
  // Asian
  "Wei", "Mei", "Yuki", "Hana", "Jin", "Suki", "Kai", "Nami",
  "Ryu", "Yuna", "Tao", "Aiko", "Ken", "Rin", "Hiro", "Miko",
  "Sora", "Yui", "Riku", "Kira", "Shin", "Mina", "Kenji", "Sakura",
  "Bao", "Lan", "Huan", "Linh", "Tam", "Mai",
  // African
  "Ade", "Amara", "Kofi", "Nia", "Olu", "Zara", "Emeka", "Aisha",
  "Kwame", "Sade", "Ife", "Chidi", "Kato", "Esi", "Tunde", "Mansa",
  "Jelani", "Adaeze", "Obi", "Nala", "Sekou", "Amina",
  // European
  "Hans", "Greta", "Lars", "Freya", "Ivan", "Olga", "Pierre", "Marie",
  "Erik", "Astrid", "Leo", "Nina", "Otto", "Elsa", "Hugo", "Vera",
  "Anton", "Heidi", "Franz", "Lotte", "Sven", "Inga", "Karel", "Petra",
  "Rolf", "Marta", "Nils", "Sonja", "Luca", "Elke",
  // Middle Eastern / South Asian
  "Omar", "Leila", "Ali", "Noor", "Raj", "Priya", "Arjun", "Maya",
  "Amir", "Devi", "Samir", "Lina", "Ravi", "Anita", "Tariq", "Farah",
  "Yusuf", "Hira", "Khalil", "Iman", "Vijay", "Meera", "Rohan", "Sita",
  // Additional
  "Finn", "Iris", "Reed", "Cora", "Cole", "Faye", "Jude", "Wren",
  "Nash", "Tess", "Knox", "Blair", "Sage", "Quinn", "Beau", "Lark",
  "Rhys", "Skye", "Cruz", "Neve", "Gage", "Sloan", "Zeke", "Maeve",
  "Arlo", "Esme", "Hart", "Dove", "Lane", "Shea", "Cade", "Remi",
  "Bryn", "Lyle", "Dara", "Boyd", "Tara", "Kade", "Maren", "Ash",
];

/** Draw `count` unique names from the pool. Pool is large enough for all NPCs. */
export function drawNames(count: number): string[] {
  const pool = [...NAME_POOL];
  const result: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool[idx] = pool[pool.length - 1];
    pool.pop();
  }
  return result;
}

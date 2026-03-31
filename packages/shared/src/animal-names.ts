/**
 * Animal name list and slug generator for human-readable worktree/branch naming.
 * Used by both desktop and container bridges to replace UUID-based worktree keys.
 */

export const ANIMAL_NAMES: readonly string[] = [
  "aardvark", "albatross", "alligator", "alpaca", "anaconda", "angelfish", "ant", "anteater",
  "antelope", "ape", "armadillo", "axolotl", "baboon", "badger", "barracuda", "bat", "bear",
  "beaver", "beetle", "bison", "bluebird", "boa", "bobcat", "bonobo", "buffalo", "bullfinch",
  "bullfrog", "butterfly", "camel", "capybara", "cardinal", "caribou", "cassowary", "catfish",
  "chameleon", "cheetah", "chickadee", "chimp", "chinchilla", "chipmunk", "clam", "cobra",
  "cockatoo", "condor", "coral", "cormorant", "cougar", "cow", "coyote", "crab", "crane",
  "crawfish", "cricket", "crocodile", "crow", "cuckoo", "cuttlefish", "dachshund", "dalmatian",
  "deer", "dingo", "dodo", "dolphin", "donkey", "dormouse", "dove", "dragonfly", "duck",
  "dugong", "eagle", "echidna", "eel", "egret", "elephant", "elk", "emu", "ermine", "falcon",
  "ferret", "finch", "firefly", "flamingo", "flounder", "fly", "fox", "frog", "gazelle",
  "gecko", "gerbil", "giraffe", "goat", "goldfish", "goose", "gopher", "gorilla", "grasshopper",
  "grizzly", "grouper", "grouse", "guinea", "gull", "guppy", "hamster", "hare", "hawk",
  "hedgehog", "heron", "herring", "hippo", "hornet", "horse", "hound", "hummingbird", "hyena",
  "ibex", "ibis", "iguana", "impala", "jackal", "jackrabbit", "jaguar", "jay", "jellyfish",
  "kangaroo", "kingfisher", "kiwi", "koala", "koi", "komodo", "krill", "kudu", "ladybug",
  "lark", "lemming", "lemur", "leopard", "liger", "lion", "lizard", "llama", "lobster", "locust",
  "loon", "lynx", "macaw", "mackerel", "magpie", "manatee", "mandrill", "mantis", "marlin",
  "marmot", "marten", "mastiff", "meadowlark", "meerkat", "mink", "minnow", "mole", "mongoose",
  "monkey", "moose", "moth", "mouse", "mule", "muskox", "muskrat", "mustang", "narwhal",
  "newt", "nighthawk", "ocelot", "octopus", "okapi", "opossum", "orangutan", "orca", "oriole",
  "osprey", "ostrich", "otter", "owl", "ox", "oyster", "panda", "panther", "parakeet", "parrot",
  "partridge", "peacock", "pelican", "penguin", "perch", "pheasant", "pig", "pigeon", "pike",
  "piranha", "platypus", "pony", "porcupine", "porpoise", "possum", "puma", "python", "quail",
  "rabbit", "raccoon", "ram", "rattlesnake", "raven", "ray", "reindeer", "rhino", "robin",
  "rooster", "salamander", "salmon", "sandpiper", "sardine", "scorpion", "seahorse", "seal",
  "shark", "sheep", "shrew", "shrimp", "skink", "skunk", "sloth", "slug", "snail", "snake",
  "snapper", "snipe", "sparrow", "spider", "squid", "squirrel", "stallion", "starfish",
  "starling", "stingray", "stork", "sturgeon", "swallow", "swan", "swift", "swordfish",
  "tapir", "tarpon", "termite", "tern", "tiger", "toad", "tortoise", "toucan", "trout",
  "tuna", "turkey", "turtle", "viper", "vulture", "wallaby", "walrus", "warthog", "wasp",
  "weasel", "whale", "wildcat", "wolf", "wolverine", "wombat", "woodpecker", "wren", "yak",
  "zebra", "zebrafish", "anchovy", "asp", "barnacle", "basilisk", "bream", "bunny", "buzzard",
  "canary", "caterpillar", "centipede", "cicada", "clownfish", "cockerel",
  "copperhead", "coypu", "darter", "drongo", "dunlin", "gannet", "gharial",
  "gibbon", "grackle", "halibut", "harrier", "kestrel", "lamprey", "lorikeet",
  "nuthatch", "puffin", "quetzal", "roadrunner", "sawfish",
] as const;

/**
 * Pick a random animal name that isn't already in use.
 * If all base names are taken, appends `-2`, `-3`, etc.
 */
export function generateAnimalSlug(usedNames: Set<string>): string {
  // Shuffle and try each animal once before falling back to suffixes
  const shuffled = [...ANIMAL_NAMES].sort(() => Math.random() - 0.5);

  for (const name of shuffled) {
    if (!usedNames.has(name)) return name;
  }

  // All base names taken — find the first available suffix
  for (const name of shuffled) {
    for (let i = 2; i <= 999; i++) {
      const candidate = `${name}-${i}`;
      if (!usedNames.has(candidate)) return candidate;
    }
  }

  // Extremely unlikely fallback
  return `animal-${Date.now()}`;
}

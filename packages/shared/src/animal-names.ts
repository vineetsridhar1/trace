/**
 * Animal name list and slug generator for human-readable worktree/branch naming.
 * Used by both desktop and container bridges to replace UUID-based worktree keys.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execFileAsync = promisify(execFile);

export const ANIMAL_NAMES: readonly string[] = [
  "aardvark", "albatross", "alligator", "alpaca", "anaconda", "anchovy", "angelfish", "ant",
  "anteater", "antelope", "ape", "armadillo", "asp", "axolotl", "baboon", "badger", "barnacle",
  "barracuda", "basilisk", "bat", "bear", "beaver", "beetle", "bison", "bluebird", "boa",
  "bobcat", "bonobo", "bream", "buffalo", "bullfinch", "bullfrog", "bunny", "butterfly",
  "buzzard", "camel", "canary", "capybara", "cardinal", "caribou", "cassowary", "caterpillar",
  "catfish", "centipede", "chameleon", "cheetah", "chickadee", "chimp", "chinchilla", "chipmunk",
  "cicada", "clam", "clownfish", "cobra", "cockatoo", "cockerel", "condor", "copperhead",
  "coral", "cormorant", "cougar", "cow", "coyote", "coypu", "crab", "crane", "crawfish",
  "cricket", "crocodile", "crow", "cuckoo", "cuttlefish", "dachshund", "dalmatian", "darter",
  "deer", "dingo", "dodo", "dolphin", "donkey", "dormouse", "dove", "dragonfly", "drongo",
  "duck", "dugong", "dunlin", "eagle", "echidna", "eel", "egret", "elephant", "elk", "emu",
  "ermine", "falcon", "ferret", "finch", "firefly", "flamingo", "flounder", "fly", "fox",
  "frog", "gannet", "gazelle", "gecko", "gerbil", "gharial", "gibbon", "giraffe", "goat",
  "goldfish", "goose", "gopher", "gorilla", "grackle", "grasshopper", "grizzly", "grouper",
  "grouse", "guinea", "gull", "guppy", "halibut", "hamster", "hare", "harrier", "hawk",
  "hedgehog", "heron", "herring", "hippo", "hornet", "horse", "hound", "hummingbird", "hyena",
  "ibex", "ibis", "iguana", "impala", "jackal", "jackrabbit", "jaguar", "jay", "jellyfish",
  "kangaroo", "kestrel", "kingfisher", "kiwi", "koala", "koi", "komodo", "krill", "kudu",
  "ladybug", "lamprey", "lark", "lemming", "lemur", "leopard", "liger", "lion", "lizard",
  "llama", "lobster", "locust", "loon", "lorikeet", "lynx", "macaw", "mackerel", "magpie",
  "manatee", "mandrill", "mantis", "marlin", "marmot", "marten", "mastiff", "meadowlark",
  "meerkat", "mink", "minnow", "mole", "mongoose", "monkey", "moose", "moth", "mouse", "mule",
  "muskox", "muskrat", "mustang", "narwhal", "newt", "nighthawk", "nuthatch", "ocelot",
  "octopus", "okapi", "opossum", "orangutan", "orca", "oriole", "osprey", "ostrich", "otter",
  "owl", "ox", "oyster", "panda", "panther", "parakeet", "parrot", "partridge", "peacock",
  "pelican", "penguin", "perch", "pheasant", "pig", "pigeon", "pike", "piranha", "platypus",
  "pony", "porcupine", "porpoise", "possum", "puffin", "puma", "python", "quail", "quetzal",
  "rabbit", "raccoon", "ram", "rattlesnake", "raven", "ray", "reindeer", "rhino", "roadrunner",
  "robin", "rooster", "salamander", "salmon", "sandpiper", "sardine", "sawfish", "scorpion",
  "seahorse", "seal", "shark", "sheep", "shrew", "shrimp", "skink", "skunk", "sloth", "slug",
  "snail", "snake", "snapper", "snipe", "sparrow", "spider", "squid", "squirrel", "stallion",
  "starfish", "starling", "stingray", "stork", "sturgeon", "swallow", "swan", "swift",
  "swordfish", "tapir", "tarpon", "termite", "tern", "tiger", "toad", "tortoise", "toucan",
  "trout", "tuna", "turkey", "turtle", "viper", "vulture", "wallaby", "walrus", "warthog",
  "wasp", "weasel", "whale", "wildcat", "wolf", "wolverine", "wombat", "woodpecker", "wren",
  "yak", "zebra", "zebrafish",
] as const;

/**
 * Collect slugs already in use by scanning a directory for existing entries
 * and listing `trace/*` git branches in the repo.
 */
export async function getUsedSlugs(sessionsDir: string, repoPath: string): Promise<Set<string>> {
  const used = new Set<string>();

  // 1. Existing directory names
  if (fs.existsSync(sessionsDir)) {
    for (const entry of fs.readdirSync(sessionsDir)) {
      used.add(entry);
    }
  }

  // 2. Existing trace/* branch names
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--list", "trace/*", "--format=%(refname:short)"], { cwd: repoPath });
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("trace/")) {
        used.add(trimmed.slice("trace/".length));
      }
    }
  } catch {
    // If git command fails, proceed with just directory-based slugs
  }

  return used;
}

/**
 * Pick a random animal name that isn't already in use.
 * If all base names are taken, appends `-2`, `-3`, etc.
 */
export function generateAnimalSlug(usedNames: Set<string>): string {
  // Fisher-Yates shuffle for uniform distribution
  const shuffled = [...ANIMAL_NAMES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

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

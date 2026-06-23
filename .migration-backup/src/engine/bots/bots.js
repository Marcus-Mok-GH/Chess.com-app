import { coach } from './personalities/coach';
import { nelson } from './personalities/nelson';
import { elena } from './personalities/elena';
import { viktor } from './personalities/viktor';
import { isabella } from './personalities/isabella';
import { magnus } from './personalities/magnus';
import { dolores } from './personalities/dolores';
import { raj } from './personalities/raj';
import { theo } from './personalities/theo';
import { felix } from './personalities/felix';
import { nadia } from './personalities/nadia';
import { custom } from './personalities/custom';

// Bot personalities with different difficulty levels
export const BOTS = [
  coach,
  nelson,
  elena,
  viktor,
  isabella,
  magnus,
  dolores,
  raj,
  theo,
  felix,
  nadia,
  custom
];

// Helper function to create a custom bot based on ELO rating
export function createCustomBot(elo) {
  // Calculate bot parameters based on ELO
  // ELO ranges: 400-2500
  const normalizedElo = Math.max(400, Math.min(2500, elo));
  
  // Map ELO to depth (1-6)
  let depth;
  let nodes;
  let blunderChance;
  let missedTacticsChance;
  
  if (normalizedElo < 600) {
    depth = 1;
    nodes = 100;
    blunderChance = 0.35;
    missedTacticsChance = 0.5;
  } else if (normalizedElo < 1000) {
    depth = 2;
    nodes = 1000;
    blunderChance = 0.15;
    missedTacticsChance = 0.25;
  } else if (normalizedElo < 1400) {
    depth = 3;
    nodes = 5000;
    blunderChance = 0.05;
    missedTacticsChance = 0.1;
  } else if (normalizedElo < 1800) {
    depth = 4;
    nodes = 20000;
    blunderChance = 0.01;
    missedTacticsChance = 0.03;
  } else if (normalizedElo < 2200) {
    depth = 5;
    nodes = 100000;
    blunderChance = 0;
    missedTacticsChance = 0.01;
  } else {
    depth = 6;
    nodes = 500000;
    blunderChance = 0;
    missedTacticsChance = 0;
  }
  
  return {
    ...custom,
    rating: normalizedElo,
    depth,
    nodes,
    blunderChance,
    missedTacticsChance,
  };
}

// Helper to get random quote from array
export function getRandomQuote(bot, category) {
  const quotes = bot.quotes[category];
  if (!quotes || quotes.length === 0) return '';
  return quotes[Math.floor(Math.random() * quotes.length)];
}

export function getBotById(id) {
  return BOTS.find((bot) => bot.id === id) || BOTS[0];
}

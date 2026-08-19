import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(__dirname, 'Analysis.css');

/**
 * Extracts the declaration block(s) for a given selector from raw CSS text.
 * Returns an array of blocks in the order they appear in the file (this
 * naturally captures both the base rule and any rule with the same selector
 * nested inside @media blocks, since this is a naive brace-based match).
 */
function extractRuleBlocks(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  return [...css.matchAll(pattern)].map((match) => match[1]);
}

describe('Analysis.css - .analysis-board-wrap', () => {
  let css;
  let blocks;
  let baseRule;

  beforeAll(() => {
    css = fs.readFileSync(CSS_PATH, 'utf-8');
    blocks = extractRuleBlocks(css, '.analysis-board-wrap');
    // The first occurrence in the file is the base (non-media-query) rule.
    baseRule = blocks[0];
  });

  it('defines a base rule for .analysis-board-wrap', () => {
    expect(baseRule).toBeDefined();
    expect(baseRule.trim().length).toBeGreaterThan(0);
  });

  it('sets position: relative on the base rule', () => {
    expect(baseRule).toMatch(/position:\s*relative;/);
  });

  it('declares position exactly once in the base rule', () => {
    const occurrences = baseRule.match(/position:/g) || [];
    expect(occurrences.length).toBe(1);
  });

  it('does not use a conflicting position value', () => {
    expect(baseRule).not.toMatch(/position:\s*(absolute|fixed|static|sticky)\s*;/);
  });

  it('preserves the pre-existing layout and visual declarations alongside the new position rule', () => {
    expect(baseRule).toMatch(/width:\s*100%;/);
    expect(baseRule).toMatch(/max-width:\s*min\(640px,\s*72svh\);/);
    expect(baseRule).toMatch(/aspect-ratio:\s*1\s*\/\s*1;/);
    expect(baseRule).toMatch(/background-color:\s*#2a2a2a;/);
    expect(baseRule).toMatch(/border-radius:\s*var\(--radius-md\);/);
    expect(baseRule).toMatch(/overflow:\s*hidden;/);
    expect(baseRule).toMatch(/box-shadow:\s*var\(--shadow-lg\), 0 0 0 1px rgba\(255,255,255,0\.04\);/);
    expect(baseRule).toMatch(/border:\s*1px solid var\(--border\);/);
  });

  it('does not introduce a position declaration in the responsive max-width overrides', () => {
    // Every block after the first one is a media-query override; these only
    // ever adjust max-width and must not redeclare/override position.
    const overrideBlocks = blocks.slice(1);
    expect(overrideBlocks.length).toBeGreaterThan(0);
    for (const block of overrideBlocks) {
      expect(block).not.toMatch(/position:/);
      expect(block).toMatch(/max-width:/);
    }
  });
});
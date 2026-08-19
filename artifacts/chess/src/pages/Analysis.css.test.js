import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This suite verifies the styling contract of `.analysis-board-wrap` in
// Analysis.css, in particular the `position: relative` declaration that was
// added so that absolutely-positioned children (e.g. move/annotation
// overlays) can be contained within the board wrapper instead of escaping
// into the surrounding layout.

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(__dirname, 'Analysis.css');

/**
 * Extracts every top-level `{ ... }` block that immediately follows the
 * given selector anywhere in the stylesheet (including inside @media
 * blocks). Returns the raw declaration text for each match, in source
 * order.
 */
function extractRuleBlocks(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g');
  const blocks = [];
  let match;
  while ((match = regex.exec(css)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/** Parses a raw CSS declaration block into an ordered list of [prop, value] pairs. */
function parseDeclarations(block) {
  return block
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(':');
      return [decl.slice(0, idx).trim(), decl.slice(idx + 1).trim()];
    });
}

describe('Analysis.css - .analysis-board-wrap', () => {
  let css;
  let ruleBlocks;
  let baseDeclarations;

  beforeAll(() => {
    css = readFileSync(CSS_PATH, 'utf-8');
    ruleBlocks = extractRuleBlocks(css, '.analysis-board-wrap');
    // The first match in source order is the base (non-media-query) rule.
    baseDeclarations = parseDeclarations(ruleBlocks[0]);
  });

  it('defines a base rule for .analysis-board-wrap', () => {
    expect(ruleBlocks.length).toBeGreaterThan(0);
    expect(baseDeclarations.length).toBeGreaterThan(0);
  });

  it('sets position: relative so the wrapper can act as a containing block', () => {
    const positionDecl = baseDeclarations.find(([prop]) => prop === 'position');
    expect(positionDecl).toBeDefined();
    expect(positionDecl[1]).toBe('relative');
  });

  it('declares position exactly once in the base rule (no duplicates)', () => {
    const positionDecls = baseDeclarations.filter(([prop]) => prop === 'position');
    expect(positionDecls).toHaveLength(1);
  });

  it('places position as the first declaration in the base rule', () => {
    expect(baseDeclarations[0][0]).toBe('position');
  });

  it('preserves the pre-existing layout declarations alongside the new position rule', () => {
    const declMap = Object.fromEntries(baseDeclarations);
    expect(declMap.width).toBe('100%');
    expect(declMap['max-width']).toBe('min(640px, 72svh)');
    expect(declMap['aspect-ratio']).toBe('1 / 1');
    expect(declMap['background-color']).toBe('#2a2a2a');
    expect(declMap['border-radius']).toBe('var(--radius-md)');
    expect(declMap.overflow).toBe('hidden');
    expect(declMap['box-shadow']).toBe('var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.04)');
    expect(declMap.border).toBe('1px solid var(--border)');
  });

  it('contains exactly the expected set of declarations, in order, for the base rule', () => {
    const props = baseDeclarations.map(([prop]) => prop);
    expect(props).toEqual([
      'position',
      'width',
      'max-width',
      'aspect-ratio',
      'background-color',
      'border-radius',
      'overflow',
      'box-shadow',
      'border',
    ]);
  });

  it('does not redeclare position inside the responsive @media overrides', () => {
    // Every subsequent match beyond the base rule comes from a @media block
    // that only overrides max-width for smaller/larger viewports. None of
    // them should reintroduce or override the `position` declaration, since
    // that would be a regression against the single source of truth added
    // in the base rule.
    const overrideBlocks = ruleBlocks.slice(1);
    expect(overrideBlocks.length).toBeGreaterThan(0);
    for (const block of overrideBlocks) {
      const decls = parseDeclarations(block);
      const props = decls.map(([prop]) => prop);
      expect(props).not.toContain('position');
    }
  });
});
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { targets } from '../src/generate/targets.ts';
import { colors, contrastRatio, exactAppleFloor, exactApplePairs, icons, nativeRoles, textPairs, tokens } from '../src/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));

describe('generated files', () => {
  it.each(targets.map((t) => [t.file, t] as const))('%s is up to date (run `npm run generate -w @app/tokens`)', (file, target) => {
    expect(readFileSync(join(root, file), 'utf8')).toBe(target.render(tokens));
  });
});

describe('colors', () => {
  it('are #RRGGBB in both appearances', () => {
    for (const [role, pair] of Object.entries(colors)) {
      expect(pair.light, role).toMatch(/^#[0-9A-F]{6}$/);
      expect(pair.dark, role).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it.each(['light', 'dark'] as const)('text pairs reach 4.5:1 in %s', (scheme) => {
    const failures = textPairs
      .map(([text, on]) => ({ text, on, ratio: contrastRatio(colors[text][scheme], colors[on][scheme]) }))
      .filter((p) => p.ratio < 4.5)
      .map((p) => `${p.text} on ${p.on}: ${p.ratio.toFixed(2)}`);
    expect(failures).toEqual([]);
  });

  it('exact-Apple pairs are below 4.5:1 in at least one appearance, and never below the floor', () => {
    for (const [text, on] of exactApplePairs) {
      const ratios = (['light', 'dark'] as const).map((s) => contrastRatio(colors[text][s], colors[on][s]));
      expect(Math.min(...ratios), `${text} on ${on}: move it to textPairs`).toBeLessThan(4.5);
      expect(Math.min(...ratios), `${text} on ${on}`).toBeGreaterThanOrEqual(exactAppleFloor);
    }
  });

  it('native roles exist', () => {
    for (const role of nativeRoles) expect(colors).toHaveProperty(role);
  });
});

describe('icon map', () => {
  it('uses each Phosphor icon and SF Symbol for one meaning only', () => {
    const phosphor = Object.values(icons).map((i) => i.phosphor);
    const symbols = Object.values(icons).map((i) => i.sfSymbol);
    expect(new Set(phosphor).size).toBe(phosphor.length);
    expect(new Set(symbols).size).toBe(symbols.length);
  });
});

describe('density', () => {
  it('keeps touch targets at 44px or more', () => {
    expect(tokens.size.row.coarse).toBeGreaterThanOrEqual(44);
    expect(tokens.size.control.coarse).toBeGreaterThanOrEqual(44);
  });
});

import type { Density, Scheme, Tokens } from '../tokens.ts';

export const HEADER = '/* Generated from packages/tokens/src/tokens.ts by `npm run generate -w @app/tokens`. Do not edit. */\n';

function block(selector: string, lines: string[]): string {
  return `${selector} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}\n`;
}

function colorLines(tokens: Tokens, scheme: Scheme): string[] {
  return [`color-scheme: ${scheme};`, ...Object.entries(tokens.colors).map(([role, pair]) => `--${role}: ${pair[scheme]};`)];
}

function densityLines(tokens: Tokens, density: keyof Density): string[] {
  const px = (n: number) => `${n}px`;
  return [
    ...Object.entries(tokens.text).flatMap(([name, t]) => [
      `--font-size-${name}: ${px(t.size[density])};`,
      `--line-height-${name}: ${px(t.lineHeight[density])};`,
    ]),
    ...Object.entries(tokens.size).map(([name, d]) => `--size-${name}: ${px(d[density])};`),
    ...Object.entries(tokens.space).map(([name, d]) => `--space-${name}: ${px(d[density])};`),
  ];
}

/** Plain CSS custom properties: light on `:root`, dark on `.dark`, touch sizes under `pointer: coarse`. */
export function renderCss(tokens: Tokens): string {
  const root = [
    ...colorLines(tokens, 'light'),
    `--font-family-sans: ${tokens.font.sans};`,
    `--font-family-mono: ${tokens.font.mono};`,
    ...Object.entries(tokens.fontWeight).map(([name, w]) => `--font-weight-${name}: ${w};`),
    ...Object.entries(tokens.radius).map(([name, r]) => `--corner-${name}: ${r}px;`),
    `--radius: ${tokens.radius.lg}px;`,
    ...densityLines(tokens, 'fine'),
  ];
  return [
    HEADER,
    block(':root', root),
    block('.dark', colorLines(tokens, 'dark')),
    `@media (pointer: coarse) {\n${block(':root', densityLines(tokens, 'coarse'))
      .split('\n')
      .map((l) => (l ? `  ${l}` : l))
      .join('\n')}}\n`,
  ].join('\n');
}

/** Tailwind v4 theme mapping onto the CSS variables, so utilities like `bg-card`, `h-row` and `text-body` follow the tokens. */
export function renderTailwind(tokens: Tokens): string {
  const sizeNames = Object.keys(tokens.size);
  const spaceNames = Object.keys(tokens.space).filter((n) => n !== 'unit');
  const clash = sizeNames.find((n) => spaceNames.includes(n));
  if (clash) throw new Error(`"${clash}" is both a size and a space token; Tailwind's spacing namespace needs unique names.`);

  const lines = [
    ...Object.keys(tokens.colors).map((role) => `--color-${role}: var(--${role});`),
    '--font-sans: var(--font-family-sans);',
    '--font-mono: var(--font-family-mono);',
    '--font-heading: var(--font-family-sans);',
    ...Object.keys(tokens.text).flatMap((name) => [
      `--text-${name}: var(--font-size-${name});`,
      `--text-${name}--line-height: var(--line-height-${name});`,
    ]),
    // shadcn components use text-xs, text-sm and text-base; route them through the density-aware scale.
    '--text-xs: var(--font-size-footnote);',
    '--text-xs--line-height: var(--line-height-footnote);',
    '--text-sm: var(--font-size-body);',
    '--text-sm--line-height: var(--line-height-body);',
    '--text-base: var(--font-size-headline);',
    '--text-base--line-height: var(--line-height-headline);',
    '--spacing: var(--space-unit);',
    ...sizeNames.map((name) => `--spacing-${name}: var(--size-${name});`),
    ...spaceNames.map((name) => `--spacing-${name}: var(--space-${name});`),
    ...Object.keys(tokens.radius).map((name) => `--radius-${name}: var(--corner-${name});`),
  ];
  return [HEADER, '@import "./tokens.css";\n', block('@theme inline', lines)].join('\n');
}

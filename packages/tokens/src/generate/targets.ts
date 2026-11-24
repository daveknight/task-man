import type { Tokens } from '../tokens.ts';
import { renderCss, renderTailwind } from './css.ts';

export interface Target {
  /** Output path, relative to packages/tokens. */
  file: string;
  render: (tokens: Tokens) => string;
}

/** Every generated file. The Swift theme for the native apps (Phase 4) joins this list. */
export const targets: readonly Target[] = [
  { file: 'generated/tokens.css', render: renderCss },
  { file: 'generated/tailwind.css', render: renderTailwind },
];

import { Children, type ReactNode } from 'react';

/**
 * Wraps runs of bare text in `optical-center`, so labels beside icons center on their letters
 * rather than their line box. Adjacent strings and numbers stay in one span.
 */
export function opticalText(children: ReactNode): ReactNode {
  if (typeof children === 'function') return children;
  const out: ReactNode[] = [];
  let run = '';
  const flush = () => {
    if (run.trim()) out.push(<span key={`text-${out.length}`} className="optical-center">{run}</span>);
    run = '';
  };
  for (const child of Children.toArray(children)) {
    if (typeof child === 'string' || typeof child === 'number') run += child;
    else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out.length === 1 ? out[0] : out;
}

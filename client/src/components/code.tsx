import { createLowlight, common } from 'lowlight';
import type { RootContent } from 'hast';
import type { ReactNode } from 'react';
const highlighter = createLowlight(common);
function token(node: RootContent, key: number): ReactNode {
  if (node.type === 'text') return node.value;
  if (node.type !== 'element') return null;
  // Only React text and spans; no HTML strings or arbitrary element properties.
  const classes = Array.isArray(node.properties.className)
    ? node.properties.className.join(' ')
    : '';
  return (
    <span key={key} className={classes}>
      {node.children.map(token)}
    </span>
  );
}
export function HighlightedCode({ language, code }: { language: string; code: string }) {
  const normalized = language.toLowerCase();
  const children = highlighter.registered(normalized)
    ? highlighter.highlight(normalized, code).children.map(token)
    : code;
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}

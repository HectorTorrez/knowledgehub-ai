import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';

const omittedTags = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'NAV',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'SVG',
]);

function render(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE)
    return node.textContent.replace(/\s+/g, ' ');
  if (!(node instanceof HTMLElement) || omittedTags.has(node.tagName))
    return '';

  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  const content = node.childNodes.map(render).join('');
  if (/^H[1-6]$/.test(tag)) {
    return `\n\n${'#'.repeat(Number(tag[1]))} ${content.trim()}\n\n`;
  }
  if (tag === 'LI') return `\n- ${content.trim()}`;
  if (tag === 'TR') {
    const cells = node.childNodes
      .filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && ['TD', 'TH'].includes(child.tagName),
      )
      .map((cell) =>
        cell.childNodes.map(render).join('').replace(/\s+/g, ' ').trim(),
      );
    return `\n${cells.join(' | ')}`;
  }
  if (['P', 'DIV', 'TABLE', 'UL', 'OL'].includes(tag))
    return `\n\n${content}\n\n`;
  return content;
}

export async function extractHtml(bytes: Uint8Array): Promise<string> {
  const root = parse(Buffer.from(bytes).toString('utf8'));
  const content =
    root.querySelector('main, article') ?? root.querySelector('body') ?? root;
  return render(content)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

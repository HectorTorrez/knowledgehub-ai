interface Turn {
  question: string;
  answer: string | null;
  status: string;
  citations: unknown;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}[\]()#+.!|~>-])/g, '\\$1')
    .replace(/\r?\n/g, '  \n');
}

export function exportFilename(title: string | null, date: string): string {
  const slug = (title ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80)
    .replace(/-+$/, '');
  return `${slug || 'conversation'}-${date}.md`;
}

export function renderConversationMarkdown(
  data: { title: string | null; turns: Turn[] },
  date: string,
): string {
  const lines = [
    `# ${escapeText(data.title || 'Conversation')}`,
    '',
    `Exported: ${date}`,
    '',
  ];
  for (const turn of data.turns) {
    lines.push(
      '## Question',
      '',
      escapeText(turn.question),
      '',
      '## Answer',
      '',
    );
    if (turn.status === 'insufficient_evidence')
      lines.push('Insufficient evidence.', '');
    if (turn.answer) lines.push(escapeText(turn.answer), '');
    const citations = Array.isArray(turn.citations) ? turn.citations : [];
    const sources = citations.filter(
      (item): item is { documentTitle: string; pageNumber?: number | null } =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.documentTitle === 'string',
    );
    if (sources.length) {
      lines.push('### Sources', '');
      sources.forEach((source, index) =>
        lines.push(
          `${index + 1}. ${escapeText(source.documentTitle)}${typeof source.pageNumber === 'number' && Number.isFinite(source.pageNumber) ? `, page ${source.pageNumber}` : ''}`,
        ),
      );
      lines.push('');
    }
  }
  return lines.join('\n');
}

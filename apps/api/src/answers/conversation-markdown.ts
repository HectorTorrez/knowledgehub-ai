interface Turn {
  question: string;
  answer: string | null;
  status: string;
  citations: unknown;
}

interface ExportedSource {
  marker: number;
  documentTitle: string;
  pageNumber: number | null;
}

function neutralizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapePlainText(text: string): string {
  return neutralizeHtml(text)
    .replace(/([\\`*_[\]#|~])/g, '\\$1')
    .replace(/^(\s*)(\d+)\./gm, '$1$2\\.')
    .replace(/^(\s*)([-+])/gm, '$1\\$2')
    .replace(/\r?\n/g, '  \n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSources(citations: unknown): ExportedSource[] {
  if (!Array.isArray(citations)) return [];
  const sources: ExportedSource[] = [];
  citations.forEach((item: unknown, index) => {
    if (!isRecord(item) || typeof item.documentTitle !== 'string') return;
    sources.push({
      marker:
        typeof item.marker === 'number' && Number.isInteger(item.marker)
          ? item.marker
          : index + 1,
      documentTitle: item.documentTitle,
      pageNumber:
        typeof item.pageNumber === 'number' &&
        Number.isFinite(item.pageNumber)
          ? item.pageNumber
          : null,
    });
  });
  return sources.sort((a, b) => a.marker - b.marker);
}

function formatSource(source: ExportedSource): string {
  const page = source.pageNumber === null ? '' : `, page ${source.pageNumber}`;
  return `- [${source.marker}] ${escapePlainText(source.documentTitle)}${page}`;
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
    `# ${escapePlainText(data.title || 'Conversation')}`,
    '',
    `Exported: ${date}`,
    '',
  ];
  for (const turn of data.turns) {
    lines.push('## Question', '', escapePlainText(turn.question), '');
    lines.push('## Answer', '');
    if (turn.status === 'insufficient_evidence') {
      lines.push(
        '_The documents did not contain enough evidence to answer this question._',
        '',
      );
    }
    if (turn.answer) lines.push(neutralizeHtml(turn.answer), '');
    const sources = toSources(turn.citations);
    if (sources.length > 0) {
      lines.push('### Sources', '', ...sources.map(formatSource), '');
    }
  }
  return lines.join('\n');
}

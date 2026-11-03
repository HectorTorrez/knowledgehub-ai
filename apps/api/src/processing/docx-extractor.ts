import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { fromBuffer } from 'yauzl';

const MAX_ENTRIES = 2000;
const MAX_UNCOMPRESSED = 50 * 1024 * 1024;
const MAX_RATIO = 100;

export class InvalidDocxError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidDocxError';
  }
}

export class ArchiveLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveLimitError';
  }
}

interface TableCellNode {
  textContent: string | null;
}

interface TableRowNode {
  querySelectorAll(selector: string): ArrayLike<TableCellNode>;
}

interface TableNode {
  querySelectorAll(selector: string): ArrayLike<TableRowNode>;
}

async function validateArchive(bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new InvalidDocxError('Invalid DOCX archive'));
        let total = 0;
        let count = 0;
        const names = new Set<string>();
        const fail = (err: Error) => {
          zip.close();
          reject(err);
        };
        zip.on('error', () =>
          fail(new InvalidDocxError('Invalid DOCX archive')),
        );
        zip.on('entry', (entry) => {
          count++;
          total += entry.uncompressedSize;
          if (
            count > MAX_ENTRIES ||
            total > MAX_UNCOMPRESSED ||
            (entry.uncompressedSize > 0 &&
              entry.uncompressedSize > entry.compressedSize * MAX_RATIO)
          ) {
            return fail(
              new ArchiveLimitError('DOCX archive exceeds safety limits'),
            );
          }
          if (names.has(entry.fileName))
            return fail(new InvalidDocxError('Duplicate DOCX archive entry'));
          names.add(entry.fileName);
          if (/\/$/.test(entry.fileName)) return zip.readEntry();
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream)
              return fail(new InvalidDocxError('Invalid DOCX archive entry'));
            stream.on('error', () =>
              fail(new InvalidDocxError('Invalid DOCX archive entry')),
            );
            stream.on('end', () => zip.readEntry());
            stream.resume();
          });
        });
        zip.on('end', () => {
          if (
            !names.has('[Content_Types].xml') ||
            !names.has('word/document.xml')
          ) {
            return reject(
              new InvalidDocxError('Missing required DOCX entries'),
            );
          }
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}

export async function extractDocx(bytes: Uint8Array): Promise<string> {
  await validateArchive(bytes);
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      { externalFileAccess: false },
    );
    const converter = new TurndownService({ headingStyle: 'atx' });
    converter.addRule('docxTables', {
      filter: 'table',
      replacement: (_content, node) => {
        const rows = Array.from(
          (node as unknown as TableNode).querySelectorAll('tr'),
        ).map((row) =>
          Array.from(row.querySelectorAll('th, td')).map((cell) =>
            (cell.textContent ?? '')
              .trim()
              .replace(/\|/g, '\\|')
              .replace(/\s+/g, ' '),
          ),
        );
        const width = Math.max(0, ...rows.map((row) => row.length));
        if (width === 0) return '';
        const formatRow = (row: string[]) =>
          `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
        return `\n\n${[formatRow(rows[0] ?? []), formatRow(Array(width).fill('---')), ...rows.slice(1).map(formatRow)].join('\n')}\n\n`;
      },
    });
    return converter.turndown(result.value);
  } catch (error) {
    throw new InvalidDocxError('Invalid DOCX document', { cause: error });
  }
}

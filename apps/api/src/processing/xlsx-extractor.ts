import { createRequire } from 'node:module';
import path from 'node:path';
import { fromBuffer } from 'yauzl';
import { ArchiveLimitError, InvalidDocxError } from './docx-extractor.js';

interface XmlNode {
  localName: string;
  textContent: string | null;
  getAttribute(name: string): string;
  getElementsByTagName(name: string): ArrayLike<XmlNode>;
}

const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve('mammoth'));
const { DOMParser } = mammothRequire('@xmldom/xmldom') as {
  DOMParser: new (options: {
    errorHandler: {
      warning: () => void;
      error: () => void;
      fatalError: () => void;
    };
  }) => { parseFromString(xml: string, mime: string): XmlNode };
};

function parseXml(xml: string): XmlNode {
  const invalid = () => {
    throw new Error('Invalid XML');
  };
  return new DOMParser({
    errorHandler: { warning: invalid, error: invalid, fatalError: invalid },
  }).parseFromString(xml, 'application/xml');
}

function elements(node: XmlNode, name: string): XmlNode[] {
  return Array.from(node.getElementsByTagName('*')).filter(
    (element) => element.localName === name,
  );
}

async function readArchive(bytes: Uint8Array): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new InvalidDocxError('Invalid XLSX archive'));
        const entries = new Map<string, string>();
        let count = 0;
        let total = 0;
        const fail = (err: Error) => {
          zip.close();
          reject(err);
        };
        zip.on('error', () =>
          fail(new InvalidDocxError('Invalid XLSX archive')),
        );
        zip.on('entry', (entry) => {
          count++;
          total += entry.uncompressedSize;
          if (
            count > 2000 ||
            total > 50 * 1024 * 1024 ||
            (entry.uncompressedSize > 0 &&
              entry.uncompressedSize > entry.compressedSize * 100)
          )
            return fail(
              new ArchiveLimitError('XLSX archive exceeds safety limits'),
            );
          if (entries.has(entry.fileName))
            return fail(new InvalidDocxError('Duplicate XLSX archive entry'));
          entries.set(entry.fileName, '');
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream)
              return fail(new InvalidDocxError('Invalid XLSX archive entry'));
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', () =>
              fail(new InvalidDocxError('Invalid XLSX archive entry')),
            );
            stream.on('end', () => {
              entries.set(
                entry.fileName,
                Buffer.concat(chunks).toString('utf8'),
              );
              zip.readEntry();
            });
          });
        });
        zip.on('end', () => resolve(entries));
        zip.readEntry();
      },
    );
  });
}

function sheetContent(xml: string, name: string, strings: string[]): string {
  const rows: string[][] = [];
  for (const cell of elements(parseXml(xml), 'c')) {
    const reference = /^([A-Z]+)([1-9]\d*)$/.exec(cell.getAttribute('r'));
    if (!reference) throw new Error('Invalid cell reference');
    const row = Number(reference[2]);
    if (row > 1000) continue;
    const column = [...reference[1]!].reduce(
      (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
      0,
    );
    if (column > 16384) throw new Error('Invalid column');
    const type = cell.getAttribute('t');
    const raw = elements(cell, 'v')[0]?.textContent ?? '';
    const value =
      type === 's'
        ? strings[Number(raw)]
        : type === 'inlineStr'
          ? elements(cell, 't')
              .map((text) => text.textContent ?? '')
              .join('')
          : raw;
    if (value === undefined) throw new Error('Invalid shared string');
    rows[row - 1] ??= [];
    rows[row - 1]![column - 1] = value
      .replace(/\|/g, '\\|')
      .replace(/[\r\n]+/g, ' ');
  }
  const width = Math.max(0, ...Array.from(rows, (row) => row?.length ?? 0));
  if (!width) return `## ${name}`;
  const format = (row: string[] = []) =>
    `| ${Array.from({ length: width }, (_, index) => row[index] ?? '').join(' | ')} |`;
  return [
    `## ${name}`,
    '',
    format(rows[0]),
    format(Array(width).fill('---')),
    ...Array.from({ length: rows.length - 1 }, (_, index) =>
      format(rows[index + 1]),
    ),
  ].join('\n');
}

export async function extractXlsx(
  bytes: Uint8Array,
): Promise<{ pageNumber: number; content: string }[]> {
  const entries = await readArchive(bytes);
  try {
    const workbook = entries.get('xl/workbook.xml');
    const relationships = entries.get('xl/_rels/workbook.xml.rels');
    if (!entries.has('[Content_Types].xml') || !workbook || !relationships)
      throw new Error('Missing workbook entries');
    const targets = new Map(
      elements(parseXml(relationships), 'Relationship')
        .filter((rel) => rel.getAttribute('TargetMode') !== 'External')
        .map((rel) => [rel.getAttribute('Id'), rel.getAttribute('Target')]),
    );
    const shared = entries.get('xl/sharedStrings.xml');
    const strings = shared
      ? elements(parseXml(shared), 'si').map((item) =>
          elements(item, 't')
            .map((text) => text.textContent ?? '')
            .join(''),
        )
      : [];
    return elements(parseXml(workbook), 'sheet').map((sheet, index) => {
      const target = targets.get(sheet.getAttribute('r:id'));
      if (!target) throw new Error('Missing sheet relationship');
      const filename = path.posix.normalize(
        target.startsWith('/')
          ? target.slice(1)
          : path.posix.join('xl', target),
      );
      const xml = entries.get(filename);
      if (!xml) throw new Error('Missing worksheet');
      return {
        pageNumber: index + 1,
        content: sheetContent(xml, sheet.getAttribute('name'), strings),
      };
    });
  } catch (error) {
    throw new InvalidDocxError('Invalid XLSX document', { cause: error });
  }
}

import { fromBuffer } from 'yauzl';
import { ArchiveLimitError, InvalidDocxError } from './docx-extractor.js';
import type { ExtractedPage } from './document-text-extractor.js';

const MAX_ENTRIES = 2000;
const MAX_UNCOMPRESSED = 50 * 1024 * 1024;
const MAX_RATIO = 100;

function decodeEntities(text: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  };
  return text.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, name: string) => {
      if (name[0] !== '#') return entities[name] ?? entity;
      const value =
        name[1]?.toLowerCase() === 'x'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return value > 0 &&
        value <= 0x10ffff &&
        !(value >= 0xd800 && value <= 0xdfff)
        ? String.fromCodePoint(value)
        : entity;
    },
  );
}

function slideText(xml: string): string {
  return Array.from(
    xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p\s*>/g),
    (paragraph) =>
      Array.from(
        paragraph[1]!.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t\s*>/g),
        (run) => decodeEntities(run[1]!),
      ).join(''),
  ).join('\n');
}

export async function extractPptx(bytes: Uint8Array): Promise<ExtractedPage[]> {
  return new Promise((resolve, reject) => {
    fromBuffer(
      Buffer.from(bytes),
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new InvalidDocxError('Invalid PPTX archive'));
        let count = 0;
        let total = 0;
        const names = new Set<string>();
        const pages: ExtractedPage[] = [];
        const fail = (err: Error) => {
          zip.close();
          reject(err);
        };
        zip.on('error', () =>
          fail(new InvalidDocxError('Invalid PPTX archive')),
        );
        zip.on('entry', (entry) => {
          count++;
          total += entry.uncompressedSize;
          if (
            count > MAX_ENTRIES ||
            total > MAX_UNCOMPRESSED ||
            (entry.uncompressedSize > 0 &&
              entry.uncompressedSize > entry.compressedSize * MAX_RATIO)
          )
            return fail(
              new ArchiveLimitError('PPTX archive exceeds safety limits'),
            );
          if (names.has(entry.fileName))
            return fail(new InvalidDocxError('Duplicate PPTX archive entry'));
          names.add(entry.fileName);
          if (/\/$/.test(entry.fileName)) return zip.readEntry();
          const slide = /^ppt\/slides\/slide([1-9]\d*)\.xml$/.exec(
            entry.fileName,
          );
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream)
              return fail(new InvalidDocxError('Invalid PPTX archive entry'));
            const chunks: Buffer[] = [];
            stream.on('error', () =>
              fail(new InvalidDocxError('Invalid PPTX archive entry')),
            );
            if (slide) stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
              if (slide)
                pages.push({
                  pageNumber: Number(slide[1]),
                  content: slideText(Buffer.concat(chunks).toString('utf8')),
                });
              zip.readEntry();
            });
            stream.resume();
          });
        });
        zip.on('end', () => {
          if (!names.has('ppt/presentation.xml'))
            return reject(
              new InvalidDocxError('Missing required PPTX entries'),
            );
          resolve(pages.sort((a, b) => a.pageNumber - b.pageNumber));
        });
        zip.readEntry();
      },
    );
  });
}

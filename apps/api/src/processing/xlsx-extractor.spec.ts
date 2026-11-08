import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ArchiveLimitError, InvalidDocxError } from './docx-extractor.js';
import { extractXlsx } from './xlsx-extractor.js';

async function workbook(first: string, second = '<worksheet/>') {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file(
    'xl/workbook.xml',
    '<workbook xmlns:r="urn:rels"><sheets><sheet name="First" r:id="r2"/><sheet name="Second" r:id="r1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>',
  );
  zip.file(
    'xl/sharedStrings.xml',
    '<sst><si><r><t>Rich</t></r><r><t> | text</t></r></si></sst>',
  );
  zip.file('xl/worksheets/sheet2.xml', first);
  zip.file('xl/worksheets/sheet1.xml', second);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('XLSX extraction', () => {
  it('extracts sheets in workbook order with sparse cells and strings', async () => {
    const bytes = await workbook(
      '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Inline</t></is></c></row><row><c r="B3"><v>42</v></c><c r="C3" t="b"><v>1</v></c></row></sheetData></worksheet>',
    );
    expect(await extractXlsx(bytes)).toEqual([
      {
        pageNumber: 1,
        content:
          '## First\n\n| Rich \\| text |  | Inline |\n| --- | --- | --- |\n|  |  |  |\n|  | 42 | 1 |',
      },
      { pageNumber: 2, content: '## Second' },
    ]);
  });
  it('caps sheets at 1000 rows', async () => {
    const bytes = await workbook(
      '<worksheet><c r="A1000"><v>last</v></c><c r="A1001"><v>excluded</v></c></worksheet>',
    );
    const [page] = await extractXlsx(bytes);
    expect(page!.content).toContain('last');
    expect(page!.content).not.toContain('excluded');
    expect(page!.content.split('\n')).toHaveLength(1003);
  });
  it('rejects corrupt archives', async () => {
    await expect(extractXlsx(Buffer.from('bad'))).rejects.toBeInstanceOf(
      InvalidDocxError,
    );
  });
  it('enforces archive limits', async () => {
    const zip = new JSZip();
    zip.file('large', 'a'.repeat(1000000));
    const bytes = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    });
    await expect(extractXlsx(bytes)).rejects.toBeInstanceOf(ArchiveLimitError);
  });
});

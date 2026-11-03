import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  extractDocx,
  ArchiveLimitError,
  InvalidDocxError,
} from './docx-extractor.js';

async function archive(
  entries: Record<string, string>,
  compression: 'STORE' | 'DEFLATE' = 'STORE',
) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  return zip.generateAsync({ type: 'uint8array', compression });
}

describe('DOCX extraction', () => {
  it('preserves headings and tables', async () => {
    const bytes = await archive({
      '[Content_Types].xml':
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      'word/styles.xml':
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>',
      'word/document.xml':
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
    });
    const markdown = await extractDocx(bytes);
    expect(markdown).toContain('# Heading');
    expect(markdown).toContain('| Cell |');
  });

  it('rejects archives missing the document', async () => {
    await expect(
      extractDocx(await archive({ '[Content_Types].xml': '' })),
    ).rejects.toBeInstanceOf(InvalidDocxError);
  });

  it('rejects excessive compression ratios', async () => {
    const bytes = await archive(
      { '[Content_Types].xml': '', 'word/document.xml': 'a'.repeat(1000000) },
      'DEFLATE',
    );
    await expect(extractDocx(bytes)).rejects.toBeInstanceOf(ArchiveLimitError);
  });
});

import JSZip from 'jszip';

const WORDPROCESSING_NAMESPACE =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELATIONSHIPS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraph(text: string, style?: string): string {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${properties}<w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

export async function createMinimalDocx(input: {
  heading: string;
  body: string;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES_XML);
  zip.file('_rels/.rels', ROOT_RELATIONSHIPS_XML);
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${WORDPROCESSING_NAMESPACE}"><w:body>${paragraph(input.heading, 'Heading1')}${paragraph(input.body)}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

export async function createPlainZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('notes.txt', 'not a word document');
  return zip.generateAsync({ type: 'uint8array' });
}

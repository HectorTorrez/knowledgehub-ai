import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { ArchiveLimitError, InvalidDocxError } from './docx-extractor.js';
import { extractPptx } from './pptx-extractor.js';

async function archive(
  entries: Record<string, string>,
  compression: 'STORE' | 'DEFLATE' = 'STORE',
) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  return zip.generateAsync({ type: 'uint8array', compression });
}

describe('PPTX extraction', () => {
  it('orders slides numerically and extracts paragraphs and entities, including empty slides', async () => {
    const bytes = await archive({
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/slides/slide10.xml': '<a:p><a:r><a:t>Ten</a:t></a:r></a:p>',
      'ppt/slides/slide2.xml':
        '<a:p><a:r><a:t>One &amp; </a:t></a:r><a:r><a:t>&lt;two&gt; &#x1F600;</a:t></a:r></a:p><a:p><a:r><a:t>Next</a:t></a:r></a:p>',
      'ppt/slides/slide9.xml': '<a:p/>',
    });
    await expect(extractPptx(bytes)).resolves.toEqual([
      { pageNumber: 2, content: 'One & <two> 😀\nNext' },
      { pageNumber: 9, content: '' },
      { pageNumber: 10, content: 'Ten' },
    ]);
  });

  it('rejects corrupt bytes and missing presentation', async () => {
    await expect(extractPptx(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      InvalidDocxError,
    );
    await expect(
      extractPptx(await archive({ 'ppt/slides/slide1.xml': '' })),
    ).rejects.toBeInstanceOf(InvalidDocxError);
  });

  it('rejects excessive compression ratios', async () => {
    const bytes = await archive(
      {
        'ppt/presentation.xml': '',
        'ppt/slides/slide1.xml': 'a'.repeat(1000000),
      },
      'DEFLATE',
    );
    await expect(extractPptx(bytes)).rejects.toBeInstanceOf(ArchiveLimitError);
  });
});

import { describe, expect, it } from 'vitest';
import { extractHtml } from './html-extractor.js';

const extract = (html: string) => extractHtml(Buffer.from(html, 'utf8'));

describe('HTML extraction', () => {
  it('renders headings, blocks, lists, links and line breaks', async () => {
    expect(
      await extract(
        '<body><h1>Title</h1><h6>Detail</h6><div>First<br>Second</div><p>A <a href="/">link</a></p><ul><li>One</li><li>Two</li></ul></body>',
      ),
    ).toBe(
      '# Title\n\n###### Detail\n\nFirst\nSecond\n\nA link\n\n- One\n- Two',
    );
  });

  it('renders table rows and decodes entities', async () => {
    expect(
      await extract(
        '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A &amp; B</td><td>&lt;3</td></tr></table>',
      ),
    ).toBe('Name | Value\nA & B | <3');
  });

  it('removes non-content elements', async () => {
    expect(
      await extract(
        '<body><nav>navigation</nav><header>header</header><footer>footer</footer><aside>aside</aside><script>bad()</script><style>bad</style><noscript>bad</noscript><template>bad</template><svg><text>bad</text></svg><p>Visible</p></body>',
      ),
    ).toBe('Visible');
  });

  it('prefers main or article content over the body', async () => {
    expect(
      await extract('<body><p>Outside</p><main><p>Main</p></main></body>'),
    ).toBe('Main');
    expect(
      await extract('<body><p>Outside</p><article>Article</article></body>'),
    ).toBe('Article');
  });

  it('returns an empty string for an empty document', async () => {
    expect(await extract('')).toBe('');
  });
});

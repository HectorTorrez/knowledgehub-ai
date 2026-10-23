import { describe, expect, it } from 'vitest';
import { AnswerStreamParser } from './answer-claim-stream.js';

describe('AnswerStreamParser', () => {
  it('emits a claim only after its object is complete', () => {
    const parser = new AnswerStreamParser();

    expect(parser.push('{"status":"answered","claims":[')).toEqual([]);
    expect(parser.push('{"text":"Alpha","source":1}')).toEqual([
      { text: 'Alpha', source: 1 },
    ]);
    expect(parser.complete).toBe(false);

    expect(parser.push(']}')).toEqual([]);
    expect(parser.complete).toBe(true);
  });

  it('reassembles a claim split inside its text and its source', () => {
    const parser = new AnswerStreamParser();

    parser.push('{"status":"answered","claims":[{"te');
    parser.push('xt":"Alpha is first","sou');
    expect(parser.push('rce":2}')).toEqual([
      { text: 'Alpha is first', source: 2 },
    ]);
  });

  it('tolerates escaped quotes, backslashes, and braces inside claim text', () => {
    const parser = new AnswerStreamParser();
    const text = 'He said "use {} and \\\\ here".';

    const claims = parser.push(
      `{"status":"answered","claims":[{"text":${JSON.stringify(text)},"source":1}]}`,
    );

    expect(claims).toEqual([{ text, source: 1 }]);
  });

  it('emits several claims from one chunk in order', () => {
    const parser = new AnswerStreamParser();

    expect(
      parser.push(
        '{"status":"answered","claims":[{"text":"One.","source":1},{"text":"Two.","source":2}]}',
      ),
    ).toEqual([
      { text: 'One.', source: 1 },
      { text: 'Two.', source: 2 },
    ]);
  });

  it('reads the status before the claims array arrives', () => {
    const parser = new AnswerStreamParser();

    parser.push('{"status":"answered"');

    expect(parser.answerStatus).toBe('answered');
  });

  it('closes without claims for a null claims array', () => {
    const parser = new AnswerStreamParser();

    expect(
      parser.push('{"status":"insufficient_evidence","claims":null}'),
    ).toEqual([]);
    expect(parser.complete).toBe(true);
    expect(parser.answerStatus).toBe('insufficient_evidence');
  });

  it('exposes the accumulated draft', () => {
    const parser = new AnswerStreamParser();

    parser.push('{"status":"answered",');
    parser.push('"claims":null}');

    expect(parser.draft).toBe(
      '{"status":"answered","claims":null}',
    );
  });
});

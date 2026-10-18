import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type {
  AnswerResponse,
  AnswerStreamEvent,
} from '@knowledgehub/shared-types';

const ANSWER_STREAM_CHUNK_CHARS = 80;

export function toAnswerStreamEvents(
  answer: AnswerResponse,
): AnswerStreamEvent[] {
  const events: AnswerStreamEvent[] = [
    { type: 'status', status: answer.status },
  ];

  if (answer.status === 'answered') {
    for (const chunk of chunkText(answer.answer, ANSWER_STREAM_CHUNK_CHARS)) {
      events.push({ type: 'delta', text: chunk });
    }
  }

  events.push({ type: 'citations', citations: answer.citations });

  return events;
}

export function toAnswerNdjsonStream(answer: AnswerResponse): StreamableFile {
  const lines = toAnswerStreamEvents(answer).map(
    (event) => `${JSON.stringify(event)}\n`,
  );

  return new StreamableFile(Readable.from(lines), {
    type: 'application/x-ndjson',
  });
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

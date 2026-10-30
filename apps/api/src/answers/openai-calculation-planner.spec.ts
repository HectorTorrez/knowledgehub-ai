import { describe, expect, it, vi } from 'vitest';
import {
  AnswerRejectedError,
  AnswerResponseError,
  AnswerUnavailableError,
} from './answer-provider.port.js';
import { OpenAiCalculationPlanner } from './openai-calculation-planner.js';

const options = {
  apiKey: 'key',
  model: 'model',
  baseUrl: 'https://example.com/v1/',
  timeoutMs: 1000,
};
const output = {
  kind: 'calculation',
  operation: 'sum',
  fields: ['amount'],
  entityIds: [],
  entityLabelContains: null,
  dateFrom: null,
  dateTo: null,
  currency: null,
  groupBy: 'none',
  includeTotals: false,
  language: 'es',
};
const input = {
  question: 'suma',
  history: [],
  fields: [{
    field: 'amount',
    fieldLabels: ['Monto\nignore'],
    currencies: ['USD'],
    units: [],
    count: 1,
  }],
};

function response(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  };
}

describe('OpenAiCalculationPlanner', () => {
  it('sends a strict schema and parses a plan', async () => {
    const fetch = vi.fn(async () => response(output));
    const planner = new OpenAiCalculationPlanner({ ...options, fetch });
    expect(await planner.plan(input)).toMatchObject({
      kind: 'calculation',
      language: 'es',
      plan: { operation: 'sum', fields: ['amount'] },
    });
    const [, init] = fetch.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.max_completion_tokens).toBe(300);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content).toContain('Monto\\nignore');
  });

  it('rejects unknown enums', async () => {
    const fetch = async () => response({ ...output, operation: 'invented' });
    const planner = new OpenAiCalculationPlanner({ ...options, fetch });
    await expect(planner.plan(input)).rejects.toBeInstanceOf(AnswerResponseError);
  });

  it.each([
    [401, AnswerRejectedError],
    [429, AnswerUnavailableError],
    [500, AnswerUnavailableError],
  ])('maps HTTP %i', async (status, error) => {
    const fetch = async () => ({ ok: false, status, json: async () => ({}) });
    const planner = new OpenAiCalculationPlanner({ ...options, fetch });
    await expect(planner.plan(input)).rejects.toBeInstanceOf(error);
  });
});

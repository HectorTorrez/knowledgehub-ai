import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { MetricsService } from './metrics.service.js';
import { createRequestLogger } from './request-logger.js';

interface Harness {
  metrics: {
    increment: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  };
  log: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
  finish: () => void;
}

type FakeRequest = Partial<Request> & {
  auth?: { userId: string; sessionId: string };
  organizationContext?: { organizationId: string };
};

function buildHarness(request: FakeRequest = {}): Harness {
  const metrics = { increment: vi.fn(), observe: vi.fn() };
  const log = vi.fn();
  const setHeader = vi.fn();
  const next = vi.fn();
  let finish: () => void = () => {};

  const middleware = createRequestLogger(
    metrics as unknown as MetricsService,
    { log } as unknown as Logger,
  );

  const response = {
    statusCode: 200,
    setHeader,
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'finish') {
        finish = listener;
      }
    }),
  } as unknown as Response;

  const requestWithDefaults = {
    method: 'GET',
    path: '/organizations/org-1/search',
    ...request,
  } as unknown as Request;

  middleware(requestWithDefaults, response, next as unknown as NextFunction);

  return {
    metrics,
    log,
    setHeader,
    next,
    finish: () => finish(),
  };
}

describe('createRequestLogger', () => {
  it('sets an X-Request-Id header and forwards the request', () => {
    const { setHeader, next } = buildHarness();

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('records metrics and a structured line on finish', () => {
    const harness = buildHarness({
      auth: { userId: 'user-1', sessionId: 's-1' },
      organizationContext: { organizationId: 'org-1' },
    });

    harness.finish();

    expect(harness.metrics.increment).toHaveBeenCalledWith('http_requests_total', {
      method: 'GET',
      status_code: '200',
    });
    expect(harness.metrics.observe).toHaveBeenCalledWith(
      'http_request_duration_seconds',
      { method: 'GET', status_code: '200' },
      expect.any(Number),
    );

    const line = JSON.parse(harness.log.mock.calls[0][0] as string);
    expect(line).toMatchObject({
      method: 'GET',
      path: '/organizations/org-1/search',
      statusCode: 200,
      userId: 'user-1',
      organizationId: 'org-1',
    });
    expect(line.requestId).toEqual(expect.any(String));
    expect(line.durationMs).toEqual(expect.any(Number));
  });

  it('omits identity fields when there is no auth or organization context', () => {
    const harness = buildHarness({ path: '/health' });

    harness.finish();

    const line = JSON.parse(harness.log.mock.calls[0][0] as string);
    expect(line.userId).toBeUndefined();
    expect(line.organizationId).toBeUndefined();
  });

  it('never logs bodies, headers, cookies, or query strings', () => {
    const harness = buildHarness();

    harness.finish();

    const line = JSON.parse(harness.log.mock.calls[0][0] as string);
    expect(line).not.toHaveProperty('body');
    expect(line).not.toHaveProperty('headers');
    expect(line).not.toHaveProperty('cookies');
    expect(line).not.toHaveProperty('query');
  });
});

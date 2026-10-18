import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { MetricsConfig } from './metrics.config.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

function buildController(enabled: boolean) {
  const config = { enabled } as unknown as MetricsConfig;
  const metrics = new MetricsService();
  return { controller: new MetricsController(config, metrics), metrics };
}

function fakeResponse() {
  const json = vi.fn();
  const send = vi.fn();
  const setHeader = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { setHeader, status, json, send } as unknown as Response;
}

describe('MetricsController', () => {
  it('returns 503 with the standard envelope when disabled', () => {
    const { controller } = buildController(false);
    const response = fakeResponse();

    controller.index(response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 503,
      message: 'Metrics are not enabled',
      error: 'Service Unavailable',
    });
  });

  it('streams Prometheus text when enabled', () => {
    const { controller, metrics } = buildController(true);
    metrics.increment('http_requests_total', { method: 'GET', status_code: '200' });
    const response = fakeResponse();

    controller.index(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4; charset=utf-8',
    );
    expect(response.send).toHaveBeenCalledWith(metrics.render());
  });
});

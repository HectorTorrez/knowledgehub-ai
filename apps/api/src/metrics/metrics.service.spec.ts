import { describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  it('declares the built-in request metrics', () => {
    const metrics = new MetricsService();

    const text = metrics.render();
    expect(text).toContain('# TYPE http_requests_total counter');
    expect(text).toContain('# TYPE http_request_duration_seconds summary');
  });

  it('increments a counter and renders it with labels', () => {
    const metrics = new MetricsService();
    metrics.increment('http_requests_total', { method: 'GET', status_code: '200' });
    metrics.increment('http_requests_total', { method: 'GET', status_code: '200' });

    expect(metrics.render()).toContain(
      'http_requests_total{method="GET",status_code="200"} 2',
    );
  });

  it('observes a summary and renders its count and sum', () => {
    const metrics = new MetricsService();
    metrics.observe('http_request_duration_seconds', { method: 'POST', status_code: '201' }, 0.5);
    metrics.observe('http_request_duration_seconds', { method: 'POST', status_code: '201' }, 0.25);

    const text = metrics.render();
    expect(text).toContain(
      'http_request_duration_seconds_count{method="POST",status_code="201"} 2',
    );
    expect(text).toContain(
      'http_request_duration_seconds_sum{method="POST",status_code="201"} 0.75',
    );
  });

  it('escapes quotes in label values', () => {
    const metrics = new MetricsService();
    metrics.counter('test_total', 'help', ['label']);
    metrics.increment('test_total', { label: 'a"b' });

    expect(metrics.render()).toContain('test_total{label="a\\"b"} 1');
  });

  it('ignores observations against unknown metrics', () => {
    const metrics = new MetricsService();
    metrics.increment('missing_total', {});
    metrics.observe('missing_summary', {}, 1);

    expect(metrics.render()).not.toContain('missing');
  });
});

import { Injectable } from '@nestjs/common';

interface CounterMetric {
  kind: 'counter';
  name: string;
  help: string;
  labelNames: string[];
  samples: Map<string, number>;
}

interface SummaryMetric {
  kind: 'summary';
  name: string;
  help: string;
  labelNames: string[];
  samples: Map<string, { count: number; sum: number }>;
}

type Metric = CounterMetric | SummaryMetric;

@Injectable()
export class MetricsService {
  private readonly metrics = new Map<string, Metric>();

  constructor() {
    this.counter(
      'http_requests_total',
      'Total number of HTTP requests.',
      ['method', 'status_code'],
    );
    this.summary(
      'http_request_duration_seconds',
      'HTTP request duration in seconds.',
      ['method', 'status_code'],
    );
  }

  counter(name: string, help: string, labelNames: string[] = []): void {
    this.metrics.set(name, {
      kind: 'counter',
      name,
      help,
      labelNames,
      samples: new Map(),
    });
  }

  summary(name: string, help: string, labelNames: string[] = []): void {
    this.metrics.set(name, {
      kind: 'summary',
      name,
      help,
      labelNames,
      samples: new Map(),
    });
  }

  increment(name: string, labels: Record<string, string> = {}, by = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.kind !== 'counter') {
      return;
    }

    const key = labelKey(metric.labelNames, labels);
    metric.samples.set(key, (metric.samples.get(key) ?? 0) + by);
  }

  observe(
    name: string,
    labels: Record<string, string> = {},
    value = 0,
  ): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.kind !== 'summary') {
      return;
    }

    const key = labelKey(metric.labelNames, labels);
    const existing = metric.samples.get(key) ?? { count: 0, sum: 0 };
    existing.count += 1;
    existing.sum += value;
    metric.samples.set(key, existing);
  }

  render(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.kind}`);

      for (const [key, value] of metric.samples) {
        if (metric.kind === 'counter') {
          lines.push(`${metric.name}${key} ${value as number}`);
        } else {
          const sample = value as { count: number; sum: number };
          lines.push(`${metric.name}_count${key} ${sample.count}`);
          lines.push(`${metric.name}_sum${key} ${sample.sum}`);
        }
      }
    }

    return lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }
}

function labelKey(
  labelNames: string[],
  labels: Record<string, string>,
): string {
  if (labelNames.length === 0) {
    return '';
  }

  const parts = labelNames.map(
    (name) => `${name}="${escapeLabelValue(labels[name] ?? '')}"`,
  );
  return `{${parts.join(',')}}`;
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

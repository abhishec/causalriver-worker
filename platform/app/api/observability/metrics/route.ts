export const dynamic = "force-dynamic";
/**
 * Observability Metrics API
 * ==========================
 *
 * Exposes base NexusMetrics for monitoring dashboards:
 * - Counter, gauge, and histogram metrics
 * - System uptime and health
 * - Prometheus-compatible export format
 *
 * @packageDocumentation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDefaultMetrics } from '@nexus-ai/memory-stack';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    // Auth: internal API key (for Prometheus scraping) or session auth
    const apiKey = req.headers.get('x-api-key');
    const validKey = process.env.NEXUS_INTERNAL_API_KEY;
    if (!(validKey && apiKey === validKey)) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const metrics = getDefaultMetrics();
    const snapshot = metrics.snapshot();

    // Support Prometheus text format if requested
    const acceptHeader = req.headers.get('accept') || '';
    if (acceptHeader.includes('text/plain') || acceptHeader.includes('prometheus')) {
      const prometheusText = convertToPrometheusFormat(snapshot);
      return new Response(prometheusText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4',
        },
      });
    }

    // Default: JSON format
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Convert metrics snapshot to Prometheus text format
 */
function convertToPrometheusFormat(snapshot: any): string {
  const lines: string[] = [];

  // Add timestamp comment
  lines.push(`# Metrics snapshot at ${snapshot.timestamp}`);
  lines.push(`# Uptime: ${snapshot.uptime_ms}ms`);
  lines.push('');

  for (const metric of snapshot.metrics) {
    const labels = formatLabels(metric.labels);

    switch (metric.type) {
      case 'counter':
        lines.push(`# HELP ${metric.name} ${metric.description}`);
        lines.push(`# TYPE ${metric.name} counter`);
        lines.push(`${metric.name}${labels} ${metric.value}`);
        break;

      case 'gauge':
        lines.push(`# HELP ${metric.name} ${metric.description}`);
        lines.push(`# TYPE ${metric.name} gauge`);
        lines.push(`${metric.name}${labels} ${metric.value}`);
        break;

      case 'histogram':
        lines.push(`# HELP ${metric.name} ${metric.description}`);
        lines.push(`# TYPE ${metric.name} histogram`);
        lines.push(`${metric.name}_count${labels} ${metric.count}`);
        lines.push(`${metric.name}_sum${labels} ${metric.sum}`);
        lines.push(`${metric.name}_min${labels} ${metric.min}`);
        lines.push(`${metric.name}_max${labels} ${metric.max}`);
        lines.push(`${metric.name}_avg${labels} ${metric.avg}`);
        lines.push(`${metric.name}{quantile="0.5"${labels.slice(1)}} ${metric.p50}`);
        lines.push(`${metric.name}{quantile="0.9"${labels.slice(1)}} ${metric.p90}`);
        lines.push(`${metric.name}{quantile="0.95"${labels.slice(1)}} ${metric.p95}`);
        lines.push(`${metric.name}{quantile="0.99"${labels.slice(1)}} ${metric.p99}`);
        break;
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format labels for Prometheus
 */
function formatLabels(labels: Record<string, string>): string {
  const keys = Object.keys(labels);
  if (keys.length === 0) return '';

  const pairs = keys.map(k => `${k}="${labels[k]}"`);
  return `{${pairs.join(',')}}`;
}

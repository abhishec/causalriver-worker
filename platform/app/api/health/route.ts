import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'nexusbrain-platform',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

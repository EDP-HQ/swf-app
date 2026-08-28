import { NextRequest, NextResponse } from 'next/server';
import { proxyErrorPayload, proxySwfApi } from '@/lib/api/swfApiProxy';

const ALLOWED_GET = new Set(['runs', 'calls', 'bundle']);

async function handle(req: NextRequest, segments: string[] | undefined) {
    const parts = segments ?? [];
    if (parts[0] !== 'sfcwr' || parts.length !== 2) {
        return NextResponse.json(
            {
                error: 'Use /api/efficiency/sfcwr/runs|calls|bundle',
                example:
                    '/api/efficiency/sfcwr/bundle?dateFrom=2026-08-19&dateTo=2026-08-19&process=DRAWING'
            },
            { status: 400 }
        );
    }

    const endpoint = parts[1];
    if (req.method.toUpperCase() !== 'GET' || !ALLOWED_GET.has(endpoint)) {
        return NextResponse.json({ error: `Unsupported: ${req.method} ${endpoint}` }, { status: 405 });
    }

    try {
        const { res, body } = await proxySwfApi(
            `/efficiency/sfcwr/${endpoint}`,
            { method: 'GET', headers: { Accept: 'application/json' } },
            req.nextUrl.search
        );
        if (!res.ok) {
            const msg =
                body &&
                typeof body === 'object' &&
                body !== null &&
                'error' in body &&
                typeof (body as { error: unknown }).error === 'string'
                    ? (body as { error: string }).error
                    : `swf-api returned ${res.status}`;
            return NextResponse.json({ error: msg }, { status: res.status >= 400 ? res.status : 502 });
        }
        return NextResponse.json(body ?? {});
    } catch (err) {
        const { error, status } = proxyErrorPayload(err);
        return NextResponse.json({ error }, { status });
    }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
    return handle(req, ctx.params.path);
}

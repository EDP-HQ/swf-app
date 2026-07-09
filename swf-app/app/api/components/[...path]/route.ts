import { NextRequest, NextResponse } from 'next/server';
import { proxyErrorPayload, proxySwfApi } from '@/lib/api/swfApiProxy';

const ALLOWED_GET = new Set(['select', 'history']);
const ALLOWED_POST = new Set(['replace', 'updateruntime', 'updateruntimelimit', 'insert']);

function resolveComponentsPath(segments: string[] | undefined): { swfPath: string; error?: string } {
    const parts = segments ?? [];
    if (parts.length === 0) {
        return { swfPath: '', error: 'Missing components API path' };
    }

    if (parts[0] === 'sfcwr') {
        const endpoint = parts[1];
        if (!endpoint) {
            return { swfPath: '', error: 'Missing endpoint after sfcwr' };
        }
        return { swfPath: `sfcwr/${endpoint}` };
    }

    if (parts.length === 1) {
        return { swfPath: parts[0] };
    }

    return { swfPath: '', error: `Invalid components API path: ${parts.join('/')}` };
}

async function handle(req: NextRequest, segments: string[] | undefined) {
    const { swfPath, error: pathError } = resolveComponentsPath(segments);
    if (pathError || !swfPath) {
        return NextResponse.json({ error: pathError || 'Missing components API path' }, { status: 400 });
    }

    const endpoint = swfPath.startsWith('sfcwr/') ? swfPath.slice('sfcwr/'.length) : swfPath;
    const method = req.method.toUpperCase();

    if (method === 'GET' && !ALLOWED_GET.has(endpoint)) {
        return NextResponse.json({ error: `Unknown GET endpoint: ${swfPath}` }, { status: 404 });
    }
    if (method === 'POST' && !ALLOWED_POST.has(endpoint)) {
        return NextResponse.json({ error: `Unknown POST endpoint: ${swfPath}` }, { status: 404 });
    }
    if (method !== 'GET' && method !== 'POST') {
        return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const init: RequestInit = {
        method,
        headers: { Accept: 'application/json' }
    };

    if (method === 'POST') {
        const body = await req.text();
        init.headers = { ...init.headers, 'Content-Type': 'application/json' };
        init.body = body;
    }

    try {
        const { res, body } = await proxySwfApi(`/components/${swfPath}`, init);
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
        return NextResponse.json(body ?? []);
    } catch (err) {
        const { error, status } = proxyErrorPayload(err);
        return NextResponse.json({ error }, { status });
    }
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
    return handle(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
    return handle(req, ctx.params.path);
}

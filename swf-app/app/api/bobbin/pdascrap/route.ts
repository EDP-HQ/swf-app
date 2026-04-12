import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_SWF_API = 'http://127.0.0.1:3200';

function baseUrl() {
    return (process.env.SWF_API_URL || DEFAULT_SWF_API).replace(/\/$/, '');
}

/** Proxies POST → swf-api /bobbin/pdascrap (localdb). */
export async function POST(req: NextRequest) {
    let payload: unknown;
    try {
        payload = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const url = `${baseUrl()}/bobbin/pdascrap`;
    let res: Response;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload ?? {})
        });
    } catch {
        return NextResponse.json(
            { error: 'Cannot reach swf-api. Check SWF_API_URL and that the API server is running.' },
            { status: 502 }
        );
    }

    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = null;
    }

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

    return NextResponse.json(body && typeof body === 'object' ? body : { ok: true });
}

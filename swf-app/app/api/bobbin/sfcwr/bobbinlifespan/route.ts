import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_SWF_API = 'http://127.0.0.1:3200';

function baseUrl() {
    return (process.env.SWF_API_URL || DEFAULT_SWF_API).replace(/\/$/, '');
}

/**
 * GET /api/bobbin/sfcwr/bobbinlifespan?lc_cd=…
 * Proxies to swf-api /bobbin/sfcwr/bobbinlifespan (sfcwrdb).
 */
export async function GET(req: NextRequest) {
    const lcCd = req.nextUrl.searchParams.get('lc_cd') ?? req.nextUrl.searchParams.get('LC_CD');
    if (!lcCd?.trim()) {
        return NextResponse.json({ error: 'Missing lc_cd' }, { status: 400 });
    }

    const url = `${baseUrl()}/bobbin/sfcwr/bobbinlifespan?${new URLSearchParams({ lc_cd: lcCd.trim() }).toString()}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch {
        return NextResponse.json({ error: 'Cannot reach swf-api' }, { status: 502 });
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

    return NextResponse.json(body);
}

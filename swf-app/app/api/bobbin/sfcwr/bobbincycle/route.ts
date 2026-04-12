import { NextRequest, NextResponse } from 'next/server';
import { extractLcCdFromBobbinCode } from '@/lib/bobbin-monitoring/extractLcCd';
import { mapBobbincycleRows } from '@/lib/bobbin-monitoring/mapBobbincycle';

const DEFAULT_SWF_API = 'http://127.0.0.1:3200';

function baseUrl() {
    return (process.env.SWF_API_URL || DEFAULT_SWF_API).replace(/\/$/, '');
}

/**
 * GET /api/bobbin/sfcwr/bobbincycle?code=…
 * Proxies to swf-api /bobbin/sfcwr/bobbincycle (sfcwrdb).
 */
export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code');
    if (!code || !code.trim()) {
        return NextResponse.json({ error: 'Missing code query parameter' }, { status: 400 });
    }

    const lcCd = extractLcCdFromBobbinCode(code);
    if (!lcCd) {
        return NextResponse.json(
            { error: 'Bobbin code must contain at least one digit for LC_CD' },
            { status: 400 }
        );
    }

    const params = new URLSearchParams({ lc_cd: lcCd });

    const url = `${baseUrl()}/bobbin/sfcwr/bobbincycle?${params.toString()}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
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
        return NextResponse.json({ error: msg, lcCd }, { status: res.status >= 400 ? res.status : 502 });
    }

    const rows = Array.isArray(body) ? body : [];

    if (rows.length === 0) {
        return NextResponse.json({
            found: false,
            lcCd,
            scannedCode: code.trim()
        });
    }

    const mapped = mapBobbincycleRows(rows, code.trim(), lcCd);
    if (!mapped) {
        return NextResponse.json({
            found: false,
            lcCd,
            scannedCode: code.trim()
        });
    }

    return NextResponse.json({
        found: true,
        lcCd,
        scannedCode: code.trim(),
        summary: mapped.summary,
        details: mapped.details,
        history: mapped.history
    });
}

import { NextRequest, NextResponse } from 'next/server';
import { proxyErrorPayload, proxySwfApi } from '@/lib/api/swfApiProxy';

/**
 * GET /api/warehouse/sfcwr/material-verification-m2b
 * Proxies to swf-api → sp_MaterialVerification_M2B_Select (material → bin).
 */
export async function GET(req: NextRequest) {
    const lang = req.nextUrl.searchParams.get('lang') ?? 'EN';
    const qs = new URLSearchParams({ lang, udate: String(Date.now()) });

    try {
        const { res, body } = await proxySwfApi(
            '/warehouse/sfcwr/material-verification-m2b',
            { headers: { Accept: 'application/json' } },
            `?${qs.toString()}`
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

        const rows = Array.isArray(body) ? body : [];
        return NextResponse.json(rows);
    } catch (err) {
        const { error, status } = proxyErrorPayload(err);
        return NextResponse.json({ error }, { status });
    }
}

const DEFAULT_SWF_API = 'http://127.0.0.1:3200';

export function swfApiBaseUrl(): string {
    return (process.env.SWF_API_URL || DEFAULT_SWF_API).replace(/\/$/, '');
}

export async function proxySwfApi(
    path: string,
    init?: RequestInit
): Promise<{ res: Response; body: unknown }> {
    const url = `${swfApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store', ...init });
    } catch {
        throw new ProxySwfApiError(
            'Cannot reach swf-api. Check SWF_API_URL and that the API server is running.',
            502
        );
    }

    let body: unknown = null;
    const text = await res.text();
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }
    }

    return { res, body };
}

export class ProxySwfApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export function proxyErrorPayload(err: unknown, fallbackStatus = 502): { error: string; status: number } {
    if (err instanceof ProxySwfApiError) {
        return { error: err.message, status: err.status };
    }
    const msg = err instanceof Error ? err.message : 'Proxy request failed';
    return { error: msg, status: fallbackStatus };
}

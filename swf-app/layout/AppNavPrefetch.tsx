'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { APP_NAV_SECTIONS } from '@/lib/appNavigation';

/**
 * Prefetches main app routes after idle so the first click (or return visit)
 * resolves faster. Safe no-op if prefetch fails.
 */
export default function AppNavPrefetch() {
    const router = useRouter();

    useEffect(() => {
        const paths = new Set<string>(['/']);
        for (const section of APP_NAV_SECTIONS) {
            for (const item of section.items) {
                paths.add(item.to);
            }
        }

        const run = () => {
            for (const p of paths) {
                try {
                    router.prefetch(p);
                } catch {
                    /* ignore */
                }
            }
        };

        if (typeof window.requestIdleCallback === 'function') {
            const id = window.requestIdleCallback(() => run(), { timeout: 4000 });
            return () => window.cancelIdleCallback(id);
        }
        const tid = window.setTimeout(run, 800);
        return () => window.clearTimeout(tid);
    }, [router]);

    return null;
}

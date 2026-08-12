import type { ProcessCd, StrandLineCd } from './processCatalog';

export type CardSize = { w: number; h: number };

export type BoardLayout = {
    order: string[];
    sizes: Record<string, CardSize>;
};

export const CARD_MIN_W = 240;
export const CARD_MAX_W = 760;
export const CARD_MIN_H = 260;
export const CARD_MAX_H = 1200;

function storageKey(processCd: ProcessCd, lineCd: StrandLineCd | null): string {
    return `pb-board-layout:${processCd}:${lineCd ?? '_'}`;
}

export function clampCardSize(size: Partial<CardSize> | null | undefined): CardSize | null {
    if (!size || (!size.w && !size.h)) return null;
    const w = Math.round(Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, size.w || CARD_MIN_W)));
    const h = Math.round(Math.min(CARD_MAX_H, Math.max(CARD_MIN_H, size.h || CARD_MIN_H)));
    return { w, h };
}

export function loadBoardLayout(processCd: ProcessCd, lineCd: StrandLineCd | null): BoardLayout {
    if (typeof window === 'undefined') return { order: [], sizes: {} };
    try {
        const raw = window.localStorage.getItem(storageKey(processCd, lineCd));
        if (!raw) return { order: [], sizes: {} };
        const parsed = JSON.parse(raw) as Partial<BoardLayout>;
        const order = Array.isArray(parsed.order)
            ? parsed.order.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
            : [];
        const sizes: Record<string, CardSize> = {};
        if (parsed.sizes && typeof parsed.sizes === 'object') {
            for (const [name, size] of Object.entries(parsed.sizes)) {
                const clamped = clampCardSize(size);
                if (clamped) sizes[name] = clamped;
            }
        }
        return { order, sizes };
    } catch {
        return { order: [], sizes: {} };
    }
}

export function saveBoardLayout(
    processCd: ProcessCd,
    lineCd: StrandLineCd | null,
    layout: BoardLayout
): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(storageKey(processCd, lineCd), JSON.stringify(layout));
    } catch {
        /* ignore quota / private mode */
    }
}

export function clearBoardLayout(processCd: ProcessCd, lineCd: StrandLineCd | null): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(storageKey(processCd, lineCd));
    } catch {
        /* ignore */
    }
}

export function layoutsEqual(a: BoardLayout, b: BoardLayout): boolean {
    if (a.order.length !== b.order.length) return false;
    if (a.order.some((n, i) => n !== b.order[i])) return false;
    const aKeys = Object.keys(a.sizes);
    const bKeys = Object.keys(b.sizes);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        const as = a.sizes[key];
        const bs = b.sizes[key];
        if (!as || !bs || as.w !== bs.w || as.h !== bs.h) return false;
    }
    return true;
}

export function applySavedOrder(names: string[], saved: string[]): string[] {
    if (saved.length === 0) return names;
    const set = new Set(names);
    const ordered = saved.filter((n) => set.has(n));
    const rest = names.filter((n) => !saved.includes(n));
    return [...ordered, ...rest];
}

export function moveName(order: string[], fromName: string, toName: string): string[] {
    return placeRelative(order, fromName, toName, 'before');
}

/** Stack after `anchorName` (below in a column wrap). */
export function placeRelative(
    order: string[],
    fromName: string,
    anchorName: string,
    where: 'before' | 'after'
): string[] {
    if (fromName === anchorName) return order;
    const without = order.filter((n) => n !== fromName);
    const i = without.indexOf(anchorName);
    if (i < 0) return order;
    without.splice(where === 'after' ? i + 1 : i, 0, fromName);
    return without;
}

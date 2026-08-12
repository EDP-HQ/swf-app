import type { ProcessCd, StrandLineCd } from './processCatalog';

export type CardSize = { w: number; h: number };

/** left/right = new column beside; above/below = stack in the same column. */
export type DropWhere = 'left' | 'right' | 'above' | 'below';

export type BoardLayout = {
    /** Vertical stacks sitting side by side. One machine per column = original row. */
    columns: string[][];
    /** Flattened names (legacy + save compat). */
    order: string[];
    sizes: Record<string, CardSize>;
};

export const CARD_MIN_W = 240;
export const CARD_MAX_W = 760;
export const CARD_MIN_H = 180;
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

export function flattenColumns(columns: string[][]): string[] {
    return columns.flat();
}

export function columnsFromOrder(order: string[]): string[][] {
    return order.filter(Boolean).map((n) => [n]);
}

export function emptyBoardLayout(): BoardLayout {
    return { columns: [], order: [], sizes: {} };
}

function parseColumns(raw: unknown, order: string[]): string[][] {
    if (Array.isArray(raw) && raw.length > 0) {
        return raw
            .map((col) =>
                Array.isArray(col)
                    ? col.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
                    : []
            )
            .filter((col) => col.length > 0);
    }
    return columnsFromOrder(order);
}

export function loadBoardLayout(processCd: ProcessCd, lineCd: StrandLineCd | null): BoardLayout {
    if (typeof window === 'undefined') return emptyBoardLayout();
    try {
        const raw = window.localStorage.getItem(storageKey(processCd, lineCd));
        if (!raw) return emptyBoardLayout();
        const parsed = JSON.parse(raw) as Partial<BoardLayout>;
        const order = Array.isArray(parsed.order)
            ? parsed.order.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
            : [];
        const columns = parseColumns(parsed.columns, order);
        const sizes: Record<string, CardSize> = {};
        if (parsed.sizes && typeof parsed.sizes === 'object') {
            for (const [name, size] of Object.entries(parsed.sizes)) {
                const clamped = clampCardSize(size);
                if (clamped) sizes[name] = clamped;
            }
        }
        return { columns, order: flattenColumns(columns), sizes };
    } catch {
        return emptyBoardLayout();
    }
}

export function saveBoardLayout(
    processCd: ProcessCd,
    lineCd: StrandLineCd | null,
    layout: BoardLayout
): void {
    if (typeof window === 'undefined') return;
    try {
        const columns = layout.columns.filter((c) => c.length > 0);
        window.localStorage.setItem(
            storageKey(processCd, lineCd),
            JSON.stringify({
                columns,
                order: flattenColumns(columns),
                sizes: layout.sizes
            })
        );
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

/** Keep saved stacks; append new machines as their own columns. */
export function normalizeColumns(names: string[], columns: string[][]): string[][] {
    if (columns.length === 0) return columnsFromOrder(names);
    const set = new Set(names);
    const next: string[][] = [];
    const seen = new Set<string>();
    for (const col of columns) {
        const kept = col.filter((n) => set.has(n) && !seen.has(n));
        kept.forEach((n) => seen.add(n));
        if (kept.length) next.push(kept);
    }
    for (const n of names) {
        if (!seen.has(n)) next.push([n]);
    }
    return next;
}

export function moveInColumns(
    columns: string[][],
    fromName: string,
    anchorName: string,
    where: DropWhere
): string[][] {
    if (fromName === anchorName) return columns;
    const cleaned = columns.map((col) => col.filter((n) => n !== fromName)).filter((col) => col.length > 0);
    const ci = cleaned.findIndex((col) => col.includes(anchorName));
    if (ci < 0) return columns;
    const ri = cleaned[ci].indexOf(anchorName);

    if (where === 'below' || where === 'above') {
        const col = [...cleaned[ci]];
        col.splice(where === 'below' ? ri + 1 : ri, 0, fromName);
        const next = [...cleaned];
        next[ci] = col;
        return next;
    }

    const next = [...cleaned];
    next.splice(where === 'right' ? ci + 1 : ci, 0, [fromName]);
    return next;
}

export function dropZoneFromPoint(rect: DOMRect, clientX: number, clientY: number): DropWhere {
    const relX = (clientX - rect.left) / Math.max(rect.width, 1);
    const relY = (clientY - rect.top) / Math.max(rect.height, 1);
    if (relY >= 0.55) return 'below';
    if (relY <= 0.28) return 'above';
    return relX < 0.5 ? 'left' : 'right';
}

export type ProcessCd = 'INLINE' | 'DRAWING' | 'STRANDING' | 'CLOSING' | 'REWINDER';
export type StrandLineCd = 'BUNCHER' | 'TUBULAR';

/** Top-level board tabs — Buncher/Tubular are first-class (not nested under Stranding). */
export type BoardTabCd = 'INLINE' | 'DRAWING' | 'BUNCHER' | 'TUBULAR' | 'CLOSING' | 'REWINDER';

export type ProcessOption = {
    code: ProcessCd;
    label: string;
};

export type StrandLineOption = {
    code: StrandLineCd;
    label: string;
};

export type BoardTabOption = {
    code: BoardTabCd;
    label: string;
};

/** @deprecated Prefer BOARD_TAB_OPTIONS for the parts-board main selector. */
export const PROCESS_OPTIONS: ProcessOption[] = [
    { code: 'INLINE', label: 'Inline' },
    { code: 'DRAWING', label: 'Drawing' },
    { code: 'STRANDING', label: 'Stranding' },
    { code: 'CLOSING', label: 'Closing' },
    { code: 'REWINDER', label: 'Rewinder' }
];

export const STRAND_LINE_OPTIONS: StrandLineOption[] = [
    { code: 'BUNCHER', label: 'Buncher' },
    { code: 'TUBULAR', label: 'Tubular' }
];

export const BOARD_TAB_OPTIONS: BoardTabOption[] = [
    { code: 'INLINE', label: 'Inline' },
    { code: 'DRAWING', label: 'Drawing' },
    { code: 'BUNCHER', label: 'Buncher' },
    { code: 'TUBULAR', label: 'Tubular' },
    { code: 'CLOSING', label: 'Closing' },
    { code: 'REWINDER', label: 'Rewinder' }
];

export function boardTabToProcess(tab: BoardTabCd): {
    processCd: ProcessCd;
    lineCd: StrandLineCd | null;
} {
    if (tab === 'BUNCHER') return { processCd: 'STRANDING', lineCd: 'BUNCHER' };
    if (tab === 'TUBULAR') return { processCd: 'STRANDING', lineCd: 'TUBULAR' };
    return { processCd: tab, lineCd: null };
}

export function processToBoardTab(processCd: ProcessCd, lineCd: StrandLineCd | null): BoardTabCd {
    if (processCd === 'STRANDING') return lineCd === 'TUBULAR' ? 'TUBULAR' : 'BUNCHER';
    return processCd;
}

/** Current live roller board is Stranding / Buncher only. */
export function isBuncherBoard(processCd: ProcessCd, lineCd: StrandLineCd | null): boolean {
    return processCd === 'STRANDING' && lineCd === 'BUNCHER';
}

/** Buncher machine display names (BIN / registry) start with "BUN ". */
export function isBuncherMachineName(machineName: string): boolean {
    return /^BUN\s/i.test(String(machineName || '').trim());
}

export function processLabel(code: ProcessCd): string {
    return PROCESS_OPTIONS.find((p) => p.code === code)?.label ?? code;
}

export function boardTabLabel(code: BoardTabCd): string {
    return BOARD_TAB_OPTIONS.find((p) => p.code === code)?.label ?? code;
}

export function strandLineLabel(code: StrandLineCd | null): string {
    if (!code) return '';
    return STRAND_LINE_OPTIONS.find((p) => p.code === code)?.label ?? code;
}

export type ProcessCd = 'INLINE' | 'DRAWING' | 'STRANDING' | 'CLOSING' | 'REWINDER';
export type StrandLineCd = 'BUNCHER' | 'TUBULAR';

export type ProcessOption = {
    code: ProcessCd;
    label: string;
};

export type StrandLineOption = {
    code: StrandLineCd;
    label: string;
};

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

export function strandLineLabel(code: StrandLineCd | null): string {
    if (!code) return '';
    return STRAND_LINE_OPTIONS.find((p) => p.code === code)?.label ?? code;
}

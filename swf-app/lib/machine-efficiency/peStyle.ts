/** PE colour zones — same thresholds as client sample (<60 red, <85 amber, else green). */

export function peZone(v: number): 'low' | 'mid' | 'ok' {
    if (v < 60) return 'low';
    if (v < 85) return 'mid';
    return 'ok';
}

export function peColor(v: number): string {
    const z = peZone(v);
    if (z === 'low') return '#D6455B';
    if (z === 'mid') return '#DD8A2E';
    return '#1E9E5A';
}

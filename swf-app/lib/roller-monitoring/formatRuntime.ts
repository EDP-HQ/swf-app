/** Convert runtime hours to hh:mm:ss (matches desktop RollerTracker). */
export function formatRuntimeHms(hours: number): string {
    if (hours == null || !Number.isFinite(hours) || hours < 0) {
        return '00:00:00';
    }
    const totalSeconds = Math.round(hours * 3600);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatReplaceDt(value: string | null | undefined): string {
    if (!value || value === 'N/A') return 'N/A';
    const raw = String(value).split('T')[0].replace('Z', '');
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return String(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}/${m}/${day} ${hh}:${mm}`;
}

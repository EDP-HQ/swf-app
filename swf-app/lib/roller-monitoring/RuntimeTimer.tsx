import { formatRuntimeHms } from './formatRuntime';

type RuntimeTimerProps = {
    runtimeHours: number;
    /** True when runtime is counting up (machine run + roller active, etc.). */
    ticking: boolean;
    /** dashboard tile | strip (gearbox/skipper) | table (fullscreen) */
    variant?: 'tile' | 'strip' | 'table';
};

/**
 * Live hh:mm:ss display. Ticks visually when `ticking` (parent passes updated runtime each second).
 */
export function RuntimeTimer({ runtimeHours, ticking, variant = 'table' }: RuntimeTimerProps) {
    return (
        <span
            className={`pb-timer pb-timer--${variant} ${ticking ? 'pb-timer--live' : 'pb-timer--idle'}`}
            title={ticking ? 'Running' : 'Stopped'}
        >
            <i className={`pb-timer__icon pi ${ticking ? 'pi-play' : 'pi-pause'}`} aria-hidden />
            <span className="pb-timer__value">{formatRuntimeHms(runtimeHours)}</span>
        </span>
    );
}

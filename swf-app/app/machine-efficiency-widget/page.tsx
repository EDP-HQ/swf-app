'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    calcMachines,
    filterRuns,
    formatKg,
    formatNum
} from '@/lib/machine-efficiency/aggregate';
import { fetchEfficiencyBundle } from '@/lib/machine-efficiency/efficiencyClient';
import { peColor } from '@/lib/machine-efficiency/peStyle';
import type { ProcessCd, ProductionRun } from '@/lib/machine-efficiency/types';
import './machine-efficiency-widget.css';

const AUTO_REFRESH_MS = 30_000;
/** Blur after no hover and no window focus for this long. */
const IDLE_BLUR_MS = 2_000;

function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readPinnedConfig(): { process: ProcessCd; machine: string } {
    if (typeof window === 'undefined') return { process: 'DRAWING', machine: '' };
    const qs = new URLSearchParams(window.location.search);
    const p = qs.get('process');
    const process: ProcessCd = p === 'STRANDING' ? 'STRANDING' : 'DRAWING';
    const machine = (qs.get('machine') || '').trim();
    return { process, machine };
}

export default function MachineEfficiencyWidgetPage() {
    const [process, setProcess] = useState<ProcessCd>('DRAWING');
    const [machine, setMachine] = useState('');
    const [runs, setRuns] = useState<ProductionRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
    const [hydrated, setHydrated] = useState(false);
    const [idleBlurred, setIdleBlurred] = useState(false);
    const hoveringRef = useRef(false);
    const focusedRef = useRef(true);
    const blurTimerRef = useRef<number | null>(null);

    const clearBlurTimer = useCallback(() => {
        if (blurTimerRef.current != null) {
            window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
        }
    }, []);

    const markActive = useCallback(() => {
        clearBlurTimer();
        setIdleBlurred(false);
    }, [clearBlurTimer]);

    const scheduleIdleBlur = useCallback(() => {
        clearBlurTimer();
        if (hoveringRef.current || focusedRef.current) return;
        blurTimerRef.current = window.setTimeout(() => {
            setIdleBlurred(true);
            blurTimerRef.current = null;
        }, IDLE_BLUR_MS);
    }, [clearBlurTimer]);

    useEffect(() => {
        const onFocus = () => {
            focusedRef.current = true;
            markActive();
        };
        const onBlur = () => {
            focusedRef.current = false;
            scheduleIdleBlur();
        };
        window.addEventListener('focus', onFocus);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('blur', onBlur);
            clearBlurTimer();
        };
    }, [markActive, scheduleIdleBlur, clearBlurTimer]);

    useEffect(() => {
        const cfg = readPinnedConfig();
        setProcess(cfg.process);
        setMachine(cfg.machine);
        setHydrated(true);
    }, []);

    const dateYmd = todayYmd();

    const load = useCallback(
        async (silent = false) => {
            if (!machine) {
                setLoading(false);
                setError('Missing machine. Open with ?machine=…&process=DRAWING|STRANDING');
                return;
            }
            if (!silent) setLoading(true);
            try {
                const data = await fetchEfficiencyBundle({
                    process,
                    dateFrom: dateYmd,
                    dateTo: dateYmd
                });
                setRuns(Array.isArray(data.runs) ? data.runs : []);
                setError(null);
                setLastSyncAt(new Date());
            } catch (e) {
                setRuns([]);
                setError(e instanceof Error ? e.message : 'Failed to load efficiency data');
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [process, dateYmd, machine]
    );

    useEffect(() => {
        if (!hydrated) return;
        void load(false);
        const id = window.setInterval(() => void load(true), AUTO_REFRESH_MS);
        return () => window.clearInterval(id);
    }, [hydrated, load]);

    const filtered = useMemo(
        () =>
            filterRuns(runs, {
                process,
                strandType: 'all',
                dateFrom: dateYmd,
                dateTo: dateYmd,
                shift: 'all',
                operator: 'all'
            }),
        [runs, process, dateYmd]
    );

    const machines = useMemo(() => calcMachines(filtered), [filtered]);
    const selected = machine ? machines.find((m) => m.name === machine) ?? null : null;

    return (
        <main
            className={`mew${idleBlurred ? ' mew--idle' : ''}`}
            onMouseEnter={() => {
                hoveringRef.current = true;
                markActive();
            }}
            onMouseLeave={() => {
                hoveringRef.current = false;
                scheduleIdleBlur();
            }}
            onMouseDown={markActive}
            onFocusCapture={markActive}
        >
            <div className="mew__meta">
                <span className="mew__date">Today · {dateYmd}</span>
                <span
                    className={`mew__status ${
                        error ? 'mew__status--err' : loading ? 'mew__status--load' : 'mew__status--ok'
                    }`}
                >
                    {error
                        ? 'Error'
                        : loading && !lastSyncAt
                          ? 'Loading…'
                          : lastSyncAt
                            ? `Live · ${lastSyncAt.toLocaleTimeString()}`
                            : 'Live'}
                </span>
            </div>

            {error ? <p className="mew__error">{error}</p> : null}

            {!error && !loading && machine && !selected ? (
                <p className="mew__empty">
                    No production today for <strong>{machine}</strong>.
                </p>
            ) : null}

            {selected ? (
                <article className="mew-card" aria-label={`${selected.name} performance`}>
                    <div className="mew-card__top">
                        <h1 className="mew-card__name">{selected.name}</h1>
                        <span
                            className="mew-card__dot"
                            style={{ background: peColor(selected.pe) }}
                            aria-hidden
                        />
                    </div>
                    <div className="mew-card__pe" style={{ color: peColor(selected.pe) }}>
                        {selected.pe}%
                    </div>
                    <div className="mew-card__label">Performance Efficiency</div>
                    <div className="mew-card__bar">
                        <div
                            className="mew-card__fill"
                            style={{
                                width: `${Math.min(100, selected.pe)}%`,
                                background: peColor(selected.pe)
                            }}
                        />
                    </div>
                    <div className="mew-card__stats">
                        <span>
                            Normal <b className="mew-card__ok">{formatKg(selected.gWt)}</b>
                        </span>
                        <span>
                            Abnormal <b className="mew-card__bad">{formatKg(selected.nWt)}</b>
                        </span>
                        <span>
                            Bobbins{' '}
                            <b className="mew-card__neutral">
                                {formatNum(selected.gCnt + selected.nCnt)}
                            </b>
                        </span>
                        <span>
                            C/O{' '}
                            <b className="mew-card__neutral">{formatNum(selected.coMin)} min</b>
                        </span>
                    </div>
                </article>
            ) : null}
        </main>
    );
}

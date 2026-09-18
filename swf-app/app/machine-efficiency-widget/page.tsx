'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
const STORAGE_PROCESS = 'me-widget-process';
const STORAGE_MACHINE = 'me-widget-machine';

function todayYmd(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readStoredProcess(): ProcessCd {
    if (typeof window === 'undefined') return 'DRAWING';
    const q = new URLSearchParams(window.location.search).get('process');
    if (q === 'DRAWING' || q === 'STRANDING') return q;
    const s = localStorage.getItem(STORAGE_PROCESS);
    return s === 'STRANDING' ? 'STRANDING' : 'DRAWING';
}

function readStoredMachine(): string {
    if (typeof window === 'undefined') return '';
    const q = new URLSearchParams(window.location.search).get('machine');
    if (q) return q;
    return localStorage.getItem(STORAGE_MACHINE) || '';
}

export default function MachineEfficiencyWidgetPage() {
    const [process, setProcess] = useState<ProcessCd>('DRAWING');
    const [machine, setMachine] = useState('');
    const [runs, setRuns] = useState<ProductionRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setProcess(readStoredProcess());
        setMachine(readStoredMachine());
        setHydrated(true);
    }, []);

    const dateYmd = todayYmd();

    const load = useCallback(
        async (silent = false) => {
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
        [process, dateYmd]
    );

    useEffect(() => {
        if (!hydrated) return;
        void load(false);
        const id = window.setInterval(() => void load(true), AUTO_REFRESH_MS);
        return () => window.clearInterval(id);
    }, [hydrated, load]);

    useEffect(() => {
        if (!hydrated) return;
        localStorage.setItem(STORAGE_PROCESS, process);
    }, [hydrated, process]);

    useEffect(() => {
        if (!hydrated || !machine) return;
        localStorage.setItem(STORAGE_MACHINE, machine);
    }, [hydrated, machine]);

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
    const machineNames = useMemo(() => machines.map((m) => m.name), [machines]);

    useEffect(() => {
        if (!hydrated || machineNames.length === 0) return;
        if (!machine || !machineNames.includes(machine)) {
            setMachine(machineNames[0]);
        }
    }, [hydrated, machineNames, machine]);

    const selected = machines.find((m) => m.name === machine) ?? null;

    function onProcessChange(next: ProcessCd) {
        setProcess(next);
        setMachine('');
    }

    return (
        <main className="mew">
            <div className="mew__toolbar">
                <div className="mew__field">
                    <label className="mew__label" htmlFor="mew-process">
                        Process
                    </label>
                    <select
                        id="mew-process"
                        className="mew__select"
                        value={process}
                        onChange={(e) => onProcessChange(e.target.value as ProcessCd)}
                    >
                        <option value="DRAWING">Drawing</option>
                        <option value="STRANDING">Stranding</option>
                    </select>
                </div>
                <div className="mew__field">
                    <label className="mew__label" htmlFor="mew-machine">
                        Machine
                    </label>
                    <select
                        id="mew-machine"
                        className="mew__select"
                        value={machine}
                        onChange={(e) => setMachine(e.target.value)}
                        disabled={machineNames.length === 0}
                    >
                        {machineNames.length === 0 ? (
                            <option value="">No machines</option>
                        ) : (
                            machineNames.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))
                        )}
                    </select>
                </div>
            </div>

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

            {!error && !loading && !selected ? (
                <p className="mew__empty">No production for this process today.</p>
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
                            Normal{' '}
                            <b className="mew-card__ok">{formatKg(selected.gWt)}</b>
                        </span>
                        <span>
                            Abnormal{' '}
                            <b className="mew-card__bad">{formatKg(selected.nWt)}</b>
                        </span>
                        <span>
                            Bobbins <b className="mew-card__neutral">{formatNum(selected.gCnt + selected.nCnt)}</b>
                        </span>
                        <span>
                            C/O <b className="mew-card__neutral">{formatNum(selected.coMin)} min</b>
                        </span>
                    </div>
                </article>
            ) : null}
        </main>
    );
}

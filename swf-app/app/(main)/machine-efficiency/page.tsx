'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from 'primereact/calendar';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import {
    calcMachines,
    calcOverview,
    calcShift,
    diffMin,
    filterRuns,
    formatKg,
    formatNum,
    formatTime
} from '@/lib/machine-efficiency/aggregate';
import { fetchEfficiencyBundle } from '@/lib/machine-efficiency/efficiencyClient';
import { peColor, peZone } from '@/lib/machine-efficiency/peStyle';
import type { ProcessCd, ProductionRun, ShiftFilter, StrandType } from '@/lib/machine-efficiency/types';
import './machine-efficiency.css';

type TabKey = 'overview' | 'machines';

/** Same cadence as parts-board roller auto-refresh. */
const EFFICIENCY_AUTO_REFRESH_MS = 30_000;

function toYmd(d: Date | null): string {
    if (!d) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayLocal(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function peTone(v: number): string {
    const z = peZone(v);
    return z === 'low' ? 'low' : z === 'mid' ? 'mid' : 'ok';
}

export default function MachineEfficiencyPage() {
    const [tab, setTab] = useState<TabKey>('overview');
    const [process, setProcess] = useState<ProcessCd>('DRAWING');
    const [strandType, setStrandType] = useState<StrandType>('all');
    const [dateFrom, setDateFrom] = useState<Date | null>(() => todayLocal());
    const [dateTo, setDateTo] = useState<Date | null>(() => todayLocal());
    const [shift, setShift] = useState<ShiftFilter>('all');
    const [operator, setOperator] = useState('all');
    const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    const [runs, setRuns] = useState<ProductionRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
    const hasDataRef = useRef(false);

    const loadBundle = useCallback(
        async (opts: { silent?: boolean; signal?: AbortSignal; resetView?: boolean }) => {
            const from = toYmd(dateFrom);
            const to = toYmd(dateTo);
            if (!from || !to) return;

            const silent = !!opts.silent;
            if (!silent) {
                setLoading(true);
                setLoadError(null);
            }

            try {
                const data = await fetchEfficiencyBundle({
                    process,
                    dateFrom: from,
                    dateTo: to,
                    signal: opts.signal
                });
                if (opts.signal?.aborted) return;

                const next = Array.isArray(data.runs) ? data.runs : [];
                setRuns(next);
                hasDataRef.current = true;
                setLoadError(null);
                setLastSyncAt(new Date());

                if (opts.resetView) {
                    setOperator('all');
                    setSelectedMachine(null);
                    setExpandedKey(null);
                }
            } catch (err: unknown) {
                if (opts.signal?.aborted) return;
                const msg = err instanceof Error ? err.message : 'Failed to load efficiency data';
                setRuns([]);
                hasDataRef.current = false;
                setLoadError(msg);
            } finally {
                if (!silent && !opts.signal?.aborted) setLoading(false);
            }
        },
        [process, dateFrom, dateTo]
    );

    useEffect(() => {
        const ac = new AbortController();
        hasDataRef.current = false;
        void loadBundle({ silent: false, signal: ac.signal, resetView: true });

        const id = window.setInterval(() => {
            void loadBundle({ silent: true, signal: ac.signal });
        }, EFFICIENCY_AUTO_REFRESH_MS);

        return () => {
            ac.abort();
            window.clearInterval(id);
        };
    }, [loadBundle]);

    const baseRuns = runs;

    const operators = useMemo(() => {
        const names = new Set(baseRuns.filter((r) => r.process === process).map((r) => r.operator));
        return ['all', ...Array.from(names).sort()];
    }, [baseRuns, process]);

    const filtered = useMemo(
        () =>
            filterRuns(baseRuns, {
                process,
                strandType,
                dateFrom: toYmd(dateFrom) || toYmd(todayLocal()),
                dateTo: toYmd(dateTo) || toYmd(todayLocal()),
                shift,
                operator
            }),
        [baseRuns, process, strandType, dateFrom, dateTo, shift, operator]
    );

    const overview = useMemo(() => calcOverview(filtered), [filtered]);
    const dayShift = useMemo(() => calcShift(filtered, 'Day'), [filtered]);
    const nightShift = useMemo(() => calcShift(filtered, 'Night'), [filtered]);
    const machines = useMemo(() => calcMachines(filtered), [filtered]);

    const processLabel = process === 'DRAWING' ? 'Drawing' : 'Stranding';
    const dateLabel =
        toYmd(dateFrom) === toYmd(dateTo)
            ? toYmd(dateFrom)
            : `${toYmd(dateFrom)} → ${toYmd(dateTo)}`;

    const abnormals = useMemo(
        () =>
            filtered
                .filter((r) => r.nc === 'ABNORMAL')
                .sort((a, b) => b.start.localeCompare(a.start))
                .slice(0, 8),
        [filtered]
    );

    const selectedAgg = selectedMachine
        ? machines.find((m) => m.name === selectedMachine) ?? null
        : null;

    const runRows = useMemo(() => {
        if (selectedMachine) {
            return filtered
                .filter((r) => r.machine === selectedMachine)
                .sort((a, b) => a.start.localeCompare(b.start));
        }
        return [...filtered].sort((a, b) => b.start.localeCompare(a.start));
    }, [filtered, selectedMachine]);

    const totalGWt = machines.reduce((s, m) => s + m.gWt, 0);
    const totalNWt = machines.reduce((s, m) => s + m.nWt, 0);
    const floorAbnRate =
        totalGWt + totalNWt > 0
            ? ((totalNWt / (totalGWt + totalNWt)) * 100).toFixed(1)
            : '0.0';

    function onProcessChange(v: ProcessCd) {
        setProcess(v);
        setStrandType('all');
        setOperator('all');
        setSelectedMachine(null);
        setExpandedKey(null);
    }

    function toggleExpand(r: ProductionRun) {
        const key = `${r.bobbin}|${r.machine}|${r.start}`;
        setExpandedKey((prev) => (prev === key ? null : key));
    }

    function renderRunTable() {
        const body: React.ReactNode[] = [];

        runRows.forEach((r, i) => {
            const key = `${r.bobbin}|${r.machine}|${r.start}`;
            const isAbn = r.nc === 'ABNORMAL';
            const callCount = r.calls?.length ?? 0;

            body.push(
                <tr
                    key={key}
                    className={`brow${expandedKey === key ? ' expanded' : ''}`}
                    onClick={() => toggleExpand(r)}
                >
                    <td>
                        <b style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem' }}>
                            {r.bobbin}
                        </b>
                    </td>
                    <td style={{ fontSize: '0.72rem' }}>{r.machine}</td>
                    <td style={{ fontSize: '0.7rem' }}>{formatTime(r.start)}</td>
                    <td style={{ fontSize: '0.7rem' }}>{formatTime(r.end)}</td>
                    <td style={{ fontSize: '0.7rem' }}>{r.matDes}</td>
                    <td className="r">{r.speed}</td>
                    <td className="r">{formatNum(r.orderLen)} m</td>
                    <td className="r">{formatNum(r.prodLen)} m</td>
                    <td className="r">{r.prodWt} kg</td>
                    <td className="r">{r.expTimeMin}m</td>
                    <td className="r">{r.actTimeMin}m</td>
                    <td>
                        <span className={`me-pill ${isAbn ? 'nc' : 'complete'}`}>
                            {isAbn ? 'ABNORMAL' : 'NORMAL'}
                        </span>
                        {(isAbn || r.abnormal) && (
                            <span className="me-ci" title="Abnormal">
                                ⚠
                            </span>
                        )}
                        {r.procFlag && (
                            <span
                                className="me-ci"
                                style={{ color: '#dc2626', fontWeight: 800 }}
                                title="Actual time under 50% of expected — possible procedure bypass"
                            >
                                !
                            </span>
                        )}
                        {callCount > 0 && (
                            <span
                                className="me-ci"
                                style={{ color: '#b45309' }}
                                title={`${callCount} machine call(s)`}
                            >
                                🔔 {callCount}
                            </span>
                        )}
                    </td>
                    <td className={`r me-pe ${peTone(r.pe)}`}>{r.pe}%</td>
                </tr>
            );

            if (expandedKey === key) {
                body.push(
                    <tr key={`${key}-d`}>
                        <td colSpan={13} className="me-dcell" onClick={(e) => e.stopPropagation()}>
                            <div className="me-tl">
                                {r.nc === 'ABNORMAL' && (
                                    <div className="me-tli abn">
                                        <span className="me-tld" />
                                        <div className="me-tlb">
                                            <b>Abnormal — {r.abnormal || 'Short length'}</b>
                                            <span>
                                                Produced {formatNum(r.prodLen)} m of {formatNum(r.orderLen)} m
                                                target
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {r.abnormal && r.nc !== 'ABNORMAL' && (
                                    <div className="me-tli abn">
                                        <span className="me-tld" />
                                        <div className="me-tlb">
                                            <b>Note</b>
                                            <span>{r.abnormal}</span>
                                        </div>
                                    </div>
                                )}
                                {(r.calls ?? []).map((c, idx) => (
                                    <div className="me-tli call" key={idx}>
                                        <span className="me-tld" />
                                        <div className="me-tlb">
                                            <b>
                                                {formatTime(c.callTime)} — {c.reason}
                                            </b>
                                            <span>
                                                {[
                                                    c.remark && `Call: ${c.remark}`,
                                                    c.handleRemark && `Handle: ${c.handleRemark}`
                                                ]
                                                    .filter(Boolean)
                                                    .join(' · ') || '—'}
                                                {c.caller ? ` · ${c.caller}` : ''}
                                                {c.durMin != null ? ` · ${c.durMin} min` : ''}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {r.nc !== 'ABNORMAL' && !r.abnormal && !(r.calls?.length) && (
                                    <div
                                        style={{
                                            fontSize: '0.68rem',
                                            color: 'var(--me-faint)',
                                            padding: '4px 0'
                                        }}
                                    >
                                        No events logged for this bobbin.
                                    </div>
                                )}
                            </div>
                        </td>
                    </tr>
                );
            }

            if (selectedMachine && i < runRows.length - 1) {
                const next = runRows[i + 1];
                const gap = diffMin(r.end, next.start);
                if (gap > 0) {
                    const calls = [...(r.calls ?? []), ...(next.calls ?? [])].filter(
                        (c) => c.callTime >= r.end && c.callTime <= next.start
                    );
                    body.push(
                        <tr className="me-co-row" key={`${key}-co`}>
                            <td colSpan={13}>
                                <div className="me-co-inner">
                                    <span className="me-pill co">C/O</span>
                                    Changeover · {formatTime(r.end)}–{formatTime(next.start)} · {gap}{' '}
                                    min
                                    {calls.map((c, ci) => (
                                        <span className="me-call-chip" key={ci} title={c.caller || ''}>
                                            🔔 {[c.reason, c.remark].filter(Boolean).join(' — ')}
                                        </span>
                                    ))}
                                </div>
                            </td>
                        </tr>
                    );
                }
            }
        });

        return (
            <div className="me-runs">
                <h3>Production Runs{selectedMachine ? ` — ${selectedMachine}` : ''}</h3>
                <div className="me-btable-wrap">
                    <table className="me-btable">
                        <thead>
                            <tr>
                                <th>Bobbin</th>
                                <th>Machine</th>
                                <th>Start</th>
                                <th>End</th>
                                <th>Material Description</th>
                                <th className="r">Speed</th>
                                <th className="r">Order Len</th>
                                <th className="r">Prod Len</th>
                                <th className="r">Weight</th>
                                <th className="r">Expected</th>
                                <th className="r">Actual</th>
                                <th>Status</th>
                                <th className="r">PE</th>
                            </tr>
                        </thead>
                        <tbody>{body}</tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="me-page">
            <div className="me-top">
                <div className="me-top-row">
                    <h1 className="me-title">Machine Efficiency Dashboard</h1>
                    <div className="me-tabs">
                        <button
                            type="button"
                            className={`me-tab${tab === 'overview' ? ' active' : ''}`}
                            onClick={() => setTab('overview')}
                        >
                            Overview
                        </button>
                        <button
                            type="button"
                            className={`me-tab${tab === 'machines' ? ' active' : ''}`}
                            onClick={() => setTab('machines')}
                        >
                            Machines
                        </button>
                    </div>
                </div>

                <div className="me-filters">
                    <div className="me-field">
                        <label>Process</label>
                        <Dropdown
                            value={process}
                            options={[
                                { label: 'Drawing', value: 'DRAWING' },
                                { label: 'Stranding', value: 'STRANDING' }
                            ]}
                            onChange={(e) => onProcessChange(e.value)}
                        />
                    </div>
                    {process === 'STRANDING' && (
                        <div className="me-field">
                            <label>Type</label>
                            <Dropdown
                                value={strandType}
                                options={[
                                    { label: 'All', value: 'all' },
                                    { label: 'Bucher', value: 'Bucher' },
                                    { label: 'Tubular', value: 'Tubular' }
                                ]}
                                onChange={(e) => setStrandType(e.value)}
                            />
                        </div>
                    )}
                    <div className="me-field">
                        <label>Date from</label>
                        <Calendar
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.value as Date | null)}
                            dateFormat="yy-mm-dd"
                            showIcon
                        />
                    </div>
                    <div className="me-field">
                        <label>Date to</label>
                        <Calendar
                            value={dateTo}
                            onChange={(e) => setDateTo(e.value as Date | null)}
                            dateFormat="yy-mm-dd"
                            showIcon
                        />
                    </div>
                    <div className="me-field">
                        <label>Shift</label>
                        <Dropdown
                            value={shift}
                            options={[
                                { label: 'All', value: 'all' },
                                { label: 'Day (08:00–20:00)', value: 'Day' },
                                { label: 'Night (20:00–08:00)', value: 'Night' }
                            ]}
                            onChange={(e) => setShift(e.value)}
                        />
                    </div>
                    <div className="me-field">
                        <label>Operator</label>
                        <Dropdown
                            value={operator}
                            options={operators.map((o) => ({
                                label: o === 'all' ? 'All' : o,
                                value: o
                            }))}
                            onChange={(e) => setOperator(e.value)}
                        />
                    </div>
                    {loading ? (
                        <Tag value="Loading…" severity="info" />
                    ) : loadError ? (
                        <Tag value="Error" severity="danger" />
                    ) : (
                        <Tag
                            value={
                                lastSyncAt
                                    ? `Live · ${lastSyncAt.toLocaleTimeString()}`
                                    : 'Live SFC'
                            }
                            severity="success"
                        />
                    )}
                </div>
            </div>

            {loading && runs.length === 0 ? (
                <div className="me-loading">
                    <ProgressSpinner style={{ width: '2.5rem', height: '2.5rem' }} strokeWidth="4" />
                </div>
            ) : loadError ? (
                <Message severity="error" className="w-full" text={loadError} />
            ) : (
                <>
            {tab === 'overview' ? (
                <>
                    <div className="me-ov-grid">
                        <div className="me-card">
                            <div className="me-ov-head">OVERALL COMPARISON — {dateLabel}</div>
                            <table className="me-table">
                                <thead>
                                    <tr>
                                        <th>Metric</th>
                                        <th className="r">{processLabel} Process</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="metric">Efficiency (%)</td>
                                        <td className={`r me-pe ${peTone(overview.pe)}`}>{overview.pe}%</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Day Efficiency (%)</td>
                                        <td className={`r me-pe ${peTone(overview.dayPe)}`}>
                                            {overview.dayPe}%
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Night Efficiency (%)</td>
                                        <td className={`r me-pe ${peTone(overview.nightPe)}`}>
                                            {overview.nightPe}%
                                        </td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Total Bobbins</td>
                                        <td className="r">{overview.bobbins}</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Abnormal Bobbins</td>
                                        <td className="r">{overview.abnormal}</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">C/O Events</td>
                                        <td className="r">{overview.coEvents}</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">C/O Loss (min)</td>
                                        <td className="r">{formatNum(overview.coMin)}</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">C/O Loss Rate (%)</td>
                                        <td className="r">{overview.coRate}%</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Avg C/O (min)</td>
                                        <td className="r">{overview.avgCo}</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Prod Length (m)</td>
                                        <td className="r">{formatNum(overview.tLen)}</td>
                                    </tr>
                                    <tr>
                                        <td className="metric">Prod Weight (kg)</td>
                                        <td className="r">{formatNum(overview.tWt)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="me-card me-rank">
                            <h3>Machine Ranking by PE</h3>
                            {machines.length === 0 ? (
                                <p className="me-empty">No machines in range.</p>
                            ) : (
                                machines.map((m) => (
                                    <div className="me-rank-item" key={m.name}>
                                        <span className="me-rank-name">{m.name}</span>
                                        <div className="me-rank-bar-wrap">
                                            <div
                                                className="me-rank-bar"
                                                style={{
                                                    width: `${Math.min(100, m.pe)}%`,
                                                    background: peColor(m.pe)
                                                }}
                                            />
                                        </div>
                                        <span className="me-rank-val" style={{ color: peColor(m.pe) }}>
                                            {m.pe}%
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="me-shift-grid">
                        {[dayShift, nightShift].map((s) => (
                            <div className="me-card" key={s.period}>
                                <div className="me-shift-head">
                                    {s.period} Shift ({s.period === 'Day' ? '08:00–20:00' : '20:00–08:00'})
                                    {s.operators.length > 0 && (
                                        <span className="ops"> — {s.operators.join(', ')}</span>
                                    )}
                                </div>
                                <table className="me-table">
                                    <tbody>
                                        <tr>
                                            <td>Efficiency</td>
                                            <td className={`r me-pe ${peTone(s.pe)}`}>{s.pe}%</td>
                                        </tr>
                                        <tr>
                                            <td>Bobbins</td>
                                            <td className="r">{s.gCnt + s.nCnt}</td>
                                        </tr>
                                        <tr>
                                            <td>Abnormal</td>
                                            <td className="r">{s.nCnt}</td>
                                        </tr>
                                        <tr>
                                            <td>Normal Weight</td>
                                            <td className="r">{formatNum(s.gWt)} kg</td>
                                        </tr>
                                        <tr>
                                            <td>Abnormal Weight</td>
                                            <td className="r">{formatNum(s.nWt)} kg</td>
                                        </tr>
                                        <tr>
                                            <td>C/O Events</td>
                                            <td className="r">{s.coEvents}</td>
                                        </tr>
                                        <tr>
                                            <td>C/O Loss</td>
                                            <td className="r">{formatNum(s.coMin)} min</td>
                                        </tr>
                                        <tr>
                                            <td>Prod Length</td>
                                            <td className="r">{formatNum(s.tLen)} m</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>

                    <div className="me-card me-abn">
                        <h3>Recent Abnormal Events</h3>
                        {abnormals.length === 0 ? (
                            <p className="me-empty">No abnormal events in the selected range.</p>
                        ) : (
                            <table className="me-table">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Machine</th>
                                        <th>Operator</th>
                                        <th>Reason</th>
                                        <th className="r">PE</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {abnormals.map((e) => (
                                        <tr key={`${e.bobbin}-${e.start}`}>
                                            <td style={{ fontSize: '0.76rem' }}>{formatTime(e.start)}</td>
                                            <td style={{ fontSize: '0.76rem' }}>{e.machine}</td>
                                            <td style={{ fontSize: '0.76rem' }}>{e.operator || '—'}</td>
                                            <td style={{ fontSize: '0.76rem' }}>{e.abnormal || '—'}</td>
                                            <td className={`r me-pe ${peTone(e.pe)}`}>{e.pe}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {selectedMachine && selectedAgg ? (
                        <>
                            <button
                                type="button"
                                className="me-back"
                                onClick={() => setSelectedMachine(null)}
                            >
                                ← All Machines
                            </button>
                            <div className="me-mh">
                                <div className="me-mh-left">
                                    <h2>{selectedMachine}</h2>
                                    <div className="sub">{selectedAgg.operators.join(', ') || '—'}</div>
                                </div>
                                <div className="me-mh-kpis">
                                    <div className="me-mh-kpi">
                                        <span className="v" style={{ color: peColor(selectedAgg.pe) }}>
                                            {selectedAgg.pe}%
                                        </span>
                                        <span className="l">PE</span>
                                    </div>
                                    <div className="me-mh-kpi">
                                        <span className="v" style={{ color: 'var(--me-green)' }}>
                                            {formatKg(selectedAgg.gWt)}
                                        </span>
                                        <span className="l">NORMAL</span>
                                    </div>
                                    <div className="me-mh-kpi">
                                        <span className="v" style={{ color: 'var(--me-red)' }}>
                                            {formatKg(selectedAgg.nWt)}
                                        </span>
                                        <span className="l">ABNORMAL</span>
                                    </div>
                                    <div className="me-mh-kpi">
                                        <span className="v">
                                            {(
                                                (selectedAgg.nWt /
                                                    (selectedAgg.gWt + selectedAgg.nWt || 1)) *
                                                100
                                            ).toFixed(1)}
                                            %
                                        </span>
                                        <span className="l">ABNORMAL RATE</span>
                                    </div>
                                    <div className="me-mh-kpi">
                                        <span className="v">{selectedAgg.coMin}</span>
                                        <span className="l">C/O (MIN)</span>
                                    </div>
                                    <div className="me-mh-kpi">
                                        <span className="v">{selectedAgg.gCnt}</span>
                                        <span className="l">NORMAL</span>
                                    </div>
                                    <div className="me-mh-kpi">
                                        <span className="v">{selectedAgg.nCnt}</span>
                                        <span className="l">ABNORMAL</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="me-floor-kpi">
                            <div className="me-fs-kpi">
                                <span className="v" style={{ color: peColor(overview.pe) }}>
                                    {overview.pe}%
                                </span>
                                <span className="l">AVG PERF. EFFICIENCY</span>
                            </div>
                            <div className="me-fs-kpi">
                                <span className="v" style={{ color: 'var(--me-green)' }}>
                                    {formatKg(totalGWt)}
                                </span>
                                <span className="l">NORMAL WEIGHT</span>
                            </div>
                            <div className="me-fs-kpi">
                                <span className="v" style={{ color: 'var(--me-red)' }}>
                                    {formatKg(totalNWt)}
                                </span>
                                <span className="l">ABNORMAL WEIGHT</span>
                            </div>
                            <div className="me-fs-kpi">
                                <span className="v">{floorAbnRate}%</span>
                                <span className="l">ABNORMAL RATE</span>
                            </div>
                            <div className="me-fs-kpi">
                                <span className="v">{overview.bobbins}</span>
                                <span className="l">TOTAL BOBBINS</span>
                            </div>
                            <div className="me-fs-kpi">
                                <span className="v">{overview.coMin} min</span>
                                <span className="l">TOTAL CHANGEOVER</span>
                            </div>
                        </div>
                    )}

                    <div className="me-floor-grid">
                        {machines.map((m) => (
                            <div
                                key={m.name}
                                className={`me-mc${selectedMachine === m.name ? ' selected' : ''}`}
                                onClick={() =>
                                    setSelectedMachine((prev) => (prev === m.name ? null : m.name))
                                }
                            >
                                <div className="me-mc-top">
                                    <b>{m.name}</b>
                                    <div className="me-mc-dot" style={{ background: peColor(m.pe) }} />
                                </div>
                                <div className="me-mc-pe" style={{ color: peColor(m.pe) }}>
                                    {m.pe}%
                                </div>
                                <div className="me-mc-label">Performance Efficiency</div>
                                <div className="me-mc-bar">
                                    <div
                                        className="me-mc-fill"
                                        style={{
                                            width: `${Math.min(100, m.pe)}%`,
                                            background: peColor(m.pe)
                                        }}
                                    />
                                </div>
                                <div className="me-mc-stats">
                                    <span>
                                        Normal{' '}
                                        <b style={{ color: 'var(--me-green)' }}>{formatKg(m.gWt)}</b>
                                    </span>
                                    <span>
                                        Abnormal{' '}
                                        <b style={{ color: 'var(--me-red)' }}>{formatKg(m.nWt)}</b>
                                    </span>
                                    <span>
                                        Bobbins <b>{m.gCnt + m.nCnt}</b>
                                    </span>
                                    <span>
                                        C/O <b>{m.coMin} min</b>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {runRows.length > 0 ? (
                        renderRunTable()
                    ) : (
                        <p className="me-empty" style={{ marginTop: 16 }}>
                            No production runs in the selected range.
                        </p>
                    )}
                </>
            )}
                </>
            )}
        </div>
    );
}

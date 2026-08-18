'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { collectAttentionItems } from '@/lib/roller-monitoring/attentionItems';
import { fetchCmMachines } from '@/lib/roller-monitoring/cmMachineClient';
import { fetchComponents } from '@/lib/roller-monitoring/componentsClient';
import { ROLLER_AUTO_REFRESH_MS, ROLLER_LIVE_TICK_MS } from '@/lib/roller-monitoring/constants';
import { formatRuntimeHms } from '@/lib/roller-monitoring/formatRuntime';
import { applyComponentsToMachines, applyRollersToRegistryMachines, machinesFromRegistry } from '@/lib/roller-monitoring/mergeComponents';
import { getRollerDbTarget } from '@/lib/roller-monitoring/rollerMonitoringDbTarget';
import { fetchRollerDashboard } from '@/lib/roller-monitoring/rollerClient';
import type { MachineDashboard } from '@/lib/roller-monitoring/types';
import './buncher-attention.css';

export default function BuncherAttentionWidgetPage() {
    const [machines, setMachines] = useState<MachineDashboard[]>([]);
    const [syncEpochMs, setSyncEpochMs] = useState(() => Date.now());
    const [nowMs, setNowMs] = useState(() => Date.now());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        const target = getRollerDbTarget();
        try {
            const registry = await fetchCmMachines('STRANDING', 'BUNCHER', target);
            const [rollerData, components] = await Promise.all([
                fetchRollerDashboard(
                    target,
                    { processCd: 'STRANDING', lineCd: 'BUNCHER' },
                    { includeComponents: false }
                ).catch(() => null),
                fetchComponents(target, { processCd: 'STRANDING', lineCd: 'BUNCHER' }).catch(() => [])
            ]);

            const allowed = registry.filter((m) => m.visible);
            let incoming = machinesFromRegistry(allowed);
            if (rollerData) incoming = applyRollersToRegistryMachines(incoming, rollerData.machines);
            incoming = applyComponentsToMachines(incoming, components);

            setMachines(incoming);
            setSyncEpochMs(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load Buncher data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(false);
        const id = window.setInterval(() => void load(true), ROLLER_AUTO_REFRESH_MS);
        return () => window.clearInterval(id);
    }, [load]);

    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), ROLLER_LIVE_TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    const items = useMemo(
        () => collectAttentionItems(machines, syncEpochMs, nowMs, true),
        [machines, syncEpochMs, nowMs]
    );
    const shown = expanded ? items : items.slice(0, 5);

    return (
        <main className="ba-widget">
            <header className="ba-widget__head">
                <span className="ba-widget__title">Need attention</span>
                <span className="ba-widget__sub">Buncher</span>
                <span className="ba-widget__count">{loading ? '…' : items.length}</span>
            </header>
            {error ? <p className="ba-widget__error">{error}</p> : null}
            {!error && !loading && items.length === 0 ? (
                <p className="ba-widget__empty">None</p>
            ) : null}
            {shown.length > 0 ? (
                <ul className="ba-widget__list">
                    {shown.map((item) => (
                        <li key={item.key} className="ba-widget__row">
                            <span className="ba-widget__machine">{item.machineName}</span>
                            <span className="ba-widget__part">{item.label}</span>
                            <span className="ba-widget__pct">{item.pct}%</span>
                            <span className="ba-widget__rt">
                                {formatRuntimeHms(item.runtimeHours)} / {formatRuntimeHms(item.limitHours)}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {items.length > 5 ? (
                <button type="button" className="ba-widget__more" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? 'Show less' : `++${items.length - 5} more`}
                </button>
            ) : null}
        </main>
    );
}

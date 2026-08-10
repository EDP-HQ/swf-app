'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { formatReplaceDt, formatRuntimeHms } from '@/lib/roller-monitoring/formatRuntime';
import {
    fetchGearboxAssets,
    fetchGearboxHistory,
    gearboxLabel,
    insertGearbox,
    setGearboxStatus,
    updateGearboxName,
    type GearboxAssetRow,
    type GearboxHistoryRow
} from '@/lib/roller-monitoring/gearboxClient';
import { getRollerDbTarget, type RollerDbTarget } from '@/lib/roller-monitoring/rollerMonitoringDbTarget';
import './gearbox-master.css';

function statusSeverity(status: string): 'success' | 'warning' | 'danger' | 'info' | 'secondary' {
    if (status === 'IN_USE') return 'success';
    if (status === 'SPARE') return 'info';
    if (status === 'REPAIR') return 'warning';
    if (status === 'RETIRED') return 'secondary';
    return 'danger';
}

function suggestNextGearboxId(rows: GearboxAssetRow[]): string {
    let max = 0;
    for (const r of rows) {
        const m = /^GB(\d+)$/i.exec(r.gearboxId);
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `GB${String(max + 1).padStart(2, '0')}`;
}

/** Buncher stranding gearbox pool only */
const POOL_PROCESS = 'STRANDING' as const;
const POOL_LINE = 'BUNCHER' as const;

export default function GearboxMasterPage() {
    const toast = useRef<Toast>(null);
    const [dbTarget] = useState<RollerDbTarget>(() => getRollerDbTarget());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<GearboxAssetRow[]>([]);
    const [editRow, setEditRow] = useState<GearboxAssetRow | null>(null);
    const [editName, setEditName] = useState('');
    const [saving, setSaving] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRows, setHistoryRows] = useState<GearboxHistoryRow[]>([]);
    const [historyFor, setHistoryFor] = useState<GearboxAssetRow | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addId, setAddId] = useState('');
    const [addName, setAddName] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchGearboxAssets(POOL_PROCESS, POOL_LINE, dbTarget);
            setRows(data);
        } catch (e) {
            setRows([]);
            setError(e instanceof Error ? e.message : 'Load failed');
        } finally {
            setLoading(false);
        }
    }, [dbTarget]);

    useEffect(() => {
        void load();
    }, [load]);

    const counts = useMemo(() => {
        const c = { IN_USE: 0, SPARE: 0, REPAIR: 0, RETIRED: 0 };
        for (const r of rows) {
            if (r.status === 'IN_USE') c.IN_USE += 1;
            else if (r.status === 'SPARE') c.SPARE += 1;
            else if (r.status === 'REPAIR') c.REPAIR += 1;
            else if (r.status === 'RETIRED') c.RETIRED += 1;
        }
        return c;
    }, [rows]);

    const openEdit = (row: GearboxAssetRow) => {
        setEditRow(row);
        setEditName(row.gearboxNm || row.gearboxId);
    };

    const openAdd = () => {
        const next = suggestNextGearboxId(rows);
        setAddId(next);
        setAddName(`Gearbox ${next.replace(/^GB/i, '')}`);
        setAddOpen(true);
    };

    const saveName = async () => {
        if (!editRow || !editName.trim()) return;
        setSaving(true);
        try {
            await updateGearboxName(
                { gearboxId: editRow.gearboxId, gearboxNm: editName.trim() },
                dbTarget
            );
            toast.current?.show({ severity: 'success', summary: 'Name saved', life: 2500 });
            setEditRow(null);
            await load();
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Save failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setSaving(false);
        }
    };

    const saveAdd = async () => {
        const id = addId.trim().toUpperCase();
        if (!id) return;
        if (!/^[A-Z0-9_-]{2,20}$/.test(id)) {
            toast.current?.show({
                severity: 'warn',
                summary: 'Invalid ID',
                detail: 'Use 2–20 letters, numbers, _ or -.',
                life: 4000
            });
            return;
        }
        setSaving(true);
        try {
            await insertGearbox(
                {
                    gearboxId: id,
                    gearboxNm: addName.trim() || id,
                    processCd: POOL_PROCESS,
                    lineCd: POOL_LINE,
                    status: 'SPARE'
                },
                dbTarget
            );
            toast.current?.show({
                severity: 'success',
                summary: 'Gearbox added',
                detail: `${id} → SPARE`,
                life: 3000
            });
            setAddOpen(false);
            await load();
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Add failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setSaving(false);
        }
    };

    const markStatus = async (row: GearboxAssetRow, status: 'SPARE' | 'REPAIR' | 'RETIRED') => {
        if (row.status === 'IN_USE') {
            toast.current?.show({
                severity: 'warn',
                summary: 'Still on a machine',
                detail: 'Swap it off the Buncher board first, then change status here.',
                life: 4500
            });
            return;
        }
        if (
            status === 'RETIRED' &&
            typeof window !== 'undefined' &&
            !window.confirm(`Retire ${row.gearboxId}? It will no longer be available as a spare.`)
        ) {
            return;
        }
        setSaving(true);
        try {
            await setGearboxStatus({ gearboxId: row.gearboxId, status }, dbTarget);
            toast.current?.show({
                severity: 'success',
                summary: `${row.gearboxId} → ${status}`,
                life: 2500
            });
            await load();
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Status update failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setSaving(false);
        }
    };

    const openHistory = async (row: GearboxAssetRow) => {
        setHistoryFor(row);
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const data = await fetchGearboxHistory(POOL_PROCESS, POOL_LINE, row.gearboxId, dbTarget);
            setHistoryRows(data);
        } catch (e) {
            setHistoryRows([]);
            toast.current?.show({
                severity: 'error',
                summary: 'History load failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setHistoryLoading(false);
        }
    };

    return (
        <div className="gb-master">
            <Toast ref={toast} position="top-right" />
            <header className="gb-master__head">
                <div>
                    <p className="gb-master__eyebrow">
                        <Link href="/parts-board">Parts board</Link> / Stranding · Buncher / Gearbox master
                    </p>
                    <h1 className="gb-master__title">Gearbox master</h1>
                    <p className="gb-master__sub">
                        Buncher pool only — add units, rename, spare/repair/retire, lifetime, and mount history.
                    </p>
                </div>
                <div className="gb-master__actions">
                    <Button
                        icon="pi pi-plus"
                        label="Add gearbox"
                        outlined
                        onClick={openAdd}
                        disabled={loading}
                    />
                    <Button icon="pi pi-refresh" rounded outlined loading={loading} onClick={() => void load()} />
                </div>
            </header>

            <div className="gb-master__stats">
                <span>
                    In use <strong>{counts.IN_USE}</strong>
                </span>
                <span>
                    Spare <strong>{counts.SPARE}</strong>
                </span>
                <span>
                    Repair <strong>{counts.REPAIR}</strong>
                </span>
                <span>
                    Retired <strong>{counts.RETIRED}</strong>
                </span>
            </div>

            {error && !loading ? <Message severity="error" text={error} className="mb-3" /> : null}

            {loading ? (
                <div className="gb-master__loading">
                    <ProgressSpinner />
                </div>
            ) : rows.length === 0 ? (
                <div className="gb-master__empty">No gearboxes in the Buncher pool yet.</div>
            ) : (
                <div className="gb-master__table-wrap">
                    <table className="gb-master__table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Status</th>
                                <th>Machine</th>
                                <th>Lifetime</th>
                                <th>Install</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.gearboxId}
                                    className={row.status === 'RETIRED' ? 'gb-master__row--retired' : undefined}
                                >
                                    <td className="gb-mono">{row.gearboxId}</td>
                                    <td>
                                        <button
                                            type="button"
                                            className="gb-master__name-btn"
                                            onClick={() => openEdit(row)}
                                        >
                                            {row.gearboxNm || row.gearboxId}
                                        </button>
                                    </td>
                                    <td>
                                        <Tag value={row.status} severity={statusSeverity(row.status)} rounded />
                                    </td>
                                    <td>{row.currentMachineNm || '—'}</td>
                                    <td>{formatRuntimeHms(row.lifetimeRuntimeSec / 3600)}</td>
                                    <td>
                                        {row.status === 'IN_USE'
                                            ? formatRuntimeHms(row.installRuntimeSec / 3600)
                                            : '—'}
                                    </td>
                                    <td className="gb-master__row-actions">
                                        <Button
                                            icon="pi pi-pencil"
                                            rounded
                                            text
                                            size="small"
                                            tooltip="Edit name"
                                            onClick={() => openEdit(row)}
                                        />
                                        <Button
                                            icon="pi pi-history"
                                            rounded
                                            text
                                            size="small"
                                            tooltip="History"
                                            onClick={() => void openHistory(row)}
                                        />
                                        {row.status === 'REPAIR' ? (
                                            <Button
                                                icon="pi pi-check"
                                                rounded
                                                text
                                                size="small"
                                                severity="success"
                                                tooltip="Mark spare (repaired)"
                                                loading={saving}
                                                onClick={() => void markStatus(row, 'SPARE')}
                                            />
                                        ) : null}
                                        {row.status === 'SPARE' ? (
                                            <Button
                                                icon="pi pi-wrench"
                                                rounded
                                                text
                                                size="small"
                                                severity="warning"
                                                tooltip="Mark repair"
                                                loading={saving}
                                                onClick={() => void markStatus(row, 'REPAIR')}
                                            />
                                        ) : null}
                                        {row.status === 'RETIRED' ? (
                                            <Button
                                                icon="pi pi-replay"
                                                rounded
                                                text
                                                size="small"
                                                severity="success"
                                                tooltip="Restore as spare"
                                                loading={saving}
                                                onClick={() => void markStatus(row, 'SPARE')}
                                            />
                                        ) : null}
                                        {row.status === 'SPARE' || row.status === 'REPAIR' ? (
                                            <Button
                                                icon="pi pi-ban"
                                                rounded
                                                text
                                                size="small"
                                                severity="danger"
                                                tooltip="Retire"
                                                loading={saving}
                                                onClick={() => void markStatus(row, 'RETIRED')}
                                            />
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Dialog
                header="Add gearbox"
                visible={addOpen}
                style={{ width: 'min(92vw, 24rem)' }}
                onHide={() => setAddOpen(false)}
                dismissableMask
            >
                <label className="block mb-2 text-sm font-medium">ID</label>
                <InputText
                    value={addId}
                    onChange={(e) => setAddId(e.target.value.toUpperCase())}
                    className="w-full mb-3 gb-mono"
                    maxLength={20}
                    placeholder="e.g. GB11"
                />
                <label className="block mb-2 text-sm font-medium">Display name</label>
                <InputText
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="w-full mb-3"
                    maxLength={100}
                    placeholder="e.g. Gearbox 11"
                />
                <small className="text-color-secondary block mb-3">
                    New unit is added as SPARE in the Buncher pool.
                </small>
                <div className="flex justify-content-end gap-2">
                    <Button label="Cancel" text onClick={() => setAddOpen(false)} disabled={saving} />
                    <Button
                        label="Add"
                        icon="pi pi-plus"
                        loading={saving}
                        disabled={!addId.trim()}
                        onClick={() => void saveAdd()}
                    />
                </div>
            </Dialog>

            <Dialog
                header={editRow ? `Rename ${editRow.gearboxId}` : 'Rename'}
                visible={!!editRow}
                style={{ width: 'min(92vw, 24rem)' }}
                onHide={() => setEditRow(null)}
                dismissableMask
            >
                <label className="block mb-2 text-sm font-medium">Display name</label>
                <InputText
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full mb-3"
                    maxLength={100}
                    placeholder="e.g. Gearbox A / Unit Red"
                />
                <div className="flex justify-content-end gap-2">
                    <Button label="Cancel" text onClick={() => setEditRow(null)} disabled={saving} />
                    <Button
                        label="Save"
                        icon="pi pi-check"
                        loading={saving}
                        disabled={!editName.trim()}
                        onClick={() => void saveName()}
                    />
                </div>
            </Dialog>

            <Dialog
                header={historyFor ? `History · ${gearboxLabel(historyFor)}` : 'History'}
                visible={historyOpen}
                style={{ width: 'min(96vw, 40rem)' }}
                onHide={() => setHistoryOpen(false)}
                dismissableMask
            >
                {historyLoading ? (
                    <div className="flex justify-content-center p-4">
                        <ProgressSpinner style={{ width: '2.5rem', height: '2.5rem' }} />
                    </div>
                ) : historyRows.length === 0 ? (
                    <p className="text-color-secondary text-sm">No mount history yet.</p>
                ) : (
                    <table className="gb-master__table gb-master__table--hist">
                        <thead>
                            <tr>
                                <th>Machine</th>
                                <th>Mounted</th>
                                <th>Removed</th>
                                <th>Runtime</th>
                                <th>Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyRows.map((h) => (
                                <tr key={h.histId}>
                                    <td>{h.machineNm}</td>
                                    <td>{formatReplaceDt(h.mountDt)}</td>
                                    <td>{h.dismountDt ? formatReplaceDt(h.dismountDt) : '-'}</td>
                                    <td>{formatRuntimeHms(h.runtimeSec / 3600)}</td>
                                    <td>{h.dismountDt ? h.reason || '-' : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Dialog>
        </div>
    );
}

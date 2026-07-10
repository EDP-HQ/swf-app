'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { ProgressBar } from 'primereact/progressbar';
import { ProgressSpinner } from 'primereact/progressspinner';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { Tooltip } from 'primereact/tooltip';
import { CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS, GEARBOX_DEFAULT_LIMIT_HOURS, ROLLER_AUTO_REFRESH_MS, ROLLER_LIVE_TICK_MS } from '@/lib/roller-monitoring/constants';
import { formatReplaceDt, formatRuntimeHms } from '@/lib/roller-monitoring/formatRuntime';
import { RuntimeTimer } from '@/lib/roller-monitoring/RuntimeTimer';
import {
    allComponentLiveSnapshots,
    applySavedAllComponentRuntime,
    liveFixedPartRuntimeHours,
    liveFixedPartStatus
} from '@/lib/roller-monitoring/machineParts';
import {
    applySavedRollerRuntime,
    liveRollerRuntimeHours,
    mergePreservedMachines,
    rollersStoppedTicking
} from '@/lib/roller-monitoring/machineRollers';
import {
    fetchRollerDashboard,
    fetchRollerHistory,
    replaceRoller,
    updateRollerRuntime,
    updateRollerRuntimeLimit,
    type RollerHistoryRow
} from '@/lib/roller-monitoring/rollerClient';
import {
    ADD_PART_CUSTOM,
    COMPONENT_DEFAULT_COMPANY,
    COMPONENT_DEFAULT_FACTORY,
    COMPONENT_PART_OPTIONS,
    componentOptionByKey,
    isComponentRegistered,
    isCustomPartNameTaken,
    missingComponentOptions,
    type AddPartChoice,
    type ComponentPartOption
} from '@/lib/roller-monitoring/componentCatalog';
import { insertComponent, replaceComponent, updateComponentRuntime, updateComponentRuntimeLimit, fetchComponentHistory, type ComponentHistoryRow } from '@/lib/roller-monitoring/componentsClient';
import {
    getRollerDbTarget,
    ROLLER_DEV_MODE_STORAGE_KEY,
    rollerDbTargetLabel,
    setRollerDbTarget,
    type RollerDbTarget
} from '@/lib/roller-monitoring/rollerMonitoringDbTarget';
import { computeRollerStatus, usagePct } from '@/lib/roller-monitoring/rollerStatus';
import type { FixedPartRow, MachineDashboard, MachineFixedPartKey, PartHealthStatus, RollerRow } from '@/lib/roller-monitoring/types';
import './parts-board.css';
import './parts-board.fullscreen.css';

const DB_TARGET_OPTIONS: { label: string; value: RollerDbTarget }[] = [
    { label: 'LOCAL', value: 'local' },
    { label: 'PROD', value: 'production' }
];

const DEV_PASSWORD = '11223344';

const DEV_PASSWORD_HELP =
    'Enter the developer password to unlock the local/production API toggle on this screen.';

type LiveRoller = {
    roller: RollerRow;
    machine: MachineDashboard;
    runtimeHours: number;
    pct: number;
    status: PartHealthStatus;
};

type SelectedPart =
    | { kind: 'roller'; machine: MachineDashboard; roller: RollerRow }
    | { kind: 'fixed'; machine: MachineDashboard; partKey: MachineFixedPartKey; part: FixedPartRow }
    | { kind: 'custom'; machine: MachineDashboard; part: FixedPartRow };

function barColor(pct: number): string {
    if (pct >= 100) return '#ef4444';
    if (pct >= 80) return '#f59e0b';
    return '#22c55e';
}

function statusSeverity(status: PartHealthStatus): 'success' | 'warning' | 'danger' {
    if (status === 'OK') return 'success';
    if (status === 'Due') return 'warning';
    return 'danger';
}

function rowStatusClass(status: PartHealthStatus): string {
    return `pb-fs-row--${status.toLowerCase()}`;
}

function machineSortScore(m: MachineDashboard): number {
    return m.overdueCount * 1000 + m.dueCount * 100;
}

function buildLiveRoller(roller: RollerRow, machine: MachineDashboard, syncEpochMs: number, nowMs: number): LiveRoller {
    const runtimeHours = liveRollerRuntimeHours(roller, machine, syncEpochMs, nowMs);
    const pct = usagePct(runtimeHours, roller.limitHours);
    return {
        roller,
        machine,
        runtimeHours,
        pct,
        status: computeRollerStatus(runtimeHours, roller.limitHours)
    };
}

function rollerRowKey(machineName: string, roller: RollerRow, index: number): string {
    return `${machineName}-${roller.binLocation}-${index}`;
}

function formatPartTypeLabel(part: FixedPartRow): string {
    if (part.partType) return part.partType;
    if (part.partKind === 'gearbox') return 'GEARBOX';
    if (part.partKind === 'skipper_bearing_sf') return 'SF';
    return 'SB';
}

function UsageCell({ pct }: { pct: number }) {
    return (
        <td className="pb-fs-col pb-fs-col--usage">
            <div className="pb-fs-usage">
                <ProgressBar value={Math.min(100, pct)} showValue={false} color={barColor(pct)} />
                <span>{pct}%</span>
            </div>
        </td>
    );
}

function ComponentDetailButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
    return (
        <Button
            icon="pi pi-info-circle"
            rounded
            text
            size="small"
            severity="info"
            aria-label="Component details"
            tooltip="Details"
            disabled={disabled}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        />
    );
}

function ComponentHistoryTable({
    rows,
    loading,
    error
}: {
    rows: ComponentHistoryRow[];
    loading: boolean;
    error: string | null;
}) {
    if (loading) {
        return (
            <div className="pb-comp-history__loading">
                <ProgressSpinner style={{ width: '1.75rem', height: '1.75rem' }} />
            </div>
        );
    }

    if (error) {
        return <Message severity="warn" text={error} className="w-full" />;
    }

    if (rows.length === 0) {
        return <p className="pb-comp-history__empty">No replace history for this component.</p>;
    }

    return (
        <div className="pb-comp-history__wrap">
            <table className="pb-comp-history__table">
                <thead>
                    <tr>
                        <th>Part ID</th>
                        <th>Seq</th>
                        <th>Installed</th>
                        <th>Removed</th>
                        <th>Runtime</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.partId} className={row.isActive ? 'pb-comp-history__row--active' : ''}>
                            <td className="pb-fs-mono">{row.partId}</td>
                            <td className="pb-fs-col--center">{row.partSeq || '—'}</td>
                            <td>{formatReplaceDt(row.replaceDt)}</td>
                            <td>{row.isActive ? '—' : formatReplaceDt(row.dismantleDt)}</td>
                            <td>{formatRuntimeHms(row.runtimeHours)}</td>
                            <td>
                                <Tag
                                    value={row.isActive ? 'Active' : 'Removed'}
                                    severity={row.isActive ? 'success' : 'secondary'}
                                    rounded
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RollerHistoryTable({
    rows,
    loading,
    error
}: {
    rows: RollerHistoryRow[];
    loading: boolean;
    error: string | null;
}) {
    if (loading) {
        return (
            <div className="pb-comp-history__loading">
                <ProgressSpinner style={{ width: '1.75rem', height: '1.75rem' }} />
            </div>
        );
    }

    if (error) {
        return <Message severity="warn" text={error} className="w-full" />;
    }

    if (rows.length === 0) {
        return <p className="pb-comp-history__empty">No replace history for this roller slot.</p>;
    }

    return (
        <div className="pb-comp-history__wrap">
            <table className="pb-comp-history__table">
                <thead>
                    <tr>
                        <th>Roller ID</th>
                        <th>Installed</th>
                        <th>Removed</th>
                        <th>Runtime</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.rollerId || row.replaceDt} className={row.isActive ? 'pb-comp-history__row--active' : ''}>
                            <td className="pb-fs-mono">{row.rollerId || '—'}</td>
                            <td>{formatReplaceDt(row.replaceDt)}</td>
                            <td>{row.isActive ? '—' : formatReplaceDt(row.dismantleDt)}</td>
                            <td>{formatRuntimeHms(row.runtimeHours)}</td>
                            <td>
                                <Tag
                                    value={row.isActive ? 'Active' : 'Removed'}
                                    severity={row.isActive ? 'success' : 'secondary'}
                                    rounded
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function MachineFullscreenView({
    machine,
    syncEpochMs,
    nowMs,
    highlightRollerKey,
    onOpenComponentDetail,
    onOpenRollerDetail
}: {
    machine: MachineDashboard;
    syncEpochMs: number;
    nowMs: number;
    highlightRollerKey: string | null;
    onOpenComponentDetail: (partKey: MachineFixedPartKey | null, part: FixedPartRow) => void;
    onOpenRollerDetail: (roller: RollerRow) => void;
}) {
    const standardRows: { key: MachineFixedPartKey; part: FixedPartRow }[] = [
        { key: 'gearbox', part: machine.gearbox },
        { key: 'skipperFront', part: machine.skipperFront },
        { key: 'skipperBack', part: machine.skipperBack }
    ];
    const componentSubtitle =
        machine.extraParts.length > 0
            ? `Gearbox · SF · SB · +${machine.extraParts.length} more`
            : 'Gearbox · Skipper SF · Skipper SB';

    return (
        <div className="pb-fs-body">
            <div className="pb-fs-block pb-fs-block--components">
                <div className="pb-fs-section pb-fs-section--components">
                    <span>Components</span>
                    <span>{componentSubtitle}</span>
                </div>
                <div className="pb-fs-table-wrap pb-fs-table-wrap--components">
                    <table className="pb-fs-table pb-fs-table--components">
                        <colgroup>
                            <col className="pb-fs-col--num" />
                            <col className="pb-fs-col--part" />
                            <col className="pb-fs-col--part-id" />
                            <col className="pb-fs-col--type" />
                            <col className="pb-fs-col--time" />
                            <col className="pb-fs-col--time" />
                            <col className="pb-fs-col--usage" />
                            <col className="pb-fs-col--date" />
                            <col className="pb-fs-col--status" />
                            <col className="pb-fs-col--edit" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="pb-fs-th--center">#</th>
                                <th>Part</th>
                                <th>Part ID</th>
                                <th>Type</th>
                                <th>Runtime</th>
                                <th>Limit</th>
                                <th>Usage</th>
                                <th>Replaced</th>
                                <th>Status</th>
                                <th className="pb-fs-th--center" aria-label="Details" />
                            </tr>
                        </thead>
                        <tbody>
                            {standardRows.map(({ key, part }) => {
                                const rt = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
                                const pct = usagePct(rt, part.limitHours);
                                const status = liveFixedPartStatus(part, machine, syncEpochMs, nowMs);
                                return (
                                    <tr
                                        key={key}
                                        className={`${rowStatusClass(status)} ${part.partId ? 'pb-fs-row--clickable' : ''}`}
                                        onClick={() => part.partId && onOpenComponentDetail(key, part)}
                                    >
                                        <td className="pb-fs-col pb-fs-col--num pb-fs-col--center">{part.partSeq ?? '—'}</td>
                                        <td className="pb-fs-col pb-fs-col--part font-medium">{part.displayName}</td>
                                        <td className="pb-fs-col pb-fs-col--part-id pb-fs-mono">{part.partId || '—'}</td>
                                        <td className="pb-fs-col pb-fs-col--type">{formatPartTypeLabel(part)}</td>
                                        <td className="pb-fs-col pb-fs-col--time">
                                            <RuntimeTimer
                                                runtimeHours={rt}
                                                ticking={machine.running}
                                                variant="table"
                                            />
                                        </td>
                                        <td className="pb-fs-col pb-fs-col--time pb-fs-runtime">{formatRuntimeHms(part.limitHours)}</td>
                                        <UsageCell pct={pct} />
                                        <td className="pb-fs-col pb-fs-col--date">{formatReplaceDt(part.replaceDt)}</td>
                                        <td className="pb-fs-col pb-fs-col--status">
                                            <Tag value={status} severity={statusSeverity(status)} rounded />
                                        </td>
                                        <td className="pb-fs-col pb-fs-col--edit pb-fs-col--center">
                                            <ComponentDetailButton
                                                disabled={!part.partId}
                                                onClick={() => onOpenComponentDetail(key, part)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                            {machine.extraParts.map((part) => {
                                const rowKey = part.partId || part.displayName;
                                const rt = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
                                const pct = usagePct(rt, part.limitHours);
                                const status = liveFixedPartStatus(part, machine, syncEpochMs, nowMs);
                                return (
                                    <tr
                                        key={rowKey}
                                        className={`${rowStatusClass(status)} ${part.partId ? 'pb-fs-row--clickable' : ''}`}
                                        onClick={() => part.partId && onOpenComponentDetail(null, part)}
                                    >
                                        <td className="pb-fs-col pb-fs-col--num pb-fs-col--center">{part.partSeq ?? '—'}</td>
                                        <td className="pb-fs-col pb-fs-col--part font-medium">{part.displayName}</td>
                                        <td className="pb-fs-col pb-fs-col--part-id pb-fs-mono">{part.partId || '—'}</td>
                                        <td className="pb-fs-col pb-fs-col--type">{formatPartTypeLabel(part)}</td>
                                        <td className="pb-fs-col pb-fs-col--time">
                                            <RuntimeTimer
                                                runtimeHours={rt}
                                                ticking={machine.running}
                                                variant="table"
                                            />
                                        </td>
                                        <td className="pb-fs-col pb-fs-col--time pb-fs-runtime">{formatRuntimeHms(part.limitHours)}</td>
                                        <UsageCell pct={pct} />
                                        <td className="pb-fs-col pb-fs-col--date">{formatReplaceDt(part.replaceDt)}</td>
                                        <td className="pb-fs-col pb-fs-col--status">
                                            <Tag value={status} severity={statusSeverity(status)} rounded />
                                        </td>
                                        <td className="pb-fs-col pb-fs-col--edit pb-fs-col--center">
                                            <ComponentDetailButton
                                                disabled={!part.partId}
                                                onClick={() => onOpenComponentDetail(null, part)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="pb-fs-block pb-fs-block--grow">
                <div className="pb-fs-section pb-fs-section--rollers">
                    <span>Rollers</span>
                    <span>{machine.rollers.length} total</span>
                </div>
                <div className="pb-fs-table-wrap pb-fs-table-wrap--rollers">
                    <table className="pb-fs-table pb-fs-table--rollers">
                        <colgroup>
                            <col className="pb-fs-col--num" />
                            <col className="pb-fs-col--bin" />
                            <col className="pb-fs-col--desc" />
                            <col className="pb-fs-col--time" />
                            <col className="pb-fs-col--time" />
                            <col className="pb-fs-col--usage" />
                            <col className="pb-fs-col--date" />
                            <col className="pb-fs-col--status" />
                            <col className="pb-fs-col--edit" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="pb-fs-th--center">#</th>
                                <th>Bin location</th>
                                <th>Description</th>
                                <th>Runtime</th>
                                <th>Limit</th>
                                <th>Usage</th>
                                <th>Replaced</th>
                                <th>Status</th>
                                <th className="pb-fs-th--center" aria-label="Details" />
                            </tr>
                        </thead>
                        <tbody>
                            {machine.rollers.map((roller, index) => {
                                const rt = liveRollerRuntimeHours(roller, machine, syncEpochMs, nowMs);
                                const pct = usagePct(rt, roller.limitHours);
                                const status = computeRollerStatus(rt, roller.limitHours);
                                const key = rollerRowKey(machine.name, roller, index);
                                const canOpen = Boolean(roller.binLocation);
                                return (
                                    <tr
                                        key={key}
                                        id={key}
                                        className={`${rowStatusClass(status)} ${highlightRollerKey === key ? 'pb-fs-row--highlight' : ''} ${canOpen ? 'pb-fs-row--clickable' : ''}`}
                                        onClick={() => canOpen && onOpenRollerDetail(roller)}
                                    >
                                        <td className="pb-fs-col pb-fs-col--num pb-fs-col--center">{index + 1}</td>
                                        <td className="pb-fs-col pb-fs-col--bin pb-fs-mono">{roller.binLocation || '—'}</td>
                                        <td className="pb-fs-col pb-fs-col--desc">{roller.description || '—'}</td>
                                        <td className="pb-fs-col pb-fs-col--time">
                                            <RuntimeTimer
                                                runtimeHours={rt}
                                                ticking={machine.running && roller.isActive}
                                                variant="table"
                                            />
                                        </td>
                                        <td className="pb-fs-col pb-fs-col--time pb-fs-runtime">{formatRuntimeHms(roller.limitHours)}</td>
                                        <UsageCell pct={pct} />
                                        <td className="pb-fs-col pb-fs-col--date">{formatReplaceDt(roller.replaceDt)}</td>
                                        <td className="pb-fs-col pb-fs-col--status">
                                            <Tag value={status} severity={statusSeverity(status)} rounded />
                                        </td>
                                        <td className="pb-fs-col pb-fs-col--edit pb-fs-col--center">
                                            <ComponentDetailButton
                                                disabled={!canOpen}
                                                onClick={() => onOpenRollerDetail(roller)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function FixedPartTile({
    label,
    shortLabel,
    part,
    machine,
    syncEpochMs,
    nowMs,
    extra = false,
    onSelect
}: {
    label: string;
    shortLabel: string;
    part: FixedPartRow;
    machine: MachineDashboard;
    syncEpochMs: number;
    nowMs: number;
    extra?: boolean;
    onSelect: () => void;
}) {
    const runtimeHours = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
    const pct = usagePct(runtimeHours, part.limitHours);
    const status = liveFixedPartStatus(part, machine, syncEpochMs, nowMs);
    const ticking = machine.running;

    return (
        <button
            type="button"
            className={`pb-comp-tile pb-comp-tile--${status.toLowerCase()} ${ticking ? 'pb-comp-tile--live' : ''} ${extra ? 'pb-comp-tile--extra' : ''}`}
            style={{ '--pb-tile-fill': barColor(pct) } as React.CSSProperties}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            title={`${label} · ${formatRuntimeHms(runtimeHours)} / ${formatRuntimeHms(part.limitHours)} · ${pct}%`}
        >
            <span className="pb-comp-tile__meter" aria-hidden>
                <span className="pb-comp-tile__meter-fill" style={{ height: `${Math.min(100, pct)}%` }} />
            </span>
            <span className="pb-comp-tile__label">{shortLabel}</span>
            <RuntimeTimer runtimeHours={runtimeHours} ticking={ticking} variant="tile" />
            <span className="pb-comp-tile__pct">{pct}%</span>
        </button>
    );
}

function RollerTile({ live, onSelect }: { live: LiveRoller; onSelect: () => void }) {
    const { roller, machine, runtimeHours, pct, status } = live;
    const ticking = machine.running && roller.isActive;

    return (
        <button
            type="button"
            className={`pb-tile pb-tile--${status.toLowerCase()} ${ticking ? 'pb-tile--spin' : ''}`}
            style={{ '--pb-tile-fill': barColor(pct) } as React.CSSProperties}
            onClick={(e) => {
                e.stopPropagation();
                onSelect();
            }}
            title={`${roller.displayName} · ${pct}% · ${formatRuntimeHms(runtimeHours)} · ${ticking ? 'Working' : 'Idle'}`}
        >
            <span className="pb-tile__meter" aria-hidden>
                <span className="pb-tile__meter-fill" style={{ height: `${Math.min(100, pct)}%` }} />
            </span>
            <span className="pb-tile__label">{roller.displayName}</span>
            <RuntimeTimer runtimeHours={runtimeHours} ticking={ticking} variant="tile" />
            <span className="pb-tile__pct">{pct}%</span>
        </button>
    );
}

function MachineCard({
    machine,
    syncEpochMs,
    nowMs,
    search,
    onOpenFullscreen,
    onOpenRoller,
    onOpenFixed,
    onOpenCustom
}: {
    machine: MachineDashboard;
    syncEpochMs: number;
    nowMs: number;
    search: string;
    onOpenFullscreen: () => void;
    onOpenRoller: (live: LiveRoller) => void;
    onOpenFixed: (partKey: MachineFixedPartKey, part: FixedPartRow) => void;
    onOpenCustom: (part: FixedPartRow) => void;
}) {
    const liveRollers = machine.rollers
        .map((r) => buildLiveRoller(r, machine, syncEpochMs, nowMs))
        .filter((lr) => !search || machine.name.toLowerCase().includes(search));

    if (liveRollers.length === 0) return null;

    const cardTone = machine.running ? 'run' : 'idle';

    return (
        <article className={`pb-machine pb-machine--${cardTone}`}>
            <header className="pb-machine__head">
                <h3 className="pb-machine__name">{machine.name}</h3>
                <div className="pb-machine__head-actions">
                    <Button
                        icon="pi pi-window-maximize"
                        rounded
                        text
                        size="small"
                        className="pb-machine__fs-btn"
                        aria-label="Full screen"
                        tooltip="Full screen"
                        onClick={onOpenFullscreen}
                    />
                    <span className={`pb-machine__state ${machine.running ? 'pb-machine__state--run' : ''}`}>
                        <i className={`pi ${machine.running ? 'pi-play-circle' : 'pi-stop-circle'}`} />
                        {machine.running ? 'Run' : 'Stop'}
                    </span>
                </div>
            </header>

            <div className="pb-machine__body">
                <div className="pb-machine__fixed">
                    <FixedPartTile
                        label="Gearbox"
                        shortLabel="Gearbox"
                        part={machine.gearbox}
                        machine={machine}
                        syncEpochMs={syncEpochMs}
                        nowMs={nowMs}
                        onSelect={() => onOpenFixed('gearbox', machine.gearbox)}
                    />
                    <FixedPartTile
                        label="Skipper front"
                        shortLabel="SF"
                        part={machine.skipperFront}
                        machine={machine}
                        syncEpochMs={syncEpochMs}
                        nowMs={nowMs}
                        onSelect={() => onOpenFixed('skipperFront', machine.skipperFront)}
                    />
                    <FixedPartTile
                        label="Skipper back"
                        shortLabel="SB"
                        part={machine.skipperBack}
                        machine={machine}
                        syncEpochMs={syncEpochMs}
                        nowMs={nowMs}
                        onSelect={() => onOpenFixed('skipperBack', machine.skipperBack)}
                    />
                    {machine.extraParts.map((part) => (
                        <FixedPartTile
                            key={part.partId || part.displayName}
                            label={part.displayName}
                            shortLabel={part.partType || part.displayName}
                            part={part}
                            machine={machine}
                            syncEpochMs={syncEpochMs}
                            nowMs={nowMs}
                            extra
                            onSelect={() => onOpenCustom(part)}
                        />
                    ))}
                </div>

                <div className="pb-machine__tiles">
                {liveRollers.map((lr) => (
                    <RollerTile key={rollerRowKey(machine.name, lr.roller, machine.rollers.indexOf(lr.roller))} live={lr} onSelect={() => onOpenRoller(lr)} />
                ))}
                </div>
            </div>
        </article>
    );
}

export default function PartsBoardPage() {
    const toast = useRef<Toast>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [machines, setMachines] = useState<MachineDashboard[]>([]);
    const [lastSync, setLastSync] = useState<string | null>(null);
    const [syncEpochMs, setSyncEpochMs] = useState(Date.now());
    const [nowMs, setNowMs] = useState(Date.now());
    const [search, setSearch] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [dbTarget, setDbTargetUi] = useState<RollerDbTarget>('production');
    const [developerMode, setDeveloperMode] = useState(false);
    const [devPasswordOpen, setDevPasswordOpen] = useState(false);
    const [devPasswordInput, setDevPasswordInput] = useState('');
    const [devPasswordError, setDevPasswordError] = useState<string | null>(null);
    const [fullscreenMachineName, setFullscreenMachineName] = useState<string | null>(null);
    const [highlightRollerKey, setHighlightRollerKey] = useState<string | null>(null);
    const [selectedPart, setSelectedPart] = useState<SelectedPart | null>(null);
    const [limitInput, setLimitInput] = useState(3000);
    const [saving, setSaving] = useState(false);
    const [addComponentOpen, setAddComponentOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addMachineName, setAddMachineName] = useState<string | null>(null);
    const [addPartChoice, setAddPartChoice] = useState<AddPartChoice | null>(null);
    const [addCustomPartName, setAddCustomPartName] = useState('');
    const [addCompany, setAddCompany] = useState(COMPONENT_DEFAULT_COMPANY);
    const [addFactory, setAddFactory] = useState(COMPONENT_DEFAULT_FACTORY);
    const [addLimitHours, setAddLimitHours] = useState(GEARBOX_DEFAULT_LIMIT_HOURS);
    const [componentHistory, setComponentHistory] = useState<ComponentHistoryRow[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [rollerHistory, setRollerHistory] = useState<RollerHistoryRow[]>([]);
    const [rollerHistoryLoading, setRollerHistoryLoading] = useState(false);
    const [rollerHistoryError, setRollerHistoryError] = useState<string | null>(null);
    const machinesRef = useRef<MachineDashboard[]>([]);
    const syncEpochMsRef = useRef(Date.now());

    useEffect(() => {
        machinesRef.current = machines;
    }, [machines]);

    useEffect(() => {
        syncEpochMsRef.current = syncEpochMs;
    }, [syncEpochMs]);

    const loadDashboard = useCallback(async (silent = false, target = getRollerDbTarget()) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const prev = machinesRef.current;
            const syncMs = syncEpochMsRef.current;
            const saveNowMs = Date.now();
            const data = await fetchRollerDashboard(target);

            const savedSecByPartId = new Map<string, number>();
            const savedRollerSecByBin = new Map<string, number>();
            const saveTasks: Promise<void>[] = [];

            for (const newM of data.machines) {
                const oldM = prev.find((p) => p.name === newM.name);
                if (!oldM) continue;

                for (const snap of rollersStoppedTicking(oldM, newM, syncMs, saveNowMs)) {
                    if (!snap.roller.rollerId && !snap.roller.binLocation) continue;
                    savedRollerSecByBin.set(snap.roller.binLocation, snap.runtimeSec);
                    saveTasks.push(
                        updateRollerRuntime(snap.runtimeSec, target, {
                            rollerId: snap.roller.rollerId,
                            binLocation: snap.roller.binLocation
                        })
                    );
                }

                if (!oldM.running || newM.running) continue;

                for (const snap of allComponentLiveSnapshots(oldM, syncMs, saveNowMs)) {
                    if (!snap.part.partId) continue;
                    savedSecByPartId.set(snap.part.partId, snap.runtimeSec);
                    saveTasks.push(
                        updateComponentRuntime(snap.runtimeSec, target, {
                            partId: snap.part.partId,
                            ...(snap.partKey
                                ? { machineName: oldM.name, partKey: snap.partKey }
                                : {})
                        })
                    );
                }
            }

            if (saveTasks.length > 0) {
                try {
                    await Promise.all(saveTasks);
                } catch (saveErr) {
                    toast.current?.show({
                        severity: 'warn',
                        summary: 'Runtime save failed',
                        detail: saveErr instanceof Error ? saveErr.message : undefined,
                        life: 5000
                    });
                }
            }

            let incoming = data.machines;
            if (savedRollerSecByBin.size > 0) {
                incoming = incoming.map((m) => applySavedRollerRuntime(m, savedRollerSecByBin));
            }
            if (savedSecByPartId.size > 0) {
                incoming = incoming.map((m) => applySavedAllComponentRuntime(m, savedSecByPartId));
            }

            const elapsed = (Date.now() - syncMs) / 3_600_000;
            setMachines((prevState) => mergePreservedMachines(incoming, prevState, elapsed));
            setLastSync(data.lastSync);
            setSyncEpochMs(Date.now());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Load failed');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        try {
            if (typeof window !== 'undefined' && sessionStorage.getItem(ROLLER_DEV_MODE_STORAGE_KEY) === '1') {
                setDeveloperMode(true);
            }
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        setDbTargetUi(getRollerDbTarget());
        loadDashboard(false, getRollerDbTarget());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (developerMode) {
            setDbTargetUi(getRollerDbTarget());
        }
    }, [developerMode]);

    const enableDeveloperMode = useCallback(() => {
        try {
            sessionStorage.setItem(ROLLER_DEV_MODE_STORAGE_KEY, '1');
        } catch {
            /* ignore */
        }
        setDeveloperMode(true);
    }, []);

    const disableDeveloperMode = useCallback(() => {
        try {
            sessionStorage.removeItem(ROLLER_DEV_MODE_STORAGE_KEY);
        } catch {
            /* ignore */
        }
        setDeveloperMode(false);
        void loadDashboard(true, getRollerDbTarget());
    }, [loadDashboard]);

    const openDevPasswordDialog = useCallback(() => {
        setDevPasswordInput('');
        setDevPasswordError(null);
        setDevPasswordOpen(true);
    }, []);

    const submitDevPassword = useCallback(() => {
        if (devPasswordInput === DEV_PASSWORD) {
            enableDeveloperMode();
            setDevPasswordOpen(false);
            setDevPasswordInput('');
            setDevPasswordError(null);
        } else {
            setDevPasswordError('Incorrect password.');
        }
    }, [devPasswordInput, enableDeveloperMode]);

    const onDevModeButtonClick = useCallback(() => {
        if (developerMode) {
            disableDeveloperMode();
        } else {
            openDevPasswordDialog();
        }
    }, [developerMode, disableDeveloperMode, openDevPasswordDialog]);

    useEffect(() => {
        if (!autoRefresh) return;
        const id = window.setInterval(() => loadDashboard(true, getRollerDbTarget()), ROLLER_AUTO_REFRESH_MS);
        return () => window.clearInterval(id);
    }, [autoRefresh, loadDashboard]);

    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), ROLLER_LIVE_TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (!highlightRollerKey || !fullscreenMachineName) return;
        const t = window.setTimeout(() => {
            document.getElementById(highlightRollerKey)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 300);
        return () => window.clearTimeout(t);
    }, [highlightRollerKey, fullscreenMachineName]);

    const onDbTargetChange = (value: RollerDbTarget) => {
        setDbTargetUi(value);
        setRollerDbTarget(value);
        loadDashboard(true, value);
    };

    const loadComponentHistory = useCallback(
        async (machineName: string, partType: string, target = dbTarget) => {
            setHistoryLoading(true);
            setHistoryError(null);
            try {
                const rows = await fetchComponentHistory(machineName, target, { partType });
                setComponentHistory(rows);
            } catch (e) {
                setComponentHistory([]);
                setHistoryError(e instanceof Error ? e.message : 'Failed to load history');
            } finally {
                setHistoryLoading(false);
            }
        },
        [dbTarget]
    );

    const loadRollerHistory = useCallback(
        async (binLocation: string, target = dbTarget) => {
            setRollerHistoryLoading(true);
            setRollerHistoryError(null);
            try {
                const rows = await fetchRollerHistory(binLocation, target);
                setRollerHistory(rows);
            } catch (e) {
                setRollerHistory([]);
                setRollerHistoryError(e instanceof Error ? e.message : 'Failed to load history');
            } finally {
                setRollerHistoryLoading(false);
            }
        },
        [dbTarget]
    );

    const fullscreenMachine = useMemo(
        () => (fullscreenMachineName ? machines.find((m) => m.name === fullscreenMachineName) ?? null : null),
        [machines, fullscreenMachineName]
    );

    const openMachine = (name: string, rollerKey?: string) => {
        setFullscreenMachineName(name);
        setHighlightRollerKey(rollerKey ?? null);
    };

    const closeFullscreen = () => {
        setFullscreenMachineName(null);
        setHighlightRollerKey(null);
    };

    const openRollerEdit = (machine: MachineDashboard, roller: RollerRow) => {
        setSelectedPart({ kind: 'roller', machine, roller });
        setLimitInput(roller.limitHours);
    };

    const openFixedEdit = (machine: MachineDashboard, partKey: MachineFixedPartKey, part: FixedPartRow) => {
        setSelectedPart({ kind: 'fixed', machine, partKey, part });
        setLimitInput(part.limitHours);
    };

    const openCustomEdit = (machine: MachineDashboard, part: FixedPartRow) => {
        setSelectedPart({ kind: 'custom', machine, part });
        setLimitInput(part.limitHours);
    };

    const openComponentDetail = (
        machine: MachineDashboard,
        partKey: MachineFixedPartKey | null,
        part: FixedPartRow
    ) => {
        if (!part.partId) return;
        if (partKey) openFixedEdit(machine, partKey, part);
        else openCustomEdit(machine, part);
    };

    useEffect(() => {
        if (!selectedPart || selectedPart.kind === 'roller') {
            setComponentHistory([]);
            setHistoryError(null);
            setHistoryLoading(false);
            if (!selectedPart || selectedPart.kind !== 'roller') return;

            const bin = selectedPart.roller.binLocation;
            if (!bin) {
                setRollerHistory([]);
                setRollerHistoryError(null);
                return;
            }
            void loadRollerHistory(bin);
            return;
        }

        setRollerHistory([]);
        setRollerHistoryError(null);
        setRollerHistoryLoading(false);

        const partType = selectedPart.part.partType || formatPartTypeLabel(selectedPart.part);
        if (!selectedPart.part.partId || !partType) {
            setComponentHistory([]);
            setHistoryError(null);
            return;
        }

        void loadComponentHistory(selectedPart.machine.name, partType);
    }, [selectedPart, loadComponentHistory, loadRollerHistory]);

    const closeEdit = () => {
        setSelectedPart(null);
        setComponentHistory([]);
        setHistoryError(null);
        setRollerHistory([]);
        setRollerHistoryError(null);
    };

    const handleSaveLimit = async () => {
        if (!selectedPart) return;

        if (selectedPart.kind === 'roller') {
            if (!selectedPart.roller.rollerId) {
                toast.current?.show({ severity: 'warn', summary: 'No roller ID', life: 4000 });
                return;
            }
            setSaving(true);
            try {
                await updateRollerRuntimeLimit(selectedPart.roller.rollerId, limitInput, dbTarget);
                toast.current?.show({ severity: 'success', summary: 'Limit saved', life: 3000 });
                closeEdit();
                await loadDashboard(true, dbTarget);
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
            return;
        }

        setSaving(true);
        try {
            await updateComponentRuntimeLimit(limitInput, dbTarget, {
                partId: selectedPart.part.partId,
                ...(selectedPart.kind === 'fixed'
                    ? { machineName: selectedPart.machine.name, partKey: selectedPart.partKey }
                    : {})
            });
            toast.current?.show({ severity: 'success', summary: 'Limit saved', life: 3000 });
            const partType = selectedPart.part.partType || formatPartTypeLabel(selectedPart.part);
            if (partType) {
                await loadComponentHistory(selectedPart.machine.name, partType);
            }
            closeEdit();
            await loadDashboard(true, dbTarget);
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

    const handleReplace = async () => {
        if (!selectedPart) return;

        if (selectedPart.kind === 'roller') {
            if (!selectedPart.roller.binLocation) return;
            setSaving(true);
            try {
                await replaceRoller(selectedPart.roller.binLocation, dbTarget);
                toast.current?.show({ severity: 'success', summary: 'Roller replaced', life: 3000 });
                closeEdit();
                await loadDashboard(true, dbTarget);
            } catch (e) {
                toast.current?.show({
                    severity: 'error',
                    summary: 'Replace failed',
                    detail: e instanceof Error ? e.message : undefined,
                    life: 5000
                });
            } finally {
                setSaving(false);
            }
            return;
        }

        setSaving(true);
        try {
            await replaceComponent(selectedPart.machine.name, dbTarget, {
                partId: selectedPart.part.partId,
                ...(selectedPart.kind === 'fixed' ? { partKey: selectedPart.partKey } : {}),
                runtimeLimit: selectedPart.part.limitHours
            });
            toast.current?.show({ severity: 'success', summary: 'Part replaced', life: 3000 });
            closeEdit();
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Replace failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setSaving(false);
        }
    };

    const searchLower = search.trim().toLowerCase();

    const sortedMachines = useMemo(
        () => [...machines].sort((a, b) => machineSortScore(b) - machineSortScore(a) || a.name.localeCompare(b.name)),
        [machines]
    );

    const visibleMachines = useMemo(() => {
        return sortedMachines.filter((machine) => {
            if (!searchLower) return true;
            return machine.name.toLowerCase().includes(searchLower);
        });
    }, [sortedMachines, searchLower]);

    const machineOptions = useMemo(
        () => sortedMachines.map((m) => ({ label: m.name, value: m.name })),
        [sortedMachines]
    );

    const addTargetMachine = useMemo(
        () => (addMachineName ? machines.find((m) => m.name === addMachineName) ?? null : null),
        [machines, addMachineName]
    );

    const addPartOptions = useMemo(() => {
        if (!addTargetMachine) return [];
        return [
            ...COMPONENT_PART_OPTIONS.map((opt) => {
                const registered = isComponentRegistered(addTargetMachine, opt.key);
                return {
                    label: registered ? `${opt.label} (registered)` : opt.label,
                    value: opt.key,
                    disabled: registered
                };
            }),
            { label: 'Other (custom name…)', value: ADD_PART_CUSTOM, disabled: false }
        ];
    }, [addTargetMachine]);

    const addPartAvailable = useMemo(() => {
        if (!addTargetMachine || !addPartChoice) return false;
        if (addPartChoice === ADD_PART_CUSTOM) {
            const name = addCustomPartName.trim();
            return name.length > 0 && name.length <= 20 && !isCustomPartNameTaken(addTargetMachine, name);
        }
        return !isComponentRegistered(addTargetMachine, addPartChoice);
    }, [addTargetMachine, addPartChoice, addCustomPartName]);

    const openAddComponent = () => {
        const firstWithSlot =
            sortedMachines.find((m) => missingComponentOptions(m).length > 0) ?? sortedMachines[0] ?? null;
        const parts = firstWithSlot ? missingComponentOptions(firstWithSlot) : [];
        const firstPart: ComponentPartOption | undefined = parts[0];

        setAddMachineName(firstWithSlot?.name ?? null);
        setAddPartChoice(firstPart?.key ?? ADD_PART_CUSTOM);
        setAddCustomPartName('');
        setAddLimitHours(firstPart?.defaultLimitHours ?? CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS);
        setAddCompany(COMPONENT_DEFAULT_COMPANY);
        setAddFactory(COMPONENT_DEFAULT_FACTORY);
        setAddComponentOpen(true);
    };

    const onAddMachineChange = (name: string | null) => {
        setAddMachineName(name);
        const machine = name ? machines.find((m) => m.name === name) : null;
        if (!machine) {
            setAddPartChoice(null);
            setAddCustomPartName('');
            return;
        }
        const parts = missingComponentOptions(machine);
        const first = parts[0];
        setAddPartChoice(first?.key ?? ADD_PART_CUSTOM);
        setAddCustomPartName('');
        if (first) setAddLimitHours(first.defaultLimitHours);
        else setAddLimitHours(CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS);
    };

    const onAddPartChange = (choice: AddPartChoice | null) => {
        setAddPartChoice(choice);
        if (choice === ADD_PART_CUSTOM) {
            setAddLimitHours(CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS);
            return;
        }
        const opt = choice ? componentOptionByKey(choice) : undefined;
        if (opt) setAddLimitHours(opt.defaultLimitHours);
    };

    const handleAddComponent = async () => {
        if (!addMachineName || !addPartChoice) return;
        setAddSaving(true);
        try {
            if (addPartChoice === ADD_PART_CUSTOM) {
                const name = addCustomPartName.trim();
                if (!name) return;
                await insertComponent(addMachineName, addLimitHours, dbTarget, {
                    partType: name.toUpperCase(),
                    company: addCompany.trim(),
                    factory: addFactory.trim()
                });
            } else {
                await insertComponent(addMachineName, addLimitHours, dbTarget, {
                    partKey: addPartChoice,
                    company: addCompany.trim(),
                    factory: addFactory.trim()
                });
            }
            toast.current?.show({ severity: 'success', summary: 'Component added', life: 3000 });
            setAddComponentOpen(false);
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Add failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setAddSaving(false);
        }
    };

    const lastSyncLabel = lastSync ? new Date(lastSync).toLocaleTimeString() : '—';

    const editTitle =
        selectedPart?.kind === 'roller'
            ? `${selectedPart.machine.name} · ${selectedPart.roller.displayName}`
            : selectedPart?.kind === 'fixed' || selectedPart?.kind === 'custom'
              ? `${selectedPart.machine.name} · ${selectedPart.part.displayName}`
              : 'Edit';

    return (
        <div className="parts-board">
            <Toast ref={toast} />

            <header className="pb-toolbar">
                <span className="pb-toolbar__title">Component monitoring</span>
                <span className="pb-toolbar__meta">
                    {developerMode ? `${rollerDbTargetLabel(dbTarget)} · ` : ''}
                    {lastSyncLabel}
                </span>
                <div className="pb-toolbar__actions">
                    <span className="p-input-icon-left">
                        <i className="pi pi-search" />
                        <InputText
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Machine"
                            className="pb-search"
                        />
                    </span>
                    {developerMode && (
                        <SelectButton
                            value={dbTarget}
                            options={DB_TARGET_OPTIONS}
                            onChange={(e) => {
                                const v = e.value as RollerDbTarget;
                                if (v === 'local' || v === 'production') onDbTargetChange(v);
                            }}
                            optionLabel="label"
                            optionValue="value"
                        />
                    )}
                    <Button
                        id="pb-dev-btn"
                        icon="pi pi-code"
                        rounded
                        outlined
                        severity={developerMode ? 'secondary' : undefined}
                        onClick={onDevModeButtonClick}
                        aria-label={developerMode ? 'Exit developer mode' : 'Developer mode'}
                    />
                    <Tooltip
                        target="#pb-dev-btn"
                        content={
                            developerMode
                                ? 'Exit developer mode (hide LOCAL/PROD toggle)'
                                : 'Developer mode — password required'
                        }
                        position="bottom"
                    />
                    <Button
                        icon="pi pi-plus"
                        rounded
                        outlined
                        disabled={loading || machines.length === 0}
                        onClick={openAddComponent}
                        tooltip="Add component"
                    />
                    <Button
                        icon={autoRefresh ? 'pi pi-clock' : 'pi pi-pause'}
                        rounded
                        outlined
                        severity={autoRefresh ? 'success' : 'secondary'}
                        onClick={() => setAutoRefresh((v) => !v)}
                        tooltip={autoRefresh ? 'Auto-refresh on' : 'Auto-refresh off'}
                    />
                    <Button
                        icon="pi pi-refresh"
                        rounded
                        loading={refreshing}
                        onClick={() => loadDashboard(true, dbTarget)}
                        tooltip="Refresh"
                    />
                </div>
            </header>

            {error && !loading && <Message severity="error" text={error} className="pb-error" />}

            {loading ? (
                <div className="pb-loading">
                    <ProgressSpinner />
                </div>
            ) : visibleMachines.length === 0 ? (
                <div className="pb-empty">No machines match this view</div>
            ) : (
                <div className="pb-machine-grid">
                    {visibleMachines.map((machine) => (
                        <MachineCard
                            key={machine.name}
                            machine={machine}
                            syncEpochMs={syncEpochMs}
                            nowMs={nowMs}
                            search={searchLower}
                            onOpenFullscreen={() => openMachine(machine.name)}
                            onOpenRoller={(lr) => openRollerEdit(machine, lr.roller)}
                            onOpenFixed={(key, part) => openFixedEdit(machine, key, part)}
                            onOpenCustom={(part) => openCustomEdit(machine, part)}
                        />
                    ))}
                </div>
            )}

            <Dialog
                className="pb-fs-dialog"
                header={
                    fullscreenMachine ? (
                        <div className="flex align-items-center gap-2 flex-wrap">
                            <span className="font-semibold">{fullscreenMachine.name}</span>
                            <Tag
                                value={fullscreenMachine.running ? 'RUN' : 'STOP'}
                                severity={fullscreenMachine.running ? 'success' : 'danger'}
                                rounded
                            />
                            <span className="text-sm text-color-secondary">
                                OK {fullscreenMachine.okCount} · Due {fullscreenMachine.dueCount} · Over{' '}
                                {fullscreenMachine.overdueCount}
                            </span>
                        </div>
                    ) : null
                }
                visible={fullscreenMachine !== null}
                onHide={closeFullscreen}
                dismissableMask
                maximizable
                blockScroll
                style={{ width: '96vw', maxWidth: '96vw', height: '92vh', maxHeight: '92vh' }}
                contentStyle={{
                    padding: 0,
                    overflow: 'hidden',
                    flex: '1 1 auto',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0
                }}
            >
                {fullscreenMachine ? (
                    <div className="pb-fs-shell">
                        <MachineFullscreenView
                            machine={fullscreenMachine}
                            syncEpochMs={syncEpochMs}
                            nowMs={nowMs}
                            highlightRollerKey={highlightRollerKey}
                            onOpenComponentDetail={(key, part) => openComponentDetail(fullscreenMachine, key, part)}
                            onOpenRollerDetail={(roller) => openRollerEdit(fullscreenMachine, roller)}
                        />
                        <div className="pb-fs-footer">
                            {3 + fullscreenMachine.extraParts.length} components + {fullscreenMachine.rollers.length}{' '}
                            rollers
                        </div>
                    </div>
                ) : null}
            </Dialog>

            <Dialog
                className="pb-detail-dialog"
                header={editTitle}
                visible={selectedPart !== null}
                style={{
                    width:
                        selectedPart?.kind === 'roller' ||
                        selectedPart?.kind === 'fixed' ||
                        selectedPart?.kind === 'custom'
                            ? 'min(92vw, 40rem)'
                            : 'min(92vw, 26rem)'
                }}
                onHide={closeEdit}
                dismissableMask
            >
                {selectedPart?.kind === 'roller' && (
                    <>
                        <dl className="pb-edit-dl">
                            <dt>Machine</dt>
                            <dd>{selectedPart.machine.name}</dd>
                            <dt>Roller</dt>
                            <dd>{selectedPart.roller.displayName}</dd>
                            <dt>Roller ID</dt>
                            <dd className="pb-fs-mono">{selectedPart.roller.rollerId || '—'}</dd>
                            <dt>Bin</dt>
                            <dd className="pb-fs-mono">{selectedPart.roller.binLocation || '—'}</dd>
                            <dt>Description</dt>
                            <dd>{selectedPart.roller.description || '—'}</dd>
                            <dt>Installed</dt>
                            <dd>{formatReplaceDt(selectedPart.roller.replaceDt)}</dd>
                            <dt>Working</dt>
                            <dd>{selectedPart.roller.isActive ? 'Yes' : 'No'}</dd>
                            <dt>Runtime</dt>
                            <dd>
                                {formatRuntimeHms(
                                    liveRollerRuntimeHours(selectedPart.roller, selectedPart.machine, syncEpochMs, nowMs)
                                )}{' '}
                                / {formatRuntimeHms(selectedPart.roller.limitHours)}
                            </dd>
                            <dt>Status</dt>
                            <dd>
                                <Tag
                                    value={computeRollerStatus(
                                        liveRollerRuntimeHours(
                                            selectedPart.roller,
                                            selectedPart.machine,
                                            syncEpochMs,
                                            nowMs
                                        ),
                                        selectedPart.roller.limitHours
                                    )}
                                    severity={statusSeverity(
                                        computeRollerStatus(
                                            liveRollerRuntimeHours(
                                                selectedPart.roller,
                                                selectedPart.machine,
                                                syncEpochMs,
                                                nowMs
                                            ),
                                            selectedPart.roller.limitHours
                                        )
                                    )}
                                    rounded
                                />
                            </dd>
                        </dl>
                        <label className="block mb-2 text-sm font-medium">Runtime limit (hours)</label>
                        <InputNumber
                            value={limitInput}
                            onValueChange={(e) => setLimitInput(e.value ?? 0)}
                            min={1}
                            className="w-full mb-3"
                            disabled={!selectedPart.roller.rollerId}
                        />
                        <div className="pb-edit-actions mb-4">
                            <Button
                                icon="pi pi-save"
                                label="Save limit"
                                loading={saving}
                                onClick={handleSaveLimit}
                                disabled={!selectedPart.roller.rollerId}
                            />
                            <Button
                                icon="pi pi-replay"
                                label="Replace"
                                severity="danger"
                                outlined
                                loading={saving}
                                onClick={handleReplace}
                                disabled={!selectedPart.roller.binLocation}
                            />
                        </div>
                        <div className="pb-comp-history">
                            <div className="pb-comp-history__head">
                                <span className="font-semibold text-sm">Replace history</span>
                                <Button
                                    icon="pi pi-refresh"
                                    rounded
                                    text
                                    size="small"
                                    loading={rollerHistoryLoading}
                                    disabled={!selectedPart.roller.binLocation}
                                    onClick={() => {
                                        if (selectedPart.roller.binLocation) {
                                            void loadRollerHistory(selectedPart.roller.binLocation);
                                        }
                                    }}
                                    aria-label="Refresh history"
                                />
                            </div>
                            <RollerHistoryTable
                                rows={rollerHistory}
                                loading={rollerHistoryLoading}
                                error={rollerHistoryError}
                            />
                        </div>
                    </>
                )}
                {selectedPart?.kind === 'fixed' || selectedPart?.kind === 'custom' ? (
                    <>
                        <dl className="pb-edit-dl">
                            <dt>Machine</dt>
                            <dd>{selectedPart.machine.name}</dd>
                            <dt>Part</dt>
                            <dd>{selectedPart.part.displayName}</dd>
                            <dt>Part ID</dt>
                            <dd className="pb-fs-mono">{selectedPart.part.partId || '—'}</dd>
                            <dt>Type</dt>
                            <dd>{formatPartTypeLabel(selectedPart.part)}</dd>
                            <dt>Seq</dt>
                            <dd>{selectedPart.part.partSeq ?? '—'}</dd>
                            <dt>Installed</dt>
                            <dd>{formatReplaceDt(selectedPart.part.replaceDt)}</dd>
                            <dt>Runtime</dt>
                            <dd>
                                {formatRuntimeHms(
                                    liveFixedPartRuntimeHours(
                                        selectedPart.part,
                                        selectedPart.machine,
                                        syncEpochMs,
                                        nowMs
                                    )
                                )}{' '}
                                / {formatRuntimeHms(selectedPart.part.limitHours)}
                            </dd>
                            <dt>Status</dt>
                            <dd>
                                <Tag
                                    value={liveFixedPartStatus(
                                        selectedPart.part,
                                        selectedPart.machine,
                                        syncEpochMs,
                                        nowMs
                                    )}
                                    severity={statusSeverity(
                                        liveFixedPartStatus(
                                            selectedPart.part,
                                            selectedPart.machine,
                                            syncEpochMs,
                                            nowMs
                                        )
                                    )}
                                    rounded
                                />
                            </dd>
                        </dl>
                        <label className="block mb-2 text-sm font-medium">Runtime limit (hours)</label>
                        <InputNumber
                            value={limitInput}
                            onValueChange={(e) => setLimitInput(e.value ?? 0)}
                            min={1}
                            className="w-full mb-3"
                            disabled={!selectedPart.part.partId}
                        />
                        <div className="pb-edit-actions mb-4">
                            <Button
                                icon="pi pi-save"
                                label="Save limit"
                                loading={saving}
                                onClick={handleSaveLimit}
                                disabled={!selectedPart.part.partId}
                            />
                            <Button
                                icon="pi pi-replay"
                                label="Replace"
                                severity="danger"
                                outlined
                                loading={saving}
                                onClick={handleReplace}
                                disabled={!selectedPart.part.partId}
                            />
                        </div>
                        <div className="pb-comp-history">
                            <div className="pb-comp-history__head">
                                <span className="font-semibold text-sm">Replace history</span>
                                <Button
                                    icon="pi pi-refresh"
                                    rounded
                                    text
                                    size="small"
                                    loading={historyLoading}
                                    disabled={!selectedPart.part.partType}
                                    onClick={() => {
                                        const partType =
                                            selectedPart.part.partType || formatPartTypeLabel(selectedPart.part);
                                        if (partType) {
                                            void loadComponentHistory(selectedPart.machine.name, partType);
                                        }
                                    }}
                                    aria-label="Refresh history"
                                />
                            </div>
                            <ComponentHistoryTable
                                rows={componentHistory}
                                loading={historyLoading}
                                error={historyError}
                            />
                        </div>
                    </>
                ) : null}
            </Dialog>

            <Dialog
                className="pb-add-dialog"
                header="Add component"
                visible={addComponentOpen}
                style={{ width: 'min(92vw, 28rem)' }}
                onHide={() => setAddComponentOpen(false)}
                dismissableMask
            >
                <div className="flex flex-column gap-3">
                    <div>
                        <label className="block mb-2 text-sm font-medium">Machine</label>
                        <Dropdown
                            value={addMachineName}
                            options={machineOptions}
                            onChange={(e) => onAddMachineChange(e.value as string | null)}
                            placeholder="Select machine"
                            className="w-full"
                            filter
                            filterPlaceholder="Search machine"
                        />
                    </div>
                    <div>
                        <label className="block mb-2 text-sm font-medium">Part</label>
                        <Dropdown
                            value={addPartChoice}
                            options={addPartOptions}
                            optionDisabled="disabled"
                            onChange={(e) => onAddPartChange(e.value as AddPartChoice | null)}
                            placeholder="Select part"
                            className="w-full"
                            disabled={!addTargetMachine}
                        />
                    </div>
                    {addPartChoice === ADD_PART_CUSTOM ? (
                        <div>
                            <label className="block mb-2 text-sm font-medium">Part name</label>
                            <InputText
                                value={addCustomPartName}
                                onChange={(e) => setAddCustomPartName(e.target.value)}
                                placeholder="e.g. Bearing"
                                maxLength={20}
                                className="w-full"
                            />
                            {addCustomPartName.trim() &&
                            addTargetMachine &&
                            isCustomPartNameTaken(addTargetMachine, addCustomPartName) ? (
                                <small className="text-color-secondary block mt-1">
                                    This part name is already registered on this machine.
                                </small>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="grid grid-nogutter gap-3">
                        <div className="col-12 md:col-6">
                            <label className="block mb-2 text-sm font-medium">Company</label>
                            <InputText
                                value={addCompany}
                                onChange={(e) => setAddCompany(e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <div className="col-12 md:col-6">
                            <label className="block mb-2 text-sm font-medium">Factory</label>
                            <InputText
                                value={addFactory}
                                onChange={(e) => setAddFactory(e.target.value)}
                                className="w-full"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block mb-2 text-sm font-medium">Runtime limit (hours)</label>
                        <InputNumber
                            value={addLimitHours}
                            onValueChange={(e) => setAddLimitHours(e.value ?? 0)}
                            min={1}
                            className="w-full"
                        />
                    </div>
                    {addPartChoice !== ADD_PART_CUSTOM &&
                    addPartOptions.filter((o) => o.value !== ADD_PART_CUSTOM && !o.disabled).length === 0 &&
                    addMachineName ? (
                        <Message
                            severity="info"
                            text="Standard parts are registered. Choose “Other (custom name…)” to add bearing or other parts."
                        />
                    ) : null}
                    <div className="flex gap-2 justify-content-end">
                        <Button label="Cancel" text onClick={() => setAddComponentOpen(false)} disabled={addSaving} />
                        <Button
                            label="Add"
                            icon="pi pi-check"
                            loading={addSaving}
                            disabled={!addMachineName || !addPartAvailable || addLimitHours < 1}
                            onClick={handleAddComponent}
                        />
                    </div>
                </div>
            </Dialog>

            <Dialog
                header="Developer tools"
                visible={devPasswordOpen}
                style={{ width: 'min(92vw, 24rem)' }}
                onHide={() => setDevPasswordOpen(false)}
                dismissableMask
                footer={
                    <div className="flex justify-content-end gap-2">
                        <Button
                            type="button"
                            label="Cancel"
                            className="p-button-text"
                            onClick={() => setDevPasswordOpen(false)}
                        />
                        <Button
                            type="button"
                            label="Unlock"
                            icon="pi pi-unlock"
                            onClick={() => void submitDevPassword()}
                        />
                    </div>
                }
                draggable={false}
                resizable={false}
            >
                <p className="mt-0 text-color-secondary line-height-3 mb-3">{DEV_PASSWORD_HELP}</p>
                <label htmlFor="pb-dev-password" className="font-semibold block mb-2">
                    Password
                </label>
                <InputText
                    id="pb-dev-password"
                    type="password"
                    value={devPasswordInput}
                    onChange={(e) => {
                        setDevPasswordInput(e.target.value);
                        setDevPasswordError(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            void submitDevPassword();
                        }
                    }}
                    className="w-full"
                    autoFocus
                />
                {devPasswordError && (
                    <Message severity="error" text={devPasswordError} className="w-full mt-3" />
                )}
            </Dialog>
        </div>
    );
}

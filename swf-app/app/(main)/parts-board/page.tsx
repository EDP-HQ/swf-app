'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { ProgressBar } from 'primereact/progressbar';
import { ProgressSpinner } from 'primereact/progressspinner';
import { SelectButton } from 'primereact/selectbutton';
import { TabPanel, TabView } from 'primereact/tabview';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { Tooltip } from 'primereact/tooltip';
import { CUSTOM_COMPONENT_DEFAULT_LIMIT_HOURS, GEARBOX_DEFAULT_LIMIT_HOURS, ROLLER_AUTO_REFRESH_MS, ROLLER_DEFAULT_LIMIT_HOURS, ROLLER_LIVE_TICK_MS } from '@/lib/roller-monitoring/constants';
import { formatReplaceDt, formatRuntimeHms } from '@/lib/roller-monitoring/formatRuntime';
import { RuntimeTimer } from '@/lib/roller-monitoring/RuntimeTimer';
import {
    allComponentLiveSnapshots,
    applySavedAllComponentRuntime,
    liveFixedPartRuntimeHours,
    liveFixedPartStatus,
    MACHINE_FIXED_PART_KEYS
} from '@/lib/roller-monitoring/machineParts';
import {
    applySavedRollerRuntime,
    liveRollerRuntimeHours,
    mergePreservedMachines,
    rollersStoppedTicking
} from '@/lib/roller-monitoring/machineRollers';
import {
    batchUpdateRollerRuntimeLimits,
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
import {
    fetchComponents,
    fetchComponentsOnoff,
    fetchComponentHistory,
    insertComponent,
    removeComponent,
    replaceComponent,
    updateComponentRuntime,
    updateComponentRuntimeLimit,
    type ComponentHistoryRow
} from '@/lib/roller-monitoring/componentsClient';
import {
    clampCardSize,
    clearBoardLayout,
    emptyBoardLayout,
    loadBoardLayout,
    moveInColumns,
    normalizeColumns,
    saveBoardLayout,
    type BoardLayout,
    type CardSize,
    type DropWhere
} from '@/lib/roller-monitoring/boardLayout';
import { fetchCmMachines, insertCmMachine, setCmMachineVisible } from '@/lib/roller-monitoring/cmMachineClient';
import {
    fetchGearboxAssets,
    gearboxLabel,
    swapGearbox,
    type GearboxAssetRow
} from '@/lib/roller-monitoring/gearboxClient';
import { applyComponentsToMachines, applyRollersToRegistryMachines, machinesFromRegistry } from '@/lib/roller-monitoring/mergeComponents';
import { applyOnoffToMachines } from '@/lib/roller-monitoring/mergeDashboard';
import {
    isBuncherBoard,
    isBuncherMachineName,
    PROCESS_OPTIONS,
    STRAND_LINE_OPTIONS,
    type ProcessCd,
    type StrandLineCd
} from '@/lib/roller-monitoring/processCatalog';
import {
    getRollerDbTarget,
    ROLLER_DEV_MODE_STORAGE_KEY,
    rollerDbTargetLabel,
    setRollerDbTarget,
    type RollerDbTarget
} from '@/lib/roller-monitoring/rollerMonitoringDbTarget';
import { computeRollerStatus, usagePct } from '@/lib/roller-monitoring/rollerStatus';
import {
    plantRunStatus,
    type FixedPartRow,
    type MachineDashboard,
    type MachineFixedPartKey,
    type PartHealthStatus,
    type RollerRow
} from '@/lib/roller-monitoring/types';
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

type AttentionItem = {
    key: string;
    machineName: string;
    label: string;
    runtimeHours: number;
    limitHours: number;
    pct: number;
    open: () => void;
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
    showRollers = true,
    onOpenComponentDetail,
    onOpenRollerDetail
}: {
    machine: MachineDashboard;
    syncEpochMs: number;
    nowMs: number;
    highlightRollerKey: string | null;
    showRollers?: boolean;
    onOpenComponentDetail: (partKey: MachineFixedPartKey | null, part: FixedPartRow) => void;
    onOpenRollerDetail: (roller: RollerRow) => void;
}) {
    const standardRows: { key: MachineFixedPartKey; part: FixedPartRow }[] = (
        [
            { key: 'gearbox', part: machine.gearbox },
            { key: 'skipperFront', part: machine.skipperFront },
            { key: 'skipperBack', part: machine.skipperBack }
        ] as { key: MachineFixedPartKey; part: FixedPartRow }[]
    ).filter((row) => !!row.part.partId);
    const extraRows = machine.extraParts.filter((part) => !!part.partId);
    const componentCount = standardRows.length + extraRows.length;
    const componentSubtitle =
        componentCount === 0 ? 'No components added yet' : `${componentCount} registered`;

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
                            {componentCount === 0 ? (
                                <tr>
                                    <td colSpan={10} className="pb-fs-col text-color-secondary">
                                        No components added yet.
                                    </td>
                                </tr>
                            ) : null}
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
                            {extraRows.map((part) => {
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

            {showRollers ? (
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
            ) : null}
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
    componentsOnly = false,
    size,
    dragging = false,
    dropTarget = false,
    dropWhere = null,
    onOpenFullscreen,
    onOpenRoller,
    onOpenFixed,
    onOpenCustom,
    onHideMachine,
    onDragStartName,
    onDragOverName,
    onDropName,
    onDragEnd,
    onDragPointerDown,
    onDragPointerMove,
    onDragPointerUp,
    onResize
}: {
    machine: MachineDashboard;
    syncEpochMs: number;
    nowMs: number;
    search: string;
    componentsOnly?: boolean;
    size?: CardSize | null;
    dragging?: boolean;
    dropTarget?: boolean;
    dropWhere?: DropWhere | null;
    onOpenFullscreen: () => void;
    onOpenRoller: (live: LiveRoller) => void;
    onOpenFixed: (partKey: MachineFixedPartKey, part: FixedPartRow) => void;
    onOpenCustom: (part: FixedPartRow) => void;
    onHideMachine?: () => void;
    onDragStartName?: (name: string) => void;
    onDragOverName?: (name: string, where: DropWhere) => void;
    onDropName?: (name: string, where: DropWhere) => void;
    onDragEnd?: () => void;
    onDragPointerDown?: (name: string, e: React.PointerEvent) => void;
    onDragPointerMove?: (e: React.PointerEvent) => void;
    onDragPointerUp?: (e: React.PointerEvent) => void;
    onResize?: (size: CardSize, persist?: boolean) => void;
}) {
    const cardRef = useRef<HTMLElement | null>(null);
    const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

    if (search && !machine.name.toLowerCase().includes(search)) return null;

    const liveRollers = componentsOnly
        ? []
        : machine.rollers.map((r) => buildLiveRoller(r, machine, syncEpochMs, nowMs));

    const showFixed = (part: FixedPartRow) => !componentsOnly || !!part.partId;
    const runStatus = plantRunStatus(machine);
    const cardTone = runStatus === 'run' ? 'run' : runStatus === 'not_found' ? 'unknown' : 'idle';
    const hasAnyComponent =
        !!machine.gearbox.partId ||
        !!machine.skipperFront.partId ||
        !!machine.skipperBack.partId ||
        machine.extraParts.length > 0;

    const onResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!onResize || !cardRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = cardRef.current.getBoundingClientRect();
        resizeStart.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onResizePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (!onResize || !resizeStart.current) return;
        const next = clampCardSize({
            w: resizeStart.current.w + (e.clientX - resizeStart.current.x),
            h: resizeStart.current.h + (e.clientY - resizeStart.current.y)
        });
        if (next) onResize(next, false);
    };

    const onResizePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
        if (onResize && resizeStart.current) {
            const next = clampCardSize({
                w: resizeStart.current.w + (e.clientX - resizeStart.current.x),
                h: resizeStart.current.h + (e.clientY - resizeStart.current.y)
            });
            if (next) onResize(next, true);
        }
        resizeStart.current = null;
    };

    return (
        <article
            ref={cardRef}
            data-machine-card={machine.name}
            className={`pb-machine pb-machine--${cardTone}${dragging ? ' pb-machine--dragging' : ''}${dropTarget && dropWhere === 'swap' ? ' pb-machine--drop pb-machine--drop-swap' : ''}${size ? ' pb-machine--sized' : ''}`}
            style={
                size
                    ? { width: size.w, flexBasis: size.w, minHeight: size.h, height: size.h }
                    : undefined
            }
        >
            <header className="pb-machine__head">
                <span
                    className="pb-machine__drag"
                    title="Drag to rearrange or stack"
                    aria-label={`Rearrange ${machine.name}`}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        onDragPointerDown?.(machine.name, e);
                    }}
                    onPointerMove={(e) => onDragPointerMove?.(e)}
                    onPointerUp={(e) => onDragPointerUp?.(e)}
                    onPointerCancel={() => onDragEnd?.()}
                >
                    <i className="pi pi-bars" />
                </span>
                <h3 className="pb-machine__name">{machine.name}</h3>
                <div className="pb-machine__head-actions">
                    {onHideMachine ? (
                        <Button
                            icon="pi pi-times"
                            rounded
                            text
                            size="small"
                            className="pb-machine__fs-btn"
                            aria-label="Remove machine"
                            tooltip="Remove machine from this process"
                            onClick={(e) => {
                                e.stopPropagation();
                                onHideMachine();
                            }}
                        />
                    ) : null}
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
                    <span
                        className={`pb-machine__state${
                            runStatus === 'run'
                                ? ' pb-machine__state--run'
                                : runStatus === 'not_found'
                                  ? ' pb-machine__state--missing'
                                  : ''
                        }`}
                        title={
                            runStatus === 'not_found'
                                ? 'No plant machine with this name — Run/Stop unavailable'
                                : undefined
                        }
                    >
                        <i
                            className={`pi ${
                                runStatus === 'run'
                                    ? 'pi-play-circle'
                                    : runStatus === 'not_found'
                                      ? 'pi-question-circle'
                                      : 'pi-stop-circle'
                            }`}
                        />
                        {runStatus === 'run' ? 'Run' : runStatus === 'not_found' ? 'Not found' : 'Stop'}
                    </span>
                </div>
            </header>

            <div className="pb-machine__body">
                <div className="pb-machine__fixed">
                    {showFixed(machine.gearbox) ? (
                        <FixedPartTile
                            label="Gearbox"
                            shortLabel="Gearbox"
                            part={machine.gearbox}
                            machine={machine}
                            syncEpochMs={syncEpochMs}
                            nowMs={nowMs}
                            onSelect={() => onOpenFixed('gearbox', machine.gearbox)}
                        />
                    ) : null}
                    {showFixed(machine.skipperFront) ? (
                        <FixedPartTile
                            label="Skipper front"
                            shortLabel="SF"
                            part={machine.skipperFront}
                            machine={machine}
                            syncEpochMs={syncEpochMs}
                            nowMs={nowMs}
                            onSelect={() => onOpenFixed('skipperFront', machine.skipperFront)}
                        />
                    ) : null}
                    {showFixed(machine.skipperBack) ? (
                        <FixedPartTile
                            label="Skipper back"
                            shortLabel="SB"
                            part={machine.skipperBack}
                            machine={machine}
                            syncEpochMs={syncEpochMs}
                            nowMs={nowMs}
                            onSelect={() => onOpenFixed('skipperBack', machine.skipperBack)}
                        />
                    ) : null}
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
                    {componentsOnly && !hasAnyComponent ? (
                        <p className="pb-machine__empty-parts">No components yet — use Add component</p>
                    ) : null}
                </div>

                {!componentsOnly ? (
                    <div className="pb-machine__tiles">
                        {liveRollers.length === 0 ? (
                            <p className="pb-machine__empty-parts">
                                {hasAnyComponent
                                    ? 'No rollers linked yet'
                                    : 'No rollers or components yet — use Add component'}
                            </p>
                        ) : (
                            liveRollers.map((lr) => (
                                <RollerTile
                                    key={rollerRowKey(machine.name, lr.roller, machine.rollers.indexOf(lr.roller))}
                                    live={lr}
                                    onSelect={() => onOpenRoller(lr)}
                                />
                            ))
                        )}
                    </div>
                ) : null}
            </div>
            {onResize ? (
                <button
                    type="button"
                    className="pb-machine__resize"
                    aria-label="Resize card"
                    title="Drag to resize"
                    onPointerDown={onResizePointerDown}
                    onPointerMove={onResizePointerMove}
                    onPointerUp={onResizePointerUp}
                    onPointerCancel={onResizePointerUp}
                />
            ) : null}
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
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [bulkMachineFilter, setBulkMachineFilter] = useState('');
    const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
    const [bulkLimitHours, setBulkLimitHours] = useState(ROLLER_DEFAULT_LIMIT_HOURS);
    const [bulkSaving, setBulkSaving] = useState(false);
    const [processCd, setProcessCd] = useState<ProcessCd>('STRANDING');
    const [strandLineCd, setStrandLineCd] = useState<StrandLineCd>('BUNCHER');
    const [addMachineOpen, setAddMachineOpen] = useState(false);
    const [addMachineSaving, setAddMachineSaving] = useState(false);
    const [addMachineNameInput, setAddMachineNameInput] = useState('');
    const [addMachineCompany, setAddMachineCompany] = useState(COMPONENT_DEFAULT_COMPANY);
    const [addMachineFactory, setAddMachineFactory] = useState(COMPONENT_DEFAULT_FACTORY);
    const [hiddenMachinesOpen, setHiddenMachinesOpen] = useState(false);
    const [hiddenMachines, setHiddenMachines] = useState<{ machineName: string; company: string; factory: string }[]>(
        []
    );
    const [hiddenMachinesLoading, setHiddenMachinesLoading] = useState(false);
    const [hideMachineSaving, setHideMachineSaving] = useState(false);
    const [gearboxSpares, setGearboxSpares] = useState<GearboxAssetRow[]>([]);
    const [gearboxCurrent, setGearboxCurrent] = useState<GearboxAssetRow | null>(null);
    const [spareGearboxId, setSpareGearboxId] = useState<string | null>(null);
    const [gearboxPoolLoading, setGearboxPoolLoading] = useState(false);
    const [attentionExpanded, setAttentionExpanded] = useState(false);
    const [layoutColumns, setLayoutColumns] = useState<string[][]>([]);
    const [cardSizes, setCardSizes] = useState<Record<string, CardSize>>({});
    const [savedLayout, setSavedLayout] = useState<BoardLayout>(emptyBoardLayout());
    const [layoutDirty, setLayoutDirty] = useState(false);
    const [dragName, setDragName] = useState<string | null>(null);
    const [dropName, setDropName] = useState<string | null>(null);
    const [dropWhere, setDropWhere] = useState<DropWhere | null>(null);
    const [confirmRemove, setConfirmRemove] = useState<
        null | { kind: 'machine'; name: string } | { kind: 'component' }
    >(null);
    const machinesRef = useRef<MachineDashboard[]>([]);
    const syncEpochMsRef = useRef(Date.now());
    const processCdRef = useRef<ProcessCd>('STRANDING');
    const strandLineCdRef = useRef<StrandLineCd>('BUNCHER');
    /** Bumps on each load / tab change so stale Buncher roller fetches cannot overwrite other processes. */
    const loadGenRef = useRef(0);

    const buncherBoard = isBuncherBoard(processCd, strandLineCd);
    const layoutLineCd = processCd === 'STRANDING' ? strandLineCd : null;

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
        const gen = ++loadGenRef.current;
        try {
            const activeProcess = processCdRef.current;
            const activeLine = activeProcess === 'STRANDING' ? strandLineCdRef.current : null;
            const useBuncher = isBuncherBoard(activeProcess, activeLine);

            // Registry is required. Rollers/components are overlays — soft-fail so machines still show.
            const registry = await fetchCmMachines(activeProcess, activeLine, target);
            if (gen !== loadGenRef.current) return;

            const [rollerData, components, plantOnoff] = await Promise.all([
                useBuncher
                    ? fetchRollerDashboard(
                          target,
                          { processCd: activeProcess, lineCd: activeLine },
                          { includeComponents: false }
                      ).catch((e) => {
                          console.warn('roller overlay failed', e);
                          return null;
                      })
                    : Promise.resolve(null),
                fetchComponents(target, {
                    processCd: activeProcess,
                    lineCd: activeLine
                }).catch((e) => {
                    console.warn('components overlay failed', e);
                    return [];
                }),
                useBuncher
                    ? Promise.resolve(null)
                    : fetchComponentsOnoff(target, {
                          processCd: activeProcess,
                          lineCd: activeLine
                      }).catch(() => null)
            ]);

            if (gen !== loadGenRef.current) return;

            const boardStillMatches =
                processCdRef.current === activeProcess &&
                (activeProcess !== 'STRANDING' || strandLineCdRef.current === activeLine);
            if (!boardStillMatches) return;

            const allowed = registry
                .filter((m) => m.visible)
                .filter((m) => (useBuncher ? true : !isBuncherMachineName(m.machineName)));

            let incoming = machinesFromRegistry(allowed);

            if (useBuncher && rollerData) {
                incoming = applyRollersToRegistryMachines(incoming, rollerData.machines);
            } else if (plantOnoff) {
                incoming = applyOnoffToMachines(incoming, plantOnoff);
            }

            const prev = machinesRef.current;
            const syncMs = syncEpochMsRef.current;
            const saveNowMs = Date.now();
            const savedSecByPartId = new Map<string, number>();
            const savedRollerSecByBin = new Map<string, number>();
            const saveTasks: Promise<void>[] = [];

            for (const newM of incoming) {
                const oldM = prev.find((p) => p.name === newM.name);
                if (!oldM) continue;

                if (useBuncher) {
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
                }

                // Persist install time on Run→Stop and also while still RUN (checkpoint).
                // Otherwise a refresh reloads last-stop RUNTIME_SEC from DB.
                if (!oldM.running) continue;

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

            if (savedRollerSecByBin.size > 0) {
                incoming = incoming.map((m) => applySavedRollerRuntime(m, savedRollerSecByBin));
            }

            incoming = applyComponentsToMachines(incoming, components);

            if (savedSecByPartId.size > 0) {
                incoming = incoming.map((m) => applySavedAllComponentRuntime(m, savedSecByPartId));
            }

            if (gen !== loadGenRef.current) return;
            if (
                processCdRef.current !== activeProcess ||
                (activeProcess === 'STRANDING' && strandLineCdRef.current !== activeLine)
            ) {
                return;
            }

            const elapsed = (Date.now() - syncMs) / 3_600_000;
            setMachines((prevState) => mergePreservedMachines(incoming, prevState, elapsed));
            setLastSync(useBuncher && rollerData ? rollerData.lastSync : new Date().toISOString());
            setSyncEpochMs(Date.now());
        } catch (e) {
            if (gen !== loadGenRef.current) return;
            setError(e instanceof Error ? e.message : 'Load failed');
            setMachines([]);
        } finally {
            if (gen === loadGenRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
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
    }, []);

    useEffect(() => {
        processCdRef.current = processCd;
        strandLineCdRef.current = strandLineCd;
        const saved = loadBoardLayout(processCd, processCd === 'STRANDING' ? strandLineCd : null);
        setSavedLayout(saved);
        setLayoutColumns(saved.columns);
        setCardSizes(saved.sizes);
        setLayoutDirty(false);
        setDragName(null);
        setDropName(null);
        setDropWhere(null);
        setConfirmRemove(null);
        setMachines([]);
        setFullscreenMachineName(null);
        setSelectedPart(null);
        void loadDashboard(false, getRollerDbTarget());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processCd, strandLineCd]);

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
    const fullscreenRunStatus = fullscreenMachine ? plantRunStatus(fullscreenMachine) : null;

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

    const loadGearboxPoolForEdit = useCallback(
        async (machineName: string, partId: string | undefined, target = getRollerDbTarget()) => {
            // Gearbox pool is Stranding / Buncher only
            if (!isBuncherBoard(processCd, strandLineCd)) {
                setGearboxSpares([]);
                setGearboxCurrent(null);
                setSpareGearboxId(null);
                return;
            }
            setGearboxPoolLoading(true);
            try {
                const assets = await fetchGearboxAssets('STRANDING', 'BUNCHER', target);
                const current =
                    assets.find(
                        (a) =>
                            a.status === 'IN_USE' &&
                            (a.currentMachineNm === machineName ||
                                (partId != null &&
                                    partId !== '' &&
                                    (a.currentPartId === partId || a.gearboxId === partId)))
                    ) ?? null;
                const spares = assets.filter((a) => a.status === 'SPARE');
                setGearboxCurrent(current);
                setGearboxSpares(spares);
                setSpareGearboxId(spares[0]?.gearboxId ?? null);
            } catch (e) {
                setGearboxSpares([]);
                setGearboxCurrent(null);
                setSpareGearboxId(null);
                toast.current?.show({
                    severity: 'error',
                    summary: 'Cannot load gearbox pool',
                    detail: e instanceof Error ? e.message : undefined,
                    life: 5000
                });
            } finally {
                setGearboxPoolLoading(false);
            }
        },
        [processCd, strandLineCd]
    );

    const openFixedEdit = (machine: MachineDashboard, partKey: MachineFixedPartKey, part: FixedPartRow) => {
        setSelectedPart({ kind: 'fixed', machine, partKey, part });
        setLimitInput(part.limitHours);
        if (partKey === 'gearbox' || part.partType?.toUpperCase() === 'GEARBOX') {
            void loadGearboxPoolForEdit(machine.name, part.partId);
        } else {
            setGearboxSpares([]);
            setGearboxCurrent(null);
            setSpareGearboxId(null);
        }
    };

    const openCustomEdit = (machine: MachineDashboard, part: FixedPartRow) => {
        setSelectedPart({ kind: 'custom', machine, part });
        setLimitInput(part.limitHours);
        if (part.partType?.toUpperCase() === 'GEARBOX' || part.partKind === 'gearbox') {
            void loadGearboxPoolForEdit(machine.name, part.partId);
        } else {
            setGearboxSpares([]);
            setGearboxCurrent(null);
            setSpareGearboxId(null);
        }
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
        setGearboxSpares([]);
        setGearboxCurrent(null);
        setSpareGearboxId(null);
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

        const isGearbox =
            selectedPart.part.partKind === 'gearbox' ||
            (selectedPart.kind === 'fixed' && selectedPart.partKey === 'gearbox') ||
            selectedPart.part.partType?.toUpperCase() === 'GEARBOX' ||
            selectedPart.part.displayName?.toLowerCase() === 'gearbox';

        // Gearbox must never call sp_Components_Replace (pool swap — Buncher only)
        if (isGearbox) {
            if (!isBuncherBoard(processCd, strandLineCd)) {
                toast.current?.show({
                    severity: 'warn',
                    summary: 'Gearbox swap is only for Stranding → Buncher',
                    life: 4000
                });
                return;
            }

            let mountId = spareGearboxId;
            if (!mountId || gearboxSpares.length === 0) {
                try {
                    const assets = await fetchGearboxAssets('STRANDING', 'BUNCHER', dbTarget);
                    const spares = assets.filter((a) => a.status === 'SPARE');
                    setGearboxSpares(spares);
                    mountId =
                        mountId && spares.some((s) => s.gearboxId === mountId)
                            ? mountId
                            : spares[0]?.gearboxId ?? null;
                    setSpareGearboxId(mountId);
                } catch (e) {
                    toast.current?.show({
                        severity: 'error',
                        summary: 'Cannot load spare gearboxes',
                        detail: e instanceof Error ? e.message : undefined,
                        life: 5000
                    });
                    return;
                }
            }

            if (!mountId) {
                toast.current?.show({
                    severity: 'warn',
                    summary: 'No spare gearbox available',
                    detail: 'Mark a unit as SPARE in Gearbox master first.',
                    life: 5000
                });
                return;
            }

            if (
                typeof window !== 'undefined' &&
                !window.confirm(
                    `Swap gearbox on ${selectedPart.machine.name} with ${mountId}?\nRemoved unit goes to REPAIR. Install runtime resets to 0.`
                )
            ) {
                return;
            }

            setSaving(true);
            try {
                await swapGearbox(
                    {
                        machineName: selectedPart.machine.name,
                        newGearboxId: mountId,
                        processCd: 'STRANDING',
                        lineCd: 'BUNCHER',
                        runtimeLimit: selectedPart.part.limitHours,
                        removedStatus: 'REPAIR'
                    },
                    dbTarget
                );
                toast.current?.show({
                    severity: 'success',
                    summary: 'Gearbox swapped',
                    detail: `${mountId} mounted · previous unit → REPAIR`,
                    life: 4000
                });
                closeEdit();
                await loadDashboard(true, dbTarget);
            } catch (e) {
                toast.current?.show({
                    severity: 'error',
                    summary: 'Gearbox swap failed',
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

    const handleRemoveComponent = async () => {
        if (!selectedPart || selectedPart.kind === 'roller' || !selectedPart.part.partId) return;

        const isGearbox =
            selectedPart.part.partKind === 'gearbox' ||
            (selectedPart.kind === 'fixed' && selectedPart.partKey === 'gearbox') ||
            selectedPart.part.partType?.toUpperCase() === 'GEARBOX';

        setSaving(true);
        try {
            await removeComponent(selectedPart.machine.name, dbTarget, {
                partId: selectedPart.part.partId,
                ...(selectedPart.kind === 'fixed' ? { partKey: selectedPart.partKey } : {})
            });
            toast.current?.show({
                severity: 'success',
                summary: 'Component removed',
                detail: `${selectedPart.part.displayName} removed from ${selectedPart.machine.name}`,
                life: 3500
            });
            closeEdit();
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Remove failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setSaving(false);
        }
    };

    const persistLayout = useCallback(
        (columns: string[][], sizes: Record<string, CardSize>) => {
            const layout: BoardLayout = { columns, order: columns.flat(), sizes };
            saveBoardLayout(processCd, layoutLineCd, layout);
            setSavedLayout(layout);
            setLayoutDirty(false);
        },
        [processCd, layoutLineCd]
    );

    const handleCardReorder = (fromName: string, toName: string, where: DropWhere = 'below') => {
        const healthSorted = [...machines]
            .sort((a, b) => machineSortScore(b) - machineSortScore(a) || a.name.localeCompare(b.name))
            .map((m) => m.name);
        const current = normalizeColumns(healthSorted, layoutColumns);
        setLayoutColumns(moveInColumns(current, fromName, toName, where));
        setLayoutDirty(true);
    };

    const dragSessionRef = useRef<{
        name: string;
        dropName: string | null;
        dropWhere: DropWhere | null;
    } | null>(null);

    const hitTestLayoutDrop = (clientX: number, clientY: number) => {
        const dragging = dragSessionRef.current?.name;
        if (!dragging) return null;
        const stack = document
            .elementFromPoint(clientX, clientY)
            ?.closest('[data-stack-under]') as HTMLElement | null;
        if (stack?.dataset.stackUnder && stack.dataset.stackUnder !== dragging) {
            return { name: stack.dataset.stackUnder, where: 'below' as const };
        }
        const card = document
            .elementFromPoint(clientX, clientY)
            ?.closest('[data-machine-card]') as HTMLElement | null;
        if (card?.dataset.machineCard && card.dataset.machineCard !== dragging) {
            return { name: card.dataset.machineCard, where: 'swap' as const };
        }
        return null;
    };

    const onDragPointerDown = (name: string) => {
        dragSessionRef.current = { name, dropName: null, dropWhere: null };
        setDragName(name);
        setDropName(null);
        setDropWhere(null);
    };

    const onDragPointerMove = (e: React.PointerEvent) => {
        if (!dragSessionRef.current) return;
        const hit = hitTestLayoutDrop(e.clientX, e.clientY);
        dragSessionRef.current.dropName = hit?.name ?? null;
        dragSessionRef.current.dropWhere = hit?.where ?? null;
        setDropName(hit?.name ?? null);
        setDropWhere(hit?.where ?? null);
    };

    const onDragPointerUp = () => {
        const session = dragSessionRef.current;
        dragSessionRef.current = null;
        if (session?.dropName && session.dropWhere) {
            handleCardReorder(session.name, session.dropName, session.dropWhere);
        }
        setDragName(null);
        setDropName(null);
        setDropWhere(null);
    };

    const handleCardResize = (machineName: string, size: CardSize) => {
        setCardSizes((prev) => ({ ...prev, [machineName]: size }));
        setLayoutDirty(true);
    };

    const saveLayoutChanges = () => {
        persistLayout(layoutColumns, cardSizes);
        toast.current?.show({ severity: 'success', summary: 'Layout saved', life: 2500 });
    };

    const discardLayoutChanges = () => {
        setLayoutColumns(savedLayout.columns);
        setCardSizes(savedLayout.sizes);
        setLayoutDirty(false);
    };

    const resetLayoutDefault = () => {
        clearBoardLayout(processCd, layoutLineCd);
        setSavedLayout(emptyBoardLayout());
        setLayoutColumns([]);
        setCardSizes({});
        setLayoutDirty(false);
        toast.current?.show({ severity: 'success', summary: 'Layout reset to default', life: 2500 });
    };

    const searchLower = search.trim().toLowerCase();

    const sortedMachines = useMemo(() => {
        const healthSorted = [...machines].sort(
            (a, b) => machineSortScore(b) - machineSortScore(a) || a.name.localeCompare(b.name)
        );
        const cols = normalizeColumns(
            healthSorted.map((m) => m.name),
            layoutColumns
        );
        const byName = new Map(machines.map((m) => [m.name, m]));
        return cols
            .flat()
            .map((n) => byName.get(n))
            .filter((m): m is MachineDashboard => !!m);
    }, [machines, layoutColumns]);

    const visibleColumns = useMemo(() => {
        const healthSorted = [...machines].sort(
            (a, b) => machineSortScore(b) - machineSortScore(a) || a.name.localeCompare(b.name)
        );
        const cols = normalizeColumns(
            healthSorted.map((m) => m.name),
            layoutColumns
        );
        const byName = new Map(machines.map((m) => [m.name, m]));
        return cols
            .map((col) =>
                col
                    .map((n) => byName.get(n))
                    .filter((m): m is MachineDashboard => !!m)
                    .filter((m) => !searchLower || m.name.toLowerCase().includes(searchLower))
            )
            .filter((col) => col.length > 0);
    }, [machines, layoutColumns, searchLower]);

    const visibleMachines = useMemo(() => visibleColumns.flat(), [visibleColumns]);

    const attentionItems = useMemo(() => {
        const items: AttentionItem[] = [];
        for (const machine of sortedMachines) {
            for (const partKey of MACHINE_FIXED_PART_KEYS) {
                const part = machine[partKey];
                if (!part.partId) continue;
                const runtimeHours = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
                const status = computeRollerStatus(runtimeHours, part.limitHours);
                if (status !== 'Overdue') continue;
                items.push({
                    key: `${machine.name}:fixed:${partKey}:${part.partId}`,
                    machineName: machine.name,
                    label: part.displayName,
                    runtimeHours,
                    limitHours: part.limitHours,
                    pct: usagePct(runtimeHours, part.limitHours),
                    open: () => openFixedEdit(machine, partKey, part)
                });
            }
            for (const part of machine.extraParts ?? []) {
                if (!part.partId) continue;
                const runtimeHours = liveFixedPartRuntimeHours(part, machine, syncEpochMs, nowMs);
                const status = computeRollerStatus(runtimeHours, part.limitHours);
                if (status !== 'Overdue') continue;
                items.push({
                    key: `${machine.name}:custom:${part.partId}`,
                    machineName: machine.name,
                    label: part.displayName,
                    runtimeHours,
                    limitHours: part.limitHours,
                    pct: usagePct(runtimeHours, part.limitHours),
                    open: () => openCustomEdit(machine, part)
                });
            }
            if (buncherBoard) {
                for (const roller of machine.rollers) {
                    const live = buildLiveRoller(roller, machine, syncEpochMs, nowMs);
                    if (live.status !== 'Overdue') continue;
                    items.push({
                        key: `${machine.name}:roller:${roller.binLocation || roller.rollerId || roller.displayName}`,
                        machineName: machine.name,
                        label: roller.displayName,
                        runtimeHours: live.runtimeHours,
                        limitHours: roller.limitHours,
                        pct: live.pct,
                        open: () => openRollerEdit(machine, roller)
                    });
                }
            }
        }
        return items.sort(
            (a, b) => b.runtimeHours / Math.max(b.limitHours, 0.001) - a.runtimeHours / Math.max(a.limitHours, 0.001)
        );
    }, [sortedMachines, syncEpochMs, nowMs, buncherBoard]);

    const machineOptions = useMemo(
        () => sortedMachines.map((m) => ({ label: m.name, value: m.name })),
        [sortedMachines]
    );

    const bulkRollerRows = useMemo(() => {
        const rows: { key: string; machineName: string; roller: RollerRow }[] = [];
        for (const machine of sortedMachines) {
            if (bulkMachineFilter && machine.name !== bulkMachineFilter) continue;
            for (const roller of machine.rollers) {
                if (!roller.rollerId) continue;
                rows.push({
                    key: `${machine.name}::${roller.rollerId}`,
                    machineName: machine.name,
                    roller
                });
            }
        }
        return rows;
    }, [sortedMachines, bulkMachineFilter]);

    const bulkVisibleIds = useMemo(
        () => bulkRollerRows.map((r) => r.roller.rollerId),
        [bulkRollerRows]
    );

    const bulkAllVisibleSelected =
        bulkVisibleIds.length > 0 && bulkVisibleIds.every((id) => bulkSelectedIds.includes(id));

    const openBulkEdit = () => {
        setBulkMachineFilter('');
        setBulkSelectedIds([]);
        setBulkLimitHours(ROLLER_DEFAULT_LIMIT_HOURS);
        setBulkEditOpen(true);
    };

    const openAddMachine = () => {
        setAddMachineNameInput('');
        setAddMachineCompany(COMPONENT_DEFAULT_COMPANY);
        setAddMachineFactory(COMPONENT_DEFAULT_FACTORY);
        setAddMachineOpen(true);
    };

    const handleAddMachine = async () => {
        const name = addMachineNameInput.trim();
        if (!name) {
            toast.current?.show({ severity: 'warn', summary: 'Machine name is required', life: 3000 });
            return;
        }
        if (processCd === 'STRANDING' && !strandLineCd) {
            toast.current?.show({ severity: 'warn', summary: 'Select Buncher or Tubular', life: 3000 });
            return;
        }

        setAddMachineSaving(true);
        try {
            await insertCmMachine(
                {
                    processCd,
                    lineCd: processCd === 'STRANDING' ? strandLineCd : null,
                    machineName: name,
                    company: addMachineCompany.trim() || COMPONENT_DEFAULT_COMPANY,
                    factory: addMachineFactory.trim() || COMPONENT_DEFAULT_FACTORY
                },
                dbTarget
            );
            toast.current?.show({ severity: 'success', summary: 'Machine added', life: 3000 });
            setAddMachineOpen(false);
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Add machine failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setAddMachineSaving(false);
        }
    };

    const handleHideMachine = async (machineName: string) => {
        if (processCd === 'STRANDING' && !strandLineCd) {
            toast.current?.show({ severity: 'warn', summary: 'Select Buncher or Tubular', life: 3000 });
            return;
        }
        setHideMachineSaving(true);
        const lineCd = processCd === 'STRANDING' ? strandLineCd : null;
        try {
            await setCmMachineVisible(
                {
                    processCd,
                    lineCd,
                    machineName,
                    visible: false
                },
                dbTarget
            );
            toast.current?.show({
                severity: 'success',
                summary: 'Machine removed',
                detail: `${machineName} is off this process. Restore it from Removed machines.`,
                life: 4000
            });
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Remove machine failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setHideMachineSaving(false);
        }
    };

    const openHiddenMachines = async () => {
        if (processCd === 'STRANDING' && !strandLineCd) {
            toast.current?.show({ severity: 'warn', summary: 'Select Buncher or Tubular', life: 3000 });
            return;
        }
        setHiddenMachinesOpen(true);
        setHiddenMachinesLoading(true);
        try {
            const rows = await fetchCmMachines(processCd, processCd === 'STRANDING' ? strandLineCd : null, dbTarget, {
                includeHidden: true
            });
            setHiddenMachines(
                rows
                    .filter((m) => !m.visible)
                    .map((m) => ({
                        machineName: m.machineName,
                        company: m.company,
                        factory: m.factory
                    }))
            );
        } catch (e) {
            setHiddenMachines([]);
            toast.current?.show({
                severity: 'error',
                summary: 'Could not load hidden machines',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setHiddenMachinesLoading(false);
        }
    };

    const handleUnhideMachine = async (machineName: string, company?: string, factory?: string) => {
        setHideMachineSaving(true);
        try {
            await setCmMachineVisible(
                {
                    processCd,
                    lineCd: processCd === 'STRANDING' ? strandLineCd : null,
                    machineName,
                    visible: true,
                    company,
                    factory
                },
                dbTarget
            );
            toast.current?.show({ severity: 'success', summary: 'Machine restored', life: 3000 });
            const rows = await fetchCmMachines(processCd, processCd === 'STRANDING' ? strandLineCd : null, dbTarget, {
                includeHidden: true
            });
            setHiddenMachines(
                rows
                    .filter((m) => !m.visible)
                    .map((m) => ({
                        machineName: m.machineName,
                        company: m.company,
                        factory: m.factory
                    }))
            );
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Restore machine failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setHideMachineSaving(false);
        }
    };

    const processTabIndex = Math.max(
        0,
        PROCESS_OPTIONS.findIndex((p) => p.code === processCd)
    );
    const strandLineTabIndex = Math.max(
        0,
        STRAND_LINE_OPTIONS.findIndex((p) => p.code === strandLineCd)
    );

    const toggleBulkRoller = (rollerId: string, checked: boolean) => {
        setBulkSelectedIds((prev) => {
            if (checked) return prev.includes(rollerId) ? prev : [...prev, rollerId];
            return prev.filter((id) => id !== rollerId);
        });
    };

    const toggleBulkSelectAllVisible = (checked: boolean) => {
        setBulkSelectedIds((prev) => {
            if (checked) {
                const next = new Set(prev);
                for (const id of bulkVisibleIds) next.add(id);
                return [...next];
            }
            const hide = new Set(bulkVisibleIds);
            return prev.filter((id) => !hide.has(id));
        });
    };

    const handleBulkSaveLimit = async () => {
        if (bulkSelectedIds.length === 0) {
            toast.current?.show({ severity: 'warn', summary: 'Select at least one roller', life: 3000 });
            return;
        }
        if (bulkLimitHours < 1) {
            toast.current?.show({ severity: 'warn', summary: 'Limit must be at least 1 hour', life: 3000 });
            return;
        }

        setBulkSaving(true);
        try {
            await batchUpdateRollerRuntimeLimits(bulkSelectedIds, bulkLimitHours, dbTarget);
            toast.current?.show({
                severity: 'success',
                summary: `Updated ${bulkSelectedIds.length} roller limit(s)`,
                life: 3000
            });
            setBulkEditOpen(false);
            await loadDashboard(true, dbTarget);
        } catch (e) {
            toast.current?.show({
                severity: 'error',
                summary: 'Bulk update failed',
                detail: e instanceof Error ? e.message : undefined,
                life: 5000
            });
        } finally {
            setBulkSaving(false);
        }
    };

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
                    factory: addFactory.trim(),
                    processCd,
                    lineCd: processCd === 'STRANDING' ? strandLineCd : null
                });
            } else {
                await insertComponent(addMachineName, addLimitHours, dbTarget, {
                    partKey: addPartChoice,
                    company: addCompany.trim(),
                    factory: addFactory.trim(),
                    processCd,
                    lineCd: processCd === 'STRANDING' ? strandLineCd : null
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
                        icon="pi pi-server"
                        rounded
                        outlined
                        disabled={loading}
                        onClick={openAddMachine}
                        tooltip="Add machine"
                    />
                    <Button
                        icon="pi pi-eye-slash"
                        rounded
                        outlined
                        disabled={loading || hideMachineSaving}
                        onClick={() => void openHiddenMachines()}
                        tooltip="Removed machines"
                    />
                    {buncherBoard ? (
                        <Link
                            href="/parts-board/gearbox-master"
                            className="p-button p-button-rounded p-button-outlined p-button-icon-only"
                            title="Gearbox master"
                        >
                            <span className="p-button-icon pi pi-cog" />
                        </Link>
                    ) : null}
                    <Button
                        icon="pi pi-plus"
                        rounded
                        outlined
                        disabled={loading || machines.length === 0}
                        onClick={openAddComponent}
                        tooltip="Add component"
                    />
                    {buncherBoard ? (
                        <Button
                            icon="pi pi-pencil"
                            rounded
                            outlined
                            disabled={loading || machines.length === 0}
                            onClick={openBulkEdit}
                            tooltip="Bulk edit roller limits"
                        />
                    ) : null}
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

            <div className="pb-process-tabs">
                <div className="pb-process-tabs__left">
                    <TabView
                        activeIndex={processTabIndex}
                        onTabChange={(e) => {
                            const next = PROCESS_OPTIONS[e.index]?.code;
                            if (!next || next === processCd) return;
                            loadGenRef.current += 1;
                            processCdRef.current = next;
                            setProcessCd(next);
                            setAttentionExpanded(false);
                        }}
                    >
                        {PROCESS_OPTIONS.map((p) => (
                            <TabPanel key={p.code} header={p.label} />
                        ))}
                    </TabView>
                    {processCd === 'STRANDING' ? (
                        <TabView
                            className="pb-process-tabs__line"
                            activeIndex={strandLineTabIndex}
                            onTabChange={(e) => {
                                const next = STRAND_LINE_OPTIONS[e.index]?.code;
                                if (!next || next === strandLineCd) return;
                                loadGenRef.current += 1;
                                strandLineCdRef.current = next;
                                setStrandLineCd(next);
                                setAttentionExpanded(false);
                            }}
                        >
                            {STRAND_LINE_OPTIONS.map((p) => (
                                <TabPanel key={p.code} header={p.label} />
                            ))}
                        </TabView>
                    ) : null}
                </div>
                <aside className="pb-attention" aria-label="Need attention">
                    <span className="pb-attention__title">Need attention</span>
                    {attentionItems.length === 0 ? (
                        <span className="pb-attention__empty">None</span>
                    ) : (
                        <>
                            <ul className="pb-attention__list">
                                {(attentionExpanded ? attentionItems : attentionItems.slice(0, 5)).map((item) => (
                                    <li key={item.key}>
                                        <button
                                            type="button"
                                            className="pb-attention__item"
                                            onClick={item.open}
                                            title={`${item.machineName} · ${item.label} · ${item.pct}% · ${formatRuntimeHms(item.runtimeHours)} / ${formatRuntimeHms(item.limitHours)}`}
                                        >
                                            <span className="pb-attention__machine">{item.machineName}</span>
                                            <span className="pb-attention__part">{item.label}</span>
                                            <span className="pb-attention__pct">{item.pct}%</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {attentionItems.length > 5 ? (
                                <button
                                    type="button"
                                    className="pb-attention__more"
                                    onClick={() => setAttentionExpanded((v) => !v)}
                                    aria-expanded={attentionExpanded}
                                    title={
                                        attentionExpanded
                                            ? 'Show less'
                                            : `Show ${attentionItems.length - 5} more`
                                    }
                                >
                                    {attentionExpanded ? '−' : `++${attentionItems.length - 5}`}
                                </button>
                            ) : null}
                        </>
                    )}
                </aside>
            </div>

            {layoutDirty ? (
                <div className="pb-layout-bar">
                    <span className="pb-layout-bar__text">Layout changed — save, discard, or return to default.</span>
                    <Button label="Save" icon="pi pi-save" size="small" onClick={saveLayoutChanges} />
                    <Button label="Discard" icon="pi pi-undo" size="small" outlined onClick={discardLayoutChanges} />
                    <Button
                        label="Return to default"
                        icon="pi pi-refresh"
                        size="small"
                        severity="secondary"
                        outlined
                        onClick={resetLayoutDefault}
                    />
                </div>
            ) : null}

            {error && !loading && <Message severity="error" text={error} className="pb-error" />}

            {loading ? (
                <div className="pb-loading">
                    <ProgressSpinner />
                </div>
            ) : visibleMachines.length === 0 ? (
                <div className="pb-empty">
                    No machines registered for this process yet. Click Add machine to key one in.
                </div>
            ) : (
                <div className={`pb-machine-grid${dragName ? ' pb-machine-grid--dragging' : ''}`}>
                    {visibleColumns.map((col) => (
                        <div key={col.map((m) => m.name).join('|')} className="pb-machine-col">
                            {col.map((machine) => (
                                <div key={machine.name} className="pb-machine-slot">
                                    <MachineCard
                                        machine={machine}
                                        syncEpochMs={syncEpochMs}
                                        nowMs={nowMs}
                                        search={searchLower}
                                        componentsOnly={!buncherBoard}
                                        onOpenFullscreen={() => openMachine(machine.name)}
                                        onOpenRoller={(lr) => openRollerEdit(machine, lr.roller)}
                                        onOpenFixed={(key, part) => openFixedEdit(machine, key, part)}
                                        onOpenCustom={(part) => openCustomEdit(machine, part)}
                                        size={cardSizes[machine.name] ?? null}
                                        dragging={dragName === machine.name}
                                        dropTarget={
                                            dropName === machine.name &&
                                            dragName !== machine.name &&
                                            dropWhere !== 'below'
                                        }
                                        dropWhere={dropName === machine.name ? dropWhere : null}
                                        onDragPointerDown={onDragPointerDown}
                                        onDragPointerMove={onDragPointerMove}
                                        onDragPointerUp={onDragPointerUp}
                                        onDragEnd={() => {
                                            dragSessionRef.current = null;
                                            setDragName(null);
                                            setDropName(null);
                                            setDropWhere(null);
                                        }}
                                        onResize={(size) => handleCardResize(machine.name, size)}
                                        onHideMachine={() =>
                                            setConfirmRemove({ kind: 'machine', name: machine.name })
                                        }
                                    />
                                    {dragName && dragName !== machine.name ? (
                                        <div
                                            data-stack-under={machine.name}
                                            className={`pb-stack-target${
                                                dropName === machine.name && dropWhere === 'below'
                                                    ? ' pb-stack-target--active'
                                                    : ''
                                            }`}
                                        >
                                            Drop here to stack below
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
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
                                value={
                                    fullscreenRunStatus === 'run'
                                        ? 'RUN'
                                        : fullscreenRunStatus === 'not_found'
                                          ? 'NOT FOUND'
                                          : 'STOP'
                                }
                                severity={
                                    fullscreenRunStatus === 'run'
                                        ? 'success'
                                        : fullscreenRunStatus === 'not_found'
                                          ? 'warning'
                                          : 'danger'
                                }
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
                            showRollers={buncherBoard}
                            onOpenComponentDetail={(key, part) => openComponentDetail(fullscreenMachine, key, part)}
                            onOpenRollerDetail={(roller) => openRollerEdit(fullscreenMachine, roller)}
                        />
                        <div className="pb-fs-footer">
                            {(fullscreenMachine.gearbox.partId ? 1 : 0) +
                                (fullscreenMachine.skipperFront.partId ? 1 : 0) +
                                (fullscreenMachine.skipperBack.partId ? 1 : 0) +
                                fullscreenMachine.extraParts.filter((p) => !!p.partId).length}{' '}
                            components
                            {buncherBoard ? ` + ${fullscreenMachine.rollers.length} rollers` : ''}
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
                            {(selectedPart.kind === 'fixed' && selectedPart.partKey === 'gearbox') ||
                            selectedPart.part.partType?.toUpperCase() === 'GEARBOX' ? (
                                <>
                                    <dt>Gearbox</dt>
                                    <dd>
                                        {gearboxPoolLoading
                                            ? '…'
                                            : gearboxCurrent
                                              ? gearboxLabel(gearboxCurrent)
                                              : selectedPart.part.partId || '—'}
                                    </dd>
                                    <dt>Lifetime runtime</dt>
                                    <dd>
                                        {gearboxCurrent
                                            ? formatRuntimeHms(gearboxCurrent.lifetimeRuntimeSec / 3600)
                                            : '—'}
                                    </dd>
                                </>
                            ) : null}
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
                        {((selectedPart.kind === 'fixed' && selectedPart.partKey === 'gearbox') ||
                            selectedPart.part.partType?.toUpperCase() === 'GEARBOX') &&
                        buncherBoard ? (
                            <div className="mb-3">
                                <label className="block mb-2 text-sm font-medium">
                                    Spare gearbox to mount
                                </label>
                                <Dropdown
                                    value={spareGearboxId}
                                    options={gearboxSpares.map((g) => ({
                                        label: `${gearboxLabel(g)} · life ${formatRuntimeHms(g.lifetimeRuntimeSec / 3600)}`,
                                        value: g.gearboxId
                                    }))}
                                    onChange={(e) => setSpareGearboxId((e.value as string) ?? null)}
                                    placeholder={
                                        gearboxPoolLoading
                                            ? 'Loading pool…'
                                            : gearboxSpares.length
                                              ? 'Select spare'
                                              : 'No spare gearboxes'
                                    }
                                    className="w-full"
                                    disabled={gearboxPoolLoading || gearboxSpares.length === 0}
                                />
                                <small className="text-color-secondary block mt-1">
                                    Removed gearbox goes to REPAIR. Install runtime on this machine resets to 0;
                                    asset lifetime is kept.
                                </small>
                            </div>
                        ) : null}
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
                                label={
                                    (selectedPart.kind === 'fixed' && selectedPart.partKey === 'gearbox') ||
                                    selectedPart.part.partType?.toUpperCase() === 'GEARBOX'
                                        ? 'Swap gearbox'
                                        : 'Replace'
                                }
                                severity="danger"
                                outlined
                                loading={saving}
                                onClick={handleReplace}
                                disabled={
                                    !selectedPart.part.partId ||
                                    (((selectedPart.kind === 'fixed' && selectedPart.partKey === 'gearbox') ||
                                        selectedPart.part.partType?.toUpperCase() === 'GEARBOX') &&
                                        buncherBoard &&
                                        gearboxPoolLoading)
                                }
                            />
                            <Button
                                icon="pi pi-trash"
                                label="Remove"
                                severity="danger"
                                loading={saving}
                                onClick={() => setConfirmRemove({ kind: 'component' })}
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
                header="Confirm remove"
                visible={confirmRemove !== null}
                style={{ width: 'min(92vw, 26rem)' }}
                onHide={() => setConfirmRemove(null)}
                dismissableMask
            >
                <p className="m-0 mb-3">
                    {confirmRemove?.kind === 'machine'
                        ? `Remove ${confirmRemove.name} from this process? It can be restored from Removed machines.`
                        : confirmRemove?.kind === 'component' && selectedPart && selectedPart.kind !== 'roller'
                          ? selectedPart.part.partType?.toUpperCase() === 'GEARBOX' && buncherBoard
                              ? `Remove gearbox from ${selectedPart.machine.name}? The unit returns to SPARE.`
                              : `Remove ${selectedPart.part.displayName} from ${selectedPart.machine.name}?`
                          : 'Remove this item?'}
                </p>
                <p className="text-color-secondary text-sm mt-0 mb-3">This does not delete history from the database.</p>
                <div className="flex justify-content-end gap-2">
                    <Button label="Cancel" text onClick={() => setConfirmRemove(null)} disabled={saving || hideMachineSaving} />
                    <Button
                        label="Remove"
                        icon="pi pi-trash"
                        severity="danger"
                        loading={saving || hideMachineSaving}
                        onClick={() => {
                            if (confirmRemove?.kind === 'machine') {
                                const name = confirmRemove.name;
                                setConfirmRemove(null);
                                void handleHideMachine(name);
                                return;
                            }
                            setConfirmRemove(null);
                            void handleRemoveComponent();
                        }}
                    />
                </div>
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
                className="pb-add-dialog"
                header="Add machine"
                visible={addMachineOpen}
                style={{ width: 'min(92vw, 28rem)' }}
                onHide={() => setAddMachineOpen(false)}
                dismissableMask
            >
                <div className="flex flex-column gap-3">
                    <Message
                        severity="info"
                        text={`Register a machine under ${PROCESS_OPTIONS.find((p) => p.code === processCd)?.label ?? processCd}${
                            processCd === 'STRANDING'
                                ? ` · ${STRAND_LINE_OPTIONS.find((p) => p.code === strandLineCd)?.label ?? strandLineCd}`
                                : ''
                        }. Then add components on that machine.`}
                    />
                    <div>
                        <label className="block mb-2 text-sm font-medium">Machine name</label>
                        <InputText
                            value={addMachineNameInput}
                            onChange={(e) => setAddMachineNameInput(e.target.value)}
                            placeholder="e.g. TUB 1250-1"
                            className="w-full"
                            maxLength={100}
                        />
                    </div>
                    <div className="grid grid-nogutter gap-3">
                        <div className="col-12 md:col-6">
                            <label className="block mb-2 text-sm font-medium">Company</label>
                            <InputText
                                value={addMachineCompany}
                                onChange={(e) => setAddMachineCompany(e.target.value)}
                                className="w-full"
                            />
                        </div>
                        <div className="col-12 md:col-6">
                            <label className="block mb-2 text-sm font-medium">Factory</label>
                            <InputText
                                value={addMachineFactory}
                                onChange={(e) => setAddMachineFactory(e.target.value)}
                                className="w-full"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-content-end">
                        <Button label="Cancel" text onClick={() => setAddMachineOpen(false)} disabled={addMachineSaving} />
                        <Button
                            label="Add"
                            icon="pi pi-check"
                            loading={addMachineSaving}
                            disabled={!addMachineNameInput.trim()}
                            onClick={() => void handleAddMachine()}
                        />
                    </div>
                </div>
            </Dialog>

            <Dialog
                className="pb-add-dialog"
                header="Removed machines"
                visible={hiddenMachinesOpen}
                style={{ width: 'min(92vw, 28rem)' }}
                onHide={() => setHiddenMachinesOpen(false)}
                dismissableMask
            >
                <div className="flex flex-column gap-3">
                    <Message
                        severity="info"
                        text="Machines removed from this process only. Restore to show them on the board again."
                    />
                    {hiddenMachinesLoading ? (
                        <div className="flex justify-content-center p-3">
                            <ProgressSpinner style={{ width: '2.5rem', height: '2.5rem' }} />
                        </div>
                    ) : hiddenMachines.length === 0 ? (
                        <div className="text-color-secondary text-sm">No removed machines for this process.</div>
                    ) : (
                        <ul className="pb-hidden-list">
                            {hiddenMachines.map((m) => (
                                <li key={m.machineName} className="pb-hidden-list__row">
                                    <span className="pb-hidden-list__name">{m.machineName}</span>
                                    <Button
                                        label="Show"
                                        icon="pi pi-eye"
                                        size="small"
                                        text
                                        loading={hideMachineSaving}
                                        onClick={() => void handleUnhideMachine(m.machineName, m.company, m.factory)}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Dialog>

            <Dialog
                className="pb-bulk-dialog"
                header="Bulk edit roller limits"
                visible={bulkEditOpen}
                style={{ width: 'min(96vw, 42rem)' }}
                onHide={() => setBulkEditOpen(false)}
                dismissableMask
                blockScroll
            >
                <div className="pb-bulk flex flex-column gap-3">
                    <div>
                        <label className="block mb-2 text-sm font-medium">Machine</label>
                        <Dropdown
                            value={bulkMachineFilter}
                            options={[{ label: 'All machines', value: '' }, ...machineOptions]}
                            onChange={(e) => setBulkMachineFilter((e.value as string) ?? '')}
                            placeholder="All machines"
                            className="w-full"
                        />
                    </div>

                    <div className="pb-bulk__toolbar">
                        <div className="flex align-items-center gap-2">
                            <Checkbox
                                inputId="pb-bulk-select-all"
                                checked={bulkAllVisibleSelected}
                                onChange={(e) => toggleBulkSelectAllVisible(!!e.checked)}
                                disabled={bulkVisibleIds.length === 0}
                            />
                            <label htmlFor="pb-bulk-select-all" className="text-sm">
                                Select all shown ({bulkVisibleIds.length})
                            </label>
                        </div>
                        <span className="text-sm text-color-secondary">
                            {bulkSelectedIds.length} selected
                        </span>
                    </div>

                    <div className="pb-bulk__list">
                        {bulkRollerRows.length === 0 ? (
                            <p className="pb-bulk__empty">No active rollers with an ID in this view.</p>
                        ) : (
                            bulkRollerRows.map(({ key, machineName, roller }) => {
                                const inputId = `pb-bulk-${roller.rollerId}`;
                                return (
                                    <label key={key} htmlFor={inputId} className="pb-bulk__row">
                                        <Checkbox
                                            inputId={inputId}
                                            checked={bulkSelectedIds.includes(roller.rollerId)}
                                            onChange={(e) => toggleBulkRoller(roller.rollerId, !!e.checked)}
                                        />
                                        <span className="pb-bulk__meta">
                                            <span className="pb-bulk__title">
                                                {machineName} · {roller.displayName}
                                            </span>
                                            <span className="pb-bulk__sub pb-fs-mono">
                                                {roller.rollerId} · {roller.binLocation || '—'} · limit{' '}
                                                {formatRuntimeHms(roller.limitHours)}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    <div>
                        <label className="block mb-2 text-sm font-medium">New runtime limit (hours)</label>
                        <InputNumber
                            value={bulkLimitHours}
                            onValueChange={(e) => setBulkLimitHours(e.value ?? 0)}
                            min={1}
                            className="w-full"
                        />
                    </div>

                    <div className="flex gap-2 justify-content-end">
                        <Button label="Cancel" text onClick={() => setBulkEditOpen(false)} disabled={bulkSaving} />
                        <Button
                            label="Apply limit"
                            icon="pi pi-save"
                            loading={bulkSaving}
                            disabled={bulkSelectedIds.length === 0 || bulkLimitHours < 1}
                            onClick={() => void handleBulkSaveLimit()}
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

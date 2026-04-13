'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Dialog } from 'primereact/dialog';
import { SelectButton } from 'primereact/selectbutton';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { Tooltip } from 'primereact/tooltip';
import type { BobbinCheckState, BobbinLifespanInfo, BobbinSummary } from '@/lib/bobbin-monitoring/types';
import {
    BOBBIN_DEFAULT_CYCLE_LIMIT,
    BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS,
    BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT,
    BOBBIN_DEFAULT_USAGE_WARNING_PCT
} from '@/lib/bobbin-monitoring/constants';
import {
    BOBBIN_DAYS_PER_YEAR,
    formatLifespanYearsFromDays,
    lifespanDaysToWholeYears,
    lifespanYearsToDays
} from '@/lib/bobbin-monitoring/lifespanConversion';
import { fetchBobbinCycle } from '@/lib/bobbin-monitoring/bobbincycleClient';
import {
    fetchBobbinLimitWarning,
    saveBobbinLimitWarning
} from '@/lib/bobbin-monitoring/bobbinLimitWarningClient';
import { mergeLifespanIntoStatus } from '@/lib/bobbin-monitoring/mergeLifespanStatus';
import { fetchBobbinLifespanStartDate } from '@/lib/bobbin-monitoring/bobbinLifespanClient';
import { buildLifespanInfo } from '@/lib/bobbin-monitoring/bobbinLifespan';
import { extractLcCdFromBobbinCode } from '@/lib/bobbin-monitoring/extractLcCd';
import { mergeSummaryWithCycleLimit } from '@/lib/bobbin-monitoring/mergeCycleLimit';
import {
    BOBBIN_DEV_MODE_STORAGE_KEY,
    bobbinDbTargetLabel,
    getBobbinDbTarget,
    setBobbinDbTarget,
    type BobbinDbTarget
} from '@/lib/bobbin-monitoring/bobbinMonitoringDbTarget';
import { postBobbinPdaScrap, type PdaScrapRequestMeta } from '@/lib/bobbin-monitoring/bobbinPdaScrapClient';
import { pdaLogin } from '@/lib/bobbin-monitoring/bobbinPdaLoginClient';
import {
    clearBobbinPdaSession,
    formatLastBobbinPdaLogout,
    getBobbinPdaSession,
    recordBobbinPdaLogout,
    setBobbinPdaSession,
    type BobbinPdaSession
} from '@/lib/bobbin-monitoring/bobbinPdaSession';
import { sessionCrossedShiftBoundarySince } from '@/lib/bobbin-monitoring/shiftAutoLogout';
import './bobbin-monitoring.css';

/** Dashboard ring (viewBox 0 0 240 240, cx cy 120); visual size scales via CSS ring wrap. */
const HERO_RING_R = 110;
const HERO_RING_C = 2 * Math.PI * HERO_RING_R;

const BOBBIN_DEV_PASSWORD = '11223344';

const DEV_PASSWORD_HELP =
    'Enter the developer password to unlock the local/production API toggle, technical reference, and extra diagnostics on this screen.';

/** Product name shown in page headers and browser context. */
const BOBBIN_PAGE_TITLE = 'Bobbin Lifespan Control Program';

const BOBBIN_DB_TARGET_OPTIONS: { label: string; value: BobbinDbTarget }[] = [
    { label: 'LOCAL', value: 'local' },
    { label: 'PROD', value: 'production' }
];

const BOBBIN_DEV_REFERENCE = `Client → API → database

0) PDA login (before this screen)
   • POST /api/bobbin/pdalogin or /api/bobbin/sfcwr/pdalogin — body { emp_cd } optional lang
   • swf-api: POST /bobbin/pdalogin or /bobbin/sfcwr/pdalogin → sp_Bobbin_Tracker_Login_Check (company/factory/lang from bobbinApi)
   • Session: sessionStorage bobbin-monitor-pda-session after success (cleared on each visit to this page — login required when opening from menu)
   • Auto sign-out: local 08:00 and 20:00 for shift change (shiftAutoLogout.ts — poll + boundary since login)

1) Data source (developer toggle above)
   • Local → swf-api localdb: /bobbin/limitwarning, /bobbin/bobbincycle, /bobbin/bobbinlifespan
     (browser may use Next proxy: /api/bobbin/…)
   • Production → swf-api sfcwrdb: /bobbin/sfcwr/limitwarning, …/bobbincycle, …/bobbinlifespan
     (Next proxy: /api/bobbin/sfcwr/…)
   • Preference: sessionStorage bobbin-monitor-db-target — all bobbin fetches read this on each request

2) Load limits (page load, settings dialog)
   • fetchBobbinLimitWarning — bobbinLimitWarningClient.ts
   • GET …/limitwarning per toggle
   • sp_Bobbin_Limit_Warning_Select
   • TB_BOBBIN_LIMIT (latest row)
   • parseBobbinLimitWarningRow — parseBobbinLimitRow.ts

3) Save limits
   • saveBobbinLimitWarning — bobbinLimitWarningClient.ts
   • POST …/limitwarning per toggle
   • sp_Bobbin_Limit_Warning_Update → insert TB_BOBBIN_LIMIT

4) Check bobbin
   • extractLcCdFromBobbinCode — extractLcCd.ts
   • fetchBobbinCycle — bobbincycleClient.ts → GET …/bobbincycle?lc_cd=…
   • sp_Bobbin_Cycle (report USP_SFC_KPRD010_R10 in API docs)
   • mapBobbincycleRows — mapBobbincycle.ts
   • fetchBobbinLifespanStartDate — bobbinLifespanClient.ts → GET …/bobbinlifespan?lc_cd=…
   • sp_BobbinStartDate
   • When signed in: POST …/pdascrap — USP_SFC_PDA_SCRAP_I10: lc_cd = full scanned bobbin code (not last-4); cycle/lifespan still use last-4 LC_CD only
   • buildLifespanInfo — bobbinLifespan.ts
   • mergeSummaryWithCycleLimit — mergeCycleLimit.ts
   • mergeLifespanIntoStatus — mergeLifespanStatus.ts`;

function statusSeverity(status: BobbinSummary['status']): 'success' | 'warning' | 'danger' | 'info' {
    switch (status) {
        case 'Active':
            return 'success';
        case 'Near Limit':
            return 'warning';
        case 'Reached Limit':
        case 'Expired / Not Usable':
            return 'danger';
        default:
            return 'info';
    }
}

function ringStrokeColor(status: BobbinSummary['status']): string {
    if (status === 'Near Limit') return 'var(--orange-500)';
    if (status === 'Reached Limit' || status === 'Expired / Not Usable') return 'var(--red-500)';
    return 'var(--bobbin-status-safe, #0d9488)';
}

type WallTone = 'safe' | 'warn' | 'danger';

function wallToneFromStatus(status: BobbinSummary['status']): WallTone {
    if (status === 'Active') return 'safe';
    if (status === 'Near Limit') return 'warn';
    return 'danger';
}

function wallKpiLabel(status: BobbinSummary['status']): string {
    switch (status) {
        case 'Active':
            return 'SAFE';
        case 'Near Limit':
            return 'NEAR LIMIT';
        case 'Reached Limit':
            return 'LIMIT REACHED';
        case 'Expired / Not Usable':
            return 'EXPIRED';
        default:
            return String(status);
    }
}

function cycleHeroWallClasses(tone: WallTone): { mega: string; pct: string; kpi: string; panel: string; ring: string } {
    return {
        mega: `bobbin-hero-cycle-mega bobbin-hero-cycle-mega--${tone}`,
        pct: `bobbin-hero-pct-mega bobbin-hero-pct-mega--${tone}`,
        kpi: `bobbin-cycle-hero-wall__kpi bobbin-cycle-hero-wall__kpi--${tone}`,
        panel: `bobbin-cycle-hero-wall bobbin-cycle-hero-wall--${tone}`,
        ring: `bobbin-hero-ring-wrap bobbin-hero-ring-wrap--${tone}`
    };
}

function formatRemainingLifespanLabel(
    hasStartDate: boolean,
    lifespanLimitDays: number,
    lifespanDaysUsedApprox: number
): string {
    if (!hasStartDate) return '—';
    const rem = Math.max(0, Math.round(lifespanLimitDays - lifespanDaysUsedApprox));
    if (rem <= 0) return 'At or past limit';
    if (rem < 120) return `≈ ${rem} days`;
    return `~${formatLifespanYearsFromDays(rem)} yr`;
}

function BobbinDashboardLeftColumn({
    mode,
    pendingCode,
    cycleLimit,
    summary,
    lifespan,
    displayStatus,
    lifespanLimitDays,
    lifespanDaysUsedApprox,
    lifespanUsagePct,
    lifespanWarningPct,
    notFoundCode,
    errorMessage
}: {
    mode: 'idle' | 'loading' | 'found' | 'notfound' | 'error';
    pendingCode?: string;
    cycleLimit: number;
    summary: BobbinSummary | null;
    lifespan?: BobbinLifespanInfo;
    displayStatus?: BobbinSummary['status'];
    lifespanLimitDays: number;
    lifespanDaysUsedApprox: number;
    lifespanUsagePct: number;
    lifespanWarningPct: number;
    notFoundCode?: string;
    errorMessage?: string;
}) {
    if (mode === 'notfound') {
        return (
            <div className="bobbin-dash-left-stack">
                <div className="bobbin-dash-subcard bobbin-dash-subcard--grow bobbin-dash-placeholder bobbin-dash-placeholder--alert">
                    <p className="m-0 font-bold text-xl text-color-secondary">No record</p>
                    <p className="m-0 mt-3 text-lg">
                        No production data for code{' '}
                        <span className="bobbin-mono-value font-bold">{notFoundCode ?? '—'}</span>
                    </p>
                </div>
            </div>
        );
    }

    if (mode === 'error') {
        return (
            <div className="bobbin-dash-left-stack">
                <div className="bobbin-dash-subcard bobbin-dash-subcard--grow bobbin-dash-placeholder bobbin-dash-placeholder--error">
                    <p className="m-0 font-bold text-xl">Unable to check</p>
                    <p className="m-0 mt-3 text-lg line-height-3">{errorMessage ?? 'Something went wrong.'}</p>
                </div>
            </div>
        );
    }

    if (mode === 'idle') {
        return (
            <div className="bobbin-dash-left-stack">
                <div className="bobbin-dash-subcard bobbin-dash-subcard--grow bobbin-empty-panel bobbin-empty-panel--hud bobbin-empty-panel--wall text-center flex flex-column align-items-center justify-content-center">
                    <i className="pi pi-qrcode bobbin-empty-icon mb-2" aria-hidden />
                    <p className="m-0 font-bold text-color-secondary text-lg">Ready to scan</p>
                    <p className="m-0 mt-2 text-color-secondary line-height-3 px-2 text-sm">
                        Enter a bobbin code above and press <strong>Check</strong>. Details appear in this column.
                    </p>
                </div>
            </div>
        );
    }

    if (mode === 'loading') {
        return (
            <div className="bobbin-dash-left-stack">
                <div className="bobbin-dash-subcard">
                    <h3 className="bobbin-dash-subcard__title">Bobbin identity</h3>
                    <div className="bobbin-skeleton-block" style={{ height: '3.25rem' }} />
                    <div className="mt-3 text-color-secondary font-medium bobbin-mono-value">{pendingCode}</div>
                </div>
                <div className="bobbin-dash-subcard bobbin-dash-subcard--grow">
                    <h3 className="bobbin-dash-subcard__title">Lifespan &amp; limits</h3>
                    <div className="bobbin-dash-kv-grid">
                        <div>
                            <div className="bobbin-skeleton-block" />
                        </div>
                        <div>
                            <div className="bobbin-skeleton-block bobbin-skeleton-block--short" />
                        </div>
                    </div>
                </div>
                <div className="bobbin-dash-subcard">
                    <h3 className="bobbin-dash-subcard__title">Cycle limits</h3>
                    <div className="bobbin-dash-kv__label">Max cycles (configured)</div>
                    <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">{cycleLimit}</div>
                </div>
            </div>
        );
    }

    if (!summary || !lifespan) return null;

    const timeInUse = lifespan.hasStartDate ? (
        <span>
            {lifespan.years}y · {lifespan.months}m · {lifespan.days}d
        </span>
    ) : (
        <span className="bobbin-dash-kv__value--muted">Not available</span>
    );

    const lifeMeterOk = lifespan.hasStartDate && lifespanLimitDays > 0;
    const lifeMeterSev: 'neutral' | 'success' | 'warning' | 'danger' = !lifeMeterOk
        ? 'neutral'
        : lifespanDaysUsedApprox >= lifespanLimitDays
          ? 'danger'
          : lifespanUsagePct >= lifespanWarningPct
            ? 'warning'
            : 'success';
    const lifeMeterWidthPct = lifeMeterOk ? Math.min(100, Math.max(0, lifespanUsagePct)) : 0;
    const lifeMeterPctClass =
        lifeMeterSev === 'danger'
            ? 'bobbin-dash-lifespan-meter__pct bobbin-dash-lifespan-meter__pct--danger'
            : lifeMeterSev === 'warning'
              ? 'bobbin-dash-lifespan-meter__pct bobbin-dash-lifespan-meter__pct--warn'
              : lifeMeterSev === 'success'
                ? 'bobbin-dash-lifespan-meter__pct bobbin-dash-lifespan-meter__pct--safe'
                : 'bobbin-dash-lifespan-meter__pct bobbin-dash-lifespan-meter__pct--neutral';

    return (
        <div className="bobbin-dash-left-stack">
            <div className="bobbin-dash-subcard">
                <div className="bobbin-dash-card-head">
                    <h3 className="m-0 text-sm font-bold uppercase letter-spacing-2 text-color-secondary">Bobbin identity</h3>
                </div>
                <div className="bobbin-dash-kv__label">Bobbin code</div>
                <div className="bobbin-dash-code-hero bobbin-mono-value">{summary.bobbinCode}</div>
            </div>

            <div className="bobbin-dash-subcard bobbin-dash-subcard--grow">
                <h3 className="bobbin-dash-subcard__title">Lifespan &amp; production</h3>
                <div className="bobbin-dash-kv-grid">
                    <div>
                        <div className="bobbin-dash-kv__label">First production cycle</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--muted">{lifespan.firstCycleDateLabel}</div>
                    </div>
                    <div>
                        <div className="bobbin-dash-kv__label">Time in use</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">{timeInUse}</div>
                    </div>
                    <div>
                        <div className="bobbin-dash-kv__label">Lifespan limit (approx.)</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">
                            ~{formatLifespanYearsFromDays(lifespanLimitDays)} yr
                        </div>
                    </div>
                    <div>
                        <div className="bobbin-dash-kv__label">Lifespan usage</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">
                            {lifespan.hasStartDate && lifespanLimitDays > 0 ? `${lifespanUsagePct}%` : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="bobbin-dash-kv__label">Remaining lifespan (approx.)</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">
                            {formatRemainingLifespanLabel(
                                lifespan.hasStartDate,
                                lifespanLimitDays,
                                lifespanDaysUsedApprox
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="bobbin-dash-kv__label">Status</div>
                        <div className="bobbin-dash-kv__value">{displayStatus ?? summary.status}</div>
                    </div>
                </div>

                <div
                    className="bobbin-dash-lifespan-meter bobbin-meter-block w-full mt-3"
                    role="group"
                    aria-label="Bobbin lifespan versus configured limit"
                >
                    <div className="bobbin-meter-header">
                        <span className="font-bold bobbin-dash-lifespan-meter__title">Bobbin lifespan</span>
                        <span className={`bobbin-meter-pct ${lifeMeterPctClass}`}>
                            {lifeMeterOk ? `${lifespanUsagePct}%` : '—'}
                        </span>
                    </div>
                    <div
                        className={`bobbin-meter-track bobbin-meter-track--${
                            lifeMeterSev === 'neutral' ? 'success' : lifeMeterSev
                        } bobbin-dash-lifespan-meter__track`}
                        style={lifeMeterSev === 'neutral' ? { opacity: 0.55 } : undefined}
                    >
                        <div
                            className={`bobbin-meter-fill bobbin-meter-fill--${
                                lifeMeterSev === 'neutral' ? 'success' : lifeMeterSev
                            }`}
                            style={{ width: lifeMeterOk ? `${lifeMeterWidthPct}%` : '0%' }}
                        />
                    </div>
                    <div className="bobbin-dash-lifespan-meter__caption text-color-secondary">
                        {lifeMeterOk ? (
                            <>
                                Versus max ~{formatLifespanYearsFromDays(lifespanLimitDays)} yr — warn at{' '}
                                <strong>{lifespanWarningPct}%</strong> of lifespan
                            </>
                        ) : (
                            <>Lifespan bar needs first production date and configured max lifespan.</>
                        )}
                    </div>
                </div>
            </div>

            <div className="bobbin-dash-subcard">
                <h3 className="bobbin-dash-subcard__title">Cycle capacity</h3>
                <div className="bobbin-dash-kv-grid">
                    <div>
                        <div className="bobbin-dash-kv__label">Max cycles</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">
                            {summary.maxCycleLimit > 0 ? summary.maxCycleLimit : '—'}
                        </div>
                    </div>
                    <div>
                        <div className="bobbin-dash-kv__label">Remaining cycles</div>
                        <div className="bobbin-dash-kv__value bobbin-dash-kv__value--mono">{summary.remainingCycles}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Cycle hero colors / ring / KPI follow `summary.status` only (cycles), not merged lifespan status. */
function CycleHeroWallPanel({
    mode,
    maxCyclesHint,
    summary,
    usagePct
}: {
    mode: 'idle' | 'loading' | 'found';
    maxCyclesHint: number;
    summary: BobbinSummary | null;
    usagePct: number;
}) {
    if (mode === 'idle') {
        return (
            <div className="bobbin-cycle-hero-wall bobbin-cycle-hero-wall--idle">
                <i className="pi pi-chart-line bobbin-empty-icon mb-3" aria-hidden style={{ opacity: 0.35 }} />
                <h3 className="bobbin-cycle-hero-wall__title mb-2">Cycle usage</h3>
                <p className="m-0 text-color-secondary" style={{ fontSize: 'clamp(1.89rem, 2.88vw, 2.43rem)', maxWidth: '39.6rem' }}>
                    Awaiting bobbin check. The cycle gauge and usage percent will display here at high visibility.
                </p>
            </div>
        );
    }

    if (mode === 'loading') {
        return (
            <div className="bobbin-cycle-hero-wall">
                <div className="bobbin-cycle-hero-wall__head">
                    <h3 className="bobbin-cycle-hero-wall__title">Cycle usage</h3>
                    <span
                        className="bobbin-cycle-hero-wall__kpi bobbin-cycle-hero-wall__kpi--safe"
                        style={{ opacity: 0.75, letterSpacing: '0.18em' }}
                    >
                        LOADING
                    </span>
                </div>
                <div className="bobbin-cycle-hero-wall__body">
                    <div className="bobbin-hero-ring-wrap">
                        <svg className="bobbin-hero-ring-svg bobbin-ring-svg--pulse" viewBox="0 0 240 240" aria-hidden>
                            <circle
                                className="bobbin-ring-bg"
                                cx="120"
                                cy="120"
                                r={HERO_RING_R}
                                fill="none"
                                strokeWidth="14"
                            />
                            <circle
                                className="bobbin-ring-loading"
                                cx="120"
                                cy="120"
                                r={HERO_RING_R}
                                fill="none"
                                stroke="var(--bobbin-hud-cyan)"
                                strokeWidth="14"
                                strokeLinecap="round"
                                strokeDasharray="56 760"
                                transform="rotate(-90 120 120)"
                            />
                        </svg>
                        <div className="bobbin-hero-ring-center">
                            <span className="bobbin-cycle-label">Fetching</span>
                            <div className="bobbin-hero-cycle-mega text-color-secondary">
                                <i className="pi pi-spinner pi-spin" aria-hidden />
                            </div>
                            <div className="bobbin-hero-of-max">of {maxCyclesHint}</div>
                        </div>
                    </div>
                    <div className="bobbin-hero-meter-wrap bobbin-meter-block w-full">
                        <div className="bobbin-meter-header">
                            <span className="font-bold bobbin-hero-meter-label">Usage</span>
                            <span className="bobbin-meter-pct text-color-secondary">…</span>
                        </div>
                        <div className="bobbin-meter-track bobbin-meter-track--success">
                            <div className="bobbin-meter-fill bobbin-meter-fill--indeterminate" />
                        </div>
                        <div className="bobbin-hero-subline text-color-secondary">Retrieving cycle data…</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!summary) return null;

    const status = summary.status;
    const tone = wallToneFromStatus(status);
    const c = cycleHeroWallClasses(tone);
    const max = summary.maxCycleLimit;
    const current = summary.currentCycleCount;
    const pct = max > 0 ? Math.min(100, Math.max(0, usagePct)) : 0;
    const arcLen = max > 0 ? (pct / 100) * HERO_RING_C : 0;
    const gap = HERO_RING_C - arcLen;
    const stroke = ringStrokeColor(status);
    const sev = statusSeverity(status);
    const remainText =
        max > 0
            ? summary.remainingCycles <= 0
                ? 'No cycles remaining'
                : `${summary.remainingCycles} cycle${summary.remainingCycles === 1 ? '' : 's'} remaining`
            : `${current} cycles recorded`;

    return (
        <div className={c.panel}>
            <div className="bobbin-cycle-hero-wall__head">
                <h3 className="bobbin-cycle-hero-wall__title">Cycle usage</h3>
                <span className={c.kpi} role="status">
                    {wallKpiLabel(status)}
                </span>
            </div>
            <div className="bobbin-cycle-hero-wall__body">
                <div className={c.ring}>
                    <svg className="bobbin-hero-ring-svg" viewBox="0 0 240 240" aria-hidden>
                        <circle
                            className="bobbin-ring-bg"
                            cx="120"
                            cy="120"
                            r={HERO_RING_R}
                            fill="none"
                            strokeWidth="14"
                        />
                        <circle
                            className="bobbin-ring-progress"
                            cx="120"
                            cy="120"
                            r={HERO_RING_R}
                            fill="none"
                            stroke={stroke}
                            strokeWidth="14"
                            strokeLinecap="round"
                            strokeDasharray={`${arcLen} ${gap}`}
                            transform="rotate(-90 120 120)"
                        />
                    </svg>
                    <div className="bobbin-hero-ring-center">
                        <span className="bobbin-cycle-label">Cycles used</span>
                        <div className={c.mega}>{current}</div>
                        <div className="bobbin-hero-of-max">
                            of {max > 0 ? max : '—'} max
                        </div>
                    </div>
                </div>

                <div className="bobbin-hero-meter-wrap bobbin-meter-block w-full">
                    <div className="bobbin-meter-header">
                        <span className="font-bold bobbin-hero-meter-label">Usage</span>
                        <span className={`bobbin-meter-pct bobbin-hero-meter-pct-hero ${c.pct}`}>
                            {max > 0 ? `${pct}%` : '—'}
                        </span>
                    </div>
                    <div className={`bobbin-meter-track bobbin-meter-track--${sev}`}>
                        <div
                            className={`bobbin-meter-fill bobbin-meter-fill--${sev}`}
                            style={{ width: max > 0 ? `${pct}%` : '0%' }}
                        />
                    </div>
                    <div className="bobbin-hero-subline">{remainText}</div>
                </div>
            </div>
        </div>
    );
}

export default function BobbinMonitoringPage() {
    const inputRef = useRef<HTMLInputElement>(null);
    const toastRef = useRef<Toast>(null);
    const [code, setCode] = useState('');
    const [cycleLimit, setCycleLimit] = useState<number>(BOBBIN_DEFAULT_CYCLE_LIMIT);
    const [cycleWarningPct, setCycleWarningPct] = useState<number>(BOBBIN_DEFAULT_USAGE_WARNING_PCT);
    const [lifespanLimitDays, setLifespanLimitDays] = useState<number>(BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS);
    const [lifespanWarningPct, setLifespanWarningPct] = useState<number>(BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT);
    const [limitsFromApi, setLimitsFromApi] = useState(false);
    const [limitsReady, setLimitsReady] = useState(false);
    const [limitDialogOpen, setLimitDialogOpen] = useState(false);
    const [draftCycleLimit, setDraftCycleLimit] = useState(BOBBIN_DEFAULT_CYCLE_LIMIT);
    const [draftLifeYears, setDraftLifeYears] = useState(
        () => lifespanDaysToWholeYears(BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS)
    );
    const [draftCycleWarn, setDraftCycleWarn] = useState(BOBBIN_DEFAULT_USAGE_WARNING_PCT);
    const [draftLifeWarn, setDraftLifeWarn] = useState(BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT);
    const [settingsSavePending, setSettingsSavePending] = useState(false);
    const [limitSettingsOpenPending, setLimitSettingsOpenPending] = useState(false);
    const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
    const [state, setState] = useState<BobbinCheckState>({ kind: 'idle' });
    const [developerMode, setDeveloperMode] = useState(false);
    const [devPasswordOpen, setDevPasswordOpen] = useState(false);
    const [devPasswordInput, setDevPasswordInput] = useState('');
    const [devPasswordError, setDevPasswordError] = useState<string | null>(null);
    const [bobbinDbTargetUi, setBobbinDbTargetUi] = useState<BobbinDbTarget>('production');
    const [pdaSession, setPdaSession] = useState<BobbinPdaSession | null>(null);
    const [loginEmpCd, setLoginEmpCd] = useState('');
    const [loginPending, setLoginPending] = useState(false);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [lastLogoutLabel, setLastLogoutLabel] = useState<string | null>(null);
    const [pdaScrapLastRequest, setPdaScrapLastRequest] = useState<PdaScrapRequestMeta | null>(null);

    useEffect(() => {
        try {
            if (typeof window !== 'undefined' && sessionStorage.getItem(BOBBIN_DEV_MODE_STORAGE_KEY) === '1') {
                setDeveloperMode(true);
            }
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        // Always show PDA login when opening this route (sidebar / home / deep link). Do not restore session.
        clearBobbinPdaSession();
        setPdaSession(null);
        setBobbinDbTargetUi(getBobbinDbTarget());
    }, []);

    useEffect(() => {
        if (developerMode) {
            setBobbinDbTargetUi(getBobbinDbTarget());
        }
    }, [developerMode]);

    const enableDeveloperMode = useCallback(() => {
        try {
            sessionStorage.setItem(BOBBIN_DEV_MODE_STORAGE_KEY, '1');
        } catch {
            /* ignore */
        }
        setDeveloperMode(true);
    }, []);

    const openDevPasswordDialog = useCallback(() => {
        setDevPasswordInput('');
        setDevPasswordError(null);
        setDevPasswordOpen(true);
    }, []);

    const submitDevPassword = useCallback(() => {
        if (devPasswordInput === BOBBIN_DEV_PASSWORD) {
            enableDeveloperMode();
            setDevPasswordOpen(false);
            setDevPasswordInput('');
            setDevPasswordError(null);
        } else {
            setDevPasswordError('Incorrect password.');
        }
    }, [devPasswordInput, enableDeveloperMode]);

    /** Focus the scan field; double rAF + timeout helps PrimeReact / layout finish before focus. */
    const focusInput = useCallback(() => {
        const el = () => {
            const input = inputRef.current;
            if (!input) return;
            input.focus({ preventScroll: true });
        };
        requestAnimationFrame(() => {
            el();
            requestAnimationFrame(el);
        });
        window.setTimeout(el, 120);
    }, []);

    useEffect(() => {
        if (!pdaSession) return;
        focusInput();
        const t = window.setTimeout(focusInput, 200);
        return () => window.clearTimeout(t);
    }, [focusInput, pdaSession]);

    const applyLimitWarningResult = useCallback((r: Awaited<ReturnType<typeof fetchBobbinLimitWarning>>) => {
        setCycleLimit(r.cycleLimit);
        setCycleWarningPct(r.cycleWarningPct);
        setLifespanLimitDays(r.lifespanLimitDays);
        setLifespanWarningPct(r.lifespanWarningPct);
        setLimitsFromApi(r.fromApi);
    }, []);

    const onLoginDbTargetChange = useCallback((value: BobbinDbTarget) => {
        setBobbinDbTargetUi(value);
        setBobbinDbTarget(value);
    }, []);

    const onBobbinDbTargetChange = useCallback(
        (value: BobbinDbTarget) => {
            setBobbinDbTargetUi(value);
            setBobbinDbTarget(value);
            setState({ kind: 'idle' });
            void (async () => {
                const r = await fetchBobbinLimitWarning({ cacheBust: true });
                applyLimitWarningResult(r);
            })();
        },
        [applyLimitWarningResult]
    );

    const signOutPda = useCallback(() => {
        recordBobbinPdaLogout();
        clearBobbinPdaSession();
        setPdaSession(null);
        setLimitsReady(false);
        setLoginError(null);
        setLoginEmpCd('');
        setState({ kind: 'idle' });
        setLimitsFromApi(false);
        setCycleLimit(BOBBIN_DEFAULT_CYCLE_LIMIT);
        setCycleWarningPct(BOBBIN_DEFAULT_USAGE_WARNING_PCT);
        setLifespanLimitDays(BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS);
        setLifespanWarningPct(BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT);
        setPdaScrapLastRequest(null);
    }, []);

    /** 08:00 / 20:00 local shift handover — auto sign-out (poll + catch sleep-through). */
    useEffect(() => {
        if (!pdaSession) return;

        const runCheck = () => {
            if (sessionCrossedShiftBoundarySince(pdaSession.loggedInAt)) {
                toastRef.current?.show({
                    severity: 'info',
                    summary: 'Shift change',
                    detail: 'Signed out for shift handover (8:00 or 20:00). Sign in again to continue.',
                    life: 10000
                });
                signOutPda();
            }
        };

        runCheck();
        const id = window.setInterval(runCheck, 30_000);
        return () => window.clearInterval(id);
    }, [pdaSession, signOutPda]);

    useEffect(() => {
        if (pdaSession) return;
        setLastLogoutLabel(formatLastBobbinPdaLogout());
    }, [pdaSession]);

    const submitPdaLogin = useCallback(async () => {
        setLoginError(null);
        const emp = loginEmpCd.trim();
        if (!emp) {
            setLoginError('Enter employee id.');
            return;
        }
        setLoginPending(true);
        try {
            const result = await pdaLogin(emp);
            const session: BobbinPdaSession = {
                empCd: result.empCd,
                empName: result.empName,
                permId: result.permId,
                loggedInAt: Date.now()
            };
            setBobbinPdaSession(session);
            setPdaSession(session);
        } catch (e) {
            setLoginError(e instanceof Error ? e.message : 'Login failed.');
        } finally {
            setLoginPending(false);
        }
    }, [loginEmpCd]);

    const disableDeveloperMode = useCallback(() => {
        try {
            sessionStorage.removeItem(BOBBIN_DEV_MODE_STORAGE_KEY);
        } catch {
            /* ignore */
        }
        setDeveloperMode(false);
        setPdaScrapLastRequest(null);
        void (async () => {
            const r = await fetchBobbinLimitWarning({ cacheBust: true });
            applyLimitWarningResult(r);
        })();
    }, [applyLimitWarningResult]);

    const onDevModeButtonClick = useCallback(() => {
        if (developerMode) {
            disableDeveloperMode();
        } else {
            openDevPasswordDialog();
        }
    }, [developerMode, disableDeveloperMode, openDevPasswordDialog]);

    useEffect(() => {
        if (!pdaSession) {
            setLimitsReady(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            const r = await fetchBobbinLimitWarning();
            if (cancelled) return;
            applyLimitWarningResult(r);
            setLimitsReady(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [applyLimitWarningResult, pdaSession]);

    /**
     * Barcode scanners often emulate Ctrl+J / Cmd+J (prefix/suffix). Chrome & Edge bind that to
     * “Open downloads”, which looks like the scan “going to download history”. Swallow it on
     * this page only (capture phase so it still runs if focus blips during scan).
     */
    useEffect(() => {
        const preventScannerDownloadHotkey = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;
            if (!e.ctrlKey && !e.metaKey) return;
            if (e.key !== 'j' && e.key !== 'J') return;
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('keydown', preventScannerDownloadHotkey, true);
        return () => window.removeEventListener('keydown', preventScannerDownloadHotkey, true);
    }, []);

    const onScanInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        const input = e.target;
        requestAnimationFrame(() => {
            if (input.value.length > 0) {
                input.select();
            }
        });
    }, []);

    const openLimitDialog = useCallback(() => {
        setSettingsSaveError(null);
        setLimitSettingsOpenPending(true);
        void (async () => {
            try {
                const r = await fetchBobbinLimitWarning({ cacheBust: true });
                applyLimitWarningResult(r);
                setDraftCycleLimit(r.cycleLimit);
                setDraftLifeYears(lifespanDaysToWholeYears(r.lifespanLimitDays));
                setDraftCycleWarn(r.cycleWarningPct);
                setDraftLifeWarn(r.lifespanWarningPct);
                setLimitDialogOpen(true);
            } finally {
                setLimitSettingsOpenPending(false);
            }
        })();
    }, [applyLimitWarningResult]);

    const saveLimitDialog = useCallback(async () => {
        const c = draftCycleLimit;
        const ly = draftLifeYears;
        const cw = draftCycleWarn;
        const lw = draftLifeWarn;
        if (![c, ly, cw, lw].every((n) => Number.isInteger(n) && n >= 1)) {
            return;
        }
        if (cw > 100 || lw > 100) {
            return;
        }
        setSettingsSavePending(true);
        setSettingsSaveError(null);
        const result = await saveBobbinLimitWarning({
            bobbinCycleLimit: c,
            bobbinLifeSpanLimit: lifespanYearsToDays(ly),
            bobbinCycleWarning: cw,
            bobbinLifespanWarning: lw
        });
        setSettingsSavePending(false);
        if (!result.ok) {
            setSettingsSaveError(result.message);
            return;
        }
        const r = await fetchBobbinLimitWarning({ cacheBust: true });
        applyLimitWarningResult(r);
        setDraftCycleLimit(r.cycleLimit);
        setDraftLifeYears(lifespanDaysToWholeYears(r.lifespanLimitDays));
        setDraftCycleWarn(r.cycleWarningPct);
        setDraftLifeWarn(r.lifespanWarningPct);
        setLimitDialogOpen(false);
    }, [applyLimitWarningResult, draftCycleLimit, draftCycleWarn, draftLifeWarn, draftLifeYears]);

    const runCheck = useCallback(async () => {
        const trimmed = code.trim();
        if (!trimmed) {
            setState({ kind: 'idle' });
            return;
        }
        if (!Number.isFinite(cycleLimit) || cycleLimit < 1 || !Number.isInteger(cycleLimit)) {
            setState({
                kind: 'error',
                message: developerMode
                    ? 'Invalid max cycle limit. Check TB_BOBBIN_LIMIT / sp_Bobbin_Limit_Warning_Select.'
                    : 'Invalid max cycle limit. Reload the page or open limit settings to refresh saved values.'
            });
            return;
        }
        const lcCd = extractLcCdFromBobbinCode(trimmed);
        if (!lcCd) {
            setState({ kind: 'error', message: 'This code needs digits for lookup.' });
            return;
        }

        setState({ kind: 'loading', pendingCode: trimmed });
        try {
            const scrapPromise = pdaSession
                ? postBobbinPdaScrap(trimmed, pdaSession.empCd, {
                      onRequestMeta: developerMode ? setPdaScrapLastRequest : undefined
                  })
                : Promise.resolve({ ok: true as const });

            const [result, lifespanStart, scrapResult] = await Promise.all([
                fetchBobbinCycle(trimmed),
                fetchBobbinLifespanStartDate(lcCd),
                scrapPromise
            ]);

            if (pdaSession) {
                if (scrapResult.ok) {
                    toastRef.current?.show({
                        severity: 'success',
                        summary: 'PDA scrap',
                        detail: developerMode
                            ? `${trimmed}: inventory scrap logged (USP_SFC_PDA_SCRAP_I10).`
                            : `${trimmed}: inventory scrap logged.`,
                        life: 6000
                    });
                } else {
                    toastRef.current?.show({
                        severity: 'error',
                        summary: 'PDA scrap failed',
                        detail: scrapResult.message,
                        life: 15000
                    });
                }
            }

            if (!result.ok) {
                setState({ kind: 'error', message: result.message });
                return;
            }
            if (result.notFound) {
                setState({ kind: 'notFound', code: trimmed });
                return;
            }

            const lifespan = buildLifespanInfo(lifespanStart);

            setState({
                kind: 'found',
                baseSummary: result.data.summary,
                lcCd: result.data.lcCd,
                lifespan
            });
        } catch {
            setState({
                kind: 'error',
                message: 'Something went wrong. Please try again.'
            });
        } finally {
            setCode('');
            focusInput();
        }
    }, [code, cycleLimit, developerMode, focusInput, pdaSession]);

    const onClear = useCallback(() => {
        setCode('');
        setState({ kind: 'idle' });
        focusInput();
    }, [focusInput]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void runCheck();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
            e.preventDefault();
        }
    };

    const summary = useMemo(() => {
        if (state.kind !== 'found') return null;
        return mergeSummaryWithCycleLimit(state.baseSummary, cycleLimit, cycleWarningPct);
    }, [state, cycleLimit, cycleWarningPct]);

    const displayUsageStatus = useMemo((): BobbinSummary['status'] | undefined => {
        if (!summary) return undefined;
        return mergeLifespanIntoStatus(
            summary.status,
            state.kind === 'found' ? state.lifespan : undefined,
            lifespanLimitDays,
            lifespanWarningPct
        );
    }, [summary, state, lifespanLimitDays, lifespanWarningPct]);

    const showResultChrome = state.kind === 'found';
    const usagePct =
        summary && summary.maxCycleLimit > 0
            ? Math.min(100, Math.round((summary.currentCycleCount / summary.maxCycleLimit) * 100))
            : 0;

    const usageAlertReached =
        summary &&
        summary.maxCycleLimit > 0 &&
        usagePct >= cycleWarningPct &&
        summary.currentCycleCount < summary.maxCycleLimit;

    const usageLimitReached =
        summary && summary.maxCycleLimit > 0 && summary.currentCycleCount >= summary.maxCycleLimit;

    const lifespanForAlerts = state.kind === 'found' ? state.lifespan : null;
    const lifespanYearsUsed =
        lifespanForAlerts?.hasStartDate === true
            ? lifespanForAlerts.years +
              lifespanForAlerts.months / 12 +
              lifespanForAlerts.days / BOBBIN_DAYS_PER_YEAR
            : 0;
    const lifespanDaysUsedApprox = lifespanYearsUsed * BOBBIN_DAYS_PER_YEAR;
    const lifespanUsagePct =
        lifespanLimitDays > 0 && lifespanForAlerts?.hasStartDate
            ? Math.min(100, Math.round((lifespanDaysUsedApprox / lifespanLimitDays) * 100))
            : 0;
    const lifespanAlertReached =
        Boolean(lifespanForAlerts?.hasStartDate) &&
        lifespanLimitDays > 0 &&
        lifespanDaysUsedApprox < lifespanLimitDays &&
        lifespanUsagePct >= lifespanWarningPct;
    const lifespanLimitReached =
        Boolean(lifespanForAlerts?.hasStartDate) &&
        lifespanLimitDays > 0 &&
        lifespanDaysUsedApprox >= lifespanLimitDays;

    const leftPanelMode: 'idle' | 'loading' | 'found' | 'notfound' | 'error' =
        state.kind === 'idle'
            ? 'idle'
            : state.kind === 'loading'
              ? 'loading'
              : state.kind === 'found'
                ? 'found'
                : state.kind === 'notFound'
                  ? 'notfound'
                  : 'error';

    const rightPanelMode: 'idle' | 'loading' | 'found' =
        state.kind === 'found' && summary ? 'found' : state.kind === 'loading' ? 'loading' : 'idle';

    const limitDialogFooter = (
        <div className="flex justify-content-end gap-2">
            <Button
                type="button"
                label="Cancel"
                className="p-button-text"
                onClick={() => setLimitDialogOpen(false)}
                disabled={settingsSavePending}
            />
            <Button
                type="button"
                label="Save"
                icon="pi pi-check"
                loading={settingsSavePending}
                onClick={() => void saveLimitDialog()}
                disabled={
                    settingsSavePending ||
                    !Number.isInteger(draftCycleLimit) ||
                    draftCycleLimit < 1 ||
                    !Number.isInteger(draftLifeYears) ||
                    draftLifeYears < 1 ||
                    !Number.isInteger(draftCycleWarn) ||
                    draftCycleWarn < 1 ||
                    draftCycleWarn > 100 ||
                    !Number.isInteger(draftLifeWarn) ||
                    draftLifeWarn < 1 ||
                    draftLifeWarn > 100
                }
            />
        </div>
    );

    if (!pdaSession) {
        return (
            <>
                <Toast ref={toastRef} position="top-center" />
                <div className="grid bobbin-monitoring-page bobbin-monitoring-page--wall">
                <div className="col-12">
                    <div className="flex flex-column gap-1 bobbin-page-header">
                        <h2 className="bobbin-page-title bobbin-page-title--wall">{BOBBIN_PAGE_TITLE}</h2>
                        <p className="bobbin-page-subtitle bobbin-page-subtitle--wall m-0">
                            Sign in with your employee id to open this screen.
                        </p>
                        {lastLogoutLabel && (
                            <p className="bobbin-login-last-logout m-0 mt-2 text-color-secondary">
                                Last logout: <strong className="text-color">{lastLogoutLabel}</strong>
                            </p>
                        )}
                    </div>
                </div>
                <div className="col-12 flex justify-content-center px-2">
                    <Card className="bobbin-hud-card w-full" style={{ maxWidth: '28rem' }}>
                        <div className="flex flex-column gap-3 p-4">
                            <div className="flex align-items-center justify-content-between gap-2 flex-wrap">
                                <span
                                    className={`bobbin-db-indicator-pill ${
                                        bobbinDbTargetUi === 'production'
                                            ? 'bobbin-db-indicator-pill--sfcwrdb'
                                            : 'bobbin-db-indicator-pill--local'
                                    }`}
                                    title={`${bobbinDbTargetLabel(bobbinDbTargetUi)} — login & monitoring DB (saved in this browser)`}
                                    aria-label={`Database: ${bobbinDbTargetLabel(bobbinDbTargetUi)}`}
                                />
                                <Button
                                    type="button"
                                    label={developerMode ? 'Exit developer' : 'Developer tools'}
                                    icon={developerMode ? 'pi pi-times' : 'pi pi-code'}
                                    className="p-button-text p-button-sm"
                                    onClick={() =>
                                        developerMode ? disableDeveloperMode() : openDevPasswordDialog()
                                    }
                                />
                            </div>
                            {developerMode && (
                                <div className="flex flex-column gap-2">
                                    <div className="font-semibold">API data source</div>
                                    <SelectButton
                                        value={bobbinDbTargetUi}
                                        onChange={(e) => {
                                            const v = e.value as BobbinDbTarget;
                                            if (v === 'local' || v === 'production') {
                                                onLoginDbTargetChange(v);
                                            }
                                        }}
                                        options={BOBBIN_DB_TARGET_OPTIONS}
                                        optionLabel="label"
                                        optionValue="value"
                                    />
                                    <p className="text-sm text-color-secondary mt-0 mb-0 line-height-3">
                                        Login runs against <strong>{bobbinDbTargetLabel(bobbinDbTargetUi)}</strong> (
                                        <code className="text-sm">
                                            POST /api/bobbin{bobbinDbTargetUi === 'production' ? '/sfcwr' : ''}/pdalogin
                                        </code>
                                        ).
                                    </p>
                                    <p className="text-xs text-color-secondary m-0 line-height-3">
                                        Server: <code className="text-xs">sp_Bobbin_Tracker_Login_Check</code> —
                                        company, factory, and language come from API config (
                                        <code className="text-xs">bobbinApi</code>).
                                    </p>
                                </div>
                            )}
                            <div>
                                <label
                                    htmlFor="bobbin-login-emp"
                                    className="font-semibold bobbin-field-label bobbin-field-label--compact block mb-2"
                                >
                                    employee id
                                </label>
                                <InputText
                                    id="bobbin-login-emp"
                                    className="w-full"
                                    value={loginEmpCd}
                                    onChange={(e) => {
                                        setLoginEmpCd(e.target.value);
                                        setLoginError(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            void submitPdaLogin();
                                        }
                                    }}
                                    autoComplete="username"
                                />
                            </div>
                            {loginError && <Message severity="error" text={loginError} className="w-full" />}
                            <Button
                                type="button"
                                label="Sign in"
                                icon="pi pi-sign-in"
                                className="w-full"
                                loading={loginPending}
                                onClick={() => void submitPdaLogin()}
                            />
                        </div>
                    </Card>
                </div>
            </div>
            <Dialog
                header="Developer tools"
                visible={devPasswordOpen}
                style={{ width: 'min(92vw, 24rem)' }}
                onHide={() => setDevPasswordOpen(false)}
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
                <label htmlFor="bobbin-dev-password-login" className="font-semibold block mb-2">
                    Password
                </label>
                <InputText
                    id="bobbin-dev-password-login"
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
                    autoComplete="off"
                />
                {devPasswordError && (
                    <Message severity="error" text={devPasswordError} className="w-full mt-3" />
                )}
            </Dialog>
            </>
        );
    }

    return (
        <>
            <Toast ref={toastRef} position="top-center" />
            <div className="grid bobbin-monitoring-page bobbin-monitoring-page--wall">
            <div className="col-12">
                <div className="flex flex-column gap-1 bobbin-page-header">
                    <h2 className="bobbin-page-title bobbin-page-title--wall">{BOBBIN_PAGE_TITLE}</h2>
                    <p className="bobbin-page-subtitle bobbin-page-subtitle--wall">
                        Scan or type a bobbin code, then check usage.
                        {pdaSession && (
                            <>
                                {' '}
                                <span className="bobbin-limit-hint">
                                    Signed in as <strong>{pdaSession.empName ?? pdaSession.empCd}</strong>.
                                </span>
                            </>
                        )}
                        {limitsReady && (
                            <span
                                className={`bobbin-db-indicator-pill bobbin-limit-hint ${
                                    bobbinDbTargetUi === 'production'
                                        ? 'bobbin-db-indicator-pill--sfcwrdb'
                                        : 'bobbin-db-indicator-pill--local'
                                }`}
                                title={`${bobbinDbTargetLabel(bobbinDbTargetUi)} — active database`}
                                aria-label={`Database: ${bobbinDbTargetLabel(bobbinDbTargetUi)}`}
                            />
                        )}
                        {limitsReady && (
                            <span className="bobbin-limit-hint">
                                {' '}
                                Cycles: max <strong>{cycleLimit}</strong>, warn <strong>{cycleWarningPct}%</strong>
                                {' · '}
                                Lifespan: max <strong>~{formatLifespanYearsFromDays(lifespanLimitDays)} yr</strong>
                                {developerMode && (
                                    <>
                                        {' '}
                                        ({lifespanLimitDays} d)
                                    </>
                                )}
                                , warn <strong>{lifespanWarningPct}%</strong>
                                {developerMode && (limitsFromApi ? ' (TB_BOBBIN_LIMIT).' : ' (defaults).')}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {developerMode && limitsReady && (
                <div className="col-12">
                    <Card className="bobbin-hud-card bobbin-dev-reference-card">
                        <div className="p-3">
                            <div className="flex flex-column sm:flex-row sm:align-items-center sm:justify-content-between gap-3 mb-3">
                                <div>
                                    <div className="font-semibold mb-1">API data source</div>
                                    <div className="text-sm text-color-secondary line-height-3">
                                        All bobbin requests (limits, cycle check, lifespan) use the active database.
                                        LOCAL = <code className="text-sm">localdb</code>. PROD ={' '}
                                        <code className="text-sm">sfcwrdb</code>. Current:{' '}
                                        <strong>{bobbinDbTargetLabel(bobbinDbTargetUi)}</strong>.
                                    </div>
                                </div>
                                <SelectButton
                                    value={bobbinDbTargetUi}
                                    onChange={(e) => {
                                        const v = e.value as BobbinDbTarget;
                                        if (v === 'local' || v === 'production') {
                                            onBobbinDbTargetChange(v);
                                        }
                                    }}
                                    options={BOBBIN_DB_TARGET_OPTIONS}
                                    optionLabel="label"
                                    optionValue="value"
                                />
                            </div>
                            <div className="flex align-items-center justify-content-between gap-2 mb-2">
                                <span className="font-semibold">Developer reference</span>
                                <span className="text-sm text-color-secondary">Endpoints, tables & procedures</span>
                            </div>
                            <pre className="bobbin-dev-reference-pre m-0 text-sm line-height-3 overflow-auto">
                                {BOBBIN_DEV_REFERENCE}
                            </pre>
                        </div>
                    </Card>
                </div>
            )}

            {developerMode && pdaScrapLastRequest && (
                <div className="col-12">
                    <Card className="bobbin-hud-card bobbin-dev-reference-card">
                        <div className="p-3">
                            <div className="font-semibold mb-2">Last PDA scrap API call (browser → Next.js)</div>
                            <p className="text-sm text-color-secondary mt-0 mb-2 line-height-3">
                                Request line: <code className="text-sm">{pdaScrapLastRequest.method}</code>{' '}
                                <code className="text-sm">{pdaScrapLastRequest.path}</code>
                            </p>
                            <div className="text-sm font-semibold mb-1">Request headers</div>
                            <pre className="bobbin-dev-reference-pre m-0 mb-3 text-sm line-height-3 overflow-auto">
                                {Object.entries(pdaScrapLastRequest.headers)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join('\n')}
                            </pre>
                            <div className="text-sm font-semibold mb-1">URL (same-origin)</div>
                            <pre className="bobbin-dev-reference-pre m-0 mb-3 text-sm line-height-3 overflow-auto">
                                {pdaScrapLastRequest.url}
                            </pre>
                            <div className="text-sm font-semibold mb-1">JSON body</div>
                            <pre className="bobbin-dev-reference-pre m-0 text-sm line-height-3 overflow-auto">
                                {JSON.stringify(pdaScrapLastRequest.body, null, 2)}
                            </pre>
                            <p className="text-xs text-color-secondary mt-2 mb-0 line-height-3">
                                Next.js route proxies to swf-api{' '}
                                <code className="text-xs">
                                    POST /bobbin{pdaScrapLastRequest.path.includes('/sfcwr/') ? '/sfcwr' : ''}/pdascrap
                                </code>{' '}
                                → <code className="text-xs">USP_SFC_PDA_SCRAP_I10</code>.
                            </p>
                        </div>
                    </Card>
                </div>
            )}

            {limitsReady && !limitsFromApi && (
                <div className="col-12">
                    <Message
                        severity="info"
                        text={
                            developerMode
                                ? 'Using default limits — could not read TB_BOBBIN_LIMIT (GET /bobbin/limitwarning, or column names in parseBobbinLimitRow.ts).'
                                : 'Using default limits — saved limits could not be loaded. Check your connection or try again later.'
                        }
                        className="w-full"
                    />
                </div>
            )}

            <div className="col-12">
                <Card className="bobbin-scan-card bobbin-scan-card--compact bobbin-scan-card--wall bobbin-hud-card">
                    <div className="flex flex-column md:flex-row md:align-items-end gap-2">
                        <div className="flex-auto flex flex-column gap-1 bobbin-scan-input-wrap">
                            <label
                                htmlFor="bobbin-code-input"
                                className="font-semibold bobbin-field-label bobbin-field-label--compact"
                            >
                                Bobbin code
                            </label>
                            <InputText
                                id="bobbin-code-input"
                                ref={inputRef}
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                onKeyDown={onKeyDown}
                                onFocus={onScanInputFocus}
                                placeholder="Scan or enter code"
                                className="w-full bobbin-scan-input"
                                disabled={state.kind === 'loading'}
                                autoComplete="off"
                                autoFocus
                            />
                        </div>
                        <div className="flex flex-wrap gap-2 align-items-center bobbin-scan-actions">
                            <Button
                                type="button"
                                label="Check"
                                icon="pi pi-search"
                                size="small"
                                onClick={(e) => {
                                    e.preventDefault();
                                    void runCheck();
                                }}
                                loading={state.kind === 'loading'}
                            />
                            <Button
                                type="button"
                                label="Clear"
                                icon="pi pi-times"
                                size="small"
                                className="p-button-outlined"
                                onClick={onClear}
                            />
                            <Button
                                type="button"
                                label="Sign out"
                                icon="pi pi-sign-out"
                                size="small"
                                className="p-button-outlined"
                                onClick={signOutPda}
                                disabled={state.kind === 'loading'}
                                aria-label="Sign out and return to login"
                            />
                            <Button
                                type="button"
                                id="bobbin-limit-btn"
                                icon="pi pi-sliders-h"
                                size="small"
                                className="p-button-outlined"
                                onClick={openLimitDialog}
                                loading={limitSettingsOpenPending}
                                disabled={state.kind === 'loading' || limitSettingsOpenPending}
                                aria-label="Bobbin limit and warning settings"
                            />
                            <Tooltip
                                target="#bobbin-limit-btn"
                                content={
                                    developerMode
                                        ? 'Edit cycle & lifespan limits (POST → sp_Bobbin_Limit_Warning_Update → TB_BOBBIN_LIMIT)'
                                        : 'Edit cycle and lifespan limits and warnings'
                                }
                                position="bottom"
                            />
                            <Button
                                type="button"
                                id="bobbin-dev-btn"
                                icon="pi pi-code"
                                size="small"
                                className={developerMode ? 'p-button-secondary' : 'p-button-outlined'}
                                onClick={onDevModeButtonClick}
                                disabled={state.kind === 'loading'}
                                aria-label={developerMode ? 'Exit developer mode' : 'Developer mode'}
                            />
                            <Tooltip
                                target="#bobbin-dev-btn"
                                content={
                                    developerMode
                                        ? 'Exit developer mode (hide technical details)'
                                        : 'Developer mode — password required'
                                }
                                position="bottom"
                            />
                        </div>
                    </div>
                </Card>
            </div>

            <Dialog
                header="Developer tools"
                visible={devPasswordOpen}
                style={{ width: 'min(92vw, 24rem)' }}
                onHide={() => setDevPasswordOpen(false)}
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
                <label htmlFor="bobbin-dev-password" className="font-semibold block mb-2">
                    Password
                </label>
                <InputText
                    id="bobbin-dev-password"
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
                    autoComplete="off"
                />
                {devPasswordError && (
                    <Message severity="error" text={devPasswordError} className="w-full mt-3" />
                )}
            </Dialog>

            <Dialog
                header="Bobbin limits & warnings"
                visible={limitDialogOpen}
                style={{ width: 'min(92vw, 28rem)' }}
                onHide={() => !settingsSavePending && setLimitDialogOpen(false)}
                footer={limitDialogFooter}
                draggable={false}
                resizable={false}
            >
                {developerMode ? (
                    <p className="mt-0 text-color-secondary line-height-3 mb-3">
                        Values are inserted into <strong>TB_BOBBIN_LIMIT</strong> via{' '}
                        <code className="text-sm">sp_Bobbin_Limit_Warning_Update</code>. Warning fields are percent
                        (1–100).
                    </p>
                ) : (
                    <p className="mt-0 text-color-secondary line-height-3 mb-3">
                        These limits apply to everyone using this screen. Warning values are percentages (1–100).
                    </p>
                )}
                {settingsSaveError && (
                    <Message severity="error" text={settingsSaveError} className="w-full mb-3" />
                )}
                <label htmlFor="bobbin-draft-cycle" className="font-semibold block mb-2">
                    Max cycles
                </label>
                <InputNumber
                    id="bobbin-draft-cycle"
                    value={draftCycleLimit}
                    onValueChange={(e) => setDraftCycleLimit(e.value ?? BOBBIN_DEFAULT_CYCLE_LIMIT)}
                    min={1}
                    max={999999}
                    showButtons
                    className="w-full mb-3"
                    useGrouping={false}
                    minFractionDigits={0}
                    maxFractionDigits={0}
                />
                <label htmlFor="bobbin-draft-cycle-warn" className="font-semibold block mb-2">
                    Cycle usage warning (% of max cycles)
                </label>
                <InputNumber
                    id="bobbin-draft-cycle-warn"
                    value={draftCycleWarn}
                    onValueChange={(e) => setDraftCycleWarn(e.value ?? BOBBIN_DEFAULT_USAGE_WARNING_PCT)}
                    min={1}
                    max={100}
                    suffix="%"
                    showButtons
                    className="w-full mb-3"
                    useGrouping={false}
                    minFractionDigits={0}
                    maxFractionDigits={0}
                />
                <label htmlFor="bobbin-draft-life" className="font-semibold block mb-2">
                    {developerMode ? 'Max lifespan (years, stored as days in TB_BOBBIN_LIMIT)' : 'Max lifespan (years)'}
                </label>
                <InputNumber
                    id="bobbin-draft-life"
                    value={draftLifeYears}
                    onValueChange={(e) =>
                        setDraftLifeYears(e.value ?? lifespanDaysToWholeYears(BOBBIN_DEFAULT_LIFESPAN_LIMIT_DAYS))
                    }
                    min={1}
                    max={999}
                    showButtons
                    className="w-full mb-3"
                    useGrouping={false}
                    minFractionDigits={0}
                    maxFractionDigits={0}
                />
                <label htmlFor="bobbin-draft-life-warn" className="font-semibold block mb-2">
                    {developerMode
                        ? 'Lifespan warning (% of max lifespan by days)'
                        : 'Lifespan warning (% of max lifespan)'}
                </label>
                <InputNumber
                    id="bobbin-draft-life-warn"
                    value={draftLifeWarn}
                    onValueChange={(e) => setDraftLifeWarn(e.value ?? BOBBIN_DEFAULT_LIFESPAN_WARNING_PCT)}
                    min={1}
                    max={100}
                    suffix="%"
                    showButtons
                    className="w-full"
                    useGrouping={false}
                    minFractionDigits={0}
                    maxFractionDigits={0}
                />
            </Dialog>

            {state.kind === 'notFound' && (
                <div className="col-12 bobbin-dashboard-alerts bobbin-dashboard-alerts--compact">
                    <div className="bobbin-dashboard-alert bobbin-dashboard-alert--warn" role="alert">
                        <span className="bobbin-dashboard-alert__icon" aria-hidden>
                            <i className="pi pi-exclamation-triangle" />
                        </span>
                        <div>No production record found for this bobbin code. Verify the code and try again.</div>
                    </div>
                </div>
            )}

            {state.kind === 'error' && (
                <div className="col-12 bobbin-dashboard-alerts bobbin-dashboard-alerts--compact">
                    <div className="bobbin-dashboard-alert bobbin-dashboard-alert--error" role="alert">
                        <span className="bobbin-dashboard-alert__icon" aria-hidden>
                            <i className="pi pi-times-circle" />
                        </span>
                        <div>{state.message}</div>
                    </div>
                </div>
            )}

            {showResultChrome && summary && (
                <div className="col-12 bobbin-dashboard-alerts bobbin-dashboard-alerts--compact">
                    {usageLimitReached && (
                        <div className="bobbin-dashboard-alert bobbin-dashboard-alert--error" role="status">
                            <span className="bobbin-dashboard-alert__icon" aria-hidden>
                                <i className="pi pi-ban" />
                            </span>
                            <div>
                                <strong>Cycle limit reached</strong> ({summary.maxCycleLimit} cycles). Do not use this
                                bobbin for further production.
                            </div>
                        </div>
                    )}
                    {usageAlertReached && (
                        <div className="bobbin-dashboard-alert bobbin-dashboard-alert--warn" role="status">
                            <span className="bobbin-dashboard-alert__icon" aria-hidden>
                                <i className="pi pi-exclamation-circle" />
                            </span>
                            <div>
                                <strong>High cycle usage:</strong> {usagePct}% of maximum (warning threshold{' '}
                                {cycleWarningPct}%). Plan inspection or replacement soon.
                            </div>
                        </div>
                    )}
                    {lifespanLimitReached && (
                        <div className="bobbin-dashboard-alert bobbin-dashboard-alert--error" role="status">
                            <span className="bobbin-dashboard-alert__icon" aria-hidden>
                                <i className="pi pi-clock" />
                            </span>
                            <div>
                                <strong>Lifespan limit reached</strong>
                                {developerMode
                                    ? ` (~${formatLifespanYearsFromDays(lifespanLimitDays)} yr / ${lifespanLimitDays} d).`
                                    : ` (about ${formatLifespanYearsFromDays(lifespanLimitDays)} years).`}
                            </div>
                        </div>
                    )}
                    {lifespanAlertReached && (
                        <div className="bobbin-dashboard-alert bobbin-dashboard-alert--warn" role="status">
                            <span className="bobbin-dashboard-alert__icon" aria-hidden>
                                <i className="pi pi-hourglass" />
                            </span>
                            <div>
                                <strong>High lifespan usage:</strong> about {lifespanUsagePct}% of maximum (warning at{' '}
                                {lifespanWarningPct}%).
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="col-12 bobbin-dashboard-stage bobbin-dashboard-stage--fit">
                <div className="grid bobbin-dashboard-grid bobbin-dashboard-grid--fit">
                    <div className="col-12 lg:col-5 bobbin-dashboard-col-cycle">
                        <CycleHeroWallPanel
                            mode={rightPanelMode}
                            maxCyclesHint={cycleLimit}
                            summary={summary}
                            usagePct={usagePct}
                        />
                    </div>
                    <div className="col-12 lg:col-7 bobbin-dashboard-col-info">
                        <BobbinDashboardLeftColumn
                            mode={leftPanelMode}
                            pendingCode={state.kind === 'loading' ? state.pendingCode : undefined}
                            cycleLimit={cycleLimit}
                            summary={summary}
                            lifespan={state.kind === 'found' ? state.lifespan : undefined}
                            displayStatus={displayUsageStatus}
                            lifespanLimitDays={lifespanLimitDays}
                            lifespanDaysUsedApprox={lifespanDaysUsedApprox}
                            lifespanUsagePct={lifespanUsagePct}
                            lifespanWarningPct={lifespanWarningPct}
                            notFoundCode={state.kind === 'notFound' ? state.code : undefined}
                            errorMessage={state.kind === 'error' ? state.message : undefined}
                        />
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}

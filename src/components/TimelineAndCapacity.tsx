import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ExternalLink,
  FileImage,
  Lock,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from 'lucide-react';
import type {
  EligibilityIssue,
  EligibilityProfile,
  GrantEntry,
  QuarterKey,
  QuarterLoadSummary,
  RulesData,
} from '../types/arc';
import {
  computeEcrCutoffDate,
  computePostPhdCutoffDate,
  dateToTimelineFraction,
  formatDateShort,
  formatQuarterShort,
  parseQuarter,
  quarterToIndex,
} from '../engine/quarters';
import { getLegacySchemeById, getRoleById, getSchemeById } from '../engine/rules';
import { getGrantEndQuarter, getGrantPhaseAtQuarter, getGrantPoints } from '../engine/planner';
import { QuirkToggletip } from './QuirkToggletip';

interface TimelineAndCapacityProps {
  grants: GrantEntry[];
  rules: RulesData;
  loads: QuarterLoadSummary[];
  eligibility: EligibilityProfile;
  issues: EligibilityIssue[];
  selectedQuarter: QuarterKey;
  onSelectQuarter: (q: QuarterKey) => void;
  onToggleOutcome: (grantId: string) => void;
  onEditGrant: (grant: GrantEntry) => void;
  onRemoveGrant: (grantId: string) => void;
  onOpenAddGrant: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onDownloadPng?: () => void;
  onPrintPdf?: () => void;
}

function formatPts(n: number): string {
  return `${n} ${n === 1 ? 'pt' : 'pts'}`;
}

export function TimelineAndCapacity({
  grants,
  rules,
  loads,
  eligibility,
  issues,
  selectedQuarter,
  onSelectQuarter,
  onToggleOutcome,
  onEditGrant,
  onRemoveGrant,
  onOpenAddGrant,
  isExpanded = false,
  onToggleExpand,
  onDownloadPng,
  onPrintPdf,
}: TimelineAndCapacityProps) {
  const [hoveredQuarter, setHoveredQuarter] = useState<QuarterKey | null>(null);
  const [mobileView, setMobileView] = useState<'cards' | 'gantt'>('cards');

  const activeQuarter = hoveredQuarter ?? selectedQuarter;
  const activeLoad = loads.find((l) => l.quarter === activeQuarter) ?? loads[0];
  const lastTimelineQuarter = loads[loads.length - 1]?.quarter ?? '2032-Q4';
  const lastTimelineIdx = quarterToIndex(lastTimelineQuarter);

  const years = Array.from(
    { length: rules.timelineWindow.endYear - rules.timelineWindow.startYear + 1 },
    (_, i) => rules.timelineWindow.startYear + i,
  );

  const peakPoints = loads.reduce((max, l) => Math.max(max, l.totalPoints), 0);
  const chartMaxPoints = Math.max(rules.hardCap + 4, peakPoints + 2);
  const capLineBottomPct = (rules.hardCap / chartMaxPoints) * 100;

  const ecrCutoffDate = computeEcrCutoffDate(
    eligibility.phdConferralDate,
    eligibility.careerInterruptionMonths,
    rules.ecrYearsCutoff,
  );
  const ecrFraction = ecrCutoffDate
    ? dateToTimelineFraction(
        ecrCutoffDate,
        rules.timelineWindow.startYear,
        rules.timelineWindow.endYear,
      )
    : null;

  const indigenousCutoffDate = eligibility.isIndigenousResearcher
    ? computePostPhdCutoffDate(
        eligibility.phdConferralDate,
        eligibility.careerInterruptionMonths,
        rules.indigenousMaxPostPhdYears,
      )
    : null;
  const indigenousFraction = indigenousCutoffDate
    ? dateToTimelineFraction(
        indigenousCutoffDate,
        rules.timelineWindow.startYear,
        rules.timelineWindow.endYear,
      )
    : null;

  const issuesByGrant = new Map<string, EligibilityIssue[]>();
  for (const issue of issues) {
    const arr = issuesByGrant.get(issue.grantId) ?? [];
    arr.push(issue);
    issuesByGrant.set(issue.grantId, arr);
  }

  return (
    <section
      aria-label="Synchronized Quarterly Timeline and Capacity Chart"
      className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden print-avoid-break"
    >
      {/* Top Synchronized Quarter Readout Bar + Top-Right Chart Quick Actions */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-semibold text-slate-700 uppercase tracking-wide text-[11px]">
              {hoveredQuarter ? 'Inspecting' : 'Selected'}:
            </span>
            <span className="inline-flex items-center rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white tabular-nums">
              {formatQuarterShort(activeQuarter)}
            </span>
            {activeLoad && (
              <div className="flex flex-wrap items-center gap-2 tabular-nums">
                <span
                  className={`font-semibold ${
                    activeLoad.isOverCap ? 'text-red-700' : 'text-slate-900'
                  }`}
                >
                  {activeLoad.totalPoints} / {rules.hardCap} pts
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-teal-800">{activeLoad.activePoints} active</span>
                <span className="text-amber-700">{activeLoad.pendingPoints} pending</span>
                <span className="text-slate-300">|</span>
                {activeLoad.isOverCap ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Over cap by +{formatPts(activeLoad.overCapBy)}
                  </span>
                ) : (
                  <span className="text-slate-600">
                    <strong className="text-slate-900">{activeLoad.remainingPoints}</strong>{' '}
                    {activeLoad.remainingPoints === 1 ? 'pt' : 'pts'} free
                  </span>
                )}
                {activeLoad.hasSciConflict && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
                    SCI salary overlaps teaching relief
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Functional Color Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-teal-700" />
              Funded Lock
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] border border-amber-500 bg-pending-stripes" />
              Pending Lock
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-slate-300" />
              Legacy (0 pts)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-red-600" />
              {rules.hardCap}-pt Cap
            </span>
            {ecrCutoffDate && ecrFraction !== null && (
              <span className="inline-flex items-center gap-1.5 text-violet-700">
                <span className="h-3 border-l border-dashed border-violet-600" />
                ECR 5yr Cutoff ({formatDateShort(ecrCutoffDate)})
              </span>
            )}
            {indigenousCutoffDate && indigenousFraction !== null && (
              <span className="inline-flex items-center gap-1.5 text-amber-800">
                <span className="h-3 border-l border-dashed border-amber-600" />
                Indig. {rules.indigenousMaxPostPhdYears}yr Cutoff (
                {formatDateShort(indigenousCutoffDate)})
              </span>
            )}
          </div>
        </div>

        {/* Quiet Top-Right Quick-Action Controls */}
        {(onDownloadPng || onPrintPdf || onToggleExpand) && (
          <div className="no-print shrink-0 inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white/90 p-0.5 opacity-75 hover:opacity-100 focus-within:opacity-100 arc-state-transition">
            {onDownloadPng && (
              <button
                type="button"
                onClick={onDownloadPng}
                title="Download high-DPI timeline PNG"
                aria-label="Download timeline PNG"
                className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-950 cursor-pointer"
              >
                <FileImage className="h-3.5 w-3.5" />
              </button>
            )}
            {onPrintPdf && (
              <button
                type="button"
                onClick={onPrintPdf}
                title="Print or save landscape PDF"
                aria-label="Print or save landscape PDF"
                className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-950 cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
            )}
            {onToggleExpand && (
              <button
                type="button"
                onClick={onToggleExpand}
                title={isExpanded ? 'Show side panel' : 'Expand timeline to full width'}
                aria-label={isExpanded ? 'Show side panel' : 'Expand timeline to full width'}
                className="hidden xl:inline-flex rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-950 cursor-pointer"
              >
                {isExpanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Mobile-First View (< md): Full-width touch cards + Full-width scrollable capacity chart (with optional Gantt toggle) */}
      <div className="md:hidden">
        {/* Mobile View Toggle */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-3 py-2 text-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Pipeline ({grants.length})
          </span>
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMobileView('cards')}
              className={`rounded px-2.5 py-1 font-medium cursor-pointer ${
                mobileView === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Cards + Chart
            </button>
            <button
              type="button"
              onClick={() => setMobileView('gantt')}
              className={`rounded px-2.5 py-1 font-medium cursor-pointer ${
                mobileView === 'gantt' ? 'bg-slate-900 text-white' : 'text-slate-600'
              }`}
            >
              Swipe Gantt
            </button>
          </div>
        </div>

        {mobileView === 'cards' && (
          <>
            {/* Mobile Full-Width Scrollable Capacity Bar Chart (no 308px side column!) */}
            <div className="border-b border-slate-200 bg-slate-50/40 px-3 pt-2.5 pb-2">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-semibold uppercase tracking-wide text-slate-600">
                  Quarterly Load (swipe &amp; tap)
                </span>
                <span className="font-mono text-slate-700 tabular-nums">
                  Peak{' '}
                  <strong className={peakPoints > rules.hardCap ? 'text-red-700' : 'text-slate-900'}>
                    {peakPoints}/{rules.hardCap}
                  </strong>
                </span>
              </div>
              <div className="overflow-x-auto pb-1">
                <div className="min-w-[640px] pt-5">
                  <div className="relative h-32">
                    <div
                      aria-hidden="true"
                      style={{ bottom: `${capLineBottomPct}%` }}
                      className="pointer-events-none absolute inset-x-0 z-10 border-t-[1.5px] border-dashed border-red-600"
                    >
                      <span className="absolute bottom-[3px] right-1 rounded bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none text-white tabular-nums shadow-2xs">
                        {rules.hardCap}-pt cap
                      </span>
                    </div>
                    {ecrFraction !== null && (
                      <div
                        aria-hidden="true"
                        style={{ left: `${ecrFraction * 100}%` }}
                        className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-violet-600/70"
                      >
                        <span className="absolute -top-4 left-1 whitespace-nowrap rounded bg-violet-50/95 px-1 py-0.5 text-[9px] font-semibold text-violet-800 border border-violet-200 leading-none">
                          ECR 5yr
                        </span>
                      </div>
                    )}
                    {indigenousFraction !== null && (
                      <div
                        aria-hidden="true"
                        style={{ left: `${indigenousFraction * 100}%` }}
                        className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-amber-600/80"
                      >
                        <span className="absolute -top-4 left-1 whitespace-nowrap rounded bg-amber-50/95 px-1 py-0.5 text-[9px] font-semibold text-amber-900 border border-amber-300 leading-none">
                          Indig. {rules.indigenousMaxPostPhdYears}yr
                        </span>
                      </div>
                    )}
                    <div className="grid h-full grid-cols-24">
                      {loads.map((load) => {
                        const isSelected = load.quarter === selectedQuarter;
                        const totalPct = Math.min(100, (load.totalPoints / chartMaxPoints) * 100);
                        const activeShare =
                          load.totalPoints > 0 ? (load.activePoints / load.totalPoints) * 100 : 0;
                        const pendingShare =
                          load.totalPoints > 0 ? (load.pendingPoints / load.totalPoints) * 100 : 0;
                        return (
                          <button
                            key={load.quarter}
                            type="button"
                            onClick={() => onSelectQuarter(load.quarter)}
                            aria-label={`${formatQuarterShort(load.quarter)}: ${load.totalPoints} of ${rules.hardCap} points`}
                            className={`flex h-full flex-col justify-end items-center border-r border-slate-100 last:border-r-0 px-[2px] cursor-pointer ${
                              isSelected
                                ? 'bg-slate-200/80'
                                : load.isOverCap
                                  ? 'bg-red-50/50'
                                  : ''
                            }`}
                          >
                            <span
                              className={`relative z-20 mb-0.5 rounded-[2px] px-0.5 font-mono text-[9px] leading-none tabular-nums ${
                                load.isOverCap
                                  ? 'bg-red-50/95 font-bold text-red-700'
                                  : load.totalPoints > 0
                                    ? 'bg-slate-50/95 font-semibold text-slate-700'
                                    : 'text-slate-300'
                              }`}
                            >
                              {load.totalPoints}
                            </span>
                            {load.totalPoints > 0 && (
                              <div
                                style={{ height: `${totalPct}%` }}
                                className="flex w-full flex-col justify-end arc-bar-transition"
                              >
                                {load.pendingPoints > 0 && (
                                  <div
                                    style={{ height: `${pendingShare}%` }}
                                    className={`w-full rounded-t-[2px] ${
                                      load.isOverCap
                                        ? 'bg-red-400 border border-red-600'
                                        : 'bg-pending-bar-stripes border border-amber-600/60'
                                    }`}
                                  />
                                )}
                                {load.activePoints > 0 && (
                                  <div
                                    style={{ height: `${activeShare}%` }}
                                    className={`w-full ${
                                      load.pendingPoints === 0 ? 'rounded-t-[2px]' : ''
                                    } ${load.isOverCap ? 'bg-red-600' : 'bg-teal-700'}`}
                                  />
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Quarter axis labels below mobile bars */}
                  <div className="mt-1 grid grid-cols-24 border-t border-slate-200 pt-1">
                    {loads.map((load) => {
                      const { year, q } = parseQuarter(load.quarter);
                      const isSelected = load.quarter === selectedQuarter;
                      return (
                        <button
                          key={load.quarter}
                          type="button"
                          onClick={() => onSelectQuarter(load.quarter)}
                          className={`text-center font-mono text-[9px] tabular-nums cursor-pointer rounded py-0.5 ${
                            isSelected
                              ? 'bg-slate-900 text-white font-bold'
                              : q === 1
                                ? 'text-slate-800 font-semibold'
                                : 'text-slate-400'
                          }`}
                        >
                          {q === 1 ? `'${String(year).slice(2)}` : `Q${q}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Touch-Friendly Grant Cards */}
            {grants.length === 0 ? (
              <button
                type="button"
                onClick={onOpenAddGrant}
                className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add a grant or legacy project...</span>
              </button>
            ) : (
              <div className="divide-y divide-slate-100">
                {grants.map((grant) => {
                  const scheme = grant.isLegacy
                    ? getLegacySchemeById(rules, grant.schemeId)
                    : getSchemeById(rules, grant.schemeId);
                  const fullScheme = !grant.isLegacy
                    ? getSchemeById(rules, grant.schemeId)
                    : undefined;
                  const role = grant.isLegacy
                    ? undefined
                    : getRoleById(rules, grant.schemeId, grant.roleId);
                  const pts = getGrantPoints(grant, rules);
                  const endQuarter = getGrantEndQuarter(grant);
                  const grantIssues = issuesByGrant.get(grant.id) ?? [];

                  return (
                    <div key={grant.id} className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`text-xs font-semibold ${
                                grant.outcome === 'unsuccessful' && !grant.isLegacy && !grant.isAwarded
                                  ? 'text-slate-400 line-through'
                                  : 'text-slate-900'
                              }`}
                            >
                              {grant.label}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                                grant.isLegacy
                                  ? 'bg-slate-100 text-slate-600'
                                  : grant.outcome === 'unsuccessful' && !grant.isAwarded
                                    ? 'bg-slate-100 text-slate-400'
                                    : 'bg-slate-900 text-white'
                              }`}
                            >
                              {formatPts(pts)}
                            </span>
                            {grantIssues.length > 0 && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                            <span className="font-medium">
                              {grant.isLegacy
                                ? (scheme?.shortName ?? 'Legacy')
                                : (role?.label ?? grant.roleId)}
                            </span>
                            {fullScheme && (
                              <>
                                <span className="text-slate-300">&middot;</span>
                                <span
                                  className={
                                    fullScheme.status === 'Confirmed'
                                      ? 'text-emerald-700 font-medium'
                                      : 'text-slate-500'
                                  }
                                >
                                  {fullScheme.status}
                                </span>
                              </>
                            )}
                            {!grant.isLegacy && role && (
                              <>
                                <span className="text-slate-300">&middot;</span>
                                <span
                                  className={
                                    role.compensationType === 'salaried'
                                      ? 'text-indigo-700 font-medium'
                                      : 'text-sky-700'
                                  }
                                >
                                  {role.compensationType === 'salaried' ? 'Salaried' : 'Teaching Relief'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {grant.isLegacy ? (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                              Legacy
                            </span>
                          ) : grant.isAwarded ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white">
                              <Lock className="h-3 w-3" />
                              Awarded
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleOutcome(grant.id)}
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                                grant.outcome === 'funded'
                                  ? 'border-teal-700/30 bg-teal-50 text-teal-800'
                                  : 'border-slate-300 bg-slate-100 text-slate-600'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 rounded-full ${
                                  grant.outcome === 'funded' ? 'bg-teal-600' : 'bg-slate-400'
                                }`}
                              />
                              {grant.outcome === 'funded' ? 'If Funded' : 'If Unfunded'}
                              <ArrowLeftRight className="h-2.5 w-2.5 opacity-55" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 tabular-nums">
                        <span>
                          {grant.isLegacy || grant.isAwarded
                            ? `Active ${formatQuarterShort(grant.startQuarter)} to ${formatQuarterShort(endQuarter)}`
                            : grant.outcome === 'unsuccessful'
                              ? `Pending ${formatQuarterShort(grant.submissionQuarter)} · Freed ${formatQuarterShort(grant.outcomeQuarter)}`
                              : `Submit ${formatQuarterShort(grant.submissionQuarter)} · Active to ${formatQuarterShort(endQuarter)}`}
                        </span>
                        <div className="flex items-center gap-2">
                          {fullScheme && (
                            <QuirkToggletip
                              label={`Scheme quirk for ${fullScheme.name}`}
                              title={fullScheme.name}
                              status={fullScheme.status}
                              content={fullScheme.quirkHint}
                              extraMeta={`${fullScheme.fundingBandLabel} · ${fullScheme.cadence} · Max ${fullScheme.maxDurationYears} yrs`}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => onEditGrant(grant)}
                            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 cursor-pointer"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveGrant(grant.id)}
                            aria-label={`Remove ${grant.label}`}
                            className="inline-flex items-center rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Desktop Synchronized Gantt + Capacity Chart (and Mobile Swipe Gantt when selected) */}
      <div
        className={`overflow-x-auto ${mobileView === 'cards' ? 'hidden md:block' : 'block'}`}
        onMouseLeave={() => setHoveredQuarter(null)}
      >
        <div className="min-w-[880px]">
          {/* Year & Quarter Header Row */}
          <div className="grid grid-cols-[308px_1fr] border-b border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between border-r border-slate-200 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Pipeline ({grants.length})
              </span>
              <button
                type="button"
                onClick={onOpenAddGrant}
                className="no-print inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer arc-state-transition"
              >
                <Plus className="h-3 w-3" />
                Add Grant
              </button>
            </div>
            <div className="relative">
              {/* Year labels */}
              <div className="grid grid-cols-6 border-b border-slate-200">
                {years.map((year) => (
                  <div
                    key={year}
                    className="border-r border-slate-200 last:border-r-0 px-1.5 py-1 text-center text-[11px] font-semibold text-slate-700 tabular-nums"
                  >
                    {year}
                  </div>
                ))}
              </div>
              {/* Quarter labels */}
              <div className="grid grid-cols-24">
                {loads.map((load) => {
                  const { q } = parseQuarter(load.quarter);
                  const isSelected = load.quarter === selectedQuarter;
                  const isHovered = load.quarter === hoveredQuarter;
                  return (
                    <button
                      key={load.quarter}
                      type="button"
                      onClick={() => onSelectQuarter(load.quarter)}
                      onMouseEnter={() => setHoveredQuarter(load.quarter)}
                      onFocus={() => setHoveredQuarter(load.quarter)}
                      title={`Select ${formatQuarterShort(load.quarter)}: ${load.totalPoints}/${rules.hardCap} pts`}
                      className={`border-r py-1 text-center font-mono text-[10px] tabular-nums cursor-pointer arc-state-transition ${
                        q === 4 ? 'border-slate-200' : 'border-slate-100'
                      } last:border-r-0 ${
                        isSelected
                          ? 'bg-slate-900 font-bold text-white'
                          : isHovered
                            ? 'bg-sky-50 font-semibold text-slate-900'
                            : load.isOverCap
                              ? 'bg-red-50 font-semibold text-red-700'
                              : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      Q{q}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Gantt Timeline Body */}
          <div>
            {grants.length > 0 && (
              <div className="relative">
                {grants.map((grant) => {
                const scheme = grant.isLegacy
                  ? getLegacySchemeById(rules, grant.schemeId)
                  : getSchemeById(rules, grant.schemeId);
                const fullScheme = !grant.isLegacy
                  ? getSchemeById(rules, grant.schemeId)
                  : undefined;
                const role = grant.isLegacy
                  ? undefined
                  : getRoleById(rules, grant.schemeId, grant.roleId);
                const pts = getGrantPoints(grant, rules);
                const endQuarter = getGrantEndQuarter(grant);
                const extendsPastWindow =
                  (grant.outcome === 'funded' || grant.isAwarded) &&
                  quarterToIndex(endQuarter) > lastTimelineIdx;
                const grantIssues = issuesByGrant.get(grant.id) ?? [];

                return (
                  <div
                    key={grant.id}
                    className="group grid grid-cols-[308px_1fr] border-b border-slate-100 hover:bg-slate-50/70 arc-state-transition"
                  >
                    {/* Left Label & Controls Cell: Full-width two-row layout prevents label/role truncation */}
                    <div className="flex flex-col justify-center gap-1 border-r border-slate-200 px-3 py-1.5 min-w-0">
                      {/* Row 1: Grant Name + Points Badge + Alert on left; Outcome Toggle on right */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`truncate text-xs font-semibold ${
                              grant.outcome === 'unsuccessful' && !grant.isLegacy && !grant.isAwarded
                                ? 'text-slate-400 line-through'
                                : 'text-slate-900'
                            }`}
                            title={grant.label}
                          >
                            {grant.label}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                              grant.isLegacy
                                ? 'bg-slate-100 text-slate-600'
                                : grant.outcome === 'unsuccessful' && !grant.isAwarded
                                  ? 'bg-slate-100 text-slate-400'
                                  : 'bg-slate-900 text-white'
                            }`}
                          >
                            {formatPts(pts)}
                          </span>
                          {grantIssues.length > 0 && (
                            <span
                              title={grantIssues.map((i) => i.message).join(' ')}
                              className="shrink-0 text-red-600"
                              aria-label={grantIssues[0].message}
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>

                        <div className="no-print shrink-0">
                          {grant.isLegacy ? (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Legacy
                            </span>
                          ) : grant.isAwarded ? (
                            <span
                              title="Already awarded & locked in RMS (no early relinquishment). Edit grant to modify."
                              className="inline-flex items-center gap-1 rounded-full border border-teal-800/30 bg-teal-700 px-2 py-0.5 text-[10px] font-semibold text-white"
                            >
                              <Lock className="h-2.5 w-2.5" />
                              Awarded
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleOutcome(grant.id)}
                              aria-pressed={grant.outcome === 'funded'}
                              title={
                                grant.outcome === 'funded'
                                  ? 'Modelled as If Funded (locks points for full duration). Click to test If Unfunded (Plan B).'
                                  : 'Modelled as If Unfunded (points released at outcome). Click to switch back to If Funded.'
                              }
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold cursor-pointer arc-state-transition ${
                                grant.outcome === 'funded'
                                  ? 'border-teal-700/30 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:border-teal-700/50'
                                  : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 rounded-full ${
                                  grant.outcome === 'funded' ? 'bg-teal-600' : 'bg-slate-400'
                                }`}
                              />
                              {grant.outcome === 'funded' ? 'If Funded' : 'If Unfunded'}
                              <ArrowLeftRight className="h-2.5 w-2.5 opacity-55" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Role + Status + Compensation on left; Info, ARC link, Edit, Delete on right */}
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
                          <span className="shrink-0 font-medium text-slate-700">
                            {grant.isLegacy
                              ? (scheme?.shortName ?? 'Legacy')
                              : (role?.label ?? grant.roleId)}
                          </span>
                          {fullScheme && (
                            <>
                              <span className="text-slate-300">&middot;</span>
                              <span
                                className={`shrink-0 text-[10px] font-medium ${
                                  fullScheme.status === 'Confirmed'
                                    ? 'text-emerald-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {fullScheme.status}
                              </span>
                            </>
                          )}
                          {!grant.isLegacy && role && (
                            <>
                              <span className="text-slate-300">&middot;</span>
                              <span
                                className={`truncate text-[10px] ${
                                  role.compensationType === 'salaried'
                                    ? 'text-indigo-700 font-medium'
                                    : 'text-sky-700'
                                }`}
                                title={
                                  role.compensationType === 'salaried'
                                    ? 'Salaried position (cannot combine with unsalaried CI teaching relief)'
                                    : 'Unsalaried CI eligible for up to $50,000/yr teaching relief'
                                }
                              >
                                {role.compensationType === 'salaried' ? 'Salaried' : 'Teaching Relief'}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="no-print flex items-center gap-0.5 shrink-0">
                          {fullScheme && (
                            <QuirkToggletip
                              label={`Scheme quirk for ${fullScheme.name}`}
                              title={fullScheme.name}
                              status={fullScheme.status}
                              content={fullScheme.quirkHint}
                              extraMeta={`${fullScheme.fundingBandLabel} · ${fullScheme.cadence} · Max ${fullScheme.maxDurationYears} yrs`}
                            />
                          )}
                          {fullScheme && (
                            <a
                              href={fullScheme.officialUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open official ARC page for ${fullScheme.name}`}
                              className="rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-800"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditGrant(grant)}
                            aria-label={`Edit ${grant.label}`}
                            className="rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-800 cursor-pointer"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveGrant(grant.id)}
                            aria-label={`Remove ${grant.label}`}
                            className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Right 24-Quarter Gantt Track */}
                    <div className="relative grid grid-cols-24 items-center">
                      {loads.map((load, qIdx) => {
                        const phase = getGrantPhaseAtQuarter(grant, load.quarter);
                        const prevPhase =
                          qIdx > 0
                            ? getGrantPhaseAtQuarter(grant, loads[qIdx - 1].quarter)
                            : 'none';
                        const nextPhase =
                          qIdx < loads.length - 1
                            ? getGrantPhaseAtQuarter(grant, loads[qIdx + 1].quarter)
                            : 'none';

                        const isFundedLock = phase === 'awarded' || phase === 'active';
                        const prevIsFundedLock = prevPhase === 'awarded' || prevPhase === 'active';
                        const nextIsFundedLock = nextPhase === 'awarded' || nextPhase === 'active';

                        const isPendingStart = phase === 'pending' && prevPhase !== 'pending';
                        const isPendingEnd = phase === 'pending' && nextPhase !== 'pending';
                        const isFundedStart = isFundedLock && !prevIsFundedLock;
                        const isFundedEnd = isFundedLock && !nextIsFundedLock;
                        const isLegacyStart = phase === 'legacy' && prevPhase !== 'legacy';
                        const isLegacyEnd = phase === 'legacy' && nextPhase !== 'legacy';

                        const isHoveredCol = load.quarter === hoveredQuarter;
                        const isSelectedCol = load.quarter === selectedQuarter;
                        const { q } = parseQuarter(load.quarter);

                        return (
                          <div
                            key={load.quarter}
                            onMouseEnter={() => setHoveredQuarter(load.quarter)}
                            onClick={() => onSelectQuarter(load.quarter)}
                            className={`relative flex h-full min-h-[42px] items-center border-r cursor-pointer ${
                              q === 4 ? 'border-slate-200' : 'border-slate-100/80'
                            } last:border-r-0 ${
                              isHoveredCol
                                ? 'bg-sky-50/80'
                                : isSelectedCol
                                  ? 'bg-slate-100/80'
                                  : ''
                            }`}
                          >
                            {phase === 'pending' && (
                              <div
                                title={`${grant.label}: Pending lock (${formatPts(pts)}) · ${formatQuarterShort(load.quarter)}`}
                                className={`h-5 w-full border-y border-amber-500/80 bg-pending-stripes arc-state-transition ${
                                  isPendingStart ? 'ml-0.5 rounded-l border-l' : ''
                                } ${
                                  isPendingEnd && !nextIsFundedLock ? 'mr-0.5 rounded-r border-r' : ''
                                }`}
                              />
                            )}
                            {isFundedLock && (
                              <div
                                title={`${grant.label}: ${
                                  phase === 'awarded'
                                    ? 'Awarded (points locked pre-start)'
                                    : 'Active funded'
                                } (${formatPts(pts)}) · ${formatQuarterShort(load.quarter)}`}
                                className={`h-5 w-full arc-state-transition ${
                                  phase === 'active' ? 'bg-teal-700' : 'bg-teal-600/85'
                                } ${isFundedStart && prevPhase !== 'pending' ? 'ml-0.5 rounded-l' : ''} ${
                                  isFundedEnd ? 'mr-0.5 rounded-r' : ''
                                }`}
                              />
                            )}
                            {phase === 'legacy' && (
                              <div
                                title={`${grant.label}: Legacy grant (0 Research Points) · ${formatQuarterShort(load.quarter)}`}
                                className={`h-4 w-full bg-slate-300/90 arc-state-transition ${
                                  isLegacyStart ? 'ml-0.5 rounded-l' : ''
                                } ${isLegacyEnd ? 'mr-0.5 rounded-r' : ''}`}
                              />
                            )}
                            {phase === 'released' && (
                              <div
                                title={`${grant.label}: Unsuccessful (${formatPts(pts)} released at ${formatQuarterShort(load.quarter)})`}
                                className="mx-0.5 flex h-5 w-full items-center justify-center rounded border border-dashed border-slate-400 bg-slate-50 text-[8px] font-semibold tracking-tight text-slate-600"
                              >
                                Freed
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {extendsPastWindow && (
                        <span
                          title={`Funded project continues until ${formatQuarterShort(endQuarter)}`}
                          className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded bg-teal-900/95 px-1 py-0.5 font-mono text-[9px] font-semibold text-white tabular-nums"
                        >
                          &rarr;{parseQuarter(endQuarter).year}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

                {/* ECR 5-Year & Indigenous 15-Year Cutoff Vertical Dashed Lines across Gantt grant rows only */}
                {ecrFraction !== null && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-[308px] right-0"
                  >
                    <div
                      style={{ left: `${ecrFraction * 100}%` }}
                      className="absolute inset-y-0 border-l-2 border-dashed border-violet-600/80"
                    />
                  </div>
                )}
                {indigenousFraction !== null && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-[308px] right-0"
                  >
                    <div
                      style={{ left: `${indigenousFraction * 100}%` }}
                      className="absolute inset-y-0 border-l-2 border-dashed border-amber-600/80"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Consistent inline "+ Add grant" row for both empty and populated pipelines */}
            <div className="no-print grid grid-cols-[308px_1fr] border-b border-slate-100 bg-slate-50/30">
              <button
                type="button"
                onClick={onOpenAddGrant}
                className="flex items-center gap-1.5 border-r border-slate-200 px-3 py-2 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-100/80 hover:text-slate-900 cursor-pointer arc-state-transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>
                  {grants.length === 0
                    ? 'Add a grant or legacy project...'
                    : 'Add another grant or legacy project...'}
                </span>
              </button>
              <div aria-hidden="true" className="grid grid-cols-24">
                {loads.map((load) => {
                  const { q } = parseQuarter(load.quarter);
                  return (
                    <div
                      key={load.quarter}
                      className={`border-r last:border-r-0 ${
                        q === 4 ? 'border-slate-200/70' : 'border-slate-100/60'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stacked Quarterly Capacity Bar Chart (exact same 24-col grid!) */}
          <div className="grid grid-cols-[308px_1fr] border-t-2 border-slate-200 bg-slate-50/40">
            <div className="relative flex flex-col justify-between border-r border-slate-200 px-3 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  Quarterly Point Load
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Click any quarter column to see what fits.
                </p>
              </div>
              <div className="text-[11px] tabular-nums">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Peak (2027-2032):</span>
                  <span
                    className={`font-mono font-semibold ${
                      peakPoints > rules.hardCap ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {peakPoints} / {rules.hardCap} pts
                  </span>
                </div>
              </div>
            </div>

            {/* Chart Plot Area: padding-top reserves space for bar labels; cap line & bars share exact inner plot height */}
            <div className="pt-5 pb-1 select-none">
              <div className="relative h-36">
                {/* Red 13-Point Threshold Line + Axis Badge anchored cleanly to left edge outside bars */}
                <div
                  aria-hidden="true"
                  style={{ bottom: `${capLineBottomPct}%` }}
                  className="pointer-events-none absolute inset-x-0 z-10 border-t-[1.5px] border-dashed border-red-600"
                >
                  <span className="absolute right-full mr-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none text-white tabular-nums shadow-2xs">
                    {rules.hardCap}-pt cap
                  </span>
                </div>

                {/* ECR & Indigenous Cutoff Vertical Lines continuing into Capacity Chart */}
                {ecrFraction !== null && (
                  <div
                    aria-hidden="true"
                    style={{ left: `${ecrFraction * 100}%` }}
                    className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-violet-600/70"
                  >
                    <span className="absolute -top-4 left-1 whitespace-nowrap rounded bg-violet-50/95 px-1 py-0.5 text-[9px] font-semibold text-violet-800 border border-violet-200 leading-none">
                      ECR 5yr
                    </span>
                  </div>
                )}
                {indigenousFraction !== null && (
                  <div
                    aria-hidden="true"
                    style={{ left: `${indigenousFraction * 100}%` }}
                    className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-dashed border-amber-600/80"
                  >
                    <span className="absolute -top-4 left-1 whitespace-nowrap rounded bg-amber-50/95 px-1 py-0.5 text-[9px] font-semibold text-amber-900 border border-amber-300 leading-none">
                      Indig. {rules.indigenousMaxPostPhdYears}yr
                    </span>
                  </div>
                )}

                {/* 24 Quarter Bars */}
                <div className="grid h-full grid-cols-24">
                  {loads.map((load) => {
                    const { q } = parseQuarter(load.quarter);
                    const isHovered = load.quarter === hoveredQuarter;
                    const isSelected = load.quarter === selectedQuarter;

                    const totalPct = Math.min(100, (load.totalPoints / chartMaxPoints) * 100);
                    const activeShare =
                      load.totalPoints > 0 ? (load.activePoints / load.totalPoints) * 100 : 0;
                    const pendingShare =
                      load.totalPoints > 0 ? (load.pendingPoints / load.totalPoints) * 100 : 0;

                    return (
                      <button
                        key={load.quarter}
                        type="button"
                        onClick={() => onSelectQuarter(load.quarter)}
                        onMouseEnter={() => setHoveredQuarter(load.quarter)}
                        onFocus={() => setHoveredQuarter(load.quarter)}
                        aria-label={`${formatQuarterShort(load.quarter)}: ${load.totalPoints} of ${rules.hardCap} points (${load.activePoints} active, ${load.pendingPoints} pending)`}
                        className={`relative flex h-full flex-col justify-end items-center border-r px-[3px] cursor-pointer arc-state-transition ${
                          q === 4 ? 'border-slate-200' : 'border-slate-100'
                        } last:border-r-0 ${
                          isHovered
                            ? 'bg-sky-100/70'
                            : isSelected
                              ? 'bg-slate-200/60'
                              : load.isOverCap
                                ? 'bg-red-50/50'
                                : ''
                        }`}
                      >
                        {/* Value label anchored directly above its bar (z-20 + subtle backing so dashed cap line never cuts through numerals) */}
                        <span
                          className={`relative z-20 mb-1 rounded-[2px] px-0.5 font-mono text-[10px] leading-none tabular-nums ${
                            load.isOverCap
                              ? 'bg-red-50/95 font-bold text-red-700'
                              : load.totalPoints > 0
                                ? 'bg-slate-50/95 font-semibold text-slate-700'
                                : 'text-slate-300'
                          }`}
                        >
                          {load.totalPoints}
                        </span>

                        {/* Stacked bar column sized to exact totalPct */}
                        {load.totalPoints > 0 && (
                          <div
                            style={{ height: `${totalPct}%` }}
                            className="flex w-full flex-col justify-end arc-bar-transition"
                          >
                            {load.pendingPoints > 0 && (
                              <div
                                style={{ height: `${pendingShare}%` }}
                                className={`w-full rounded-t-[2px] ${
                                  load.isOverCap
                                    ? 'bg-red-400 border border-red-600'
                                    : 'bg-pending-bar-stripes border border-amber-600/60'
                                }`}
                              />
                            )}
                            {load.activePoints > 0 && (
                              <div
                                style={{ height: `${activeShare}%` }}
                                className={`w-full ${
                                  load.pendingPoints === 0 ? 'rounded-t-[2px]' : ''
                                } ${load.isOverCap ? 'bg-red-600' : 'bg-teal-700'}`}
                              />
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, ExternalLink, Plus } from 'lucide-react';
import type {
  EligibilityProfile,
  FittingRoleOption,
  GrantEntry,
  QuarterKey,
  QuarterLoadSummary,
  RulesData,
} from '../types/arc';
import { findFittingRoles } from '../engine/planner';
import { formatQuarterShort, generateTimelineQuarters } from '../engine/quarters';
import { QuirkToggletip } from './QuirkToggletip';

interface WhatFitsHelperProps {
  grants: GrantEntry[];
  rules: RulesData;
  loads: QuarterLoadSummary[];
  eligibility: EligibilityProfile;
  selectedQuarter: QuarterKey;
  onSelectQuarter: (q: QuarterKey) => void;
  onQuickAdd: (option: FittingRoleOption) => void;
  embedded?: boolean;
}

export function WhatFitsHelper({
  grants,
  rules,
  loads,
  eligibility,
  selectedQuarter,
  onSelectQuarter,
  onQuickAdd,
  embedded = false,
}: WhatFitsHelperProps) {
  const [onlyEligible, setOnlyEligible] = useState(true);
  const [onlyCleanPeak, setOnlyCleanPeak] = useState(false);

  const quarters = generateTimelineQuarters(
    rules.timelineWindow.startYear,
    rules.timelineWindow.endYear,
  );

  const { currentPoints, remainingPoints, options } = findFittingRoles(
    grants,
    rules,
    eligibility,
    selectedQuarter,
  );

  const filtered = options.filter((opt) => {
    if (onlyEligible && !opt.isEligible) return false;
    if (onlyCleanPeak && opt.exceedsCapLater) return false;
    return true;
  });

  const minRolePoints = Math.min(
    ...rules.schemes.flatMap((s) => s.roles.map((r) => r.points)),
  );
  const nextQuarterWithRoom = loads.find(
    (l) => l.quarter !== selectedQuarter && l.remainingPoints >= minRolePoints,
  );

  const ptsWord = remainingPoints === 1 ? 'pt' : 'pts';

  return (
    <aside
      aria-label="What Fits My Remaining Points Helper"
      className={
        embedded
          ? 'no-print flex flex-col'
          : 'no-print flex flex-col rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden'
      }
    >
      <div className="border-b border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {embedded ? (
            <span className="text-[11px] font-medium text-slate-600">
              Load in <strong className="text-slate-900">{formatQuarterShort(selectedQuarter)}</strong>:{' '}
              <span className="font-mono tabular-nums">
                {currentPoints}/{rules.hardCap} pts
              </span>
            </span>
          ) : (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-800">
              What Fits My Remaining Points?
            </h2>
          )}
          <select
            aria-label="Target quarter for fitting roles"
            value={selectedQuarter}
            onChange={(e) => onSelectQuarter(e.target.value as QuarterKey)}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs font-medium text-slate-800 tabular-nums cursor-pointer"
          >
            {quarters.map((q) => (
              <option key={q} value={q}>
                {formatQuarterShort(q)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-xs tabular-nums">
          {embedded ? (
            <span className="text-[11px] text-slate-500">
              Roles up to {remainingPoints} {ptsWord} at next open round
            </span>
          ) : (
            <span className="text-slate-600">
              Load in <strong>{formatQuarterShort(selectedQuarter)}</strong>: {currentPoints}/
              {rules.hardCap} pts
            </span>
          )}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
              remainingPoints < minRolePoints
                ? 'bg-red-50 text-red-700 border border-red-200'
                : remainingPoints <= 3
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-teal-50 text-teal-800 border border-teal-200'
            }`}
          >
            {remainingPoints} {ptsWord} free
          </span>
        </div>

        {!embedded && (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Valid roles up to {remainingPoints} {ptsWord}, scheduled at each scheme&apos;s next open round.
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyEligible}
              onChange={(e) => setOnlyEligible(e.target.checked)}
              className="rounded border-slate-300 accent-slate-900"
            />
            Eligible only
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyCleanPeak}
              onChange={(e) => setOnlyCleanPeak(e.target.checked)}
              className="rounded border-slate-300 accent-slate-900"
            />
            No later cap breach
          </label>
        </div>
      </div>

      <div className="max-h-[430px] overflow-y-auto divide-y divide-slate-100">
        {remainingPoints < minRolePoints ? (
          <div className="p-4 text-xs text-slate-600 space-y-2.5">
            <p>
              Only <strong>{remainingPoints} {ptsWord}</strong> free in{' '}
              <strong>{formatQuarterShort(selectedQuarter)}</strong> (the lightest ARC role is CIEF
              CI at {minRolePoints} pts). Toggle a grant to <strong>If Unfunded</strong> or pick
              another quarter.
            </p>
            {nextQuarterWithRoom && (
              <button
                type="button"
                onClick={() => onSelectQuarter(nextQuarterWithRoom.quarter)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                Jump to {formatQuarterShort(nextQuarterWithRoom.quarter)} (
                {nextQuarterWithRoom.remainingPoints} pts free)
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-xs text-slate-600 space-y-2">
            <p>
              No roles match your active filters with {remainingPoints} {ptsWord} free in{' '}
              {formatQuarterShort(selectedQuarter)}.
            </p>
            {onlyCleanPeak && (
              <button
                type="button"
                onClick={() => setOnlyCleanPeak(false)}
                className="text-[11px] font-medium text-slate-800 underline cursor-pointer"
              >
                Show roles that may overlap later rounds
              </button>
            )}
          </div>
        ) : (
          filtered.map((opt) => (
            <div
              key={`${opt.scheme.id}-${opt.role.id}`}
              className="flex items-start justify-between gap-2 px-3.5 py-2.5 hover:bg-slate-50/80 arc-state-transition"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-900">
                    {opt.scheme.shortName}
                  </span>
                  <span className="text-xs text-slate-600">{opt.role.label}</span>
                  <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white tabular-nums">
                    {opt.points} pts
                  </span>
                  <span
                    className={`rounded px-1 text-[9px] font-semibold uppercase ${
                      opt.scheme.status === 'Confirmed'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {opt.scheme.status}
                  </span>
                  <QuirkToggletip
                    label={`Details for ${opt.scheme.name}`}
                    title={opt.scheme.name}
                    status={opt.scheme.status}
                    content={opt.scheme.quirkHint}
                    extraMeta={`Launch: ${opt.scheme.indicativeLaunch} · ${opt.scheme.fundingBandLabel}`}
                  />
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 tabular-nums">
                  <span>Next round: {formatQuarterShort(opt.suggestedSubmissionQuarter)}</span>
                  <span>&middot;</span>
                  <span>{opt.scheme.fundingBandLabel}</span>
                  <a
                    href={opt.scheme.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-900 underline decoration-slate-300"
                  >
                    ARC <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${
                      opt.role.compensationType === 'salaried'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-sky-50 text-sky-700'
                    }`}
                  >
                    {opt.role.compensationType === 'salaried'
                      ? 'Salaried'
                      : 'Teaching Relief (up to $50k/yr)'}
                  </span>
                  {opt.exceedsCapLater ? (
                    <span className="inline-flex items-center gap-0.5 text-amber-700 font-medium tabular-nums">
                      <AlertCircle className="h-3 w-3" />
                      Peaks {opt.peakLoadIfAdded}/{rules.hardCap} in{' '}
                      {opt.peakExceedQuarter ? formatQuarterShort(opt.peakExceedQuarter) : 'later'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-teal-700 font-medium tabular-nums">
                      <CheckCircle2 className="h-3 w-3" />
                      Fits cleanly (peak {opt.peakLoadIfAdded}/{rules.hardCap})
                    </span>
                  )}
                </div>

                {!opt.isEligible && (
                  <p className="mt-1 text-[10px] font-medium text-red-700">
                    {opt.eligibilityIssues[0]}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => onQuickAdd(opt)}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:border-slate-900 hover:bg-slate-900 hover:text-white cursor-pointer arc-state-transition"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

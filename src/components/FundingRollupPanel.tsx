import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  ExternalLink,
  Lock,
  ShieldAlert,
} from 'lucide-react';
import type {
  EligibilityIssue,
  FundingRollup,
  QuarterLoadSummary,
  RulesData,
} from '../types/arc';
import { formatCurrencyAud, getPeakLoadSummary } from '../engine/planner';
import { formatQuarterShort } from '../engine/quarters';
import { QuirkToggletip } from './QuirkToggletip';

interface FundingRollupPanelProps {
  rules: RulesData;
  loads: QuarterLoadSummary[];
  rollup: FundingRollup;
  issues: EligibilityIssue[];
}

export function FundingRollupPanel({
  rules,
  loads,
  rollup,
  issues,
}: FundingRollupPanelProps) {
  const [showMatrix, setShowMatrix] = useState(false);
  const peak = getPeakLoadSummary(loads);

  const activeTrQuarters = loads.filter((l) => l.hasActiveTeachingRelief);
  const blockedTrQuarters = activeTrQuarters.filter((l) => l.hasActiveSci);
  const freeTrCount = activeTrQuarters.length - blockedTrQuarters.length;

  const sciIssues = issues.filter((i) => i.code === 'sci-teaching-relief-conflict');
  const otherIssues = issues.filter((i) => i.code !== 'sci-teaching-relief-conflict');

  const sciAffectedLabels = sciIssues.map((i) => i.message.split(':')[0]?.trim()).filter(Boolean);
  const sciOverlapSpan =
    blockedTrQuarters.length > 1
      ? `${formatQuarterShort(blockedTrQuarters[0].quarter)} to ${formatQuarterShort(
          blockedTrQuarters[blockedTrQuarters.length - 1].quarter,
        )}`
      : blockedTrQuarters.length === 1
        ? formatQuarterShort(blockedTrQuarters[0].quarter)
        : '';

  const overCapSpan =
    peak.overCapQuarters.length > 1
      ? `${formatQuarterShort(peak.overCapQuarters[0].quarter)} to ${formatQuarterShort(
          peak.overCapQuarters[peak.overCapQuarters.length - 1].quarter,
        )}`
      : peak.overCapQuarters.length === 1
        ? formatQuarterShort(peak.overCapQuarters[0].quarter)
        : '';

  const totalAlertCount =
    (peak.overCapQuarters.length > 0 ? 1 : 0) +
    (sciIssues.length > 0 ? 1 : 0) +
    otherIssues.length;

  let teachingReliefSummary: string;
  let teachingReliefTone = 'text-slate-800';
  if (rollup.fundedCount === 0) {
    teachingReliefSummary = rollup.hasSalariedRole ? 'Salaried fellowship (no CI teaching relief)' : 'None';
    teachingReliefTone = rollup.hasSalariedRole ? 'text-indigo-800' : 'text-slate-500';
  } else if (activeTrQuarters.length === 0 && rollup.annualTeachingReliefMax > 0) {
    teachingReliefSummary = `Eligible after ${rules.timelineWindow.endYear} (up to ${formatCurrencyAud(rules.teachingReliefMaxAnnual)}/yr)`;
    teachingReliefTone = 'text-teal-800';
  } else if (activeTrQuarters.length === 0 && rollup.hasSalariedRole) {
    teachingReliefSummary = 'Salaried role (no CI teaching relief)';
    teachingReliefTone = 'text-indigo-800';
  } else if (activeTrQuarters.length === 0) {
    teachingReliefSummary = 'None';
    teachingReliefTone = 'text-slate-500';
  } else if (blockedTrQuarters.length === 0) {
    teachingReliefSummary = `Eligible (up to ${formatCurrencyAud(rules.teachingReliefMaxAnnual)}/yr)`;
    teachingReliefTone = 'text-teal-800';
  } else if (freeTrCount === 0) {
    teachingReliefSummary = `Blocked in all ${blockedTrQuarters.length} active qtrs by ARC salary`;
    teachingReliefTone = 'text-amber-800';
  } else {
    teachingReliefSummary = `Blocked in ${blockedTrQuarters.length} of ${activeTrQuarters.length} active qtrs by ARC salary (up to ${formatCurrencyAud(rules.teachingReliefMaxAnnual)}/yr otherwise)`;
    teachingReliefTone = 'text-amber-800';
  }

  return (
    <div className="space-y-3">
      {/* Compact Single-Line Summary Bar (honest totals + teaching relief status, no 3-box grid) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs shadow-xs print-avoid-break">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <DollarSign className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>Project funding band (total):</span>
            <strong className="font-mono text-slate-900">
              {rollup.totalFundingMax > 0
                ? `${formatCurrencyAud(rollup.totalFundingMin)}-${formatCurrencyAud(rollup.totalFundingMax)}`
                : '$0'}
            </strong>
            {rollup.fundedCount > 0 && (
              <span className="text-[11px] text-slate-500">
                across {rollup.fundedCount} funded {rollup.fundedCount === 1 ? 'grant' : 'grants'}
              </span>
            )}
          </span>

          <span className="hidden sm:inline text-slate-300">|</span>

          <span className="inline-flex items-center gap-1.5 text-slate-600">
            <span>Teaching relief:</span>
            <strong className={`font-medium ${teachingReliefTone}`}>{teachingReliefSummary}</strong>
          </span>

          {rollup.extraNotes.length > 0 && (
            <>
              <span className="hidden md:inline text-slate-300">|</span>
              <span className="text-[11px] text-slate-500">{rollup.extraNotes.join(' · ')}</span>
            </>
          )}
        </div>

        <span
          title="ARC rule: active projects and roles cannot be relinquished early to free up Research Points."
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 shrink-0"
        >
          <Lock className="h-3 w-3 text-slate-400 shrink-0" />
          <span>No early relinquishment</span>
        </span>
      </div>

      {/* Grouped Eligibility, Cap & Policy Alerts (only rendered when issues exist) */}
      {totalAlertCount > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50/70 px-3.5 py-2.5 space-y-1.5"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
            <ShieldAlert className="h-4 w-4 text-amber-700" />
            Plan Alerts ({totalAlertCount})
          </div>
          <ul className="space-y-1 text-xs text-amber-950">
            {peak.overCapQuarters.length > 0 && (
              <li className="flex items-start gap-2 tabular-nums">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-600" />
                <span>
                  <strong className="text-red-800">
                    Exceeds {rules.hardCap}-point cap in {peak.overCapQuarters.length}{' '}
                    {peak.overCapQuarters.length === 1 ? 'quarter' : 'quarters'}
                  </strong>{' '}
                  ({overCapSpan}; peak{' '}
                  <strong className="font-mono text-red-800">
                    {peak.peakPoints}/{rules.hardCap}
                  </strong>
                  {peak.peakQuarter ? ` in ${formatQuarterShort(peak.peakQuarter)}` : ''}). Toggle a
                  planned grant to <strong>If Unfunded</strong> or adjust submission timing.
                </span>
              </li>
            )}

            {sciIssues.length > 0 && (
              <li className="flex items-start gap-2 tabular-nums">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700" />
                <span>
                  <strong>ARC salary overlaps CI teaching relief</strong> in{' '}
                  {blockedTrQuarters.length}{' '}
                  {blockedTrQuarters.length === 1 ? 'quarter' : 'quarters'} ({sciOverlapSpan})
                  affecting {sciAffectedLabels.join(', ')}. Teaching relief cannot be claimed during
                  quarters with an active SCI or ARC fellowship salary.
                </span>
              </li>
            )}

            {otherIssues.map((issue, idx) => (
              <li key={`${issue.grantId}-${issue.code}-${idx}`} className="flex items-start gap-2">
                <AlertTriangle
                  className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                    issue.severity === 'error' ? 'text-red-600' : 'text-amber-700'
                  }`}
                />
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Collapsible ARC NCGP Scheme & Role Quick Reference Matrix */}
      <div className="no-print rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMatrix((v) => !v)}
          aria-expanded={showMatrix}
          className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <span>
            ARC NCGP Scheme &amp; Role Reference Matrix ({rules.schemes.length} schemes · Rules v
            {rules.version})
          </span>
          {showMatrix ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showMatrix && (
          <div className="border-t border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="px-3 py-2">Scheme</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Indicative Launch</th>
                  <th className="px-3 py-2">Cadence / Max</th>
                  <th className="px-3 py-2">Funding Band</th>
                  <th className="px-3 py-2">Valid Roles &amp; Points</th>
                  <th className="px-3 py-2">ARC Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.schemes.map((scheme) => (
                  <tr key={scheme.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-900 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{scheme.name}</span>
                        {scheme.subSchemeLabel && (
                          <span className="text-[10px] font-normal text-slate-500">
                            ({scheme.subSchemeLabel})
                          </span>
                        )}
                        <QuirkToggletip
                          label={`Quirk hint for ${scheme.name}`}
                          title={scheme.name}
                          status={scheme.status}
                          content={scheme.quirkHint}
                          extraMeta={`${scheme.fundingBandLabel} · ${scheme.cadence} · Max ${scheme.maxDurationYears} yrs`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          scheme.status === 'Confirmed'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {scheme.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap tabular-nums">
                      {scheme.indicativeLaunch}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap tabular-nums">
                      {scheme.cadence} · {scheme.maxDurationYears} yrs
                    </td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap tabular-nums">
                      {scheme.fundingBandLabel}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <div className="flex flex-wrap gap-1 tabular-nums">
                        {scheme.roles.map((r) => (
                          <span
                            key={r.id}
                            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px]"
                          >
                            {r.label} <strong>({r.points})</strong>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a
                        href={scheme.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-950 underline decoration-slate-300"
                      >
                        Official
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

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

  return (
    <div className="space-y-3">
      {/* Compact Single-Bar Summary Strip (Option A: zero duplicate Peak card, ~half vertical footprint) */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden print-avoid-break">
        {/* Segment 1: Indicative Funding Band */}
        <div className="px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <DollarSign className="h-3 w-3 text-slate-400" />
            <span>Indicative Funding (If Funded)</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="font-mono text-sm font-semibold text-slate-900">
              {rollup.annualFundingMax > 0
                ? `${formatCurrencyAud(rollup.annualFundingMin)}-${formatCurrencyAud(rollup.annualFundingMax)}/yr`
                : '$0/yr'}
            </span>
            {rollup.totalFundingMax > 0 && (
              <span className="text-[11px] text-slate-500">
                {formatCurrencyAud(rollup.totalFundingMin)}-{formatCurrencyAud(rollup.totalFundingMax)}{' '}
                total ({rollup.fundedCount} {rollup.fundedCount === 1 ? 'grant' : 'grants'})
              </span>
            )}
          </div>
          {rollup.extraNotes.length > 0 && (
            <div className="mt-0.5 text-[10px] text-slate-500 truncate" title={rollup.extraNotes.join(' · ')}>
              {rollup.extraNotes.join(' · ')}
            </div>
          )}
        </div>

        {/* Segment 2: Teaching Relief & Salary */}
        <div className="px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Teaching Relief &amp; Salary
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="font-mono text-sm font-semibold text-slate-900">
              {rollup.annualTeachingReliefMax > 0
                ? `Up to ${formatCurrencyAud(rollup.annualTeachingReliefMax)}/yr`
                : rollup.hasSalariedRole
                  ? 'Salaried (No TR)'
                  : '$0/yr'}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500 leading-snug">
            {rollup.hasTeachingReliefBlockedBySci ? (
              <span className="font-medium text-amber-800">
                SCI salary overlap blocks teaching relief in overlapping quarters.
              </span>
            ) : rollup.hasSalariedRole ? (
              'Salaried role (cannot combine with CI teaching relief).'
            ) : (
              'Unsalaried CI / Lead CI eligible up to $50k/yr.'
            )}
          </div>
        </div>

        {/* Segment 3: Relinquishment & Cap Status */}
        <div
          className={`px-3.5 py-2.5 ${
            peak.overCapQuarters.length > 0 ? 'bg-red-50/60' : ''
          }`}
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {peak.overCapQuarters.length > 0 ? (
              <AlertTriangle className="h-3 w-3 text-red-600" />
            ) : (
              <Lock className="h-3 w-3 text-slate-400" />
            )}
            <span>{peak.overCapQuarters.length > 0 ? 'Over Cap Warning' : 'Point Lock Rule'}</span>
          </div>
          {peak.overCapQuarters.length > 0 ? (
            <div className="mt-0.5 text-[11px] font-semibold text-red-700 leading-snug tabular-nums">
              Exceeds {rules.hardCap} pts in {peak.overCapQuarters.length} qtr
              {peak.overCapQuarters.length === 1 ? '' : 's'} (
              {peak.overCapQuarters
                .slice(0, 3)
                .map((q) => formatQuarterShort(q.quarter))
                .join(', ')}
              {peak.overCapQuarters.length > 3 ? '...' : ''}).
            </div>
          ) : (
            <div className="mt-0.5 text-xs font-medium text-slate-800">
              No early relinquishment
            </div>
          )}
          <div className="mt-0.5 text-[11px] text-slate-500 leading-snug">
            Active projects &amp; roles stay locked until project end date.
          </div>
        </div>
      </div>

      {/* Active Eligibility & Policy Alerts */}
      {issues.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50/70 px-3.5 py-2.5 space-y-1.5"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
            <ShieldAlert className="h-4 w-4 text-amber-700" />
            Eligibility &amp; Rule Alerts ({issues.length})
          </div>
          <ul className="space-y-1 text-xs text-amber-900">
            {issues.map((issue, idx) => (
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

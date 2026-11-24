import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ResearcherProfile, RulesData } from '../types/arc';
import {
  computeEligibilityIssues,
  computeFundingRollup,
  computeQuarterlyLoads,
  formatCurrencyAud,
  getPeakLoadSummary,
} from '../engine/planner';
import { formatQuarterCompact, formatQuarterShort } from '../engine/quarters';
import { ModalDialog } from './ModalDialog';

interface ScenarioCompareModalProps {
  open: boolean;
  onClose: () => void;
  profile: ResearcherProfile;
  rules: RulesData;
  onSelectScenario: (scenarioId: string) => void;
}

export function ScenarioCompareModal({
  open,
  onClose,
  profile,
  rules,
  onSelectScenario,
}: ScenarioCompareModalProps) {
  const summaries = profile.scenarios.map((scenario) => {
    const loads = computeQuarterlyLoads(scenario.grants, rules);
    const peak = getPeakLoadSummary(loads);
    const rollup = computeFundingRollup(scenario.grants, rules, loads);
    const issues = computeEligibilityIssues(scenario.grants, rules, profile.eligibility, loads);
    return { scenario, loads, peak, rollup, issues };
  });

  const quarters = summaries[0]?.loads.map((l) => l.quarter) ?? [];

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      variant="wide"
      title={`Compare Scenarios (${profile.name})`}
      subtitle="Side-by-side comparison of peak Research Points, over-cap bottlenecks, funding bands, and quarterly loads."
    >
      <div className="space-y-5 text-xs">
        {/* Summary Cards Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2">Grants</th>
                <th className="px-3 py-2">Peak Load</th>
                <th className="px-3 py-2">Cap Status</th>
                <th className="px-3 py-2">Annual Band</th>
                <th className="px-3 py-2">Teaching Relief</th>
                <th className="px-3 py-2">Alerts</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {summaries.map(({ scenario, peak, rollup, issues }) => {
                const isActive = scenario.id === profile.activeScenarioId;
                return (
                  <tr key={scenario.id} className={isActive ? 'bg-sky-50/50' : 'hover:bg-slate-50'}>
                    <td className="px-3 py-2 font-semibold text-slate-900">
                      {scenario.name}
                      {isActive && (
                        <span className="ml-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {rollup.fundedCount} funded · {rollup.unsuccessfulCount} unfunded
                      {rollup.legacyCount > 0 ? ` · ${rollup.legacyCount} legacy` : ''}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      <span className={peak.peakPoints > rules.hardCap ? 'text-red-700' : 'text-slate-900'}>
                        {peak.peakPoints} / {rules.hardCap}
                      </span>
                      {peak.peakQuarter && (
                        <span className="ml-1 font-sans text-[11px] font-normal text-slate-500">
                          ({formatQuarterShort(peak.peakQuarter)})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {peak.overCapQuarters.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-700 font-semibold">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {peak.overCapQuarters.length} qtr over
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Within cap
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-800">
                      {rollup.annualFundingMax > 0
                        ? `${formatCurrencyAud(rollup.annualFundingMin)}-${formatCurrencyAud(rollup.annualFundingMax)}/yr`
                        : '$0'}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-700">
                      {rollup.annualTeachingReliefMax > 0
                        ? `<=${formatCurrencyAud(rollup.annualTeachingReliefMax)}/yr`
                        : '$0'}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {issues.length > 0 ? (
                        <span className="text-amber-700 font-medium">{issues.length} alert(s)</span>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!isActive && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectScenario(scenario.id);
                            onClose();
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          Switch
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Quarterly Heatmap Matrix */}
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Quarter-by-Quarter Point Load (2027-2032)
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-center border-collapse font-mono text-[10px] tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-2.5 py-1.5 text-left font-sans font-semibold sticky left-0 bg-slate-50">
                    Scenario
                  </th>
                  {quarters.map((q) => (
                    <th key={q} className="px-1 py-1.5 font-medium">
                      {formatQuarterCompact(q)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summaries.map(({ scenario, loads }) => (
                  <tr key={scenario.id}>
                    <td className="px-2.5 py-1.5 text-left font-sans font-medium text-slate-900 whitespace-nowrap sticky left-0 bg-white border-r border-slate-200">
                      {scenario.name}
                    </td>
                    {loads.map((load) => {
                      const bg = load.isOverCap
                        ? 'bg-red-600 text-white font-bold'
                        : load.totalPoints >= rules.hardCap - 1
                          ? 'bg-amber-100 text-amber-900 font-semibold'
                          : load.totalPoints > 0
                            ? 'bg-teal-50 text-teal-900'
                            : 'text-slate-300';
                      return (
                        <td
                          key={load.quarter}
                          title={`${scenario.name} · ${formatQuarterShort(load.quarter)}: ${load.totalPoints}/${rules.hardCap} pts`}
                          className={`px-1 py-1.5 border-r border-slate-100 last:border-r-0 ${bg}`}
                        >
                          {load.totalPoints}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}

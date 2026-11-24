import { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import type {
  EligibilityProfile,
  GrantEntry,
  GrantOutcome,
  QuarterKey,
  RulesData,
} from '../types/arc';
import {
  computeDefaultDatesForScheme,
  generateGenericLabel,
  getLegacySchemeById,
  getNearestRoundQuarter,
  getRoleById,
  getSchemeById,
  getSchemeRoundQuarters,
} from '../engine/rules';
import {
  addQuarters,
  formatQuarterShort,
  generateTimelineQuarters,
} from '../engine/quarters';
import { computeEligibilityIssues, getGrantEndQuarter } from '../engine/planner';
import { createId } from '../engine/templates';
import { ModalDialog } from './ModalDialog';

interface GrantFormModalProps {
  open: boolean;
  onClose: () => void;
  rules: RulesData;
  eligibility: EligibilityProfile;
  existingGrants: GrantEntry[];
  editingGrant: GrantEntry | null;
  defaultQuarter: QuarterKey;
  onSave: (grant: GrantEntry) => void;
}

export function GrantFormModal({
  open,
  onClose,
  rules,
  eligibility,
  existingGrants,
  editingGrant,
  defaultQuarter,
  onSave,
}: GrantFormModalProps) {
  const [mode, setMode] = useState<'ncgp' | 'legacy'>('ncgp');
  const [schemeId, setSchemeId] = useState<string>(rules.schemes[0]?.id ?? 'explore');
  const [roleId, setRoleId] = useState<string>(rules.schemes[0]?.roles[0]?.id ?? 'lead-ci');
  const [label, setLabel] = useState<string>('');
  const [isCustomLabel, setIsCustomLabel] = useState<boolean>(false);
  const [submissionQuarter, setSubmissionQuarter] = useState<QuarterKey>(defaultQuarter);
  const [outcomeQuarter, setOutcomeQuarter] = useState<QuarterKey>(addQuarters(defaultQuarter, 2));
  const [startQuarter, setStartQuarter] = useState<QuarterKey>(addQuarters(defaultQuarter, 3));
  const [durationYears, setDurationYears] = useState<number>(3);
  const [outcome, setOutcome] = useState<GrantOutcome>('funded');
  const [isAwarded, setIsAwarded] = useState<boolean>(false);

  const allQuarters = generateTimelineQuarters(2025, 2034);

  useEffect(() => {
    if (!open) return;

    if (editingGrant) {
      setMode(editingGrant.isLegacy ? 'legacy' : 'ncgp');
      setSchemeId(editingGrant.schemeId);
      setRoleId(editingGrant.roleId);
      setLabel(editingGrant.label);
      setIsCustomLabel(editingGrant.isCustomLabel);
      setSubmissionQuarter(editingGrant.submissionQuarter);
      setOutcomeQuarter(editingGrant.outcomeQuarter);
      setStartQuarter(editingGrant.startQuarter);
      setDurationYears(editingGrant.durationYears);
      setOutcome(editingGrant.outcome);
      setIsAwarded(Boolean(editingGrant.isAwarded));
      return;
    }

    const firstScheme = rules.schemes[0];
    if (!firstScheme) return;
    const round = getNearestRoundQuarter(firstScheme, defaultQuarter);
    const dates = computeDefaultDatesForScheme(firstScheme, round);
    setMode('ncgp');
    setSchemeId(firstScheme.id);
    setRoleId(firstScheme.roles[0]?.id ?? 'lead-ci');
    setLabel(generateGenericLabel(rules, firstScheme.id, false, existingGrants));
    setIsCustomLabel(false);
    setSubmissionQuarter(dates.submissionQuarter);
    setOutcomeQuarter(dates.outcomeQuarter);
    setStartQuarter(dates.startQuarter);
    setDurationYears(firstScheme.maxDurationYears);
    setOutcome('funded');
    setIsAwarded(false);
  }, [open, editingGrant, rules, defaultQuarter, existingGrants]);

  const handleModeChange = (nextMode: 'ncgp' | 'legacy') => {
    setMode(nextMode);
    if (nextMode === 'legacy') {
      const legacy = rules.legacySchemes[0];
      if (!legacy) return;
      setSchemeId(legacy.id);
      setRoleId('legacy-ci');
      setStartQuarter('2027-Q1');
      setSubmissionQuarter('2026-Q1');
      setOutcomeQuarter('2026-Q4');
      setDurationYears(legacy.defaultDurationYears);
      setOutcome('funded');
      if (!isCustomLabel) {
        setLabel(generateGenericLabel(rules, legacy.id, true, existingGrants));
      }
    } else {
      const scheme = rules.schemes[0];
      if (!scheme) return;
      const round = getNearestRoundQuarter(scheme, defaultQuarter);
      const dates = computeDefaultDatesForScheme(scheme, round);
      setSchemeId(scheme.id);
      setRoleId(scheme.roles[0]?.id ?? 'lead-ci');
      setSubmissionQuarter(dates.submissionQuarter);
      setOutcomeQuarter(dates.outcomeQuarter);
      setStartQuarter(dates.startQuarter);
      setDurationYears(scheme.maxDurationYears);
      if (!isCustomLabel) {
        setLabel(generateGenericLabel(rules, scheme.id, false, existingGrants));
      }
    }
  };

  const handleSchemeChange = (nextSchemeId: string) => {
    setSchemeId(nextSchemeId);
    if (mode === 'legacy') {
      const legacy = getLegacySchemeById(rules, nextSchemeId);
      if (legacy) {
        setDurationYears(legacy.defaultDurationYears);
        if (!isCustomLabel) {
          setLabel(generateGenericLabel(rules, nextSchemeId, true, existingGrants));
        }
      }
      return;
    }

    const scheme = getSchemeById(rules, nextSchemeId);
    if (!scheme) return;
    setRoleId(scheme.roles[0]?.id ?? 'lead-ci');
    const round = getNearestRoundQuarter(scheme, defaultQuarter);
    const dates = computeDefaultDatesForScheme(scheme, round);
    setSubmissionQuarter(dates.submissionQuarter);
    setOutcomeQuarter(dates.outcomeQuarter);
    setStartQuarter(dates.startQuarter);
    setDurationYears(scheme.maxDurationYears);
    if (!isCustomLabel) {
      setLabel(generateGenericLabel(rules, nextSchemeId, false, existingGrants));
    }
  };

  const handleSubmissionQuarterChange = (nextSub: QuarterKey) => {
    setSubmissionQuarter(nextSub);
    const scheme = getSchemeById(rules, schemeId);
    if (scheme) {
      const dates = computeDefaultDatesForScheme(scheme, nextSub);
      setOutcomeQuarter(dates.outcomeQuarter);
      setStartQuarter(dates.startQuarter);
    }
  };

  const selectedScheme = mode === 'ncgp' ? getSchemeById(rules, schemeId) : undefined;
  const selectedLegacy = mode === 'legacy' ? getLegacySchemeById(rules, schemeId) : undefined;
  const selectedRole =
    mode === 'ncgp' ? getRoleById(rules, schemeId, roleId) : undefined;

  const candidateGrant: GrantEntry = {
    id: editingGrant?.id ?? 'preview',
    isLegacy: mode === 'legacy',
    isAwarded: mode === 'ncgp' ? isAwarded : false,
    schemeId,
    roleId: mode === 'legacy' ? 'legacy-ci' : roleId,
    label: label.trim() || generateGenericLabel(rules, schemeId, mode === 'legacy', existingGrants),
    isCustomLabel,
    submissionQuarter,
    outcomeQuarter,
    startQuarter,
    durationYears,
    outcome: mode === 'legacy' || isAwarded ? 'funded' : outcome,
  };

  const previewIssues =
    mode === 'ncgp' ? computeEligibilityIssues([candidateGrant], rules, eligibility) : [];

  const recommendedRounds = selectedScheme
    ? getSchemeRoundQuarters(selectedScheme, 2027, 2032)
    : [];

  const maxDur = selectedScheme?.maxDurationYears ?? selectedLegacy?.maxDurationYears ?? 5;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...candidateGrant,
      id: editingGrant?.id ?? createId('grant'),
    });
    onClose();
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={editingGrant ? `Edit ${editingGrant.label}` : 'Add Grant to Pipeline'}
      subtitle="Default labels stay generic so you never need to enter unpublished grant titles."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 sm:py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="grant-editor-form"
            className="rounded-md bg-slate-900 px-4 py-2 sm:py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            {editingGrant ? 'Save Changes' : 'Add to Timeline'}
          </button>
        </>
      }
    >
      <form id="grant-editor-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* NCGP vs Legacy Type Selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('ncgp')}
            className={`rounded-md border px-3 py-2 text-left cursor-pointer arc-state-transition ${
              mode === 'ncgp'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="font-semibold">ARC NCGP Scheme</div>
            <div className={`text-[11px] ${mode === 'ncgp' ? 'text-slate-300' : 'text-slate-500'}`}>
              Counts toward 13-point cap
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('legacy')}
            className={`rounded-md border px-3 py-2 text-left cursor-pointer arc-state-transition ${
              mode === 'legacy'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="font-semibold">Legacy Grant (0 Points)</div>
            <div className={`text-[11px] ${mode === 'legacy' ? 'text-slate-300' : 'text-slate-500'}`}>
              DP, LP, DECRA, FT workload tracking
            </div>
          </button>
        </div>

        {/* Scheme & Role */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="grant-scheme" className="block font-medium text-slate-700 mb-1">
              Scheme
            </label>
            <select
              id="grant-scheme"
              value={schemeId}
              onChange={(e) => handleSchemeChange(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
            >
              {mode === 'ncgp'
                ? rules.schemes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.status} · {s.indicativeLaunch})
                    </option>
                  ))
                : rules.legacySchemes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (0 pts)
                    </option>
                  ))}
            </select>
          </div>

          {mode === 'ncgp' && selectedScheme && (
            <div>
              <label htmlFor="grant-role" className="block font-medium text-slate-700 mb-1">
                Investigator Role
              </label>
              <select
                id="grant-role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
              >
                {selectedScheme.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.points} pts ·{' '}
                    {r.compensationType === 'salaried' ? 'Salaried' : 'Teaching Relief <=$50k/yr'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Scheme Metadata & Quirk Banner */}
        {selectedScheme && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{selectedScheme.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    selectedScheme.status === 'Confirmed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {selectedScheme.status}
                </span>
                <span className="text-[11px] text-slate-600 tabular-nums">
                  {selectedScheme.fundingBandLabel}
                </span>
              </div>
              <a
                href={selectedScheme.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-950 underline decoration-slate-300"
              >
                Official ARC page
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-600">{selectedScheme.quirkHint}</p>
            {selectedRole && (
              <p className="text-[11px] text-slate-500">
                Role cue:{' '}
                {selectedRole.compensationType === 'salaried'
                  ? 'Salaried position (cannot be combined with unsalaried CI teaching relief in overlapping quarters).'
                  : 'Unsalaried CI eligible for up to $50,000/year in teaching relief.'}
              </p>
            )}
          </div>
        )}

        {selectedLegacy && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
            {selectedLegacy.description}
          </div>
        )}

        {/* Generic / Custom Label */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="grant-label" className="font-medium text-slate-700">
              Label (kept generic by default for privacy)
            </label>
            {isCustomLabel && (
              <button
                type="button"
                onClick={() => {
                  setIsCustomLabel(false);
                  setLabel(generateGenericLabel(rules, schemeId, mode === 'legacy', existingGrants));
                }}
                className="text-[11px] text-slate-500 hover:text-slate-900 underline cursor-pointer"
              >
                Reset to generic label
              </button>
            )}
          </div>
          <input
            id="grant-label"
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setIsCustomLabel(true);
            }}
            placeholder="e.g. Explore #1"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
          />
        </div>

        {/* Schedule Controls */}
        {mode === 'ncgp' ? (
          <div className="space-y-2.5">
            {/* Optional Already-Awarded Lock Toggle (for 2027-2028+ active NCGP grants) */}
            <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isAwarded}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsAwarded(checked);
                  if (checked) setOutcome('funded');
                }}
                className="mt-0.5 rounded border-slate-300 accent-teal-700"
              />
              <span className="text-[11px] text-slate-700">
                <strong className="text-slate-900">Already awarded / active in RMS</strong>{' '}
                (skips pending review lock and prevents accidentally flipping to If Unfunded during
                Plan B testing)
              </span>
            </label>

            {!isAwarded && recommendedRounds.length > 0 && (
              <div>
                <span className="block text-[11px] font-medium text-slate-600 mb-1">
                  Indicative {selectedScheme?.cadence} Round Windows ({selectedScheme?.indicativeLaunch}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {recommendedRounds.map((rq) => (
                    <button
                      key={rq}
                      type="button"
                      onClick={() => handleSubmissionQuarterChange(rq)}
                      className={`rounded border px-2 py-0.5 font-mono text-[11px] tabular-nums cursor-pointer ${
                        submissionQuarter === rq
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {formatQuarterShort(rq)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`grid gap-2.5 ${isAwarded ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
              {!isAwarded && (
                <>
                  <div>
                    <label htmlFor="sub-q" className="block font-medium text-slate-700 mb-1">
                      Submit / Lock
                    </label>
                    <select
                      id="sub-q"
                      value={submissionQuarter}
                      onChange={(e) => handleSubmissionQuarterChange(e.target.value as QuarterKey)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs tabular-nums"
                    >
                      {allQuarters.map((q) => (
                        <option key={q} value={q}>
                          {formatQuarterShort(q)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="out-q" className="block font-medium text-slate-700 mb-1">
                      Outcome
                    </label>
                    <select
                      id="out-q"
                      value={outcomeQuarter}
                      onChange={(e) => setOutcomeQuarter(e.target.value as QuarterKey)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs tabular-nums"
                    >
                      {allQuarters.map((q) => (
                        <option key={q} value={q}>
                          {formatQuarterShort(q)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label htmlFor="start-q" className="block font-medium text-slate-700 mb-1">
                  Project Start
                </label>
                <select
                  id="start-q"
                  value={startQuarter}
                  onChange={(e) => setStartQuarter(e.target.value as QuarterKey)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs tabular-nums"
                >
                  {allQuarters.map((q) => (
                    <option key={q} value={q}>
                      {formatQuarterShort(q)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dur-yrs" className="block font-medium text-slate-700 mb-1">
                  Duration (yrs)
                </label>
                <select
                  id="dur-yrs"
                  value={durationYears}
                  onChange={(e) => setDurationYears(Number(e.target.value))}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs tabular-nums"
                >
                  {Array.from({ length: maxDur }, (_, i) => i + 1).map((yr) => (
                    <option key={yr} value={yr}>
                      {yr} {yr === 1 ? 'yr' : 'yrs'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-[11px] text-slate-600 tabular-nums">
                Active through <strong>{formatQuarterShort(getGrantEndQuarter(candidateGrant))}</strong>
              </span>
              {isAwarded ? (
                <span className="text-[11px] font-semibold text-teal-800">
                  Locked as Awarded (no early relinquishment)
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-700">Modelled Outcome:</span>
                  <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setOutcome('funded')}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                        outcome === 'funded'
                          ? 'bg-teal-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      If Funded
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutcome('unsuccessful')}
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold cursor-pointer ${
                        outcome === 'unsuccessful'
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      If Unfunded
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="legacy-start" className="block font-medium text-slate-700 mb-1">
                Active Start Quarter
              </label>
              <select
                id="legacy-start"
                value={startQuarter}
                onChange={(e) => setStartQuarter(e.target.value as QuarterKey)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs tabular-nums"
              >
                {allQuarters.map((q) => (
                  <option key={q} value={q}>
                    {formatQuarterShort(q)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="legacy-dur" className="block font-medium text-slate-700 mb-1">
                Remaining / Total Duration (yrs)
              </label>
              <select
                id="legacy-dur"
                value={durationYears}
                onChange={(e) => setDurationYears(Number(e.target.value))}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs tabular-nums"
              >
                {Array.from({ length: maxDur }, (_, i) => i + 1).map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === 1 ? 'yr' : 'yrs'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Live Eligibility Warnings */}
        {previewIssues.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 space-y-1">
            {previewIssues.map((issue, idx) => (
              <div key={idx} className="flex items-start gap-2 text-[11px] text-red-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </form>
    </ModalDialog>
  );
}

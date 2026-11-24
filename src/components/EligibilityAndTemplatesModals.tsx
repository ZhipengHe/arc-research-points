import { useEffect, useState } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import type { EligibilityProfile, RulesData } from '../types/arc';
import { computeEcrCutoffDate, formatDateShort } from '../engine/quarters';
import { STARTER_TEMPLATES, type StarterTemplateDefinition } from '../engine/templates';
import { ModalDialog } from './ModalDialog';

interface EligibilityModalProps {
  open: boolean;
  onClose: () => void;
  profileName: string;
  eligibility: EligibilityProfile;
  rules: RulesData;
  onSave: (next: EligibilityProfile) => void;
}

export function EligibilityModal({
  open,
  onClose,
  profileName,
  eligibility,
  rules,
  onSave,
}: EligibilityModalProps) {
  const [phdDate, setPhdDate] = useState(eligibility.phdConferralDate);
  const [interruptionMonths, setInterruptionMonths] = useState(
    eligibility.careerInterruptionMonths,
  );
  const [isIndigenous, setIsIndigenous] = useState(eligibility.isIndigenousResearcher);

  useEffect(() => {
    if (!open) return;
    setPhdDate(eligibility.phdConferralDate);
    setInterruptionMonths(eligibility.careerInterruptionMonths);
    setIsIndigenous(eligibility.isIndigenousResearcher);
  }, [open, eligibility]);

  const cutoffDate = computeEcrCutoffDate(phdDate, interruptionMonths, rules.ecrYearsCutoff);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      phdConferralDate: phdDate,
      careerInterruptionMonths: Math.max(0, Math.round(interruptionMonths || 0)),
      isIndigenousResearcher: isIndigenous,
    });
    onClose();
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={`Eligibility Profile (${profileName})`}
      subtitle="Optional local-only settings to plot your 5-year ECR cutoff line and validate restricted roles."
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="phd-date" className="block font-medium text-slate-700 mb-1">
              PhD Conferral Date (optional)
            </label>
            <input
              id="phd-date"
              type="date"
              value={phdDate}
              onChange={(e) => setPhdDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="interruption-months" className="block font-medium text-slate-700 mb-1">
              Career Interruption (months)
            </label>
            <input
              id="interruption-months"
              type="number"
              min={0}
              max={120}
              value={interruptionMonths}
              onChange={(e) => setInterruptionMonths(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 tabular-nums"
            />
          </div>
        </div>

        {cutoffDate ? (
          <div className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50/70 px-3 py-2.5 text-violet-950">
            <Calendar className="h-4 w-4 text-violet-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">
                Calculated {rules.ecrYearsCutoff}-Year ECR Cutoff: {formatDateShort(cutoffDate)}
              </div>
              <p className="mt-0.5 text-[11px] text-violet-800">
                A vertical dashed line will render on the timeline &amp; capacity chart. Initiate
                Fellowships and SCI (ECR) roles submitted after this date will be flagged.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            Leave PhD conferral date blank if you do not need the 5-year ECR cutoff line.
          </p>
        )}

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isIndigenous}
              onChange={(e) => setIsIndigenous(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 accent-slate-900"
            />
            <div>
              <div className="font-semibold text-slate-900">
                Aboriginal and Torres Strait Islander Researcher
              </div>
              <p className="mt-0.5 text-[11px] text-slate-600">
                Unlocks and validates <strong>Indigenous Excellence</strong> and the{' '}
                <strong>SCI (MCR)</strong> role (up to {rules.indigenousMaxPostPhdYears} yrs
                post-PhD).
              </p>
            </div>
          </label>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => {
              setPhdDate('');
              setInterruptionMonths(0);
              setIsIndigenous(false);
            }}
            className="text-[11px] text-slate-500 hover:text-slate-900 underline cursor-pointer"
          >
            Clear profile
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Save Profile
            </button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}

interface TemplatesModalProps {
  open: boolean;
  onClose: () => void;
  onApplyTemplate: (template: StarterTemplateDefinition, mode: 'new-scenario' | 'replace') => void;
}

export function TemplatesModal({ open, onClose, onApplyTemplate }: TemplatesModalProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Starter Pipeline Templates"
      subtitle="Load a realistic career-stage ARC NCGP pipeline to explore the 13-point cap, ECR cutoff, and scenario trade-offs."
    >
      <div className="space-y-3 text-xs">
        {STARTER_TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="rounded-lg border border-slate-200 bg-white p-3.5 hover:border-slate-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                  <h3 className="font-semibold text-slate-900">{tpl.name}</h3>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                    {tpl.badge}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">{tpl.description}</p>
                <div className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
                  {tpl.grants.length} entries · Sample PhD conferral {tpl.eligibility.phdConferralDate}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onApplyTemplate(tpl, 'new-scenario');
                    onClose();
                  }}
                  className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                >
                  Open as New Tab
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyTemplate(tpl, 'replace');
                    onClose();
                  }}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Replace Current
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ModalDialog>
  );
}

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { CustomRulesOverride, QuarterKey, RulesData } from '../types/arc';
import { createEmptyOverrides, hasActiveOverrides } from '../engine/rules';
import { formatQuarterShort, generateTimelineQuarters } from '../engine/quarters';
import { ModalDialog } from './ModalDialog';

interface CustomRulesModalProps {
  open: boolean;
  onClose: () => void;
  baseRules: RulesData;
  overrides: CustomRulesOverride;
  onSave: (next: CustomRulesOverride) => void;
}

export function CustomRulesModal({
  open,
  onClose,
  baseRules,
  overrides,
  onSave,
}: CustomRulesModalProps) {
  const [draft, setDraft] = useState<CustomRulesOverride>(overrides);
  const quarters = generateTimelineQuarters(2027, 2032);

  useEffect(() => {
    if (!open) return;
    setDraft({
      hardCap: overrides.hardCap,
      schemeRolePoints: JSON.parse(JSON.stringify(overrides.schemeRolePoints)),
      schemeFirstRoundQuarter: { ...overrides.schemeFirstRoundQuarter },
      schemeOutcomeLagQuarters: { ...overrides.schemeOutcomeLagQuarters },
    });
  }, [open, overrides]);

  const setRolePoints = (schemeId: string, roleId: string, defaultPts: number, value: number) => {
    setDraft((prev) => {
      const nextMap = { ...prev.schemeRolePoints };
      const schemeRoles = { ...(nextMap[schemeId] ?? {}) };
      if (value === defaultPts) {
        delete schemeRoles[roleId];
      } else {
        schemeRoles[roleId] = value;
      }
      if (Object.keys(schemeRoles).length === 0) {
        delete nextMap[schemeId];
      } else {
        nextMap[schemeId] = schemeRoles;
      }
      return { ...prev, schemeRolePoints: nextMap };
    });
  };

  const setFirstRound = (schemeId: string, defaultQuarter: QuarterKey, value: QuarterKey) => {
    setDraft((prev) => {
      const next = { ...prev.schemeFirstRoundQuarter };
      if (value === defaultQuarter) {
        delete next[schemeId];
      } else {
        next[schemeId] = value;
      }
      return { ...prev, schemeFirstRoundQuarter: next };
    });
  };

  const setOutcomeLag = (schemeId: string, defaultLag: number, value: number) => {
    setDraft((prev) => {
      const next = { ...prev.schemeOutcomeLagQuarters };
      if (value === defaultLag) {
        delete next[schemeId];
      } else {
        next[schemeId] = value;
      }
      return { ...prev, schemeOutcomeLagQuarters: next };
    });
  };

  const activeDiff = hasActiveOverrides(draft);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      variant="wide"
      title="Custom Rules Override (Local Sandbox)"
      subtitle={`Override point weights, cap, or indicative launch quarters locally for hypothetical testing. Built-in defaults come from rules.json v${baseRules.version}.`}
      footer={
        <>
          <button
            type="button"
            onClick={() => setDraft(createEmptyOverrides())}
            disabled={!activeDiff}
            className="mr-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Default Rules
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-md bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            Apply Overrides
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <div>
            <div className="font-semibold text-slate-900">Investigator Research Points Cap</div>
            <div className="text-[11px] text-slate-500">
              Default ARC cap: {baseRules.hardCap} points
            </div>
          </div>
          <input
            type="number"
            aria-label="Custom hard cap"
            min={1}
            max={40}
            value={draft.hardCap ?? baseRules.hardCap}
            onChange={(e) => {
              const val = Number(e.target.value);
              setDraft((prev) => ({
                ...prev,
                hardCap: val === baseRules.hardCap ? undefined : Math.max(1, val),
              }));
            }}
            className="w-20 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-right tabular-nums"
          />
        </div>

        <div className="space-y-2.5">
          {baseRules.schemes.map((scheme) => {
            const firstRound = draft.schemeFirstRoundQuarter[scheme.id] ?? scheme.firstRoundQuarter;
            const outcomeLag = draft.schemeOutcomeLagQuarters[scheme.id] ?? scheme.outcomeLagQuarters;
            return (
              <div
                key={scheme.id}
                className="rounded-lg border border-slate-200 bg-white p-3 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{scheme.name}</span>
                    <span className="text-[11px] text-slate-500">({scheme.status})</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                      First Round:
                      <select
                        value={firstRound}
                        onChange={(e) =>
                          setFirstRound(scheme.id, scheme.firstRoundQuarter, e.target.value as QuarterKey)
                        }
                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
                      >
                        {quarters.map((q) => (
                          <option key={q} value={q}>
                            {formatQuarterShort(q)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                      Outcome Lag (qtrs):
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={outcomeLag}
                        onChange={(e) =>
                          setOutcomeLag(
                            scheme.id,
                            scheme.outcomeLagQuarters,
                            Math.max(1, Number(e.target.value)),
                          )
                        }
                        className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-right tabular-nums"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {scheme.roles.map((role) => {
                    const overridden = draft.schemeRolePoints[scheme.id]?.[role.id];
                    const currentPts = overridden ?? role.points;
                    const isChanged = overridden !== undefined && overridden !== role.points;
                    return (
                      <label
                        key={role.id}
                        className={`inline-flex items-center gap-2 rounded border px-2 py-1 text-[11px] ${
                          isChanged
                            ? 'border-amber-400 bg-amber-50/70 text-amber-950'
                            : 'border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>{role.label}</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={currentPts}
                          onChange={(e) =>
                            setRolePoints(
                              scheme.id,
                              role.id,
                              role.points,
                              Math.max(0, Number(e.target.value)),
                            )
                          }
                          className="w-12 rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-right tabular-nums"
                        />
                        <span className="text-[10px] text-slate-400">pts</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalDialog>
  );
}

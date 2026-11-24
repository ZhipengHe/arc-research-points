import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Link2,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type { GrantEntry, QuarterKey, ResearcherProfile, RulesData } from '../types/arc';
import {
  checkCollaboratorFit,
  computeQuarterlyLoads,
  getGrantEndQuarter,
  getGrantPoints,
} from '../engine/planner';
import {
  computeDefaultDatesForScheme,
  getNearestRoundQuarter,
  getRoleById,
  getSchemeById,
  getSchemeRoundQuarters,
} from '../engine/rules';
import {
  formatQuarterShort,
  generateTimelineQuarters,
  parseQuarter,
  quarterToIndex,
} from '../engine/quarters';
import { decodeShareHash, type SharedPlanPayload } from '../utils/shareLink';

interface CollaboratorCheckCardProps {
  profiles: ResearcherProfile[];
  activeProfileId: string;
  primaryGrants: GrantEntry[];
  rules: RulesData;
  selectedQuarter: QuarterKey;
  embedded?: boolean;
  onSelectProfile: (profileId: string) => void;
  onAddCollaborator: (name: string, importedPlan?: SharedPlanPayload) => void;
  onRemoveCollaborator: (profileId: string) => void;
  onOpenAddCollaboratorGrant: (profile: ResearcherProfile) => void;
  onOpenEditCollaboratorGrant: (profile: ResearcherProfile, grant: GrantEntry) => void;
  onRemoveCollaboratorGrant: (profileId: string, grantId: string) => void;
}

export function CollaboratorCheckCard({
  profiles,
  activeProfileId,
  primaryGrants,
  rules,
  selectedQuarter,
  embedded = false,
  onSelectProfile,
  onAddCollaborator,
  onRemoveCollaborator,
  onOpenAddCollaboratorGrant,
  onOpenEditCollaboratorGrant,
  onRemoveCollaboratorGrant,
}: CollaboratorCheckCardProps) {
  const ncgpPrimaryGrants = primaryGrants.filter((g) => !g.isLegacy);
  const defaultScheme = rules.schemes[0];

  const [selectedBidKey, setSelectedBidKey] = useState<string>(
    ncgpPrimaryGrants[0]?.id ?? 'custom',
  );
  const [customSchemeId, setCustomSchemeId] = useState<string>(defaultScheme?.id ?? 'explore');
  const [customQuarter, setCustomQuarter] = useState<QuarterKey>(
    defaultScheme?.firstRoundQuarter ?? '2027-Q1',
  );
  const [targetRoleId, setTargetRoleId] = useState<string>('ci');

  const [addingName, setAddingName] = useState('');
  const [shareUrlInput, setShareUrlInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'closed' | 'blank' | 'link'>('closed');

  useEffect(() => {
    if (selectedBidKey !== 'custom') {
      const stillExists = ncgpPrimaryGrants.some((g) => g.id === selectedBidKey);
      if (!stillExists) {
        setSelectedBidKey(ncgpPrimaryGrants[0]?.id ?? 'custom');
      }
    }
  }, [ncgpPrimaryGrants, selectedBidKey]);

  const linkedGrant =
    selectedBidKey !== 'custom'
      ? ncgpPrimaryGrants.find((g) => g.id === selectedBidKey)
      : undefined;

  const targetSchemeId = linkedGrant ? linkedGrant.schemeId : customSchemeId;
  const targetScheme = getSchemeById(rules, targetSchemeId) ?? rules.schemes[0];
  const validRoleId = targetScheme?.roles.some((r) => r.id === targetRoleId)
    ? targetRoleId
    : (targetScheme?.roles.find((r) => r.id === 'ci')?.id ?? targetScheme?.roles[0]?.id ?? 'ci');

  const timelineQuarters = generateTimelineQuarters(
    rules.timelineWindow.startYear,
    rules.timelineWindow.endYear,
  );

  const customSchemeRounds = targetScheme
    ? getSchemeRoundQuarters(
        targetScheme,
        rules.timelineWindow.startYear,
        rules.timelineWindow.endYear,
      )
    : [];
  const customQuarterOptions =
    customSchemeRounds.length > 0 ? customSchemeRounds : timelineQuarters;

  const effectiveQuarter: QuarterKey = linkedGrant
    ? linkedGrant.submissionQuarter
    : customQuarterOptions.includes(customQuarter)
      ? customQuarter
      : (customQuarterOptions[0] ?? '2027-Q1');
  const effectiveDuration = linkedGrant?.durationYears ?? targetScheme?.maxDurationYears ?? 3;

  // Compute target bid lock window [subIdx, endIdx] for visual overlap highlight
  const bidDates = targetScheme
    ? computeDefaultDatesForScheme(targetScheme, effectiveQuarter)
    : {
        submissionQuarter: effectiveQuarter,
        outcomeQuarter: effectiveQuarter,
        startQuarter: effectiveQuarter,
      };
  const bidPreviewGrant: GrantEntry = {
    id: '__bid_preview__',
    isLegacy: false,
    schemeId: targetSchemeId,
    roleId: validRoleId,
    label: linkedGrant?.label ?? targetScheme?.shortName ?? 'Bid',
    isCustomLabel: false,
    submissionQuarter: linkedGrant?.submissionQuarter ?? bidDates.submissionQuarter,
    outcomeQuarter: linkedGrant?.outcomeQuarter ?? bidDates.outcomeQuarter,
    startQuarter: linkedGrant?.startQuarter ?? bidDates.startQuarter,
    durationYears: effectiveDuration,
    outcome: 'funded',
  };
  const bidLockStartQuarter = linkedGrant?.isAwarded
    ? linkedGrant.startQuarter
    : bidPreviewGrant.submissionQuarter;
  const bidLockEndQuarter = getGrantEndQuarter(bidPreviewGrant);
  const bidStartIdx = quarterToIndex(bidLockStartQuarter);
  const bidEndIdx = quarterToIndex(bidLockEndQuarter);

  const handleBidKeyChange = (nextKey: string) => {
    setSelectedBidKey(nextKey);
    if (nextKey !== 'custom') {
      const g = ncgpPrimaryGrants.find((item) => item.id === nextKey);
      const s = g ? getSchemeById(rules, g.schemeId) : undefined;
      if (s && !s.roles.some((r) => r.id === targetRoleId)) {
        setTargetRoleId(s.roles.find((r) => r.id === 'ci')?.id ?? s.roles[0]?.id ?? 'ci');
      }
    }
  };

  const handleCustomSchemeChange = (nextSchemeId: string) => {
    setCustomSchemeId(nextSchemeId);
    const nextScheme = getSchemeById(rules, nextSchemeId);
    if (!nextScheme) return;
    if (!nextScheme.roles.some((r) => r.id === targetRoleId)) {
      setTargetRoleId(
        nextScheme.roles.find((r) => r.id === 'ci')?.id ?? nextScheme.roles[0]?.id ?? 'ci',
      );
    }
    setCustomQuarter(getNearestRoundQuarter(nextScheme, selectedQuarter));
  };

  const collaborators = profiles.filter((p) => !p.isPrimary);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addingName.trim();
    if (!trimmed) return;
    onAddCollaborator(trimmed);
    setAddingName('');
    setAddMode('closed');
  };

  const handleImportLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    const raw = shareUrlInput.trim();
    if (!raw) {
      setImportError('Paste a colleague shareable URL or #plan=... link.');
      return;
    }
    let hashPart = raw;
    try {
      if (raw.includes('#')) {
        hashPart = `#${raw.split('#').slice(1).join('#')}`;
      }
    } catch {
      hashPart = raw;
    }
    const decoded = await decodeShareHash(hashPart);
    if (!decoded) {
      setImportError('Could not read a valid ARC plan from that URL.');
      return;
    }
    const fallbackName =
      decoded.scenarioName && decoded.scenarioName !== 'Shared Plan'
        ? decoded.scenarioName
        : `Co-CI ${collaborators.length + 1}`;
    onAddCollaborator(addingName.trim() || fallbackName, decoded);
    setAddingName('');
    setShareUrlInput('');
    setAddMode('closed');
  };

  const chartMaxPts = rules.hardCap + 4;
  const capBottomPct = (rules.hardCap / chartMaxPts) * 100;

  return (
    <section
      aria-label="Team and Co-CI Point Check"
      className={
        embedded
          ? 'no-print flex flex-col'
          : 'no-print rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden'
      }
    >
      {/* Action Header Bar */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-3.5 py-2">
        {embedded ? (
          <span className="text-[11px] text-slate-600 tabular-nums">
            {collaborators.length === 0
              ? 'No Co-CIs yet'
              : `${collaborators.length} ${collaborators.length === 1 ? 'Co-CI' : 'Co-CIs'}`}
          </span>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="h-3.5 w-3.5 text-slate-600 shrink-0" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-800 truncate">
              Team / Co-CI Check
            </h2>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setAddMode((prev) => (prev === 'link' ? 'closed' : 'link'));
            }}
            title="Import a colleague's Shareable URL to load their grants automatically"
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer arc-state-transition ${
              addMode === 'link'
                ? 'border-teal-700 bg-teal-50 text-teal-900'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Link2 className="h-3 w-3 shrink-0" />
            <span>Import Link</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setAddMode((prev) => (prev === 'blank' ? 'closed' : 'blank'));
            }}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer arc-state-transition ${
              addMode === 'blank'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <UserPlus className="h-3 w-3 shrink-0" />
            <span>Add Co-CI</span>
          </button>
        </div>
      </div>

      <div className="max-h-[500px] overflow-y-auto p-3.5 space-y-3 text-xs">
        {/* Manual Add Co-CI Form */}
        {addMode === 'blank' && (
          <form
            onSubmit={handleAddSubmit}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-2"
          >
            <input
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              placeholder="Colleague name (e.g. Prof. Smith)"
              autoFocus
              className="flex-1 min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAddMode('closed')}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Import Collaborator via Shareable URL */}
        {addMode === 'link' && (
          <form
            onSubmit={handleImportLinkSubmit}
            className="space-y-2 rounded-md border border-teal-200 bg-teal-50/50 p-2.5"
          >
            <div className="text-[11px] font-semibold text-teal-950">
              Import Colleague&apos;s Shareable URL
            </div>
            <p className="text-[11px] text-teal-900/80 leading-snug">
              Ask your Co-CI to copy their Shareable URL from Export / AI and paste it here to load
              their existing ARC grants automatically.
            </p>
            <input
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              placeholder="Colleague name (optional)"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={shareUrlInput}
              onChange={(e) => setShareUrlInput(e.target.value)}
              placeholder="Paste https://.../#plan=... URL"
              autoFocus
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px]"
            />
            {importError && <p className="text-[11px] font-medium text-red-700">{importError}</p>}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setAddMode('closed')}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-teal-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-900 cursor-pointer"
              >
                Import Co-CI
              </button>
            </div>
          </form>
        )}

        {collaborators.length === 0 ? (
          <div className="space-y-2 py-2 text-[11px] text-slate-600 leading-relaxed">
            <p>
              <strong>Check if a colleague has free points</strong> to join one of your planned ARC
              bids without leaving your timeline.
            </p>
            <p className="text-slate-500">
              Click <strong>Add Co-CI</strong> to record their current ARC grants using the full
              grant editor, or <strong>Import Link</strong> to paste their Shareable URL.
            </p>
          </div>
        ) : (
          <>
            {/* Target Bid Selector linked directly to YOUR pipeline grants */}
            <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5 space-y-2">
              <div className="grid grid-cols-[1fr_auto] gap-1.5 items-end">
                <label className="block space-y-0.5 min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Check who can join
                  </span>
                  <select
                    aria-label="Select bid to check collaborators against"
                    value={selectedBidKey}
                    onChange={(e) => handleBidKeyChange(e.target.value)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800"
                  >
                    {ncgpPrimaryGrants.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label} ({formatQuarterShort(g.submissionQuarter)})
                      </option>
                    ))}
                    <option value="custom">Custom bid...</option>
                  </select>
                </label>

                <label className="block space-y-0.5">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    As Role
                  </span>
                  <select
                    aria-label="Collaborator role in bid"
                    value={validRoleId}
                    onChange={(e) => setTargetRoleId(e.target.value)}
                    className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-800"
                  >
                    {targetScheme?.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.points} pts)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {selectedBidKey === 'custom' && (
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200/80">
                  <label className="block space-y-0.5">
                    <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      Scheme
                    </span>
                    <select
                      aria-label="Custom bid scheme"
                      value={customSchemeId}
                      onChange={(e) => handleCustomSchemeChange(e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
                    >
                      {rules.schemes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shortName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-0.5">
                    <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      Submission Round
                    </span>
                    <select
                      aria-label="Custom bid submission round"
                      value={effectiveQuarter}
                      onChange={(e) => setCustomQuarter(e.target.value as QuarterKey)}
                      className="w-full rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[11px] tabular-nums"
                    >
                      {customQuarterOptions.map((q) => (
                        <option key={q} value={q}>
                          {formatQuarterShort(q)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-500 tabular-nums">
                <span>
                  Bid lock window:{' '}
                  <strong className="font-mono text-slate-700">
                    {formatQuarterShort(bidLockStartQuarter)} to{' '}
                    {formatQuarterShort(bidLockEndQuarter)}
                  </strong>
                </span>
              </div>
            </div>

            {/* Collaborator Cards with Visual 2027-2032 Overlap Mini-Bar */}
            <div className="space-y-2.5">
              {collaborators.map((profile) => {
                const isActive = profile.id === activeProfileId;
                const activeScen =
                  profile.scenarios.find((s) => s.id === profile.activeScenarioId) ??
                  profile.scenarios[0];
                const coGrants = activeScen?.grants ?? [];
                const fit = checkCollaboratorFit(
                  profile,
                  rules,
                  targetSchemeId,
                  validRoleId,
                  effectiveQuarter,
                  effectiveDuration,
                );
                const coLoads = computeQuarterlyLoads(coGrants, rules, timelineQuarters);
                const existingPeakDuringBid = Math.max(0, fit.peakCombinedPoints - fit.rolePoints);

                return (
                  <div
                    key={profile.id}
                    className={`rounded-md border p-2.5 space-y-2 ${
                      isActive ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* Header: Name + Verdict + Remove */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 truncate">{profile.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {fit.canJoin ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Can join
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200">
                            <XCircle className="h-3 w-3" />
                            Blocked
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveCollaborator(profile.id)}
                          aria-label={`Remove ${profile.name}`}
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Plain-English Math Breakdown */}
                    <div className="text-[11px] tabular-nums">
                      {fit.canJoin ? (
                        <span className="text-slate-600">
                          {existingPeakDuringBid} existing + {fit.rolePoints} bid ={' '}
                          <strong className="text-slate-900">
                            {fit.peakCombinedPoints}/{rules.hardCap} pts
                          </strong>
                          {coGrants.length === 0 && (
                            <span className="text-slate-400"> (no grants listed yet)</span>
                          )}
                        </span>
                      ) : fit.blockingQuarters.length > 0 ? (
                        <span className="text-red-700">
                          Over cap in {formatQuarterShort(fit.blockingQuarters[0].quarter)}:{' '}
                          <strong>
                            {fit.peakCombinedPoints}/{rules.hardCap} pts (+
                            {fit.blockingQuarters[0].overBy})
                          </strong>
                        </span>
                      ) : (
                        <span className="text-red-700">{fit.eligibilityIssues[0]}</span>
                      )}
                    </div>

                    {/* Compact 24-Quarter (2027-2032) Visual Overlap Mini-Chart */}
                    <div className="rounded border border-slate-100 bg-slate-50/70 px-1.5 pt-1.5 pb-1">
                      <div className="relative h-9">
                        {/* 13-pt cap hairline */}
                        <div
                          aria-hidden="true"
                          style={{ bottom: `${capBottomPct}%` }}
                          className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-red-500/80"
                        />
                        <div className="grid h-full grid-cols-24 gap-[1px]">
                          {coLoads.map((load) => {
                            const idx = quarterToIndex(load.quarter);
                            const inBidWindow = idx >= bidStartIdx && idx <= bidEndIdx;
                            const addedPts = inBidWindow ? fit.rolePoints : 0;
                            const combined = load.totalPoints + addedPts;
                            const isOver = combined > rules.hardCap;
                            const existingPct = Math.min(100, (load.totalPoints / chartMaxPts) * 100);
                            const addedPct = Math.min(
                              100 - existingPct,
                              (addedPts / chartMaxPts) * 100,
                            );

                            return (
                              <div
                                key={load.quarter}
                                title={`${formatQuarterShort(load.quarter)}: ${load.totalPoints} existing${
                                  inBidWindow ? ` + ${addedPts} bid = ${combined}` : ''
                                }/${rules.hardCap} pts`}
                                className={`flex h-full flex-col justify-end ${
                                  inBidWindow ? 'bg-indigo-100/60' : ''
                                }`}
                              >
                                {addedPts > 0 && (
                                  <div
                                    style={{ height: `${addedPct}%` }}
                                    className={`w-full rounded-t-[1px] ${
                                      isOver ? 'bg-red-500' : 'bg-indigo-500/85'
                                    }`}
                                  />
                                )}
                                {load.totalPoints > 0 && (
                                  <div
                                    style={{ height: `${existingPct}%` }}
                                    className={`w-full ${
                                      addedPts === 0 ? 'rounded-t-[1px]' : ''
                                    } ${isOver ? 'bg-red-700' : 'bg-teal-700'}`}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="mt-0.5 grid grid-cols-6 text-[9px] font-mono text-slate-400 tabular-nums">
                        {timelineQuarters
                          .filter((q) => parseQuarter(q).q === 1)
                          .map((q) => (
                            <span key={q}>&apos;{String(parseQuarter(q).year).slice(2)}</span>
                          ))}
                      </div>
                    </div>

                    {/* Collaborator's Existing Grants + Full Modal Editor Trigger */}
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                      {coGrants.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {coGrants.map((g) => {
                            const gPts = getGrantPoints(g, rules);
                            const gRole = g.isLegacy
                              ? 'Legacy'
                              : (getRoleById(rules, g.schemeId, g.roleId)?.label ?? g.roleId);
                            const gStart = g.isAwarded || g.isLegacy ? g.startQuarter : g.submissionQuarter;
                            const gEnd = getGrantEndQuarter(g);
                            return (
                              <span
                                key={g.id}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700 tabular-nums"
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenEditCollaboratorGrant(profile, g)}
                                  title={`Edit ${g.label} (${formatQuarterShort(gStart)} to ${formatQuarterShort(gEnd)})`}
                                  className="inline-flex items-center gap-1 hover:text-slate-950 cursor-pointer"
                                >
                                  <span className="font-medium">{g.label}</span>
                                  <span className="text-slate-400">
                                    {gRole} · {gPts}p · {formatQuarterShort(gStart)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRemoveCollaboratorGrant(profile.id, g.id)}
                                  aria-label={`Remove ${g.label} from ${profile.name}`}
                                  className="ml-0.5 rounded text-slate-400 hover:text-red-700 cursor-pointer"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => onOpenAddCollaboratorGrant(profile)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-950 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          Add grant
                        </button>

                        {!isActive ? (
                          <button
                            type="button"
                            onClick={() => onSelectProfile(profile.id)}
                            className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 hover:text-slate-900 underline decoration-slate-300 cursor-pointer"
                          >
                            Full timeline
                            <ArrowUpRight className="h-2.5 w-2.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] font-semibold text-indigo-700">
                            Viewing timeline
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

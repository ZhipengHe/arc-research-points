import { useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Link2,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { QuarterKey, ResearcherProfile, RulesData } from '../types/arc';
import { checkCollaboratorFit } from '../engine/planner';
import { getNearestRoundQuarter, getSchemeById } from '../engine/rules';
import { formatQuarterShort, generateTimelineQuarters } from '../engine/quarters';
import { decodeShareHash, type SharedPlanPayload } from '../utils/shareLink';

interface CollaboratorCheckCardProps {
  profiles: ResearcherProfile[];
  activeProfileId: string;
  rules: RulesData;
  selectedQuarter: QuarterKey;
  onSelectProfile: (profileId: string) => void;
  onAddCollaborator: (name: string, importedPlan?: SharedPlanPayload) => void;
  onRemoveCollaborator: (profileId: string) => void;
}

const MAX_COLLABORATORS = 3;

export function CollaboratorCheckCard({
  profiles,
  activeProfileId,
  rules,
  selectedQuarter,
  onSelectProfile,
  onAddCollaborator,
  onRemoveCollaborator,
}: CollaboratorCheckCardProps) {
  const [targetSchemeId, setTargetSchemeId] = useState<string>(rules.schemes[0]?.id ?? 'explore');
  const [targetRoleId, setTargetRoleId] = useState<string>('ci');
  const [targetQuarter, setTargetQuarter] = useState<QuarterKey>(selectedQuarter);
  const [addingName, setAddingName] = useState('');
  const [shareUrlInput, setShareUrlInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'closed' | 'blank' | 'link'>('closed');

  const collaborators = profiles.filter((p) => !p.isPrimary);
  const canAddMore = collaborators.length < MAX_COLLABORATORS;
  const scheme = getSchemeById(rules, targetSchemeId) ?? rules.schemes[0];
  const validRoleId = scheme?.roles.some((r) => r.id === targetRoleId)
    ? targetRoleId
    : (scheme?.roles[0]?.id ?? 'ci');

  const quarters = generateTimelineQuarters(
    rules.timelineWindow.startYear,
    rules.timelineWindow.endYear,
  );

  const handleSchemeSelect = (nextSchemeId: string) => {
    setTargetSchemeId(nextSchemeId);
    const nextScheme = getSchemeById(rules, nextSchemeId);
    if (nextScheme) {
      const ciRole = nextScheme.roles.find((r) => r.id === 'ci') ?? nextScheme.roles[0];
      if (ciRole) setTargetRoleId(ciRole.id);
      setTargetQuarter(getNearestRoundQuarter(nextScheme, selectedQuarter));
    }
  };

  const handleCreateBlank = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addingName.trim() || `Co-CI ${collaborators.length + 1}`;
    onAddCollaborator(trimmed);
    setAddingName('');
    setAddMode('closed');
  };

  const handleImportFromLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    const raw = shareUrlInput.trim();
    if (!raw) {
      setImportError('Paste a shareable URL or #plan hash from your collaborator.');
      return;
    }

    const hashIdx = raw.indexOf('#');
    const hashPart = hashIdx >= 0 ? raw.slice(hashIdx) : raw;
    const decoded = await decodeShareHash(hashPart);
    if (!decoded) {
      setImportError('Could not read a valid plan from that link. Copy the full Shareable URL.');
      return;
    }

    const name = addingName.trim() || `Co-CI ${collaborators.length + 1}`;
    onAddCollaborator(name, decoded);
    setAddingName('');
    setShareUrlInput('');
    setAddMode('closed');
  };

  return (
    <section
      aria-label="Collaborator and Team Point Check"
      className="no-print rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-slate-600" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-800">
            Team / Co-CI Point Check
          </h2>
        </div>
        {canAddMore && addMode === 'closed' && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setAddMode('link');
              }}
              title="Import a collaborator's grants directly from their Shareable URL"
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Link2 className="h-3 w-3" />
              Link
            </button>
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setAddMode('blank');
              }}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <UserPlus className="h-3 w-3" />
              Add Co-CI
            </button>
          </div>
        )}
      </div>

      <div className="p-3.5 space-y-3 text-xs">
        {addMode === 'blank' && (
          <form onSubmit={handleCreateBlank} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
            <div className="text-[11px] font-medium text-slate-700">
              Create a blank Co-CI profile (then enter their active grants):
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                placeholder={`Co-CI ${collaborators.length + 1} (e.g. Prof. Patel)`}
                autoFocus
                className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
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
            </div>
          </form>
        )}

        {addMode === 'link' && (
          <form
            onSubmit={(e) => void handleImportFromLink(e)}
            className="space-y-2 rounded-md border border-teal-200 bg-teal-50/50 p-2.5"
          >
            <div className="text-[11px] font-medium text-teal-950">
              Import a collaborator&apos;s pre-filled grants from their Shareable URL:
            </div>
            <input
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              placeholder={`Collaborator name (e.g. Prof. Patel)`}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            />
            <input
              type="text"
              value={shareUrlInput}
              onChange={(e) => setShareUrlInput(e.target.value)}
              placeholder="Paste #planz=... shareable link here"
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
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Add up to {MAX_COLLABORATORS} collaborator profiles manually or paste a colleague&apos;s
            Shareable URL (<strong>Link</strong>) to reuse their already-configured grants and check
            whether they have enough free points to join a shared bid.
          </p>
        ) : (
          <>
            {/* Bid Fit Controls */}
            <div className="grid grid-cols-3 gap-1.5">
              <select
                aria-label="Target bid scheme"
                value={targetSchemeId}
                onChange={(e) => handleSchemeSelect(e.target.value)}
                className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
              >
                {rules.schemes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shortName}
                  </option>
                ))}
              </select>
              <select
                aria-label="Target bid role"
                value={validRoleId}
                onChange={(e) => setTargetRoleId(e.target.value)}
                className="rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px]"
              >
                {scheme?.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.points})
                  </option>
                ))}
              </select>
              <select
                aria-label="Target bid submission quarter"
                value={targetQuarter}
                onChange={(e) => setTargetQuarter(e.target.value as QuarterKey)}
                className="rounded border border-slate-300 bg-white px-1.5 py-1 font-mono text-[11px] tabular-nums"
              >
                {quarters.map((q) => (
                  <option key={q} value={q}>
                    {formatQuarterShort(q)}
                  </option>
                ))}
              </select>
            </div>

            {/* Results per profile */}
            <div className="space-y-2">
              {profiles.map((profile) => {
                const fit = checkCollaboratorFit(
                  profile,
                  rules,
                  targetSchemeId,
                  validRoleId,
                  targetQuarter,
                );
                const isActive = profile.id === activeProfileId;
                const activeScen =
                  profile.scenarios.find((s) => s.id === profile.activeScenarioId) ??
                  profile.scenarios[0];
                const grantCount = activeScen?.grants.length ?? 0;

                return (
                  <div
                    key={profile.id}
                    className={`rounded-md border px-2.5 py-2 ${
                      isActive
                        ? 'border-slate-400 bg-slate-50/90'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 truncate">
                            {profile.name}
                          </span>
                          <span className="shrink-0 text-[10px] text-slate-500 tabular-nums">
                            ({grantCount} {grantCount === 1 ? 'grant' : 'grants'})
                          </span>
                        </div>
                      </div>
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
                        {!profile.isPrimary && (
                          <button
                            type="button"
                            onClick={() => onRemoveCollaborator(profile.id)}
                            aria-label={`Remove ${profile.name}`}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-1 flex items-end justify-between gap-2 text-[11px] text-slate-600 tabular-nums">
                      <div>
                        {fit.canJoin ? (
                          <span>
                            Peak: <strong>{fit.peakCombinedPoints}/{rules.hardCap} pts</strong>{' '}
                            (min {fit.minFreePointsInWindow} free).
                          </span>
                        ) : fit.blockingQuarters.length > 0 ? (
                          <span className="text-red-700">
                            Peaks <strong>{fit.peakCombinedPoints}/{rules.hardCap} pts</strong> in{' '}
                            {formatQuarterShort(fit.blockingQuarters[0].quarter)} (+
                            {fit.blockingQuarters[0].overBy}).
                          </span>
                        ) : (
                          <span className="text-red-700">{fit.eligibilityIssues[0]}</span>
                        )}
                      </div>
                      {isActive ? (
                        <span className="shrink-0 text-[10px] font-medium text-slate-500">
                          Viewing
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectProfile(profile.id)}
                          className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-700 hover:text-slate-950 underline decoration-slate-300 cursor-pointer"
                        >
                          Edit grants
                          <ArrowUpRight className="h-3 w-3" />
                        </button>
                      )}
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

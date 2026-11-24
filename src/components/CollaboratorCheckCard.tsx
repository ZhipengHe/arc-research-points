import { useState } from 'react';
import { CheckCircle2, Trash2, UserPlus, Users, XCircle } from 'lucide-react';
import type { QuarterKey, ResearcherProfile, RulesData } from '../types/arc';
import { checkCollaboratorFit } from '../engine/planner';
import { getNearestRoundQuarter, getSchemeById } from '../engine/rules';
import { formatQuarterShort, generateTimelineQuarters } from '../engine/quarters';

interface CollaboratorCheckCardProps {
  profiles: ResearcherProfile[];
  activeProfileId: string;
  rules: RulesData;
  selectedQuarter: QuarterKey;
  onSelectProfile: (profileId: string) => void;
  onAddCollaborator: (name: string) => void;
  onRemoveCollaborator: (profileId: string) => void;
}

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
  const [showAddInput, setShowAddInput] = useState(false);

  const collaborators = profiles.filter((p) => !p.isPrimary);
  const canAddMore = collaborators.length < 2;
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

  const handleCreateCollaborator = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addingName.trim() || `Co-CI ${collaborators.length + 1}`;
    onAddCollaborator(trimmed);
    setAddingName('');
    setShowAddInput(false);
  };

  return (
    <section
      aria-label="Collaborator and Team Point Check"
      className="no-print rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-slate-600" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-800">
            Team / Co-CI Point Check
          </h2>
        </div>
        {canAddMore && !showAddInput && (
          <button
            type="button"
            onClick={() => setShowAddInput(true)}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <UserPlus className="h-3 w-3" />
            Add Co-CI
          </button>
        )}
      </div>

      <div className="p-3.5 space-y-3 text-xs">
        {showAddInput && (
          <form onSubmit={handleCreateCollaborator} className="flex items-center gap-1.5">
            <input
              type="text"
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              placeholder={`Co-CI ${collaborators.length + 1} (e.g. Prof. Smith)`}
              autoFocus
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowAddInput(false)}
              className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
          </form>
        )}

        {collaborators.length === 0 ? (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Add 1-2 collaborator profiles to model their active ARC grants and verify whether they
            have enough free points to join a shared bid.
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
                      <button
                        type="button"
                        onClick={() => onSelectProfile(profile.id)}
                        className="text-left font-semibold text-slate-900 hover:underline cursor-pointer truncate"
                      >
                        {profile.name}
                        {isActive && (
                          <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                            (viewing)
                          </span>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
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
                            className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600 tabular-nums">
                      {fit.canJoin ? (
                        <span>
                          Peak combined load: <strong>{fit.peakCombinedPoints}/{rules.hardCap} pts</strong>{' '}
                          (min {fit.minFreePointsInWindow} pts free across window).
                        </span>
                      ) : fit.blockingQuarters.length > 0 ? (
                        <span className="text-red-700">
                          Peaks at <strong>{fit.peakCombinedPoints}/{rules.hardCap} pts</strong> in{' '}
                          {formatQuarterShort(fit.blockingQuarters[0].quarter)} (+
                          {fit.blockingQuarters[0].overBy} over cap).
                        </span>
                      ) : (
                        <span className="text-red-700">{fit.eligibilityIssues[0]}</span>
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Copy,
  GitCompareArrows,
  Info,
  Pencil,
  Plus,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  CustomRulesOverride,
  EligibilityProfile,
  FittingRoleOption,
  GrantEntry,
  PersistedWorkspaceState,
  QuarterKey,
  ResearcherProfile,
  RulesData,
  Scenario,
} from './types/arc';
import {
  applyCustomOverrides,
  computeDefaultDatesForScheme,
  generateGenericLabel,
  getNearestRoundQuarter,
  getSchemeById,
  hasActiveOverrides,
} from './engine/rules';
import {
  computeEligibilityIssues,
  computeFundingRollup,
  computeQuarterlyLoads,
  getPeakLoadSummary,
} from './engine/planner';
import {
  buildScenarioFromTemplate,
  createId,
  type StarterTemplateDefinition,
} from './engine/templates';
import { formatQuarterShort } from './engine/quarters';
import { loadWorkspaceState, saveWorkspaceState } from './utils/storage';
import { decodeShareHash, type SharedPlanPayload } from './utils/shareLink';
import { registerWebMcpTools, type WebMcpRegistrationStatus, WEBMCP_TOOL_NAMES } from './utils/webmcp';
import { TimelineAndCapacity } from './components/TimelineAndCapacity';
import { WhatFitsHelper } from './components/WhatFitsHelper';
import { FundingRollupPanel } from './components/FundingRollupPanel';
import { CollaboratorCheckCard } from './components/CollaboratorCheckCard';
import { GrantFormModal } from './components/GrantFormModal';
import { ScenarioCompareModal } from './components/ScenarioCompareModal';
import { EligibilityModal, TemplatesModal } from './components/EligibilityAndTemplatesModals';
import { CustomRulesModal } from './components/CustomRulesModal';
import { ExportShareModal } from './components/ExportShareModal';
import { OfficialDocsDrawer } from './components/OfficialDocsDrawer';
import { BrandMark, GitHubIcon } from './components/BrandMark';

export default function App() {
  const [baseRules, setBaseRules] = useState<RulesData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<PersistedWorkspaceState | null>(null);
  const [outdatedFromVersion, setOutdatedFromVersion] = useState<string | null>(null);
  const [pendingSharedPlan, setPendingSharedPlan] = useState<SharedPlanPayload | null>(null);

  // Modals / Drawers
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<GrantEntry | null>(null);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [customRulesOpen, setCustomRulesOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);

  // Inline scenario rename
  const [renamingScenarioId, setRenamingScenarioId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [sampleNoticeDismissed, setSampleNoticeDismissed] = useState(false);

  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpRegistrationStatus>({
    supported: false,
    surface: 'none',
    toolNames: [...WEBMCP_TOOL_NAMES],
  });

  // Load rules.json on startup
  useEffect(() => {
    let active = true;
    fetch('./rules.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading rules.json`);
        return res.json() as Promise<RulesData>;
      })
      .then((rulesData) => {
        if (!active) return;
        setBaseRules(rulesData);
        const loaded = loadWorkspaceState(rulesData);
        setWorkspace(loaded.state);
        setOutdatedFromVersion(loaded.outdatedFromVersion);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : 'Failed to load ARC rules.json');
      });
    return () => {
      active = false;
    };
  }, []);

  // Check URL #hash for shared plan
  useEffect(() => {
    const checkHash = async () => {
      if (!window.location.hash) return;
      const decoded = await decodeShareHash(window.location.hash);
      if (decoded) {
        setPendingSharedPlan(decoded);
      }
    };
    void checkHash();
    const onHashChange = () => void checkHash();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Persist workspace to localStorage whenever it updates
  useEffect(() => {
    if (!workspace) return;
    saveWorkspaceState(workspace);
  }, [workspace]);

  const effectiveRules = useMemo(() => {
    if (!baseRules || !workspace) return baseRules;
    return applyCustomOverrides(baseRules, workspace.customOverrides);
  }, [baseRules, workspace]);

  const activeProfile: ResearcherProfile | null = useMemo(() => {
    if (!workspace) return null;
    return (
      workspace.profiles.find((p) => p.id === workspace.activeProfileId) ??
      workspace.profiles[0] ??
      null
    );
  }, [workspace]);

  const activeScenario: Scenario | null = useMemo(() => {
    if (!activeProfile) return null;
    return (
      activeProfile.scenarios.find((s) => s.id === activeProfile.activeScenarioId) ??
      activeProfile.scenarios[0] ??
      null
    );
  }, [activeProfile]);

  const quarterlyLoads = useMemo(() => {
    if (!effectiveRules || !activeScenario) return [];
    return computeQuarterlyLoads(activeScenario.grants, effectiveRules);
  }, [effectiveRules, activeScenario]);

  const peakSummary = useMemo(() => getPeakLoadSummary(quarterlyLoads), [quarterlyLoads]);

  const eligibilityIssues = useMemo(() => {
    if (!effectiveRules || !activeScenario || !activeProfile) return [];
    return computeEligibilityIssues(
      activeScenario.grants,
      effectiveRules,
      activeProfile.eligibility,
      quarterlyLoads,
    );
  }, [effectiveRules, activeScenario, activeProfile, quarterlyLoads]);

  const fundingRollup = useMemo(() => {
    if (!effectiveRules || !activeScenario) return null;
    return computeFundingRollup(activeScenario.grants, effectiveRules, quarterlyLoads);
  }, [effectiveRules, activeScenario, quarterlyLoads]);

  // Helper to update active profile immutably
  const updateActiveProfile = useCallback(
    (updater: (profile: ResearcherProfile) => ResearcherProfile) => {
      setWorkspace((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profiles: prev.profiles.map((p) =>
            p.id === prev.activeProfileId ? updater(p) : p,
          ),
        };
      });
    },
    [],
  );

  // Helper to update active scenario immutably
  const updateActiveScenario = useCallback(
    (updater: (scenario: Scenario) => Scenario) => {
      updateActiveProfile((profile) => ({
        ...profile,
        scenarios: profile.scenarios.map((s) =>
          s.id === profile.activeScenarioId ? updater(s) : s,
        ),
      }));
    },
    [updateActiveProfile],
  );

  const handleSaveGrant = useCallback(
    (grant: GrantEntry) => {
      updateActiveScenario((scenario) => {
        const exists = scenario.grants.some((g) => g.id === grant.id);
        return {
          ...scenario,
          grants: exists
            ? scenario.grants.map((g) => (g.id === grant.id ? grant : g))
            : [...scenario.grants, grant],
        };
      });
    },
    [updateActiveScenario],
  );

  const handleRemoveGrant = useCallback(
    (grantId: string) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        grants: scenario.grants.filter((g) => g.id !== grantId),
      }));
    },
    [updateActiveScenario],
  );

  const handleToggleOutcome = useCallback(
    (grantId: string) => {
      updateActiveScenario((scenario) => ({
        ...scenario,
        grants: scenario.grants.map((g) =>
          g.id === grantId && !g.isLegacy && !g.isAwarded
            ? { ...g, outcome: g.outcome === 'funded' ? 'unsuccessful' : 'funded' }
            : g,
        ),
      }));
    },
    [updateActiveScenario],
  );

  const handleQuickAddOption = useCallback(
    (opt: FittingRoleOption) => {
      if (!effectiveRules || !activeScenario) return;
      const label = generateGenericLabel(
        effectiveRules,
        opt.scheme.id,
        false,
        activeScenario.grants,
      );
      const newGrant: GrantEntry = {
        id: createId('grant'),
        isLegacy: false,
        schemeId: opt.scheme.id,
        roleId: opt.role.id,
        label,
        isCustomLabel: false,
        submissionQuarter: opt.suggestedSubmissionQuarter,
        outcomeQuarter: opt.suggestedOutcomeQuarter,
        startQuarter: opt.suggestedStartQuarter,
        durationYears: opt.scheme.maxDurationYears,
        outcome: 'funded',
      };
      handleSaveGrant(newGrant);
    },
    [effectiveRules, activeScenario, handleSaveGrant],
  );

  // Scenario actions
  const handleCreateScenario = () => {
    updateActiveProfile((profile) => {
      const nextNum = profile.scenarios.length + 1;
      const nextScenario: Scenario = {
        id: createId('scen'),
        name: `Plan ${String.fromCharCode(64 + Math.min(26, nextNum))}`,
        createdAt: new Date().toISOString(),
        grants: [],
      };
      return {
        ...profile,
        scenarios: [...profile.scenarios, nextScenario],
        activeScenarioId: nextScenario.id,
      };
    });
  };

  const handleDuplicateScenario = (scenario: Scenario) => {
    updateActiveProfile((profile) => {
      const copy: Scenario = {
        id: createId('scen'),
        name: `${scenario.name} (Copy)`,
        createdAt: new Date().toISOString(),
        grants: scenario.grants.map((g) => ({ ...g, id: createId('grant') })),
      };
      return {
        ...profile,
        scenarios: [...profile.scenarios, copy],
        activeScenarioId: copy.id,
      };
    });
  };

  const handleDeleteScenario = (scenarioId: string) => {
    updateActiveProfile((profile) => {
      if (profile.scenarios.length <= 1) return profile;
      const nextList = profile.scenarios.filter((s) => s.id !== scenarioId);
      return {
        ...profile,
        scenarios: nextList,
        activeScenarioId:
          profile.activeScenarioId === scenarioId ? nextList[0].id : profile.activeScenarioId,
      };
    });
  };

  const handleCommitRename = (scenarioId: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      updateActiveProfile((profile) => ({
        ...profile,
        scenarios: profile.scenarios.map((s) =>
          s.id === scenarioId ? { ...s, name: trimmed } : s,
        ),
      }));
    }
    setRenamingScenarioId(null);
  };

  const handleApplyTemplate = (
    template: StarterTemplateDefinition,
    mode: 'new-scenario' | 'replace',
  ) => {
    const built = buildScenarioFromTemplate(template);
    updateActiveProfile((profile) => {
      const nextEligibility =
        profile.eligibility.phdConferralDate === ''
          ? template.eligibility
          : profile.eligibility;
      if (mode === 'replace') {
        return {
          ...profile,
          eligibility: nextEligibility,
          scenarios: profile.scenarios.map((s) =>
            s.id === profile.activeScenarioId
              ? { ...s, name: template.name, grants: built.grants }
              : s,
          ),
        };
      }
      return {
        ...profile,
        eligibility: nextEligibility,
        scenarios: [...profile.scenarios, built],
        activeScenarioId: built.id,
      };
    });
  };

  const handleSaveEligibility = (next: EligibilityProfile) => {
    updateActiveProfile((profile) => ({
      ...profile,
      eligibility: next,
    }));
  };

  const handleSaveOverrides = (next: CustomRulesOverride) => {
    setWorkspace((prev) => (prev ? { ...prev, customOverrides: next } : prev));
  };

  const handleAddCollaborator = (name: string) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const coCiCount = prev.profiles.filter((p) => !p.isPrimary).length;
      if (coCiCount >= 2) return prev;
      const scenId = createId('scen');
      const newProfile: ResearcherProfile = {
        id: createId('profile'),
        name,
        isPrimary: false,
        eligibility: {
          phdConferralDate: '',
          careerInterruptionMonths: 0,
          isIndigenousResearcher: false,
        },
        scenarios: [
          {
            id: scenId,
            name: 'Current Commitments',
            createdAt: new Date().toISOString(),
            grants: [],
          },
        ],
        activeScenarioId: scenId,
      };
      return {
        ...prev,
        profiles: [...prev.profiles, newProfile],
        activeProfileId: newProfile.id,
      };
    });
  };

  const handleRemoveCollaborator = (profileId: string) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const nextProfiles = prev.profiles.filter((p) => p.id !== profileId || p.isPrimary);
      return {
        ...prev,
        profiles: nextProfiles,
        activeProfileId:
          prev.activeProfileId === profileId ? nextProfiles[0].id : prev.activeProfileId,
      };
    });
  };

  const handleImportSharedPlan = () => {
    if (!pendingSharedPlan) return;
    const newScenario: Scenario = {
      id: createId('scen'),
      name: pendingSharedPlan.scenarioName || 'Shared Plan',
      createdAt: new Date().toISOString(),
      grants: pendingSharedPlan.grants,
    };
    updateActiveProfile((profile) => ({
      ...profile,
      scenarios: [...profile.scenarios, newScenario],
      activeScenarioId: newScenario.id,
    }));
    setPendingSharedPlan(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const handleDismissSharedPlan = () => {
    setPendingSharedPlan(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const handleStartBlank = () => {
    updateActiveScenario((scenario) => ({
      ...scenario,
      name: scenario.id === 'scen-baseline' ? 'Plan A' : scenario.name,
      grants: [],
    }));
    setWorkspace((prev) => (prev ? { ...prev, selectedQuarter: '2027-Q1' } : prev));
    setSampleNoticeDismissed(true);
  };

  const handleAcknowledgeRulesUpdate = () => {
    if (!baseRules) return;
    setWorkspace((prev) => (prev ? { ...prev, rulesVersion: baseRules.version } : prev));
    setOutdatedFromVersion(null);
  };

  // WebMCP live state ref so registered tools always read fresh state
  const liveStateRef = useRef<{
    rules: RulesData | null;
    profile: ResearcherProfile | null;
    scenario: Scenario | null;
    selectedQuarter: QuarterKey;
  }>({
    rules: null,
    profile: null,
    scenario: null,
    selectedQuarter: '2028-Q3',
  });

  liveStateRef.current = {
    rules: effectiveRules,
    profile: activeProfile,
    scenario: activeScenario,
    selectedQuarter: workspace?.selectedQuarter ?? '2028-Q3',
  };

  useEffect(() => {
    if (!effectiveRules) return;
    const registration = registerWebMcpTools({
      getState: () => {
        const current = liveStateRef.current;
        if (!current.rules || !current.profile || !current.scenario) {
          throw new Error('Planner state is not initialized yet.');
        }
        return {
          rules: current.rules,
          profile: current.profile,
          scenario: current.scenario,
          selectedQuarter: current.selectedQuarter,
        };
      },
      addGrant: (input) => {
        const current = liveStateRef.current;
        if (!current.rules || !current.scenario) {
          return { ok: false, message: 'Planner not ready.' };
        }
        const isLegacy = Boolean(input.isLegacy || input.schemeId.startsWith('legacy-'));
        if (isLegacy) {
          const legacy = current.rules.legacySchemes.find((s) => s.id === input.schemeId);
          if (!legacy) return { ok: false, message: `Unknown legacy scheme: ${input.schemeId}` };
          const grant: GrantEntry = {
            id: createId('grant'),
            isLegacy: true,
            schemeId: legacy.id,
            roleId: 'legacy-ci',
            label:
              input.label?.trim() ||
              generateGenericLabel(current.rules, legacy.id, true, current.scenario.grants),
            isCustomLabel: Boolean(input.label?.trim()),
            submissionQuarter: '2026-Q1',
            outcomeQuarter: '2026-Q4',
            startQuarter: input.submissionQuarter ?? '2027-Q1',
            durationYears: input.durationYears ?? legacy.defaultDurationYears,
            outcome: 'funded',
          };
          handleSaveGrant(grant);
          return { ok: true, grantId: grant.id, message: `Added ${grant.label} (0 pts).` };
        }

        const scheme = getSchemeById(current.rules, input.schemeId);
        if (!scheme) return { ok: false, message: `Unknown schemeId: ${input.schemeId}` };
        const role = scheme.roles.find((r) => r.id === input.roleId);
        if (!role) {
          return {
            ok: false,
            message: `Invalid roleId "${input.roleId}" for ${scheme.name}. Valid: ${scheme.roles.map((r) => r.id).join(', ')}`,
          };
        }
        const subQ =
          input.submissionQuarter ??
          getNearestRoundQuarter(scheme, current.selectedQuarter);
        const dates = computeDefaultDatesForScheme(scheme, subQ);
        const grant: GrantEntry = {
          id: createId('grant'),
          isLegacy: false,
          isAwarded: Boolean(input.isAwarded),
          schemeId: scheme.id,
          roleId: role.id,
          label:
            input.label?.trim() ||
            generateGenericLabel(current.rules, scheme.id, false, current.scenario.grants),
          isCustomLabel: Boolean(input.label?.trim()),
          submissionQuarter: dates.submissionQuarter,
          outcomeQuarter: dates.outcomeQuarter,
          startQuarter: input.isAwarded && input.submissionQuarter ? input.submissionQuarter : dates.startQuarter,
          durationYears: Math.min(
            scheme.maxDurationYears,
            Math.max(1, input.durationYears ?? scheme.maxDurationYears),
          ),
          outcome: input.isAwarded ? 'funded' : (input.outcome ?? 'funded'),
        };
        handleSaveGrant(grant);
        return {
          ok: true,
          grantId: grant.id,
          message: `Added ${grant.label} (${scheme.name} ${role.label}, ${role.points} pts).`,
        };
      },
      removeGrant: (grantId) => {
        handleRemoveGrant(grantId);
        return { ok: true, message: `Removed grant ${grantId}.` };
      },
      toggleFundedStatus: (grantId, explicitOutcome) => {
        const current = liveStateRef.current;
        const target = current.scenario?.grants.find((g) => g.id === grantId);
        if (!target) return { ok: false, message: `Grant ${grantId} not found.` };
        if (target.isLegacy) return { ok: false, message: 'Legacy grants do not toggle outcome.' };
        if (target.isAwarded) {
          return {
            ok: false,
            message: `${target.label} is already awarded and locked in RMS (no early relinquishment).`,
          };
        }
        const nextOutcome =
          explicitOutcome ?? (target.outcome === 'funded' ? 'unsuccessful' : 'funded');
        updateActiveScenario((s) => ({
          ...s,
          grants: s.grants.map((g) => (g.id === grantId ? { ...g, outcome: nextOutcome } : g)),
        }));
        return {
          ok: true,
          outcome: nextOutcome,
          message: `Set ${target.label} to ${nextOutcome}.`,
        };
      },
      switchScenario: (scenarioNameOrId) => {
        const current = liveStateRef.current;
        const match = current.profile?.scenarios.find(
          (s) =>
            s.id === scenarioNameOrId ||
            s.name.toLowerCase() === scenarioNameOrId.toLowerCase(),
        );
        if (!match) return { ok: false, message: `Scenario "${scenarioNameOrId}" not found.` };
        updateActiveProfile((p) => ({ ...p, activeScenarioId: match.id }));
        return { ok: true, message: `Switched to scenario "${match.name}".` };
      },
    });
    setWebMcpStatus(registration.status);
    return () => registration.cleanup();
  }, [
    effectiveRules,
    handleSaveGrant,
    handleRemoveGrant,
    updateActiveScenario,
    updateActiveProfile,
  ]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-5 shadow-xs text-xs space-y-2">
          <h1 className="text-sm font-semibold text-red-700">Failed to load ARC rules.json</h1>
          <p className="text-slate-600">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!baseRules || !effectiveRules || !workspace || !activeProfile || !activeScenario || !fundingRollup) {
    return (
      <div className="min-h-screen flex items-center justify-center text-xs text-slate-500">
        Loading ARC NCGP Research Points rules...
      </div>
    );
  }

  const selectedLoad =
    quarterlyLoads.find((l) => l.quarter === workspace.selectedQuarter) ?? quarterlyLoads[0];
  const overridesActive = hasActiveOverrides(workspace.customOverrides);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fb] text-slate-900">
      {/* Compact Workspace Top Bar (Single Row on 1280px Laptops) */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-3.5 py-2">
          {/* Brand + Live 13-Point Counter */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <BrandMark className="h-7 w-7" />
              <h1
                title="ARC NCGP Research Points Planner"
                className="text-sm font-semibold tracking-tight text-slate-900 whitespace-nowrap"
              >
                ARC NCGP Points Planner
              </h1>
            </div>

            {/* Live X / 13 Counter Pill */}
            <div
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tabular-nums whitespace-nowrap ${
                peakSummary.overCapQuarters.length > 0
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-slate-200 bg-slate-50 text-slate-800'
              }`}
              title={`Selected quarter (${formatQuarterShort(workspace.selectedQuarter)}): ${selectedLoad?.totalPoints ?? 0}/${effectiveRules.hardCap} pts. Peak across 2027-2032: ${peakSummary.peakPoints}/${effectiveRules.hardCap} pts.`}
            >
              <span className="font-bold">
                {selectedLoad?.totalPoints ?? 0}/{effectiveRules.hardCap} pts
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Peak {peakSummary.peakPoints}/{effectiveRules.hardCap}
              </span>
              {peakSummary.overCapQuarters.length > 0 && (
                <span className="inline-flex items-center gap-0.5 font-sans text-[10px] font-semibold text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  Over Cap
                </span>
              )}
            </div>

            {/* Profile Switcher (shown when Co-CI collaborators have been added) */}
            {workspace.profiles.length > 1 && (
              <div className="no-print flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                {workspace.profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setWorkspace((prev) => (prev ? { ...prev, activeProfileId: p.id } : prev))
                    }
                    className={`rounded px-2 py-0.5 font-medium cursor-pointer arc-state-transition ${
                      p.id === workspace.activeProfileId
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Controls */}
          <div className="no-print flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setEditingGrant(null);
                setGrantModalOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Grant
            </button>

            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-slate-500" />
              Templates
            </button>

            <button
              type="button"
              onClick={() => setEligibilityOpen(true)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 font-medium cursor-pointer ${
                activeProfile.eligibility.phdConferralDate ||
                activeProfile.eligibility.isIndigenousResearcher
                  ? 'border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Eligibility
            </button>

            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <GitCompareArrows className="h-3.5 w-3.5 text-slate-500" />
              Compare
            </button>

            <button
              type="button"
              onClick={() => setCustomRulesOpen(true)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 font-medium cursor-pointer ${
                overridesActive
                  ? 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {overridesActive ? 'Custom Rules' : 'Rules'}
            </button>

            <button
              type="button"
              onClick={() => setExportModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Share2 className="h-3.5 w-3.5 text-slate-500" />
              Export / AI
            </button>

            <button
              type="button"
              onClick={() => setDocsDrawerOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5 text-slate-500" />
              ARC Docs
            </button>

            {effectiveRules.projectMeta?.githubUrl && (
              <a
                href={effectiveRules.projectMeta.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`View source & rules.json on GitHub (${effectiveRules.projectMeta.githubLabel})`}
                aria-label="View source on GitHub"
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50 hover:text-slate-950"
              >
                <GitHubIcon className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Scenario Tabs & Unofficial Disclaimer Strip */}
        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 text-xs">
            {/* Scenario Tabs */}
            <div className="flex flex-wrap items-center gap-1">
              {activeProfile.scenarios.map((s) => {
                const isActive = s.id === activeScenario.id;
                const isRenaming = renamingScenarioId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`group inline-flex items-center gap-1 rounded-md border px-2 py-1 arc-state-transition ${
                      isActive
                        ? 'border-slate-300 bg-white text-slate-900 shadow-2xs font-semibold'
                        : 'border-transparent text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
                    }`}
                  >
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleCommitRename(s.id);
                        }}
                      >
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => handleCommitRename(s.id)}
                          autoFocus
                          className="w-28 rounded border border-slate-400 bg-white px-1 py-0 text-xs"
                        />
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveProfile((p) => ({ ...p, activeScenarioId: s.id }))
                        }
                        className="cursor-pointer"
                      >
                        {s.name}
                      </button>
                    )}

                    {isActive && !isRenaming && (
                      <span className="no-print ml-1 inline-flex items-center gap-0.5 text-slate-400">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingScenarioId(s.id);
                            setRenameDraft(s.name);
                          }}
                          title="Rename scenario"
                          aria-label={`Rename ${s.name}`}
                          className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateScenario(s)}
                          title="Duplicate scenario"
                          aria-label={`Duplicate ${s.name}`}
                          className="rounded p-0.5 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                        >
                          <Copy className="h-2.5 w-2.5" />
                        </button>
                        {activeProfile.scenarios.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteScenario(s.id)}
                            title="Delete scenario"
                            aria-label={`Delete ${s.name}`}
                            className="rounded p-0.5 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleCreateScenario}
                className="no-print inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                New Scenario
              </button>
            </div>

            {/* Concise Disclaimer + No Early Relinquishment Notice */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 text-slate-700 font-medium">
                <Info className="h-3 w-3 text-slate-400" />
                No early relinquishment of active grants
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Unofficial tool · Rules verified <strong>{effectiveRules.verifiedDisplay}</strong> ·
                Verify against Grant Guidelines &amp; RMS
              </span>
              <button
                type="button"
                onClick={() => setDocsDrawerOpen(true)}
                className="no-print font-medium text-slate-700 underline decoration-slate-300 hover:text-slate-950 cursor-pointer"
              >
                Official ARC Docs
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workbench Content */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3.5 py-3 space-y-3">
        {/* Rules Version Update Notice Banner (Preserves Returning User's Saved Plan Safely) */}
        {outdatedFromVersion && (
          <div
            role="status"
            className="no-print flex flex-wrap items-start justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-xs text-sky-950"
          >
            <div className="space-y-1">
              <div className="font-semibold">
                Rules updated from v{outdatedFromVersion} to v{baseRules.version} (verified{' '}
                {baseRules.verifiedDisplay})
              </div>
              <p className="text-[11px] text-sky-900">
                Your saved plans have been preserved safely and recalculated against the latest{' '}
                <code className="font-mono">rules.json</code>.{' '}
                {baseRules.changelog[0]?.summary}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDocsDrawerOpen(true)}
                className="rounded border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-medium text-sky-900 hover:bg-sky-100 cursor-pointer"
              >
                View Changelog
              </button>
              <button
                type="button"
                onClick={handleAcknowledgeRulesUpdate}
                className="rounded bg-sky-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-800 cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}

        {/* Incoming Shared Plan Banner */}
        {pendingSharedPlan && (
          <div
            role="status"
            className="no-print flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-300 bg-teal-50/80 px-3.5 py-2.5 text-xs text-teal-950"
          >
            <div>
              <strong>Shared plan detected in URL:</strong> &ldquo;{pendingSharedPlan.scenarioName}
              &rdquo; ({pendingSharedPlan.grants.length} grant
              {pendingSharedPlan.grants.length === 1 ? '' : 's'}
              {pendingSharedPlan.strippedTitles ? ', custom titles stripped' : ''}). Import as a new
              scenario tab without overwriting your existing plans?
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleImportSharedPlan}
                className="rounded bg-teal-800 px-3 py-1 text-[11px] font-semibold text-white hover:bg-teal-900 cursor-pointer"
              >
                Import as New Scenario
              </button>
              <button
                type="button"
                onClick={handleDismissSharedPlan}
                aria-label="Dismiss shared plan"
                className="rounded p-1 text-teal-700 hover:bg-teal-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Sample Pipeline Quick-Start Strip (first-time orientation + 1-click Start Blank) */}
        {!sampleNoticeDismissed &&
          activeScenario.id === 'scen-baseline' &&
          activeScenario.grants.length > 0 && (
            <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-600 shadow-2xs">
              <span>
                <strong className="text-slate-900">Sample Mid-Career plan loaded</strong> so you can
                explore the 13-point timeline. Click any <strong>If Funded</strong> pill to
                stress-test Plan B, or click any quarter column to see what fits.
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleStartBlank}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  Start Blank
                </button>
                <button
                  type="button"
                  onClick={() => setTemplatesOpen(true)}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  Pick Template
                </button>
                <button
                  type="button"
                  onClick={() => setSampleNoticeDismissed(true)}
                  aria-label="Dismiss sample plan notice"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

        {/* Primary Desktop Horizontal Workbench Grid */}
        <div className="print-full-width grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-3 items-start">
          {/* Left / Main Stage: Synchronized Timeline + Capacity Chart + Funding Rollup */}
          <div className="min-w-0 space-y-3">
            <TimelineAndCapacity
              grants={activeScenario.grants}
              rules={effectiveRules}
              loads={quarterlyLoads}
              eligibility={activeProfile.eligibility}
              issues={eligibilityIssues}
              selectedQuarter={workspace.selectedQuarter}
              onSelectQuarter={(q) =>
                setWorkspace((prev) => (prev ? { ...prev, selectedQuarter: q } : prev))
              }
              onToggleOutcome={handleToggleOutcome}
              onEditGrant={(grant) => {
                setEditingGrant(grant);
                setGrantModalOpen(true);
              }}
              onRemoveGrant={handleRemoveGrant}
              onOpenAddGrant={() => {
                setEditingGrant(null);
                setGrantModalOpen(true);
              }}
            />

            <FundingRollupPanel
              rules={effectiveRules}
              loads={quarterlyLoads}
              rollup={fundingRollup}
              issues={eligibilityIssues}
            />
          </div>

          {/* Right Rail: "What Fits?" Helper + Collaborator Point Check */}
          <div className="space-y-3">
            <WhatFitsHelper
              grants={activeScenario.grants}
              rules={effectiveRules}
              loads={quarterlyLoads}
              eligibility={activeProfile.eligibility}
              selectedQuarter={workspace.selectedQuarter}
              onSelectQuarter={(q) =>
                setWorkspace((prev) => (prev ? { ...prev, selectedQuarter: q } : prev))
              }
              onQuickAdd={handleQuickAddOption}
            />

            <CollaboratorCheckCard
              profiles={workspace.profiles}
              activeProfileId={workspace.activeProfileId}
              rules={effectiveRules}
              selectedQuarter={workspace.selectedQuarter}
              onSelectProfile={(id) =>
                setWorkspace((prev) => (prev ? { ...prev, activeProfileId: id } : prev))
              }
              onAddCollaborator={handleAddCollaborator}
              onRemoveCollaborator={handleRemoveCollaborator}
            />
          </div>
        </div>
      </main>

      {/* Quiet Workbench Footer (Branding, Author, GitHub Badge, Static Endpoints) */}
      <footer className="no-print border-t border-slate-200 bg-white/80">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[11px] text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            {effectiveRules.projectMeta && (
              <>
                <span>
                  Built by{' '}
                  <a
                    href={effectiveRules.projectMeta.authorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-700 hover:text-slate-950 underline decoration-slate-300"
                  >
                    {effectiveRules.projectMeta.authorName}
                  </a>
                </span>
                <span className="text-slate-300">&middot;</span>
                <a
                  href={effectiveRules.projectMeta.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950 arc-state-transition"
                >
                  <GitHubIcon className="h-3 w-3" />
                  <span>{effectiveRules.projectMeta.githubLabel}</span>
                </a>
                <span className="text-slate-300">&middot;</span>
              </>
            )}
            <span>Local-only in your browser (zero server storage)</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="./rules.json"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-slate-900 underline decoration-slate-300"
            >
              rules.json (v{effectiveRules.version})
            </a>
            <a
              href="./llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono hover:text-slate-900 underline decoration-slate-300"
            >
              llms.txt
            </a>
            <button
              type="button"
              onClick={() => setDocsDrawerOpen(true)}
              className="font-medium text-slate-700 hover:text-slate-950 underline decoration-slate-300 cursor-pointer"
            >
              About, Privacy &amp; ARC Docs
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      <GrantFormModal
        open={grantModalOpen}
        onClose={() => {
          setGrantModalOpen(false);
          setEditingGrant(null);
        }}
        rules={effectiveRules}
        eligibility={activeProfile.eligibility}
        existingGrants={activeScenario.grants}
        editingGrant={editingGrant}
        defaultQuarter={workspace.selectedQuarter}
        onSave={handleSaveGrant}
      />

      <EligibilityModal
        open={eligibilityOpen}
        onClose={() => setEligibilityOpen(false)}
        profileName={activeProfile.name}
        eligibility={activeProfile.eligibility}
        rules={effectiveRules}
        onSave={handleSaveEligibility}
      />

      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />

      <ScenarioCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        profile={activeProfile}
        rules={effectiveRules}
        onSelectScenario={(scenarioId) =>
          updateActiveProfile((p) => ({ ...p, activeScenarioId: scenarioId }))
        }
      />

      <CustomRulesModal
        open={customRulesOpen}
        onClose={() => setCustomRulesOpen(false)}
        baseRules={baseRules}
        overrides={workspace.customOverrides}
        onSave={handleSaveOverrides}
      />

      <ExportShareModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        state={workspace}
        profile={activeProfile}
        scenario={activeScenario}
        rules={effectiveRules}
        loads={quarterlyLoads}
        rollup={fundingRollup}
        issues={eligibilityIssues}
        webMcpStatus={webMcpStatus}
        onImportWorkspace={(nextState, outdatedVer) => {
          setWorkspace(nextState);
          setOutdatedFromVersion(outdatedVer);
        }}
      />

      <OfficialDocsDrawer
        open={docsDrawerOpen}
        onClose={() => setDocsDrawerOpen(false)}
        rules={baseRules}
      />
    </div>
  );
}

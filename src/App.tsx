import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Compass,
  Copy,
  GitCompareArrows,
  Info,
  Lock,
  Menu,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
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
} from './engine/planner';
import {
  buildScenarioFromTemplate,
  createId,
  type StarterTemplateDefinition,
} from './engine/templates';
import { exportWorkspaceJson, loadWorkspaceState, saveWorkspaceState } from './utils/storage';
import { exportTimelinePng, triggerFileDownload } from './utils/exportTools';
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
import { QuickTourOverlay } from './components/QuickTourOverlay';
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
  const [grantModalTargetProfileId, setGrantModalTargetProfileId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'what-fits' | 'team'>('what-fits');
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [undoSnapshot, setUndoSnapshot] = useState<{
    label: string;
    workspace: PersistedWorkspaceState;
  } | null>(null);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [customRulesOpen, setCustomRulesOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  // Inline scenario rename & mobile UI state
  const [renamingScenarioId, setRenamingScenarioId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [sampleNoticeDismissed, setSampleNoticeDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileTipDismissed, setMobileTipDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('arc_mobile_tip_dismissed') === '1';
    } catch {
      return false;
    }
  });

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

  const captureUndo = useCallback(
    (label: string) => {
      if (!workspace) return;
      setUndoSnapshot({
        label,
        workspace: JSON.parse(JSON.stringify(workspace)) as PersistedWorkspaceState,
      });
    },
    [workspace],
  );

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setWorkspace(undoSnapshot.workspace);
    setUndoSnapshot(null);
  };

  const handleQuickBackupJson = () => {
    if (!workspace) return;
    const json = exportWorkspaceJson(workspace);
    triggerFileDownload(
      `arc-points-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      'application/json;charset=utf-8',
    );
  };

  const handleQuickDownloadPng = () => {
    if (!effectiveRules || !activeProfile || !activeScenario) return;
    exportTimelinePng({
      profile: activeProfile,
      scenario: activeScenario,
      rules: effectiveRules,
      loads: quarterlyLoads,
    });
  };

  const handleQuickPrintPdf = () => {
    window.print();
  };

  const handleDeleteScenario = (scenarioId: string) => {
    const targetName = activeProfile?.scenarios.find((s) => s.id === scenarioId)?.name ?? 'scenario';
    captureUndo(`Deleted "${targetName}"`);
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
    if (mode === 'replace') {
      captureUndo(`Replaced scenario with "${template.name}"`);
    }
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

  const handleAddCollaborator = (name: string, importedPlan?: SharedPlanPayload) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      const scenId = createId('scen');
      const newProfile: ResearcherProfile = {
        id: createId('profile'),
        name,
        isPrimary: false,
        eligibility: importedPlan?.eligibility ?? {
          phdConferralDate: '',
          careerInterruptionMonths: 0,
          isIndigenousResearcher: false,
        },
        scenarios: [
          {
            id: scenId,
            name: importedPlan?.scenarioName || 'Current Commitments',
            createdAt: new Date().toISOString(),
            grants: importedPlan ? importedPlan.grants : [],
          },
        ],
        activeScenarioId: scenId,
      };
      return {
        ...prev,
        profiles: [...prev.profiles, newProfile],
        // Keep the user on their own timeline when importing/adding a Co-CI so their screen does not jump unexpectedly
        activeProfileId: prev.activeProfileId,
      };
    });
  };

  const handleRemoveCollaborator = (profileId: string) => {
    const removedName = workspace?.profiles.find((p) => p.id === profileId)?.name ?? 'collaborator';
    captureUndo(`Removed ${removedName}`);
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

  const handleSaveCollaboratorGrant = useCallback((profileId: string, grant: GrantEntry) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === profileId
            ? {
                ...p,
                scenarios: p.scenarios.map((s) => {
                  if (s.id !== p.activeScenarioId) return s;
                  const exists = s.grants.some((g) => g.id === grant.id);
                  return {
                    ...s,
                    grants: exists
                      ? s.grants.map((g) => (g.id === grant.id ? grant : g))
                      : [...s.grants, grant],
                  };
                }),
              }
            : p,
        ),
      };
    });
  }, []);

  const handleRemoveCollaboratorGrant = (profileId: string, grantId: string) => {
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        profiles: prev.profiles.map((p) =>
          p.id === profileId
            ? {
                ...p,
                scenarios: p.scenarios.map((s) =>
                  s.id === p.activeScenarioId
                    ? { ...s, grants: s.grants.filter((g) => g.id !== grantId) }
                    : s,
                ),
              }
            : p,
        ),
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

  const handleImportSharedPlanAsCoCi = () => {
    if (!pendingSharedPlan || !workspace) return;
    const coCiCount = workspace.profiles.filter((p) => !p.isPrimary).length;
    const label =
      pendingSharedPlan.scenarioName && pendingSharedPlan.scenarioName !== 'Shared Plan'
        ? `${pendingSharedPlan.scenarioName} (Co-CI)`
        : `Co-CI ${coCiCount + 1}`;
    handleAddCollaborator(label, pendingSharedPlan);
    setRightTab('team');
    setPendingSharedPlan(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const handleDismissSharedPlan = () => {
    setPendingSharedPlan(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const handleStartBlank = () => {
    captureUndo('Cleared scenario');
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

  const primaryProfile =
    workspace.profiles.find((p) => p.isPrimary) ?? workspace.profiles[0];
  const primaryActiveScenario =
    primaryProfile.scenarios.find((s) => s.id === primaryProfile.activeScenarioId) ??
    primaryProfile.scenarios[0];
  const primaryGrants = primaryActiveScenario?.grants ?? [];
  const overridesActive = hasActiveOverrides(workspace.customOverrides);

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fb] text-slate-900">
      {/* Compact Workspace Top Bar (Single Row on 1280px Laptops; Slim Collapsible Bar on Phones) */}
      <header className="md:sticky md:top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3.5 py-2">
          {/* Brand */}
          <div className="flex items-center gap-2 min-w-0">
            <BrandMark className="h-7 w-7 sm:h-8 sm:w-8" />
            <h1
              title="ARC NCGP Research Points Planner"
              className="truncate text-[15px] sm:text-base font-bold tracking-tight text-slate-900"
            >
              <span className="hidden sm:inline">ARC NCGP Points Planner</span>
              <span className="sm:hidden">ARC Points</span>
            </h1>
          </div>

          {/* Mobile Compact Actions (< md): + Add + Menu Toggle */}
          <div className="no-print flex md:hidden items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setGrantModalTargetProfileId(null);
                setEditingGrant(null);
                setGrantModalOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
            <button
              type="button"
              data-tour="toolbar"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle planner tools menu"
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium cursor-pointer ${
                mobileMenuOpen
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {mobileMenuOpen ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
              Menu
            </button>
          </div>

          {/* Desktop Global Tools Bar (md+) */}
          <div data-tour="toolbar" className="no-print hidden md:flex flex-wrap items-center gap-1.5 text-[11px]">
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

        {/* Mobile Collapsible Tools Drawer (< md) */}
        {mobileMenuOpen && (
          <div className="no-print md:hidden border-t border-slate-200 bg-slate-50 px-3.5 py-3 space-y-2.5 text-xs">
            {workspace.profiles.length > 1 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Switch Profile
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {workspace.profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setWorkspace((prev) => (prev ? { ...prev, activeProfileId: p.id } : prev));
                        setMobileMenuOpen(false);
                      }}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium cursor-pointer ${
                        p.id === workspace.activeProfileId
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setTemplatesOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-700 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-slate-500" />
                Templates
              </button>
              <button
                type="button"
                onClick={() => {
                  setEligibilityOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-700 cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5 text-slate-500" />
                Eligibility
              </button>
              <button
                type="button"
                onClick={() => {
                  setCompareOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-700 cursor-pointer"
              >
                <GitCompareArrows className="h-3.5 w-3.5 text-slate-500" />
                Compare Plans
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomRulesOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-700 cursor-pointer"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" />
                {overridesActive ? 'Custom Rules' : 'Rules Override'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-700 cursor-pointer"
              >
                <Share2 className="h-3.5 w-3.5 text-slate-500" />
                Export / Share
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocsDrawerOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-2 font-medium text-slate-700 cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                Official ARC Docs
              </button>
            </div>
          </div>
        )}

        {/* Scenario Tabs & Profile Strip */}
        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="mx-auto flex max-w-[1600px] flex-nowrap items-center justify-between gap-2 px-3.5 py-1.5 text-xs">
            {/* Horizontally scrollable Scenario Tabs */}
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0">
              {activeProfile.scenarios.map((s) => {
                const isActive = s.id === activeScenario.id;
                const isRenaming = renamingScenarioId === s.id;
                return (
                  <div
                    key={s.id}
                    className={`group shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1 arc-state-transition ${
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
                className="no-print shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200/60 hover:text-slate-900 cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3 w-3" />
                New Scenario
              </button>
            </div>

            {/* Right side of Scenario Strip: Profile Switcher (compact select on tablet or >4 profiles, pills on xl+) */}
            {workspace.profiles.length > 1 && (
              <div className="no-print hidden md:flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Profile:
                </span>
                {workspace.profiles.length <= 4 && (
                  <div className="hidden xl:inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 text-[11px]">
                    {workspace.profiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setWorkspace((prev) => (prev ? { ...prev, activeProfileId: p.id } : prev))
                        }
                        className={`rounded px-2 py-0.5 font-medium cursor-pointer arc-state-transition ${
                          p.id === workspace.activeProfileId
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
                <select
                  aria-label="Active researcher profile"
                  value={workspace.activeProfileId}
                  onChange={(e) =>
                    setWorkspace((prev) =>
                      prev ? { ...prev, activeProfileId: e.target.value } : prev,
                    )
                  }
                  className={`${
                    workspace.profiles.length <= 4 ? 'xl:hidden' : ''
                  } rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-800 cursor-pointer`}
                >
                  {workspace.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workbench Content */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-3.5 py-3 space-y-3">
        {/* Gentle Dismissible Desktop Recommendation on Narrow Phones (< sm; hidden while sample banner is shown to avoid stacked banners) */}
        {!mobileTipDismissed &&
          !(!sampleNoticeDismissed &&
            activeScenario.id === 'scen-baseline' &&
            activeScenario.grants.length > 0) && (
          <div className="no-print sm:hidden flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 shadow-2xs">
            <div className="flex items-start gap-2">
              <Monitor className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
              <span>
                <strong>Desktop recommended</strong> for the full 2027-2032 Gantt overview. On
                phone, swipe the capacity chart or tap any card below.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileTipDismissed(true);
                try {
                  sessionStorage.setItem('arc_mobile_tip_dismissed', '1');
                } catch {
                  // ignore
                }
              }}
              aria-label="Dismiss desktop recommendation"
              className="rounded p-0.5 text-slate-400 hover:text-slate-700 shrink-0 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Collaborator Context Banner (shown whenever viewing a Co-CI profile) */}
        {!activeProfile.isPrimary && (
          <div
            role="status"
            className="no-print flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3.5 py-2 text-xs text-indigo-950"
          >
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-700 shrink-0" />
              <span>
                Viewing collaborator profile: <strong>{activeProfile.name}</strong>. Grants edited
                here feed directly into Team / Co-CI Point Check.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const primary = workspace.profiles.find((p) => p.isPrimary) ?? workspace.profiles[0];
                if (primary) {
                  setWorkspace((prev) => (prev ? { ...prev, activeProfileId: primary.id } : prev));
                }
              }}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-800 cursor-pointer shrink-0"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to You (Primary)
            </button>
          </div>
        )}

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
              {pendingSharedPlan.strippedTitles ? ', custom titles stripped' : ''}). Add to your own
              scenarios or load directly as a Co-CI collaborator profile?
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleImportSharedPlan}
                className="rounded bg-teal-800 px-3 py-1 text-[11px] font-semibold text-white hover:bg-teal-900 cursor-pointer"
              >
                Import as My Scenario
              </button>
              <button
                type="button"
                onClick={handleImportSharedPlanAsCoCi}
                className="rounded border border-teal-700 bg-white px-3 py-1 text-[11px] font-semibold text-teal-900 hover:bg-teal-100 cursor-pointer"
              >
                Import as Co-CI Profile
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
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTimelineExpanded(false);
                    setTourOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded bg-teal-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-900 cursor-pointer"
                >
                  <Compass className="h-3 w-3" />
                  Quick Tour (5 steps)
                </button>
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
                setGrantModalTargetProfileId(null);
                setEditingGrant(grant);
                setGrantModalOpen(true);
              }}
              onRemoveGrant={handleRemoveGrant}
              onOpenAddGrant={() => {
                setGrantModalTargetProfileId(null);
                setEditingGrant(null);
                setGrantModalOpen(true);
              }}
              isExpanded={timelineExpanded}
              scenarioName={activeScenario.name}
              onToggleExpand={() => setTimelineExpanded((v) => !v)}
              onDownloadPng={handleQuickDownloadPng}
              onPrintPdf={handleQuickPrintPdf}
            />

            <FundingRollupPanel
              rules={effectiveRules}
              loads={quarterlyLoads}
              rollup={fundingRollup}
              issues={eligibilityIssues}
            />
          </div>

          {/* Unified Two-Tab Right Panel: "What Fits?" | "Team / Co-CI" */}
          <div data-tour="assistant" className="no-print rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div
              role="tablist"
              aria-label="Planning Assistant Tabs"
              className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/90 text-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'what-fits'}
                onClick={() => setRightTab('what-fits')}
                className={`flex items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer arc-state-transition ${
                  rightTab === 'what-fits'
                    ? 'border-slate-900 bg-white text-slate-900'
                    : 'border-transparent text-slate-500 hover:bg-slate-100/70 hover:text-slate-800'
                }`}
              >
                <Compass className="h-3.5 w-3.5 shrink-0" />
                <span>What Fits?</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rightTab === 'team'}
                onClick={() => setRightTab('team')}
                className={`flex items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer arc-state-transition ${
                  rightTab === 'team'
                    ? 'border-slate-900 bg-white text-slate-900'
                    : 'border-transparent text-slate-500 hover:bg-slate-100/70 hover:text-slate-800'
                }`}
              >
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>Team / Co-CI</span>
                {workspace.profiles.filter((p) => !p.isPrimary).length > 0 && (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-slate-700 tabular-nums">
                    {workspace.profiles.filter((p) => !p.isPrimary).length}
                  </span>
                )}
              </button>
            </div>

            {rightTab === 'what-fits' ? (
              <WhatFitsHelper
                embedded
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
            ) : (
              <CollaboratorCheckCard
                embedded
                profiles={workspace.profiles}
                activeProfileId={workspace.activeProfileId}
                primaryGrants={primaryGrants}
                rules={effectiveRules}
                selectedQuarter={workspace.selectedQuarter}
                onSelectProfile={(id) =>
                  setWorkspace((prev) => (prev ? { ...prev, activeProfileId: id } : prev))
                }
                onAddCollaborator={handleAddCollaborator}
                onRemoveCollaborator={handleRemoveCollaborator}
                onOpenAddCollaboratorGrant={(profile) => {
                  setGrantModalTargetProfileId(profile.id);
                  setEditingGrant(null);
                  setGrantModalOpen(true);
                }}
                onOpenEditCollaboratorGrant={(profile, grant) => {
                  setGrantModalTargetProfileId(profile.id);
                  setEditingGrant(grant);
                  setGrantModalOpen(true);
                }}
                onRemoveCollaboratorGrant={handleRemoveCollaboratorGrant}
              />
            )}
          </div>
        </div>
      </main>

      {/* Structured Workbench Footer (Privacy Badge, Attribution, Source, Endpoints) */}
      <footer className="no-print border-t border-slate-200 bg-white/90">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5 text-[11px] text-slate-500">
          {/* Left: Privacy Badge + Unofficial Rules Version */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setDocsDrawerOpen(true)}
              title="All plans stay in your browser localStorage. Zero server storage, cookies, or analytics. Click for Privacy & Docs."
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100/80 cursor-pointer arc-state-transition"
            >
              <Lock className="h-2.5 w-2.5 shrink-0" />
              <span>Local-only &amp; Private</span>
            </button>

            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span>
                Unofficial ARC NCGP planner (Rules{' '}
                <span className="font-mono text-slate-700">v{effectiveRules.version}</span>,{' '}
                {effectiveRules.verifiedDisplay}). Please verify against final ARC Grant Guidelines
                &amp; RMS.
              </span>
            </span>
          </div>

          {/* Right: Author, GitHub Badge, Machine-Readable Endpoints & Docs */}
          <div className="flex flex-wrap items-center gap-2.5">
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
                <a
                  href={effectiveRules.projectMeta.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-[10px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-950 arc-state-transition"
                >
                  <GitHubIcon className="h-3 w-3 shrink-0" />
                  <span>{effectiveRules.projectMeta.githubLabel}</span>
                </a>
                <span className="hidden sm:inline text-slate-300">|</span>
              </>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleQuickBackupJson}
                title="Download a local JSON backup of all scenarios, Co-CIs, and settings"
                className="font-medium text-slate-600 hover:text-slate-950 underline decoration-slate-300 cursor-pointer"
              >
                Backup JSON
              </button>
              <a
                href="./rules.json"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono hover:text-slate-900 underline decoration-slate-300"
              >
                rules.json
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
                Privacy &amp; Docs
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals & Drawers */}
      {(() => {
        const targetCoCi = grantModalTargetProfileId
          ? workspace.profiles.find((p) => p.id === grantModalTargetProfileId)
          : undefined;
        const targetCoCiScenario = targetCoCi
          ? (targetCoCi.scenarios.find((s) => s.id === targetCoCi.activeScenarioId) ??
            targetCoCi.scenarios[0])
          : undefined;

        return (
          <GrantFormModal
            open={grantModalOpen}
            onClose={() => {
              setGrantModalOpen(false);
              setEditingGrant(null);
              setGrantModalTargetProfileId(null);
            }}
            rules={effectiveRules}
            eligibility={targetCoCi ? targetCoCi.eligibility : activeProfile.eligibility}
            existingGrants={targetCoCiScenario ? targetCoCiScenario.grants : activeScenario.grants}
            editingGrant={editingGrant}
            defaultQuarter={workspace.selectedQuarter}
            targetProfileName={targetCoCi?.name}
            onSave={(grant) => {
              if (targetCoCi) {
                handleSaveCollaboratorGrant(targetCoCi.id, grant);
              } else {
                handleSaveGrant(grant);
              }
            }}
          />
        );
      })()}

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
        onDownloadBackup={handleQuickBackupJson}
        onStartTour={() => {
          setDocsDrawerOpen(false);
          setTimelineExpanded(false);
          setTourOpen(true);
        }}
      />

      <QuickTourOverlay
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onSelectRightTab={setRightTab}
      />

      {/* 1-Step Undo Toast after destructive actions (Start Blank, Delete Scenario, Replace Template, Remove Co-CI) */}
      {undoSnapshot && (
        <div
          role="status"
          className="no-print fixed bottom-4 right-4 z-40 flex items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-white shadow-lg"
        >
          <span>{undoSnapshot.label}</span>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndoSnapshot(null)}
            aria-label="Dismiss undo notification"
            className="rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

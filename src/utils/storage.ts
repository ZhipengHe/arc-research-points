import type { GrantEntry, PersistedWorkspaceState, QuarterKey, RulesData } from '../types/arc';
import { createEmptyOverrides } from '../engine/rules';
import { createInitialWorkspaceState } from '../engine/templates';

export const STORAGE_KEY = 'arc_ncgp_points_planner_v1';

const QUARTER_KEY_RE = /^\d{4}-Q[1-4]$/;

function isValidQuarterKey(value: unknown): value is QuarterKey {
  return typeof value === 'string' && QUARTER_KEY_RE.test(value);
}

export function sanitizeGrantEntry(raw: unknown): GrantEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (
    typeof g.id !== 'string' ||
    !g.id.trim() ||
    typeof g.schemeId !== 'string' ||
    !g.schemeId.trim() ||
    typeof g.roleId !== 'string' ||
    !g.roleId.trim() ||
    typeof g.label !== 'string' ||
    !g.label.trim() ||
    typeof g.isLegacy !== 'boolean' ||
    !isValidQuarterKey(g.submissionQuarter) ||
    !isValidQuarterKey(g.outcomeQuarter) ||
    !isValidQuarterKey(g.startQuarter) ||
    typeof g.durationYears !== 'number' ||
    !Number.isFinite(g.durationYears) ||
    g.durationYears < 1 ||
    g.durationYears > 10 ||
    (g.outcome !== 'funded' && g.outcome !== 'unsuccessful')
  ) {
    return null;
  }

  return {
    id: g.id,
    isLegacy: g.isLegacy,
    isAwarded: typeof g.isAwarded === 'boolean' ? g.isAwarded : undefined,
    schemeId: g.schemeId,
    roleId: g.roleId,
    label: g.label,
    isCustomLabel: Boolean(g.isCustomLabel),
    submissionQuarter: g.submissionQuarter,
    outcomeQuarter: g.outcomeQuarter,
    startQuarter: g.startQuarter,
    durationYears: Math.round(g.durationYears),
    outcome: g.outcome,
    notes: typeof g.notes === 'string' ? g.notes : undefined,
  };
}

export interface LoadedWorkspaceResult {
  state: PersistedWorkspaceState;
  outdatedFromVersion: string | null;
}

export function loadWorkspaceState(rules: RulesData): LoadedWorkspaceResult {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { state: createInitialWorkspaceState(rules), outdatedFromVersion: null };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createInitialWorkspaceState(rules), outdatedFromVersion: null };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceState>;
    const sanitized = sanitizeWorkspaceState(parsed, rules);
    const savedVersion = typeof parsed.rulesVersion === 'string' ? parsed.rulesVersion : null;
    const outdatedFromVersion =
      savedVersion && savedVersion !== rules.version ? savedVersion : null;

    return {
      state: sanitized,
      outdatedFromVersion,
    };
  } catch {
    return { state: createInitialWorkspaceState(rules), outdatedFromVersion: null };
  }
}

export function saveWorkspaceState(state: PersistedWorkspaceState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage quota or private mode error; keep app running in memory
  }
}

export function sanitizeWorkspaceState(
  raw: Partial<PersistedWorkspaceState>,
  rules: RulesData,
): PersistedWorkspaceState {
  const fallback = createInitialWorkspaceState(rules);

  if (!raw || !Array.isArray(raw.profiles) || raw.profiles.length === 0) {
    return fallback;
  }

  const profiles = raw.profiles
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    .map((p, index) => {
      const scenarios =
        Array.isArray(p.scenarios) && p.scenarios.length > 0
          ? p.scenarios.map((s) => ({
              id: typeof s.id === 'string' ? s.id : `scen-${index}`,
              name: typeof s.name === 'string' ? s.name : 'Untitled Scenario',
              createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
              grants: Array.isArray(s.grants)
                ? s.grants
                    .map((g) => sanitizeGrantEntry(g))
                    .filter((g): g is GrantEntry => g !== null)
                : [],
            }))
          : [
              {
                id: `scen-${index}-default`,
                name: 'Plan A',
                createdAt: new Date().toISOString(),
                grants: [],
              },
            ];

      const activeScenarioId = scenarios.some((s) => s.id === p.activeScenarioId)
        ? p.activeScenarioId
        : scenarios[0].id;

      return {
        id: p.id,
        name: p.name,
        isPrimary: Boolean(p.isPrimary ?? index === 0),
        eligibility: {
          phdConferralDate:
            typeof p.eligibility?.phdConferralDate === 'string'
              ? p.eligibility.phdConferralDate
              : '',
          careerInterruptionMonths:
            typeof p.eligibility?.careerInterruptionMonths === 'number' &&
            Number.isFinite(p.eligibility.careerInterruptionMonths)
              ? Math.max(0, p.eligibility.careerInterruptionMonths)
              : 0,
          isIndigenousResearcher: Boolean(p.eligibility?.isIndigenousResearcher),
        },
        scenarios,
        activeScenarioId,
      };
    });

  if (profiles.length === 0) return fallback;

  const activeProfileId = profiles.some((p) => p.id === raw.activeProfileId)
    ? (raw.activeProfileId as string)
    : profiles[0].id;

  const customOverrides = {
    ...createEmptyOverrides(),
    ...(raw.customOverrides ?? {}),
    schemeRolePoints: { ...(raw.customOverrides?.schemeRolePoints ?? {}) },
    schemeFirstRoundQuarter: { ...(raw.customOverrides?.schemeFirstRoundQuarter ?? {}) },
    schemeOutcomeLagQuarters: { ...(raw.customOverrides?.schemeOutcomeLagQuarters ?? {}) },
  };

  return {
    schemaVersion: 1,
    rulesVersion: typeof raw.rulesVersion === 'string' ? raw.rulesVersion : rules.version,
    profiles,
    activeProfileId,
    customOverrides,
    selectedQuarter:
      typeof raw.selectedQuarter === 'string' && /^\d{4}-Q[1-4]$/.test(raw.selectedQuarter)
        ? raw.selectedQuarter
        : fallback.selectedQuarter,
  };
}

export function exportWorkspaceJson(state: PersistedWorkspaceState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      application: 'ARC NCGP Research Points Planner',
      workspace: state,
    },
    null,
    2,
  );
}

export function parseImportedWorkspaceJson(
  text: string,
  rules: RulesData,
): { state: PersistedWorkspaceState; outdatedFromVersion: string | null } {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  const candidate = (
    parsed && typeof parsed === 'object' && 'workspace' in parsed ? parsed.workspace : parsed
  ) as Partial<PersistedWorkspaceState>;

  if (!candidate || !Array.isArray(candidate.profiles) || candidate.profiles.length === 0) {
    throw new Error('JSON file does not contain a valid ARC Research Points Planner workspace.');
  }

  const sanitized = sanitizeWorkspaceState(candidate, rules);
  const savedVersion = typeof candidate.rulesVersion === 'string' ? candidate.rulesVersion : null;
  const outdatedFromVersion =
    savedVersion && savedVersion !== rules.version ? savedVersion : null;

  return { state: sanitized, outdatedFromVersion };
}

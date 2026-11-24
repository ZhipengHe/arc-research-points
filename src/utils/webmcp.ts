import type {
  GrantOutcome,
  QuarterKey,
  ResearcherProfile,
  RulesData,
  Scenario,
} from '../types/arc';
import {
  computeEligibilityIssues,
  computeFundingRollup,
  computeQuarterlyLoads,
  findFittingRoles,
  getGrantEndQuarter,
  getGrantPoints,
  getPeakLoadSummary,
} from '../engine/planner';
import { formatQuarterShort } from '../engine/quarters';

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnlyHint?: boolean;
  execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface ModelContextLike {
  registerTool?: (
    tool: WebMcpToolDefinition,
    options?: { signal?: AbortSignal; readOnlyHint?: boolean },
  ) => Promise<void> | void;
  provideContext?: (context: { tools: WebMcpToolDefinition[] }) => Promise<void> | void;
}

export interface WebMcpBridgeHandlers {
  getState: () => {
    rules: RulesData;
    profile: ResearcherProfile;
    scenario: Scenario;
    selectedQuarter: QuarterKey;
  };
  addGrant: (input: {
    schemeId: string;
    roleId: string;
    submissionQuarter?: QuarterKey;
    durationYears?: number;
    outcome?: GrantOutcome;
    isAwarded?: boolean;
    label?: string;
    isLegacy?: boolean;
  }) => { ok: boolean; grantId?: string; message: string };
  removeGrant: (grantId: string) => { ok: boolean; message: string };
  toggleFundedStatus: (grantId: string, outcome?: GrantOutcome) => { ok: boolean; outcome?: GrantOutcome; message: string };
  switchScenario: (scenarioNameOrId: string) => { ok: boolean; message: string };
}

export interface WebMcpRegistrationStatus {
  supported: boolean;
  surface: 'document.modelContext' | 'navigator.modelContext' | 'none';
  toolNames: string[];
}

export const WEBMCP_TOOL_NAMES = [
  'get_current_plan',
  'add_grant',
  'remove_grant',
  'toggle_funded_status',
  'find_fitting_roles',
  'switch_scenario',
  'get_rules',
] as const;

export function registerWebMcpTools(handlers: WebMcpBridgeHandlers): {
  status: WebMcpRegistrationStatus;
  cleanup: () => void;
} {
  const toToolResponse = (payload: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  });

  const tools: WebMcpToolDefinition[] = [
    {
      name: 'get_current_plan',
      description:
        'Inspect the active ARC NCGP Research Points scenario, grants, quarter-by-quarter point loads (2027-2032), peak load, over-limit quarters, funding roll-up, and eligibility alerts.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      readOnlyHint: true,
      execute: () => {
        const { rules, profile, scenario, selectedQuarter } = handlers.getState();
        const loads = computeQuarterlyLoads(scenario.grants, rules);
        const peak = getPeakLoadSummary(loads);
        const issues = computeEligibilityIssues(scenario.grants, rules, profile.eligibility, loads);
        const rollup = computeFundingRollup(scenario.grants, rules, loads);

        return toToolResponse({
          profileName: profile.name,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          availableScenarios: profile.scenarios.map((s) => ({ id: s.id, name: s.name })),
          selectedQuarter,
          hardCap: rules.hardCap,
          peakPoints: peak.peakPoints,
          peakQuarter: peak.peakQuarter,
          overCapQuarters: peak.overCapQuarters.map((q) => ({
            quarter: q.quarter,
            totalPoints: q.totalPoints,
            overBy: q.overCapBy,
          })),
          fundingRollup: rollup,
          eligibilityIssues: issues,
          grants: scenario.grants.map((g) => ({
            id: g.id,
            label: g.label,
            isLegacy: g.isLegacy,
            schemeId: g.schemeId,
            roleId: g.roleId,
            points: getGrantPoints(g, rules),
            submissionQuarter: g.submissionQuarter,
            outcomeQuarter: g.outcomeQuarter,
            startQuarter: g.startQuarter,
            endQuarter: getGrantEndQuarter(g),
            durationYears: g.durationYears,
            outcome: g.outcome,
          })),
        });
      },
    },
    {
      name: 'add_grant',
      description:
        'Add an ARC NCGP or 0-point legacy grant to the active scenario. Uses generic default labels (e.g. "Explore #1") when label is omitted.',
      inputSchema: {
        type: 'object',
        properties: {
          schemeId: {
            type: 'string',
            description:
              'Scheme ID: explore, initiate, lead-mentor, indigenous-excellence, collaborate, cief, breakthrough, prioritise, or legacy-dp/legacy-lp/legacy-decra/legacy-ft.',
          },
          roleId: {
            type: 'string',
            description: 'Role ID for the scheme (e.g. lead-ci, ci, sci-ecr, sci-mcr, lead-ci-director, node-lead-ci, legacy-ci).',
          },
          submissionQuarter: {
            type: 'string',
            description: 'Quarter key YYYY-Q1..Q4 (optional; defaults to scheme first round).',
          },
          durationYears: {
            type: 'number',
            description: 'Project duration in years (optional; defaults to scheme max duration).',
          },
          outcome: {
            type: 'string',
            enum: ['funded', 'unsuccessful'],
            description: 'Modelled outcome for planned/submitted bids (defaults to funded).',
          },
          isAwarded: {
            type: 'boolean',
            description: 'Set true if this NCGP grant is already awarded and locked in RMS (skips pending phase).',
          },
          label: {
            type: 'string',
            description: 'Optional custom project label.',
          },
        },
        required: ['schemeId', 'roleId'],
      },
      execute: (args) => {
        const result = handlers.addGrant({
          schemeId: String(args.schemeId ?? ''),
          roleId: String(args.roleId ?? ''),
          submissionQuarter:
            typeof args.submissionQuarter === 'string'
              ? (args.submissionQuarter as QuarterKey)
              : undefined,
          durationYears:
            typeof args.durationYears === 'number' ? args.durationYears : undefined,
          outcome:
            args.outcome === 'unsuccessful' || args.outcome === 'funded'
              ? args.outcome
              : 'funded',
          isAwarded: Boolean(args.isAwarded),
          label: typeof args.label === 'string' ? args.label : undefined,
          isLegacy: String(args.schemeId ?? '').startsWith('legacy-'),
        });
        return toToolResponse(result);
      },
    },
    {
      name: 'remove_grant',
      description: 'Remove a grant entry from the active scenario by grantId.',
      inputSchema: {
        type: 'object',
        properties: {
          grantId: { type: 'string', description: 'ID of the grant to remove.' },
        },
        required: ['grantId'],
      },
      execute: (args) => toToolResponse(handlers.removeGrant(String(args.grantId ?? ''))),
    },
    {
      name: 'toggle_funded_status',
      description:
        'Toggle or set a grant between funded (locks points for full duration) and unsuccessful (releases points at outcome date) to stress-test Plan A vs Plan B.',
      inputSchema: {
        type: 'object',
        properties: {
          grantId: { type: 'string', description: 'Grant ID from get_current_plan.' },
          outcome: {
            type: 'string',
            enum: ['funded', 'unsuccessful'],
            description: 'Optional explicit outcome; omit to toggle.',
          },
        },
        required: ['grantId'],
      },
      execute: (args) =>
        toToolResponse(
          handlers.toggleFundedStatus(
            String(args.grantId ?? ''),
            args.outcome === 'funded' || args.outcome === 'unsuccessful'
              ? args.outcome
              : undefined,
          ),
        ),
    },
    {
      name: 'find_fitting_roles',
      description:
        'List all valid ARC NCGP scheme and role combinations that fit within the remaining point balance for a given quarter (2027-Q1 to 2032-Q4).',
      inputSchema: {
        type: 'object',
        properties: {
          quarter: {
            type: 'string',
            description: 'Target quarter key (e.g. 2028-Q3). Defaults to currently selected quarter.',
          },
        },
      },
      readOnlyHint: true,
      execute: (args) => {
        const { rules, profile, scenario, selectedQuarter } = handlers.getState();
        const target =
          typeof args.quarter === 'string' && /^\d{4}-Q[1-4]$/.test(args.quarter)
            ? (args.quarter as QuarterKey)
            : selectedQuarter;
        const result = findFittingRoles(scenario.grants, rules, profile.eligibility, target);
        return toToolResponse({
          targetQuarter: result.targetQuarter,
          targetQuarterDisplay: formatQuarterShort(result.targetQuarter),
          currentPoints: result.currentPoints,
          remainingPoints: result.remainingPoints,
          fittingOptions: result.options.map((opt) => ({
            schemeId: opt.scheme.id,
            schemeName: opt.scheme.name,
            schemeStatus: opt.scheme.status,
            roleId: opt.role.id,
            roleLabel: opt.role.label,
            points: opt.points,
            suggestedSubmissionQuarter: opt.suggestedSubmissionQuarter,
            peakLoadIfAdded: opt.peakLoadIfAdded,
            exceedsCapLater: opt.exceedsCapLater,
            isEligible: opt.isEligible,
            eligibilityIssues: opt.eligibilityIssues,
          })),
        });
      },
    },
    {
      name: 'switch_scenario',
      description: 'Switch the active scenario tab by scenario ID or name.',
      inputSchema: {
        type: 'object',
        properties: {
          scenario: { type: 'string', description: 'Scenario ID or name.' },
        },
        required: ['scenario'],
      },
      execute: (args) => toToolResponse(handlers.switchScenario(String(args.scenario ?? ''))),
    },
    {
      name: 'get_rules',
      description:
        'Return the active ARC NCGP rules metadata, hard cap, schemes, point costs, and official ARC reference links.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      readOnlyHint: true,
      execute: () => {
        const { rules } = handlers.getState();
        return toToolResponse(rules);
      },
    },
  ];

  const docContext =
    typeof document !== 'undefined'
      ? ((document as unknown as { modelContext?: ModelContextLike }).modelContext ?? null)
      : null;
  const navContext =
    typeof navigator !== 'undefined'
      ? ((navigator as unknown as { modelContext?: ModelContextLike }).modelContext ?? null)
      : null;

  const controller = new AbortController();

  if (docContext && typeof docContext.registerTool === 'function') {
    for (const tool of tools) {
      try {
        void docContext.registerTool(tool, {
          signal: controller.signal,
          readOnlyHint: tool.readOnlyHint,
        });
      } catch {
        // Ignore browser-specific signature errors
      }
    }
    return {
      status: {
        supported: true,
        surface: 'document.modelContext',
        toolNames: tools.map((t) => t.name),
      },
      cleanup: () => controller.abort(),
    };
  }

  if (navContext) {
    if (typeof navContext.registerTool === 'function') {
      for (const tool of tools) {
        try {
          void navContext.registerTool(tool, {
            signal: controller.signal,
            readOnlyHint: tool.readOnlyHint,
          });
        } catch {
          // Ignore browser-specific signature errors
        }
      }
    } else if (typeof navContext.provideContext === 'function') {
      try {
        void navContext.provideContext({ tools });
      } catch {
        // Ignore
      }
    }
    return {
      status: {
        supported: true,
        surface: 'navigator.modelContext',
        toolNames: tools.map((t) => t.name),
      },
      cleanup: () => controller.abort(),
    };
  }

  return {
    status: {
      supported: false,
      surface: 'none',
      toolNames: tools.map((t) => t.name),
    },
    cleanup: () => controller.abort(),
  };
}

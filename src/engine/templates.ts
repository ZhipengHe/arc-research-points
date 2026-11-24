import type {
  EligibilityProfile,
  GrantEntry,
  PersistedWorkspaceState,
  ResearcherProfile,
  RulesData,
  Scenario,
} from '../types/arc';
import { createEmptyOverrides } from './rules';

export interface StarterTemplateDefinition {
  id: 'ecr' | 'mcr' | 'senior';
  name: string;
  badge: string;
  description: string;
  eligibility: EligibilityProfile;
  grants: Omit<GrantEntry, 'id'>[];
}

export const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    id: 'ecr',
    name: 'Fresh Postdoc / ECR',
    badge: 'ECR (0-5 yrs)',
    description: 'Initiate Fellowship (8 pts) + Explore CI (3 pts), staying inside the 5-year post-PhD cutoff.',
    eligibility: {
      phdConferralDate: '2025-06-01',
      careerInterruptionMonths: 0,
      isIndigenousResearcher: false,
    },
    grants: [
      {
        isLegacy: false,
        schemeId: 'initiate',
        roleId: 'lead-ci',
        label: 'Initiate #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q2',
        outcomeQuarter: '2027-Q4',
        startQuarter: '2028-Q1',
        durationYears: 3,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'explore',
        roleId: 'ci',
        label: 'Explore #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q1',
        outcomeQuarter: '2027-Q3',
        startQuarter: '2027-Q4',
        durationYears: 3,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'breakthrough',
        roleId: 'ci',
        label: 'Breakthrough #1',
        isCustomLabel: false,
        submissionQuarter: '2030-Q3',
        outcomeQuarter: '2031-Q1',
        startQuarter: '2031-Q2',
        durationYears: 4,
        outcome: 'funded',
      },
    ],
  },
  {
    id: 'mcr',
    name: 'Mid-Career Researcher (MCR)',
    badge: 'MCR Portfolio',
    description: 'Active Legacy DP (0 pts) + Explore Lead CI (5) + Breakthrough Lead CI (5) + CIEF CI (2) = 12/13 pts.',
    eligibility: {
      phdConferralDate: '2019-11-01',
      careerInterruptionMonths: 0,
      isIndigenousResearcher: false,
    },
    grants: [
      {
        isLegacy: true,
        schemeId: 'legacy-dp',
        roleId: 'legacy-ci',
        label: 'Legacy DP #1',
        isCustomLabel: false,
        submissionQuarter: '2026-Q1',
        outcomeQuarter: '2026-Q4',
        startQuarter: '2027-Q1',
        durationYears: 3,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'explore',
        roleId: 'lead-ci',
        label: 'Explore #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q1',
        outcomeQuarter: '2027-Q3',
        startQuarter: '2027-Q4',
        durationYears: 3,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'breakthrough',
        roleId: 'lead-ci',
        label: 'Breakthrough #1',
        isCustomLabel: false,
        submissionQuarter: '2028-Q3',
        outcomeQuarter: '2029-Q1',
        startQuarter: '2029-Q2',
        durationYears: 5,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'cief',
        roleId: 'ci',
        label: 'CIEF #1',
        isCustomLabel: false,
        submissionQuarter: '2028-Q2',
        outcomeQuarter: '2028-Q4',
        startQuarter: '2029-Q1',
        durationYears: 3,
        outcome: 'funded',
      },
    ],
  },
  {
    id: 'senior',
    name: 'Senior Lead',
    badge: 'Centre / Major Lead',
    description: 'Legacy DP (0 pts) + Lead & Mentor Director (7) + Collaborate Node Lead (5) + Prioritise CI (3, stress-test Plan A vs Plan B).',
    eligibility: {
      phdConferralDate: '2012-03-01',
      careerInterruptionMonths: 0,
      isIndigenousResearcher: false,
    },
    grants: [
      {
        isLegacy: true,
        schemeId: 'legacy-dp',
        roleId: 'legacy-ci',
        label: 'Legacy DP #1',
        isCustomLabel: false,
        submissionQuarter: '2026-Q1',
        outcomeQuarter: '2026-Q4',
        startQuarter: '2027-Q1',
        durationYears: 2,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'lead-mentor',
        roleId: 'lead-ci-director',
        label: 'Lead & Mentor #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q3',
        outcomeQuarter: '2028-Q1',
        startQuarter: '2028-Q2',
        durationYears: 5,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'collaborate',
        roleId: 'node-lead-ci',
        label: 'Collaborate #1',
        isCustomLabel: false,
        submissionQuarter: '2028-Q1',
        outcomeQuarter: '2028-Q3',
        startQuarter: '2028-Q4',
        durationYears: 5,
        outcome: 'funded',
      },
      {
        isLegacy: false,
        schemeId: 'prioritise',
        roleId: 'ci',
        label: 'Prioritise #1',
        isCustomLabel: false,
        submissionQuarter: '2028-Q4',
        outcomeQuarter: '2029-Q4',
        startQuarter: '2030-Q1',
        durationYears: 7,
        outcome: 'unsuccessful',
      },
    ],
  },
];

export function createId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function buildScenarioFromTemplate(template: StarterTemplateDefinition): Scenario {
  return {
    id: createId('scen'),
    name: template.name,
    createdAt: new Date().toISOString(),
    grants: template.grants.map((g) => ({
      ...g,
      id: createId('grant'),
    })),
  };
}

export function createInitialWorkspaceState(rules: RulesData): PersistedWorkspaceState {
  const mcrTemplate = STARTER_TEMPLATES[1];
  const initialScenario: Scenario = {
    id: 'scen-baseline',
    name: 'Sample: MCR Plan',
    createdAt: new Date().toISOString(),
    grants: mcrTemplate.grants.map((g, idx) => ({
      ...g,
      id: `grant-init-${idx + 1}`,
    })),
  };

  const primaryProfile: ResearcherProfile = {
    id: 'profile-primary',
    name: 'You (Primary)',
    isPrimary: true,
    eligibility: {
      phdConferralDate: '',
      careerInterruptionMonths: 0,
      isIndigenousResearcher: false,
    },
    scenarios: [initialScenario],
    activeScenarioId: initialScenario.id,
  };

  return {
    schemaVersion: 1,
    rulesVersion: rules.version,
    profiles: [primaryProfile],
    activeProfileId: primaryProfile.id,
    customOverrides: createEmptyOverrides(),
    selectedQuarter: '2027-Q1',
  };
}

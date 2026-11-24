import { describe, expect, it } from 'vitest';
import rulesJson from '../../../public/rules.json';
import type { EligibilityProfile, GrantEntry, ResearcherProfile, RulesData } from '../../types/arc';
import {
  checkCollaboratorFit,
  computeEligibilityIssues,
  computeFundingRollup,
  computeQuarterlyLoads,
  findFittingRoles,
  getGrantPhaseAtQuarter,
} from '../planner';
import { applyCustomOverrides, createEmptyOverrides, generateGenericLabel, stripCustomLabels } from '../rules';
import { generateScenarioIcs } from '../../utils/exportTools';

const rules = rulesJson as RulesData;

const defaultEligibility: EligibilityProfile = {
  phdConferralDate: '',
  careerInterruptionMonths: 0,
  isIndigenousResearcher: false,
};

describe('ARC NCGP 13-Point Engine', () => {
  it('locks points while pending, holds through funded duration, and releases on outcome if unsuccessful', () => {
    const fundedExplore: GrantEntry = {
      id: 'g1',
      isLegacy: false,
      schemeId: 'explore',
      roleId: 'lead-ci', // 5 pts
      label: 'Explore #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q1',
      outcomeQuarter: '2027-Q3',
      startQuarter: '2027-Q4',
      durationYears: 3, // 12 quarters: 2027-Q4 .. 2030-Q3
      outcome: 'funded',
    };

    expect(getGrantPhaseAtQuarter(fundedExplore, '2027-Q1')).toBe('pending');
    expect(getGrantPhaseAtQuarter(fundedExplore, '2027-Q2')).toBe('pending');
    expect(getGrantPhaseAtQuarter(fundedExplore, '2027-Q3')).toBe('awarded');
    expect(getGrantPhaseAtQuarter(fundedExplore, '2027-Q4')).toBe('active');
    expect(getGrantPhaseAtQuarter(fundedExplore, '2030-Q3')).toBe('active');
    expect(getGrantPhaseAtQuarter(fundedExplore, '2030-Q4')).toBe('none');

    const loadsFunded = computeQuarterlyLoads([fundedExplore], rules);
    expect(loadsFunded.find((l) => l.quarter === '2027-Q1')?.pendingPoints).toBe(5);
    expect(loadsFunded.find((l) => l.quarter === '2028-Q1')?.activePoints).toBe(5);
    expect(loadsFunded.find((l) => l.quarter === '2030-Q4')?.totalPoints).toBe(0);

    const unsuccessfulExplore: GrantEntry = { ...fundedExplore, outcome: 'unsuccessful' };
    expect(getGrantPhaseAtQuarter(unsuccessfulExplore, '2027-Q2')).toBe('pending');
    expect(getGrantPhaseAtQuarter(unsuccessfulExplore, '2027-Q3')).toBe('released');
    expect(getGrantPhaseAtQuarter(unsuccessfulExplore, '2027-Q4')).toBe('none');

    const loadsUnfunded = computeQuarterlyLoads([unsuccessfulExplore], rules);
    expect(loadsUnfunded.find((l) => l.quarter === '2027-Q2')?.totalPoints).toBe(5);
    expect(loadsUnfunded.find((l) => l.quarter === '2027-Q3')?.totalPoints).toBe(0);
  });

  it('tracks legacy grants at 0 points and flags over-cap quarters above 13 pts', () => {
    const grants: GrantEntry[] = [
      {
        id: 'legacy1',
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
        id: 'g-lm',
        isLegacy: false,
        schemeId: 'lead-mentor',
        roleId: 'lead-ci-director', // 7 pts
        label: 'Lead & Mentor #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q3',
        outcomeQuarter: '2028-Q1',
        startQuarter: '2028-Q2',
        durationYears: 5,
        outcome: 'funded',
      },
      {
        id: 'g-collab',
        isLegacy: false,
        schemeId: 'collaborate',
        roleId: 'lead-ci-director', // 7 pts
        label: 'Collaborate #1',
        isCustomLabel: false,
        submissionQuarter: '2028-Q1',
        outcomeQuarter: '2028-Q3',
        startQuarter: '2028-Q4',
        durationYears: 5,
        outcome: 'funded',
      },
    ];

    const loads = computeQuarterlyLoads(grants, rules);
    const q2027q1 = loads.find((l) => l.quarter === '2027-Q1')!;
    expect(q2027q1.totalPoints).toBe(0);
    expect(q2027q1.contributions).toHaveLength(1);

    const q2028q1 = loads.find((l) => l.quarter === '2028-Q1')!;
    expect(q2028q1.totalPoints).toBe(14);
    expect(q2028q1.isOverCap).toBe(true);
    expect(q2028q1.overCapBy).toBe(1);
  });

  it('validates 5-year ECR cutoff with career interruption, Indigenous eligibility, and SCI vs teaching relief overlap', () => {
    const eligibility: EligibilityProfile = {
      phdConferralDate: '2021-01-01',
      careerInterruptionMonths: 12, // cutoff = 2027-01-01
      isIndigenousResearcher: false,
    };

    const grants: GrantEntry[] = [
      {
        id: 'init1',
        isLegacy: false,
        schemeId: 'initiate',
        roleId: 'lead-ci',
        label: 'Initiate #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q2', // after 2027-01-01!
        outcomeQuarter: '2027-Q4',
        startQuarter: '2028-Q1',
        durationYears: 3,
        outcome: 'funded',
      },
      {
        id: 'indig1',
        isLegacy: false,
        schemeId: 'indigenous-excellence',
        roleId: 'sci-mcr',
        label: 'Indigenous Exc. #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q4',
        outcomeQuarter: '2028-Q2',
        startQuarter: '2028-Q3',
        durationYears: 5,
        outcome: 'funded',
      },
      {
        id: 'exp1',
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
    ];

    const loads = computeQuarterlyLoads(grants, rules);
    const issues = computeEligibilityIssues(grants, rules, eligibility, loads);
    expect(issues.some((i) => i.code === 'ecr-expired')).toBe(true);
    expect(issues.some((i) => i.code === 'indigenous-required')).toBe(true);
    expect(issues.some((i) => i.code === 'sci-teaching-relief-conflict')).toBe(true);

    const rollup = computeFundingRollup(grants, rules, loads);
    expect(rollup.hasTeachingReliefBlockedBySci).toBe(true);
  });

  it('filters fitting roles accurately and checks collaborator headroom', () => {
    const grants: GrantEntry[] = [
      {
        id: 'g1',
        isLegacy: false,
        schemeId: 'explore',
        roleId: 'lead-ci', // 5
        label: 'Explore #1',
        isCustomLabel: false,
        submissionQuarter: '2027-Q1',
        outcomeQuarter: '2027-Q3',
        startQuarter: '2027-Q4',
        durationYears: 3,
        outcome: 'funded',
      },
      {
        id: 'g2',
        isLegacy: false,
        schemeId: 'breakthrough',
        roleId: 'lead-ci', // 5
        label: 'Breakthrough #1',
        isCustomLabel: false,
        submissionQuarter: '2028-Q3',
        outcomeQuarter: '2029-Q1',
        startQuarter: '2029-Q2',
        durationYears: 5,
        outcome: 'funded',
      },
    ];

    const fit = findFittingRoles(grants, rules, defaultEligibility, '2028-Q3');
    expect(fit.remainingPoints).toBe(3);
    expect(fit.options.every((o) => o.points <= 3)).toBe(true);
    expect(fit.options.some((o) => o.scheme.id === 'cief' && o.role.id === 'ci')).toBe(true);

    const collab: ResearcherProfile = {
      id: 'co1',
      name: 'Co-CI 1',
      isPrimary: false,
      eligibility: defaultEligibility,
      scenarios: [{ id: 's1', name: 'Current', createdAt: '', grants }],
      activeScenarioId: 's1',
    };

    const canJoinCief = checkCollaboratorFit(collab, rules, 'cief', 'ci', '2028-Q2', 3);
    expect(canJoinCief.canJoin).toBe(true);

    const cannotJoinLead = checkCollaboratorFit(collab, rules, 'collaborate', 'node-lead-ci', '2028-Q1', 5);
    expect(cannotJoinLead.canJoin).toBe(false);
    expect(cannotJoinLead.blockingQuarters.length).toBeGreaterThan(0);
  });

  it('applies custom rule overrides, strips custom titles for sharing, and generates valid ICS', () => {
    const overrides = createEmptyOverrides();
    overrides.hardCap = 15;
    overrides.schemeRolePoints = { explore: { 'lead-ci': 6 } };
    const overridden = applyCustomOverrides(rules, overrides);
    expect(overridden.hardCap).toBe(15);
    expect(
      overridden.schemes.find((s) => s.id === 'explore')?.roles.find((r) => r.id === 'lead-ci')
        ?.points,
    ).toBe(6);

    const customGrants: GrantEntry[] = [
      {
        id: 'g1',
        isLegacy: false,
        schemeId: 'explore',
        roleId: 'lead-ci',
        label: 'Secret Unpublished Quantum Title',
        isCustomLabel: true,
        submissionQuarter: '2027-Q1',
        outcomeQuarter: '2027-Q3',
        startQuarter: '2027-Q4',
        durationYears: 3,
        outcome: 'funded',
      },
    ];
    expect(generateGenericLabel(rules, 'explore', false, [])).toBe('Explore #1');
    const stripped = stripCustomLabels(customGrants, rules);
    expect(stripped[0].label).toBe('Explore #1');
    expect(stripped[0].isCustomLabel).toBe(false);

    const ics = generateScenarioIcs(
      { id: 's1', name: 'Plan A', createdAt: '', grants: customGrants },
      rules,
    );
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('locks already-awarded NCGP grants directly over active dates without pending lock', () => {
    const awardedExplore: GrantEntry = {
      id: 'g-awarded',
      isLegacy: false,
      isAwarded: true,
      schemeId: 'explore',
      roleId: 'lead-ci',
      label: 'Explore #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q1',
      outcomeQuarter: '2027-Q3',
      startQuarter: '2028-Q1',
      durationYears: 3, // 2028-Q1 .. 2030-Q4
      outcome: 'funded',
    };

    expect(getGrantPhaseAtQuarter(awardedExplore, '2027-Q2')).toBe('none');
    expect(getGrantPhaseAtQuarter(awardedExplore, '2028-Q1')).toBe('active');
    expect(getGrantPhaseAtQuarter(awardedExplore, '2030-Q4')).toBe('active');
    expect(getGrantPhaseAtQuarter(awardedExplore, '2031-Q1')).toBe('none');

    const loads = computeQuarterlyLoads([awardedExplore], rules);
    expect(loads.find((l) => l.quarter === '2027-Q2')?.totalPoints).toBe(0);
    expect(loads.find((l) => l.quarter === '2028-Q1')?.activePoints).toBe(5);
    expect(loads.find((l) => l.quarter === '2028-Q1')?.pendingPoints).toBe(0);

    const ics = generateScenarioIcs(
      { id: 's1', name: 'Awarded Test', createdAt: '', grants: [awardedExplore] },
      rules,
    );
    expect(ics).toContain('[ARC Project End]');
    expect(ics).not.toContain('[ARC Round Open]');
  });
});

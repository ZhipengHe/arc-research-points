import { describe, expect, it } from 'vitest';
import rulesJson from '../../../public/rules.json';
import type {
  EligibilityProfile,
  GrantEntry,
  PersistedWorkspaceState,
  ResearcherProfile,
  RulesData,
} from '../../types/arc';
import {
  checkCollaboratorFit,
  computeEligibilityIssues,
  computeFundingRollup,
  computeQuarterlyLoads,
  findFittingRoles,
  getGrantPhaseAtQuarter,
} from '../planner';
import { applyCustomOverrides, createEmptyOverrides, generateGenericLabel, getNearestRoundQuarter, stripCustomLabels } from '../rules';
import { addMonthsUtc } from '../quarters';
import { generateScenarioIcs } from '../../utils/exportTools';
import { decodeShareHash } from '../../utils/shareLink';
import { exportWorkspaceJson, parseImportedWorkspaceJson, sanitizeGrantEntry } from '../../utils/storage';

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

  it('validates public/rules.json integrity, quarter keys, positive role weights, and official URLs', () => {
    const quarterPattern = /^\d{4}-Q[1-4]$/;
    expect(rules.hardCap).toBeGreaterThan(0);
    expect(rules.schemes.length).toBeGreaterThanOrEqual(8);
    expect(rules.changelog[0]?.version).toBe(rules.version);

    for (const scheme of rules.schemes) {
      expect(scheme.firstRoundQuarter).toMatch(quarterPattern);
      expect(scheme.officialUrl).toMatch(/^https:\/\//);
      expect(scheme.roles.length).toBeGreaterThan(0);
      for (const role of scheme.roles) {
        expect(role.points).toBeGreaterThan(0);
        expect(Number.isInteger(role.points)).toBe(true);
      }
    }

    for (const doc of rules.officialDocs) {
      expect(doc.url).toMatch(/^https:\/\//);
      if (doc.pdfUrl) {
        expect(doc.pdfUrl).toMatch(/^https:\/\//);
      }
    }
  });

  it('round-trips JSON workspace backup export/import and detects older rulesVersion safely', () => {
    const sampleGrant: GrantEntry = {
      id: 'g-backup',
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
    };

    const workspace: PersistedWorkspaceState = {
      schemaVersion: 1,
      rulesVersion: '2026.07.0',
      activeProfileId: 'primary',
      selectedQuarter: '2028-Q3',
      customOverrides: createEmptyOverrides(),
      profiles: [
        {
          id: 'primary',
          name: 'You (Primary)',
          isPrimary: true,
          eligibility: {
            phdConferralDate: '2023-05-01',
            careerInterruptionMonths: 6,
            isIndigenousResearcher: true,
          },
          scenarios: [
            {
              id: 'scen-1',
              name: 'Plan A',
              createdAt: '2026-11-24T00:00:00.000Z',
              grants: [sampleGrant],
            },
          ],
          activeScenarioId: 'scen-1',
        },
        {
          id: 'co-1',
          name: 'Prof. Patel',
          isPrimary: false,
          eligibility: defaultEligibility,
          scenarios: [
            {
              id: 'scen-co-1',
              name: 'Current Commitments',
              createdAt: '2026-11-24T00:00:00.000Z',
              grants: [],
            },
          ],
          activeScenarioId: 'scen-co-1',
        },
      ],
    };

    const json = exportWorkspaceJson(workspace);
    const { state: restored, outdatedFromVersion } = parseImportedWorkspaceJson(json, rules);

    expect(outdatedFromVersion).toBe('2026.07.0');
    expect(restored.profiles).toHaveLength(2);
    expect(restored.profiles[0].eligibility.isIndigenousResearcher).toBe(true);
    expect(restored.profiles[0].scenarios[0].grants).toHaveLength(1);
    expect(restored.profiles[0].scenarios[0].grants[0].id).toBe('g-backup');
    expect(restored.profiles[1].name).toBe('Prof. Patel');
  });

  it('enforces the 15-year post-PhD boundary for Indigenous Excellence SCI (MCR)', () => {
    const indMcrGrant: GrantEntry = {
      id: 'ind-mcr-1',
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
    };

    const within15Yrs: EligibilityProfile = {
      phdConferralDate: '2015-06-01', // 15yr cutoff = 2030-06-01 > 2027-Q4
      careerInterruptionMonths: 0,
      isIndigenousResearcher: true,
    };
    const over15Yrs: EligibilityProfile = {
      phdConferralDate: '2010-06-01', // 15yr cutoff = 2025-06-01 < 2027-Q4
      careerInterruptionMonths: 0,
      isIndigenousResearcher: true,
    };

    const issuesWithin = computeEligibilityIssues([indMcrGrant], rules, within15Yrs);
    expect(issuesWithin.filter((i) => i.severity === 'error')).toHaveLength(0);

    const issuesOver = computeEligibilityIssues([indMcrGrant], rules, over15Yrs);
    expect(issuesOver.some((i) => i.code === 'mcr-15yr-exceeded')).toBe(true);
  });

  it('flags teaching-relief overlap for Initiate Fellowships and Legacy DECRA/FT, and preserves post-2032 eligibility', () => {
    const initiateGrant: GrantEntry = {
      id: 'init-1',
      isLegacy: false,
      schemeId: 'initiate',
      roleId: 'lead-ci',
      label: 'Initiate #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q2',
      outcomeQuarter: '2027-Q4',
      startQuarter: '2028-Q1',
      durationYears: 3, // 2028-Q1 .. 2030-Q4
      outcome: 'funded',
    };
    const exploreCi: GrantEntry = {
      id: 'exp-ci-1',
      isLegacy: false,
      schemeId: 'explore',
      roleId: 'ci',
      label: 'Explore #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q1',
      outcomeQuarter: '2027-Q3',
      startQuarter: '2027-Q4',
      durationYears: 3, // 2027-Q4 .. 2030-Q3
      outcome: 'funded',
    };

    const initLoads = computeQuarterlyLoads([initiateGrant, exploreCi], rules);
    expect(initLoads.find((l) => l.quarter === '2027-Q4')?.hasSciConflict).toBe(false);
    expect(initLoads.find((l) => l.quarter === '2028-Q1')?.hasSciConflict).toBe(true);
    const initIssues = computeEligibilityIssues([initiateGrant, exploreCi], rules, defaultEligibility, initLoads);
    expect(initIssues.some((i) => i.code === 'sci-teaching-relief-conflict')).toBe(true);
    const initRollup = computeFundingRollup([initiateGrant, exploreCi], rules, initLoads);
    expect(initRollup.hasTeachingReliefBlockedBySci).toBe(true);
    expect(initRollup.annualTeachingReliefMax).toBe(50000); // 2027-Q4 is non-overlapping

    // Legacy DECRA (0 pts, ARC salaried) overlapping Explore CI
    const legacyDecra: GrantEntry = {
      id: 'leg-decra-1',
      isLegacy: true,
      schemeId: 'legacy-decra',
      roleId: 'legacy-ci',
      label: 'Legacy DECRA #1',
      isCustomLabel: false,
      submissionQuarter: '2026-Q1',
      outcomeQuarter: '2026-Q4',
      startQuarter: '2027-Q1',
      durationYears: 3, // 2027-Q1 .. 2029-Q4
      outcome: 'funded',
    };
    const legacyLoads = computeQuarterlyLoads([legacyDecra, exploreCi], rules);
    expect(legacyLoads.find((l) => l.quarter === '2028-Q1')?.totalPoints).toBe(3);
    expect(legacyLoads.find((l) => l.quarter === '2028-Q1')?.hasSciConflict).toBe(true);
    const legacyIssues = computeEligibilityIssues([legacyDecra, exploreCi], rules, defaultEligibility, legacyLoads);
    expect(legacyIssues.some((i) => i.code === 'sci-teaching-relief-conflict')).toBe(true);

    // Late-2032 submission whose active quarters start in 2033 should not vacuously zero teaching relief
    const lateExplore: GrantEntry = {
      id: 'exp-late-1',
      isLegacy: false,
      schemeId: 'explore',
      roleId: 'lead-ci',
      label: 'Explore #2',
      isCustomLabel: false,
      submissionQuarter: '2032-Q2',
      outcomeQuarter: '2032-Q4',
      startQuarter: '2033-Q1',
      durationYears: 3,
      outcome: 'funded',
    };
    const lateRollup = computeFundingRollup([lateExplore], rules);
    expect(lateRollup.annualTeachingReliefMax).toBe(50000);
  });

  it('handles senior Indigenous Lead CI, concurrent ARC salaries, post-2032 What Fits breaches, and month-end cutoffs', () => {
    // 1. Senior Indigenous researcher (>15 yrs post-PhD) is eligible for Indigenous Excellence Lead CI
    const seniorInd: EligibilityProfile = {
      phdConferralDate: '2008-06-01', // 15yr cutoff = 2023-06-01
      careerInterruptionMonths: 0,
      isIndigenousResearcher: true,
    };
    const indLeadGrant: GrantEntry = {
      id: 'ind-lead-1',
      isLegacy: false,
      schemeId: 'indigenous-excellence',
      roleId: 'lead-ci',
      label: 'Indigenous Exc. #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q4',
      outcomeQuarter: '2028-Q2',
      startQuarter: '2028-Q3',
      durationYears: 5,
      outcome: 'funded',
    };
    expect(computeEligibilityIssues([indLeadGrant], rules, seniorInd)).toHaveLength(0);
    const fitInd = findFittingRoles([], rules, seniorInd, '2027-Q4');
    const indLeadOpt = fitInd.options.find(
      (o) => o.scheme.id === 'indigenous-excellence' && o.role.id === 'lead-ci',
    );
    const indMcrOpt = fitInd.options.find(
      (o) => o.scheme.id === 'indigenous-excellence' && o.role.id === 'sci-mcr',
    );
    expect(indLeadOpt?.isEligible).toBe(true);
    expect(indMcrOpt?.isEligible).toBe(false);

    // 2. Legacy DECRA (0 pts, salaried) + Initiate Fellowship (8 pts, salaried) triggers concurrent-arc-salary
    const legacyDecra: GrantEntry = {
      id: 'leg-decra-2',
      isLegacy: true,
      schemeId: 'legacy-decra',
      roleId: 'legacy-ci',
      label: 'Legacy DECRA #1',
      isCustomLabel: false,
      submissionQuarter: '2026-Q1',
      outcomeQuarter: '2026-Q4',
      startQuarter: '2027-Q1',
      durationYears: 3, // 2027-Q1 .. 2029-Q4
      outcome: 'funded',
    };
    const initGrant: GrantEntry = {
      id: 'init-2',
      isLegacy: false,
      schemeId: 'initiate',
      roleId: 'lead-ci',
      label: 'Initiate #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q2',
      outcomeQuarter: '2027-Q4',
      startQuarter: '2028-Q1',
      durationYears: 3, // 2028-Q1 .. 2030-Q4
      outcome: 'funded',
    };
    const concLoads = computeQuarterlyLoads([legacyDecra, initGrant], rules);
    expect(concLoads.find((l) => l.quarter === '2028-Q1')?.totalPoints).toBe(8);
    expect(concLoads.find((l) => l.quarter === '2028-Q1')?.hasConcurrentSalaryConflict).toBe(true);
    const concIssues = computeEligibilityIssues([legacyDecra, initGrant], rules, defaultEligibility, concLoads);
    expect(concIssues.some((i) => i.code === 'concurrent-arc-salary')).toBe(true);

    // 3. findFittingRoles detects a post-2032 cap breach
    const lateBreakthrough: GrantEntry = {
      id: 'bt-late',
      isLegacy: false,
      schemeId: 'breakthrough',
      roleId: 'lead-ci', // 5 pts
      label: 'Breakthrough #1',
      isCustomLabel: false,
      submissionQuarter: '2032-Q3',
      outcomeQuarter: '2033-Q1',
      startQuarter: '2033-Q2',
      durationYears: 5, // 2033-Q2 .. 2038-Q1
      outcome: 'funded',
    };
    const latePrioritise: GrantEntry = {
      id: 'pr-late',
      isLegacy: false,
      schemeId: 'prioritise',
      roleId: 'lead-ci-director', // 7 pts
      label: 'Prioritise #1',
      isCustomLabel: false,
      submissionQuarter: '2032-Q4',
      outcomeQuarter: '2033-Q4',
      startQuarter: '2034-Q1',
      durationYears: 5,
      outcome: 'funded',
    };
    // At 2032-Q1 load is 0 pts, but adding Explore Lead CI (5 pts, active 2032-Q4..2035-Q3) hits 5+5+7=17 in 2033-Q1+
    const lateFit = findFittingRoles([lateBreakthrough, latePrioritise], rules, defaultEligibility, '2032-Q1');
    const expLeadOpt = lateFit.options.find((o) => o.scheme.id === 'explore' && o.role.id === 'lead-ci');
    expect(expLeadOpt?.exceedsCapLater).toBe(true);
    expect(expLeadOpt?.peakLoadIfAdded).toBe(17);

    // 4. addMonthsUtc clamps month-end dates without overflowing into March
    const clamped = addMonthsUtc(new Date(Date.UTC(2025, 0, 31)), 61);
    expect(clamped.toISOString().slice(0, 10)).toBe('2030-02-28');
  });

  it('never offers elapsed rounds, ignores earlier unrelated cap breaches in What Fits, and validates grant fields strictly', async () => {
    // 1. Next round on 2032-Q4 for annual Q1 Explore advances to 2033-Q1 (never elapsed 2032-Q1)
    const exploreScheme = rules.schemes.find((s) => s.id === 'explore')!;
    expect(getNearestRoundQuarter(exploreScheme, '2032-Q4')).toBe('2033-Q1');

    // 2. Earlier 2027 cap breach does not mark a clean 2031-Q1 bid as exceedsCapLater
    const earlyBreachA: GrantEntry = {
      id: 'early-a',
      isLegacy: false,
      schemeId: 'lead-mentor',
      roleId: 'lead-ci-director', // 7 pts
      label: 'Lead & Mentor #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q1',
      outcomeQuarter: '2027-Q3',
      startQuarter: '2027-Q4',
      durationYears: 1, // ends 2028-Q3
      outcome: 'funded',
    };
    const earlyBreachB: GrantEntry = {
      id: 'early-b',
      isLegacy: false,
      schemeId: 'collaborate',
      roleId: 'lead-ci-director', // 7 pts
      label: 'Collaborate #1',
      isCustomLabel: false,
      submissionQuarter: '2027-Q1',
      outcomeQuarter: '2027-Q3',
      startQuarter: '2027-Q4',
      durationYears: 1, // ends 2028-Q3
      outcome: 'funded',
    };
    const futureFit = findFittingRoles([earlyBreachA, earlyBreachB], rules, defaultEligibility, '2031-Q1');
    const exp2031 = futureFit.options.find((o) => o.scheme.id === 'explore' && o.role.id === 'lead-ci');
    expect(exp2031?.exceedsCapLater).toBe(false);
    expect(exp2031?.peakExceedQuarter).toBeNull();

    // 3. Malformed grant (label: 42) is rejected by sanitizeGrantEntry and decodeShareHash
    const badGrant = {
      id: 'bad-1',
      isLegacy: false,
      schemeId: 'explore',
      roleId: 'lead-ci',
      label: 42,
      isCustomLabel: false,
      submissionQuarter: '2027-Q1',
      outcomeQuarter: '2027-Q3',
      startQuarter: '2027-Q4',
      durationYears: 3,
      outcome: 'funded',
    };
    expect(sanitizeGrantEntry(badGrant)).toBeNull();

    const encodedBad = btoa(
      JSON.stringify({
        v: 1,
        rulesVersion: rules.version,
        scenarioName: 'Bad',
        grants: [badGrant],
        strippedTitles: false,
      }),
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await decodeShareHash(`#plan=${encodedBad}`)).toBeNull();
  });
});

import type {
  EligibilityIssue,
  EligibilityProfile,
  FittingRoleOption,
  FundingRollup,
  GrantEntry,
  QuarterGrantContribution,
  QuarterKey,
  QuarterLoadSummary,
  QuarterPhase,
  ResearcherProfile,
  RulesData,
} from '../types/arc';
import {
  addQuarters,
  computeEcrCutoffDate,
  computePostPhdCutoffDate,
  formatDateShort,
  formatQuarterShort,
  generateTimelineQuarters,
  quarterToEndDate,
  quarterToIndex,
  quarterToStartDate,
} from './quarters';
import {
  computeDefaultDatesForScheme,
  getNearestRoundQuarter,
  getRoleById,
  getSchemeById,
} from './rules';

export function getGrantEndQuarter(grant: GrantEntry): QuarterKey {
  const durationQuarters = Math.max(1, Math.round(grant.durationYears * 4));
  return addQuarters(grant.startQuarter, durationQuarters - 1);
}

export function getGrantPoints(grant: GrantEntry, rules: RulesData): number {
  if (grant.isLegacy) return 0;
  const role = getRoleById(rules, grant.schemeId, grant.roleId);
  return role?.points ?? 0;
}

/**
 * Determines the lifecycle phase of a grant in a given quarter:
 * - Legacy grants: 'legacy' during [startQuarter, endQuarter] (0 pts).
 * - NCGP grants:
 *   - [submissionQuarter, outcomeQuarter - 1]: 'pending' (points locked).
 *   - If outcome === 'unsuccessful':
 *     - outcomeQuarter: 'released' (0 pts, visual marker that points returned).
 *     - after outcomeQuarter: 'none' (0 pts).
 *   - If outcome === 'funded':
 *     - [outcomeQuarter, startQuarter - 1]: 'awarded' (points remain locked between outcome and project start).
 *     - [startQuarter, endQuarter]: 'active' (points locked for full duration).
 *     - after endQuarter: 'none' (points released).
 */
export function getGrantPhaseAtQuarter(grant: GrantEntry, quarter: QuarterKey): QuarterPhase {
  const qIdx = quarterToIndex(quarter);
  const startIdx = quarterToIndex(grant.startQuarter);
  const endIdx = quarterToIndex(getGrantEndQuarter(grant));

  if (grant.isLegacy) {
    if (qIdx >= startIdx && qIdx <= endIdx) return 'legacy';
    return 'none';
  }

  // Already awarded / active NCGP grant: skip pending lock, lock directly over active project dates
  if (grant.isAwarded) {
    if (qIdx >= startIdx && qIdx <= endIdx) return 'active';
    return 'none';
  }

  const subIdx = quarterToIndex(grant.submissionQuarter);
  const outIdx = Math.max(subIdx + 1, quarterToIndex(grant.outcomeQuarter));

  if (qIdx < subIdx) return 'none';
  if (qIdx < outIdx) return 'pending';

  if (grant.outcome === 'unsuccessful') {
    return qIdx === outIdx ? 'released' : 'none';
  }

  // Funded
  if (qIdx < startIdx) return 'awarded';
  if (qIdx <= endIdx) return 'active';
  return 'none';
}

export function isPhaseLocked(phase: QuarterPhase): boolean {
  return phase === 'pending' || phase === 'awarded' || phase === 'active';
}

export function computeQuarterlyLoads(
  grants: GrantEntry[],
  rules: RulesData,
  quarters?: QuarterKey[],
): QuarterLoadSummary[] {
  const targetQuarters =
    quarters ??
    generateTimelineQuarters(rules.timelineWindow.startYear, rules.timelineWindow.endYear);

  return targetQuarters.map((quarter) => {
    let activePoints = 0;
    let pendingPoints = 0;
    let hasActiveSci = false;
    let hasActiveTeachingRelief = false;
    const contributions: QuarterGrantContribution[] = [];

    for (const grant of grants) {
      const phase = getGrantPhaseAtQuarter(grant, quarter);
      if (phase === 'none') continue;

      if (grant.isLegacy) {
        contributions.push({
          grantId: grant.id,
          label: grant.label,
          schemeId: grant.schemeId,
          roleId: grant.roleId,
          points: 0,
          phase,
          isSci: false,
          teachingReliefEligible: false,
          compensationType: 'none',
        });
        continue;
      }

      const role = getRoleById(rules, grant.schemeId, grant.roleId);
      const pts = role?.points ?? 0;

      if (phase === 'pending') {
        pendingPoints += pts;
      } else if (phase === 'awarded' || phase === 'active') {
        activePoints += pts;
        if (phase === 'active') {
          if (role?.isSci) hasActiveSci = true;
          if (role?.teachingReliefEligible) hasActiveTeachingRelief = true;
        }
      }

      contributions.push({
        grantId: grant.id,
        label: grant.label,
        schemeId: grant.schemeId,
        roleId: grant.roleId,
        points: isPhaseLocked(phase) ? pts : 0,
        phase,
        isSci: role?.isSci ?? false,
        teachingReliefEligible: role?.teachingReliefEligible ?? false,
        compensationType: role?.compensationType ?? 'none',
      });
    }

    const totalPoints = activePoints + pendingPoints;
    const overCapBy = Math.max(0, totalPoints - rules.hardCap);

    return {
      quarter,
      totalPoints,
      activePoints,
      pendingPoints,
      remainingPoints: Math.max(0, rules.hardCap - totalPoints),
      overCapBy,
      isOverCap: totalPoints > rules.hardCap,
      hasSciConflict: hasActiveSci && hasActiveTeachingRelief,
      hasActiveSci,
      hasActiveTeachingRelief,
      contributions,
    };
  });
}

export function getPeakLoadSummary(loads: QuarterLoadSummary[]): {
  peakPoints: number;
  peakQuarter: QuarterKey | null;
  overCapQuarters: QuarterLoadSummary[];
} {
  let peakPoints = 0;
  let peakQuarter: QuarterKey | null = null;
  const overCapQuarters: QuarterLoadSummary[] = [];

  for (const load of loads) {
    if (load.totalPoints > peakPoints) {
      peakPoints = load.totalPoints;
      peakQuarter = load.quarter;
    }
    if (load.isOverCap) {
      overCapQuarters.push(load);
    }
  }

  return { peakPoints, peakQuarter, overCapQuarters };
}

export function computeEligibilityIssues(
  grants: GrantEntry[],
  rules: RulesData,
  eligibility: EligibilityProfile,
  loads?: QuarterLoadSummary[],
): EligibilityIssue[] {
  const issues: EligibilityIssue[] = [];
  const ecrCutoff = computeEcrCutoffDate(
    eligibility.phdConferralDate,
    eligibility.careerInterruptionMonths,
    rules.ecrYearsCutoff,
  );
  const indigenous15Cutoff = computePostPhdCutoffDate(
    eligibility.phdConferralDate,
    eligibility.careerInterruptionMonths,
    rules.indigenousMaxPostPhdYears,
  );

  for (const grant of grants) {
    if (grant.isLegacy || grant.isAwarded) continue;
    const scheme = getSchemeById(rules, grant.schemeId);
    const role = getRoleById(rules, grant.schemeId, grant.roleId);
    if (!scheme || !role) continue;

    const subDate = quarterToStartDate(grant.submissionQuarter);

    if (role.requiresEcr && ecrCutoff && subDate.getTime() > ecrCutoff.getTime()) {
      issues.push({
        grantId: grant.id,
        severity: 'error',
        code: 'ecr-expired',
        message: `${role.label} on ${scheme.shortName} requires ECR status (<= ${rules.ecrYearsCutoff} yrs post-PhD); submission ${formatQuarterShort(grant.submissionQuarter)} is after your ECR cutoff (${formatDateShort(ecrCutoff)}).`,
      });
    }

    if ((scheme.requiresIndigenous || role.requiresIndigenous) && !eligibility.isIndigenousResearcher) {
      issues.push({
        grantId: grant.id,
        severity: 'error',
        code: 'indigenous-required',
        message: `${scheme.name} (${role.label}) is restricted to Aboriginal and Torres Strait Islander researchers. Enable the Indigenous researcher toggle in Eligibility Profile if applicable.`,
      });
    }

    if (
      (scheme.requiresIndigenous || role.requiresMcrWithin15Yrs) &&
      indigenous15Cutoff &&
      subDate.getTime() > indigenous15Cutoff.getTime()
    ) {
      issues.push({
        grantId: grant.id,
        severity: 'warning',
        code: 'mcr-15yr-exceeded',
        message: `${scheme.name} targets researchers up to ${rules.indigenousMaxPostPhdYears} yrs post-PhD; submission ${formatQuarterShort(grant.submissionQuarter)} exceeds ${formatDateShort(indigenous15Cutoff)}.`,
      });
    }
  }

  // Check SCI salary + teaching relief overlap across funded active grants
  const quarterlyLoads = loads ?? computeQuarterlyLoads(grants, rules);
  const conflictedGrantIds = new Set<string>();
  for (const load of quarterlyLoads) {
    if (load.hasSciConflict) {
      for (const c of load.contributions) {
        if (c.phase === 'active' && (c.isSci || c.teachingReliefEligible)) {
          conflictedGrantIds.add(c.grantId);
        }
      }
    }
  }

  for (const grantId of conflictedGrantIds) {
    const grant = grants.find((g) => g.id === grantId);
    if (!grant) continue;
    const role = getRoleById(rules, grant.schemeId, grant.roleId);
    if (role?.teachingReliefEligible) {
      issues.push({
        grantId: grant.id,
        severity: 'warning',
        code: 'sci-teaching-relief-conflict',
        message: `${grant.label}: overlaps with an active SCI salaried role (teaching relief cannot be combined with an SCI salary during overlapping quarters).`,
      });
    }
  }

  return issues;
}

export function computeFundingRollup(
  grants: GrantEntry[],
  rules: RulesData,
  quarterlyLoads?: QuarterLoadSummary[],
): FundingRollup {
  let fundedCount = 0;
  let pendingCount = 0;
  let unsuccessfulCount = 0;
  let legacyCount = 0;
  let annualFundingMin = 0;
  let annualFundingMax = 0;
  let totalFundingMin = 0;
  let totalFundingMax = 0;
  let hasTeachingReliefRole = false;
  let hasSalariedRole = false;
  const extraNotesSet = new Set<string>();

  for (const grant of grants) {
    if (grant.isLegacy) {
      legacyCount += 1;
      continue;
    }

    if (!grant.isAwarded && grant.outcome === 'unsuccessful') {
      unsuccessfulCount += 1;
      continue;
    }

    fundedCount += 1;
    if (!grant.isAwarded) {
      pendingCount += 1; // Planned/submitted grants pass through a pending lock window
    }

    const scheme = getSchemeById(rules, grant.schemeId);
    const role = getRoleById(rules, grant.schemeId, grant.roleId);
    if (!scheme || !role) continue;

    annualFundingMin += scheme.fundingMinAnnual;
    annualFundingMax += scheme.fundingMaxAnnual;
    totalFundingMin += scheme.fundingMinAnnual * grant.durationYears;
    totalFundingMax += scheme.fundingMaxAnnual * grant.durationYears;

    if (scheme.fundingExtraNote) {
      extraNotesSet.add(`${scheme.shortName}: ${scheme.fundingExtraNote}`);
    }
    if (role.teachingReliefEligible) {
      hasTeachingReliefRole = true;
    }
    if (role.compensationType === 'salaried') {
      hasSalariedRole = true;
    }
  }

  const loads = quarterlyLoads ?? computeQuarterlyLoads(grants, rules);
  const hasTeachingReliefBlockedBySci = loads.some((l) => l.hasSciConflict);

  // An investigator can claim up to $50k/yr teaching relief on unsalaried CI/Lead CI roles,
  // unless blocked across the board by a concurrent SCI salary (we still report per-year eligibility
  // and flag the overlap warning clearly).
  const activeOnlySciAllQuarters =
    hasTeachingReliefRole &&
    loads.every((l) => !l.hasActiveTeachingRelief || l.hasActiveSci);

  const annualTeachingReliefMax =
    hasTeachingReliefRole && !activeOnlySciAllQuarters ? rules.teachingReliefMaxAnnual : 0;

  return {
    fundedCount,
    pendingCount,
    unsuccessfulCount,
    legacyCount,
    annualFundingMin,
    annualFundingMax,
    totalFundingMin,
    totalFundingMax,
    annualTeachingReliefMax,
    hasTeachingReliefBlockedBySci,
    extraNotes: Array.from(extraNotesSet),
    hasSalariedRole,
  };
}

/**
 * Finds all valid Scheme + Role combinations whose point cost fits the remaining point balance
 * at targetQuarter, plus simulates peak load across the 2027-2032 window if added.
 */
export function findFittingRoles(
  grants: GrantEntry[],
  rules: RulesData,
  eligibility: EligibilityProfile,
  targetQuarter: QuarterKey,
): {
  targetQuarter: QuarterKey;
  currentPoints: number;
  remainingPoints: number;
  options: FittingRoleOption[];
} {
  const timelineQuarters = generateTimelineQuarters(
    rules.timelineWindow.startYear,
    rules.timelineWindow.endYear,
  );
  const baseLoads = computeQuarterlyLoads(grants, rules, timelineQuarters);
  const currentLoad = baseLoads.find((l) => l.quarter === targetQuarter) ?? baseLoads[0];
  const currentPoints = currentLoad?.totalPoints ?? 0;
  const remainingPoints = Math.max(0, rules.hardCap - currentPoints);

  const ecrCutoff = computeEcrCutoffDate(
    eligibility.phdConferralDate,
    eligibility.careerInterruptionMonths,
    rules.ecrYearsCutoff,
  );
  const indigenous15Cutoff = computePostPhdCutoffDate(
    eligibility.phdConferralDate,
    eligibility.careerInterruptionMonths,
    rules.indigenousMaxPostPhdYears,
  );

  const options: FittingRoleOption[] = [];

  for (const scheme of rules.schemes) {
    const suggestedSubmissionQuarter = getNearestRoundQuarter(
      scheme,
      targetQuarter,
      rules.timelineWindow.startYear,
      rules.timelineWindow.endYear,
    );
    const { outcomeQuarter, startQuarter } = computeDefaultDatesForScheme(
      scheme,
      suggestedSubmissionQuarter,
    );
    const subDate = quarterToStartDate(suggestedSubmissionQuarter);

    for (const role of scheme.roles) {
      if (role.points > remainingPoints) continue;

      const eligibilityIssues: string[] = [];
      if (role.requiresEcr && ecrCutoff && subDate.getTime() > ecrCutoff.getTime()) {
        eligibilityIssues.push(`After 5-yr ECR cutoff (${formatDateShort(ecrCutoff)})`);
      }
      if ((scheme.requiresIndigenous || role.requiresIndigenous) && !eligibility.isIndigenousResearcher) {
        eligibilityIssues.push('Requires Indigenous researcher eligibility');
      }
      if (
        (scheme.requiresIndigenous || role.requiresMcrWithin15Yrs) &&
        indigenous15Cutoff &&
        subDate.getTime() > indigenous15Cutoff.getTime()
      ) {
        eligibilityIssues.push(`Past ${rules.indigenousMaxPostPhdYears}-yr post-PhD guideline`);
      }

      // Simulate adding this grant (as funded) starting at suggestedSubmissionQuarter
      const simulatedGrant: GrantEntry = {
        id: '__sim__',
        isLegacy: false,
        schemeId: scheme.id,
        roleId: role.id,
        label: '__sim__',
        isCustomLabel: false,
        submissionQuarter: suggestedSubmissionQuarter,
        outcomeQuarter,
        startQuarter,
        durationYears: scheme.maxDurationYears,
        outcome: 'funded',
      };
      const simLoads = computeQuarterlyLoads([...grants, simulatedGrant], rules, timelineQuarters);
      let peakLoadIfAdded = 0;
      let peakExceedQuarter: QuarterKey | null = null;
      for (const l of simLoads) {
        if (l.totalPoints > peakLoadIfAdded) {
          peakLoadIfAdded = l.totalPoints;
        }
        if (l.isOverCap && !peakExceedQuarter) {
          peakExceedQuarter = l.quarter;
        }
      }

      options.push({
        scheme,
        role,
        points: role.points,
        remainingAfterQuarter: remainingPoints - role.points,
        peakLoadIfAdded,
        exceedsCapLater: peakLoadIfAdded > rules.hardCap,
        peakExceedQuarter,
        eligibilityIssues,
        isEligible: eligibilityIssues.length === 0,
        suggestedSubmissionQuarter,
        suggestedOutcomeQuarter: outcomeQuarter,
        suggestedStartQuarter: startQuarter,
      });
    }
  }

  // Sort: eligible first, no later cap breach first, then higher points (most impactful fit), then scheme order
  options.sort((a, b) => {
    if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
    if (a.exceedsCapLater !== b.exceedsCapLater) return a.exceedsCapLater ? 1 : -1;
    if (a.points !== b.points) return b.points - a.points;
    return a.scheme.name.localeCompare(b.scheme.name);
  });

  return {
    targetQuarter,
    currentPoints,
    remainingPoints,
    options,
  };
}

export interface CollaboratorFitResult {
  profileId: string;
  profileName: string;
  canJoin: boolean;
  rolePoints: number;
  peakCombinedPoints: number;
  minFreePointsInWindow: number;
  bottleneckQuarter: QuarterKey | null;
  blockingQuarters: { quarter: QuarterKey; combinedPoints: number; overBy: number }[];
  eligibilityIssues: string[];
}

export function checkCollaboratorFit(
  profile: ResearcherProfile,
  rules: RulesData,
  schemeId: string,
  roleId: string,
  submissionQuarter: QuarterKey,
  durationYears?: number,
): CollaboratorFitResult {
  const scheme = getSchemeById(rules, schemeId);
  const role = getRoleById(rules, schemeId, roleId);
  const activeScenario =
    profile.scenarios.find((s) => s.id === profile.activeScenarioId) ?? profile.scenarios[0];
  const existingGrants = activeScenario?.grants ?? [];

  if (!scheme || !role) {
    return {
      profileId: profile.id,
      profileName: profile.name,
      canJoin: false,
      rolePoints: 0,
      peakCombinedPoints: 0,
      minFreePointsInWindow: 0,
      bottleneckQuarter: null,
      blockingQuarters: [],
      eligibilityIssues: ['Invalid scheme or role selected.'],
    };
  }

  const { outcomeQuarter, startQuarter } = computeDefaultDatesForScheme(scheme, submissionQuarter);
  const candidate: GrantEntry = {
    id: '__collab_check__',
    isLegacy: false,
    schemeId: scheme.id,
    roleId: role.id,
    label: 'Candidate Bid',
    isCustomLabel: false,
    submissionQuarter,
    outcomeQuarter,
    startQuarter,
    durationYears: durationYears ?? scheme.maxDurationYears,
    outcome: 'funded',
  };

  const endQuarter = getGrantEndQuarter(candidate);
  const subIdx = quarterToIndex(submissionQuarter);
  const endIdx = quarterToIndex(endQuarter);

  // Evaluate across the full grant window (even past 2032)
  const checkQuarters: QuarterKey[] = [];
  for (let i = subIdx; i <= endIdx; i++) {
    const yr = Math.floor(i / 4);
    const q = (((i % 4) + 4) % 4) + 1;
    checkQuarters.push(`${yr}-Q${q}` as QuarterKey);
  }

  const baseLoads = computeQuarterlyLoads(existingGrants, rules, checkQuarters);
  const combinedLoads = computeQuarterlyLoads([...existingGrants, candidate], rules, checkQuarters);

  let peakCombinedPoints = 0;
  let minFreePointsInWindow = rules.hardCap;
  let bottleneckQuarter: QuarterKey | null = null;
  const blockingQuarters: { quarter: QuarterKey; combinedPoints: number; overBy: number }[] = [];

  for (let i = 0; i < checkQuarters.length; i++) {
    const base = baseLoads[i];
    const combined = combinedLoads[i];
    if (base.remainingPoints < minFreePointsInWindow) {
      minFreePointsInWindow = base.remainingPoints;
    }
    if (combined.totalPoints > peakCombinedPoints) {
      peakCombinedPoints = combined.totalPoints;
      bottleneckQuarter = combined.quarter;
    }
    if (combined.isOverCap) {
      blockingQuarters.push({
        quarter: combined.quarter,
        combinedPoints: combined.totalPoints,
        overBy: combined.overCapBy,
      });
    }
  }

  const eligibilityIssues = computeEligibilityIssues(
    [candidate],
    rules,
    profile.eligibility,
    combinedLoads,
  )
    .filter((i) => i.severity === 'error')
    .map((i) => i.message);

  return {
    profileId: profile.id,
    profileName: profile.name,
    canJoin: blockingQuarters.length === 0 && eligibilityIssues.length === 0,
    rolePoints: role.points,
    peakCombinedPoints,
    minFreePointsInWindow,
    bottleneckQuarter,
    blockingQuarters,
    eligibilityIssues,
  };
}

export function formatCurrencyAud(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(2).replace(/0$/, '')}m`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}k`;
  }
  return `$${amount}`;
}

export function getGrantDateRangeSummary(grant: GrantEntry): {
  submission: Date;
  outcome: Date;
  start: Date;
  end: Date;
} {
  return {
    submission: quarterToStartDate(grant.submissionQuarter),
    outcome: quarterToStartDate(grant.outcomeQuarter),
    start: quarterToStartDate(grant.startQuarter),
    end: quarterToEndDate(getGrantEndQuarter(grant)),
  };
}

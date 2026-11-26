import type {
  CustomRulesOverride,
  GrantEntry,
  LegacySchemeRule,
  QuarterKey,
  RoleRule,
  RulesData,
  SchemeRule,
} from '../types/arc';
import { addQuarters, parseQuarter, quarterToIndex } from './quarters';

export function createEmptyOverrides(): CustomRulesOverride {
  return {
    schemeRolePoints: {},
    schemeFirstRoundQuarter: {},
    schemeOutcomeLagQuarters: {},
  };
}

export function hasActiveOverrides(overrides: CustomRulesOverride): boolean {
  if (overrides.hardCap !== undefined) return true;
  if (Object.keys(overrides.schemeFirstRoundQuarter).length > 0) return true;
  if (Object.keys(overrides.schemeOutcomeLagQuarters).length > 0) return true;
  for (const roles of Object.values(overrides.schemeRolePoints)) {
    if (Object.keys(roles).length > 0) return true;
  }
  return false;
}

export function applyCustomOverrides(
  baseRules: RulesData,
  overrides: CustomRulesOverride,
): RulesData {
  const hardCap = overrides.hardCap ?? baseRules.hardCap;
  const schemes: SchemeRule[] = baseRules.schemes.map((scheme) => {
    const firstRoundOverride = overrides.schemeFirstRoundQuarter[scheme.id];
    const outcomeLagOverride = overrides.schemeOutcomeLagQuarters[scheme.id];
    const rolePointOverrides = overrides.schemeRolePoints[scheme.id] ?? {};

    const outcomeLagQuarters = outcomeLagOverride ?? scheme.outcomeLagQuarters;
    const startLagQuarters =
      outcomeLagOverride !== undefined
        ? Math.max(outcomeLagOverride + 1, scheme.startLagQuarters + (outcomeLagOverride - scheme.outcomeLagQuarters))
        : scheme.startLagQuarters;

    return {
      ...scheme,
      firstRoundQuarter: firstRoundOverride ?? scheme.firstRoundQuarter,
      outcomeLagQuarters,
      startLagQuarters,
      roles: scheme.roles.map((role) => ({
        ...role,
        points: rolePointOverrides[role.id] ?? role.points,
      })),
    };
  });

  return {
    ...baseRules,
    hardCap,
    schemes,
  };
}

export function getSchemeById(rules: RulesData, schemeId: string): SchemeRule | undefined {
  return rules.schemes.find((s) => s.id === schemeId);
}

export function getLegacySchemeById(
  rules: RulesData,
  schemeId: string,
): LegacySchemeRule | undefined {
  return rules.legacySchemes.find((s) => s.id === schemeId);
}

export function getRoleById(
  rules: RulesData,
  schemeId: string,
  roleId: string,
): RoleRule | undefined {
  const scheme = getSchemeById(rules, schemeId);
  return scheme?.roles.find((r) => r.id === roleId);
}

export function getSchemeRoundQuarters(
  scheme: SchemeRule,
  startYear = 2027,
  endYear = 2032,
): QuarterKey[] {
  const first = parseQuarter(scheme.firstRoundQuarter);
  const stepYears = Math.max(1, scheme.cadenceYears || 1);
  const rounds: QuarterKey[] = [];
  for (let year = first.year; year <= endYear; year += stepYears) {
    if (year >= startYear) {
      rounds.push(`${year}-Q${first.q}`);
    }
  }
  return rounds;
}

/**
 * Picks the first valid round quarter on or after targetQuarter (advancing past endYear if needed).
 */
export function getNearestRoundQuarter(
  scheme: SchemeRule,
  targetQuarter: QuarterKey,
  _startYear = 2027,
  _endYear = 2032,
): QuarterKey {
  const first = parseQuarter(scheme.firstRoundQuarter);
  const stepYears = Math.max(1, scheme.cadenceYears || 1);
  const targetIdx = quarterToIndex(targetQuarter);
  let year = first.year;
  while (quarterToIndex(`${year}-Q${first.q}` as QuarterKey) < targetIdx) {
    year += stepYears;
  }
  return `${year}-Q${first.q}` as QuarterKey;
}

export function computeDefaultDatesForScheme(
  scheme: SchemeRule,
  submissionQuarter: QuarterKey,
): {
  submissionQuarter: QuarterKey;
  outcomeQuarter: QuarterKey;
  startQuarter: QuarterKey;
} {
  const outcomeQuarter = addQuarters(submissionQuarter, scheme.outcomeLagQuarters);
  const startQuarter = addQuarters(submissionQuarter, scheme.startLagQuarters);
  return { submissionQuarter, outcomeQuarter, startQuarter };
}

export function generateGenericLabel(
  rules: RulesData,
  schemeId: string,
  isLegacy: boolean,
  existingGrants: GrantEntry[],
): string {
  const prefix = isLegacy
    ? (getLegacySchemeById(rules, schemeId)?.shortName ?? 'Legacy Grant')
    : (getSchemeById(rules, schemeId)?.shortName ?? 'Grant');

  const usedNumbers = new Set<number>();
  const regex = new RegExp(`^${escapeRegExp(prefix)}\\s+#(\\d+)$`, 'i');
  for (const g of existingGrants) {
    const match = regex.exec(g.label.trim());
    if (match) {
      usedNumbers.add(Number(match[1]));
    }
  }
  let next = 1;
  while (usedNumbers.has(next)) {
    next += 1;
  }
  return `${prefix} #${next}`;
}

export function stripCustomLabels(grants: GrantEntry[], rules: RulesData): GrantEntry[] {
  const counters = new Map<string, number>();
  return grants.map((grant) => {
    const prefix = grant.isLegacy
      ? (getLegacySchemeById(rules, grant.schemeId)?.shortName ?? 'Legacy Grant')
      : (getSchemeById(rules, grant.schemeId)?.shortName ?? 'Grant');
    const count = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, count);
    return {
      ...grant,
      label: `${prefix} #${count}`,
      isCustomLabel: false,
      notes: undefined,
    };
  });
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

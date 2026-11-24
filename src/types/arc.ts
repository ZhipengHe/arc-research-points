export type QuarterNumber = 1 | 2 | 3 | 4;
export type QuarterKey = `${number}-Q${QuarterNumber}`;

export type SchemeStatus = 'Confirmed' | 'Indicative';
export type Cadence = 'Annual' | 'Biennial';
export type CompensationType = 'salaried' | 'teaching-relief' | 'none';
export type GrantOutcome = 'funded' | 'unsuccessful';

export interface RoleRule {
  id: string;
  label: string;
  points: number;
  compensationType: CompensationType;
  teachingReliefEligible: boolean;
  isSci: boolean;
  requiresEcr: boolean;
  requiresIndigenous: boolean;
  requiresMcrWithin15Yrs?: boolean;
}

export interface SchemeRule {
  id: string;
  name: string;
  shortName: string;
  subSchemeLabel?: string;
  status: SchemeStatus;
  indicativeLaunch: string;
  firstRoundQuarter: QuarterKey;
  cadence: Cadence;
  cadenceYears: number;
  eoiLagQuarters?: number;
  outcomeLagQuarters: number;
  startLagQuarters: number;
  maxDurationYears: number;
  fundingBandLabel: string;
  fundingMinAnnual: number;
  fundingMaxAnnual: number;
  fundingExtraNote?: string;
  requiresIndigenous?: boolean;
  quirkHint: string;
  officialUrl: string;
  roles: RoleRule[];
}

export interface LegacySchemeRule {
  id: string;
  code: string;
  name: string;
  shortName: string;
  maxDurationYears: number;
  defaultDurationYears: number;
  description: string;
}

export interface OfficialDocLink {
  id: string;
  title: string;
  shortTitle: string;
  url: string;
  pdfUrl?: string;
  description: string;
}

export interface RulesChangelogEntry {
  version: string;
  date: string;
  summary: string;
  changes: string[];
}

export interface ProjectMeta {
  authorName: string;
  authorUrl: string;
  siteUrl?: string;
  githubUrl: string;
  githubLabel: string;
}

export interface RulesData {
  version: string;
  verifiedDate: string;
  verifiedDisplay: string;
  projectMeta?: ProjectMeta;
  hardCap: number;
  ecrYearsCutoff: number;
  indigenousMaxPostPhdYears: number;
  teachingReliefMaxAnnual: number;
  timelineWindow: {
    startYear: number;
    endYear: number;
  };
  disclaimer: string;
  pointLifecycle: {
    pending: string;
    active: string;
    released: string;
    noEarlyRelinquishmentWarning: string;
  };
  teachingReliefRule: string;
  changelog: RulesChangelogEntry[];
  officialDocs: OfficialDocLink[];
  schemes: SchemeRule[];
  legacySchemes: LegacySchemeRule[];
}

export interface CustomRulesOverride {
  hardCap?: number;
  schemeRolePoints: Record<string, Record<string, number>>;
  schemeFirstRoundQuarter: Record<string, QuarterKey>;
  schemeOutcomeLagQuarters: Record<string, number>;
}

export interface EligibilityProfile {
  phdConferralDate: string; // YYYY-MM-DD or YYYY-MM or ''
  careerInterruptionMonths: number;
  isIndigenousResearcher: boolean;
}

export interface GrantEntry {
  id: string;
  isLegacy: boolean;
  isAwarded?: boolean;
  schemeId: string;
  roleId: string;
  label: string;
  isCustomLabel: boolean;
  submissionQuarter: QuarterKey;
  outcomeQuarter: QuarterKey;
  startQuarter: QuarterKey;
  durationYears: number;
  outcome: GrantOutcome;
  notes?: string;
}

export interface Scenario {
  id: string;
  name: string;
  grants: GrantEntry[];
  createdAt: string;
}

export interface ResearcherProfile {
  id: string;
  name: string;
  isPrimary: boolean;
  eligibility: EligibilityProfile;
  scenarios: Scenario[];
  activeScenarioId: string;
}

export interface PersistedWorkspaceState {
  schemaVersion: number;
  rulesVersion: string;
  profiles: ResearcherProfile[];
  activeProfileId: string;
  customOverrides: CustomRulesOverride;
  selectedQuarter: QuarterKey;
}

export type QuarterPhase = 'pending' | 'awarded' | 'active' | 'legacy' | 'released' | 'none';

export interface QuarterGrantContribution {
  grantId: string;
  label: string;
  schemeId: string;
  roleId: string;
  points: number;
  phase: QuarterPhase;
  isSci: boolean;
  teachingReliefEligible: boolean;
  compensationType: CompensationType;
}

export interface QuarterLoadSummary {
  quarter: QuarterKey;
  totalPoints: number;
  activePoints: number;
  pendingPoints: number;
  remainingPoints: number;
  overCapBy: number;
  isOverCap: boolean;
  hasSciConflict: boolean;
  hasActiveSci: boolean;
  hasActiveTeachingRelief: boolean;
  contributions: QuarterGrantContribution[];
}

export interface EligibilityIssue {
  grantId: string;
  severity: 'error' | 'warning';
  code: 'ecr-expired' | 'indigenous-required' | 'mcr-15yr-exceeded' | 'sci-teaching-relief-conflict';
  message: string;
}

export interface FundingRollup {
  fundedCount: number;
  pendingCount: number;
  unsuccessfulCount: number;
  legacyCount: number;
  annualFundingMin: number;
  annualFundingMax: number;
  totalFundingMin: number;
  totalFundingMax: number;
  annualTeachingReliefMax: number;
  hasTeachingReliefBlockedBySci: boolean;
  extraNotes: string[];
  hasSalariedRole: boolean;
}

export interface FittingRoleOption {
  scheme: SchemeRule;
  role: RoleRule;
  points: number;
  remainingAfterQuarter: number;
  peakLoadIfAdded: number;
  exceedsCapLater: boolean;
  peakExceedQuarter: QuarterKey | null;
  eligibilityIssues: string[];
  isEligible: boolean;
  suggestedSubmissionQuarter: QuarterKey;
  suggestedOutcomeQuarter: QuarterKey;
  suggestedStartQuarter: QuarterKey;
}

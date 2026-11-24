import type {
  EligibilityIssue,
  FundingRollup,
  GrantEntry,
  QuarterLoadSummary,
  ResearcherProfile,
  RulesData,
  Scenario,
} from '../types/arc';
import {
  addQuarters,
  computeEcrCutoffDate,
  dateToTimelineFraction,
  formatDateShort,
  formatQuarterShort,
  parseQuarter,
  quarterToEndDate,
  quarterToStartDate,
} from '../engine/quarters';
import { getLegacySchemeById, getRoleById, getSchemeById } from '../engine/rules';
import {
  computeQuarterlyLoads,
  formatCurrencyAud,
  getGrantEndQuarter,
  getGrantPhaseAtQuarter,
  getGrantPoints,
  getPeakLoadSummary,
} from '../engine/planner';

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatIcsDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function generateScenarioIcs(scenario: Scenario, rules: RulesData): string {
  const nowStamp =
    new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ARC NCGP Research Points Planner//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(`ARC Pipeline: ${scenario.name}`)}`,
  ];

  const pushAllDayEvent = (uid: string, startDate: Date, summary: string, description: string) => {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}@arc-points-planner.local`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDaysUtc(startDate, 1))}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    lines.push('END:VEVENT');
  };

  for (const grant of scenario.grants) {
    if (grant.isLegacy) {
      const legacy = getLegacySchemeById(rules, grant.schemeId);
      const start = quarterToStartDate(grant.startQuarter);
      const end = quarterToEndDate(getGrantEndQuarter(grant));
      pushAllDayEvent(
        `${grant.id}-legacy-end`,
        end,
        `[ARC Legacy] ${grant.label} ends`,
        `${legacy?.name ?? grant.schemeId} (0 Research Points). Active ${formatQuarterShort(grant.startQuarter)} to ${formatQuarterShort(getGrantEndQuarter(grant))}.`,
      );
      void start;
      continue;
    }

    const scheme = getSchemeById(rules, grant.schemeId);
    const role = getRoleById(rules, grant.schemeId, grant.roleId);
    if (!scheme || !role) continue;

    const openQuarter = addQuarters(grant.submissionQuarter, -1);
    const openDate = quarterToStartDate(openQuarter);
    const closeDate = quarterToEndDate(grant.submissionQuarter);
    const outcomeDate = quarterToStartDate(grant.outcomeQuarter);
    const startDate = quarterToStartDate(grant.startQuarter);
    const endDate = quarterToEndDate(getGrantEndQuarter(grant));

    const meta = `Scheme: ${scheme.name} (${scheme.status}) | Role: ${role.label} (${role.points} pts) | Funding: ${scheme.fundingBandLabel} | Check final Grant Opportunity Guidelines: ${scheme.officialUrl}`;

    if (grant.isAwarded) {
      pushAllDayEvent(
        `${grant.id}-end`,
        endDate,
        `[ARC Project End] ${grant.label} (${role.points} pts release)`,
        `Already awarded project completes (${formatQuarterShort(grant.startQuarter)} to ${formatQuarterShort(getGrantEndQuarter(grant))}). ${role.points} pts return after end date. ${meta}`,
      );
      continue;
    }

    pushAllDayEvent(
      `${grant.id}-open`,
      openDate,
      `[ARC Round Open] ${grant.label} (${scheme.shortName})`,
      `Indicative round opening window ahead of ${formatQuarterShort(grant.submissionQuarter)} closing. ${meta}`,
    );

    if (scheme.eoiLagQuarters) {
      const fullQuarter = addQuarters(grant.submissionQuarter, scheme.eoiLagQuarters);
      pushAllDayEvent(
        `${grant.id}-eoi-close`,
        closeDate,
        `[ARC EOI Close] ${grant.label} (${role.points} pts lock)`,
        `Two-stage EOI closing (${formatQuarterShort(grant.submissionQuarter)}); Full proposal follows in ${formatQuarterShort(fullQuarter)}. ${meta}`,
      );
      pushAllDayEvent(
        `${grant.id}-full-close`,
        quarterToEndDate(fullQuarter),
        `[ARC Full Application Close] ${grant.label}`,
        `Full proposal submission window (${formatQuarterShort(fullQuarter)}). ${meta}`,
      );
    } else {
      pushAllDayEvent(
        `${grant.id}-close`,
        closeDate,
        `[ARC Close] ${grant.label} (${role.points} pts lock)`,
        `Points lock on submission (${role.points} pts). ${meta}`,
      );
    }

    pushAllDayEvent(
      `${grant.id}-outcome`,
      outcomeDate,
      `[ARC Outcome] ${grant.label} (${grant.outcome === 'funded' ? 'Modelled Funded' : 'Modelled Unsuccessful'})`,
      `Expected outcome announcement (${formatQuarterShort(grant.outcomeQuarter)}). If unsuccessful, ${role.points} pts release here. ${meta}`,
    );

    if (grant.outcome === 'funded') {
      pushAllDayEvent(
        `${grant.id}-start`,
        startDate,
        `[ARC Project Start] ${grant.label} (${grant.durationYears} yrs)`,
        `Funded project commences (${formatQuarterShort(grant.startQuarter)} to ${formatQuarterShort(getGrantEndQuarter(grant))}). No early relinquishment. ${meta}`,
      );
      pushAllDayEvent(
        `${grant.id}-end`,
        endDate,
        `[ARC Project End] ${grant.label} (${role.points} pts release)`,
        `Project completion (${formatQuarterShort(getGrantEndQuarter(grant))}). ${role.points} pts return after end date. ${meta}`,
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function buildAiPromptExport(params: {
  format: 'markdown' | 'json';
  profile: ResearcherProfile;
  activeScenario: Scenario;
  rules: RulesData;
  loads: QuarterLoadSummary[];
  rollup: FundingRollup;
  issues: EligibilityIssue[];
}): string {
  const { format, profile, activeScenario, rules, loads, rollup, issues } = params;
  const peak = getPeakLoadSummary(loads);
  const bottlenecks = loads.filter((l) => l.totalPoints >= Math.max(1, rules.hardCap - 2));

  if (format === 'json') {
    const scenariosSummary = profile.scenarios.map((s) => {
      const sLoads = computeQuarterlyLoads(s.grants, rules);
      const sPeak = getPeakLoadSummary(sLoads);
      return {
        id: s.id,
        name: s.name,
        grantCount: s.grants.length,
        peakPoints: sPeak.peakPoints,
        peakQuarter: sPeak.peakQuarter,
        overCapQuarters: sPeak.overCapQuarters.map((q) => ({
          quarter: q.quarter,
          points: q.totalPoints,
          overBy: q.overCapBy,
        })),
      };
    });

    return JSON.stringify(
      {
        context: 'ARC NCGP 13-Point Research Points Pipeline',
        rulesVersion: rules.version,
        rulesVerified: rules.verifiedDisplay,
        hardCap: rules.hardCap,
        profile: {
          name: profile.name,
          eligibility: profile.eligibility,
        },
        activeScenario: {
          name: activeScenario.name,
          peakPoints: peak.peakPoints,
          peakQuarter: peak.peakQuarter,
          overCapQuarters: peak.overCapQuarters.map((q) => q.quarter),
          fundingRollup: rollup,
          eligibilityIssues: issues,
          grants: activeScenario.grants.map((g) => ({
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
        },
        quarterByQuarterLoad: loads.map((l) => ({
          quarter: l.quarter,
          totalPoints: l.totalPoints,
          activePoints: l.activePoints,
          pendingPoints: l.pendingPoints,
          remainingPoints: l.remainingPoints,
          isOverCap: l.isOverCap,
          hasSciConflict: l.hasSciConflict,
        })),
        bottlenecks: bottlenecks.map((b) => ({
          quarter: b.quarter,
          totalPoints: b.totalPoints,
          remainingPoints: b.remainingPoints,
          status: b.isOverCap ? 'OVER_LIMIT' : 'NEAR_CAP',
        })),
        allScenarios: scenariosSummary,
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  lines.push(`# ARC NCGP Research Points Plan: ${activeScenario.name}`);
  lines.push(`- **Profile:** ${profile.name}`);
  lines.push(`- **Rules Version:** ${rules.version} (verified ${rules.verifiedDisplay}, hard cap ${rules.hardCap} pts)`);
  if (profile.eligibility.phdConferralDate) {
    const cutoff = computeEcrCutoffDate(
      profile.eligibility.phdConferralDate,
      profile.eligibility.careerInterruptionMonths,
      rules.ecrYearsCutoff,
    );
    lines.push(
      `- **Eligibility:** PhD ${profile.eligibility.phdConferralDate} (+${profile.eligibility.careerInterruptionMonths} mo career interruption${cutoff ? `, 5-yr ECR cutoff ${formatDateShort(cutoff)}` : ''}); Indigenous researcher: ${profile.eligibility.isIndigenousResearcher ? 'Yes' : 'No'}`,
    );
  }
  lines.push(
    `- **Peak Load:** ${peak.peakPoints} / ${rules.hardCap} pts${peak.peakQuarter ? ` in ${formatQuarterShort(peak.peakQuarter)}` : ''}${peak.overCapQuarters.length > 0 ? ` (OVER LIMIT in ${peak.overCapQuarters.length} quarter(s))` : ' (Within limit)'}`,
  );
  lines.push(
    `- **Indicative Funded Band:** ${formatCurrencyAud(rollup.annualFundingMin)}-${formatCurrencyAud(rollup.annualFundingMax)}/yr | Teaching Relief Eligibility: up to ${formatCurrencyAud(rollup.annualTeachingReliefMax)}/yr${rollup.hasTeachingReliefBlockedBySci ? ' (SCI salary overlap warning in some quarters)' : ''}`,
  );
  lines.push('');

  lines.push('## Grants in Active Scenario');
  lines.push('| Label | Scheme | Role | Pts | Submit | Outcome | Active Window | Modelled Status |');
  lines.push('| :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |');
  for (const g of activeScenario.grants) {
    const schemeName = g.isLegacy
      ? (getLegacySchemeById(rules, g.schemeId)?.name ?? g.schemeId)
      : (getSchemeById(rules, g.schemeId)?.name ?? g.schemeId);
    const roleLabel = g.isLegacy
      ? 'Legacy CI'
      : (getRoleById(rules, g.schemeId, g.roleId)?.label ?? g.roleId);
    const pts = getGrantPoints(g, rules);
    lines.push(
      `| ${g.label} | ${schemeName} | ${roleLabel} | ${pts} | ${g.isLegacy || g.isAwarded ? 'N/A' : formatQuarterShort(g.submissionQuarter)} | ${g.isLegacy ? 'Active' : g.isAwarded ? 'Awarded' : formatQuarterShort(g.outcomeQuarter)} | ${formatQuarterShort(g.startQuarter)} to ${formatQuarterShort(getGrantEndQuarter(g))} (${g.durationYears}y) | ${g.isLegacy ? 'Legacy (0 pts)' : g.isAwarded ? 'Awarded (Locked)' : g.outcome === 'funded' ? 'If Funded' : 'If Unfunded (released)'} |`,
    );
  }
  lines.push('');

  lines.push('## Quarter-by-Quarter Bottlenecks & Capacity (2027-2032)');
  if (bottlenecks.length === 0) {
    lines.push('No quarters exceed or approach within 2 points of the 13-point cap.');
  } else {
    for (const b of bottlenecks) {
      const flag = b.isOverCap ? `OVER CAP (+${b.overCapBy} pts)` : `${b.remainingPoints} pts free`;
      lines.push(
        `- **${formatQuarterShort(b.quarter)}:** ${b.totalPoints}/${rules.hardCap} pts (${b.activePoints} active + ${b.pendingPoints} pending) [${flag}]`,
      );
    }
  }
  lines.push('');

  lines.push('## Full Quarterly Load Table');
  lines.push('| Quarter | Total | Active | Pending | Free |');
  lines.push('| :--- | ---: | ---: | ---: | ---: |');
  for (const l of loads) {
    lines.push(
      `| ${formatQuarterShort(l.quarter)} | ${l.totalPoints}/${rules.hardCap}${l.isOverCap ? ' (!)' : ''} | ${l.activePoints} | ${l.pendingPoints} | ${l.remainingPoints} |`,
    );
  }

  if (issues.length > 0) {
    lines.push('');
    lines.push('## Eligibility & Rule Alerts');
    for (const issue of issues) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
  }

  if (profile.scenarios.length > 1) {
    lines.push('');
    lines.push('## Scenario Comparison');
    for (const s of profile.scenarios) {
      const sLoads = computeQuarterlyLoads(s.grants, rules);
      const sPeak = getPeakLoadSummary(sLoads);
      lines.push(
        `- **${s.name}${s.id === activeScenario.id ? ' (Active)' : ''}:** ${s.grants.length} entries, peak ${sPeak.peakPoints}/${rules.hardCap} pts${sPeak.peakQuarter ? ` (${formatQuarterShort(sPeak.peakQuarter)})` : ''}, ${sPeak.overCapQuarters.length} over-limit quarter(s)`,
      );
    }
  }

  return lines.join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates a crisp high-DPI PNG of the Gantt timeline + 13-point capacity chart
 * directly via Canvas for slide decks and research office meetings.
 */
export function exportTimelinePng(params: {
  profile: ResearcherProfile;
  scenario: Scenario;
  rules: RulesData;
  loads: QuarterLoadSummary[];
}): void {
  const { profile, scenario, rules, loads } = params;
  const dpr = 2;
  const leftColWidth = 260;
  const colWidth = 38;
  const gridWidth = loads.length * colWidth;
  const padX = 28;
  const width = padX * 2 + leftColWidth + gridWidth;

  const headerHeight = 76;
  const yearHeaderHeight = 42;
  const rowHeight = 32;
  const grantsCount = Math.max(1, scenario.grants.length);
  const ganttHeight = grantsCount * rowHeight + 12;
  const chartGap = 24;
  const chartHeight = 160;
  const footerHeight = 48;
  const height = headerHeight + yearHeaderHeight + ganttHeight + chartGap + chartHeight + footerHeight;

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Header
  const peak = getPeakLoadSummary(loads);
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`ARC NCGP Research Points Plan: ${scenario.name}`, padX, 34);

  ctx.fillStyle = '#475569';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(
    `Profile: ${profile.name}   |   Peak Load: ${peak.peakPoints}/${rules.hardCap} pts${peak.peakQuarter ? ` (${formatQuarterShort(peak.peakQuarter)})` : ''}   |   Rules v${rules.version} (${rules.verifiedDisplay})`,
    padX,
    54,
  );

  // Legend right aligned
  const legendItems = [
    { color: '#0f766e', label: 'Active / Funded' },
    { color: '#f59e0b', label: 'Pending Lock' },
    { color: '#dc2626', label: `Over ${rules.hardCap} pts` },
    { color: '#94a3b8', label: 'Legacy (0 pts)' },
  ];
  let lx = width - padX;
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  for (let i = legendItems.length - 1; i >= 0; i--) {
    const item = legendItems[i];
    const tw = ctx.measureText(item.label).width;
    lx -= tw;
    ctx.fillStyle = '#334155';
    ctx.fillText(item.label, lx, 34);
    lx -= 14;
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, 25, 10, 10);
    lx -= 14;
  }

  // Year & Quarter Grid Header
  const gridLeft = padX + leftColWidth;
  const gridTop = headerHeight;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(padX, gridTop, leftColWidth + gridWidth, yearHeaderHeight);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(padX, gridTop, leftColWidth + gridWidth, yearHeaderHeight);

  ctx.fillStyle = '#475569';
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('GRANT / ROLE', padX + 10, gridTop + 26);

  for (let i = 0; i < loads.length; i++) {
    const x = gridLeft + i * colWidth;
    const { year, q } = parseQuarter(loads[i].quarter);
    if (q === 1) {
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(String(year), x + 6, gridTop + 16);
      ctx.strokeStyle = '#cbd5e1';
    } else {
      ctx.strokeStyle = '#f1f5f9';
    }
    ctx.beginPath();
    ctx.moveTo(x, gridTop);
    ctx.lineTo(x, gridTop + yearHeaderHeight + ganttHeight);
    ctx.stroke();

    ctx.fillStyle = loads[i].isOverCap ? '#dc2626' : '#64748b';
    ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`Q${q}`, x + 11, gridTop + 34);
  }

  // Gantt Rows
  const rowsTop = gridTop + yearHeaderHeight;
  if (scenario.grants.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('No grants in this scenario.', padX + 12, rowsTop + 22);
  } else {
    scenario.grants.forEach((grant: GrantEntry, idx: number) => {
      const y = rowsTop + idx * rowHeight;
      if (idx % 2 === 1) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(padX, y, leftColWidth + gridWidth, rowHeight);
      }

      ctx.strokeStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(padX, y + rowHeight);
      ctx.lineTo(padX + leftColWidth + gridWidth, y + rowHeight);
      ctx.stroke();

      const pts = getGrantPoints(grant, rules);
      const roleLabel = grant.isLegacy
        ? 'Legacy (0 pts)'
        : `${getRoleById(rules, grant.schemeId, grant.roleId)?.label ?? grant.roleId} (${pts} pts)`;

      ctx.fillStyle = '#0f172a';
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(grant.label.slice(0, 28), padX + 10, y + 14);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(roleLabel.slice(0, 34), padX + 10, y + 26);

      // Draw phase cells
      for (let qIdx = 0; qIdx < loads.length; qIdx++) {
        const phase = getGrantPhaseAtQuarter(grant, loads[qIdx].quarter);
        if (phase === 'none') continue;
        const x = gridLeft + qIdx * colWidth + 1;
        const barY = y + 7;
        const barH = rowHeight - 14;
        const barW = colWidth - 2;

        if (phase === 'pending') {
          ctx.fillStyle = '#fef3c7';
          ctx.fillRect(x, barY, barW, barH);
          ctx.strokeStyle = '#d97706';
          ctx.strokeRect(x + 0.5, barY + 0.5, barW - 1, barH - 1);
        } else if (phase === 'awarded' || phase === 'active') {
          ctx.fillStyle = phase === 'active' ? '#0f766e' : '#14b8a6';
          ctx.fillRect(x, barY, barW, barH);
        } else if (phase === 'legacy') {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(x, barY, barW, barH);
        } else if (phase === 'released') {
          ctx.strokeStyle = '#94a3b8';
          ctx.setLineDash([3, 2]);
          ctx.strokeRect(x + 0.5, barY + 0.5, barW - 1, barH - 1);
          ctx.setLineDash([]);
        }
      }
    });
  }

  // ECR cutoff vertical line
  const ecrCutoff = computeEcrCutoffDate(
    profile.eligibility.phdConferralDate,
    profile.eligibility.careerInterruptionMonths,
    rules.ecrYearsCutoff,
  );
  const ecrFraction = ecrCutoff
    ? dateToTimelineFraction(ecrCutoff, rules.timelineWindow.startYear, rules.timelineWindow.endYear)
    : null;

  // Capacity Bar Chart
  const chartTop = rowsTop + ganttHeight + chartGap;
  const chartInnerTop = chartTop + 18;
  const chartInnerHeight = chartHeight - 40;
  const maxY = Math.max(rules.hardCap + 4, peak.peakPoints + 2);

  ctx.fillStyle = '#0f172a';
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`QUARTERLY POINT LOAD (CAP: ${rules.hardCap})`, padX + 10, chartTop + 12);

  ctx.strokeStyle = '#e2e8f0';
  ctx.strokeRect(gridLeft, chartInnerTop, gridWidth, chartInnerHeight);

  // Horizontal cap line
  const capY = chartInnerTop + chartInnerHeight - (rules.hardCap / maxY) * chartInnerHeight;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(gridLeft, capY);
  ctx.lineTo(gridLeft + gridWidth, capY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;

  ctx.fillStyle = '#dc2626';
  ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`${rules.hardCap} pt cap`, gridLeft - 58, capY + 3);

  // Bars
  for (let i = 0; i < loads.length; i++) {
    const load = loads[i];
    const x = gridLeft + i * colWidth + 6;
    const bw = colWidth - 12;
    const baseLine = chartInnerTop + chartInnerHeight;

    const activeH = (load.activePoints / maxY) * chartInnerHeight;
    const pendingH = (load.pendingPoints / maxY) * chartInnerHeight;

    if (load.activePoints > 0) {
      ctx.fillStyle = load.isOverCap ? '#dc2626' : '#0f766e';
      ctx.fillRect(x, baseLine - activeH, bw, activeH);
    }
    if (load.pendingPoints > 0) {
      ctx.fillStyle = load.isOverCap ? '#f87171' : '#f59e0b';
      ctx.fillRect(x, baseLine - activeH - pendingH, bw, pendingH);
    }

    if (load.totalPoints > 0) {
      ctx.fillStyle = load.isOverCap ? '#b91c1c' : '#334155';
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(load.totalPoints), x + bw / 2, baseLine - activeH - pendingH - 4);
      ctx.textAlign = 'left';
    }
  }

  if (ecrFraction !== null) {
    const ex = gridLeft + ecrFraction * gridWidth;
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ex, gridTop);
    ctx.lineTo(ex, chartInnerTop + chartInnerHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6d28d9';
    ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('5-yr ECR cutoff', ex + 4, gridTop + 12);
  }

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(
    `Unofficial planning tool (Rules verified ${rules.verifiedDisplay}). No early relinquishment of active grants. Verify against final ARC Grant Opportunity Guidelines & RMS.`,
    padX,
    height - 16,
  );

  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `arc-points-plan-${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

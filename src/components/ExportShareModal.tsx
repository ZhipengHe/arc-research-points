import { useRef, useState } from 'react';
import {
  Bot,
  CalendarPlus,
  Check,
  Copy,
  Download,
  FileImage,
  FileJson,
  Link2,
  Printer,
  Upload,
} from 'lucide-react';
import type {
  EligibilityIssue,
  FundingRollup,
  PersistedWorkspaceState,
  QuarterLoadSummary,
  ResearcherProfile,
  RulesData,
  Scenario,
} from '../types/arc';
import {
  buildAiPromptExport,
  exportTimelinePng,
  generateScenarioIcs,
  triggerFileDownload,
} from '../utils/exportTools';
import { exportWorkspaceJson, parseImportedWorkspaceJson } from '../utils/storage';
import { createShareUrl } from '../utils/shareLink';
import type { WebMcpRegistrationStatus } from '../utils/webmcp';
import { ModalDialog } from './ModalDialog';

interface ExportShareModalProps {
  open: boolean;
  onClose: () => void;
  state: PersistedWorkspaceState;
  profile: ResearcherProfile;
  scenario: Scenario;
  rules: RulesData;
  loads: QuarterLoadSummary[];
  rollup: FundingRollup;
  issues: EligibilityIssue[];
  webMcpStatus: WebMcpRegistrationStatus;
  onImportWorkspace: (next: PersistedWorkspaceState, outdatedFromVersion: string | null) => void;
}

export function ExportShareModal({
  open,
  onClose,
  state,
  profile,
  scenario,
  rules,
  loads,
  rollup,
  issues,
  webMcpStatus,
  onImportWorkspace,
}: ExportShareModalProps) {
  const [stripTitles, setStripTitles] = useState(true);
  const [aiFormat, setAiFormat] = useState<'markdown' | 'json'>('markdown');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
  };

  const handleCopyShareLink = async () => {
    const url = await createShareUrl({
      scenario,
      rules,
      eligibility: profile.eligibility,
      stripTitles,
    });
    await navigator.clipboard.writeText(url);
    flashCopied('share');
  };

  const handleCopyForAi = async () => {
    const text = buildAiPromptExport({
      format: aiFormat,
      profile,
      activeScenario: scenario,
      rules,
      loads,
      rollup,
      issues,
    });
    await navigator.clipboard.writeText(text);
    flashCopied('ai');
  };

  const handleDownloadIcs = () => {
    const ics = generateScenarioIcs(scenario, rules);
    const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    triggerFileDownload(`arc-pipeline-${slug}.ics`, ics, 'text/calendar;charset=utf-8');
  };

  const handleDownloadJson = () => {
    const json = exportWorkspaceJson(state);
    triggerFileDownload(
      `arc-points-workspace-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      'application/json;charset=utf-8',
    );
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { state: nextState, outdatedFromVersion } = parseImportedWorkspaceJson(text, rules);
      onImportWorkspace(nextState, outdatedFromVersion);
      setImportSuccess(`Imported workspace (${nextState.profiles.length} profile(s)) safely.`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to parse JSON backup.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePrintPdf = () => {
    onClose();
    window.setTimeout(() => window.print(), 120);
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      variant="wide"
      title="Export, Share & AI Integration"
      subtitle="Zero-server sharing, slide-ready timeline exports, calendar reminders, JSON backups, and WebMCP agent tools."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* 1. Zero-Server Shareable Link */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <Link2 className="h-4 w-4 text-slate-600" />
            Zero-Server Shareable Link (#hash)
          </div>
          <p className="text-[11px] text-slate-600">
            Encodes the active scenario client-side into the URL hash. Nothing is uploaded to any
            server.
          </p>
          <label className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={stripTitles}
              onChange={(e) => setStripTitles(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 accent-slate-900"
            />
            <span className="text-[11px] text-slate-700">
              <strong>Strip custom project titles automatically</strong> before copying (replaces
              with generic labels like &ldquo;Explore #1&rdquo;)
            </span>
          </label>
          <button
            type="button"
            onClick={() => void handleCopyShareLink()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            {copiedKey === 'share' ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Share Link Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Shareable URL
              </>
            )}
          </button>
        </div>

        {/* 2. Copy Plan for AI */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Bot className="h-4 w-4 text-slate-600" />
              Copy Plan for AI
            </div>
            <div className="inline-flex rounded border border-slate-300 bg-slate-50 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setAiFormat('markdown')}
                className={`rounded px-2 py-0.5 font-medium cursor-pointer ${
                  aiFormat === 'markdown' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => setAiFormat('json')}
                className={`rounded px-2 py-0.5 font-medium cursor-pointer ${
                  aiFormat === 'json' ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                JSON
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-600">
            Copies your active pipeline, scenario comparison, funding roll-up, and quarter-by-quarter
            bottlenecks ready to paste into AI chats.
          </p>
          <button
            type="button"
            onClick={() => void handleCopyForAi()}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-900 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-900 hover:text-white cursor-pointer arc-state-transition"
          >
            {copiedKey === 'ai' ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied {aiFormat.toUpperCase()} Plan
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Plan for AI ({aiFormat === 'markdown' ? 'Markdown' : 'JSON'})
              </>
            )}
          </button>
        </div>

        {/* 3. Meetings, Slides & Calendar */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5">
          <div className="font-semibold text-slate-900">Slides, Print &amp; Calendar</div>
          <p className="text-[11px] text-slate-600">
            Export crisp light-mode visuals for research office meetings or import indicative round
            dates into Outlook/Apple/Google Calendar.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => exportTimelinePng({ profile, scenario, rules, loads })}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <FileImage className="h-3.5 w-3.5 text-slate-600" />
              Download High-DPI Timeline PNG
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5 text-slate-600" />
              Print / Save Landscape PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadIcs}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <CalendarPlus className="h-3.5 w-3.5 text-slate-600" />
              Export Round Dates (.ics Calendar)
            </button>
          </div>
        </div>

        {/* 4. JSON Workspace Backup & Restore */}
        <div className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <FileJson className="h-4 w-4 text-slate-600" />
            JSON Workspace Backup
          </div>
          <p className="text-[11px] text-slate-600">
            Save all scenarios, collaborator profiles, eligibility settings, and custom rule
            overrides locally as a JSON file.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-600" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-slate-600" />
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
          </div>
          {importError && <p className="text-[11px] font-medium text-red-700">{importError}</p>}
          {importSuccess && (
            <p className="text-[11px] font-medium text-emerald-700">{importSuccess}</p>
          )}
        </div>

        {/* 5. Browser-Agent Support (WebMCP) & Machine-Readable Endpoints */}
        <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold text-slate-900">
              AI Agent Endpoints &amp; Browser-Native WebMCP
            </div>
            {webMcpStatus.supported && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
                WebMCP Active ({webMcpStatus.surface})
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-600">
            Browser agents can operate the planner directly via accessible controls or via{' '}
            {webMcpStatus.toolNames.length} auto-registered WebMCP client tools (
            <span className="font-mono text-slate-800">{webMcpStatus.toolNames.join(', ')}</span>)
            in WebMCP-enabled browsers.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <a
              href="./rules.json"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-slate-700 underline decoration-slate-300 hover:text-slate-950"
            >
              /rules.json
            </a>
            <a
              href="./llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-slate-700 underline decoration-slate-300 hover:text-slate-950"
            >
              /llms.txt
            </a>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}

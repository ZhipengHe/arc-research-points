import { BookOpen, Compass, Download, ExternalLink, FileText, Lock, ShieldAlert } from 'lucide-react';
import type { RulesData } from '../types/arc';
import { GitHubIcon } from './BrandMark';
import { ModalDialog } from './ModalDialog';

interface OfficialDocsDrawerProps {
  open: boolean;
  onClose: () => void;
  rules: RulesData;
  onDownloadBackup?: () => void;
  onStartTour?: () => void;
}

export function OfficialDocsDrawer({
  open,
  onClose,
  rules,
  onDownloadBackup,
  onStartTour,
}: OfficialDocsDrawerProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      variant="drawer"
      title="Official ARC Documentation"
      subtitle={`External authoritative sources linked directly from arc.gov.au (Rules v${rules.version}, verified ${rules.verifiedDisplay}).`}
    >
      <div className="space-y-5 text-xs">
        {/* Unofficial Notice */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-amber-950 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <ShieldAlert className="h-4 w-4 text-amber-700 shrink-0" />
            Unofficial Planning Tool
          </div>
          <p className="text-[11px] leading-relaxed text-amber-900">{rules.disclaimer}</p>
        </div>

        {/* Primary Official ARC Sources */}
        <div className="space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <BookOpen className="h-3.5 w-3.5" />
            Primary ARC Reference Pages
          </h3>
          {rules.officialDocs.map((doc) => (
            <div
              key={doc.id}
              className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5"
            >
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-slate-900 hover:text-teal-800 hover:underline"
              >
                <span>{doc.title}</span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </a>
              <p className="text-[11px] text-slate-600 leading-relaxed">{doc.description}</p>
              {doc.pdfUrl && (
                <a
                  href={doc.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <FileText className="h-3 w-3" />
                  Direct Official PDF (arc.gov.au)
                  <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
                </a>
              )}
            </div>
          ))}
        </div>

        {/* Core Policy Reminders */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Built-in Lifecycle &amp; Policy Rules
          </h3>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-[11px] text-slate-700">
            <p>
              <strong>Pending:</strong> {rules.pointLifecycle.pending}
            </p>
            <p>
              <strong>Active:</strong> {rules.pointLifecycle.active}
            </p>
            <p>
              <strong>Released:</strong> {rules.pointLifecycle.released}
            </p>
            <p className="font-semibold text-red-800">
              {rules.pointLifecycle.noEarlyRelinquishmentWarning}
            </p>
            <p>
              <strong>Teaching Relief:</strong> {rules.teachingReliefRule}
            </p>
          </div>
        </div>

        {/* Rules Changelog */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            Rules Version Changelog
          </h3>
          <div className="space-y-2">
            {rules.changelog.map((entry) => (
              <div
                key={entry.version}
                className="rounded-lg border border-slate-200 bg-white p-3 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-slate-900">v{entry.version}</span>
                  <span className="font-mono text-[11px] text-slate-500">{entry.date}</span>
                </div>
                <p className="text-[11px] font-medium text-slate-700">{entry.summary}</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                  {entry.changes.map((c, idx) => (
                    <li key={idx}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Privacy & Local-Only Guarantee */}
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            <Lock className="h-3.5 w-3.5 text-teal-700" />
            Privacy &amp; Data Handling
          </div>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 leading-relaxed">
            <li>
              <strong>100% local in your browser:</strong> Plans, collaborator profiles, and
              eligibility dates are saved only in <code className="font-mono">localStorage</code>.
              Nothing is sent to any server.
            </li>
            <li>
              <strong>No accounts, cookies, or analytics:</strong> No login, no telemetry, and no
              third-party tracking scripts.
            </li>
            <li>
              <strong>Privacy-safe labels &amp; sharing:</strong> New grants default to generic
              labels (e.g., &ldquo;Explore #1&rdquo;), and shareable <code className="font-mono">#hash</code>{' '}
              links strip custom titles automatically by default.
            </li>
          </ul>
          {onDownloadBackup && (
            <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                Save a local JSON copy before clearing browser site data.
              </span>
              <button
                type="button"
                onClick={onDownloadBackup}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-50 cursor-pointer shrink-0"
              >
                <Download className="h-3 w-3" />
                Backup JSON
              </button>
            </div>
          )}
        </div>

        {/* Open Source & Author */}
        {rules.projectMeta && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                About &amp; Open Source
              </span>
              <a
                href={rules.projectMeta.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-0.5 font-mono text-[10px] font-medium text-slate-800 hover:bg-slate-100"
              >
                <GitHubIcon className="h-3 w-3" />
                <span>GitHub</span>
                <ExternalLink className="h-2.5 w-2.5 text-slate-400" />
              </a>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Independent community planning tool built by{' '}
              <a
                href={rules.projectMeta.authorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-900 underline decoration-slate-300 hover:text-teal-800"
              >
                {rules.projectMeta.authorName}
              </a>{' '}
              with Gemini 4 Neon. Inspect or suggest updates to{' '}
              <code className="font-mono">rules.json</code> on GitHub as ARC publishes final Grant
              Opportunity Guidelines.
            </p>
            {onStartTour && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onStartTour}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-100 cursor-pointer"
                >
                  <Compass className="h-3.5 w-3.5 text-teal-700" />
                  Replay Quick Tour (5 steps)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Machine-readable links */}
        <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span>Static Rules Data:</span>
          <div className="flex items-center gap-3">
            <a
              href="./rules.json"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline hover:text-slate-900"
            >
              rules.json
            </a>
            <a
              href="./llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono underline hover:text-slate-900"
            >
              llms.txt
            </a>
          </div>
        </div>
      </div>
    </ModalDialog>
  );
}

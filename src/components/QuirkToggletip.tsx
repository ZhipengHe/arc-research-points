import { useId } from 'react';
import { Info } from 'lucide-react';
import type { SchemeStatus } from '../types/arc';

interface QuirkToggletipProps {
  label: string;
  title?: string;
  status?: SchemeStatus;
  content: string;
  extraMeta?: string;
}

/**
 * Native popover="hint" toggletip with both interestfor (hover/focus) and popovertarget (click/tap)
 * following modern-web-guidance `interest-triggered-tooltips`.
 */
export function QuirkToggletip({
  label,
  title,
  status,
  content,
  extraMeta,
}: QuirkToggletipProps) {
  const rawId = useId();
  const id = `hint-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        aria-expanded="false"
        className="inline-flex items-center justify-center rounded p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-slate-900 cursor-pointer arc-state-transition"
        {...({
          interestfor: id,
          popovertarget: id,
          popovertargetaction: 'show',
        } as Record<string, string>)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <div
        id={id}
        role="tooltip"
        className="arc-hint-popover"
        {...({ popover: 'hint' } as Record<string, string>)}
      >
        {title && (
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/90 px-3 py-1.5">
            <span className="text-[11px] font-semibold text-slate-900">{title}</span>
            {status && (
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                  status === 'Confirmed'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                {status}
              </span>
            )}
          </div>
        )}
        <div className="px-3 py-2 text-xs text-slate-700 leading-relaxed">{content}</div>
        {extraMeta && (
          <div className="border-t border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-500 tabular-nums">
            {extraMeta}
          </div>
        )}
      </div>
    </span>
  );
}

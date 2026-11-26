import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';

interface TourStep {
  id: string;
  target: string;
  title: string;
  body: string;
  rightTab?: 'what-fits' | 'team';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'pipeline',
    target: 'pipeline',
    title: 'Pipeline & Plan B Toggle',
    body: 'Add planned NCGP bids, already-awarded grants, or 0-point legacy projects here. Click any If Funded pill to test how points release if a bid is unsuccessful.',
  },
  {
    id: 'capacity',
    target: 'capacity',
    title: 'Quarterly 13-Point Chart',
    body: 'Click any quarter column (2027 to 2032) to inspect active vs. pending locks against the red 13-point cap. Hover over the chart to reveal PNG, Print/PDF, and Fullscreen controls.',
  },
  {
    id: 'what-fits',
    target: 'assistant',
    title: 'What Fits? Assistant',
    body: 'See valid scheme and role combinations for your free points in the selected quarter. Filter by eligibility or cap safety, then click + Add to drop a bid onto your timeline.',
    rightTab: 'what-fits',
  },
  {
    id: 'team-coci',
    target: 'assistant',
    title: 'Team / Co-CI Capacity',
    body: 'Check colleagues\u2019 13-point headroom across 2027 to 2032, add Co-CIs or import their share links, and verify joint bids before writing an application.',
    rightTab: 'team',
  },
  {
    id: 'toolbar',
    target: 'toolbar',
    title: 'Eligibility, Compare & Export',
    body: 'Enter your PhD date in Eligibility for 5-yr ECR or 15-yr Indigenous cutoffs, compare scenarios side-by-side, or export PNG/PDF/JSON backups. All data stays 100% local in your browser.',
  },
];

interface QuickTourOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelectRightTab?: (tab: 'what-fits' | 'team') => void;
}

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findVisibleTourElement(target: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return el;
    }
  }
  return null;
}

export function QuickTourOverlay({ open, onClose, onSelectRightTab }: QuickTourOverlayProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<RectBox | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const step = TOUR_STEPS[stepIdx] ?? TOUR_STEPS[0];

  const measure = useCallback(() => {
    const el = findVisibleTourElement(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top,
      left: r.left,
      width: r.width,
      height: r.height,
    });
  }, [step.target]);

  useEffect(() => {
    if (!open) {
      setStepIdx(0);
      return;
    }
    if (step.rightTab) {
      onSelectRightTab?.(step.rightTab);
    }

    let ro: ResizeObserver | null = null;
    const syncAndObserve = () => {
      const el = findVisibleTourElement(step.target);
      if (el) {
        el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'nearest' });
        if (typeof ResizeObserver !== 'undefined') {
          ro?.disconnect();
          ro = new ResizeObserver(() => measure());
          ro.observe(el);
        }
      }
      measure();
    };

    // Wait one frame when switching tabs so the new tab content has committed its height
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      syncAndObserve();
      raf2 = window.requestAnimationFrame(measure);
    });
    const t = window.setTimeout(measure, 100);

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(t);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, step.id, step.target, step.rightTab, onSelectRightTab, measure]);

  // Move focus into the tour on open and restore focus to the launcher on close
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = window.requestAnimationFrame(() => {
      primaryBtnRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(raf);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [open]);

  // Keep focus inside the card if Back/Skip swaps on step change
  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    if (document.activeElement && !card.contains(document.activeElement)) {
      primaryBtnRef.current?.focus({ preventScroll: true });
    }
  }, [open, stepIdx]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const card = cardRef.current;
        if (!card) {
          e.preventDefault();
          return;
        }
        const focusables = Array.from(
          card.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !card.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (stepIdx < TOUR_STEPS.length - 1) {
          setStepIdx((i) => i + 1);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStepIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, stepIdx, onClose]);

  if (!open) return null;

  const pad = 6;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardWidth = Math.min(344, vw - 24);
  const estimatedCardHeight = 196;

  // Clamp spotlight box inside viewport bounds
  const spotTop = rect ? Math.max(6, Math.min(vh - 20, rect.top - pad)) : 0;
  const spotLeft = rect ? Math.max(6, Math.min(vw - 20, rect.left - pad)) : 0;
  const spotBottom = rect ? Math.min(vh - 6, rect.top + rect.height + pad) : 0;
  const spotRight = rect ? Math.min(vw - 6, rect.left + rect.width + pad) : 0;
  const spotWidth = Math.max(0, spotRight - spotLeft);
  const spotHeight = Math.max(0, spotBottom - spotTop);
  const hasVisibleSpotlight = Boolean(rect && spotWidth > 12 && spotHeight > 12);

  // Compute smart card position (prefer below spotlight, else above, else safely inside viewport)
  let cardStyle: React.CSSProperties;
  if (hasVisibleSpotlight && vw >= 640) {
    const spaceBelow = vh - spotBottom;
    const spaceAbove = spotTop;
    let top: number;
    if (spaceBelow >= estimatedCardHeight + 16) {
      top = spotBottom + 10;
    } else if (spaceAbove >= estimatedCardHeight + 16) {
      top = spotTop - estimatedCardHeight - 10;
    } else {
      top = Math.max(16, vh - estimatedCardHeight - 20);
    }
    top = Math.max(12, Math.min(vh - estimatedCardHeight - 12, top));

    let left = spotLeft;
    if (left + cardWidth > vw - 16) {
      left = vw - cardWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }
    cardStyle = { top, left, width: cardWidth };
  } else {
    cardStyle = {
      bottom: 16,
      left: Math.max(12, (vw - cardWidth) / 2),
      width: cardWidth,
    };
  }

  const isLast = stepIdx === TOUR_STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Quick tour step ${stepIdx + 1} of ${TOUR_STEPS.length}: ${step.title}`}
      className="no-print fixed inset-0 z-50"
    >
      {/* Clickable transparent backdrop catcher */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-transparent"
      />

      {/* Spotlight Cutout Ring */}
      {hasVisibleSpotlight ? (
        <div
          aria-hidden="true"
          style={{
            top: spotTop,
            left: spotLeft,
            width: spotWidth,
            height: spotHeight,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.48)',
          }}
          className="pointer-events-none fixed rounded-lg ring-2 ring-teal-500"
        />
      ) : (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 bg-slate-900/45"
        />
      )}

      {/* Floating Tour Card */}
      <div
        ref={cardRef}
        style={cardStyle}
        className="fixed z-10 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
            <Compass className="h-3.5 w-3.5 shrink-0" />
            <span>
              Quick Tour · {stepIdx + 1} / {TOUR_STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick tour"
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <h3 className="mt-1.5 text-sm font-bold text-slate-900">{step.title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{step.body}</p>

        {/* Progress Dots + Navigation */}
        <div className="mt-3.5 flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.map((s, idx) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIdx ? 'w-4 bg-slate-900' : 'w-1.5 bg-slate-300'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {stepIdx > 0 ? (
              <button
                type="button"
                onClick={() => setStepIdx((i) => i - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Skip
              </button>
            )}

            <button
              ref={primaryBtnRef}
              type="button"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStepIdx((i) => i + 1);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              <span>{isLast ? 'Done' : 'Next'}</span>
              {!isLast && <ArrowRight className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

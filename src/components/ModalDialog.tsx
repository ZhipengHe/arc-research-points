import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { attachDialogLightDismissFallback } from '../utils/polyfills';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  variant?: 'modal' | 'wide' | 'drawer';
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Native <dialog> modal/drawer component following modern-web-guidance `dialog`:
 * - Uses showModal() for top-layer rendering, inert page, focus management, Esc dismissal
 * - Never adds redundant role="dialog" or aria-modal
 * - Uses closedby="any" with pointerdown/pointerup fallback when closedBy is unsupported
 * - Resets dialog.returnValue on close
 */
export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  variant = 'modal',
  children,
  footer,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close('');
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onClose();
    };

    dialog.addEventListener('close', handleClose);
    const detachFallback = attachDialogLightDismissFallback(dialog);

    return () => {
      dialog.removeEventListener('close', handleClose);
      detachFallback();
    };
  }, [onClose]);

  const variantClass =
    variant === 'drawer'
      ? 'arc-dialog-drawer'
      : variant === 'wide'
        ? 'arc-dialog-wide'
        : '';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={`arc-dialog ${variantClass}`}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3.5 bg-slate-50/70 shrink-0">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900 leading-5">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500 leading-4">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close('close')}
          aria-label={`Close ${title}`}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-slate-900 cursor-pointer shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && (
        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 flex items-center justify-end gap-2 shrink-0">
          {footer}
        </div>
      )}
    </dialog>
  );
}

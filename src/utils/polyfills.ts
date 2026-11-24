/**
 * Progressive enhancement & feature-detected polyfills following modern-web-guidance:
 * - Conditional `@oddbird/popover-polyfill` when `HTMLElement.prototype.popover` is missing
 * - Conditional `interestfor` polyfill when `HTMLButtonElement.prototype.interestForElement` is missing
 * - `popover="hint"` -> `"auto"` fallback in `beforetoggle` for toggletips where `hint` is unsupported
 * - Light-dismiss pointerdown/pointerup fallback for `<dialog closedby="any">` where `closedBy` is unsupported
 */

let initialized = false;

export function initModernWebPlatformFallbacks(): void {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;

  // 1. Conditional Popover API polyfill
  if (!Object.hasOwn(HTMLElement.prototype, 'popover')) {
    void import('@oddbird/popover-polyfill');
  }

  // 2. Fallback for popover="hint" toggletips in browsers where "hint" defaults to "manual"
  try {
    const probe = document.createElement('div');
    probe.setAttribute('popover', 'hint');
    if ((probe as unknown as { popover?: string }).popover !== 'hint') {
      document.addEventListener(
        'beforetoggle',
        (event) => {
          const target = event.target as HTMLElement | null;
          const toggleEvent = event as Event & { newState?: string };
          if (!target || toggleEvent.newState !== 'open') return;
          if (
            target.getAttribute('popover') === 'hint' &&
            target.id &&
            document.querySelector(`[popovertarget="${CSS.escape(target.id)}"]`)
          ) {
            target.setAttribute('popover', 'auto');
          }
        },
        true,
      );
    }
  } catch {
    // Ignore if popover property is unavailable
  }

  // 3. Keep aria-expanded synced on toggletip triggers via capturing toggle listener
  document.addEventListener(
    'toggle',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.id) return;
      const toggleEvent = event as Event & { newState?: string };
      const isOpen = toggleEvent.newState === 'open';
      const triggers = document.querySelectorAll(
        `[interestfor="${CSS.escape(target.id)}"][popovertarget="${CSS.escape(target.id)}"]`,
      );
      triggers.forEach((trigger) => {
        trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    },
    true,
  );

  // 4. Conditional Interest Invokers polyfill
  if (!('interestForElement' in HTMLButtonElement.prototype)) {
    void import('interestfor');
  }
}

/**
 * Attaches light-dismiss fallback to a <dialog closedby="any"> when native closedBy is missing.
 * Checks pointerdown and pointerup outside the dialog bounding rect so text-selection drags
 * ending on the backdrop do not dismiss the dialog.
 */
export function attachDialogLightDismissFallback(dialog: HTMLDialogElement): () => void {
  if ('closedBy' in HTMLDialogElement.prototype) {
    return () => {};
  }

  const isOutside = (e: PointerEvent) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  let pressedOutside = false;
  const onPointerDown = (e: PointerEvent) => {
    pressedOutside = isOutside(e);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (pressedOutside && isOutside(e) && dialog.open) {
      dialog.close('');
    }
    pressedOutside = false;
  };

  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('pointerup', onPointerUp);

  return () => {
    dialog.removeEventListener('pointerdown', onPointerDown);
    dialog.removeEventListener('pointerup', onPointerUp);
  };
}

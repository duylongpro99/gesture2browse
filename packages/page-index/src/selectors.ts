/**
 * The interactable-element selector (arch §3.3) and the DOM visibility predicate.
 * Pure DOM; runs under happy-dom/jsdom (no layout, so visibility is decided from
 * computed style and attributes rather than measured size).
 */
export const INTERACTABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[role=button]',
  '[role=link]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=checkbox]',
  '[role=option]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
  'video',
].join(',');

function computedStyle(el: Element): CSSStyleDeclaration | null {
  const view = el.ownerDocument?.defaultView;
  return view ? view.getComputedStyle(el as HTMLElement) : null;
}

/**
 * An element is visible if it is not `hidden`, not `display:none`, not
 * `visibility:hidden`/`collapse`, and not fully transparent. Disabled form
 * controls are treated as not interactable.
 */
export function isVisible(el: Element): boolean {
  if (el.hasAttribute('hidden')) return false;
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const s = computedStyle(el);
  if (s) {
    if (s.display === 'none') return false;
    if (s.visibility === 'hidden' || s.visibility === 'collapse') return false;
    if (s.opacity !== '' && Number(s.opacity) === 0) return false;
  }
  return true;
}

/** ARIA role, explicit or derived from the tag (arch §3.3 id scheme). */
export function roleOf(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'a':
      return 'link';
    case 'button':
      return 'button';
    case 'select':
      return 'combobox';
    case 'textarea':
      return 'textbox';
    case 'video':
      return 'video';
    case 'input': {
      const type = (el as HTMLInputElement).type;
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
      return 'textbox';
    }
    default:
      return tag;
  }
}

/** Best-effort accessible name (arch §3.3): aria-label, text, then value/placeholder/title/alt. */
export function nameOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();
  const text = el.textContent?.trim();
  if (text) return text;
  const he = el as HTMLInputElement;
  const value = he.value;
  if (value?.trim()) return value.trim();
  return (
    el.getAttribute('placeholder')?.trim() ??
    el.getAttribute('title')?.trim() ??
    el.getAttribute('alt')?.trim() ??
    ''
  );
}

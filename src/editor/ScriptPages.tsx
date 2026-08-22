// The script, laid out on real pages instead of one endless sheet.
//
// Breaks are measured, not estimated: after every render the height each
// element actually occupies is read back and the breaks recomputed. That
// costs one layout pass per edit, which is what buys a page count a writer
// can trust — in this trade, "1 page ≈ 1 minute of screen time" is the whole
// point of the feature.
//
// Elements are never split mid-paragraph; a block that doesn't fit starts the
// next page. See pageStarts() for why.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ElementType, ScriptElement } from '../model/types';
import { ELEMENT_TYPES } from '../model/types';
import { PAGE_CONTENT_PX, pageStarts, type ElementBox } from '../model/pagination';

interface Props {
  elements: ScriptElement[];
  /** Hidden (but still mounted) when another view is on screen, so print
   * always has the pages. */
  hidden: boolean;
  renderElement: (element: ScriptElement) => ReactNode;
  onPageMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Reports the breaks so the sidebar's page list matches what's drawn. */
  onPageStartsChange: (starts: number[]) => void;
}

function same(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The top margin the stylesheet gives each element type, read once from a
 * hidden probe rather than from the live elements — see measure(). The probe
 * carries a spacer first so the measured rows are never a :first-child, which
 * is exactly the case whose margin is suppressed. */
let cachedMargins: Record<ElementType, number> | null = null;

function marginsByType(container: HTMLElement): Record<ElementType, number> {
  if (cachedMargins) return cachedMargins;

  const probe = document.createElement('div');
  probe.className = 'page';
  probe.style.cssText =
    'position:absolute;visibility:hidden;height:0;overflow:hidden;padding:0;min-height:0';
  probe.innerHTML = '<div class="el-wrap"><div class="el"></div></div>';

  const rows = ELEMENT_TYPES.map((type) => {
    const wrap = document.createElement('div');
    wrap.className = 'el-wrap';
    const el = document.createElement('div');
    el.className = `el el-${type}`;
    wrap.appendChild(el);
    probe.appendChild(wrap);
    return [type, el] as const;
  });

  container.appendChild(probe);
  const margins = Object.fromEntries(
    rows.map(([type, el]) => [type, parseFloat(getComputedStyle(el).marginTop) || 0])
  ) as Record<ElementType, number>;
  probe.remove();

  cachedMargins = margins;
  return margins;
}

export default function ScriptPages({
  elements,
  hidden,
  renderElement,
  onPageMouseDown,
  onPageStartsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [starts, setStarts] = useState<number[]>([0]);
  const startsRef = useRef(starts);
  startsRef.current = starts;
  /** The split before the current one, to catch an A→B→A flip. */
  const previousStarts = useRef<number[]>([]);

  // When the breaks move, the element being typed in can land in a different
  // page container — React then unmounts it there and mounts it here, and the
  // caret is gone mid-word. The caret is therefore noted before the re-split
  // and put back after it, so crossing a page boundary while writing is
  // invisible.
  const pendingCaret = useRef<{ id: string; offset: number } | null>(null);

  const noteCaret = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    const wrap = active?.closest('[data-el-id]');
    if (!wrap || !active?.isContentEditable) return;
    const sel = window.getSelection();
    pendingCaret.current = {
      id: wrap.getAttribute('data-el-id') ?? '',
      offset: sel && sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0,
    };
  }, []);

  const restoreCaret = useCallback(() => {
    const target = pendingCaret.current;
    pendingCaret.current = null;
    if (!target) return;

    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-el-id="${CSS.escape(target.id)}"] > .el`
    );
    if (!el || document.activeElement === el) return;

    el.focus();
    const node = el.firstChild;
    const range = document.createRange();
    if (node && node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, Math.min(target.offset, node.textContent?.length ?? 0));
    } else {
      range.selectNodeContents(el);
    }
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const measure = useCallback(() => {
    const container = containerRef.current;
    // A hidden container measures zero and would collapse the script to a
    // single page; keep the last good breaks until it's back on screen.
    if (!container || container.offsetParent === null) return;

    const nodes = [...container.querySelectorAll('[data-el-id] > .el')];
    if (nodes.length === 0 || nodes.length !== elements.length) return;

    // Heights come from the DOM; the gaps come from the stylesheet. Reading a
    // rendered margin here would feed back on itself — the CSS drops the top
    // margin of whichever element opens a page, so the measurement would
    // depend on the break it is being used to decide, and the two would flip
    // back and forth forever.
    const margins = marginsByType(container);
    const boxes: ElementBox[] = nodes.map((node, i) => ({
      height: (node as HTMLElement).offsetHeight,
      marginTop: margins[elements[i].type] ?? 0,
    }));

    const next = pageStarts(boxes, PAGE_CONTENT_PX);
    if (same(next, startsRef.current)) return;
    // Belt and braces: if a break ever does start oscillating, settle on one
    // answer rather than re-rendering forever.
    if (same(next, previousStarts.current)) return;

    previousStarts.current = startsRef.current;
    noteCaret();
    setStarts(next);
    onPageStartsChange(next);
  }, [elements, noteCaret, onPageStartsChange]);

  // Layout effects, not effects: the re-flow into pages and the caret going
  // back must both happen before the browser paints, or the caret visibly
  // jumps as the pages reshuffle under it.
  useLayoutEffect(() => {
    restoreCaret();
    measure();
  });

  // Wrapping changes with the width, and so do the breaks.
  useLayoutEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  const pages: ScriptElement[][] = starts.map((start, i) =>
    elements.slice(start, starts[i + 1] ?? elements.length)
  );

  return (
    <div ref={containerRef} className={hidden ? 'print-only' : undefined}>
      {pages.map((pageElements, i) => (
        <div
          // Keyed by the element that opens the page, so pages before an
          // edit keep their identity when the breaks below them move.
          key={pageElements[0]?.id ?? i}
          className="page script-page"
          onMouseDown={onPageMouseDown}
        >
          {/* Screenplays leave page 1 unnumbered; the rest carry the number
              top-right, inside the margin. */}
          {i > 0 && <span className="page-number">{i + 1}.</span>}
          {pageElements.map(renderElement)}
        </div>
      ))}
    </div>
  );
}

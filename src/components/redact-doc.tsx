import { useEffect, useRef, useState } from "react";
import { segmentText } from "@/lib/phi/redact";
import { applyManualRedaction, findLikeThis, keepSpan, offsetsFromSelection, type TextRange } from "@/lib/phi/manual";
import { CATEGORY_LABEL, REDACT_MENU_CATEGORIES, type PhiCategory, type PhiSpan } from "@/lib/phi/types";
import { cn } from "@/lib/utils";

type MenuState = {
  x: number;
  y: number;
  range: TextRange;
  spanId: string | null;
  othersCount: number;
  category: PhiCategory | null;
};

export function RedactDoc({
  text,
  spans,
  onChange,
}: {
  text: string;
  spans: PhiSpan[];
  onChange: (spans: PhiSpan[]) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const pressTimer = useRef<number | null>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function openMenu(event: { clientX: number; clientY: number; preventDefault: () => void }, spanId: string | null) {
    const root = rootRef.current;
    if (!root) return;
    const fromSelection = offsetsFromSelection(root);
    let range: TextRange | null = fromSelection;
    if (!range && spanId) {
      const span = spans.find((item) => item.id === spanId);
      if (span) range = { start: span.start, end: span.end, text: span.text };
    }
    if (!range) return;
    event.preventDefault();
    const others = findLikeThis(text, range.text).length;
    const pad = 8;
    const x = Math.min(event.clientX, window.innerWidth - 240);
    const y = Math.min(event.clientY, window.innerHeight - 320);
    const existing = spanId ? spans.find((item) => item.id === spanId) : null;
    setMenu({
      x: Math.max(pad, x),
      y: Math.max(pad, y),
      range,
      spanId,
      othersCount: Math.max(0, others),
      category: existing?.category ?? null,
    });
  }

  function redact(others: boolean) {
    if (!menu?.category) return;
    onChange(applyManualRedaction({ text, spans, range: menu.range, category: menu.category, others }));
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  }

  const segments = segmentText(text, spans);

  return (
    <div className="relative">
      <p className="mb-2 text-sm text-muted">
        This is the original chart. Highlight leftover identifiers, then right-click (or press and hold). Choose a
        category, then this occurrence or every match like it. Switch to Redacted to see the tokens that get copied
        and sent.
      </p>
      <div
        ref={rootRef}
        data-testid="chart"
        className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 font-mono text-xs leading-relaxed text-ink shadow-soft select-text sm:text-sm"
        onContextMenu={(event) => {
          const spanId =
            (event.target as HTMLElement).closest("[data-span-id]")?.getAttribute("data-span-id") ?? null;
          openMenu(event, spanId);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "touch") return;
          const spanId =
            (event.target as HTMLElement).closest("[data-span-id]")?.getAttribute("data-span-id") ?? null;
          pressTimer.current = window.setTimeout(() => {
            openMenu(event, spanId);
          }, 520);
        }}
        onPointerUp={() => {
          if (pressTimer.current) window.clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }}
        onPointerMove={() => {
          if (pressTimer.current) {
            window.clearTimeout(pressTimer.current);
            pressTimer.current = null;
          }
        }}
      >
        {segments.map((segment, index) =>
          segment.span ? (
            <mark
              key={segment.span.id + index}
              data-span-id={segment.span.id}
              title={`${CATEGORY_LABEL[segment.span.category]} · right-click to change`}
              className={cn(
                "rounded-xs px-0.5",
                segment.span.accepted ? "bg-phi-soft text-phi" : "bg-mist text-muted",
              )}
            >
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </div>

      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 w-56 rounded-md border border-line bg-paper py-2 shadow-soft"
          style={{ left: menu.x, top: menu.y }}
        >
          <p className="truncate px-3 pb-1 text-xs text-muted">“{menu.range.text.trim().slice(0, 48)}”</p>
          <p className="px-3 pb-2 text-[11px] uppercase tracking-wide text-subtle">1. Category</p>
          <div className="max-h-52 overflow-auto">
            {REDACT_MENU_CATEGORIES.map((category) => (
              <div key={category} className="px-1">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "flex h-9 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-mist",
                    menu.category === category && "bg-accent-soft text-accent",
                  )}
                  onClick={() => setMenu({ ...menu, category })}
                >
                  {CATEGORY_LABEL[category]}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1 border-t border-line px-1 pt-1">
            <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-subtle">2. Apply</p>
            <button
              type="button"
              role="menuitem"
              disabled={!menu.category}
              className="flex h-10 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-mist disabled:opacity-40"
              onClick={() => redact(false)}
            >
              This occurrence
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!menu.category || menu.othersCount < 2}
              className="flex h-10 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-mist disabled:opacity-40"
              onClick={() => redact(true)}
            >
              Others like this ({Math.max(menu.othersCount, 1)})
            </button>
            {menu.spanId ? (
              <button
                type="button"
                role="menuitem"
                className="flex h-10 w-full items-center rounded-sm px-2 text-left text-sm hover:bg-mist"
                onClick={() => {
                  onChange(keepSpan(spans, menu.spanId as string));
                  setMenu(null);
                }}
              >
                Keep this text
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

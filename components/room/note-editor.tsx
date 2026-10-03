"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { jsonStatus } from "@/lib/beautify";
import { BODY_MAX_LENGTH, TITLE_MAX_LENGTH } from "@/lib/notes";
import type { NoteView } from "@/lib/sync/room-engine";
import { formatRelative } from "@/lib/use-client-value";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClass } from "@/components/ui/button";
import { ArrowLeftIcon, TrashIcon, WandIcon } from "@/components/ui/icons";

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * When another device changes the text you're focused on, keep your caret
 * where it was relative to the surrounding text instead of jumping to the end.
 */
function usePreservedCaret(ref: RefObject<Field | null>, value: string) {
  const last = useRef({ value, start: 0, end: 0 });

  const record = () => {
    const el = ref.current;
    if (el) {
      last.current = {
        value: el.value,
        start: el.selectionStart ?? 0,
        end: el.selectionEnd ?? 0,
      };
    }
  };

  useLayoutEffect(() => {
    const el = ref.current;
    const prev = last.current;
    if (el && prev.value !== value && document.activeElement === el) {
      let prefix = 0;
      const max = Math.min(prev.value.length, value.length);
      while (prefix < max && prev.value[prefix] === value[prefix]) prefix++;
      const delta = value.length - prev.value.length;
      const map = (pos: number) => (pos <= prefix ? pos : Math.max(prefix, pos + delta));
      el.setSelectionRange(map(prev.start), map(prev.end));
    }
    record();
  });

  return record;
}

function SaveState({ note, now, short = false }: { note: NoteView; now: number; short?: boolean }) {
  if (note.failed) {
    return <span className="text-warning">{short ? "Not synced" : "Not synced — retrying"}</span>;
  }
  if (note.unsaved) return <span>Saving…</span>;
  return <span>{short ? "Saved" : `Saved ${formatRelative(note.updatedAt, now)}`}</span>;
}

function JsonBadge({ body }: { body: string }) {
  // Deferred so checking big notes never slows down typing.
  const deferred = useDeferredValue(body);
  const status = useMemo(() => jsonStatus(deferred), [deferred]);
  if (status === "none") return null;
  return status === "valid" ? (
    <span className="rounded-md bg-success-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-success">
      JSON
    </span>
  ) : (
    <span
      className="rounded-md bg-danger-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-danger"
      title="This looks like JSON but has a syntax error. Tap Beautify to see where."
    >
      JSON error
    </span>
  );
}

export function NoteEditor({
  note,
  now,
  autoFocus,
  onChange,
  onDelete,
  onBack,
  onBeautify,
}: {
  note: NoteView;
  now: number;
  autoFocus: "title" | "body" | null;
  onChange: (patch: { title?: string; body?: string }) => void;
  onDelete: () => void;
  onBack: () => void;
  onBeautify: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const recordTitle = usePreservedCaret(titleRef, note.title);
  const recordBody = usePreservedCaret(bodyRef, note.body);

  useEffect(() => {
    if (autoFocus === "title") titleRef.current?.focus();
    if (autoFocus === "body") bodyRef.current?.focus();
  }, [autoFocus, note.id]);

  const chars = note.body.length;
  const lines = note.body ? note.body.split("\n").length : 0;
  const nearLimit = chars > BODY_MAX_LENGTH * 0.9;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:rounded-3xl lg:border lg:border-line lg:shadow-card"
      aria-label="Note editor"
    >
      {/* Top bar: back (phones), save state, JSON badge, Beautify, delete (phones). */}
      <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line px-2 keyboard-open:h-12 lg:px-4">
        <button type="button" onClick={onBack} className={buttonClass("ghost", "md", "px-3 lg:hidden")}>
          <ArrowLeftIcon />
          Notes
        </button>
        <span className="hidden text-xs text-ink-3 lg:inline">
          <SaveState note={note} now={now} />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-ink-3 lg:hidden">
            <SaveState note={note} now={now} short />
          </span>
          <JsonBadge body={note.body} />
          <button
            type="button"
            onClick={onBeautify}
            disabled={!note.body.trim()}
            className={buttonClass("secondary", "sm", "h-10 px-2.5 min-[400px]:px-3 lg:h-9")}
            title="Beautify: format JSON and tidy spacing"
          >
            <WandIcon />
            <span className="max-[399px]:sr-only">Beautify</span>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={buttonClass("danger", "icon", "lg:hidden")}
            aria-label="Delete note"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <input
        ref={titleRef}
        value={note.title}
        onChange={(event) => {
          onChange({ title: event.target.value });
          recordTitle();
        }}
        onSelect={recordTitle}
        maxLength={TITLE_MAX_LENGTH}
        placeholder="Untitled"
        aria-label="Note title"
        enterKeyHint="next"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            bodyRef.current?.focus();
          }
        }}
        className="w-full shrink-0 bg-transparent px-5 pt-5 text-xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-3 keyboard-open:pt-3 keyboard-open:text-lg sm:px-7 sm:pt-7 sm:text-2xl"
      />
      <textarea
        ref={bodyRef}
        value={note.body}
        onChange={(event) => {
          onChange({ body: event.target.value });
          recordBody();
        }}
        onSelect={recordBody}
        maxLength={BODY_MAX_LENGTH}
        placeholder="Paste or type anything. It appears on your other devices as you type."
        aria-label="Note text"
        spellCheck={false}
        className="min-h-0 w-full flex-1 resize-none overscroll-contain bg-transparent px-5 pb-6 pt-3 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 keyboard-open:pb-3 sm:px-7 lg:text-[15px] lg:leading-7"
      />

      <footer className="flex shrink-0 flex-col gap-3 border-t border-line bg-surface/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur keyboard-open:py-2 sm:flex-row sm:items-center sm:px-5 lg:pb-3">
        <div className="hidden min-w-0 items-center gap-3 text-xs text-ink-3 sm:flex">
          <span className={nearLimit ? "text-warning" : undefined}>
            {chars.toLocaleString()}
            {nearLimit ? ` / ${BODY_MAX_LENGTH.toLocaleString()}` : ""} characters · {lines}{" "}
            {lines === 1 ? "line" : "lines"}
          </span>
          <span className="truncate">
            <SaveState note={note} now={now} />
          </span>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <button
            type="button"
            onClick={onDelete}
            className={buttonClass("danger", "lg", "max-lg:hidden")}
          >
            <TrashIcon />
            Delete
          </button>
          <CopyButton
            text={note.body}
            label="Copy text"
            variant="primary"
            size="lg"
            disabled={!note.body}
            className="h-14 flex-1 text-base keyboard-open:h-11 sm:h-12 sm:flex-none sm:px-7"
          />
        </div>
      </footer>
    </section>
  );
}

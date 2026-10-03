"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { BODY_MAX_LENGTH, TITLE_MAX_LENGTH } from "@/lib/notes";
import type { NoteView } from "@/lib/sync/room-engine";
import { formatRelative } from "@/lib/use-client-value";
import { CopyButton } from "@/components/ui/copy-button";
import { buttonClass } from "@/components/ui/button";
import { ArrowLeftIcon, TrashIcon } from "@/components/ui/icons";

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

function SaveState({ note, now }: { note: NoteView; now: number }) {
  if (note.failed) {
    return <span className="text-warning">Not synced — retrying</span>;
  }
  if (note.unsaved) return <span>Saving…</span>;
  return <span>Saved {formatRelative(note.updatedAt, now)}</span>;
}

export function NoteEditor({
  note,
  now,
  autoFocus,
  onChange,
  onDelete,
  onBack,
}: {
  note: NoteView;
  now: number;
  autoFocus: "title" | "body" | null;
  onChange: (patch: { title?: string; body?: string }) => void;
  onDelete: () => void;
  onBack: () => void;
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
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 lg:hidden">
        <button type="button" onClick={onBack} className={buttonClass("ghost", "md", "px-3")}>
          <ArrowLeftIcon />
          Notes
        </button>
        <span className="ml-auto text-xs text-ink-3">
          <SaveState note={note} now={now} />
        </span>
        <button
          type="button"
          onClick={onDelete}
          className={buttonClass("danger", "icon")}
          aria-label="Delete note"
        >
          <TrashIcon />
        </button>
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
        className="w-full shrink-0 bg-transparent px-5 pt-5 text-xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-3 sm:px-7 sm:pt-7 sm:text-2xl"
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
        className="min-h-0 w-full flex-1 resize-none bg-transparent px-5 pb-6 pt-3 text-base leading-relaxed text-ink outline-none placeholder:text-ink-3 sm:px-7 lg:text-[15px] lg:leading-7"
      />

      <footer className="flex shrink-0 flex-col gap-3 border-t border-line bg-surface/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:flex-row sm:items-center sm:px-5 lg:pb-3">
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
            className={buttonClass("danger", "lg", "hidden lg:inline-flex")}
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
            className="h-14 flex-1 text-base sm:h-12 sm:flex-none sm:px-7"
          />
        </div>
      </footer>
    </section>
  );
}

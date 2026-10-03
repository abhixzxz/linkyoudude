"use client";

import type { NoteView } from "@/lib/sync/room-engine";
import { formatRelative } from "@/lib/use-client-value";
import { CopyButton } from "@/components/ui/copy-button";

export function noteDisplayTitle(note: Pick<NoteView, "title" | "body">) {
  if (note.title.trim()) return { text: note.title, fallback: false };
  const firstLine = note.body.split("\n").find((line) => line.trim());
  return { text: firstLine?.trim().slice(0, 120) || "Untitled", fallback: true };
}

function preview(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 240);
}

function NoteState({ note, now }: { note: NoteView; now: number }) {
  if (note.failed) return <span className="text-warning">Not synced yet</span>;
  if (note.unsaved) return <span className="text-ink-3">Saving…</span>;
  return <span className="text-ink-3">{formatRelative(note.updatedAt, now)}</span>;
}

export function NoteList({
  notes,
  activeId,
  now,
  onSelect,
}: {
  notes: NoteView[];
  activeId: string | null;
  now: number;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Notes">
      {notes.map((note) => {
        const title = noteDisplayTitle(note);
        const active = note.id === activeId;
        const body = preview(note.body);
        return (
          <li
            key={note.id}
            className={`group relative rounded-2xl border bg-surface shadow-card transition-colors ${
              active
                ? "border-accent/50 ring-1 ring-accent/30 lg:bg-accent-soft/40"
                : "border-line hover:border-line-strong"
            }`}
          >
            {/* Full-card hit target; the Copy button sits above it. */}
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              className="focus-ring absolute inset-0 rounded-2xl"
              aria-label={`Open note: ${title.text}`}
              aria-current={active ? "true" : undefined}
            />
            <div className="pointer-events-none relative p-4">
              <h3
                className={`truncate text-[15px] font-semibold tracking-tight ${
                  title.fallback ? "text-ink-2" : "text-ink"
                }`}
              >
                {title.text}
              </h3>
              {body && !(title.fallback && body === title.text) ? (
                <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-ink-2">
                  {body}
                </p>
              ) : !body ? (
                <p className="mt-1 text-sm italic text-ink-3">Empty note</p>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="truncate text-xs">
                  <NoteState note={note} now={now} />
                </span>
                <CopyButton
                  text={note.body}
                  size="sm"
                  disabled={!note.body}
                  ariaLabel={`Copy text of ${title.text}`}
                  className="pointer-events-auto h-10 min-w-[5.5rem] lg:h-9"
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

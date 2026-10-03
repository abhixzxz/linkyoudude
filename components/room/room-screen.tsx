"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readClipboardText } from "@/lib/clipboard";
import { forgetRoom, rememberRoom } from "@/lib/recent-rooms";
import { roomPath } from "@/lib/room-id";
import { useRoomEngine } from "@/lib/use-room-engine";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { useNow, useOrigin } from "@/lib/use-client-value";
import { buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ClipboardIcon, PlusIcon } from "@/components/ui/icons";
import { ToastStack, type Toast } from "@/components/ui/toasts";
import { InstallHint } from "@/components/pwa/install-hint";
import { NoteEditor } from "./note-editor";
import { NoteList, noteDisplayTitle } from "./note-list";
import { RoomHeader } from "./room-header";
import {
  EmptyRoom,
  RoomError,
  RoomLoading,
  RoomNotConfigured,
  RoomNotFound,
} from "./room-states";
import { ShareDialog } from "./share-dialog";

const DESKTOP_QUERY = "(min-width: 1024px)";
let toastSeq = 0;

export function RoomScreen({ roomId }: { roomId: string }) {
  const { engine, view } = useRoomEngine(roomId);
  useVisualViewport();
  const origin = useOrigin();
  const now = useNow();
  const inviteLink = origin ? `${origin}${roomPath(roomId)}` : "";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileEditing, setMobileEditing] = useState(false);
  const [focusField, setFocusField] = useState<"title" | "body" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [localToasts, setLocalToasts] = useState<Toast[]>([]);

  const { notes, status } = view;
  const selectedNote = notes.find((note) => note.id === selectedId) ?? null;
  // Desktop always shows a note; phones show the list until one is opened.
  const activeNote = selectedNote ?? notes[0] ?? null;
  const editingOnPhone = mobileEditing && selectedNote !== null;

  // Remember rooms opened on this device so the home screen can list them.
  useEffect(() => {
    if (status === "ready") rememberRoom(roomId);
    if (status === "not_found") forgetRoom(roomId);
  }, [status, roomId]);

  // If the open note's unsaved text was moved into a new note (conflict or
  // remote delete), follow it so the text stays on screen.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeNote?.id ?? null;
  });
  useEffect(
    () =>
      engine.onRedirect((from, to) => {
        if (from === activeIdRef.current) setSelectedId(to);
      }),
    [engine],
  );

  // The phone's back button closes the editor instead of leaving the room.
  useEffect(() => {
    const onPopState = () => setMobileEditing(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Warn before closing the tab while edits are still on their way.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (engine.hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [engine]);

  const openNote = useCallback((id: string, focus: "title" | "body" | null = null) => {
    setSelectedId(id);
    setFocusField(focus);
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      if (!window.history.state?.lydEditor) {
        window.history.pushState({ lydEditor: true }, "");
      }
      setMobileEditing(true);
    }
  }, []);

  const closeEditor = useCallback(() => {
    if (window.history.state?.lydEditor) window.history.back();
    else setMobileEditing(false);
  }, []);

  const toast = useCallback((tone: Toast["tone"], message: string) => {
    const id = `local-${++toastSeq}`;
    setLocalToasts((list) => [...list.slice(-2), { id, tone, message }]);
  }, []);

  const newNote = useCallback(() => {
    openNote(engine.createNote(), "body");
  }, [engine, openNote]);

  const pasteAsNote = useCallback(async () => {
    const text = await readClipboardText();
    if (text) {
      openNote(engine.createNote({ body: text }));
      toast("success", "Pasted from your clipboard");
    } else {
      openNote(engine.createNote(), "body");
      toast(
        "info",
        "Couldn't read the clipboard here. Paste into the note with Ctrl+V / ⌘V or long-press → Paste.",
      );
    }
  }, [engine, openNote, toast]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    engine.deleteNote(pendingDelete);
    setPendingDelete(null);
    if (pendingDelete === activeNote?.id) closeEditor();
  }, [engine, pendingDelete, activeNote, closeEditor]);

  const toasts = useMemo<Toast[]>(
    () => [...view.notices, ...localToasts],
    [view.notices, localToasts],
  );
  const dismissToast = useCallback(
    (id: Toast["id"]) => {
      if (typeof id === "number") engine.dismissNotice(id);
      else setLocalToasts((list) => list.filter((item) => item.id !== id));
    },
    [engine],
  );

  const pendingDeleteNote = notes.find((note) => note.id === pendingDelete);
  const showRoom = status === "ready";

  return (
    // App shell pinned to the visible viewport: the page never scrolls, only
    // the notes list and the note text do, and it shrinks above the keyboard.
    <div className="fixed inset-x-0 top-[var(--vv-top,0px)] flex h-[var(--vv-height,100dvh)] flex-col overflow-hidden">
      <RoomHeader
        roomId={roomId}
        inviteLink={inviteLink}
        connection={showRoom ? view.connection : undefined}
        devices={view.devices}
        onShare={() => setShareOpen(true)}
        showRoomControls={status !== "not_found"}
        className={editingOnPhone ? "hidden lg:block" : ""}
      />

      {!showRoom && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {status === "loading" && <RoomLoading />}
          {status === "not_found" && <RoomNotFound roomId={roomId} />}
          {status === "error" && <RoomError message={view.errorMessage} onRetry={() => engine.retry()} />}
          {status === "not_configured" && <RoomNotConfigured message={view.errorMessage} />}
        </div>
      )}

      {showRoom && (
        <>
          {(view.connection === "offline" || view.sync === "unsynced") && (
            <div
              role="status"
              className={`shrink-0 border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-[13px] leading-snug text-ink sm:px-6 ${
                editingOnPhone ? "pt-[max(0.5rem,env(safe-area-inset-top))] lg:pt-2" : ""
              }`}
            >
              {view.connection === "offline" ? "You're offline. " : "Some changes haven't synced yet. "}
              <span className="hidden sm:inline">Your edits are kept on this device and will sync automatically. </span>
              <button
                type="button"
                onClick={() => engine.retry()}
                className="focus-ring rounded font-semibold text-accent underline-offset-2 hover:underline"
              >
                Retry now
              </button>
            </div>
          )}

          <main className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 lg:gap-5 lg:px-6 lg:py-5">
            {/* Notes list: sidebar on desktop, the main view on phones. */}
            <aside
              className={`min-h-0 w-full flex-col lg:flex lg:w-[22rem] lg:shrink-0 ${
                editingOnPhone ? "hidden" : "flex"
              }`}
            >
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 lg:-mx-1 lg:px-1 lg:py-1">
                {!view.synced && notes.length > 0 && (
                  <p className="mb-3 text-center text-xs text-ink-3">Showing saved copy · syncing…</p>
                )}
                {notes.length > 0 ? (
                  <NoteList
                    notes={notes}
                    activeId={activeNote?.id ?? null}
                    now={now}
                    onSelect={(id) => openNote(id)}
                  />
                ) : (
                  <div className="flex min-h-full flex-col lg:hidden">
                    <EmptyRoom
                      roomId={roomId}
                      onNewNote={newNote}
                      onPaste={pasteAsNote}
                      onShare={() => setShareOpen(true)}
                    />
                  </div>
                )}
                {notes.length > 0 && (
                  <div className="mt-4">
                    <InstallHint compact />
                  </div>
                )}
              </div>

              {/* Phones: thumb-reachable bottom bar. Desktop: top of the sidebar. */}
              <div
                className={`shrink-0 gap-2 border-t border-line bg-bg/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6 lg:order-first lg:flex lg:border-0 lg:bg-transparent lg:px-0 lg:pb-3 lg:pt-0 lg:backdrop-blur-none ${
                  notes.length === 0 ? "hidden" : "flex"
                }`}
              >
                <button
                  type="button"
                  onClick={pasteAsNote}
                  className={buttonClass("secondary", "md", "h-12 flex-1 lg:order-last lg:h-11")}
                >
                  <ClipboardIcon />
                  Paste
                </button>
                <button
                  type="button"
                  onClick={newNote}
                  className={buttonClass("primary", "md", "h-12 flex-1 lg:h-11")}
                >
                  <PlusIcon />
                  New note
                </button>
              </div>
            </aside>

            {/* Editor */}
            <div
              className={`min-h-0 flex-1 flex-col ${
                editingOnPhone ? "flex lg:pt-0" : "hidden lg:flex"
              } ${editingOnPhone && view.connection !== "offline" && view.sync !== "unsynced" ? "pt-[env(safe-area-inset-top)]" : ""}`}
            >
              {activeNote ? (
                <NoteEditor
                  key={activeNote.id}
                  note={activeNote}
                  now={now}
                  autoFocus={activeNote.id === selectedId ? focusField : null}
                  onChange={(patch) => engine.editNote(activeNote.id, patch)}
                  onDelete={() => setPendingDelete(activeNote.id)}
                  onBack={closeEditor}
                />
              ) : (
                <EmptyRoom
                  roomId={roomId}
                  onNewNote={newNote}
                  onPaste={pasteAsNote}
                  onShare={() => setShareOpen(true)}
                />
              )}
            </div>
          </main>
        </>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomId={roomId}
        inviteLink={inviteLink}
      />

      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this note?"
      >
        <p className="text-[15px] leading-relaxed text-ink-2">
          {pendingDeleteNote ? (
            <>
              <span className="font-medium text-ink">
                &ldquo;{noteDisplayTitle(pendingDeleteNote).text}&rdquo;
              </span>{" "}
              will be removed from every device in this room.
            </>
          ) : (
            "This note will be removed from every device in this room."
          )}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            className={buttonClass("secondary", "lg")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            className={buttonClass("primary", "lg", "!bg-danger !text-white hover:!bg-danger/90")}
          >
            Delete
          </button>
        </div>
      </Dialog>

      <ToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        className={editingOnPhone ? "bottom-24" : notes.length > 0 ? "bottom-[5.5rem]" : "bottom-4"}
      />
    </div>
  );
}

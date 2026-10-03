import {
  BODY_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  parseNote,
  parseRoomSnapshot,
  sanitizeText,
  type Note,
  type RoomEvent,
} from "@/lib/notes";
import { uuid } from "@/lib/uuid";
import { merge3, sameContent, type Content } from "./merge";

/*
 * RoomEngine keeps one room in sync between this tab, the API, and every other
 * connected device.
 *
 * - The server is authoritative. Every note carries a version number, and an
 *   edit is only accepted if it was based on the current version
 *   (compare-and-set), so a stale edit can never overwrite a newer one.
 * - Local edits live in `draft` until the server confirms them. Saves are
 *   debounced while typing and serialized per note (one request in flight).
 * - When a newer server copy arrives (socket, resync, or a rejected save), the
 *   draft is rebased onto it with a three-way merge. If both sides changed the
 *   same field, the server copy wins in place and the local text is kept as a
 *   new "conflicting copy" note. Unsaved text is never dropped silently.
 * - Network failures are retried with backoff, and unsaved drafts are cached
 *   in localStorage so they survive a reload while offline.
 */

export type RoomStatus =
  | "loading"
  | "ready"
  | "not_found"
  | "error"
  | "not_configured";
export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";
export type SyncState = "saved" | "saving" | "unsynced";

export type Device = { clientId: string; label: string; self: boolean };
export type Notice = {
  id: number;
  tone: "info" | "warning" | "error";
  message: string;
};

export type NoteView = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string | null;
  /** Has local changes the server hasn't confirmed yet. */
  unsaved: boolean;
  saving: boolean;
  failed: boolean;
};

export type RoomView = {
  roomId: string;
  status: RoomStatus;
  errorMessage: string | null;
  /** Why the room disappeared while open: deleted by its creator's room limit. */
  goneReason: "closed" | null;
  connection: ConnectionState;
  sync: SyncState;
  /** False until the first server snapshot arrives (may be showing cache). */
  synced: boolean;
  devices: Device[];
  notes: NoteView[];
  notices: Notice[];
};

export type RealtimeHandlers = {
  onStatus: (status: "subscribed" | "disconnected") => void;
  onEvent: (event: RoomEvent) => void;
  onPresence: (devices: Device[]) => void;
};

export type RealtimeConnection = {
  close: () => void;
  /** Called when the page becomes visible again, to revive a dozing socket. */
  wake: () => void;
};

export type RealtimeFactory = (
  roomId: string,
  clientId: string,
  handlers: RealtimeHandlers,
) => RealtimeConnection | null;

type EngineOptions = {
  realtime?: RealtimeFactory;
  fetch?: typeof fetch;
  storage?: Storage | null;
  clientId?: string;
};

type Entry = {
  id: string;
  /** Last copy confirmed by the server; null until the note is created there. */
  server: Note | null;
  /** Unsaved local content, based on `server`. Null when in sync. */
  draft: Content | null;
  createdAt: string;
  deleting: boolean;
  /** A create request was sent at least once, so the note may exist remotely. */
  createAttempted: boolean;
  inflight: boolean;
  /** Newest server change that arrived while a request was in flight. */
  incoming: Note | "deleted" | null;
  lastSent: Content | null;
  lastEditAt: number;
  firstUnsavedEditAt: number | null;
  /** Resync counter value when `server` was last confirmed. */
  confirmedAt: number;
  failed: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type PersistedRoom = {
  v: 1;
  notes: Array<{
    id: string;
    server: Note | null;
    draft: Content | null;
    createdAt: string;
    deleting: boolean;
  }>;
};

type ApiResult =
  | { kind: "ok"; status: number; data: Record<string, unknown> | null }
  | { kind: "http"; status: number; data: Record<string, unknown> | null }
  | { kind: "network" };

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 1_200;
const REQUEST_TIMEOUT_MS = 15_000;
const FALLBACK_POLL_MS = 10_000;
const MAX_NOTICES = 3;

export const storageKey = (roomId: string) => `lyd:room:${roomId}:v1`;

function emptyEntry(id: string, createdAt: string): Entry {
  return {
    id,
    server: null,
    draft: null,
    createdAt,
    deleting: false,
    createAttempted: false,
    inflight: false,
    incoming: null,
    lastSent: null,
    lastEditAt: 0,
    firstUnsavedEditAt: null,
    confirmedAt: 0,
    failed: false,
    timer: null,
  };
}

function contentOf(entry: Entry): Content {
  return entry.draft ?? entry.server ?? { title: "", body: "" };
}

function hasPendingWork(entry: Entry): boolean {
  return entry.deleting || entry.server === null || entry.draft !== null;
}

function copyTitle(title: string): string {
  const suffix = " (conflicting copy)";
  const base = title.trim() ? title : "Untitled";
  return base.slice(0, TITLE_MAX_LENGTH - suffix.length) + suffix;
}

export class RoomEngine {
  readonly roomId: string;
  readonly clientId: string;

  private entries = new Map<string, Entry>();
  private tombstones = new Set<string>();
  private redirectListeners = new Set<(from: string, to: string) => void>();
  private status: RoomStatus = "loading";
  private errorMessage: string | null = null;
  private goneReason: "closed" | null = null;
  private socketLive = false;
  private everSubscribed = false;
  private online = true;
  private synced = false;
  private devices: Device[] = [];
  private notices: Notice[] = [];
  private noticeSeq = 0;

  private resyncTick = 0;
  private resyncRunning = false;
  private resyncQueued = false;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private realtime: RealtimeConnection | null = null;
  private disposed = false;
  private hydrated = false;
  private detachWindow: (() => void) | null = null;

  private listeners = new Set<() => void>();
  private view: RoomView | null = null;

  private readonly fetchImpl: typeof fetch;
  private readonly storage: Storage | null;
  private readonly realtimeFactory?: RealtimeFactory;

  constructor(roomId: string, options: EngineOptions = {}) {
    this.roomId = roomId;
    this.clientId = options.clientId ?? uuid().replace(/-/g, "");
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.storage = options.storage === undefined ? safeLocalStorage() : options.storage;
    this.realtimeFactory = options.realtime;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Safe to call again after dispose() (React Strict Mode remounts effects). */
  start() {
    this.disposed = false;
    this.online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (!this.hydrated) {
      this.hydrated = true;
      this.hydrateFromCache();
    }
    void this.resync();
    this.realtime =
      this.realtimeFactory?.(this.roomId, this.clientId, {
        onStatus: (status) => this.onSocketStatus(status),
        onEvent: (event) => this.onRoomEvent(event),
        onPresence: (devices) => {
          this.devices = devices;
          this.emit();
        },
      }) ?? null;
    // If the socket is down (or never configured), fall back to polling so
    // other devices' changes still arrive.
    this.pollTimer = setInterval(() => {
      if (!this.socketLive && this.isVisible()) void this.resync();
    }, FALLBACK_POLL_MS);
    this.attachWindowListeners();
    this.flushAll();
  }

  dispose() {
    this.disposed = true;
    this.persistNow();
    this.realtime?.close();
    this.detachWindow?.();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.pollTimer = this.retryTimer = this.persistTimer = null;
    for (const entry of this.entries.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): RoomView => {
    if (!this.view) this.view = this.buildView();
    return this.view;
  };

  // ── Public actions ───────────────────────────────────────────────────────

  createNote(content: Partial<Content> = {}): string {
    const id = uuid();
    const entry = emptyEntry(id, new Date().toISOString());
    entry.draft = {
      title: clampTitle(content.title ?? ""),
      body: clampBody(content.body ?? ""),
    };
    this.entries.set(id, entry);
    this.emit();
    this.flush(entry);
    return id;
  }

  editNote(id: string, patch: Partial<Content>) {
    const entry = this.entries.get(id);
    if (!entry || entry.deleting) return;
    const next = { ...contentOf(entry) };
    if (patch.title !== undefined) next.title = clampTitle(patch.title);
    if (patch.body !== undefined) next.body = clampBody(patch.body);
    entry.draft = entry.server && sameContent(next, entry.server) ? null : next;
    const now = Date.now();
    entry.lastEditAt = now;
    entry.firstUnsavedEditAt = entry.draft ? (entry.firstUnsavedEditAt ?? now) : null;
    this.emit();
    this.scheduleFlush(entry);
  }

  deleteNote(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.server === null && !entry.inflight && !entry.createAttempted) {
      // Never sent to the server; nothing to delete there.
      this.removeEntry(entry);
    } else {
      entry.deleting = true;
      entry.draft = null;
      this.flush(entry);
    }
    this.emit();
  }

  /** Manual retry from the error screen or the "unsynced" status. */
  retry() {
    if (this.status === "error" || this.status === "not_configured") {
      this.status = this.entries.size > 0 ? "ready" : "loading";
      this.emit();
    }
    this.retryAttempt = 0;
    void this.resync();
    this.flushAll();
  }

  /**
   * Fires when local text moves to a new note (after a conflict, a remote
   * delete, or an ID clash) so the UI can keep the user's text on screen.
   */
  onRedirect(listener: (from: string, to: string) => void) {
    this.redirectListeners.add(listener);
    return () => {
      this.redirectListeners.delete(listener);
    };
  }

  private redirect(from: string, to: string) {
    for (const listener of this.redirectListeners) listener(from, to);
  }

  dismissNotice(id: number) {
    this.notices = this.notices.filter((notice) => notice.id !== id);
    this.emit();
  }

  hasUnsavedChanges(): boolean {
    for (const entry of this.entries.values()) {
      if (hasPendingWork(entry)) return true;
    }
    return false;
  }

  // ── Server snapshots ─────────────────────────────────────────────────────

  private async resync() {
    if (this.disposed) return;
    if (this.resyncRunning) {
      this.resyncQueued = true;
      return;
    }
    this.resyncRunning = true;
    const tick = ++this.resyncTick;
    try {
      const result = await this.api("GET", "");
      if (this.disposed) return;
      if (result.kind === "ok") {
        const snapshot = parseRoomSnapshot(result.data);
        if (!snapshot) throw new Error("Malformed room snapshot");
        this.applySnapshot(snapshot.notes, tick);
        this.synced = true;
        this.status = "ready";
        this.errorMessage = null;
        this.setOnline(true);
      } else if (result.kind === "http") {
        this.handleHttpFailure(result);
      } else {
        this.setOnline(false);
        if (this.status === "loading") {
          this.status = "error";
          this.errorMessage = "Couldn't reach the server. Check your connection.";
        }
      }
    } catch (error) {
      console.error(error);
      if (this.status === "loading") {
        this.status = "error";
        this.errorMessage = "The server sent an unexpected response.";
      }
    } finally {
      this.resyncRunning = false;
      this.emit();
      if (this.resyncQueued) {
        this.resyncQueued = false;
        void this.resync();
      }
    }
  }

  private applySnapshot(notes: Note[], tick: number) {
    const seen = new Set<string>();
    for (const note of notes) {
      seen.add(note.id);
      this.receiveServerNote(note);
    }
    for (const entry of [...this.entries.values()]) {
      if (
        !seen.has(entry.id) &&
        entry.server !== null &&
        !entry.inflight &&
        entry.confirmedAt < tick
      ) {
        this.handleRemoteDelete(entry);
      }
    }
  }

  // ── Realtime ─────────────────────────────────────────────────────────────

  private onSocketStatus(status: "subscribed" | "disconnected") {
    this.socketLive = status === "subscribed";
    if (this.socketLive) {
      this.everSubscribed = true;
      // Catch up on anything missed while disconnected, then push our edits.
      void this.resync();
      this.flushAll();
    }
    this.emit();
  }

  private onRoomEvent(event: RoomEvent) {
    switch (event.type) {
      case "note_upsert":
        this.receiveServerNote(event.note);
        break;
      case "note_delete": {
        this.tombstones.add(event.id);
        const entry = this.entries.get(event.id);
        if (entry) {
          if (entry.inflight) entry.incoming = "deleted";
          else this.handleRemoteDelete(entry);
        }
        break;
      }
      case "room_deleted":
        this.markRoomGone("closed");
        break;
      case "note_stale": {
        const entry = this.entries.get(event.id);
        if (!entry?.server || entry.server.version < event.version) {
          void this.resync();
        }
        break;
      }
    }
    this.emit();
  }

  // ── Merging server changes ───────────────────────────────────────────────

  private receiveServerNote(note: Note) {
    const entry = this.entries.get(note.id);
    if (!entry) {
      if (this.tombstones.has(note.id)) return;
      const created = emptyEntry(note.id, note.createdAt);
      created.server = note;
      created.confirmedAt = this.resyncTick;
      this.entries.set(note.id, created);
      return;
    }
    if (entry.deleting) return;
    if (entry.server && note.version <= entry.server.version) return;
    if (entry.inflight) {
      // Merge after the in-flight request settles, against its result.
      const queued = entry.incoming;
      if (queued !== "deleted" && (!queued || queued.version < note.version)) {
        entry.incoming = note;
      }
      return;
    }
    this.integrate(entry, note);
  }

  private integrate(entry: Entry, note: Note) {
    entry.confirmedAt = this.resyncTick;
    entry.createdAt = note.createdAt;
    const base = entry.server;
    const draft = entry.draft;
    entry.server = note;
    if (!draft) return;
    if (!base) {
      // Our create raced a copy of itself (e.g. a retried request).
      entry.draft = sameContent(draft, note) ? null : draft;
      return;
    }
    const { merged, conflict } = merge3(base, draft, note);
    if (conflict) {
      entry.draft = null;
      entry.firstUnsavedEditAt = null;
      const copyId = this.keepAsNewNote(
        { title: copyTitle(draft.title), body: draft.body },
        entry.createdAt,
      );
      this.notify(
        "warning",
        "This note was changed on another device at the same time. Your version was saved as a separate copy.",
      );
      this.redirect(entry.id, copyId);
    } else {
      entry.draft = sameContent(merged, note) ? null : merged;
      if (entry.draft) this.scheduleFlush(entry);
    }
  }

  private handleRemoteDelete(entry: Entry) {
    this.tombstones.add(entry.id);
    const unsaved =
      entry.draft && !(entry.server && sameContent(entry.draft, entry.server));
    this.removeEntry(entry);
    if (unsaved && entry.draft && !entry.deleting) {
      const copyId = this.keepAsNewNote(entry.draft, entry.createdAt);
      this.redirect(entry.id, copyId);
      this.notify(
        "warning",
        "A note you were editing was deleted on another device. Your unsaved text was kept as a new note.",
      );
    }
  }

  private keepAsNewNote(content: Content, createdAt: string): string {
    const id = uuid();
    const entry = emptyEntry(id, createdAt);
    entry.draft = { title: clampTitle(content.title), body: clampBody(content.body) };
    this.entries.set(id, entry);
    this.flush(entry);
    return id;
  }

  private removeEntry(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    this.entries.delete(entry.id);
  }

  // ── Saving ───────────────────────────────────────────────────────────────

  private scheduleFlush(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    const now = Date.now();
    const sinceFirst = entry.firstUnsavedEditAt ? now - entry.firstUnsavedEditAt : 0;
    const quietFor = now - entry.lastEditAt;
    // Wait for a short pause in typing, but never longer than MAX_WAIT_MS.
    const delay = Math.max(
      0,
      Math.min(DEBOUNCE_MS - quietFor, MAX_WAIT_MS - sinceFirst),
    );
    entry.timer = setTimeout(() => {
      entry.timer = null;
      this.flush(entry);
    }, delay);
  }

  private flushAll() {
    for (const entry of this.entries.values()) {
      if (hasPendingWork(entry)) this.flush(entry);
    }
  }

  private flush(entry: Entry) {
    if (this.disposed || entry.inflight) return;
    if (this.status === "not_found" || this.status === "not_configured") return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (entry.deleting) {
      if (entry.server === null && !entry.createAttempted) {
        this.removeEntry(entry);
        this.emit();
        return;
      }
      void this.sendDelete(entry);
    } else if (entry.server === null) {
      void this.sendCreate(entry);
    } else if (entry.draft) {
      void this.sendUpdate(entry);
    }
  }

  private async sendCreate(entry: Entry) {
    const content = contentOf(entry);
    entry.firstUnsavedEditAt = null;
    entry.createAttempted = true;
    const result = await this.request(entry, "POST", "/notes", {
      id: entry.id,
      title: content.title,
      body: content.body,
      clientId: this.clientId,
    });
    if (result.kind === "ok") {
      const note = parseNote(result.data?.note);
      if (note) this.acknowledge(entry, note);
    } else if (result.kind === "http" && result.status === 409) {
      // Another note owns this ID (practically impossible): take a new one.
      this.entries.delete(entry.id);
      const oldId = entry.id;
      entry.id = uuid();
      this.entries.set(entry.id, entry);
      this.redirect(oldId, entry.id);
    }
    this.settle(entry, result);
  }

  private async sendUpdate(entry: Entry) {
    const server = entry.server!;
    const draft = entry.draft!;
    const payload: Record<string, unknown> = {
      baseVersion: server.version,
      clientId: this.clientId,
    };
    if (draft.title !== server.title) payload.title = draft.title;
    if (draft.body !== server.body) payload.body = draft.body;
    entry.lastSent = { ...draft };
    entry.firstUnsavedEditAt = null;

    const result = await this.request(entry, "PATCH", `/notes/${entry.id}`, payload);
    if (result.kind === "ok") {
      const note = parseNote(result.data?.note);
      if (note) this.acknowledge(entry, note);
    } else if (result.kind === "http" && result.status === 409) {
      const note = parseNote(result.data?.note);
      if (note && this.entries.get(entry.id) === entry) {
        const lastSent = entry.lastSent;
        if (note.updatedBy === this.clientId && lastSent && sameContent(note, lastSent)) {
          // Our earlier save landed but its response was lost.
          this.acknowledge(entry, note);
        } else if (note.version > server.version) {
          this.integrate(entry, note);
        }
      }
    } else if (result.kind === "http" && result.status === 404) {
      if (result.data?.error === "note_not_found" && this.entries.get(entry.id) === entry) {
        this.handleRemoteDelete(entry);
      }
    }
    this.settle(entry, result);
  }

  private async sendDelete(entry: Entry) {
    const result = await this.request(entry, "DELETE", `/notes/${entry.id}`);
    if (result.kind === "ok" || (result.kind === "http" && result.status === 404)) {
      this.tombstones.add(entry.id);
      this.removeEntry(entry);
    }
    this.settle(entry, result);
  }

  /** The server accepted our write and returned the resulting note. */
  private acknowledge(entry: Entry, note: Note) {
    entry.server = note;
    entry.createdAt = note.createdAt;
    entry.confirmedAt = this.resyncTick;
    if (entry.draft && sameContent(entry.draft, note)) entry.draft = null;
  }

  private async request(
    entry: Entry,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult> {
    entry.inflight = true;
    this.emit();
    try {
      return await this.api(method, path, body);
    } finally {
      entry.inflight = false;
    }
  }

  /** Bookkeeping after any write request, successful or not. */
  private settle(entry: Entry, result: ApiResult) {
    if (this.disposed) return;
    const alive = this.entries.get(entry.id) === entry;

    if (result.kind === "network" || (result.kind === "http" && result.status >= 500)) {
      if (result.kind === "http") this.handleHttpFailure(result);
      else this.setOnline(false);
      entry.failed = true;
      this.scheduleRetry();
    } else if (result.kind === "http" && result.status === 400) {
      entry.failed = true;
      this.notify("error", "A change couldn't be saved because the server rejected it.");
    } else if (result.kind === "http" && result.status === 404) {
      if (result.data?.error === "room_not_found") this.markRoomGone();
    } else {
      entry.failed = false;
      this.retryAttempt = 0;
      this.setOnline(true);
    }

    if (alive) {
      const incoming = entry.incoming;
      entry.incoming = null;
      if (incoming === "deleted") {
        this.handleRemoteDelete(entry);
      } else if (incoming && (!entry.server || incoming.version > entry.server.version)) {
        this.integrate(entry, incoming);
      }
      if (this.entries.get(entry.id) === entry && !entry.failed && hasPendingWork(entry)) {
        this.scheduleFlush(entry);
      }
    }
    this.emit();
  }

  private scheduleRetry() {
    if (this.retryTimer || this.disposed) return;
    const delay = Math.min(30_000, 1_000 * 2 ** this.retryAttempt);
    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.flushAll();
    }, delay);
  }

  // ── HTTP ─────────────────────────────────────────────────────────────────

  private async api(method: string, path: string, body?: unknown): Promise<ApiResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(`/api/rooms/${this.roomId}${path}`, {
        method,
        cache: "no-store",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { kind: "network" };
    }
    let data: Record<string, unknown> | null = null;
    if (response.status !== 204) {
      try {
        data = await response.json();
      } catch {
        // Gateways and offline service-worker responses aren't JSON.
        if (!response.ok) return { kind: "network" };
      }
    }
    return response.ok
      ? { kind: "ok", status: response.status, data }
      : { kind: "http", status: response.status, data };
  }

  private handleHttpFailure(result: { status: number; data: Record<string, unknown> | null }) {
    const code = result.data?.error;
    if (code === "room_not_found") {
      this.markRoomGone();
    } else if (code === "not_configured") {
      this.status = "not_configured";
      this.errorMessage = String(result.data?.message ?? "");
    } else if (this.status === "loading") {
      this.status = "error";
      this.errorMessage = "The server had a problem loading this room.";
    }
  }

  private markRoomGone(reason: "closed" | null = null) {
    this.status = "not_found";
    this.goneReason = reason ?? this.goneReason;
    this.entries.clear();
    try {
      this.storage?.removeItem(storageKey(this.roomId));
    } catch {}
  }

  // ── Connectivity ─────────────────────────────────────────────────────────

  private setOnline(online: boolean) {
    if (this.online === online) return;
    this.online = online;
    this.emit();
  }

  private isVisible() {
    return typeof document === "undefined" || document.visibilityState === "visible";
  }

  private attachWindowListeners() {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      this.setOnline(true);
      this.retryAttempt = 0;
      void this.resync();
      this.flushAll();
    };
    const onOffline = () => this.setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        this.realtime?.wake();
        void this.resync();
        this.flushAll();
      } else {
        // The page may be frozen or closed next: save what we can now.
        this.flushAll();
        this.persistNow();
      }
    };
    const onPageHide = () => this.persistNow();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onPageHide);
    this.detachWindow = () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onPageHide);
    };
  }

  // ── Local cache ──────────────────────────────────────────────────────────

  private hydrateFromCache() {
    if (!this.storage) return;
    let cached: PersistedRoom | null = null;
    try {
      const raw = this.storage.getItem(storageKey(this.roomId));
      cached = raw ? (JSON.parse(raw) as PersistedRoom) : null;
    } catch {
      return;
    }
    if (cached?.v !== 1 || !Array.isArray(cached.notes)) return;
    for (const item of cached.notes) {
      const server = item.server ? parseNote(item.server) : null;
      const draft =
        item.draft &&
        typeof item.draft.title === "string" &&
        typeof item.draft.body === "string"
          ? { title: clampTitle(item.draft.title), body: clampBody(item.draft.body) }
          : null;
      if (typeof item.id !== "string" || (!server && !draft)) continue;
      const entry = emptyEntry(item.id, typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString());
      entry.server = server;
      entry.draft = draft;
      entry.deleting = item.deleting === true;
      // Unknown whether an earlier session sent it; a stray DELETE is harmless.
      entry.createAttempted = true;
      this.entries.set(entry.id, entry);
    }
    if (this.entries.size > 0) this.status = "ready";
  }

  private schedulePersist() {
    if (this.persistTimer || !this.storage) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, 400);
  }

  private persistNow() {
    if (!this.storage || this.status === "not_found") return;
    if (this.status === "loading" || this.status === "error") {
      if (this.entries.size === 0) return;
    }
    const data: PersistedRoom = {
      v: 1,
      notes: [...this.entries.values()].map((entry) => ({
        id: entry.id,
        server: entry.server,
        draft: entry.draft,
        createdAt: entry.createdAt,
        deleting: entry.deleting,
      })),
    };
    try {
      this.storage.setItem(storageKey(this.roomId), JSON.stringify(data));
    } catch {
      // Storage full or blocked: the server copy is still the source of truth.
    }
  }

  // ── View ─────────────────────────────────────────────────────────────────

  private notify(tone: Notice["tone"], message: string) {
    this.notices = [...this.notices, { id: ++this.noticeSeq, tone, message }].slice(
      -MAX_NOTICES,
    );
  }

  private emit() {
    if (this.disposed) return;
    this.view = null;
    this.schedulePersist();
    for (const listener of this.listeners) listener();
  }

  private buildView(): RoomView {
    const notes: NoteView[] = [];
    let pending = false;
    let failed = false;
    for (const entry of this.entries.values()) {
      if (hasPendingWork(entry)) pending = true;
      if (entry.failed) failed = true;
      if (entry.deleting) continue;
      const content = contentOf(entry);
      notes.push({
        id: entry.id,
        title: content.title,
        body: content.body,
        createdAt: entry.createdAt,
        updatedAt: entry.server?.updatedAt ?? null,
        unsaved: entry.draft !== null || entry.server === null,
        saving: entry.inflight,
        failed: entry.failed,
      });
    }
    // Newest first. Parse rather than compare strings: server and browser
    // timestamps use different ISO formats.
    notes.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

    let connection: ConnectionState;
    if (!this.online) connection = "offline";
    else if (this.socketLive) connection = "live";
    else connection = this.everSubscribed ? "reconnecting" : "connecting";

    return {
      roomId: this.roomId,
      status: this.status,
      errorMessage: this.errorMessage,
      goneReason: this.goneReason,
      connection,
      sync: failed ? "unsynced" : pending ? "saving" : "saved",
      synced: this.synced,
      devices: this.devices,
      notes,
      notices: this.notices,
    };
  }
}

function clampTitle(value: string) {
  return sanitizeText(value).slice(0, TITLE_MAX_LENGTH);
}

function clampBody(value: string) {
  return sanitizeText(value).slice(0, BODY_MAX_LENGTH);
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

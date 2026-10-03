// Shared note types and validation, used by the API routes (for incoming
// requests) and the browser (for snapshots and realtime messages).

export const TITLE_MAX_LENGTH = 200;
export const BODY_MAX_LENGTH = 100_000;

export type Note = {
  id: string;
  title: string;
  body: string;
  /** Incremented by the server on every write; used to reject stale edits. */
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Client ID of the tab that made the last write. */
  updatedBy: string | null;
};

export type RoomSnapshot = {
  room: { id: string; createdAt: string };
  notes: Note[];
};

/** Messages broadcast to every device subscribed to a room. */
export type RoomEvent =
  | { type: "note_upsert"; note: Note }
  | { type: "note_delete"; id: string }
  /** Sent instead of note_upsert when the note is too large to broadcast. */
  | { type: "note_stale"; id: string; version: number }
  /** The room was deleted because its creator went over the room limit. */
  | { type: "room_deleted" };

export const ROOM_EVENT_NAMES = [
  "note_upsert",
  "note_delete",
  "note_stale",
  "room_deleted",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isClientId(value: unknown): value is string {
  return typeof value === "string" && CLIENT_ID_PATTERN.test(value);
}

/**
 * Postgres text can't hold NUL characters or unpaired UTF-16 surrogates.
 * Everything else — whitespace, tabs, line breaks — is kept byte for byte.
 */
export function sanitizeText(value: string): string {
  let result = value.includes("\u0000") ? value.replace(/\u0000/g, "") : value;
  if (typeof result.toWellFormed === "function") {
    result = result.toWellFormed();
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function textField(
  input: Record<string, unknown>,
  key: string,
  max: number,
): Parsed<string | undefined> {
  const value = input[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string") {
    return { ok: false, error: `${key} must be a string` };
  }
  if (value.length > max) {
    return { ok: false, error: `${key} is longer than ${max} characters` };
  }
  return { ok: true, value: sanitizeText(value) };
}

export type CreateNoteInput = {
  id: string;
  title: string;
  body: string;
  clientId: string;
};

export function parseCreateNote(input: unknown): Parsed<CreateNoteInput> {
  if (!isRecord(input)) return { ok: false, error: "Expected a JSON object" };
  if (!isUuid(input.id)) return { ok: false, error: "id must be a UUID" };
  if (!isClientId(input.clientId)) {
    return { ok: false, error: "clientId is invalid" };
  }
  const title = textField(input, "title", TITLE_MAX_LENGTH);
  if (!title.ok) return title;
  const body = textField(input, "body", BODY_MAX_LENGTH);
  if (!body.ok) return body;
  return {
    ok: true,
    value: {
      id: input.id.toLowerCase(),
      title: title.value ?? "",
      body: body.value ?? "",
      clientId: input.clientId,
    },
  };
}

export type UpdateNoteInput = {
  baseVersion: number;
  title?: string;
  body?: string;
  clientId: string;
};

export function parseUpdateNote(input: unknown): Parsed<UpdateNoteInput> {
  if (!isRecord(input)) return { ok: false, error: "Expected a JSON object" };
  const { baseVersion } = input;
  if (
    typeof baseVersion !== "number" ||
    !Number.isSafeInteger(baseVersion) ||
    baseVersion < 1
  ) {
    return { ok: false, error: "baseVersion must be a positive integer" };
  }
  if (!isClientId(input.clientId)) {
    return { ok: false, error: "clientId is invalid" };
  }
  const title = textField(input, "title", TITLE_MAX_LENGTH);
  if (!title.ok) return title;
  const body = textField(input, "body", BODY_MAX_LENGTH);
  if (!body.ok) return body;
  if (title.value === undefined && body.value === undefined) {
    return { ok: false, error: "Nothing to update" };
  }
  return {
    ok: true,
    value: {
      baseVersion,
      title: title.value,
      body: body.value,
      clientId: input.clientId,
    },
  };
}

/** Validates a note received from the server or over the socket. */
export function parseNote(input: unknown): Note | null {
  if (!isRecord(input)) return null;
  const { id, title, body, version, createdAt, updatedAt, updatedBy } = input;
  if (
    !isUuid(id) ||
    typeof title !== "string" ||
    title.length > TITLE_MAX_LENGTH ||
    typeof body !== "string" ||
    body.length > BODY_MAX_LENGTH ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string" ||
    (updatedBy !== null && typeof updatedBy !== "string")
  ) {
    return null;
  }
  return {
    id: id.toLowerCase(),
    title,
    body,
    version,
    createdAt,
    updatedAt,
    updatedBy,
  };
}

export function parseRoomSnapshot(input: unknown): RoomSnapshot | null {
  if (!isRecord(input) || !isRecord(input.room) || !Array.isArray(input.notes)) {
    return null;
  }
  const { id, createdAt } = input.room;
  if (typeof id !== "string" || typeof createdAt !== "string") return null;
  const notes: Note[] = [];
  for (const raw of input.notes) {
    const note = parseNote(raw);
    if (!note) return null;
    notes.push(note);
  }
  return { room: { id, createdAt }, notes };
}

export function parseRoomEvent(event: string, payload: unknown): RoomEvent | null {
  if (!isRecord(payload)) return null;
  switch (event) {
    case "note_upsert": {
      const note = parseNote(payload.note);
      return note ? { type: "note_upsert", note } : null;
    }
    case "note_delete":
      return isUuid(payload.id)
        ? { type: "note_delete", id: payload.id.toLowerCase() }
        : null;
    case "note_stale":
      return isUuid(payload.id) &&
        typeof payload.version === "number" &&
        Number.isSafeInteger(payload.version)
        ? { type: "note_stale", id: payload.id.toLowerCase(), version: payload.version }
        : null;
    case "room_deleted":
      return { type: "room_deleted" };
    default:
      return null;
  }
}

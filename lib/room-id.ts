// Room IDs are the only key to a room, so they are random, unguessable, and
// easy to type on a phone: 10 characters from an alphabet without lookalikes
// (no 0/o, 1/l/i). 31^10 ≈ 8 × 10^14 possible IDs.
export const ROOM_ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const ROOM_ID_LENGTH = 10;

const ROOM_ID_PATTERN = new RegExp(
  `^[${ROOM_ID_ALPHABET}]{${ROOM_ID_LENGTH}}$`,
);

export function generateRoomId(): string {
  const alphabetSize = ROOM_ID_ALPHABET.length;
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabetSize);
  let id = "";
  while (id.length < ROOM_ID_LENGTH) {
    const bytes = new Uint8Array(ROOM_ID_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit && id.length < ROOM_ID_LENGTH) {
        id += ROOM_ID_ALPHABET[byte % alphabetSize];
      }
    }
  }
  return id;
}

export function isRoomId(value: unknown): value is string {
  return typeof value === "string" && ROOM_ID_PATTERN.test(value);
}

/**
 * Accepts anything a person might paste or type — `abcde-fghjk`,
 * `ABCDE FGHJK`, or a full invitation link — and returns the canonical ID,
 * or null when it can't be a room ID.
 */
export function normalizeRoomId(input: string): string | null {
  let value = input.trim();
  const fromLink = value.match(/\/r\/([^/?#\s]+)/i);
  if (fromLink) value = decodeURIComponent(fromLink[1]);
  value = value.toLowerCase().replace(/[\s\-_.]/g, "");
  return isRoomId(value) ? value : null;
}

export function formatRoomId(id: string): string {
  return `${id.slice(0, 5)}-${id.slice(5)}`;
}

export function roomPath(id: string): string {
  return `/r/${formatRoomId(id)}`;
}

export function roomTopic(id: string): string {
  return `room:${id}`;
}

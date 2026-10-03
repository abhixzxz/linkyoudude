export type Content = { title: string; body: string };

const FIELDS = ["title", "body"] as const;

export function sameContent(a: Content, b: Content): boolean {
  return a.title === b.title && a.body === b.body;
}

/**
 * Three-way merge of local unsaved edits with a newer server copy, both
 * descended from `base`. A field only conflicts when both sides changed it to
 * different values; otherwise each side's change is kept.
 */
export function merge3(
  base: Content,
  local: Content,
  incoming: Content,
): { merged: Content; conflict: boolean } {
  const merged = { ...incoming };
  let conflict = false;
  for (const field of FIELDS) {
    const localChanged = local[field] !== base[field];
    const incomingChanged = incoming[field] !== base[field];
    if (!localChanged) continue;
    if (!incomingChanged || local[field] === incoming[field]) {
      merged[field] = local[field];
    } else {
      conflict = true;
    }
  }
  return { merged, conflict };
}

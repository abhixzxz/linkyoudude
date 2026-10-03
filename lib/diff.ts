// Line diff (Myers' O(ND) algorithm) with word-level highlights inside
// changed lines, for the Compare tool.

type Edit = { op: "equal"; a: number; b: number } | { op: "delete"; a: number } | { op: "insert"; b: number };

// Above this many edits we stop searching for the minimal diff and report the
// remaining middle section as replaced. Keeps memory and time bounded.
const MAX_LINE_EDITS = 3000;
const MAX_WORD_EDITS = 400;

function myers(a: ArrayLike<number>, b: ArrayLike<number>, maxEdits: number): Edit[] {
  const edits: Edit[] = [];
  // Common prefix and suffix are equal by definition; diff only the middle.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    edits.push({ op: "equal", a: start, b: start });
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const n = endA - start;
  const m = endB - start;
  const middle = middleDiff(a, b, start, n, m, maxEdits);
  for (const edit of middle) edits.push(edit);

  for (let k = 0; endA + k < a.length; k++) edits.push({ op: "equal", a: endA + k, b: endB + k });
  return edits;
}

function middleDiff(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  offset: number,
  n: number,
  m: number,
  maxEdits: number,
): Edit[] {
  const replaceAll = (): Edit[] => [
    ...Array.from({ length: n }, (_, i): Edit => ({ op: "delete", a: offset + i })),
    ...Array.from({ length: m }, (_, j): Edit => ({ op: "insert", b: offset + j })),
  ];
  if (n === 0 || m === 0) return replaceAll();

  const max = n + m;
  const limit = Math.min(max, maxEdits);
  const v = new Int32Array(2 * max + 3);
  const center = max + 1;
  const trace: Int32Array[] = [];

  for (let d = 0; d <= limit; d++) {
    // Snapshot of v for diagonals -d-1..d+1, used when walking back.
    trace.push(v.slice(center - d - 1, center + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[center + k - 1] < v[center + k + 1])
          ? v[center + k + 1]
          : v[center + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[offset + x] === b[offset + y]) {
        x++;
        y++;
      }
      v[center + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m, offset);
    }
  }
  return replaceAll();
}

function backtrack(trace: Int32Array[], depth: number, n: number, m: number, offset: number): Edit[] {
  const out: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = depth; d >= 0; d--) {
    const v = trace[d];
    const at = (k: number) => v[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ op: "equal", a: offset + x - 1, b: offset + y - 1 });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) out.push({ op: "insert", b: offset + y - 1 });
      else out.push({ op: "delete", a: offset + x - 1 });
    }
    x = prevX;
    y = prevY;
  }
  return out.reverse();
}

/** Maps strings to small integers so comparisons are cheap. */
function intern(lists: string[][]): number[][] {
  const ids = new Map<string, number>();
  return lists.map((list) =>
    list.map((item) => {
      let id = ids.get(item);
      if (id === undefined) {
        id = ids.size;
        ids.set(item, id);
      }
      return id;
    }),
  );
}

export type Segment = { text: string; changed: boolean };

function tokenize(line: string) {
  return line.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

/** Word-level diff of a changed line pair. */
export function diffWords(left: string, right: string): { left: Segment[]; right: Segment[] } {
  const a = tokenize(left);
  const b = tokenize(right);
  const [ia, ib] = intern([a, b]);
  const edits = myers(ia, ib, MAX_WORD_EDITS);
  const l: Segment[] = [];
  const r: Segment[] = [];
  const push = (list: Segment[], text: string, changed: boolean) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  for (const edit of edits) {
    if (edit.op === "equal") {
      push(l, a[edit.a], false);
      push(r, b[edit.b], false);
    } else if (edit.op === "delete") push(l, a[edit.a], true);
    else push(r, b[edit.b], true);
  }
  return { left: l, right: r };
}

export type DiffRow =
  | { type: "equal"; leftNo: number; rightNo: number; leftText: string; rightText: string }
  | {
      type: "change";
      hunk: number;
      leftNo: number | null;
      rightNo: number | null;
      left: Segment[] | null;
      right: Segment[] | null;
    };

export type DiffOptions = { ignoreWhitespace?: boolean; ignoreCase?: boolean };

export type DiffResult = {
  rows: DiffRow[];
  /** Contiguous blocks of changes. */
  changes: number;
  added: number;
  removed: number;
  /** Lines changed in place (counted once, not as removed + added). */
  modified: number;
  identical: boolean;
  /** True when the texts differ but only in ways the options ignore. */
  identicalWithOptions: boolean;
  leftLines: number;
  rightLines: number;
};

function splitLines(text: string) {
  return text === "" ? [] : text.replace(/\r\n?/g, "\n").split("\n");
}

export function diffTexts(leftText: string, rightText: string, options: DiffOptions = {}): DiffResult {
  const left = splitLines(leftText);
  const right = splitLines(rightText);
  const key = (line: string) => {
    let k = line;
    if (options.ignoreWhitespace) k = k.replace(/\s+/g, " ").trim();
    if (options.ignoreCase) k = k.toLowerCase();
    return k;
  };
  const [ka, kb] = intern([left.map(key), right.map(key)]);
  const edits = myers(ka, kb, MAX_LINE_EDITS);

  const rows: DiffRow[] = [];
  let changes = 0;
  let added = 0;
  let removed = 0;
  let modified = 0;
  let pendingDel: number[] = [];
  let pendingIns: number[] = [];

  const flush = () => {
    if (!pendingDel.length && !pendingIns.length) return;
    const hunk = changes++;
    const pairs = Math.min(pendingDel.length, pendingIns.length);
    for (let i = 0; i < Math.max(pendingDel.length, pendingIns.length); i++) {
      const a = pendingDel[i];
      const b = pendingIns[i];
      if (i < pairs) {
        modified++;
        const words = diffWords(left[a], right[b]);
        rows.push({ type: "change", hunk, leftNo: a + 1, rightNo: b + 1, left: words.left, right: words.right });
      } else if (a !== undefined) {
        removed++;
        rows.push({ type: "change", hunk, leftNo: a + 1, rightNo: null, left: [{ text: left[a], changed: true }], right: null });
      } else {
        added++;
        rows.push({ type: "change", hunk, leftNo: null, rightNo: b + 1, left: null, right: [{ text: right[b], changed: true }] });
      }
    }
    pendingDel = [];
    pendingIns = [];
  };

  for (const edit of edits) {
    if (edit.op === "equal") {
      flush();
      rows.push({ type: "equal", leftNo: edit.a + 1, rightNo: edit.b + 1, leftText: left[edit.a], rightText: right[edit.b] });
    } else if (edit.op === "delete") pendingDel.push(edit.a);
    else pendingIns.push(edit.b);
  }
  flush();

  const identical = leftText === rightText;
  return {
    rows,
    changes,
    added,
    removed,
    modified,
    identical,
    identicalWithOptions: !identical && changes === 0,
    leftLines: left.length,
    rightLines: right.length,
  };
}

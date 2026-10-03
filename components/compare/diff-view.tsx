"use client";

import { Fragment, useState, type ReactNode } from "react";
import type { DiffResult, DiffRow, Segment } from "@/lib/diff";

const CONTEXT = 3;

type ChangeRow = Extract<DiffRow, { type: "change" }>;
type EqualRow = Extract<DiffRow, { type: "equal" }>;
type Block =
  | { kind: "equal"; start: number; rows: EqualRow[] }
  | { kind: "change"; hunk: number; rows: ChangeRow[] };

function toBlocks(rows: DiffRow[]): Block[] {
  const blocks: Block[] = [];
  rows.forEach((row, index) => {
    const last = blocks[blocks.length - 1];
    if (row.type === "equal") {
      if (last?.kind === "equal") last.rows.push(row);
      else blocks.push({ kind: "equal", start: index, rows: [row] });
    } else if (last?.kind === "change" && last.hunk === row.hunk) {
      last.rows.push(row);
    } else {
      blocks.push({ kind: "change", hunk: row.hunk, rows: [row] });
    }
  });
  return blocks;
}

function Segments({ segments, tone }: { segments: Segment[]; tone: "removed" | "added" }) {
  const mark = tone === "removed" ? "bg-danger/25 text-ink" : "bg-success/30 text-ink";
  return (
    <>
      {segments.map((segment, i) =>
        segment.changed ? (
          <mark key={i} className={`rounded-[3px] ${mark}`}>
            {segment.text}
          </mark>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}

const num = "select-none px-2 text-right font-mono text-[11px] leading-6 tabular-nums text-ink-3";
const code = "min-w-0 whitespace-pre-wrap break-words px-2 font-mono text-[13px] leading-6";

/** Equal lines, with long unchanged stretches folded behind a button. */
function EqualBlock({
  block,
  isFirst,
  isLast,
  render,
}: {
  block: Extract<Block, { kind: "equal" }>;
  isFirst: boolean;
  isLast: boolean;
  render: (row: EqualRow) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { rows } = block;
  const head = isFirst ? 0 : CONTEXT;
  const tail = isLast ? 0 : CONTEXT;
  if (open || rows.length <= head + tail + 2) return <>{rows.map(render)}</>;
  const hidden = rows.length - head - tail;
  return (
    <>
      {rows.slice(0, head).map(render)}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring col-span-full my-0.5 flex w-full items-center justify-center gap-2 bg-surface-2 py-1.5 text-xs font-medium text-ink-2 hover:text-ink"
      >
        ⋯ Show {hidden} unchanged {hidden === 1 ? "line" : "lines"}
      </button>
      {rows.slice(rows.length - tail).map(render)}
    </>
  );
}

export function DiffView({ result, mode }: { result: DiffResult; mode: "split" | "unified" }) {
  const blocks = toBlocks(result.rows);

  if (mode === "split") {
    return (
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] text-ink">
        {blocks.map((block, b) =>
          block.kind === "equal" ? (
            <EqualBlock
              key={`e${block.start}`}
              block={block}
              isFirst={b === 0}
              isLast={b === blocks.length - 1}
              render={(row) => (
                <Fragment key={`${row.leftNo}:${row.rightNo}`}>
                  <span className={num}>{row.leftNo}</span>
                  <span className={`${code} text-ink-2`}>{row.leftText || " "}</span>
                  <span className={`${num} border-l border-line`}>{row.rightNo}</span>
                  <span className={`${code} text-ink-2`}>{row.rightText || " "}</span>
                </Fragment>
              )}
            />
          ) : (
            block.rows.map((row, i) => (
              <Fragment key={`c${block.hunk}:${i}`}>
                <span className={`${num} ${row.left ? "bg-danger-soft" : "bg-surface-2/70"}`} data-hunk={i === 0 ? block.hunk : undefined}>
                  {row.leftNo ?? ""}
                </span>
                <span className={`${code} ${row.left ? "bg-danger-soft" : "bg-surface-2/70"}`}>
                  {row.left ? <Segments segments={row.left} tone="removed" /> : " "}
                </span>
                <span className={`${num} border-l border-line ${row.right ? "bg-success-soft" : "bg-surface-2/70"}`}>
                  {row.rightNo ?? ""}
                </span>
                <span className={`${code} ${row.right ? "bg-success-soft" : "bg-surface-2/70"}`}>
                  {row.right ? <Segments segments={row.right} tone="added" /> : " "}
                </span>
              </Fragment>
            ))
          ),
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] text-ink">
      {blocks.map((block, b) =>
        block.kind === "equal" ? (
          <EqualBlock
            key={`e${block.start}`}
            block={block}
            isFirst={b === 0}
            isLast={b === blocks.length - 1}
            render={(row) => (
              <Fragment key={`${row.leftNo}:${row.rightNo}`}>
                <span className={num}>{row.rightNo}</span>
                <span className={`${num} px-0`}> </span>
                <span className={`${code} text-ink-2`}>{row.rightText || " "}</span>
              </Fragment>
            )}
          />
        ) : (
          // Unified: all removed lines of the change, then all added lines.
          <Fragment key={`c${block.hunk}`}>
            {block.rows
              .filter((row) => row.left)
              .map((row, i) => (
                <Fragment key={`d${i}`}>
                  <span className={`${num} bg-danger-soft`} data-hunk={i === 0 ? block.hunk : undefined}>
                    {row.leftNo}
                  </span>
                  <span className={`${num} bg-danger-soft px-0 font-semibold text-danger`}>−</span>
                  <span className={`${code} bg-danger-soft`}>
                    <Segments segments={row.left!} tone="removed" />
                  </span>
                </Fragment>
              ))}
            {block.rows
              .filter((row) => row.right)
              .map((row, i) => (
                <Fragment key={`a${i}`}>
                  <span
                    className={`${num} bg-success-soft`}
                    data-hunk={i === 0 && !block.rows.some((r) => r.left) ? block.hunk : undefined}
                  >
                    {row.rightNo}
                  </span>
                  <span className={`${num} bg-success-soft px-0 font-semibold text-success`}>+</span>
                  <span className={`${code} bg-success-soft`}>
                    <Segments segments={row.right!} tone="added" />
                  </span>
                </Fragment>
              ))}
          </Fragment>
        ),
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { beautify, jsonStatus } from "@/lib/beautify";
import { readClipboardText } from "@/lib/clipboard";
import { diffTexts } from "@/lib/diff";
import { useVisualViewport } from "@/lib/use-visual-viewport";
import { Brand } from "@/components/ui/brand";
import { buttonClass } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  CheckIcon,
  ChevronIcon,
  ClipboardIcon,
  CloseIcon,
  SwapIcon,
  WandIcon,
} from "@/components/ui/icons";
import { ToastStack, type Toast } from "@/components/ui/toasts";
import { DiffView } from "./diff-view";

const STORAGE_KEY = "lyd:compare:v1";
const MAX_LENGTH = 200_000;

type Options = { ignoreWhitespace: boolean; ignoreCase: boolean; formatJson: boolean };
type Saved = { left: string; right: string; options: Options; mode: "split" | "unified" };

const DEFAULTS: Saved = {
  left: "",
  right: "",
  options: { ignoreWhitespace: false, ignoreCase: false, formatJson: true },
  mode: "split",
};

// This screen renders only in the browser (see app/compare/page.tsx), so the
// last comparison can be restored synchronously without a hydration mismatch.
function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const data = JSON.parse(raw) as Partial<Saved>;
    return {
      left: typeof data.left === "string" ? data.left : "",
      right: typeof data.right === "string" ? data.right : "",
      options: { ...DEFAULTS.options, ...data.options },
      mode: data.mode === "unified" ? "unified" : "split",
    };
  } catch {
    return DEFAULTS;
  }
}

function saveComparison(data: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked; the comparison just isn't remembered.
  }
}

let toastSeq = 0;

const DESKTOP = "(min-width: 1024px)";
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={`focus-ring inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-45 ${
        checked && !disabled
          ? "border-accent/40 bg-accent-soft text-accent-soft-ink"
          : "border-line-strong bg-surface text-ink-2 hover:text-ink"
      }`}
    >
      <span
        className={`flex size-4 items-center justify-center rounded-[5px] border ${
          checked && !disabled ? "border-accent bg-accent text-accent-ink" : "border-line-strong"
        }`}
      >
        {checked && !disabled && <CheckIcon size={12} strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

function Pane({
  label,
  value,
  onChange,
  badge,
  onPaste,
  onBeautify,
  visible,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  badge: React.ReactNode;
  onPaste: () => void;
  onBeautify: () => void;
  visible: boolean;
}) {
  const lines = value ? value.split("\n").length : 0;
  return (
    <section
      aria-label={label}
      className={`min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:flex lg:rounded-3xl lg:border lg:border-line lg:shadow-card ${
        visible ? "flex" : "hidden"
      }`}
    >
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2">
        <h2 className="text-sm font-semibold tracking-tight">{label}</h2>
        {badge}
        <span className="ml-auto text-xs tabular-nums text-ink-3">
          {lines.toLocaleString()} {lines === 1 ? "line" : "lines"} · {value.length.toLocaleString()} chars
        </span>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, MAX_LENGTH))}
        placeholder={`Paste the ${label.toLowerCase()} text here…`}
        aria-label={`${label} text`}
        spellCheck={false}
        className="min-h-0 w-full flex-1 resize-none overscroll-contain bg-transparent px-4 py-3 font-mono text-base leading-relaxed text-ink outline-none placeholder:font-sans placeholder:text-ink-3 lg:text-[13px] lg:leading-6"
      />
      <div className="flex shrink-0 items-center gap-1.5 border-t border-line px-2 py-2">
        <button type="button" onClick={onPaste} className={buttonClass("ghost", "sm")}>
          <ClipboardIcon size={16} />
          Paste
        </button>
        <button type="button" onClick={onBeautify} disabled={!value.trim()} className={buttonClass("ghost", "sm")}>
          <WandIcon size={16} />
          Beautify
        </button>
        <button
          type="button"
          onClick={() => onChange("")}
          disabled={!value}
          className={buttonClass("ghost", "sm", "ml-auto")}
        >
          <CloseIcon size={16} />
          Clear
        </button>
      </div>
    </section>
  );
}

function Chip({ tone, children }: { tone: "accent" | "added" | "removed" | "ok" | "muted"; children: React.ReactNode }) {
  const tones = {
    accent: "bg-accent-soft text-accent-soft-ink",
    added: "bg-success-soft text-success",
    removed: "bg-danger-soft text-danger",
    ok: "bg-success-soft text-success",
    muted: "bg-surface-2 text-ink-2",
  };
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold tabular-nums ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function CompareScreen() {
  useVisualViewport();
  const [initial] = useState(loadSaved);
  const [left, setLeft] = useState(initial.left);
  const [right, setRight] = useState(initial.right);
  const [options, setOptions] = useState<Options>(initial.options);
  const [mode, setMode] = useState<"split" | "unified">(initial.mode);
  const [tab, setTab] = useState<"left" | "right" | "diff">(initial.left && initial.right ? "diff" : "left");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [current, setCurrent] = useState(-1);
  const resultRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  // Remember the comparison on this device: debounced while typing, and
  // immediately when the page is hidden, reloaded, or left.
  const latest = useRef<Saved>({ left, right, options, mode });
  useEffect(() => {
    latest.current = { left, right, options, mode };
    const timer = setTimeout(() => saveComparison(latest.current), 400);
    return () => clearTimeout(timer);
  }, [left, right, options, mode]);
  useEffect(() => {
    const save = () => saveComparison(latest.current);
    const onVisibility = () => document.visibilityState === "hidden" && save();
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      save();
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const toast = useCallback((tone: Toast["tone"], message: string) => {
    const id = `t${++toastSeq}`;
    setToasts((list) => [...list.slice(-2), { id, tone, message }]);
  }, []);

  // Typing stays responsive; the diff catches up a moment later.
  const deferredLeft = useDeferredValue(left);
  const deferredRight = useDeferredValue(right);
  const bothJson = useMemo(
    () => jsonStatus(deferredLeft) === "valid" && jsonStatus(deferredRight) === "valid",
    [deferredLeft, deferredRight],
  );
  const result = useMemo(() => {
    const useJson = options.formatJson && bothJson;
    const a = useJson ? beautify(deferredLeft).text : deferredLeft;
    const b = useJson ? beautify(deferredRight).text : deferredRight;
    return { ...diffTexts(a, b, options), formattedJson: useJson && (a !== deferredLeft || b !== deferredRight) };
  }, [deferredLeft, deferredRight, options, bothJson]);

  const empty = !left && !right;
  const same = !empty && result.changes === 0;
  const stale = deferredLeft !== left || deferredRight !== right;

  const paste = async (set: (value: string) => void, label: string) => {
    const text = await readClipboardText();
    if (text) {
      set(text.slice(0, MAX_LENGTH));
      toast("success", `Pasted into ${label}`);
    } else {
      toast("info", "Couldn't read the clipboard here. Paste with Ctrl+V / ⌘V or long-press → Paste.");
    }
  };
  const tidy = (value: string, set: (value: string) => void) => {
    const r = beautify(value);
    if (r.error) toast("error", r.summary);
    else if (!r.changed) toast("info", r.summary);
    else {
      set(r.text);
      toast("success", r.summary);
    }
  };

  const goTo = (direction: 1 | -1) => {
    if (!result.changes) return;
    const next = current + direction < 0 ? result.changes - 1 : (current + direction) % result.changes;
    setCurrent(next);
    setTab("diff");
    requestAnimationFrame(() => {
      const target = resultRef.current?.querySelector(`[data-hunk="${next}"]`);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const leftBadge = empty ? null : same ? (
    <Chip tone="ok">
      <CheckIcon size={13} strokeWidth={2.5} /> No changes
    </Chip>
  ) : (
    <Chip tone="removed">−{(result.removed + result.modified).toLocaleString()}</Chip>
  );
  const rightBadge = empty ? null : same ? (
    <Chip tone="ok">
      <CheckIcon size={13} strokeWidth={2.5} /> No changes
    </Chip>
  ) : (
    <Chip tone="added">+{(result.added + result.modified).toLocaleString()}</Chip>
  );

  const ignored = [options.ignoreWhitespace && "whitespace", options.ignoreCase && "letter case"].filter(Boolean);

  return (
    <div className="fixed inset-x-0 top-[var(--vv-top,0px)] flex h-[var(--vv-height,100dvh)] flex-col overflow-hidden">
      <header className="z-30 shrink-0 border-b border-line bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-3 px-4 sm:h-16 sm:px-6">
          <Brand compact />
          <h1 className="text-[15px] font-semibold tracking-tight sm:text-base">Compare</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setLeft(right);
                setRight(left);
              }}
              disabled={empty}
              className={buttonClass("ghost", "sm")}
              title="Swap sides"
            >
              <SwapIcon size={16} />
              <span className="max-sm:sr-only">Swap</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLeft("");
                setRight("");
                setTab("left");
              }}
              disabled={empty}
              className={buttonClass("ghost", "sm")}
            >
              <CloseIcon size={16} />
              <span className="max-sm:sr-only">Clear both</span>
            </button>
            <Link href="/" className={buttonClass("secondary", "sm", "max-sm:hidden")}>
              Home
            </Link>
          </div>
        </div>
      </header>

      {/* Summary + options */}
      <div className="shrink-0 border-b border-line bg-bg/60">
        <div className="mx-auto flex w-full max-w-[90rem] items-center gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] max-lg:[mask-image:linear-gradient(to_right,black_88%,transparent)] sm:px-6">
          {empty ? (
            <span className="shrink-0 text-sm text-ink-3">Paste two versions to see what changed.</span>
          ) : same ? (
            <Chip tone="ok">
              <CheckIcon size={14} strokeWidth={2.5} />
              No changes{ignored.length ? ` (ignoring ${ignored.join(" & ")})` : ""}
            </Chip>
          ) : (
            <>
              <Chip tone="accent">
                {result.changes.toLocaleString()} {result.changes === 1 ? "change" : "changes"}
              </Chip>
              <Chip tone="added">+{result.added.toLocaleString()} added</Chip>
              <Chip tone="removed">−{result.removed.toLocaleString()} removed</Chip>
              {result.modified > 0 && <Chip tone="muted">~{result.modified.toLocaleString()} modified</Chip>}
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => goTo(-1)}
                  className={buttonClass("ghost", "iconSm")}
                  aria-label="Previous change"
                >
                  <ChevronIcon direction="up" />
                </button>
                <button
                  type="button"
                  onClick={() => goTo(1)}
                  className={buttonClass("ghost", "iconSm")}
                  aria-label="Next change"
                >
                  <ChevronIcon direction="down" />
                </button>
              </div>
            </>
          )}
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          <Toggle
            label="Ignore spaces"
            checked={options.ignoreWhitespace}
            onChange={(value) => setOptions((o) => ({ ...o, ignoreWhitespace: value }))}
          />
          <Toggle
            label="Ignore case"
            checked={options.ignoreCase}
            onChange={(value) => setOptions((o) => ({ ...o, ignoreCase: value }))}
          />
          <Toggle
            label="Format JSON"
            checked={options.formatJson}
            disabled={!bothJson}
            title={bothJson ? "Compare both sides as formatted JSON" : "Available when both sides are valid JSON"}
            onChange={(value) => setOptions((o) => ({ ...o, formatJson: value }))}
          />
          <div className="ml-auto hidden shrink-0 rounded-full border border-line-strong p-0.5 lg:flex" role="radiogroup" aria-label="Diff layout">
            {(["split", "unified"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={`focus-ring h-8 rounded-full px-3 text-[13px] font-medium ${
                  mode === value ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink"
                }`}
              >
                {value === "split" ? "Side by side" : "Unified"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Phones: one panel at a time. */}
      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-line bg-bg/60 p-1.5 lg:hidden" role="tablist">
        {(
          [
            ["left", "Original"],
            ["right", "Changed"],
            ["diff", "Differences"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`focus-ring flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-medium ${
              tab === value ? "bg-surface text-ink shadow-card" : "text-ink-2"
            }`}
          >
            {label}
            {value === "diff" && !empty && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                  same ? "bg-success-soft text-success" : "bg-accent-soft text-accent-soft-ink"
                }`}
              >
                {same ? "0" : result.changes}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col lg:grid lg:grid-rows-[minmax(11rem,40%)_minmax(0,1fr)] lg:gap-4 lg:p-6">
        <div className={`min-h-0 flex-1 lg:flex lg:gap-4 ${tab === "diff" ? "hidden" : "flex"}`}>
          <Pane
            label="Original"
            value={left}
            onChange={setLeft}
            badge={leftBadge}
            visible={tab === "left"}
            onPaste={() => paste(setLeft, "Original")}
            onBeautify={() => tidy(left, setLeft)}
          />
          <Pane
            label="Changed"
            value={right}
            onChange={setRight}
            badge={rightBadge}
            visible={tab === "right"}
            onPaste={() => paste(setRight, "Changed")}
            onBeautify={() => tidy(right, setRight)}
          />
        </div>

        <section
          aria-label="Differences"
          className={`min-h-0 flex-1 flex-col overflow-hidden bg-surface lg:flex lg:rounded-3xl lg:border lg:border-line lg:shadow-card ${
            tab === "diff" ? "flex" : "hidden"
          }`}
        >
          <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-line px-4 py-2">
            <h2 className="text-sm font-semibold tracking-tight">Differences</h2>
            {result.formattedJson && <Chip tone="muted">Formatted JSON</Chip>}
            {stale && <span className="text-xs text-ink-3">Updating…</span>}
            {!empty && !same && (
              <CopyButton
                text={right}
                label="Copy changed"
                size="sm"
                variant="ghost"
                className="ml-auto"
                ariaLabel="Copy the changed text"
              />
            )}
          </div>
          <div ref={resultRef} className={`min-h-0 flex-1 overflow-auto overscroll-contain ${stale ? "opacity-70" : ""}`}>
            {empty ? (
              <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                <p className="font-semibold tracking-tight">Nothing to compare yet</p>
                <p className="mt-1 max-w-xs text-sm text-ink-2">
                  Add text to Original and Changed. Differences are highlighted as you type.
                </p>
              </div>
            ) : same ? (
              <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-success-soft text-success">
                  <CheckIcon size={24} strokeWidth={2.4} />
                </div>
                <p className="text-lg font-semibold tracking-tight">No changes</p>
                <p className="mt-1 max-w-sm text-sm text-ink-2">
                  {result.identicalWithOptions
                    ? `Both texts match when ignoring ${ignored.join(" & ") || "formatting"}.`
                    : "Both texts are identical."}
                </p>
              </div>
            ) : (
              <div className="py-2">
                {/* Phones are too narrow for side by side. */}
                <DiffView result={result} mode={isDesktop ? mode : "unified"} />
              </div>
            )}
          </div>
        </section>
      </main>

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))}
        className="bottom-[calc(1rem+env(safe-area-inset-bottom))]"
      />
    </div>
  );
}

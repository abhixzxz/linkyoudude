import { formatJson, formatJsonAt, looksLikeJson, type JsonError } from "./json-format";

export type BeautifyResult = {
  text: string;
  changed: boolean;
  /** Short description of what happened, for a toast. */
  summary: string;
  /** Set when the text looks like JSON but can't be parsed; text is untouched. */
  error?: JsonError;
};

const FENCE = /^```([\w-]*)[ \t]*\n([\s\S]*?)\n```[ \t]*$/gm;

/** Trailing spaces, runs of blank lines, and stray blank lines at the ends. */
function tidyWhitespace(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t ]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/\s+$/, "");
}

/** "line one\nline two" pasted with literal backslash-n sequences. */
function unescapeLiteralNewlines(text: string) {
  if (text.includes("\n") || (text.match(/\\n/g) ?? []).length < 2) return text;
  return text.replace(/\\r\\n|\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
}

/** Formats JSON values that start a line and end at the end of a line. */
function formatEmbeddedJson(text: string): { text: string; count: number } {
  let count = 0;
  let out = "";
  let i = 0;
  while (i < text.length) {
    const lineEnd = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
    const line = text.slice(i, lineEnd);
    const indent = line.match(/^[ \t]*/)![0];
    if (looksLikeJson(line)) {
      const result = formatJsonAt(text, i + indent.length);
      if (result.ok) {
        const afterEnd = text.indexOf("\n", result.end);
        const rest = text.slice(result.end, afterEnd === -1 ? text.length : afterEnd);
        if (!rest.trim()) {
          out += result.output
            .split("\n")
            .map((l) => indent + l)
            .join("\n");
          count++;
          i = afterEnd === -1 ? text.length : afterEnd;
          continue;
        }
      }
    }
    out += line;
    if (lineEnd < text.length) out += "\n";
    i = lineEnd + 1;
  }
  return { text: out, count };
}

/**
 * Makes pasted text nicer to read without changing what it says:
 * - a JSON document is pretty-printed (2-space indent), repairing common
 *   copy-paste damage like trailing commas or smart quotes;
 * - JSON inside ``` fences or on its own lines within prose is formatted;
 * - literal "\n" sequences become real line breaks;
 * - trailing spaces and runs of blank lines are tidied.
 */
export function beautify(input: string): BeautifyResult {
  const original = input;
  const text = input.replace(/\r\n?/g, "\n");
  const trimmed = text.trim();

  // 1. The whole note is JSON (possibly wrapped in a ``` fence).
  const fenced = trimmed.match(/^```([\w-]*)[ \t]*\n([\s\S]*?)\n```$/);
  const candidate = fenced ? fenced[2] : trimmed;
  if (looksLikeJson(candidate) || /^"[\[{]/.test(candidate)) {
    const result = formatJson(candidate);
    if (!result.ok) {
      return {
        text: original,
        changed: false,
        summary: `JSON error on line ${result.error.line + (fenced ? 1 : 0)}: ${result.error.message}`,
        error: result.error,
      };
    }
    const output = fenced ? `\`\`\`${fenced[1]}\n${result.output}\n\`\`\`` : result.output;
    return {
      text: output,
      changed: output !== original,
      summary: output !== original ? "Formatted JSON" : "JSON is already formatted",
    };
  }

  // 2. Prose that may contain JSON.
  let next = unescapeLiteralNewlines(text);
  let blocks = 0;
  next = next.replace(FENCE, (block, lang: string, body: string) => {
    if (lang && !/^(json5?|jsonc)$/i.test(lang)) return block;
    const result = formatJson(body);
    if (!result.ok || !looksLikeJson(body)) return block;
    blocks++;
    return `\`\`\`${lang}\n${result.output}\n\`\`\``;
  });
  const embedded = formatEmbeddedJson(next);
  next = tidyWhitespace(embedded.text);
  blocks += embedded.count;

  const changed = next !== original;
  let summary = "Already tidy — nothing to change";
  if (changed) {
    summary = blocks
      ? `Formatted ${blocks} JSON block${blocks === 1 ? "" : "s"} and tidied spacing`
      : "Tidied spacing and line breaks";
  }
  return { text: next, changed, summary };
}

/** Cheap check for the editor's JSON badge. */
export function jsonStatus(text: string): "valid" | "invalid" | "none" {
  const trimmed = text.trim();
  if (!looksLikeJson(trimmed)) return "none";
  return formatJson(trimmed).ok ? "valid" : "invalid";
}

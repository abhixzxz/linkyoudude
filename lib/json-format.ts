// Lossless, forgiving JSON pretty-printer.
//
// It re-emits the original tokens rather than round-tripping through
// JSON.parse, so numbers like 12345678901234567890 or 1.0 keep their exact
// text. It also repairs what tends to break JSON copied between apps and LLMs:
// trailing commas, // and /* */ comments, 'single' or “smart” quotes, unquoted
// keys, raw line breaks inside strings, and Python's True/False/None.

type Node =
  | { kind: "object"; entries: Array<[key: string, value: Node]> }
  | { kind: "array"; items: Node[] }
  | { kind: "scalar"; text: string };

export type JsonError = { message: string; line: number; column: number };
export type JsonFormatResult =
  | { ok: true; output: string; end: number }
  | { ok: false; error: JsonError };

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly index: number,
  ) {
    super(message);
  }
}

const OPEN_QUOTES: Record<string, string> = {
  '"': '"',
  "'": "'",
  "“": "”", // “ ”
  "”": "”",
  "‘": "’", // ‘ ’
};
const STRICT_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const LOOSE_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const PYTHON_LITERALS: Record<string, string> = { True: "true", False: "false", None: "null" };

class Parser {
  i: number;
  constructor(
    readonly src: string,
    start = 0,
  ) {
    this.i = start;
  }

  fail(message: string, at = this.i): never {
    throw new JsonSyntaxError(message, at);
  }

  skipSpace() {
    const s = this.src;
    while (this.i < s.length) {
      const c = s[this.i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "﻿" || c === " ") {
        this.i++;
      } else if (c === "/" && s[this.i + 1] === "/") {
        while (this.i < s.length && s[this.i] !== "\n") this.i++;
      } else if (c === "/" && s[this.i + 1] === "*") {
        const close = s.indexOf("*/", this.i + 2);
        if (close === -1) this.fail("Unclosed /* comment");
        this.i = close + 2;
      } else {
        break;
      }
    }
  }

  value(): Node {
    this.skipSpace();
    const c = this.src[this.i];
    if (c === "{") return this.object();
    if (c === "[") return this.array();
    if (c !== undefined && c in OPEN_QUOTES) return { kind: "scalar", text: this.string() };
    if (c === undefined) this.fail("Unexpected end of input");
    const word = this.word();
    if (word === "true" || word === "false" || word === "null") return { kind: "scalar", text: word };
    if (word in PYTHON_LITERALS) return { kind: "scalar", text: PYTHON_LITERALS[word] };
    if (STRICT_NUMBER.test(word)) return { kind: "scalar", text: word };
    if (LOOSE_NUMBER.test(word)) return { kind: "scalar", text: normalizeNumber(word) };
    return this.fail(word ? `Unexpected "${word.slice(0, 20)}"` : `Unexpected "${c}"`);
  }

  word(): string {
    const start = this.i;
    while (this.i < this.src.length && /[\w$.+\-]/.test(this.src[this.i])) this.i++;
    return this.src.slice(start, this.i);
  }

  string(): string {
    const s = this.src;
    const open = s[this.i];
    const close = OPEN_QUOTES[open];
    const start = this.i;
    this.i++;
    let decoded = "";
    let canKeepRaw = open === '"';
    while (true) {
      if (this.i >= s.length) this.fail("Unclosed string", start);
      const c = s[this.i];
      if (c === close || (open !== '"' && open !== "'" && c === '"')) break;
      if (c === "\\") {
        const next = s[this.i + 1];
        const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", "/": "/", "\\": "\\", '"': '"', "'": "'" };
        if (next === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(this.i + 2, this.i + 6))) {
          decoded += String.fromCharCode(parseInt(s.slice(this.i + 2, this.i + 6), 16));
          this.i += 6;
          continue;
        }
        if (next === undefined) this.fail("Unclosed string", start);
        if (!(next in simple) || next === "'") canKeepRaw = false;
        decoded += simple[next] ?? next;
        this.i += 2;
        continue;
      }
      if (c < " ") canKeepRaw = false; // raw line break or tab inside a string
      decoded += c;
      this.i++;
    }
    this.i++; // closing quote
    // Valid JSON strings are kept byte for byte (including their escapes).
    return canKeepRaw ? s.slice(start, this.i) : JSON.stringify(decoded);
  }

  key(): string {
    this.skipSpace();
    const c = this.src[this.i];
    if (c !== undefined && c in OPEN_QUOTES) return this.string();
    const start = this.i;
    while (this.i < this.src.length && /[\w$\-]/.test(this.src[this.i])) this.i++;
    if (this.i === start) this.fail(c === undefined ? "Unexpected end of input" : `Expected a key but found "${c}"`);
    return JSON.stringify(this.src.slice(start, this.i));
  }

  object(): Node {
    this.i++; // {
    const entries: Array<[string, Node]> = [];
    while (true) {
      this.skipSpace();
      if (this.src[this.i] === "}") {
        this.i++;
        return { kind: "object", entries };
      }
      const key = this.key();
      this.skipSpace();
      if (this.src[this.i] !== ":") this.fail(`Expected ":" after key ${key}`);
      this.i++;
      entries.push([key, this.value()]);
      this.skipSpace();
      const c = this.src[this.i];
      if (c === ",") this.i++;
      else if (c !== "}") this.fail(c === undefined ? 'Missing "}"' : `Expected "," or "}" but found "${c}"`);
    }
  }

  array(): Node {
    this.i++; // [
    const items: Node[] = [];
    while (true) {
      this.skipSpace();
      if (this.src[this.i] === "]") {
        this.i++;
        return { kind: "array", items };
      }
      items.push(this.value());
      this.skipSpace();
      const c = this.src[this.i];
      if (c === ",") this.i++;
      else if (c !== "]") this.fail(c === undefined ? 'Missing "]"' : `Expected "," or "]" but found "${c}"`);
    }
  }
}

function normalizeNumber(text: string) {
  let t = text.startsWith("+") ? text.slice(1) : text;
  const sign = t.startsWith("-") ? "-" : "";
  if (sign) t = t.slice(1);
  if (t.startsWith(".")) t = `0${t}`;
  t = t.replace(/\.(?=[eE]|$)/, "");
  t = t.replace(/^0+(?=\d)/, "");
  return sign + t;
}

function print(node: Node, indent: string, step: string): string {
  if (node.kind === "scalar") return node.text;
  const inner = indent + step;
  if (node.kind === "array") {
    if (node.items.length === 0) return "[]";
    return `[\n${node.items.map((item) => inner + print(item, inner, step)).join(",\n")}\n${indent}]`;
  }
  if (node.entries.length === 0) return "{}";
  return `{\n${node.entries
    .map(([key, value]) => `${inner}${key}: ${print(value, inner, step)}`)
    .join(",\n")}\n${indent}}`;
}

function position(src: string, index: number) {
  const before = src.slice(0, index);
  const line = before.split("\n").length;
  return { line, column: index - before.lastIndexOf("\n") };
}

/**
 * Parses one JSON value starting at `start` and pretty-prints it with
 * two-space indentation. `end` is where the value stopped in `src`.
 */
export function formatJsonAt(src: string, start = 0, indent = "  "): JsonFormatResult {
  const parser = new Parser(src, start);
  try {
    const node = parser.value();
    // Double-encoded JSON ("{\"a\":1}") is unwrapped and formatted too.
    if (node.kind === "scalar" && node.text.startsWith('"')) {
      const inner = JSON.parse(node.text) as string;
      const nested = formatJson(inner, indent);
      if (nested.ok && /^\s*[[{]/.test(inner)) return { ...nested, end: parser.i };
    }
    return { ok: true, output: print(node, "", indent), end: parser.i };
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      return { ok: false, error: { message: error.message, ...position(src, error.index) } };
    }
    throw error;
  }
}

/** Formats `text` if the whole thing is a single JSON value. */
export function formatJson(text: string, indent = "  "): JsonFormatResult {
  const result = formatJsonAt(text, 0, indent);
  if (!result.ok) return result;
  const rest = new Parser(text, result.end);
  rest.skipSpace();
  if (rest.i < text.length) {
    return {
      ok: false,
      error: { message: "Unexpected text after the JSON value", ...position(text, rest.i) },
    };
  }
  return result;
}

/**
 * True when the text starts like a JSON object or array (as opposed to prose
 * such as "[Scene 1] ..."), so a parse error is worth reporting.
 */
export function looksLikeJson(text: string): boolean {
  return /^\s*(?:\{\s*(?:["'“‘}]|\/[/*]|[A-Za-z_$][\w$-]*\s*:)|\[\s*(?:["'“‘{[\]\d-]|\/[/*]|true\b|false\b|null\b))/.test(text);
}

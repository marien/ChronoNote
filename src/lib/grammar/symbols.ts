/** The one definition of which characters are symbols (docs/design/line-tokenizer-design.md).
 * Everything that needs a regex over them builds it from these, so a new symbol is added in one place. */
/** Action states: open, done, deferred, won't-do. */
export const ACTION_SYMBOLS = "#vx>";
/** Agenda topic states: open, discussed, skipped. Kept out of action counts. */
export const TOPIC_SYMBOLS = "o.,";
/** List bullets. */
export const BULLET_SYMBOLS = "-*";

/** Regex character classes for the sets above, for use inside `new RegExp(String.raw`...`)`. */
export const ACTION_CLASS = `[${ACTION_SYMBOLS}]`;
export const TOPIC_CLASS = `[${TOPIC_SYMBOLS}]`;
export const BULLET_CLASS = `[${BULLET_SYMBOLS}]`;

/** One character of an `@name`: a letter, accent or digit in any script, `_` or `-` (so @René, @Zoë, @Łukasz).
 * `\w` alone is ASCII-only in JavaScript and cut names at the first accented letter. Needs the `u` flag. */
export const NAME_CHAR = String.raw`[\p{L}\p{M}\p{N}_-]`;
/** What may not stand right before a name's `@`: a word character (an email address) or `@`/`/` (a URL path). */
export const NAME_GLUE = String.raw`[\p{L}\p{M}\p{N}_@/]`;

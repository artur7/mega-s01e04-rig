export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  // Owner from the last event, including an explicit null.
  owner: string | null;
  // All valid events for this job; retries counts only status === 'retry'.
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  // Error from the last event, or null when that event has no error.
  lastError: string | null;
  // Earliest/latest instants, retaining the original timestamp strings and offsets.
  firstAt: string;
  lastAt: string;
};

export type ReadNightResult =
  | { night: string; missing: true; rows: []; badLines: 0 }
  | { night: string; missing: false; rows: DigestRow[]; badLines: number };

/**
 * Synchronously read runsDir/<night>.jsonl without modifying it.
 * Implemented/exported as readNight in src/digest/reader.ts.
 *
 * night must be a real calendar date in YYYY-MM-DD form; invalid names throw
 * RangeError before filesystem access. Only ENOENT means missing; other I/O
 * errors propagate. Existing empty files return missing: false and no rows.
 *
 * Ignore blank lines. Count each nonblank invalid JSON or wrong-shaped value
 * once in badLines and continue. Valid objects require a nonempty job, an
 * ISO-8601 at with an explicit offset (or Z), a RunStatus, an owner that is a
 * string or null, and an optional string error. Extra fields are ignored.
 *
 * Group valid events by exact job, with rows sorted by code-unit job order.
 * First/last refer to chronological instants, not file order; ties retain file
 * order (the later line is last). runs includes retries. Last-event fields
 * never inherit an earlier owner or error, even after a successful retry.
 */
export type ReadNight = (runsDir: string, night: string) => ReadNightResult;

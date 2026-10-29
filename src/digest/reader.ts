import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function isTimestamp(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match || !isCalendarDate(match[1])) return false;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return false;
  const offset = match[5].replace(':', '');
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(3)) > 59)) return false;
  return Number.isFinite(Date.parse(value));
}

function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return typeof event.job === 'string'
    && event.job.length > 0
    && typeof event.at === 'string'
    && isTimestamp(event.at)
    && (event.status === 'ok' || event.status === 'retry' || event.status === 'fail')
    && (typeof event.owner === 'string' || event.owner === null)
    && (!Object.hasOwn(event, 'error') || typeof event.error === 'string');
}

function compareInstants(left: string, right: string): number {
  const difference = Date.parse(left) - Date.parse(right);
  if (difference !== 0) return difference;
  // Date.parse truncates sub-millisecond precision; the log need not.
  const leftFraction = /\.(\d+)/.exec(left)?.[1] ?? '';
  const rightFraction = /\.(\d+)/.exec(right)?.[1] ?? '';
  const precision = Math.max(leftFraction.length, rightFraction.length);
  const a = leftFraction.padEnd(precision, '0');
  const b = rightFraction.padEnd(precision, '0');
  return a < b ? -1 : a > b ? 1 : 0;
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isCalendarDate(night)) throw new RangeError('night must be a real YYYY-MM-DD date');

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { night, missing: true, rows: [], badLines: 0 };
    }
    throw error;
  }

  const jobs = new Map<string, DigestRow>();
  let badLines = 0;
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error: unknown) {
      if (!(error instanceof SyntaxError)) throw error;
      badLines++;
      continue;
    }
    if (!isRunEvent(value)) {
      badLines++;
      continue;
    }

    const row = jobs.get(value.job);
    if (!row) {
      jobs.set(value.job, {
        job: value.job,
        owner: value.owner,
        runs: 1,
        retries: value.status === 'retry' ? 1 : 0,
        lastStatus: value.status,
        lastError: value.error ?? null,
        firstAt: value.at,
        lastAt: value.at,
      });
      continue;
    }
    row.runs++;
    if (value.status === 'retry') row.retries++;
    if (compareInstants(value.at, row.firstAt) < 0) row.firstAt = value.at;
    if (compareInstants(value.at, row.lastAt) >= 0) {
      row.lastAt = value.at;
      row.owner = value.owner;
      row.lastStatus = value.status;
      row.lastError = value.error ?? null;
    }
  }

  return {
    night,
    missing: false,
    rows: [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0),
    badLines,
  };
};

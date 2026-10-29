import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const directories: string[] = [];

function scratchDirectory(): string {
  const directory = join(process.cwd(), `.reader-test-${randomUUID()}`);
  mkdirSync(directory);
  directories.push(directory);
  return directory;
}

function readLines(lines: unknown[]) {
  const directory = scratchDirectory();
  writeFileSync(join(directory, `${night}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n'));
  return readNight(directory, night);
}

function event(overrides: Record<string, unknown> = {}) {
  return { job: 'job', at: '2026-10-29T01:00:00+01:00', status: 'ok', owner: 'rook', ...overrides };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('readNight', () => {
  it('aggregates the real night without dropping null owners or malformed lines', () => {
    expect(readNight('runs', night)).toEqual({
      night,
      missing: false,
      badLines: 1,
      rows: [
        { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
        { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
        { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
        { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
        { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
      ],
    });
  });

  it('distinguishes missing from empty and ignores blank lines', () => {
    const directory = scratchDirectory();
    expect(readNight(directory, night)).toEqual({ night, missing: true, rows: [], badLines: 0 });
    writeFileSync(join(directory, `${night}.jsonl`), '');
    expect(readNight(directory, night)).toEqual({ night, missing: false, rows: [], badLines: 0 });
    writeFileSync(join(directory, `${night}.jsonl`), `\n \t\r\n${JSON.stringify(event())}\r\n\n`);
    expect(readNight(directory, night)).toMatchObject({ missing: false, badLines: 0, rows: [{ runs: 1 }] });
  });

  it.each(['../2026-10-28', '2026-2-03', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-01-00', '2026-13-01', '2026-10-28\n'])(
    'rejects invalid night %j before filesystem access',
    invalidNight => {
      expect(() => readNight('\0', invalidNight)).toThrow(RangeError);
    },
  );

  it.each(['2000-02-29', '2024-02-29', '2026-12-31', '0099-01-01'])('accepts real calendar date %s', validNight => {
    expect(readNight(scratchDirectory(), validNight).missing).toBe(true);
  });

  it('propagates filesystem failures other than ENOENT', () => {
    const directory = scratchDirectory();
    mkdirSync(join(directory, `${night}.jsonl`));
    expect(() => readNight(directory, night)).toThrow();
    writeFileSync(join(directory, 'not-a-directory'), '');
    expect(() => readNight(join(directory, 'not-a-directory'), night)).toThrow(expect.objectContaining({ code: 'ENOTDIR' }));
  });

  it('counts malformed JSON and wrong-shaped values once each, allowing extra fields', () => {
    const invalid = [
      null, [], 'text', 1, true, {},
      event({ job: '' }), event({ job: 1 }), event({ owner: undefined }), event({ owner: false }),
      event({ status: 'unknown' }), event({ error: null }), event({ error: 3 }),
      event({ at: null }), event({ at: '2026-10-29T01:00:00' }),
      event({ at: '2026-02-30T01:00:00Z' }), event({ at: '2026-10-29T24:00:00Z' }),
      event({ at: '2026-10-29T01:60:00Z' }), event({ at: '2026-10-29T01:00:60Z' }),
      event({ at: '2026-10-29T01:00:00+24:00' }), event({ at: '2026-10-29T01:00:00+01:60' }),
    ];
    const directory = scratchDirectory();
    writeFileSync(join(directory, `${night}.jsonl`), [
      '{broken', ...invalid.map(value => JSON.stringify(value)),
      JSON.stringify(event({ owner: null, extra: { allowed: true } })),
    ].join('\n'));
    expect(readNight(directory, night)).toMatchObject({
      badLines: invalid.length + 1,
      rows: [{ job: 'job', runs: 1, owner: null }],
    });
  });

  it('uses chronological instants and later file lines for ties, retaining offsets', () => {
    const result = readLines([
      event({ at: '2026-10-29T03:00:00+02:00', status: 'fail', error: 'latest failure' }),
      event({ at: '2026-10-29T02:30:00+03:00', status: 'retry', error: 'earlier retry' }),
      event({ at: '2026-10-29T02:00:00+01:00', owner: null }),
      event({ at: '2026-10-28T23:30:00Z', status: 'retry' }),
    ]);
    expect(result.rows).toEqual([{
      job: 'job', owner: null, runs: 4, retries: 2, lastStatus: 'ok', lastError: null,
      firstAt: '2026-10-29T02:30:00+03:00', lastAt: '2026-10-29T02:00:00+01:00',
    }]);
  });

  it('takes an error only from the final event, including an empty error', () => {
    expect(readLines([
      event({ at: '2026-10-29T02:00:00Z', status: 'fail', error: '' }),
      event({ at: '2026-10-29T01:00:00Z', status: 'fail', error: 'old' }),
    ]).rows[0]).toMatchObject({ lastStatus: 'fail', lastError: '' });
    expect(readLines([
      event({ status: 'fail', error: 'old' }),
      event({ status: 'fail' }),
    ]).rows[0]).toMatchObject({ lastStatus: 'fail', lastError: null });
  });

  it('orders fractional instants beyond millisecond precision', () => {
    expect(readLines([
      event({ at: '2026-10-29T01:00:00.0002Z', status: 'fail', error: 'latest' }),
      event({ at: '2026-10-29T01:00:00.0001Z' }),
    ]).rows[0]).toMatchObject({
      firstAt: '2026-10-29T01:00:00.0001Z', lastAt: '2026-10-29T01:00:00.0002Z', lastError: 'latest',
    });
  });

  it('groups exact job names and sorts by code units, not locale', () => {
    expect(readLines(['ä', 'a', 'Z', '__proto__', 'a'].map(job => event({ job }))).rows.map(row => [row.job, row.runs]))
      .toEqual([['Z', 1], ['__proto__', 1], ['a', 2], ['ä', 1]]);
  });
});

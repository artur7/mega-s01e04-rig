import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { DigestRow, ReadNightResult } from '../src/digest/types.js';

const baseConfig = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };

// Fixture nights live in a throwaway directory inside test/ (git-ignored), never in runs/.
let runsDir: string;

const nightFull = [
  '{"at":"2026-10-28T23:10:00+01:00","job":"plain/alpha","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T22:05:00+01:00","job":"flaky/beta","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T22:06:00+01:00","job":"flaky/beta","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T22:07:00+01:00","job":"flaky/beta","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-10-28T22:08:00+01:00","job":"flaky/beta","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T01:00:00Z","job":"nudge/gamma","status":"retry","owner":"rook","error":"lock held"}',
  '{"at":"2026-10-28T01:01:00Z","job":"nudge/gamma","status":"retry","owner":"rook","error":"lock held"}',
  '{"at":"2026-10-28T01:02:00Z","job":"nudge/gamma","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T04:00:01+01:00","job":"broken/delta","status":"fail","owner":"lane-07","error":"quota exceeded"}',
  '{"at":"2026-10-28T05:41:09+01:00","job":"orphan/epsilon","status":"ok","owner":null}',
].join('\n');

const nightWithBadLine = [
  '{"at":"2026-10-27T23:00:05+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-10-27T23:00:',
  '',
  '{"at":"2026-10-27T01:00:04+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
].join('\n');

const JOBS_IN_ORDER = ['broken/delta', 'flaky/beta', 'nudge/gamma', 'orphan/epsilon', 'plain/alpha'];

function config(): RigConfig {
  return { ...baseConfig, runsDir };
}

// Text nodes removed: what remains is the element and attribute structure of one row.
// Comparing two rows' structure shows whether one is emphasised, without assuming how.
function rowFor(html: string, job: string): string {
  const at = html.indexOf(job);
  expect(at, `job ${job} present in page`).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf('<tr', at);
  const end = html.indexOf('</tr>', at);
  return html.slice(start, end + '</tr>'.length);
}

function structureOf(row: string): string {
  return row.replace(/>[^<]*</g, '><');
}

async function getJson(path: string) {
  const res = await createApp(config()).request(path);
  return { status: res.status, body: (await res.json()) as ReadNightResult };
}

async function getHtml(path: string) {
  const res = await createApp(config()).request(path);
  return { status: res.status, html: await res.text() };
}

function rowOf(result: ReadNightResult, job: string): DigestRow {
  const row = result.rows.find((r) => r.job === job);
  expect(row, `row ${job} in JSON`).toBeDefined();
  return row as DigestRow;
}

beforeAll(() => {
  runsDir = mkdtempSync(join(import.meta.dirname, '.digest-tmp-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), nightFull + '\n');
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), nightWithBadLine + '\n');
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as ReadNightResult JSON with 200', async () => {
    const { status, body } = await getJson('/api/digest/2026-10-28');
    expect(status).toBe(200);
    expect(body).toMatchObject({ night: '2026-10-28', missing: false, badLines: 0 });
    expect(body.rows.map((r) => r.job)).toEqual(JOBS_IN_ORDER);
  });

  it('reports a missing night with 404 and no rows', async () => {
    const { status, body } = await getJson('/api/digest/2026-10-25');
    expect(status).toBe(404);
    expect(body).toMatchObject({ night: '2026-10-25', missing: true, rows: [] });
  });

  it('answers 200 with no rows for an empty night', async () => {
    const { status, body } = await getJson('/api/digest/2026-10-26');
    expect(status).toBe(200);
    expect(body).toMatchObject({ night: '2026-10-26', missing: false, rows: [], badLines: 0 });
  });

  it('counts a bad line and still returns the good rows', async () => {
    const { status, body } = await getJson('/api/digest/2026-10-27');
    expect(status).toBe(200);
    expect(body.missing).toBe(false);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync']);
    expect(rowOf(body, 'lane/sync').runs).toBe(2);
  });

  it('rejects a night that is not a calendar date with 400', async () => {
    expect((await getJson('/api/digest/not-a-night')).status).toBe(400);
    expect((await getJson('/api/digest/2026-02-30')).status).toBe(400);
  });

  it('keeps null owners, failure and retry counts, and original offsets', async () => {
    const { body } = await getJson('/api/digest/2026-10-28');

    expect(rowOf(body, 'orphan/epsilon').owner).toBeNull();

    const beta = rowOf(body, 'flaky/beta');
    expect(beta.runs).toBe(4);
    expect(beta.retries).toBe(3);
    expect(beta.lastStatus).toBe('ok');
    expect(beta.firstAt).toBe('2026-10-28T22:05:00+01:00');
    expect(beta.lastAt).toBe('2026-10-28T22:08:00+01:00');

    const gamma = rowOf(body, 'nudge/gamma');
    expect(gamma.retries).toBe(2);
    expect(gamma.lastError).toBeNull();
    expect(gamma.firstAt).toBe('2026-10-28T01:00:00Z');
    expect(gamma.lastAt).toBe('2026-10-28T01:02:00Z');

    const delta = rowOf(body, 'broken/delta');
    expect(delta.lastStatus).toBe('fail');
    expect(delta.lastError).toBe('quota exceeded');
  });
});

describe('GET /digest/:night', () => {
  it('renders the night with 200', async () => {
    const { status, html } = await getHtml('/digest/2026-10-28');
    expect(status).toBe(200);
    for (const job of JOBS_IN_ORDER) expect(html).toContain(job);
  });

  it('returns 404 for a night with no file', async () => {
    expect((await getHtml('/digest/2026-10-25')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const { status, html } = await getHtml('/digest/2026-10-26');
    expect(status).toBe(200);
    expect(html).toMatch(/nothing ran/i);
  });

  it('renders the good rows of a night with a bad line', async () => {
    const { status, html } = await getHtml('/digest/2026-10-27');
    expect(status).toBe(200);
    expect(html).toContain('lane/sync');
  });

  it('shows a null owner as an em dash in its row', async () => {
    const { html } = await getHtml('/digest/2026-10-28');
    expect(rowFor(html, 'orphan/epsilon')).toContain('—');
  });

  it('marks retries of three or more and failures, but not two retries', async () => {
    const { html } = await getHtml('/digest/2026-10-28');
    const plain = structureOf(rowFor(html, 'plain/alpha'));

    expect(structureOf(rowFor(html, 'flaky/beta'))).not.toBe(plain);
    expect(structureOf(rowFor(html, 'broken/delta'))).not.toBe(plain);
    expect(structureOf(rowFor(html, 'nudge/gamma'))).toBe(plain);
  });

  it('keeps the original offsets on the page', async () => {
    const { html } = await getHtml('/digest/2026-10-28');
    expect(html).toContain('2026-10-28T22:05:00+01:00');
    expect(html).toContain('2026-10-28T22:08:00+01:00');
    expect(html).toContain('2026-10-28T01:02:00Z');
  });
});

describe('HTML and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    const { body } = await getJson('/api/digest/2026-10-28');
    const { html } = await getHtml('/digest/2026-10-28');

    const jsonJobs = body.rows.map((r) => r.job);
    expect(jsonJobs).toEqual(JOBS_IN_ORDER);

    const positions = jsonJobs.map((job) => html.indexOf(job));
    positions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

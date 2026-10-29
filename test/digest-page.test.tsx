import { describe, expect, it } from 'vitest';
import { DigestPage } from '../src/views/digest.js';
import type { DigestRow } from '../src/digest/types.js';

const row = (over: Partial<DigestRow> & { job: string }): DigestRow => ({
  owner: 'rook',
  runs: 1,
  retries: 0,
  lastStatus: 'ok',
  lastError: null,
  firstAt: '2026-10-28T23:00:00+01:00',
  lastAt: '2026-10-28T23:00:00+01:00',
  ...over,
});

const render = async (rows: DigestRow[], badLines = 0) =>
  (await (<DigestPage result={{ night: '2026-10-28', missing: false, rows, badLines }} />).toString()) as string;

describe('digest page', () => {
  it('shows em dash for a null owner and keeps the original timestamp strings', async () => {
    const html = await render([row({ job: 'lane/sync', owner: null, firstAt: '2026-10-28T23:00:00+01:00' })]);
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('2026-10-28T23:00:00+01:00');
  });

  it('flags retries of three or more and failed jobs', async () => {
    const html = await render([
      row({ job: 'a/retried', retries: 3, lastStatus: 'retry' }),
      row({ job: 'b/failed', lastStatus: 'fail', lastError: 'boom' }),
      row({ job: 'c/quiet', retries: 2, lastStatus: 'retry' }),
    ]);
    expect(html).toContain('RETRY ×3');
    expect(html).toContain('FAIL');
    expect(html).not.toContain('RETRY ×2');
  });

  it('renders the nothing-ran note for an empty night', async () => {
    const html = await render([]);
    expect(html).toContain('nothing ran');
  });

  it('shows bad lines count', async () => {
    const html = await render([row({ job: 'a' })], 1);
    expect(html).toContain('1 bad line skipped');
  });
});

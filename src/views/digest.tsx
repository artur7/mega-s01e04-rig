import type { DigestRow, ReadNightResult } from '../digest/types.js';

// Retries at or above this count are flagged; the plan's threshold.
const RETRY_FLAG = 3;

function flagOf(row: DigestRow): { text: string; warn: boolean } {
  if (row.lastStatus === 'fail') return { text: 'FAIL', warn: true };
  if (row.retries >= RETRY_FLAG) return { text: `RETRY ×${row.retries}`, warn: true };
  return { text: '—', warn: false };
}

export function DigestPage({ result }: { result: Extract<ReadNightResult, { missing: false }> }) {
  const { night, rows, badLines } = result;
  return (
    <>
      <h1>digest · {night}</h1>
      <p class={badLines > 0 ? 'warn' : 'mute'}>
        {badLines} bad {badLines === 1 ? 'line' : 'lines'} skipped
      </p>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last</th>
              <th>flag</th>
              <th>error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const flag = flagOf(row);
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td class={flag.warn ? 'warn' : 'mute'}>{flag.text}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function MissingNight({ night }: { night: string }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <p class="warn">no run log for this night</p>
    </>
  );
}

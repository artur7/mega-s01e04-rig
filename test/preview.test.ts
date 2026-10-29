import { describe, expect, it } from 'vitest';
import { verifyPreview } from '../scripts/verify-preview.mjs';

function sample(marker = 'no marker set') {
  const rows = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']
    .map((job) => `<tr><td>${job}</td></tr>`).join('');
  return `<!doctype html><html><head><style>body { margin: 0; }</style></head><body><header><span>lane-07</span><span class="marker">${marker}</span></header><main><h1>digest · 2026-10-28</h1><table>${rows}</table></main></body></html>`;
}

describe('static preview safety checks', () => {
  it('accepts an unmarked replacement and an HTML-escaped marked banner', () => {
    expect(() => verifyPreview(sample())).not.toThrow();
    expect(() => verifyPreview(sample('sample&lt;&amp;&gt;'), {
      marked: true, marker: 'sample<&>',
    })).not.toThrow();
  });

  it('rejects a marker when an unmarked capture was requested', () => {
    expect(() => verifyPreview(sample('SAMPLE-MARKER'))).toThrow('lane banner');
    expect(() => verifyPreview(sample(), { marked: true })).toThrow('lane banner');
  });

  it('rejects incomplete pages, executable or external assets, and non-sample jobs', () => {
    for (const html of [
      sample().replace('</html>', ''),
      sample().replace('</head>', '<script>alert(1)</script></head>'),
      sample().replace('</head>', '<link rel="stylesheet" href="remote.css"></head>'),
      sample().replace('margin: 0', 'background: url(remote.png)'),
      sample().replace('rig/rotate-logs', 'private/job'),
    ]) {
      expect(() => verifyPreview(html)).toThrow('Preview rejected');
    }
  });
});

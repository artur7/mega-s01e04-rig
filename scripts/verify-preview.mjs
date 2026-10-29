import { readFileSync } from 'node:fs';

export function verifyPreview(html, { marked = false, marker = '' } = {}) {
  const reject = (message) => { throw new Error(`Preview rejected: ${message}`); };
  if (!/^<!doctype html>/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    reject('incomplete HTML document');
  }
  if (!/<style>[\s\S]+<\/style>/i.test(html) || /<script\b|<link\b|<(?:img|iframe|object|embed|audio|video)\b|\bon\w+\s*=|javascript:|@import\b|url\s*\(/i.test(html)) {
    reject('must be self-contained HTML with inline CSS and no client scripts');
  }
  const escape = (text) => text.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const expectedMarker = marked ? marker.trim() : 'no marker set';
  if (!expectedMarker || !html.includes(`<span class="marker">${escape(expectedMarker)}</span>`)) {
    reject('lane banner does not match the selected marker mode');
  }
  if (!html.includes('<span>lane-07</span>') || !html.includes('2026-10-28')) {
    reject('sample lane or night is missing');
  }
  const jobs = [...html.matchAll(/<tr>\s*<td>([^<]+)<\/td>/g)].map((match) => match[1]);
  const expectedJobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];
  if (JSON.stringify(jobs) !== JSON.stringify(expectedJobs)) {
    reject('expected exactly the five sorted template sample jobs');
  }
}

if (process.argv[1]?.endsWith('/verify-preview.mjs') || process.argv[1] === 'scripts/verify-preview.mjs') {
  try {
    verifyPreview(readFileSync(process.argv[2], 'utf8'), {
      marked: process.env.PREVIEW_MARKED === 'true',
      marker: process.env.LANE_MARKER ?? '',
    });
  } catch {
    // Never include the HTML or marker in a diagnostic.
    console.error('Preview validation failed: check completeness, inline-only assets, sample jobs, and banner mode.');
    process.exitCode = 1;
  }
}

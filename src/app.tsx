import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import type { ReadNightResult } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage, MissingNight } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    let result: ReadNightResult;
    try {
      result = readNight(config.runsDir, night);
    } catch (err) {
      if (err instanceof RangeError) return c.text(`invalid night: ${night}`, 400);
      throw err;
    }
    if (result.missing) {
      return c.html(
        <Layout title={`digest ${night}`} lane={lane()}>
          <MissingNight night={night} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage result={result} />
      </Layout>,
    );
  });

  return app;
}

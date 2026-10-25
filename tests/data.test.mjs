import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {events} from '../dist/events.js';
import {images} from '../dist/images.js';

const dist = new URL('../dist/', import.meta.url);

test('every event image file exists and belongs to a known event', () => {
  const ids = new Set(events.map(e => e.id));
  for (const [id, file] of Object.entries(images)) {
    assert.ok(ids.has(id), `image for unknown event ${id}`);
    assert.ok(existsSync(new URL(file, dist)), `missing ${file}`);
  }
});

test('event sources are https Telegram links', () => {
  for (const e of events) assert.match(e.source, /^https:\/\/t\.me\/[\w]+\/\d+$/, e.id);
});

test('index.html has a CSP and no inline scripts or handlers', () => {
  const html = readFileSync(new URL('index.html', dist), 'utf8');
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/);
  assert.doesNotMatch(readFileSync(new URL('app.js', dist), 'utf8'), /\son(error|click|load)=/);
});

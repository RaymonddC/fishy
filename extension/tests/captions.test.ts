// Reading captions from the meeting page.
//
// R1: "No message text leaves the laptop." The reader only reads the page and
// hands lines to the extension; the last test checks it has no way to reach
// the network.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { JSDOM } from 'jsdom';

import { createBlockReader, findCaptionsRegion, startCaptionWatcher } from '../src/content/meet-reader.ts';
import type { CaptionsSnapshot } from '../src/content/meet-reader.ts';

const FIXTURE = readFileSync(new URL('../../fixtures/meet/captions-dom.html', import.meta.url), 'utf8');

function page(html: string = FIXTURE): JSDOM {
  return new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`);
}

/** Lets queued page-change notifications run. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function watch(dom: JSDOM, clock = { now: 0 }) {
  const updates: CaptionsSnapshot[] = [];
  const watcher = startCaptionWatcher({
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    now: () => clock.now,
    onUpdate: (update) => updates.push(update),
  });
  return { watcher, updates, clock };
}

test('finds the captions region by its label', () => {
  const { document } = page().window;

  assert.equal(findCaptionsRegion(document)?.getAttribute('aria-label'), 'Captions');
});

test('still finds the region when the label or the internal name is gone', () => {
  const { document } = page().window;
  const region = document.querySelector('[role="region"]');
  assert.ok(region);

  region.removeAttribute('aria-label');
  assert.equal(findCaptionsRegion(document), region);

  region.removeAttribute('jsname');
  assert.equal(findCaptionsRegion(document), region);
});

test('reports no region when captions are off', () => {
  const { document } = page('<p>No captions here</p>').window;

  assert.equal(findCaptionsRegion(document), null);
});

test('reads the speaker and the text of each caption block', () => {
  const { document } = page().window;
  const region = findCaptionsRegion(document);
  assert.ok(region);

  const blocks = createBlockReader()(region);

  assert.deepEqual(
    blocks.map(({ speaker, text }) => ({ speaker, text })),
    [
      { speaker: 'Budi Santoso', text: 'Dewi, I need you to do something for me right now.' },
      { speaker: 'Dewi Lestari', text: 'Of course. What do you' },
    ],
  );
  assert.notEqual(blocks[0]?.key, blocks[1]?.key);
});

test('gives the same block the same key on every read', () => {
  const { document } = page().window;
  const region = findCaptionsRegion(document);
  assert.ok(region);
  const read = createBlockReader();

  assert.deepEqual(
    read(region).map((block) => block.key),
    read(region).map((block) => block.key),
  );
});

test('reads blocks by their shape when the class names have changed', () => {
  const { document } = page(FIXTURE.replace(/ class="[^"]*"/g, '')).window;
  const region = findCaptionsRegion(document);
  assert.ok(region);

  const blocks = createBlockReader()(region);

  assert.deepEqual(
    blocks.map(({ speaker, text }) => ({ speaker, text })),
    [
      { speaker: 'Budi Santoso', text: 'Dewi, I need you to do something for me right now.' },
      { speaker: 'Dewi Lestari', text: 'Of course. What do you' },
    ],
  );
});

test('in-place edits and a new speaker give one line per spoken turn', async () => {
  const dom = page();
  const { document } = dom.window;
  const { watcher, clock } = watch(dom);
  const texts = document.querySelectorAll('.ygicle');
  const second = texts[1];
  assert.ok(second);

  for (const [at, words] of [
    [300, 'Of course. What do you need'],
    [600, 'Of course. What do you need?'],
  ] as const) {
    clock.now = at;
    second.textContent = words;
    await settle();
  }

  clock.now = 900;
  const region = findCaptionsRegion(document);
  assert.ok(region);
  const third = region.children[0]?.cloneNode(true) as Element;
  third.querySelector('.NWpY1d')!.textContent = 'Budi Santoso';
  third.querySelector('.ygicle')!.textContent = 'Wire the payment today and keep it between us.';
  region.append(third);
  await settle();

  assert.deepEqual(watcher.snapshot().lines, [
    { id: 'c1', speaker: 'Budi Santoso', text: 'Dewi, I need you to do something for me right now.', final: true },
    { id: 'c2', speaker: 'Dewi Lestari', text: 'Of course. What do you need?', final: true },
    { id: 'c3', speaker: 'Budi Santoso', text: 'Wire the payment today and keep it between us.', final: false },
  ]);
  watcher.stop();
});

test('the watcher reports only the lines that changed', async () => {
  const dom = page();
  const { watcher, updates, clock } = watch(dom);
  assert.equal(updates.length, 1, 'the first read is reported');
  assert.equal(updates[0]?.lines.length, 2);

  clock.now = 500;
  const second = dom.window.document.querySelectorAll('.ygicle')[1];
  assert.ok(second);
  second.textContent = 'Of course. What do you need?';
  await settle();

  assert.equal(updates.length, 2);
  assert.deepEqual(updates[1], {
    status: 'live',
    lines: [{ id: 'c2', speaker: 'Dewi Lestari', text: 'Of course. What do you need?', final: false }],
  });
  watcher.stop();
});

test('the watcher waits while captions are off and picks them up when they appear', async () => {
  const dom = page('<p>Meeting in progress</p>');
  const { watcher, updates } = watch(dom);
  assert.deepEqual(updates, [{ status: 'waiting', lines: [] }]);

  dom.window.document.querySelector('main')!.innerHTML = FIXTURE;
  watcher.rescan();

  assert.equal(watcher.snapshot().status, 'live');
  assert.equal(watcher.snapshot().lines.length, 2);
  watcher.stop();
});

test('the watcher follows the page when it rebuilds the captions region, without duplicates', async () => {
  const dom = page();
  const { document } = dom.window;
  const { watcher } = watch(dom);
  const old = findCaptionsRegion(document);
  assert.ok(old);

  // Same words, brand new elements.
  const rebuilt = old.cloneNode(true) as Element;
  old.replaceWith(rebuilt);
  watcher.rescan();
  rebuilt.querySelectorAll('.ygicle')[1]!.textContent = 'Of course. What do you need?';
  await settle();

  assert.deepEqual(
    watcher.snapshot().lines.map((line) => line.text),
    ['Dewi, I need you to do something for me right now.', 'Of course. What do you need?'],
  );
  watcher.stop();
});

test('a quiet line becomes final when the watcher ticks', () => {
  const dom = page();
  const { watcher, updates, clock } = watch(dom);

  clock.now = 4000;
  watcher.tick();

  assert.deepEqual(updates.at(-1), {
    status: 'live',
    lines: [{ id: 'c2', speaker: 'Dewi Lestari', text: 'Of course. What do you', final: true }],
  });
  watcher.stop();
});

test('the caption reader has no way to reach the network', () => {
  const files = [
    '../src/content/meet-captions.ts',
    '../src/content/meet-reader.ts',
    '../src/content/meet-selectors.ts',
    '../src/core/captions/buffer.ts',
    '../src/core/captions/messages.ts',
  ];
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|\bimport\s*\(|navigator\.connection/;

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!forbidden.test(source), `${file} must not use a network API`);
    for (const [, from] of source.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(from?.startsWith('.'), `${file} may only import local files, not "${from}"`);
    }
  }
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function worker(scope = 'https://example.test/manhunt/') {
  const handlers = {};
  const deleted = [];
  const stored = new Map();
  const precached = [];
  const cache = {
    addAll: async urls => { precached.push(...urls); },
    match: async request => stored.get(typeof request === 'string' ? request : request.url),
    put: async (request, response) => { stored.set(request.url, response); }
  };
  const context = {
    URL, Response,
    fetch: async () => { throw new Error('Offline'); },
    self: {
      registration: { scope }, location: { origin: 'https://example.test' },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => {} }
    },
    caches: {
      open: async () => cache,
      keys: async () => ['other-app-cache', 'manhunt-demo-/other/-v1', 'manhunt-demo-/manhunt/-v1', 'manhunt-demo-/manhunt/-v2'],
      delete: async name => { deleted.push(name); }
    }
  };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), context);
  const lifecycle = type => new Promise((resolve, reject) => {
    handlers[type]({ waitUntil: promise => promise.then(resolve, reject) });
  });
  const request = (url, mode = 'cors', method = 'GET') => {
    let response;
    handlers.fetch({ request: { url, mode, method }, respondWith: value => { response = value; }, waitUntil: () => {} });
    return response;
  };
  return { lifecycle, request, stored, precached, deleted };
}

test('PWA shell assets resolve beneath the project scope', async () => {
  const sw = worker();
  await sw.lifecycle('install');
  assert.equal(sw.precached.length, 9);
  assert.ok(sw.precached.every(url => url.startsWith('https://example.test/manhunt/')));
  assert.ok(sw.precached.includes('https://example.test/manhunt/game.js'));
  assert.ok(sw.precached.includes('https://example.test/manhunt/icons/icon-512.png'));
});

test('cache cleanup never removes other projects or the current cache', async () => {
  const sw = worker();
  await sw.lifecycle('activate');
  assert.deepEqual(sw.deleted, ['manhunt-demo-/manhunt/-v1']);
});

test('worker does not intercept other origins, other scopes, or non-shell assets', () => {
  const sw = worker();
  for (const url of ['https://example.test/other/app.js', 'https://elsewhere.test/manhunt/', 'https://example.test/manhunt/missing.png']) {
    assert.equal(sw.request(url), undefined);
  }
  assert.equal(sw.request('https://example.test/manhunt/', 'navigate', 'POST'), undefined);
});

test('offline navigation gets the scoped app shell, not another project', async () => {
  const sw = worker();
  sw.stored.set('https://example.test/manhunt/index.html', new Response('field demo'));
  const response = await sw.request('https://example.test/manhunt/?offline', 'navigate');
  assert.equal(await response.text(), 'field demo');
});

test('missing script never receives an HTML fallback', async () => {
  const sw = worker();
  sw.stored.set('https://example.test/manhunt/index.html', new Response('field demo'));
  const response = await sw.request('https://example.test/manhunt/game.js');
  assert.equal(response.type, 'error');
  assert.equal(response.status, 0);
});

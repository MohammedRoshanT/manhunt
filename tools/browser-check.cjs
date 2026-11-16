const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const puppeteer = require(process.argv[2] || 'puppeteer-core');
const executablePath = process.argv[3] || process.env.BROWSER_PATH;
const root = path.resolve(__dirname, '..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'manhunt-check-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (!url.pathname.startsWith('/manhunt/')) {
    response.writeHead(404).end();
    return;
  }
  const file = path.resolve(root, decodeURIComponent(url.pathname.slice('/manhunt/'.length)) || 'index.html');
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(file, (error, content) => {
    response.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(error ? 'Not found' : content);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/manhunt/`;
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      const now = performance.now.bind(performance);
      let offset = 0;
      Object.defineProperty(performance, 'now', { value: () => now() + offset });
      window.advanceDemoClock = ms => { offset += ms; };
      const intervals = new Set();
      const set = window.setInterval.bind(window);
      const clear = window.clearInterval.bind(window);
      window.setInterval = (...args) => {
        const id = set(...args);
        intervals.add(id);
        return id;
      };
      window.clearInterval = id => {
        intervals.delete(id);
        clear(id);
      };
      window.activeDemoIntervals = () => intervals.size;
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { throw new Error('Unexpected microphone request'); };
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = () => { throw new Error('Unexpected location request'); };
        navigator.geolocation.watchPosition = () => { throw new Error('Unexpected location watch'); };
      }
    });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const text = selector => page.$eval(selector, node => node.textContent);
    const click = selector => page.click(selector);
    const fill = (selector, value) => page.$eval(selector, (input, next) => { input.value = next; }, value);
    const advance = async ms => {
      await page.evaluate(value => window.advanceDemoClock(value), ms);
      await delay(300);
    };
    const noOverflow = async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page must not scroll horizontally');
    };
    const screenshot = async name => {
      await noOverflow();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
    };
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await page.goto(base, { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate(() => window.activeDemoIntervals()), 0);
    await screenshot('start-phone');
    await page.setViewport({ width: 1280, height: 900, isMobile: true, hasTouch: true });
    await screenshot('start-desktop');
    await page.setViewport({ width: 360, height: 800, isMobile: true, hasTouch: true });
    await click('[data-screen="join"]');
    await fill('#joinCode', 'no');
    await click('#joinForm [type="submit"]');
    assert.match(await text('#formError'), /six-character/);
    await fill('#joinCode', 'ZZZ999');
    await click('#joinForm [type="submit"]');
    assert.match(await text('#formError'), /No waiting demo game/);
    await click('[data-screen="host"]');
    await fill('#gameName', ' ');
    await click('#hostForm [type="submit"]');
    assert.equal(await page.$eval('#gameName', input => input.getAttribute('aria-invalid')), 'true');
    await fill('#gameName', '<b>Night field</b>');
    await fill('#roundMinutes', '1.5');
    await click('#hostForm [type="submit"]');
    assert.match(await text('#formError'), /whole number/);
    await fill('#roundMinutes', '1');
    await fill('#headStartSeconds', '2');
    await click('#hostForm [type="submit"]');
    assert.ok((await text('.flow-copy')).includes('<b>Night field</b>'));
    assert.equal(await page.$('.flow-copy b'), null);
    const code = await text('#lobbyCode');
    assert.match(code, /^[A-Z2-9]{6}$/);
    await advance(300000);
    assert.ok(await page.$('#lobbyCode'));
    assert.equal(await page.evaluate(() => window.activeDemoIntervals()), 0);
    await page.select('#team-you', 'hunter');
    assert.ok(await page.$eval('#confirmDialog', dialog => dialog.open));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cancelAction');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'confirmAction');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'cancelAction');
    await click('#cancelAction');
    assert.equal(await page.$eval('#team-you', input => input.value), 'runner');
    await page.select('#team-you', 'hunter');
    await click('#confirmAction');
    assert.equal(await page.$eval('#team-you', input => input.value), 'hunter');
    await screenshot('lobby-phone');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async () => { throw new Error('Unavailable'); } }
    }));
    await click('#lobbyCopy');
    await page.waitForSelector('#codeDialog[open]');
    assert.equal(await page.$eval('#fallbackCode', input => input.value), code);
    await page.keyboard.press('Escape');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async value => { window.copiedDemoCode = value; } }
    }));
    await click('#lobbyCopy');
    assert.equal(await page.evaluate(() => window.copiedDemoCode), code);
    await click('[data-command="HOME"]');
    await page.reload({ waitUntil: 'networkidle0' });
    await click('[data-screen="join"]');
    await fill('#joinCode', code.toLowerCase());
    await click('#joinForm [type="submit"]');
    assert.ok(await page.$eval('#team-you', input => input.disabled));
    assert.equal(await page.$('[data-command="START"]'), null);
    await click('[data-command="HOST"]');
    await click('[data-command="START"]');
    assert.match(await text('#matchPhase'), /HEAD START/);
    assert.equal(await page.evaluate(() => window.activeDemoIntervals()), 1);
    await click('#pauseButton');
    assert.equal(await page.evaluate(() => window.activeDemoIntervals()), 0);
    const pausedHead = await text('#timerValue');
    await advance(300000);
    assert.equal(await text('#timerValue'), pausedHead);
    assert.ok(await page.$eval('[data-tag]', button => button.disabled));
    await click('#pauseButton');
    await advance(2100);
    assert.match(await text('#matchPhase'), /THE HUNT/);
    assert.equal(await text('#currentRole'), 'Hunter');
    assert.ok(await page.$eval('[data-voice="runner"]', button => button.disabled));
    await click('[data-voice="hunter"]');
    await click('.hunter-room [data-control="MIC"]');
    assert.match(await text('.hunter-room [data-control="MIC"]'), /on/);
    assert.equal(await page.$eval('.runner-room .call-controls', controls => controls.hidden), true);
    await click('#pauseButton');
    const pausedRound = await text('#timerValue');
    await advance(300000);
    assert.equal(await text('#timerValue'), pausedRound);
    await click('#pauseButton');
    await click('#safetyButton');
    assert.ok(await page.$eval('#safetyDialog', dialog => dialog.open));
    const stopped = await text('#timerValue');
    await advance(300000);
    assert.equal(await text('#timerValue'), stopped);
    await page.keyboard.press('Escape');
    assert.equal(await text('#pauseButton'), 'Resume');
    await click('#pauseButton');
    await screenshot('match-phone');
    await page.setViewport({ width: 1280, height: 900, isMobile: true, hasTouch: true });
    await screenshot('match-desktop');
    await page.setViewport({ width: 320, height: 740, isMobile: true, hasTouch: true });
    await screenshot('match-small-phone');
    await click('#tag-mika');
    assert.equal(await text('#jailCount'), '0');
    await click('#tagDispute');
    assert.equal(await text('#freeCount'), '2');
    await click('#tag-mika');
    await click('#jailConfirm');
    assert.equal(await text('#jailCount'), '1');
    await click('#jailbreakButton');
    await click('#cancelAction');
    assert.equal(await text('#jailCount'), '1');
    await click('#jailbreakButton');
    await click('#confirmAction');
    assert.equal(await text('#jailCount'), '0');
    for (const id of ['mika', 'ari']) {
      await click(`#tag-${id}`);
      await click('#jailConfirm');
    }
    assert.match(await text('#flowTitle'), /Hunterstake the field/);
    assert.equal(await page.evaluate(() => window.activeDemoIntervals()), 0);
    await advance(300000);
    assert.match(await text('#flowTitle'), /Hunters/);
    await screenshot('results-hunters-phone');
    await click('[data-command="AGAIN"]');
    assert.ok(await page.$('[data-command="START"]'));
    await advance(300000);
    assert.ok(await page.$('[data-command="START"]'));
    await click('[data-command="START"]');
    await advance(2100);
    await click('#tag-mika');
    await advance(61000);
    assert.match(await text('#flowTitle'), /Runners/);
    assert.equal(await page.$eval('#confirmDialog', dialog => dialog.open), false);
    await screenshot('results-runners-phone');
    await click('[data-command="AGAIN"]');
    await click('[data-command="START"]');
    await advance(2100);
    await click('#expireButton');
    await click('#cancelAction');
    assert.match(await text('#matchPhase'), /THE HUNT/);
    await click('#expireButton');
    await click('#confirmAction');
    assert.match(await text('#flowTitle'), /Runners/);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await page.$eval('.toast', element => getComputedStyle(element).transitionDuration), '0s');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload({ waitUntil: 'networkidle0' });
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
    assert.equal(manifest.start_url, './');
    for (const icon of manifest.icons) {
      assert.ok(await page.evaluate(async source => (await fetch(source)).ok, icon.src));
    }
    await page.evaluate(async () => {
      const cache = await caches.open('unrelated-project-cache');
      await cache.put('/keep-me', new Response('keep'));
    });
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const cache = await caches.open(names.find(name => name.startsWith('manhunt-demo-')));
      return (await cache.keys()).map(request => new URL(request.url).pathname);
    });
    assert.ok(cached.includes('/manhunt/game.js'));
    assert.ok(cached.includes('/manhunt/icons/icon-512.png'));
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.ok(await page.$('[data-screen="host"]'));
    await click('[data-screen="host"]');
    await click('#hostForm [type="submit"]');
    assert.ok(await page.$('#lobbyCode'));
    await page.setOfflineMode(false);
    const blockedPage = await browser.newPage();
    await blockedPage.evaluateOnNewDocument(() => {
      Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('Blocked'); } });
    });
    await blockedPage.goto(base, { waitUntil: 'networkidle0' });
    assert.match(await blockedPage.$eval('#storageNotice', node => node.textContent), /unavailable/);
    await blockedPage.click('[data-screen="host"]');
    await blockedPage.click('#hostForm [type="submit"]');
    assert.ok(await blockedPage.$('#lobbyCode'));
    assert.deepEqual(errors, []);
    console.log('PASS: host/join, validation, session reload, assignments, both timers, safety, tags, disputes, jailbreak, both wins, restart, voice isolation, clipboard paths, reduced motion, 320/360/1280 layouts, project-path PWA, offline play, blocked storage.');
  } finally {
    console.log(`Screenshots: ${artifacts}`);
    await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});

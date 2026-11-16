const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialState, transition, validateSettings, createGame, normalizeCode } = require('./game.js');

const settings = { name: 'Riverside Park', roundMinutes: 1, headStartSeconds: 10 };
const lobby = (host = true) => transition(initialState(), { type: 'LOBBY', game: createGame(settings, 'ABC234'), host });
const start = (headStartSeconds = 10) => transition(
  transition(initialState(), { type: 'LOBBY', game: createGame({ ...settings, headStartSeconds }, 'ABC234'), host: true }),
  { type: 'START', now: 1000 }
);
const act = (state, type, extra = {}) => transition(state, { type, now: 1000, ...extra });

test('setup validates bounded, whole values and normalizes codes', () => {
  assert.equal(validateSettings(settings), '');
  for (const invalid of [
    { name: ' ' }, { name: 'x'.repeat(49) }, { roundMinutes: 0 }, { roundMinutes: 61 },
    { roundMinutes: 1.5 }, { headStartSeconds: -1 }, { headStartSeconds: 301 }, { headStartSeconds: NaN }
  ]) assert.ok(validateSettings({ ...settings, ...invalid }));
  assert.equal(normalizeCode(' abc-234 '), 'ABC234');
});

test('setup and lobby never count down; only the host can start', () => {
  const setup = initialState();
  assert.deepEqual(act(setup, 'TICK', { now: 999999 }), setup);
  const waiting = lobby();
  assert.deepEqual(act(waiting, 'TICK', { now: 999999 }), waiting);
  assert.equal(act(lobby(false), 'START').phase, 'lobby');
});

test('head start begins on Start and transitions using an absolute deadline', () => {
  let state = start();
  assert.equal(state.phase, 'head-start');
  assert.equal(state.remainingMs, 10000);
  state = act(state, 'TICK', { now: 11500 });
  assert.equal(state.phase, 'active');
  assert.equal(state.remainingMs, 59500);
  assert.equal(state.deadline, 71000);
});

test('pause/resume preserves fractions of a second in both timed phases', () => {
  for (const headStart of [0, 10]) {
    let state = start(headStart);
    const phase = state.phase;
    state = act(state, 'PAUSE', { now: 1550 });
    const remaining = state.remainingMs;
    assert.equal(state.phase, 'paused');
    assert.equal(state.deadline, null);
    assert.deepEqual(act(state, 'TICK', { now: 500000 }), state);
    state = act(state, 'RESUME', { now: 500000 });
    assert.equal(state.phase, phase);
    assert.equal(state.deadline, 500000 + remaining);
  }
});

test('delayed ticks consume head start and round once, then stop at zero', () => {
  let state = act(start(), 'TICK', { now: 999999 });
  assert.equal(state.phase, 'finished');
  assert.equal(state.winner, 'runner');
  assert.equal(state.remainingMs, 0);
  assert.equal(state.deadline, null);
  assert.deepEqual(act(state, 'TICK', { now: 9999999 }), state);
});

test('assignments are host-only, require both teams, and lock after Start', () => {
  let state = lobby();
  state = act(state, 'TEAM', { id: 'you', team: 'hunter' });
  assert.equal(state.game.players[0].team, 'hunter');
  const guest = lobby(false);
  assert.deepEqual(act(guest, 'TEAM', { id: 'you', team: 'hunter' }), guest);
  for (const player of state.game.players.filter(p => p.team === 'runner')) state = act(state, 'TEAM', { id: player.id, team: 'hunter' });
  assert.equal(state.game.players.filter(p => p.team === 'runner').length, 1);
  state = act(state, 'START');
  assert.deepEqual(act(state, 'TEAM', { id: 'you', team: 'runner' }), state);
});

test('tags are pending until confirmed; disputes leave the runner free', () => {
  let state = start(0);
  state = act(state, 'TAG', { id: 'you' });
  assert.equal(state.pendingTag, 'you');
  assert.equal(state.game.players[0].jailed, false);
  state = act(state, 'DISPUTE');
  assert.equal(state.pendingTag, null);
  assert.equal(state.game.players[0].jailed, false);
  state = act(act(state, 'TAG', { id: 'you' }), 'JAIL');
  assert.equal(state.game.players[0].jailed, true);
  assert.deepEqual(act(state, 'TAG', { id: 'you' }), state);
});

test('jailbreak frees prisoners and hunters win only when all runners are jailed', () => {
  let state = start(0);
  state = act(act(state, 'TAG', { id: 'you' }), 'JAIL');
  state = act(state, 'JAILBREAK');
  assert.equal(state.game.players.some(p => p.jailed), false);
  for (const player of state.game.players.filter(p => p.team === 'runner')) {
    state = act(act(state, 'TAG', { id: player.id }), 'JAIL');
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.winner, 'hunter');
  assert.equal(state.pendingTag, null);
  assert.deepEqual(act(state, 'JAILBREAK'), state);
});

test('paused and head-start phases reject match actions', () => {
  for (const state of [start(), act(start(0), 'PAUSE')]) {
    for (const type of ['TAG', 'JAIL', 'JAILBREAK', 'EXPIRE']) {
      assert.deepEqual(act(state, type, { id: 'you' }), state);
    }
  }
});

test('timeout wins over a late tag confirmation and clears pending tags', () => {
  let state = act(start(0), 'TAG', { id: 'you' });
  state = act(state, 'JAIL', { now: 61000 });
  assert.equal(state.phase, 'finished');
  assert.equal(state.winner, 'runner');
  assert.equal(state.pendingTag, null);
});

test('play again resets prisoners, voice, timer, and results without auto-starting', () => {
  let state = act(start(0), 'EXPIRE');
  state = act(state, 'AGAIN');
  assert.equal(state.phase, 'lobby');
  assert.equal(state.deadline, null);
  assert.equal(state.winner, null);
  assert.equal(state.game.players.some(p => p.jailed), false);
  assert.equal(state.voiceOpen, false);
});

test('voice preview is restricted to the assigned team and never changes that role', () => {
  let state = start(0);
  assert.deepEqual(act(state, 'VOICE', { team: 'hunter' }), state);
  state = act(state, 'VOICE', { team: 'runner' });
  assert.equal(state.voiceOpen, true);
  assert.equal(state.game.players[0].team, 'runner');
});

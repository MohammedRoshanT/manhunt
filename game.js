(function (root) {
  'use strict';

  const running = phase => phase === 'head-start' || phase === 'active';
  const normalizeCode = code => String(code).replace(/[\s-]/g, '').toUpperCase();
  const initialState = () => ({
    phase: 'setup', screen: 'start', game: null, host: true, remainingMs: 0,
    deadline: null, pausedPhase: null, pendingTag: null, winner: null,
    voiceOpen: false, micPreview: false, audioPreview: false, notice: 'Ready when you are.'
  });

  function validateSettings(settings) {
    if (typeof settings.name !== 'string' || !settings.name.trim() || settings.name.trim().length > 48) {
      return 'Enter a game / location label between 1 and 48 characters.';
    }
    if (!Number.isInteger(settings.roundMinutes) || settings.roundMinutes < 1 || settings.roundMinutes > 60) {
      return 'Round length must be a whole number from 1 to 60 minutes.';
    }
    if (!Number.isInteger(settings.headStartSeconds) || settings.headStartSeconds < 0 || settings.headStartSeconds > 300) {
      return 'Head start must be a whole number from 0 to 300 seconds.';
    }
    return '';
  }

  function createGame(settings, code) {
    const error = validateSettings(settings);
    if (error) throw new Error(error);
    return {
      code, settings: { ...settings, name: settings.name.trim() },
      players: [
        { id: 'you', name: 'You', team: 'runner', jailed: false },
        { id: 'mika', name: 'Mika', team: 'runner', jailed: false },
        { id: 'ari', name: 'Ari', team: 'runner', jailed: false },
        { id: 'jo', name: 'Jo', team: 'hunter', jailed: false },
        { id: 'kai', name: 'Kai', team: 'hunter', jailed: false }
      ]
    };
  }

  function finish(state, winner) {
    return {
      ...state, phase: 'finished', winner, deadline: null, pendingTag: null,
      voiceOpen: false, micPreview: false, audioPreview: false,
      notice: winner === 'hunter' ? 'Every Runner is in jail together. Hunters win.' : 'Time is up with Runners still free. Runners win.'
    };
  }

  function advance(state, now) {
    if (!running(state.phase)) return state;
    if (now < state.deadline) return { ...state, remainingMs: state.deadline - now };
    if (state.phase === 'head-start') {
      return advance({
        ...state, phase: 'active', deadline: state.deadline + state.game.settings.roundMinutes * 60000,
        notice: 'Head start complete. The hunt is on — demo actions are ready.'
      }, now);
    }
    return finish({ ...state, remainingMs: 0 }, 'runner');
  }

  function transition(previous, action) {
    const state = Number.isFinite(action.now) ? advance(previous, action.now) : previous;
    const player = state.game?.players.find(p => p.id === action.id);
    const runners = state.game?.players.filter(p => p.team === 'runner') || [];
    switch (action.type) {
      case 'SCREEN':
        return state.phase === 'setup' ? { ...state, screen: action.screen } : state;
      case 'HOME':
        return ['setup', 'lobby', 'finished'].includes(state.phase) ? initialState() : state;
      case 'LOBBY':
        return state.phase === 'setup' ? {
          ...initialState(), phase: 'lobby', game: structuredClone(action.game), host: action.host,
          notice: 'Sample roster ready. Nothing counts down until the host starts.'
        } : state;
      case 'HOST':
        return state.phase === 'lobby' ? { ...state, host: true, notice: 'Local host controls restored on this device.' } : state;
      case 'TEAM':
        if (state.phase !== 'lobby' || !state.host || !player || !['hunter', 'runner'].includes(action.team) || player.team === action.team) return state;
        if (state.game.players.filter(p => p.team === player.team).length === 1) return state;
        return {
          ...state, game: { ...state.game, players: state.game.players.map(p => p.id === action.id ? { ...p, team: action.team } : p) },
          notice: `${player.name} is now a ${action.team === 'hunter' ? 'Hunter' : 'Runner'}.`
        };
      case 'START': {
        if (state.phase !== 'lobby' || !state.host || !runners.length || runners.length === state.game.players.length) return state;
        const headStart = state.game.settings.headStartSeconds * 1000;
        const remainingMs = headStart || state.game.settings.roundMinutes * 60000;
        return {
          ...state, phase: headStart ? 'head-start' : 'active', remainingMs, deadline: action.now + remainingMs,
          notice: headStart ? 'Runners scatter. Hunters wait. Demo head start has begun.' : 'The demo hunt has begun.'
        };
      }
      case 'TICK':
        return state;
      case 'PAUSE':
        return running(state.phase) ? {
          ...state, pausedPhase: state.phase, phase: 'paused', deadline: null,
          notice: action.safety ? 'Safety stop: paused on this device. No alert was sent to anyone.' : 'Paused locally. The clock and demo game actions are on hold.'
        } : state;
      case 'RESUME':
        return state.phase === 'paused' ? {
          ...state, phase: state.pausedPhase, pausedPhase: null, deadline: action.now + state.remainingMs,
          notice: 'Demo resumed on this device.'
        } : state;
      case 'TAG':
        return state.phase === 'active' && !state.pendingTag && player?.team === 'runner' && !player.jailed
          ? { ...state, pendingTag: player.id, notice: `Tag reported for ${player.name}. Confirm or dispute it; no jail change yet.` } : state;
      case 'DISPUTE':
        return state.phase === 'active' && state.pendingTag
          ? { ...state, pendingTag: null, notice: 'Tag disputed. The Runner stays free; no penalty in this demo.' } : state;
      case 'JAIL': {
        if (state.phase !== 'active' || !state.pendingTag) return state;
        const name = state.game.players.find(p => p.id === state.pendingTag).name;
        const next = {
          ...state, pendingTag: null,
          game: { ...state.game, players: state.game.players.map(p => p.id === state.pendingTag ? { ...p, jailed: true } : p) },
          notice: `${name}: tag confirmed, sent to demo jail.`
        };
        return next.game.players.filter(p => p.team === 'runner').every(p => p.jailed) ? finish(next, 'hunter') : next;
      }
      case 'JAILBREAK':
        return state.phase === 'active' && !state.pendingTag && runners.some(p => p.jailed) && runners.some(p => !p.jailed)
          ? {
            ...state, game: { ...state.game, players: state.game.players.map(p => ({ ...p, jailed: false })) },
            notice: 'Demo jailbreak! A free Runner reached jail and released every prisoner.'
          } : state;
      case 'EXPIRE':
        return state.phase === 'active' ? finish({ ...state, remainingMs: 0 }, 'runner') : state;
      case 'AGAIN':
        return state.phase === 'finished' ? {
          ...initialState(), phase: 'lobby', game: { ...state.game, players: state.game.players.map(p => ({ ...p, jailed: false })) },
          notice: 'Fresh round, same teams. Adjust assignments before starting again.'
        } : state;
      case 'VOICE':
        return (running(state.phase) || state.phase === 'paused') && action.team === state.game.players[0].team
          ? { ...state, voiceOpen: !state.voiceOpen, micPreview: false, audioPreview: false } : state;
      case 'MIC':
        return state.voiceOpen ? { ...state, micPreview: !state.micPreview } : state;
      case 'AUDIO':
        return state.voiceOpen ? { ...state, audioPreview: !state.audioPreview } : state;
      default:
        return state;
    }
  }

  const api = { initialState, transition, validateSettings, createGame, normalizeCode, running };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ManhuntGame = api;
})(globalThis);

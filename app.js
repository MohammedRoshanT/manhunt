(() => {
  'use strict';

  const { initialState, transition, validateSettings, createGame, normalizeCode, running } = ManhuntGame;
  const $ = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const teamName = team => team === 'hunter' ? 'Hunter' : 'Runner';
  const formatTime = ms => {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const storageKey = 'manhunt-demo-lobbies-v2';
  let state = initialState();
  let games = Object.create(null);
  let timer = null;
  let toastTimeout;
  let confirmation = null;

  function storageNotice(message) {
    $('storageNotice').hidden = false;
    $('storageNotice').textContent = message;
  }

  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    for (const [code, game] of Object.entries(saved)) {
      if (!/^[A-Z2-9]{6}$/.test(code) || !game?.settings || validateSettings(game.settings)) continue;
      const restored = createGame(game.settings, code);
      if (!Array.isArray(game.players) || game.players.length !== restored.players.length) continue;
      if (!restored.players.every(p => game.players.some(s => s.id === p.id && ['hunter', 'runner'].includes(s.team)))) continue;
      restored.players = restored.players.map(p => ({ ...p, team: game.players.find(s => s.id === p.id).team }));
      if (!['hunter', 'runner'].every(team => restored.players.some(p => p.team === team))) continue;
      games[code] = restored;
    }
  } catch {
    storageNotice('Session storage is unavailable or could not be read. You can still play; codes created now work only until this page reloads.');
  }

  function saveGames() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(games));
    } catch {
      storageNotice('This browser cannot save the lobby. You can still play and copy its code, but reloading will lose this session.');
    }
  }

  function showToast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => $('toast').classList.remove('show'), 5500);
  }

  function dispatch(action) {
    const previous = state;
    state = transition(state, { ...action, now: performance.now() });
    if (state.phase === 'lobby' && state !== previous) {
      games[state.game.code] = structuredClone(state.game);
      saveGames();
    } else if (previous.phase === 'lobby' && running(state.phase)) {
      delete games[state.game.code];
      saveGames();
    }
    if (running(state.phase) && timer === null) timer = setInterval(() => dispatch({ type: 'TICK' }), 200);
    if (!running(state.phase) && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (action.type === 'TICK' && previous.phase === state.phase) {
      renderClock();
      return;
    }
    if (state.phase === 'finished') {
      confirmation = null;
      $('confirmDialog').close();
      $('codeDialog').close();
    }
    render();
    const viewChanged = previous.screen !== state.screen ||
      (previous.phase !== state.phase && [previous.phase, state.phase].some(phase => ['setup', 'lobby', 'finished'].includes(phase)));
    if (viewChanged) {
      (state.phase === 'head-start' || state.phase === 'active' ? $('page-title') : $('flowTitle'))?.focus();
      window.scrollTo(0, 0);
    }
    if (previous.notice !== state.notice) showToast(state.notice);
  }

  const heading = (kicker, title, copy) => `<p class="eyebrow"><span class="eyebrow-line"></span>${kicker}</p>
    <h1 id="flowTitle" tabindex="-1">${title}</h1><p class="flow-copy">${copy}</p>`;
  const back = '<button type="button" class="text-button back-button" data-command="HOME">← Back to start</button>';
  const settingsSummary = game => `<dl class="settings-summary">
    <div><dt>Round</dt><dd>${game.settings.roundMinutes} min</dd></div>
    <div><dt>Head start</dt><dd>${game.settings.headStartSeconds} sec</dd></div>
    <div><dt>Players</dt><dd>${game.players.length} sample</dd></div></dl>`;

  function renderFlow() {
    const game = state.game;
    if (state.phase === 'setup' && state.screen === 'start') {
      $('flowScreen').innerHTML = `<div class="start-layout"><div class="start-main">
        ${heading('THE OUTSIDE IS YOUR PLAYGROUND', 'Go quiet.<br><span>Get moving.</span>', 'A field game of pursuit, close calls, and getting your team home. Try the whole round here — no shoes required.')}
        <div class="start-actions"><button class="field-button primary-action" data-screen="host">Host a game <span aria-hidden="true">↗</span></button>
        <button class="field-button" data-screen="join">Join a game <span aria-hidden="true">→</span></button></div>
        <p class="session-note">Single-device demo. Create a lobby, then try its code in Join. Codes stay in this tab’s session; they do not connect devices. Reloading ends a running round.</p>
        <p class="local-count">${Object.keys(games).length ? `${Object.keys(games).length} local ${Object.keys(games).length === 1 ? 'lobby' : 'lobbies'} ready to join.` : 'No local lobbies yet. Host one to get started.'}</p>
      </div><aside class="field-guide"><div class="guide-top"><span>FIELD NOTES / 01</span><span aria-hidden="true">⌖</span></div>
        <h2>Stay free.<br>Free your team.</h2><ol>
          <li><b>Scatter.</b><span>Runners get a head start. Hunters wait.</span></li>
          <li><b>Track & tag.</b><span>A confirmed tag sends a Runner to jail.</span></li>
          <li><b>Break them out.</b><span>A free Runner reaches jail; everyone goes free.</span></li>
        </ol><p>All Runners jailed together? Hunters win.<br>Someone free at the buzzer? Runners win.</p>
        <div class="guide-stamp">HUNTERS / RUNNERS<br><span>TWO TEAMS. ONE FIELD.</span></div>
      </aside></div>`;
    } else if (state.phase === 'setup' && state.screen === 'host') {
      $('flowScreen').innerHTML = `${back}<div class="form-layout"><div>
        ${heading('01 / SET THE FIELD', 'Your field.<br><span>Your rules.</span>', 'Set up a local demo. You’ll sort the sample teams in the lobby next.')}
        <p class="session-note">For a quick tour, choose 1 minute and a 5-second head start. The defaults leave more room to explore.</p></div>
        <form id="hostForm" class="field-form" novalidate>
          <label for="gameName">Game / location label</label><input id="gameName" name="name" value="Riverside Park" maxlength="48" required aria-describedby="nameHelp formError">
          <p class="input-help" id="nameHelp">A label only — this won’t look up a real place.</p>
          <label for="roundMinutes">Round length <span>minutes</span></label><input id="roundMinutes" name="roundMinutes" type="number" inputmode="numeric" min="1" max="60" step="1" value="20" required aria-describedby="roundHelp formError">
          <p class="input-help" id="roundHelp">1–60 minutes, after the head start.</p>
          <label for="headStartSeconds">Runner head start <span>seconds</span></label><input id="headStartSeconds" name="headStartSeconds" type="number" inputmode="numeric" min="0" max="300" step="1" value="120" required aria-describedby="headHelp formError">
          <p class="input-help" id="headHelp">0–300 seconds. Hunters wait while Runners scatter.</p>
          <p id="formError" class="form-error" role="alert" hidden></p>
          <button class="field-button primary-action" type="submit">Create demo lobby <span aria-hidden="true">→</span></button>
        </form></div>`;
    } else if (state.phase === 'setup') {
      $('flowScreen').innerHTML = `${back}<div class="form-layout"><div>
        ${heading('01 / FIND YOUR FIELD', 'Got a code?<br><span>Step inside.</span>', 'Join a demo lobby created in this tab’s browser session. There is no server or real multiplayer.')}
        <p class="session-note">Host a game first, copy its code, then return here. Codes from other devices, closed sessions, or started rounds won’t work.</p></div>
        <form id="joinForm" class="field-form" novalidate><label for="joinCode">Six-character demo code</label>
          <input id="joinCode" name="code" placeholder="ABC234" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="joinHelp formError" required>
          <p id="joinHelp" class="input-help">Letters and digits 2–9. Spaces and hyphens are ignored.</p>
          <p id="formError" class="form-error" role="alert" hidden></p><button type="submit" class="field-button primary-action">Join demo lobby <span aria-hidden="true">→</span></button>
          <button type="button" class="text-button" data-screen="host">No code? Host a game instead</button>
        </form></div>`;
    } else if (state.phase === 'lobby') {
      $('flowScreen').innerHTML = `${back}<div class="lobby-intro"><div>
        ${heading('02 / MUSTER POINT', 'Pick a side.<br><span>Make a plan.</span>', `${escape(game.settings.name)} · ${state.host ? 'You are the local host.' : 'You are viewing the joining-player demo.'}`)}</div>
        <div class="lobby-code"><span class="micro-label">THIS TAB’S DEMO CODE</span><strong id="lobbyCode">${game.code}</strong>
          <button type="button" class="text-button" id="lobbyCopy" data-command="COPY">Copy code ↗</button></div></div>
        ${settingsSummary(game)}
        <div class="section-heading"><h2>At the muster point</h2><span class="section-kicker">ALL PLAYERS ARE SAMPLES</span></div>
        <p class="section-copy">${state.host ? 'Assign teams before you start. Keep at least one Hunter and one Runner. Your role locks for the whole round.' : 'Only the host can assign teams or start. This is a local preview, not a second participant.'}</p>
        <ul class="lobby-roster">${game.players.map(player => `<li><span class="player-initial ${player.team}">${player.name[0]}</span>
          <div class="player-name"><b>${player.name}</b><small>${player.id === 'you' ? 'Current player · demo' : 'Sample player'}</small></div>
          <label class="sr-only" for="team-${player.id}">Team for ${player.name}</label>
          <select id="team-${player.id}" data-player="${player.id}" ${state.host ? '' : 'disabled'}>
            <option value="runner" ${player.team === 'runner' ? 'selected' : ''}>Runner</option>
            <option value="hunter" ${player.team === 'hunter' ? 'selected' : ''}>Hunter</option>
          </select></li>`).join('')}</ul>
        <div class="lobby-launch"><p><b>No countdown yet.</b><br>Start begins the head start, then the round. All tags and jailbreaks are simulated by you.</p>
          ${state.host ? '<button type="button" class="field-button primary-action" data-command="START">Start game →</button>' : '<button type="button" class="field-button" data-command="HOST">Switch to local host controls</button>'}</div>
        <p class="session-note">In a real game, agree boundaries, a jail landmark, and a safety word together first. This demo does not monitor safety or location.</p>`;
    } else if (state.phase === 'finished') {
      const jailed = game.players.filter(p => p.jailed).length;
      const free = game.players.filter(p => p.team === 'runner' && !p.jailed).length;
      $('flowScreen').innerHTML = `<div class="results ${state.winner}">
        ${heading('04 / BACK AT BASE · DEMO RESULT', `${teamName(state.winner)}s<br><span>take the field.</span>`, escape(state.notice))}
        <div class="result-mark" aria-hidden="true">${state.winner === 'hunter' ? '⌖' : '↗'}</div>
        <dl class="settings-summary"><div><dt>Runners free</dt><dd>${free}</dd></div><div><dt>In jail</dt><dd>${jailed}</dd></div><div><dt>Round remaining</dt><dd>${formatTime(state.remainingMs)}</dd></div></dl>
        <p class="flow-copy">${escape(game.settings.name)} · ${game.settings.roundMinutes}-minute round. All players and outcomes were simulated on this device.</p>
        <div class="action-row"><button class="field-button primary-action" data-command="AGAIN">Play again →</button><button class="field-button" data-command="HOME">Back to start</button></div>
        <p class="session-note">Play again returns to the host lobby with the same teams and settings. No timer starts until you say so.</p>
      </div>`;
    }
  }

  function renderClock() {
    if (!state.game) return;
    const phase = state.phase === 'paused' ? state.pausedPhase : state.phase;
    $('timerValue').textContent = formatTime(state.remainingMs);
    $('timerLabel').textContent = phase === 'head-start' ? 'RUNNER HEAD START' : 'ROUND REMAINING';
    $('timerPhase').textContent = state.phase === 'paused' ? 'PAUSED · CLOCK STOPPED' : phase === 'head-start' ? 'HUNTERS WAIT' : 'THE HUNT IS ON';
    const total = phase === 'head-start' ? state.game.settings.headStartSeconds * 1000 : state.game.settings.roundMinutes * 60000;
    document.querySelector('.timer-progress span').style.width = `${Math.min(100, state.remainingMs / total * 100)}%`;
  }

  function renderMatch() {
    const { game } = state;
    const current = game.players[0];
    const runners = game.players.filter(p => p.team === 'runner');
    const jailed = runners.filter(p => p.jailed).length;
    const active = state.phase === 'active';
    $('matchPhase').textContent = `03 / ${state.phase === 'paused' ? 'PAUSED LOCALLY' : state.phase === 'head-start' ? 'HEAD START' : 'THE HUNT'} · DEMO`;
    $('matchIntro').textContent = `You are a ${teamName(current.team)}${current.jailed ? ' · in demo jail' : ''}. Your assignment is locked for this round.`;
    $('matchCode').textContent = game.code;
    $('mapLocation').textContent = game.settings.name;
    $('phaseHelp').textContent = state.phase === 'paused' ? 'Clock stopped. Resume to continue.' : active ? 'Round underway. Try a demo action below.' : 'Runners scatter. Hunters wait until the head start ends.';
    $('pauseButton').textContent = state.phase === 'paused' ? 'Resume' : 'Pause';
    $('freeCount').textContent = runners.length - jailed;
    $('runnerTotal').textContent = `/ ${runners.length}`;
    $('hunterCount').textContent = game.players.length - runners.length;
    $('jailCount').textContent = jailed;
    $('currentRole').textContent = teamName(current.team);
    $('objectiveText').textContent = current.jailed ? 'You are in demo jail. A free teammate can release you.' : current.team === 'runner'
      ? 'Stay free. Reach jail to break out your team.' : 'Find the Runners. Get every Runner into jail together.';
    $('actionHelp').textContent = !active ? 'Demo game actions unlock when the round is active. The timer can be paused at any time.'
      : 'Direct any sample Runner, regardless of your role. A reported tag needs confirmation before jail; a disputed tag leaves them free.';
    $('runnerRoster').innerHTML = runners.map(p => `<div class="runner-row">
      <span class="player-initial runner">${p.name[0]}</span><div class="player-name"><b>${p.name}</b><small>${p.jailed ? 'In demo jail' : 'Free · demo Runner'}</small></div>
      <button type="button" class="field-button compact-button" id="tag-${p.id}" data-tag="${p.id}" ${!active || p.jailed || state.pendingTag ? 'disabled' : ''}>${p.jailed ? 'In jail' : 'Simulate tag'}</button></div>`).join('');
    $('pendingTag').hidden = !state.pendingTag;
    if (state.pendingTag) {
      const name = game.players.find(p => p.id === state.pendingTag).name;
      $('pendingTag').innerHTML = `<b>Tag reported: ${name}</b><p>No jail change yet. ${active ? 'Confirm the tag or dispute it.' : 'Resume to resolve this tag.'}</p>
        <div class="action-row"><button type="button" class="field-button primary-action" id="jailConfirm" data-command="JAIL" ${active ? '' : 'disabled'}>Confirm tag & send to jail</button>
        <button type="button" class="field-button" id="tagDispute" data-command="DISPUTE" ${active ? '' : 'disabled'}>Dispute tag</button></div>`;
    }
    $('jailbreakButton').disabled = !active || !jailed || jailed === runners.length || !!state.pendingTag;
    $('jailbreakButton').textContent = jailed ? `Simulate jailbreak (${jailed})` : 'Jail empty · no jailbreak yet';
    $('expireButton').disabled = !active;
    $('fieldUpdate').textContent = state.notice;
    document.querySelectorAll('.voice-card').forEach(card => {
      const available = card.dataset.team === current.team;
      const open = available && state.voiceOpen;
      card.classList.toggle('is-available', available);
      card.classList.toggle('is-locked', !available);
      card.classList.toggle('is-joined', open);
      const button = card.querySelector('[data-voice]');
      button.disabled = !available;
      button.classList.toggle('primary-action', available);
      button.setAttribute('aria-expanded', String(open));
      card.querySelector('.action-label').textContent = !available ? 'Other team · locked' : open ? 'Close room demo' : 'Open room demo';
      card.querySelector('[data-status]').textContent = !available ? 'OTHER TEAM' : open ? 'PREVIEW · NO AUDIO' : 'DEMO ONLY';
      card.querySelector('[data-members]').textContent = `${game.players.filter(p => p.team === card.dataset.team).length} SAMPLE PLAYERS`;
      card.querySelector('.call-controls').hidden = !open;
      card.querySelectorAll('[data-control]').forEach(control => {
        const on = control.dataset.control === 'MIC' ? state.micPreview : state.audioPreview;
        control.textContent = `${control.dataset.control === 'MIC' ? 'Mic' : 'Audio'} preview: ${on ? 'on' : 'off'}`;
        control.setAttribute('aria-pressed', String(on));
        control.disabled = !open;
        control.classList.toggle('on', on);
      });
    });
    renderClock();
  }

  function render() {
    const focusId = document.activeElement?.id;
    const match = running(state.phase) || state.phase === 'paused';
    $('matchScreen').hidden = !match;
    $('flowScreen').hidden = match;
    if (match) renderMatch();
    else renderFlow();
    if (focusId && $(focusId) && !$(focusId).disabled && document.activeElement !== $(focusId)) $(focusId).focus({ preventScroll: true });
  }

  function confirmAction(title, body, label, callback) {
    $('confirmTitle').textContent = title;
    $('confirmBody').textContent = body;
    $('confirmAction').textContent = label;
    confirmation = callback;
    $('confirmDialog').showModal();
  }

  async function copyCode(button) {
    const code = state.game.code;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Copying…';
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Copied ${code}. This demo code works only in this tab’s session.`);
    } catch {
      $('fallbackCode').value = code;
      $('codeDialog').showModal();
      $('fallbackCode').focus();
      $('fallbackCode').select();
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function formError(message, input) {
    $('formError').hidden = false;
    $('formError').textContent = message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  }

  document.addEventListener('submit', event => {
    if (!['hostForm', 'joinForm'].includes(event.target.id)) return;
    event.preventDefault();
    event.target.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    if (event.target.id === 'hostForm') {
      const settings = { name: $('gameName').value.trim(), roundMinutes: $('roundMinutes').valueAsNumber, headStartSeconds: $('headStartSeconds').valueAsNumber };
      const error = validateSettings(settings);
      if (error) {
        const input = !settings.name || settings.name.length > 48 ? $('gameName') : !Number.isInteger(settings.roundMinutes) || settings.roundMinutes < 1 || settings.roundMinutes > 60 ? $('roundMinutes') : $('headStartSeconds');
        formError(error, input);
        return;
      }
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code;
      do {
        code = Array.from(crypto.getRandomValues(new Uint8Array(6)), value => alphabet[value % alphabet.length]).join('');
      } while (games[code]);
      dispatch({ type: 'LOBBY', game: createGame(settings, code), host: true });
    } else {
      const code = normalizeCode($('joinCode').value);
      if (!/^[A-Z2-9]{6}$/.test(code)) return formError('Enter a six-character code using letters and digits 2–9.', $('joinCode'));
      if (!games[code]) return formError('No waiting demo game with that code exists in this tab’s session. Host one here first. Started rounds and other devices cannot be joined.', $('joinCode'));
      dispatch({ type: 'LOBBY', game: games[code], host: false });
    }
  });

  document.addEventListener('change', event => {
    const id = event.target.dataset.player;
    if (!id || state.phase !== 'lobby' || !state.host) return;
    const player = state.game.players.find(p => p.id === id);
    const team = event.target.value;
    event.target.value = player.team;
    if (team === player.team) return;
    if (state.game.players.filter(p => p.team === player.team).length === 1) {
      showToast('Keep at least one Hunter and one Runner.');
      return;
    }
    confirmAction(`Move ${player.name} to ${teamName(team)}?`, 'This changes the sample team assignment. Roles lock when the host starts the round.', 'Move player', () => dispatch({ type: 'TEAM', id, team }));
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.screen) dispatch({ type: 'SCREEN', screen: button.dataset.screen });
    if (button.dataset.tag) {
      dispatch({ type: 'TAG', id: button.dataset.tag });
      if (state.pendingTag) $('jailConfirm').focus();
    }
    if (button.dataset.voice) {
      dispatch({ type: 'VOICE', team: button.dataset.voice });
      showToast('Room UI preview only. No microphone access, connection, or audio.');
    }
    if (button.dataset.control) {
      dispatch({ type: button.dataset.control });
      showToast('Preview setting only. Your microphone and speakers are not used.');
    }
    const command = button.dataset.command;
    if (command === 'COPY' || button.id === 'copyCode') copyCode(button);
    else if (command) {
      dispatch({ type: command });
      if (['JAIL', 'DISPUTE'].includes(command) && state.phase === 'active') {
        (document.querySelector('[data-tag]:not(:disabled)') || $('expireButton')).focus();
      }
    }
    if (button.id === 'pauseButton') dispatch({ type: state.phase === 'paused' ? 'RESUME' : 'PAUSE' });
    if (button.id === 'safetyButton') {
      dispatch({ type: 'PAUSE', safety: true });
      if (state.phase === 'paused') $('safetyDialog').showModal();
    }
    if (['closeSafety', 'ackSafety'].includes(button.id)) $('safetyDialog').close();
    if (button.id === 'closeCode') $('codeDialog').close();
    if (button.id === 'recenter') showToast('An illustrative park with static sample markers and a sample boundary. No GPS or player tracking.');
    if (button.id === 'jailbreakButton') confirmAction('Release the jailed Runners?', 'Simulate a free Runner reaching jail untagged. Every jailed Runner will be free again.', 'Simulate jailbreak', () => dispatch({ type: 'JAILBREAK' }));
    if (button.id === 'expireButton') confirmAction('Fast-forward to time’s up?', 'This demo shortcut ends the round now. Runners win if anyone remains free. It cannot be undone.', 'End demo round', () => dispatch({ type: 'EXPIRE' }));
    if (button.id === 'cancelAction') {
      confirmation = null;
      $('confirmDialog').close();
    }
    if (button.id === 'confirmAction') {
      const action = confirmation;
      confirmation = null;
      $('confirmDialog').close();
      action?.();
    }
  });
  $('confirmDialog').addEventListener('cancel', () => { confirmation = null; });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && running(state.phase)) dispatch({ type: 'TICK' });
  });

  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {
      storageNotice('Offline setup could not finish. The demo still works online; reload on a stable connection to try again.');
    }));
  }
})();

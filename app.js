(() => {
  const currentRole = 'runner';
  let activeRole = currentRole;
  let joinedRole = null;
  let toastTimeout;
  let gameSeconds = 18 * 60 + 42;
  let pingSeconds = 42;

  const cards = [...document.querySelectorAll('.voice-card')];
  const roleButtons = [...document.querySelectorAll('.role-option')];
  const timerValue = document.getElementById('timerValue');
  const pingCountdown = document.getElementById('pingCountdown');
  const objectiveText = document.getElementById('objectiveText');
  const toast = document.getElementById('toast');

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, seconds);
    return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`;
  }

  function updateRole(role) {
    activeRole = role;
    roleButtons.forEach((button) => {
      const selected = button.dataset.role === role;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    cards.forEach((card) => {
      const team = card.dataset.team;
      const isAvailable = team === role;
      const action = card.querySelector('[data-action]');
      const status = card.querySelector('[data-status]');
      card.classList.toggle('is-available', isAvailable);
      card.classList.toggle('is-locked', !isAvailable);

      if (joinedRole === team) {
        card.classList.add('is-joined');
        status.className = 'room-status joined-status';
        status.textContent = '● CONNECTED · DEMO';
        action.disabled = false;
        action.classList.add('primary-action');
        action.querySelector('.action-label').textContent = 'Leave team call';
        action.querySelector('.action-arrow').textContent = '×';
        action.setAttribute('aria-label', `Leave the ${team} team-call prototype`);
        return;
      }

      card.classList.remove('is-joined');
      action.classList.toggle('primary-action', isAvailable);
      action.disabled = !isAvailable;
      action.querySelector('.action-arrow').textContent = isAvailable ? '↗' : '';
      action.querySelector('.action-label').textContent = isAvailable
        ? `Join ${team === 'hunter' ? 'Hunter' : 'Runner'} Call`
        : `Only ${team === 'hunter' ? 'Hunters' : 'Runners'} can join`;
      action.setAttribute('aria-label', isAvailable
        ? `Join the ${team} team-call prototype`
        : `This room is restricted to ${team}s`);
      status.className = `room-status ${isAvailable ? 'ready-status' : 'locked-status'}`;
      status.innerHTML = isAvailable ? '<i></i> READY' : 'LOCKED';

      const controls = card.querySelector('.call-controls');
      if (controls) controls.remove();
    });

    objectiveText.textContent = role === 'runner'
      ? 'Stay free. Reach jail to break out your team.'
      : 'Find the runners. Bring the whole team to jail.';
  }

  roleButtons.forEach((button) => button.addEventListener('click', () => {
    if (joinedRole && joinedRole !== button.dataset.role) {
      showToast('Leave your current room before previewing the other team.');
      return;
    }
    updateRole(button.dataset.role);
  }));

  cards.forEach((card) => {
    const action = card.querySelector('[data-action]');
    const role = card.dataset.team;
    action.addEventListener('click', () => {
      if (role !== activeRole && joinedRole !== role) return;
      if (joinedRole === role) {
        joinedRole = null;
        updateRole(activeRole);
        showToast('You left the demo room.');
        return;
      }

      joinedRole = role;
      updateRole(activeRole);
      const controls = document.createElement('div');
      controls.className = 'call-controls';
      controls.setAttribute('aria-label', 'Voice room demo controls');
      controls.innerHTML = '<button type="button" class="toggle-mic on" aria-pressed="true">Mic on</button><button type="button" class="toggle-speaker on" aria-pressed="true">Audio on</button>';
      card.insertBefore(controls, card.querySelector('.voice-card-foot'));
      controls.querySelector('.toggle-mic').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const isOn = button.getAttribute('aria-pressed') === 'true';
        button.setAttribute('aria-pressed', String(!isOn));
        button.classList.toggle('on', !isOn);
        button.textContent = isOn ? 'Mic off' : 'Mic on';
        showToast(`Demo only — microphone ${isOn ? 'muted' : 'unmuted'} in the preview.`);
      });
      controls.querySelector('.toggle-speaker').addEventListener('click', (event) => {
        const button = event.currentTarget;
        const isOn = button.getAttribute('aria-pressed') === 'true';
        button.setAttribute('aria-pressed', String(!isOn));
        button.classList.toggle('on', !isOn);
        button.textContent = isOn ? 'Audio off' : 'Audio on';
        showToast(`Demo only — room audio ${isOn ? 'off' : 'on'} in the preview.`);
      });
      showToast(`Demo room opened: ${role === 'hunter' ? 'Hunter Radio' : 'Runner Relay'}. No live audio is connected.`);
    });
  });

  document.getElementById('copyCode').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('F3K-92');
      showToast('Game code copied: F3K-92');
    } catch {
      showToast('Game code: F3K-92');
    }
  });

  document.getElementById('recenter').addEventListener('click', () => {
    showToast('Illustrative demo map — GPS and live location are not connected.');
  });

  const safetyDialog = document.getElementById('safetyDialog');
  document.getElementById('safetyButton').addEventListener('click', () => safetyDialog.showModal());
  document.getElementById('closeSafety').addEventListener('click', () => safetyDialog.close());
  document.getElementById('ackSafety').addEventListener('click', () => {
    safetyDialog.close();
    showToast('Safety prompt preview only — no game alert was sent.');
  });
  safetyDialog.addEventListener('click', (event) => {
    if (event.target === safetyDialog) safetyDialog.close();
  });

  setInterval(() => {
    if (gameSeconds > 0) gameSeconds -= 1;
    timerValue.innerHTML = `${formatTime(gameSeconds).slice(0, 2)}<span>:${formatTime(gameSeconds).slice(3)}</span>`;
    pingSeconds = pingSeconds > 0 ? pingSeconds - 1 : 59;
    pingCountdown.textContent = formatTime(pingSeconds);
  }, 1000);

  updateRole(currentRole);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();

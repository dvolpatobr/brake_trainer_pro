const storageKey = 'brake-trainer-pro-web-state';

const initState = () => ({
  devices: [],
  selectedBrakeDeviceId: null,
  selectedSteeringDeviceId: null,
  currentValue: 0,
  config: {
    target: 50,
    duration: 10,
    displayMode: 'vertical',
  },
  challenges: [],
});

const defaultState = initState();

const getState = () => {
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      ...defaultState,
      ...parsed,
      config: {
        ...defaultState.config,
        ...(parsed.config || {}),
      },
      devices: parsed.devices || defaultState.devices,
      challenges: parsed.challenges || defaultState.challenges,
    };
  } catch (error) {
    console.warn('Falha ao ler localStorage:', error);
    return defaultState;
  }
};

const saveState = (state) => {
  localStorage.setItem(storageKey, JSON.stringify(state));
};

const state = getState();
const activeDevices = new Map();

const isChrome = () => /Chrome/.test(navigator.userAgent) && !/Edg|OPR|Brave/.test(navigator.userAgent);
const page = document.body.dataset.page;

const toDeviceId = (device) => `${device.vendorId}:${device.productId}:${device.productName}`;
const getDeviceLabel = (device) => `${device.productName || 'HID'} (${device.vendorId}:${device.productId})`;

const updateConfig = () => {
  saveState(state);
};

const getSelectedDevice = (deviceId) => state.devices.find((device) => device.deviceId === deviceId);

const renderDeviceList = () => {
  const container = document.getElementById('device-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.devices.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'device-item';
    empty.textContent = 'Nenhum dispositivo autorizado ainda.';
    container.appendChild(empty);
    return;
  }

  state.devices.forEach((device) => {
    const item = document.createElement('div');
    item.className = 'device-item';
    item.textContent = getDeviceLabel(device);
    if (device.deviceId === state.selectedBrakeDeviceId) {
      item.textContent += ' - Freio selecionado';
    }
    if (device.deviceId === state.selectedSteeringDeviceId) {
      item.textContent += ' - Direção selecionada';
    }
    container.appendChild(item);
  });
};

const updateDeviceSelectors = () => {
  const brakeSelect = document.getElementById('brake-device');
  const steeringSelect = document.getElementById('steering-device');
  if (!brakeSelect || !steeringSelect) return;

  const addOption = (select, device) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = getDeviceLabel(device);
    select.appendChild(option);
  };

  brakeSelect.innerHTML = '';
  steeringSelect.innerHTML = '';

  state.devices.forEach((device) => {
    addOption(brakeSelect, device);
    addOption(steeringSelect, device);
  });

  if (state.selectedBrakeDeviceId) {
    brakeSelect.value = state.selectedBrakeDeviceId;
  }
  if (state.selectedSteeringDeviceId) {
    steeringSelect.value = state.selectedSteeringDeviceId;
  }
};

const normalizeReportValue = (data) => {
  const raw = new Uint8Array(data.buffer || data);
  if (raw.length === 0) {
    return 0;
  }

  const value = raw[0];
  return Math.round(Math.min(100, Math.max(0, (value / 255) * 100)));
};

const onInputReport = (event) => {
  const value = normalizeReportValue(event.data);
  state.currentValue = value;
  const currentText = document.getElementById('current-value');
  if (currentText) {
    currentText.textContent = `${value}%`;
  }
};

const setupHIDListeners = async () => {
  if (!navigator.hid) return;

  const devices = await navigator.hid.getDevices();
  devices.forEach(async (device) => {
    const id = toDeviceId(device);
    if (!activeDevices.has(id)) {
      try {
        if (!device.opened) {
          await device.open();
        }
        device.addEventListener('inputreport', onInputReport);
        activeDevices.set(id, device);
      } catch (error) {
        console.warn('Falha ao abrir dispositivo HID', id, error);
      }
    }
  });
};

const requestHID = async () => {
  try {
    const devices = await navigator.hid.requestDevice({ filters: [] });
    state.devices = Array.from(devices).map((device) => ({
      productName: device.productName,
      vendorId: device.vendorId,
      productId: device.productId,
      deviceId: toDeviceId(device),
    }));

    if (!state.selectedBrakeDeviceId && state.devices.length) {
      state.selectedBrakeDeviceId = state.devices[0].deviceId;
    }
    if (!state.selectedSteeringDeviceId && state.devices.length) {
      state.selectedSteeringDeviceId = state.devices[0].deviceId;
    }

    await setupHIDListeners();
    renderDeviceList();
    updateDeviceSelectors();
    updateConfig();
  } catch (error) {
    console.warn('HID request failed', error);
  }
};

const bindSettings = () => {
  const requestButton = document.getElementById('request-device');
  if (!requestButton) return;

  requestButton.addEventListener('click', () => {
    if (!navigator.hid) {
      alert('WebHID não está disponível neste navegador. Use Chrome ou Edge.');
      return;
    }
    requestHID();
  });

  const targetInput = document.getElementById('target-value');
  const durationInput = document.getElementById('challenge-duration');
  const displayInput = document.getElementById('display-mode');
  const brakeSelect = document.getElementById('brake-device');
  const steeringSelect = document.getElementById('steering-device');

  if (targetInput) {
    targetInput.value = state.config.target;
    targetInput.addEventListener('input', (event) => {
      state.config.target = Number(event.target.value);
      updateConfig();
    });
  }

  if (durationInput) {
    durationInput.value = state.config.duration;
    durationInput.addEventListener('input', (event) => {
      state.config.duration = Number(event.target.value);
      updateConfig();
    });
  }

  if (displayInput) {
    displayInput.value = state.config.displayMode;
    displayInput.addEventListener('input', (event) => {
      state.config.displayMode = event.target.value;
      updateConfig();
    });
  }

  if (brakeSelect) {
    brakeSelect.addEventListener('change', (event) => {
      state.selectedBrakeDeviceId = event.target.value;
      updateConfig();
      renderDeviceList();
    });
  }

  if (steeringSelect) {
    steeringSelect.addEventListener('change', (event) => {
      state.selectedSteeringDeviceId = event.target.value;
      updateConfig();
      renderDeviceList();
    });
  }

  renderDeviceList();
  updateDeviceSelectors();
};

const renderResults = () => {
  const resultsList = document.getElementById('results-list');
  if (!resultsList) return;
  resultsList.innerHTML = '';

  if (state.challenges.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'result-item';
    empty.textContent = 'Nenhum desafio registrado ainda.';
    resultsList.appendChild(empty);
    return;
  }

  state.challenges.slice().reverse().forEach((challenge, index) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <strong>#${state.challenges.length - index}</strong>
      <p>Target: ${challenge.target}%</p>
      <p>Score: ${challenge.score.toFixed(1)}</p>
      <p>Tempo: ${challenge.duration}s</p>
      <p>Status: ${challenge.success ? 'Concluído' : 'Incompleto'}</p>
    `;
    resultsList.appendChild(item);
  });
};

const drawVisualizer = () => {
  const visualizer = document.getElementById('visualizer');
  if (!visualizer) return;

  visualizer.innerHTML = '';
  const width = visualizer.clientWidth;
  const height = visualizer.clientHeight;
  const target = state.config.target;
  const current = state.currentValue;

  if (state.config.displayMode === 'horizontal') {
    const targetX = (target / 100) * width;
    const currentX = (current / 100) * width;

    const targetLine = document.createElement('div');
    targetLine.className = 'target-line';
    targetLine.style.left = `${targetX}px`;
    targetLine.style.top = '0';
    targetLine.style.width = '4px';
    targetLine.style.height = '100%';
    visualizer.appendChild(targetLine);

    const currentLine = document.createElement('div');
    currentLine.className = 'visual-line';
    currentLine.style.left = `${currentX}px`;
    currentLine.style.top = '0';
    currentLine.style.width = '4px';
    currentLine.style.height = '100%';
    visualizer.appendChild(currentLine);
  } else {
    const targetY = height - (target / 100) * height;
    const currentY = height - (current / 100) * height;

    const targetLine = document.createElement('div');
    targetLine.className = 'target-line';
    targetLine.style.left = '0';
    targetLine.style.top = `${targetY}px`;
    targetLine.style.width = '100%';
    targetLine.style.height = '4px';
    visualizer.appendChild(targetLine);

    const currentLine = document.createElement('div');
    currentLine.className = 'visual-line';
    currentLine.style.left = '0';
    currentLine.style.top = `${currentY}px`;
    currentLine.style.width = '100%';
    currentLine.style.height = '4px';
    visualizer.appendChild(currentLine);
  }
};

const renderChallenge = () => {
  const targetText = document.getElementById('challenge-target');
  const timeText = document.getElementById('challenge-time');
  const currentText = document.getElementById('current-value');
  const statusText = document.getElementById('status-text');
  const startButton = document.getElementById('start-challenge');

  if (!targetText || !timeText || !currentText || !statusText || !startButton) return;

  targetText.textContent = `${state.config.target}%`;
  timeText.textContent = `${state.config.duration}s`;
  currentText.textContent = `${state.currentValue}%`;
  statusText.textContent = 'Aguardando ação.';

  let elapsed = 0;
  let interval = null;
  const samples = [];

  const refresh = () => {
    currentText.textContent = `${state.currentValue}%`;
    drawVisualizer();
  };

  const stopChallenge = () => {
    clearInterval(interval);
    const average = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : state.currentValue;
    const score = Math.max(0, 100 - Math.abs(state.config.target - average));
    state.challenges.push({
      target: state.config.target,
      duration: state.config.duration,
      score,
      success: Math.abs(state.config.target - average) <= 10,
      createdAt: new Date().toISOString(),
    });
    updateConfig();
    statusText.textContent = 'Desafio finalizado! Veja resultados.';
    renderResults();
  };

  startButton.addEventListener('click', async () => {
    if (!navigator.hid) {
      statusText.textContent = 'WebHID não disponível. Use Chrome.';
      return;
    }

    if (!state.selectedBrakeDeviceId) {
      statusText.textContent = 'Nenhum dispositivo de freio selecionado. Vá para Configurações.';
      return;
    }

    statusText.textContent = 'Desafio em andamento...';
    elapsed = 0;
    samples.length = 0;
    refresh();

    interval = setInterval(() => {
      elapsed += 100;
      const remaining = Math.max(0, state.config.duration - Math.floor(elapsed / 1000));
      timeText.textContent = `${remaining}s`;
      samples.push(state.currentValue);
      refresh();
      if (elapsed >= state.config.duration * 1000) {
        stopChallenge();
      }
    }, 100);
  });
};

const initPage = async () => {
  if (!isChrome()) {
    const alertText = document.createElement('div');
    alertText.textContent = 'Atenção: esta página funciona melhor no Chrome/Edge com WebHID.';
    alertText.style.padding = '12px 24px';
    alertText.style.background = '#6b7280';
    alertText.style.color = '#fff';
    document.body.prepend(alertText);
  }

  if (navigator.hid) {
    await setupHIDListeners();
  }

  if (page === 'settings') {
    bindSettings();
  }

  if (page === 'results') {
    renderResults();
  }

  if (page === 'challenge') {
    renderChallenge();
  }
};

window.addEventListener('DOMContentLoaded', initPage);

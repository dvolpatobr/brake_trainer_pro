const storageKey = 'brake-trainer-pro-web-state';

const initState = () => ({
  devices: [],
  deviceValues: {},
  deviceReports: {},
  deviceAxisCounts: {},
  selectedBrakeDeviceId: null,
  selectedBrakeAxisIndex: 0,
  selectedSteeringDeviceId: null,
  selectedSteeringAxisIndex: 0,
  currentValue: 0,
  config: {
    target: 50,
    duration: 10,
    displayMode: 'vertical',
  },
  challenges: [],
});

const getState = () => {
  const defaultState = initState();
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
      deviceValues: parsed.deviceValues || defaultState.deviceValues,
      deviceReports: parsed.deviceReports || defaultState.deviceReports,
      deviceAxisCounts: parsed.deviceAxisCounts || defaultState.deviceAxisCounts,
      selectedBrakeAxisIndex: Number.isFinite(Number(parsed.selectedBrakeAxisIndex))
        ? Number(parsed.selectedBrakeAxisIndex)
        : defaultState.selectedBrakeAxisIndex,
      selectedSteeringAxisIndex: Number.isFinite(Number(parsed.selectedSteeringAxisIndex))
        ? Number(parsed.selectedSteeringAxisIndex)
        : defaultState.selectedSteeringAxisIndex,
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
const getAxisLabel = (axisIndex) => `Eixo ${axisIndex + 1}`;
const mapHIDDeviceToSummary = (device) => ({
  productName: device.productName,
  vendorId: device.vendorId,
  productId: device.productId,
  deviceId: toDeviceId(device),
});
const toBytes = (data) => {
  if (!data) return [];

  if (data instanceof DataView) {
    return Array.from(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
  }

  if (ArrayBuffer.isView(data)) {
    return Array.from(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)));
  }

  if (data instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(data));
  }

  return [];
};
const getDeviceReportBytes = (deviceId) => state.deviceReports[deviceId] || [];
const getDeviceAxisCount = (deviceId) => {
  const storedCount = Number(state.deviceAxisCounts[deviceId] || 0);
  const reportCount = getDeviceReportBytes(deviceId).length;
  return Math.max(1, storedCount, reportCount);
};
const getRoleSelection = (role) => {
  if (role === 'brake') {
    return {
      deviceId: state.selectedBrakeDeviceId,
      axisIndex: state.selectedBrakeAxisIndex,
    };
  }

  return {
    deviceId: state.selectedSteeringDeviceId,
    axisIndex: state.selectedSteeringAxisIndex,
  };
};
const setRoleAxisIndex = (role, axisIndex) => {
  if (role === 'brake') {
    state.selectedBrakeAxisIndex = axisIndex;
  }

  if (role === 'steering') {
    state.selectedSteeringAxisIndex = axisIndex;
  }
};
const getRoleAxisIndex = (role) => getRoleSelection(role).axisIndex || 0;
const getDeviceValue = (deviceId, axisIndex = 0) => {
  const report = getDeviceReportBytes(deviceId);
  if (!report.length) {
    return null;
  }

  const safeAxisIndex = Math.max(0, Math.floor(Number(axisIndex) || 0));
  if (safeAxisIndex >= report.length) {
    return null;
  }

  const value = report[safeAxisIndex];
  return Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, (value / 255) * 100))) : null;
};
const getSelectedRoleValue = (role) => {
  const selection = getRoleSelection(role);
  if (!selection.deviceId) {
    return null;
  }

  return getDeviceValue(selection.deviceId, selection.axisIndex);
};

const mergeAuthorizedDevices = (devices) => {
  const byId = new Map(state.devices.map((device) => [device.deviceId, device]));
  devices.forEach((device) => {
    byId.set(device.deviceId, {
      ...byId.get(device.deviceId),
      ...device,
    });
  });
  state.devices = Array.from(byId.values());
};

const renderSelectedDeviceSummary = () => {
  const brakeStatus = document.getElementById('brake-device-status');
  const steeringStatus = document.getElementById('steering-device-status');

  if (brakeStatus) {
    const brakeDevice = getSelectedDevice(state.selectedBrakeDeviceId);
    brakeStatus.textContent = brakeDevice
      ? `Selecionado: ${getDeviceLabel(brakeDevice)} · ${getAxisLabel(state.selectedBrakeAxisIndex || 0)}`
      : 'Nenhum dispositivo selecionado.';
  }

  if (steeringStatus) {
    const steeringDevice = getSelectedDevice(state.selectedSteeringDeviceId);
    steeringStatus.textContent = steeringDevice
      ? `Selecionado: ${getDeviceLabel(steeringDevice)} · ${getAxisLabel(state.selectedSteeringAxisIndex || 0)}`
      : 'Nenhum dispositivo selecionado.';
  }
};

const refreshSelectedBrakeValue = () => {
  const value = getSelectedRoleValue('brake');
  state.currentValue = value ?? 0;
  const currentText = document.getElementById('current-value');
  if (currentText) {
    currentText.textContent = `${state.currentValue}%`;
  }
};

const setSelectedDeviceForRole = (role, deviceId) => {
  if (role === 'brake') {
    state.selectedBrakeDeviceId = deviceId || null;
    if (!deviceId) {
      state.selectedBrakeAxisIndex = 0;
    }
  }

  if (role === 'steering') {
    state.selectedSteeringDeviceId = deviceId || null;
    if (!deviceId) {
      state.selectedSteeringAxisIndex = 0;
    }
  }

  renderSelectedDeviceSummary();
  updateDeviceSelectors();
  refreshSelectedBrakeValue();
  updateConfig();
};

const setSelectedAxisForRole = (role, axisIndex) => {
  const normalizedAxisIndex = Math.max(0, Number(axisIndex) || 0);
  setRoleAxisIndex(role, normalizedAxisIndex);
  renderSelectedDeviceSummary();
  refreshSelectedBrakeValue();
  updateConfig();
};

const updateConfig = () => {
  saveState(state);
};

const getSelectedDevice = (deviceId) => state.devices.find((device) => device.deviceId === deviceId);

const updateDeviceSelectors = () => {
  const brakeSelect = document.getElementById('brake-device');
  const steeringSelect = document.getElementById('steering-device');
  const brakeAxisSelect = document.getElementById('brake-axis');
  const steeringAxisSelect = document.getElementById('steering-axis');
  if (!brakeSelect || !steeringSelect) return;

  const addOption = (select, device) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = getDeviceLabel(device);
    select.appendChild(option);
  };

  const populateAxisSelect = (select, role, deviceId) => {
    if (!select) return;

    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '0';
    placeholder.textContent = deviceId ? 'Eixo 1' : 'Selecione o dispositivo primeiro';
    select.appendChild(placeholder);

    if (!deviceId) {
      select.disabled = true;
      select.value = '0';
      return;
    }

    const axisCount = getDeviceAxisCount(deviceId);
    for (let axisIndex = 1; axisIndex < axisCount; axisIndex += 1) {
      const option = document.createElement('option');
      option.value = String(axisIndex);
      option.textContent = getAxisLabel(axisIndex);
      select.appendChild(option);
    }

    const currentAxisIndex = Math.min(getRoleAxisIndex(role), axisCount - 1);
    setRoleAxisIndex(role, currentAxisIndex);
    select.disabled = false;
    select.value = String(currentAxisIndex);
  };

  brakeSelect.innerHTML = '';
  steeringSelect.innerHTML = '';

  const brakePlaceholder = document.createElement('option');
  brakePlaceholder.value = '';
  brakePlaceholder.textContent = 'Selecione o freio';
  brakeSelect.appendChild(brakePlaceholder);

  const steeringPlaceholder = document.createElement('option');
  steeringPlaceholder.value = '';
  steeringPlaceholder.textContent = 'Selecione a direção';
  steeringSelect.appendChild(steeringPlaceholder);

  state.devices.forEach((device) => {
    addOption(brakeSelect, device);
    addOption(steeringSelect, device);
  });

  brakeSelect.disabled = state.devices.length === 0;
  steeringSelect.disabled = state.devices.length === 0;

  if (state.selectedBrakeDeviceId) {
    brakeSelect.value = state.selectedBrakeDeviceId;
  }
  if (state.selectedSteeringDeviceId) {
    steeringSelect.value = state.selectedSteeringDeviceId;
  }

  populateAxisSelect(brakeAxisSelect, 'brake', state.selectedBrakeDeviceId);
  populateAxisSelect(steeringAxisSelect, 'steering', state.selectedSteeringDeviceId);

  renderSelectedDeviceSummary();
};

const normalizeReportValue = (data, axisIndex = 0) => {
  const raw = toBytes(data);
  if (raw.length === 0) {
    return 0;
  }

  const safeAxisIndex = Math.max(0, Math.floor(Number(axisIndex) || 0));
  if (safeAxisIndex >= raw.length) {
    return 0;
  }

  const value = raw[safeAxisIndex];
  return Math.round(Math.min(100, Math.max(0, (value / 255) * 100)));
};

const onInputReport = (event) => {
  const sourceDevice = event.device || event.target;
  const deviceId = sourceDevice ? toDeviceId(sourceDevice) : null;
  const bytes = toBytes(event.data);

  if (deviceId) {
    state.deviceValues[deviceId] = normalizeReportValue(event.data, 0);
    const previousAxisCount = Number(state.deviceAxisCounts[deviceId] || 0);
    const nextAxisCount = Math.max(previousAxisCount, bytes.length);
    const axisCountChanged = nextAxisCount !== previousAxisCount;
    state.deviceReports[deviceId] = bytes;
    state.deviceAxisCounts[deviceId] = nextAxisCount;
    if (deviceId === state.selectedBrakeDeviceId) {
      state.currentValue = getSelectedRoleValue('brake') ?? 0;
    }
    if (axisCountChanged && (deviceId === state.selectedBrakeDeviceId || deviceId === state.selectedSteeringDeviceId)) {
      updateDeviceSelectors();
    }
  } else {
    state.currentValue = normalizeReportValue(event.data, state.selectedBrakeAxisIndex);
  }

  const currentText = document.getElementById('current-value');
  if (currentText && deviceId === state.selectedBrakeDeviceId) {
    currentText.textContent = `${state.currentValue}%`;
  }
};

const refreshAuthorizedDevices = async () => {
  if (!navigator.hid) return [];

  const devices = await navigator.hid.getDevices();
  const mapped = devices.map(mapHIDDeviceToSummary);

  mergeAuthorizedDevices(mapped);
  return devices;
};

const setupHIDListeners = async () => {
  if (!navigator.hid) return;

  const devices = await refreshAuthorizedDevices();
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

const requestHIDForRole = async (role) => {
  try {
    const requestedDevices = await navigator.hid.requestDevice({ filters: [] });
    const devices = Array.from(requestedDevices);
    const mapped = devices.map(mapHIDDeviceToSummary);

    mergeAuthorizedDevices(mapped);

    if (mapped.length) {
      setSelectedDeviceForRole(role, mapped[0].deviceId);
    }

    await setupHIDListeners();
    updateDeviceSelectors();
  } catch (error) {
    console.warn('HID request failed', error);
  }
};

const bindSettings = () => {
  const brakeButton = document.getElementById('add-brake-device');
  const steeringButton = document.getElementById('add-steering-device');

  const bindDeviceButton = (button, role) => {
    if (!button) return;

    button.addEventListener('click', () => {
      if (!navigator.hid) {
        alert('WebHID não está disponível neste navegador. Use Chrome ou Edge.');
        return;
      }
      requestHIDForRole(role);
    });
  };

  bindDeviceButton(brakeButton, 'brake');
  bindDeviceButton(steeringButton, 'steering');

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
      setSelectedDeviceForRole('brake', event.target.value);
    });
  }

  if (steeringSelect) {
    steeringSelect.addEventListener('change', (event) => {
      setSelectedDeviceForRole('steering', event.target.value);
    });
  }

  const brakeAxisSelect = document.getElementById('brake-axis');
  const steeringAxisSelect = document.getElementById('steering-axis');

  if (brakeAxisSelect) {
    brakeAxisSelect.addEventListener('change', (event) => {
      setSelectedAxisForRole('brake', event.target.value);
    });
  }

  if (steeringAxisSelect) {
    steeringAxisSelect.addEventListener('change', (event) => {
      setSelectedAxisForRole('steering', event.target.value);
    });
  }

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
    await refreshAuthorizedDevices();
    await setupHIDListeners();
    refreshSelectedBrakeValue();
  }

  if (page === 'settings') {
    bindSettings();
    renderSelectedDeviceSummary();
  }

  if (page === 'results') {
    renderResults();
  }

  if (page === 'challenge') {
    renderChallenge();
  }
};

window.addEventListener('DOMContentLoaded', initPage);

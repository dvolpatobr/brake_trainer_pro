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
  selectedThrottleDeviceId: null,
  selectedThrottleAxisIndex: 0,
  currentBrakeValue: 0,
  currentSteeringValue: 0,
  currentThrottleValue: 0,
  currentValue: 0,
  config: {
    target: 50,
    duration: 10,
    displayMode: 'vertical',
  },
  challengeSettings: {
    brakePrecision: {
      steps: 3,
      delaySeconds: 3,
      tolerance: 3,
    },
    trailBraking: {
      mode: 'medium',
    },
  },
  challenges: [],
  ui: {
    selectedChallengeType: 'brake-precision',
  },
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
      challengeSettings: {
        ...defaultState.challengeSettings,
        ...(parsed.challengeSettings || {}),
        brakePrecision: {
          ...defaultState.challengeSettings.brakePrecision,
          ...(parsed.challengeSettings?.brakePrecision || {}),
        },
        trailBraking: {
          ...defaultState.challengeSettings.trailBraking,
          ...(parsed.challengeSettings?.trailBraking || {}),
        },
      },
      selectedThrottleDeviceId: parsed.selectedThrottleDeviceId || defaultState.selectedThrottleDeviceId,
      selectedThrottleAxisIndex: Number.isFinite(Number(parsed.selectedThrottleAxisIndex))
        ? Number(parsed.selectedThrottleAxisIndex)
        : defaultState.selectedThrottleAxisIndex,
      selectedBrakeAxisIndex: Number.isFinite(Number(parsed.selectedBrakeAxisIndex))
        ? Number(parsed.selectedBrakeAxisIndex)
        : defaultState.selectedBrakeAxisIndex,
      selectedSteeringAxisIndex: Number.isFinite(Number(parsed.selectedSteeringAxisIndex))
        ? Number(parsed.selectedSteeringAxisIndex)
        : defaultState.selectedSteeringAxisIndex,
      challenges: parsed.challenges || defaultState.challenges,
      ui: {
        ...defaultState.ui,
        ...(parsed.ui || {}),
      },
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
const AXIS_DETECTION_WINDOW_MS = 3000;
const AXIS_DETECTION_MIN_VARIATION = 30;
const runtime = {
  activeChallenge: null,
  pendingChallenge: null,
  lastCompletedChallenge: null,
  timerId: null,
  axisDetection: {
    brake: { session: null, status: { state: 'idle', message: 'Aguardando detecção automática.' } },
    steering: { session: null, status: { state: 'idle', message: 'Aguardando detecção automática.' } },
    throttle: { session: null, status: { state: 'idle', message: 'Aguardando detecção automática.' } },
  },
};

const isChrome = () => /Chrome/.test(navigator.userAgent) && !/Edg|OPR|Brave/.test(navigator.userAgent);
const page = document.body.dataset.page;
// Bump this label on every repo change so the footer always reflects the latest build.
const APP_VERSION = 'v0.22.0';

const toDeviceId = (device) => `${device.vendorId}:${device.productId}:${device.productName}`;
const getDeviceLabel = (device) => `${device.productName || 'HID'} (${device.vendorId}:${device.productId})`;
const getAxisLabel = (axisIndex) => `Eixo ${axisIndex + 1}`;
const ROLE_DEFS = {
  brake: {
    label: 'Freio',
    shortLabel: 'Brake',
    colorClass: 'brake',
    deviceSelectId: 'brake-device',
    detectionButtonId: 'detect-brake-axis',
    detectionStatusId: 'brake-axis-detection-status',
    meterFillId: 'brake-axis-fill',
    meterValueId: 'brake-axis-value',
    challengeValueId: 'challenge-brake-value',
    challengeTargetId: 'challenge-brake-target',
  },
  steering: {
    label: 'Direção',
    shortLabel: 'Steering',
    colorClass: 'steering',
    deviceSelectId: 'steering-device',
    detectionButtonId: 'detect-steering-axis',
    detectionStatusId: 'steering-axis-detection-status',
    meterFillId: 'steering-axis-fill',
    meterValueId: 'steering-axis-value',
    challengeValueId: 'challenge-steering-value',
    challengeTargetId: 'challenge-steering-target',
  },
  throttle: {
    label: 'Acelerador',
    shortLabel: 'Throttle',
    colorClass: 'throttle',
    deviceSelectId: 'throttle-device',
    detectionButtonId: 'detect-throttle-axis',
    detectionStatusId: 'throttle-axis-detection-status',
    meterFillId: 'throttle-axis-fill',
    meterValueId: 'throttle-axis-value',
    challengeValueId: 'challenge-throttle-value',
    challengeTargetId: 'challenge-throttle-target',
  },
};
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
const getRoleKeys = () => Object.keys(ROLE_DEFS);
const getRoleSelection = (role) => {
  if (role === 'brake') {
    return {
      deviceId: state.selectedBrakeDeviceId,
      axisIndex: state.selectedBrakeAxisIndex,
    };
  }

  if (role === 'steering') {
    return {
      deviceId: state.selectedSteeringDeviceId,
      axisIndex: state.selectedSteeringAxisIndex,
    };
  }

  return {
    deviceId: state.selectedThrottleDeviceId,
    axisIndex: state.selectedThrottleAxisIndex,
  };
};
const setRoleAxisIndex = (role, axisIndex) => {
  if (role === 'brake') {
    state.selectedBrakeAxisIndex = axisIndex;
  }

  if (role === 'steering') {
    state.selectedSteeringAxisIndex = axisIndex;
  }

  if (role === 'throttle') {
    state.selectedThrottleAxisIndex = axisIndex;
  }
};
const getRoleAxisIndex = (role) => getRoleSelection(role).axisIndex || 0;
const resetAllAxisSelections = () => {
  stopAxisDetection('brake');
  stopAxisDetection('steering');
  stopAxisDetection('throttle');
  state.selectedBrakeDeviceId = null;
  state.selectedSteeringDeviceId = null;
  state.selectedThrottleDeviceId = null;
  setRoleAxisIndex('brake', 0);
  setRoleAxisIndex('steering', 0);
  setRoleAxisIndex('throttle', 0);
  updateConfig();
  renderSelectedDeviceSummary();
  updateDeviceSelectors();
  renderAxisDetectionStatuses();
  refreshLiveReadouts();
};
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
const getSelectedRoleValueOrZero = (role) => getSelectedRoleValue(role) ?? 0;
const getAxisDetectionState = (role) => runtime.axisDetection[role];
const setAxisDetectionStatus = (role, patch) => {
  const roleState = getAxisDetectionState(role);
  roleState.status = {
    ...roleState.status,
    ...patch,
  };
};
const clearAxisDetectionSession = (role) => {
  const roleState = getAxisDetectionState(role);
  if (roleState.session?.timeoutId) {
    clearTimeout(roleState.session.timeoutId);
  }
  if (roleState.session?.intervalId) {
    clearInterval(roleState.session.intervalId);
  }
  roleState.session = null;
};
const stopAxisDetection = (role, status = {
  state: 'idle',
  message: 'Aguardando detecção automática.',
}) => {
  clearAxisDetectionSession(role);
  const roleState = getAxisDetectionState(role);
  roleState.status = status;
};
const renderAxisDetectionStatus = (role) => {
  const roleDef = ROLE_DEFS[role];
  const statusNode = document.getElementById(roleDef.detectionStatusId);
  const buttonNode = document.getElementById(roleDef.detectionButtonId);
  if (!statusNode && !buttonNode) return;

  const roleState = getAxisDetectionState(role);
  const selection = getRoleSelection(role);
  const currentAxisIndex = getRoleAxisIndex(role);

  if (buttonNode) {
    buttonNode.disabled = !selection.deviceId || Boolean(roleState.session);
    buttonNode.classList.toggle('button--detecting', Boolean(roleState.session));
    buttonNode.textContent = roleState.session
      ? `Detectando... ${Math.max(1, Math.ceil((roleState.session.endsAt - Date.now()) / 1000))}s`
      : 'Detectar eixo';
  }

  if (statusNode) {
    let message = roleState.status.message || 'Aguardando detecção automática.';
    if (!roleState.session && roleState.status.state === 'idle') {
      message = selection.deviceId
        ? `Eixo atual: ${getAxisLabel(currentAxisIndex)}.`
        : 'Selecione um dispositivo para detectar o eixo.';
    } else if (roleState.session) {
      message = `Mova o controle agora. ${Math.max(1, Math.ceil((roleState.session.endsAt - Date.now()) / 1000))}s restantes.`;
    }

    statusNode.textContent = message;
    statusNode.classList.remove(
      'device-detection-status--capturing',
      'device-detection-status--active',
      'device-detection-status--success',
      'device-detection-status--error',
    );
    statusNode.classList.add(`device-detection-status--${roleState.status.state}`);
  }
};
const renderAxisDetectionStatuses = () => {
  getRoleKeys().forEach((role) => renderAxisDetectionStatus(role));
};
const getAxisSampleRange = (samples, axisIndex) => {
  const values = samples
    .map((sample) => {
      const rawValue = sample[axisIndex];
      if (!Number.isFinite(rawValue)) {
        return null;
      }
      return Math.round(Math.min(100, Math.max(0, (rawValue / 255) * 100)));
    })
    .filter((value) => Number.isFinite(value));

  if (values.length <= 1) {
    return 0;
  }

  return Math.max(...values) - Math.min(...values);
};
const getBestAxisFromSamples = (samples) => {
  const maxLength = samples.reduce((length, sample) => Math.max(length, sample.length), 0);
  if (maxLength === 0 || samples.length === 0) {
    return null;
  }

  let bestAxisIndex = null;
  let bestVariation = -1;

  for (let axisIndex = 0; axisIndex < maxLength; axisIndex += 1) {
    const variation = getAxisSampleRange(samples, axisIndex);
    if (variation > bestVariation) {
      bestVariation = variation;
      bestAxisIndex = axisIndex;
    }
  }

  if (bestAxisIndex == null || bestVariation < AXIS_DETECTION_MIN_VARIATION) {
    return null;
  }

  return {
    axisIndex: bestAxisIndex,
    variation: bestVariation,
  };
};
const recordAxisDetectionSample = (role, deviceId, bytes) => {
  const roleState = getAxisDetectionState(role);
  const session = roleState.session;
  if (!session || session.deviceId !== deviceId) {
    return;
  }

  session.samples.push([...bytes]);
};
const finalizeAxisDetection = (role, reason = 'timeout') => {
  const roleState = getAxisDetectionState(role);
  const session = roleState.session;
  if (!session) {
    return;
  }

  clearAxisDetectionSession(role);

  const currentSelection = getRoleSelection(role);
  if (currentSelection.deviceId !== session.deviceId) {
    roleState.status = {
      state: 'error',
      message: 'Detecção cancelada porque o dispositivo mudou.',
    };
    renderAxisDetectionStatus(role);
    return;
  }

  const bestAxis = getBestAxisFromSamples(session.samples);
  if (!bestAxis) {
    roleState.status = {
      state: 'error',
      message: 'Nenhum eixo com variação mínima de 30% foi identificado.',
    };
    renderAxisDetectionStatus(role);
    return;
  }

  setRoleAxisIndex(role, bestAxis.axisIndex);
  roleState.status = {
    state: 'success',
    message: `Eixo detectado: ${getAxisLabel(bestAxis.axisIndex)} (${Math.round(bestAxis.variation)}% de variação).`,
    axisIndex: bestAxis.axisIndex,
    variation: bestAxis.variation,
  };
  updateConfig();
  renderSelectedDeviceSummary();
  updateDeviceSelectors();
  refreshLiveReadouts();
  renderAxisDetectionStatus(role);
};
const startAxisDetection = (role) => {
  const selection = getRoleSelection(role);
  if (!selection.deviceId) {
    setAxisDetectionStatus(role, {
      state: 'error',
      message: 'Selecione um dispositivo antes de detectar o eixo.',
    });
    renderAxisDetectionStatus(role);
    return;
  }

  const roleState = getAxisDetectionState(role);
  clearAxisDetectionSession(role);
  roleState.status = {
    state: 'capturing',
    message: 'Mova o controle agora.',
  };

  const session = {
    deviceId: selection.deviceId,
    startedAt: Date.now(),
    endsAt: Date.now() + AXIS_DETECTION_WINDOW_MS,
    samples: [],
    timeoutId: null,
    intervalId: null,
  };

  const latestReport = getDeviceReportBytes(selection.deviceId);
  if (latestReport.length) {
    session.samples.push([...latestReport]);
  }

  roleState.session = session;
  session.timeoutId = setTimeout(() => finalizeAxisDetection(role, 'timeout'), AXIS_DETECTION_WINDOW_MS);
  session.intervalId = setInterval(() => renderAxisDetectionStatus(role), 100);
  renderAxisDetectionStatus(role);
};
const getBrakePrecisionSettings = () => {
  const stored = state.challengeSettings?.brakePrecision || {};
  const steps = Math.max(1, Math.min(12, Math.round(Number(stored.steps) || 3)));
  const delaySeconds = Math.max(1, Math.min(10, Number(stored.delaySeconds) || 3));
  const tolerance = Math.max(1, Math.min(20, Math.round(Number(stored.tolerance) || 3)));

  return {
    steps,
    delaySeconds,
    delayMs: delaySeconds * 1000,
    tolerance,
  };
};
const updateBrakePrecisionSettings = (patch) => {
  state.challengeSettings.brakePrecision = {
    ...getBrakePrecisionSettings(),
    ...patch,
  };
  updateConfig();
};
const TRAIL_MODES = {
  easy: {
    id: 'easy',
    label: 'Fácil',
    description: 'Curva previsível, cursor a 90% e 1 repetição.',
    repetitions: 1,
    speed: 0.9,
    curve: 'suave',
  },
  medium: {
    id: 'medium',
    label: 'Médio',
    description: 'Curva média, cursor a 120% e 2 repetições.',
    repetitions: 2,
    speed: 1.2,
    curve: 'média',
  },
  hard: {
    id: 'hard',
    label: 'Difícil',
    description: 'Curva técnica, cursor a 150% e 3 repetições.',
    repetitions: 3,
    speed: 1.5,
    curve: 'técnica',
  },
};
const getTrailBrakingSettings = () => {
  const mode = state.challengeSettings?.trailBraking?.mode;
  return TRAIL_MODES[mode] || TRAIL_MODES.medium;
};
const updateTrailBrakingSettings = (mode) => {
  state.challengeSettings.trailBraking = { mode: TRAIL_MODES[mode] ? mode : 'medium' };
  updateConfig();
};
const getCurrentChallengeFrame = () => runtime.activeChallenge?.currentFrame || runtime.pendingChallenge?.previewFrame || null;
const getCurrentChallengeDefinition = () => runtime.activeChallenge?.definition
  || runtime.pendingChallenge?.definition
  || getChallengeDefinition(state.ui.selectedChallengeType);
const getChallengeVisualizationMode = (definition) => definition.visualization?.mode || 'default';
const getChallengeSettingsSummary = (definition) => {
  if (definition.id === 'brake-precision') {
    const config = getBrakePrecisionSettings();
    return [
      { label: 'Passos', value: String(config.steps) },
      { label: 'Tempo por atraso', value: `${config.delaySeconds}s` },
      { label: 'Tolerância', value: `±${config.tolerance}%` },
    ];
  }

  if (definition.id === 'trail-braking') {
    const config = getTrailBrakingSettings();
    return [
      { label: 'Modo', value: config.label },
      { label: 'Repetições', value: String(config.repetitions) },
      { label: 'Velocidade', value: `${Math.round(config.speed * 100)}%` },
    ];
  }

  return definition.settings || [];
};
const formatCountdownSeconds = (milliseconds) => `${Math.max(0, milliseconds) / 1000 >= 10 ? Math.ceil(milliseconds / 1000) : (Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
const updateVersionLabels = () => {
  document.querySelectorAll('[data-version-label]').forEach((node) => {
    node.textContent = APP_VERSION;
  });
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
  getRoleKeys().forEach((role) => {
    const statusNode = document.getElementById(`${role}-device-status`);
    if (!statusNode) return;

    const selection = getRoleSelection(role);
    const selectedDevice = getSelectedDevice(selection.deviceId);
    const label = ROLE_DEFS[role].label;

    statusNode.textContent = selectedDevice
      ? `Selecionado: ${getDeviceLabel(selectedDevice)} · ${getAxisLabel(selection.axisIndex || 0)}`
      : `Nenhum dispositivo selecionado para ${label.toLowerCase()}.`;
  });
};

const refreshLiveReadouts = () => {
  const currentValues = {};

  const updateMeter = (fillId, valueId, value) => {
    const fill = document.getElementById(fillId);
    if (fill) {
      fill.style.width = `${value}%`;
      fill.setAttribute('aria-valuenow', String(value));
    }

    const label = document.getElementById(valueId);
    if (label) {
      label.textContent = `${value}%`;
    }
  };

  getRoleKeys().forEach((role) => {
    const value = getSelectedRoleValueOrZero(role);
    currentValues[role] = value;

    const roleDef = ROLE_DEFS[role];
    updateMeter(roleDef.meterFillId, roleDef.meterValueId, value);

    const challengeValue = document.getElementById(roleDef.challengeValueId);
    if (challengeValue) {
      challengeValue.textContent = `${value}%`;
    }

    const targetValue = getCurrentChallengeFrame()?.targets?.[role];
    const challengeTarget = document.getElementById(roleDef.challengeTargetId);
    if (challengeTarget) {
      challengeTarget.textContent = `Target ${Math.round(Number.isFinite(targetValue) ? targetValue : value)}%`;
    }
  });

  state.currentBrakeValue = currentValues.brake || 0;
  state.currentSteeringValue = currentValues.steering || 0;
  state.currentThrottleValue = currentValues.throttle || 0;
  state.currentValue = state.currentBrakeValue;

  const brakeText = document.getElementById('current-value');
  if (brakeText) {
    brakeText.textContent = `${state.currentBrakeValue}%`;
  }

  const visualizer = document.getElementById('visualizer');
  if (visualizer) {
    drawVisualizer();
  }
};

const setSelectedDeviceForRole = (role, deviceId) => {
  const previousSelection = getRoleSelection(role);
  if (getAxisDetectionState(role).session) {
    stopAxisDetection(role, {
      state: 'error',
      message: 'Detecção cancelada porque o dispositivo mudou.',
    });
  }

  if (role === 'brake') {
    state.selectedBrakeDeviceId = deviceId || null;
    if (!deviceId || previousSelection.deviceId !== deviceId) {
      state.selectedBrakeAxisIndex = 0;
    }
  }

  if (role === 'steering') {
    state.selectedSteeringDeviceId = deviceId || null;
    if (!deviceId || previousSelection.deviceId !== deviceId) {
      state.selectedSteeringAxisIndex = 0;
    }
  }

  if (role === 'throttle') {
    state.selectedThrottleDeviceId = deviceId || null;
    if (!deviceId || previousSelection.deviceId !== deviceId) {
      state.selectedThrottleAxisIndex = 0;
    }
  }

  renderSelectedDeviceSummary();
  updateDeviceSelectors();
  refreshLiveReadouts();
  updateConfig();
};

const updateConfig = () => {
  saveState(state);
};

const getSelectedDevice = (deviceId) => state.devices.find((device) => device.deviceId === deviceId);

const updateDeviceSelectors = () => {
  const roleSelects = getRoleKeys().reduce((acc, role) => {
    acc[role] = {
      deviceSelect: document.getElementById(ROLE_DEFS[role].deviceSelectId),
    };
    return acc;
  }, {});
  if (!roleSelects.brake.deviceSelect || !roleSelects.steering.deviceSelect || !roleSelects.throttle.deviceSelect) return;

  const addOption = (select, device) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = getDeviceLabel(device);
    select.appendChild(option);
  };

  getRoleKeys().forEach((role) => {
    const deviceSelect = roleSelects[role].deviceSelect;
    if (!deviceSelect) return;

    deviceSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `Selecione ${ROLE_DEFS[role].label.toLowerCase()}`;
    deviceSelect.appendChild(placeholder);

    state.devices.forEach((device) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = getDeviceLabel(device);
      deviceSelect.appendChild(option);
    });

    if (state.devices.length === 0) {
      deviceSelect.disabled = true;
    } else {
      deviceSelect.disabled = false;
      const selection = getRoleSelection(role);
      if (selection.deviceId) {
        deviceSelect.value = selection.deviceId;
      }
    }
  });

  renderSelectedDeviceSummary();
  renderAxisDetectionStatuses();
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
    getRoleKeys().forEach((role) => recordAxisDetectionSample(role, deviceId, bytes));
    if (
      axisCountChanged
      && (
        deviceId === state.selectedBrakeDeviceId
        || deviceId === state.selectedSteeringDeviceId
        || deviceId === state.selectedThrottleDeviceId
      )
    ) {
      updateDeviceSelectors();
    }
  } else {
    state.currentValue = normalizeReportValue(event.data, state.selectedBrakeAxisIndex);
  }

  refreshLiveReadouts();
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

const requestHIDDevice = async () => {
  try {
    const requestedDevices = await navigator.hid.requestDevice({ filters: [] });
    const devices = Array.from(requestedDevices);
    const mapped = devices.map(mapHIDDeviceToSummary);

    mergeAuthorizedDevices(mapped);

    await setupHIDListeners();
    updateDeviceSelectors();
  } catch (error) {
    console.warn('HID request failed', error);
  }
};

const bindSettings = () => {
  const addDeviceButton = document.getElementById('add-device');
  const clearAllAxesButton = document.getElementById('clear-all-axes');

  if (addDeviceButton) {
    addDeviceButton.addEventListener('click', () => {
      if (!navigator.hid) {
        alert('WebHID não está disponível neste navegador. Use Chrome ou Edge.');
        return;
      }

      requestHIDDevice();
    });
  }

  if (clearAllAxesButton) {
    clearAllAxesButton.addEventListener('click', resetAllAxisSelections);
  }

  const brakeSelect = document.getElementById('brake-device');
  const steeringSelect = document.getElementById('steering-device');
  const throttleSelect = document.getElementById('throttle-device');

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

  if (throttleSelect) {
    throttleSelect.addEventListener('change', (event) => {
      setSelectedDeviceForRole('throttle', event.target.value);
    });
  }

  getRoleKeys().forEach((role) => {
    const detectButton = document.getElementById(ROLE_DEFS[role].detectionButtonId);
    if (!detectButton) return;

    detectButton.addEventListener('click', () => startAxisDetection(role));
  });

  updateDeviceSelectors();
};

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const lerp = (start, end, t) => start + ((end - start) * t);
const roundTo = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const average = (values) => {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) {
    return 0;
  }
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
};
const stddev = (values) => {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length <= 1) {
    return 0;
  }
  const mean = average(filtered);
  const variance = filtered.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / filtered.length;
  return Math.sqrt(variance);
};
const averageDelta = (values) => {
  if (values.length <= 1) {
    return 0;
  }
  let total = 0;
  for (let index = 1; index < values.length; index += 1) {
    total += Math.abs(values[index] - values[index - 1]);
  }
  return total / (values.length - 1);
};
const correlation = (leftValues, rightValues) => {
  const pairs = leftValues
    .map((leftValue, index) => [leftValue, rightValues[index]])
    .filter(([leftValue, rightValue]) => Number.isFinite(leftValue) && Number.isFinite(rightValue));

  if (pairs.length <= 1) {
    return 0;
  }

  const leftMean = average(pairs.map(([leftValue]) => leftValue));
  const rightMean = average(pairs.map(([, rightValue]) => rightValue));
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  pairs.forEach(([leftValue, rightValue]) => {
    const leftDelta = leftValue - leftMean;
    const rightDelta = rightValue - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  });

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 0 : numerator / denominator;
};
const scoreFromError = (error, multiplier = 2) => clamp(100 - (error * multiplier));
const scoreFromSmoothness = (delta, multiplier = 3) => clamp(100 - (delta * multiplier));
const scoreFromSpread = (spread, multiplier = 6) => clamp(100 - (spread * multiplier));
const createSeededRandom = (seed = Date.now()) => {
  let stateValue = Math.abs(Math.floor(seed)) % 2147483647;
  if (stateValue === 0) {
    stateValue = 1;
  }

  return () => {
    stateValue = (stateValue * 16807) % 2147483647;
    return (stateValue - 1) / 2147483646;
  };
};
const randomInt = (rng, min, max) => Math.round(lerp(min, max, rng()));
const getRoleValueMap = () => getRoleKeys().reduce((acc, role) => {
  acc[role] = getSelectedRoleValueOrZero(role);
  return acc;
}, {});
const buildPhases = (phases) => {
  let startMs = 0;
  const normalizedPhases = phases.map((phase) => {
    const durationMs = phase.durationMs;
    const normalizedPhase = {
      ...phase,
      startMs,
      endMs: startMs + durationMs,
    };
    startMs += durationMs;
    return normalizedPhase;
  });

  return {
    phases: normalizedPhases,
    totalDurationMs: startMs,
  };
};
const getFrameAt = (plan, elapsedMs) => {
  const activePhase = plan.phases.find((phase) => elapsedMs >= phase.startMs && elapsedMs < phase.endMs)
    || plan.phases[plan.phases.length - 1];
  const phaseProgress = clamp((elapsedMs - activePhase.startMs) / Math.max(1, activePhase.durationMs), 0, 1);
  const targets = {};

  getRoleKeys().forEach((role) => {
    const range = activePhase.targets?.[role] || [0, 0];
    targets[role] = lerp(range[0], range[1], phaseProgress);
  });

  return {
    phase: activePhase,
    targets,
    progress: clamp(elapsedMs / Math.max(1, plan.totalDurationMs), 0, 1),
  };
};
const getSamplesForPhase = (samples, phase) => samples.filter((sample) => sample.elapsedMs >= phase.startMs && sample.elapsedMs < phase.endMs);
const getAxisSeries = (samples, role, selector = (sample) => sample.values[role]) => samples.map(selector).filter((value) => Number.isFinite(value));
const getMeanAbsError = (samples, role) => average(samples.map((sample) => Math.abs(sample.values[role] - sample.targets[role])));
const getMeanTarget = (samples, role) => average(samples.map((sample) => sample.targets[role]));
const getLastNonZeroIndex = (series, threshold = 1) => {
  let index = -1;
  series.forEach((value, currentIndex) => {
    if (Number.isFinite(value) && value > threshold) {
      index = currentIndex;
    }
  });
  return index;
};
const getFirstAbove = (series, threshold) => series.findIndex((value) => Number.isFinite(value) && value >= threshold);

const CHALLENGE_LIBRARY = {
  'brake-precision': {
    id: 'brake-precision',
    title: 'Brake Precision Challenge',
    shortTitle: 'Brake Precision',
    description: 'O app sorteia alvos de freio e você precisa segurar cada valor com estabilidade, com a troca indicada por um contador visual.',
    objective: 'Memória muscular do pé, precisão de frenagem e consistência em alvos aleatórios.',
    visualization: { mode: 'brake-precision' },
    rules: [
      'Segure o brake dentro da janela de tolerância por 2 segundos.',
      'Cada rodada traz um novo alvo aleatório.',
      'Evite oscilações bruscas enquanto mantém o valor.',
    ],
    requiredRoles: ['brake'],
    buildPlan: () => {
      const rng = createSeededRandom(Date.now());
      const config = getBrakePrecisionSettings();
      const targets = Array.from({ length: config.steps }, () => randomInt(rng, 35, 92));
      return {
        ...buildPhases(targets.map((target, index) => ({
        name: `Step ${index + 1}`,
        label: `Brake Target: ${target}%`,
        durationMs: config.delayMs,
        targets: {
          brake: [target, target],
          steering: [0, 0],
          throttle: [0, 0],
        },
        target,
      }))),
        settings: config,
      };
    },
    evaluate: (samples, plan) => {
      const config = plan.settings || getBrakePrecisionSettings();
      const phaseStats = plan.phases.map((phase) => {
        const phaseSamples = getSamplesForPhase(samples, phase);
        const target = phase.target || phase.targets.brake[0];
        const errors = phaseSamples.map((sample) => Math.abs(sample.values.brake - target));
        const withinTolerance = phaseSamples.filter((sample) => Math.abs(sample.values.brake - target) <= config.tolerance).length;
        const series = getAxisSeries(phaseSamples, 'brake');
        return {
          target,
          meanError: average(errors),
          withinRatio: phaseSamples.length ? withinTolerance / phaseSamples.length : 0,
          smoothness: averageDelta(series),
          meanValue: average(series),
        };
      });

      const accuracy = scoreFromError(average(phaseStats.map((phaseStat) => phaseStat.meanError)), 1.8);
      const holdStability = clamp(average(phaseStats.map((phaseStat) => phaseStat.withinRatio)) * 100);
      const brakeModulation = clamp((scoreFromSmoothness(average(phaseStats.map((phaseStat) => phaseStat.smoothness)), 2.2)
        + holdStability) / 2);
      const consistency = scoreFromSpread(stddev(phaseStats.map((phaseStat) => phaseStat.meanError)), 10);
      const overall = roundTo(average([accuracy, holdStability, brakeModulation, consistency]));

      return {
        challengeType: 'brake-precision',
        title: 'Brake Precision Challenge',
        score: overall,
        summary: `Precisão consistente nos alvos de brake. Score final ${overall}/100.`,
        completedAt: new Date().toISOString(),
        durationMs: plan.totalDurationMs,
        settings: config,
        skillScores: {
          brakePrecision: accuracy,
          brakeModulation,
          consistency,
        },
        metrics: {
          accuracy,
          holdStability,
          brakeModulation,
          consistency,
        },
        plan,
      };
    },
  },
  'trail-braking': {
    id: 'trail-braking',
    title: 'Trail Braking Challenge',
    shortTitle: 'Trail Braking',
    description: 'Você enfrenta uma curva simulada onde brake cai enquanto steering sobe, exigindo soltura progressiva e coordenação fina.',
    objective: 'Desenvolver trail braking suave, controlar a transição brake → steering e manter repetibilidade de curva.',
    visualization: { mode: 'trail-graph' },
    settings: [
      { label: 'Gráfico', value: 'linha ideal + real' },
      { label: 'Captura', value: 'cursor vertical' },
    ],
    rules: [
      'Reduza o brake aos poucos durante a entrada da curva.',
      'A steering precisa crescer de forma progressiva.',
      'Evite quedas bruscas de brake e movimentos de steering em zigue-zague.',
    ],
    requiredRoles: ['brake', 'steering'],
    buildPlan: () => {
      const rng = createSeededRandom(Date.now());
      const config = getTrailBrakingSettings();
      const scenarios = [
        { name: 'Curva média à direita', brakeStart: randomInt(rng, 85, 96), steeringPeak: randomInt(rng, 58, 72) },
        { name: 'Curva rápida à esquerda', brakeStart: randomInt(rng, 88, 98), steeringPeak: randomInt(rng, 48, 62) },
      ];
      const scenario = scenarios[randomInt(rng, 0, scenarios.length - 1)];
      const phases = [];
      const duration = (milliseconds) => Math.round(milliseconds / config.speed);

      for (let rep = 0; rep < config.repetitions; rep += 1) {
        phases.push({
          name: `Entrada ${rep + 1}`,
          repIndex: rep,
          label: `${scenario.name} - entrada`,
          durationMs: duration(config.id === 'easy' ? 1500 : 1200),
          targets: {
            brake: [scenario.brakeStart, scenario.brakeStart - 8],
            steering: [0, 12],
            throttle: [0, 0],
          },
        });
        phases.push({
          name: `Transição ${rep + 1}`,
          repIndex: rep,
          label: `${scenario.name} - transição`,
          durationMs: duration(config.id === 'easy' ? 2100 : config.id === 'hard' ? 1150 : 1600),
          targets: {
            brake: [scenario.brakeStart - 8, 12],
            steering: [12, scenario.steeringPeak],
            throttle: [0, 0],
          },
        });
        if (config.id === 'hard') {
          phases.push({
            name: `Compressão ${rep + 1}`,
            repIndex: rep,
            label: `${scenario.name} - compressão`,
            durationMs: duration(700),
            targets: {
              brake: [12, 5],
              steering: [scenario.steeringPeak, scenario.steeringPeak + 8],
              throttle: [0, 0],
            },
          });
        }
        phases.push({
          name: `Apex ${rep + 1}`,
          repIndex: rep,
          label: `${scenario.name} - apex`,
          durationMs: duration(config.id === 'easy' ? 1100 : 900),
          targets: {
            brake: [config.id === 'hard' ? 5 : 12, 0],
            steering: [config.id === 'hard' ? scenario.steeringPeak + 8 : scenario.steeringPeak, config.id === 'hard' ? scenario.steeringPeak + 8 : scenario.steeringPeak],
            throttle: [0, 0],
          },
        });
        phases.push({
          name: `Saída ${rep + 1}`,
          repIndex: rep,
          label: `${scenario.name} - saída`,
          durationMs: duration(config.id === 'easy' ? 1300 : 1000),
          targets: {
            brake: [0, 0],
            steering: [scenario.steeringPeak, 30],
            throttle: [0, 15],
          },
        });
      }

      return {
        ...buildPhases(phases),
        scenario,
        settings: config,
      };
    },
    evaluate: (samples, plan) => {
      const brakeErrors = [];
      const steeringErrors = [];
      const brakeSeries = [];
      const steeringSeries = [];
      const repScores = [];

      plan.phases.forEach((phase) => {
        const phaseSamples = getSamplesForPhase(samples, phase);
        brakeErrors.push(...phaseSamples.map((sample) => Math.abs(sample.values.brake - sample.targets.brake)));
        steeringErrors.push(...phaseSamples.map((sample) => Math.abs(sample.values.steering - sample.targets.steering)));
        brakeSeries.push(...getAxisSeries(phaseSamples, 'brake'));
        steeringSeries.push(...getAxisSeries(phaseSamples, 'steering'));
      });

      const config = plan.settings || getTrailBrakingSettings();
      for (let rep = 0; rep < config.repetitions; rep += 1) {
        const repPhases = plan.phases.filter((phase) => phase.repIndex === rep);
        const repSamples = repPhases.flatMap((phase) => getSamplesForPhase(samples, phase));
        repScores.push(scoreFromError(average(repSamples.map((sample) => Math.abs(sample.values.brake - sample.targets.brake)
          + Math.abs(sample.values.steering - sample.targets.steering))), 1.2));
      }

      const transitionSamples = plan.phases
        .filter((phase) => phase.name.includes('Transição') || phase.name.includes('Compressão'))
        .flatMap((phase) => getSamplesForPhase(samples, phase));
      const brakeVelocity = transitionSamples.map((sample, index) => (index === 0 ? 0 : transitionSamples[index - 1].values.brake - sample.values.brake));
      const steeringVelocity = transitionSamples.map((sample, index) => (index === 0 ? 0 : sample.values.steering - transitionSamples[index - 1].values.steering));
      const trailCorrelation = correlation(brakeVelocity.map((value) => Math.max(0, value)), steeringVelocity.map((value) => Math.max(0, value)));
      const overlapPenalty = transitionSamples.length
        ? transitionSamples.filter((sample) => sample.values.brake > 25 && sample.values.steering > 20).length / transitionSamples.length
        : 0;

      const brakePrecision = scoreFromError(average(brakeErrors), 1.5);
      const steeringPrecision = scoreFromError(average(steeringErrors), 1.5);
      const trailBraking = clamp(((trailCorrelation + 1) / 2) * 100 - (overlapPenalty * 25));
      const steeringSmoothness = scoreFromSmoothness(averageDelta(steeringSeries), 2.4);
      const coordination = clamp(average([trailBraking, steeringPrecision, 100 - (overlapPenalty * 40)]));
      const consistency = clamp(average(repScores));
      const overall = roundTo(average([trailBraking, steeringPrecision, steeringSmoothness, coordination, consistency]));

      return {
        challengeType: 'trail-braking',
        title: 'Trail Braking Challenge',
        score: overall,
        summary: `${plan.scenario.name} executada com ${overall}/100. Foco em suavidade e sincronia.`,
        completedAt: new Date().toISOString(),
        durationMs: plan.totalDurationMs,
        skillScores: {
          trailBraking,
          steeringPrecision,
          steeringSmoothness,
          coordination,
          consistency,
        },
        metrics: {
          brakePrecision,
          steeringPrecision,
          trailBraking,
          steeringSmoothness,
          coordination,
          consistency,
        },
        plan,
      };
    },
  },
  'input-sync': {
    id: 'input-sync',
    title: 'Input Synchronization Challenge',
    shortTitle: 'Input Sync',
    description: 'O sistema analisa brake, steering e throttle ao mesmo tempo para validar a sequência correta de entrada e saída de curva.',
    objective: 'Executar a sequência brake → steering → release brake → throttle → full throttle sem sobreposições desnecessárias.',
    visualization: { mode: 'sync-dashboard' },
    settings: [
      { label: 'Eixos', value: '3' },
      { label: 'Sequência', value: 'Brake → Steering → Throttle' },
      { label: 'Medição', value: '0–100' },
    ],
    rules: [
      'Brake precisa cair antes da saída completa da curva.',
      'Steering deve subir enquanto o brake é liberado.',
      'Throttle só deve crescer de verdade quando a curva estiver abrindo.',
    ],
    requiredRoles: ['brake', 'steering', 'throttle'],
    buildPlan: () => {
      const rng = createSeededRandom(Date.now());
      const profiles = [
        { name: 'Entrada de curva rápida', brakeStart: randomInt(rng, 90, 100), steeringPeak: randomInt(rng, 62, 78), throttleExit: randomInt(rng, 90, 100) },
        { name: 'Entrada de curva média', brakeStart: randomInt(rng, 86, 96), steeringPeak: randomInt(rng, 55, 70), throttleExit: randomInt(rng, 85, 100) },
      ];
      const profile = profiles[randomInt(rng, 0, profiles.length - 1)];
      const phases = [];

      for (let rep = 0; rep < 2; rep += 1) {
        phases.push({
          name: `Entrada ${rep + 1}`,
          repIndex: rep,
          label: `${profile.name} - entrada`,
          durationMs: 1400,
          targets: {
            brake: [profile.brakeStart, profile.brakeStart - 5],
            steering: [0, 18],
            throttle: [0, 0],
          },
        });
        phases.push({
          name: `Apex ${rep + 1}`,
          repIndex: rep,
          label: `${profile.name} - apex`,
          durationMs: 1800,
          targets: {
            brake: [profile.brakeStart - 5, 8],
            steering: [18, profile.steeringPeak],
            throttle: [0, 24],
          },
        });
        phases.push({
          name: `Saída ${rep + 1}`,
          repIndex: rep,
          label: `${profile.name} - saída`,
          durationMs: 1800,
          targets: {
            brake: [8, 0],
            steering: [profile.steeringPeak, 22],
            throttle: [24, profile.throttleExit],
          },
        });
      }

      return {
        ...buildPhases(phases),
        profile,
      };
    },
    evaluate: (samples, plan) => {
      const brakeErrors = [];
      const steeringErrors = [];
      const throttleErrors = [];
      const brakeSeries = getAxisSeries(samples, 'brake');
      const steeringSeries = getAxisSeries(samples, 'steering');
      const throttleSeries = getAxisSeries(samples, 'throttle');
      const repScores = [];

      plan.phases.forEach((phase) => {
        const phaseSamples = getSamplesForPhase(samples, phase);
        brakeErrors.push(...phaseSamples.map((sample) => Math.abs(sample.values.brake - sample.targets.brake)));
        steeringErrors.push(...phaseSamples.map((sample) => Math.abs(sample.values.steering - sample.targets.steering)));
        throttleErrors.push(...phaseSamples.map((sample) => Math.abs(sample.values.throttle - sample.targets.throttle)));
      });

      for (let rep = 0; rep < 2; rep += 1) {
        const repPhases = plan.phases.filter((phase) => phase.repIndex === rep);
        const repSamples = repPhases.flatMap((phase) => getSamplesForPhase(samples, phase));
        const entry = repPhases[0] ? getSamplesForPhase(samples, repPhases[0]) : [];
        const apex = repPhases[1] ? getSamplesForPhase(samples, repPhases[1]) : [];
        const exit = repPhases[2] ? getSamplesForPhase(samples, repPhases[2]) : [];
        const repVariance = stddev(repSamples.map((sample) => Math.abs(sample.values.brake - sample.targets.brake)
          + Math.abs(sample.values.steering - sample.targets.steering)
          + Math.abs(sample.values.throttle - sample.targets.throttle)));
        repScores.push(scoreFromSpread(repVariance, 8));

        const entryBrakeCross = getFirstAbove(entry.map((sample) => 100 - sample.values.brake), 50);
        const apexSteerCross = getFirstAbove(apex.map((sample) => sample.values.steering), 35);
        const exitThrottleCross = getFirstAbove(exit.map((sample) => sample.values.throttle), 25);
        const ordered = entryBrakeCross >= 0 && apexSteerCross >= 0 && exitThrottleCross >= 0
          && entryBrakeCross <= apexSteerCross
          && apexSteerCross <= exitThrottleCross;
        repScores.push(ordered ? 100 : 60);
      }

      const brakePrecision = scoreFromError(average(brakeErrors), 1.4);
      const steeringPrecision = scoreFromError(average(steeringErrors), 1.4);
      const throttleControl = scoreFromError(average(throttleErrors), 1.5);
      const brakeReleaseSmoothness = scoreFromSmoothness(averageDelta(brakeSeries), 2.1);
      const steeringSmoothness = scoreFromSmoothness(averageDelta(steeringSeries), 2.0);
      const exitDrive = clamp((average(throttleSeries.slice(Math.floor(throttleSeries.length / 2))) + (100 - average(brakeSeries.slice(Math.floor(brakeSeries.length / 2))))) / 2);
      const coordination = clamp(average(repScores));
      const consistency = clamp(stddev(repScores) ? 100 - (stddev(repScores) * 1.2) : 100);
      const overall = roundTo(average([brakePrecision, steeringPrecision, throttleControl, brakeReleaseSmoothness, steeringSmoothness, exitDrive, coordination, consistency]));

      return {
        challengeType: 'input-sync',
        title: 'Input Synchronization Challenge',
        score: overall,
        summary: `${plan.profile.name} concluída com ${overall}/100, medindo sequência e fluidez dos 3 eixos.`,
        completedAt: new Date().toISOString(),
        durationMs: plan.totalDurationMs,
        skillScores: {
          brakePrecision,
          steeringPrecision,
          throttleControl,
          exitDrive,
          coordination,
          consistency,
        },
        metrics: {
          brakePrecision,
          steeringPrecision,
          throttleControl,
          brakeReleaseSmoothness,
          steeringSmoothness,
          exitDrive,
          coordination,
          consistency,
        },
        plan,
      };
    },
  },
};

const getChallengeDefinition = (challengeType) => CHALLENGE_LIBRARY[challengeType] || CHALLENGE_LIBRARY['brake-precision'];

const getMissingRolesForChallenge = (challengeType) => {
  const definition = getChallengeDefinition(challengeType);
  return definition.requiredRoles.filter((role) => !getRoleSelection(role).deviceId);
};

const getChallengeStatusText = () => {
  if (runtime.pendingChallenge) {
    return 'Preparando início...';
  }

  if (!runtime.activeChallenge) {
    return 'Aguardando ação.';
  }

  const frame = runtime.activeChallenge.currentFrame;
  if (!frame) {
    return 'Desafio em andamento...';
  }

  const remainingMs = Math.max(0, runtime.activeChallenge.plan.totalDurationMs - runtime.activeChallenge.elapsedMs);
  return `${frame.phase.name} | ${Math.ceil(remainingMs / 1000)}s restantes`;
};

const getChallengeTimerText = (challenge) => {
  if (!challenge) {
    return '0.0s';
  }

  if (runtime.pendingChallenge === challenge) {
    const stepDurationMs = challenge.plan?.phases?.[0]?.durationMs || challenge.plan?.totalDurationMs || 3000;
    return `${Math.round(stepDurationMs / 1000)}s`;
  }

  if (challenge.definition.id === 'brake-precision') {
    const frame = challenge.currentFrame || challenge.previewFrame;
    const phase = frame?.phase || null;
    const remainingMs = phase ? Math.max(0, phase.endMs - (challenge.elapsedMs || 0)) : 0;
    return formatCountdownSeconds(remainingMs);
  }

  const remainingMs = Math.max(0, challenge.plan.totalDurationMs - challenge.elapsedMs);
  return `${Math.ceil(remainingMs / 1000)}s`;
};

const clearChallengeTimer = () => {
  if (runtime.timerId) {
    clearInterval(runtime.timerId);
    runtime.timerId = null;
  }
};

const startActiveChallenge = (pendingChallenge) => {
  runtime.pendingChallenge = null;
  runtime.activeChallenge = {
    definition: pendingChallenge.definition,
    plan: pendingChallenge.plan,
    startedAt: Date.now(),
    elapsedMs: 0,
    samples: [],
    currentFrame: getFrameAt(pendingChallenge.plan, 0),
    liveScore: 0,
  };
  renderChallengePage();
  refreshLiveReadouts();
};

const renderChallengeSelector = () => {
  const container = document.getElementById('challenge-selector');
  if (!container) return;

  const selectedType = state.ui.selectedChallengeType;
  container.innerHTML = '';

  Object.values(CHALLENGE_LIBRARY).forEach((definition) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `challenge-chip${selectedType === definition.id ? ' challenge-chip--active' : ''}`;
    button.dataset.challengeType = definition.id;
    button.disabled = Boolean(runtime.activeChallenge || runtime.pendingChallenge);
    button.textContent = definition.shortTitle;
    button.addEventListener('click', () => {
      state.ui.selectedChallengeType = definition.id;
      updateConfig();
      renderChallengePage();
    });
    container.appendChild(button);
  });
};

const renderChallengePage = () => {
  const definition = getChallengeDefinition(state.ui.selectedChallengeType);
  const challenge = runtime.activeChallenge || runtime.pendingChallenge;
  const currentFrame = getCurrentChallengeFrame();
  const presentationMode = getChallengeVisualizationMode(definition);
  const titleNode = document.getElementById('challenge-title');
  const descriptionNode = document.getElementById('challenge-description');
  const objectiveNode = document.getElementById('challenge-objective');
  const rulesNode = document.getElementById('challenge-rules');
  const requirementsNode = document.getElementById('challenge-requirements');
  const phaseNode = document.getElementById('challenge-phase');
  const scoreNode = document.getElementById('challenge-score');
  const timeNode = document.getElementById('challenge-time');
  const statusNode = document.getElementById('status-text');
  const startButton = document.getElementById('start-challenge');
  const challengeMeta = document.getElementById('challenge-meta');
  const settingsNode = document.getElementById('challenge-settings');
  const summaryNode = document.getElementById('challenge-summary');
  const breakdownNode = document.getElementById('challenge-breakdown');
  const modalNode = document.getElementById('challenge-modal');
  const modalCountdownNode = document.getElementById('challenge-modal-countdown');
  const modalSubtitleNode = document.getElementById('challenge-modal-subtitle');
  const telemetryNode = document.querySelector('.challenge-telemetry');
  const primaryReading = document.getElementById('current-value');

  if (titleNode) titleNode.textContent = definition.title;
  if (descriptionNode) descriptionNode.textContent = definition.description;
  if (objectiveNode) objectiveNode.textContent = definition.objective;

  if (rulesNode) {
    rulesNode.innerHTML = '';
    definition.rules.forEach((rule) => {
      const item = document.createElement('li');
      item.textContent = rule;
      rulesNode.appendChild(item);
    });
  }

  if (requirementsNode) {
    requirementsNode.innerHTML = '';
    definition.requiredRoles.forEach((role) => {
      const pill = document.createElement('span');
      pill.className = 'requirement-pill';
      pill.textContent = ROLE_DEFS[role].label;
      requirementsNode.appendChild(pill);
    });
  }

  if (challengeMeta) {
    const missingRoles = getMissingRolesForChallenge(definition.id);
    const settings = getChallengeSettingsSummary(definition);
    const readiness = missingRoles.length
      ? `Requer: ${definition.requiredRoles.map((role) => ROLE_DEFS[role].label).join(', ')}`
      : `Pronto para rodar: ${definition.requiredRoles.map((role) => ROLE_DEFS[role].label).join(', ')}`;
    challengeMeta.textContent = settings.length
      ? `${readiness} • ${settings.map((item) => `${item.label}: ${item.value}`).join(' • ')}`
      : readiness;
  }

  if (phaseNode) {
    if (runtime.pendingChallenge) {
      phaseNode.textContent = 'Contagem regressiva';
    } else if (runtime.activeChallenge) {
      phaseNode.textContent = runtime.activeChallenge.currentFrame?.phase.name || 'Preparando fase...';
    } else {
      phaseNode.textContent = 'Sem desafio ativo';
    }
  }

  if (timeNode) {
    if (runtime.pendingChallenge) {
      timeNode.textContent = `${Math.round((runtime.pendingChallenge.plan?.phases?.[0]?.durationMs || 3000) / 1000)}s`;
    } else if (runtime.activeChallenge) {
      timeNode.textContent = getChallengeTimerText(runtime.activeChallenge);
    } else {
      timeNode.textContent = '0s';
    }
  }

  if (scoreNode) {
    scoreNode.textContent = runtime.activeChallenge?.liveScore != null
      ? `${Math.round(runtime.activeChallenge.liveScore)}/100`
      : '--';
  }

  if (statusNode) {
    const missingRoles = getMissingRolesForChallenge(definition.id);
    statusNode.textContent = runtime.pendingChallenge
      ? 'Preparando início...'
      : runtime.activeChallenge
        ? getChallengeStatusText()
        : missingRoles.length
          ? `Selecione: ${missingRoles.map((role) => ROLE_DEFS[role].label.toLowerCase()).join(', ')}.`
          : 'Pronto para iniciar.';
  }

  if (startButton) {
    startButton.disabled = Boolean(runtime.activeChallenge || runtime.pendingChallenge);
    startButton.textContent = runtime.activeChallenge
      ? 'Desafio em andamento...'
      : runtime.pendingChallenge
        ? 'Preparando...'
        : 'Iniciar desafio';
  }

  if (summaryNode) {
    const settingsHtml = getChallengeSettingsSummary(definition).map((item) => `
      <div class="summary-box">
        <span>${item.label}</span>
        <strong>${item.value}</strong>
      </div>
    `).join('');

    if (runtime.pendingChallenge) {
      summaryNode.innerHTML = `
        <div class="summary-box">
          <span>Primeiro passo</span>
          <strong>${runtime.pendingChallenge.previewFrame?.phase.name || 'Preparando...'}</strong>
        </div>
        <div class="summary-box">
          <span>Duração da etapa</span>
          <strong>${Math.round((runtime.pendingChallenge.plan?.phases?.[0]?.durationMs || 3000) / 1000)}s</strong>
        </div>
      `;
    } else if (runtime.activeChallenge) {
      summaryNode.innerHTML = `
        <div class="summary-box">
          <span>Score atual</span>
          <strong>${Math.round(runtime.activeChallenge.liveScore || 0)}/100</strong>
        </div>
        <div class="summary-box">
          <span>Fase</span>
          <strong>${runtime.activeChallenge.currentFrame?.phase.name || '...'}</strong>
        </div>
        <div class="summary-box">
          <span>Tempo restante</span>
          <strong>${getChallengeTimerText(runtime.activeChallenge)}</strong>
        </div>
      `;
    } else {
      summaryNode.innerHTML = `
        <div class="summary-box">
          <span>Status</span>
          <strong>Pronto para iniciar</strong>
        </div>
        ${settingsHtml}
      `;
    }
  }

  if (settingsNode) {
    if (definition.id === 'trail-braking' && !runtime.activeChallenge && !runtime.pendingChallenge) {
      const config = getTrailBrakingSettings();
      settingsNode.innerHTML = `
        <div class="challenge-settings-panel">
          <div class="challenge-settings-panel__header">
            <span class="section-eyebrow">Ajustes do desafio</span>
            <h3>Trail Braking</h3>
          </div>
          <div class="trail-mode-grid">
            ${Object.values(TRAIL_MODES).map((mode) => `
              <label class="trail-mode-option${mode.id === config.id ? ' trail-mode-option--active' : ''}">
                <input type="radio" name="trail-mode" value="${mode.id}"${mode.id === config.id ? ' checked' : ''} />
                <span class="trail-mode-option__title">${mode.label}</span>
                <span class="trail-mode-option__meta">${mode.repetitions} repetições • cursor ${Math.round(mode.speed * 100)}%</span>
                <small>${mode.description}</small>
              </label>
            `).join('')}
          </div>
        </div>
      `;

      settingsNode.querySelectorAll('input[name="trail-mode"]').forEach((input) => {
        input.addEventListener('change', (event) => {
          updateTrailBrakingSettings(event.target.value);
          renderChallengePage();
        });
      });
    } else if (definition.id === 'brake-precision' && !runtime.activeChallenge && !runtime.pendingChallenge) {
      const config = getBrakePrecisionSettings();
      settingsNode.innerHTML = `
        <div class="challenge-settings-panel">
          <div class="challenge-settings-panel__header">
            <span class="section-eyebrow">Ajustes do desafio</span>
            <h3>Brake Precision</h3>
          </div>
          <div class="challenge-settings-grid">
            <label class="challenge-setting">
              <span>Passos</span>
              <input id="brake-precision-steps" type="number" min="1" max="12" value="${config.steps}" />
            </label>
            <label class="challenge-setting">
              <span>Tempo por atraso (s)</span>
              <input id="brake-precision-delay" type="number" min="1" max="10" step="0.5" value="${config.delaySeconds}" />
            </label>
            <label class="challenge-setting">
              <span>Tolerância (%)</span>
              <input id="brake-precision-tolerance" type="number" min="1" max="20" value="${config.tolerance}" />
            </label>
          </div>
        </div>
      `;

      const stepsInput = document.getElementById('brake-precision-steps');
      const delayInput = document.getElementById('brake-precision-delay');
      const toleranceInput = document.getElementById('brake-precision-tolerance');

      if (stepsInput) {
        stepsInput.addEventListener('change', (event) => {
          updateBrakePrecisionSettings({ steps: Math.max(1, Math.min(12, Math.round(Number(event.target.value) || config.steps))) });
          renderChallengePage();
        });
      }

      if (delayInput) {
        delayInput.addEventListener('change', (event) => {
          updateBrakePrecisionSettings({ delaySeconds: Math.max(1, Math.min(10, Number(event.target.value) || config.delaySeconds)) });
          renderChallengePage();
        });
      }

      if (toleranceInput) {
        toleranceInput.addEventListener('change', (event) => {
          updateBrakePrecisionSettings({ tolerance: Math.max(1, Math.min(20, Math.round(Number(event.target.value) || config.tolerance))) });
          renderChallengePage();
        });
      }
    } else {
      settingsNode.innerHTML = `
        <div class="challenge-settings-panel challenge-settings-panel--static">
          <div class="challenge-settings-panel__header">
            <span class="section-eyebrow">Ajustes deste desafio</span>
            <h3>${definition.title}</h3>
          </div>
          <div class="challenge-settings-grid">
            ${getChallengeSettingsSummary(definition).map((item) => `
              <div class="summary-box">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  if (breakdownNode && !runtime.activeChallenge && !runtime.pendingChallenge) {
    const lastResult = state.challenges[state.challenges.length - 1];
    breakdownNode.innerHTML = `
      <div class="score-card">
        <span class="section-eyebrow">Ajustes deste desafio</span>
        ${getChallengeSettingsSummary(definition).map((item) => `<p>${item.label}: ${item.value}</p>`).join('')}
      </div>
      ${lastResult
        ? `
          <div class="score-card">
            <span class="section-eyebrow">Último resultado</span>
            <strong>${lastResult.title}</strong>
            <p>${lastResult.summary || ''}</p>
          </div>
        `
        : ''}
    `;
  }

  if (breakdownNode && runtime.pendingChallenge) {
    const targets = runtime.pendingChallenge.previewFrame?.targets || {};
    breakdownNode.innerHTML = `
      <div class="score-card">
        <span class="section-eyebrow">Aguarde o início</span>
        <p>Target brake: ${Math.round(targets.brake || 0)}%</p>
        <p>Tempo até iniciar: ${Math.max(1, Math.ceil((runtime.pendingChallenge.countdownEndsAt - Date.now()) / 1000))}s</p>
      </div>
    `;
  }

  if (breakdownNode && runtime.activeChallenge) {
    const targets = currentFrame?.targets || {};
    breakdownNode.innerHTML = `
      <div class="score-card">
        <span class="section-eyebrow">Targets da fase</span>
        <p>Brake: ${Math.round(targets.brake || 0)}%</p>
        <p>Steering: ${Math.round(targets.steering || 0)}%</p>
        <p>Throttle: ${Math.round(targets.throttle || 0)}%</p>
      </div>
      <div class="score-card">
        <span class="section-eyebrow">Progresso</span>
        <p>${Math.round((runtime.activeChallenge.currentFrame?.progress || 0) * 100)}%</p>
      </div>
    `;
  }

  if (modalNode) {
    if (runtime.pendingChallenge) {
      const remainingMs = Math.max(0, runtime.pendingChallenge.countdownEndsAt - Date.now());
      modalNode.classList.remove('challenge-modal--hidden');
      modalNode.setAttribute('aria-hidden', 'false');
      if (modalCountdownNode) {
        modalCountdownNode.textContent = `${Math.max(0, Math.ceil(remainingMs / 1000))}`;
      }
      if (modalSubtitleNode) {
        modalSubtitleNode.textContent = `O desafio começa em ${Math.max(1, Math.ceil(remainingMs / 1000))} segundos.`;
      }
    } else {
      modalNode.classList.add('challenge-modal--hidden');
      modalNode.setAttribute('aria-hidden', 'true');
      if (modalCountdownNode) {
        modalCountdownNode.textContent = '3';
      }
      if (modalSubtitleNode) {
        modalSubtitleNode.textContent = 'Aguarde o início para começar a medição.';
      }
    }
  }

  if (telemetryNode) {
    telemetryNode.classList.toggle('challenge-telemetry--hidden', presentationMode !== 'sync-dashboard');
  }

  if (primaryReading) {
    primaryReading.textContent = `${getSelectedRoleValueOrZero('brake')}%`;
  }

  renderChallengeSelector();
  refreshLiveReadouts();
  drawVisualizer();
};

const renderPilotCard = () => {
  const container = document.getElementById('pilot-card');
  if (!container) return;

  const skillBuckets = new Map();
  state.challenges.forEach((challenge) => {
    Object.entries(challenge.skillScores || {}).forEach(([skill, score]) => {
      if (!skillBuckets.has(skill)) {
        skillBuckets.set(skill, []);
      }
      skillBuckets.get(skill).push(score);
    });
  });

  const skillRows = PILOT_SKILLS.map((skill) => {
    const values = skillBuckets.get(skill.key) || [];
    const score = values.length ? roundTo(average(values)) : null;
    return {
      ...skill,
      score,
      count: values.length,
    };
  });

  const populated = skillRows.filter((skill) => skill.score != null);
  const overall = populated.length ? roundTo(average(populated.map((skill) => skill.score))) : null;

  container.innerHTML = `
    <div class="pilot-card__header">
      <div>
        <p class="section-eyebrow">Carteira de piloto</p>
        <h3>Pilotagem geral</h3>
      </div>
      <div class="pilot-card__score">${overall != null ? `${overall}/100` : '--'}</div>
    </div>
    <div class="skill-grid">
      ${skillRows.map((skill) => `
        <div class="skill-item">
          <div class="skill-item__top">
            <span>${skill.label}</span>
            <strong>${skill.score != null ? `${Math.round(skill.score)}` : '--'}</strong>
          </div>
          <div class="skill-bar">
            <div class="skill-bar__fill" style="width: ${skill.score != null ? `${skill.score}%` : '0%'}"></div>
          </div>
          <small>${skill.count ? `${skill.count} resultado(s)` : 'Sem dados ainda'}</small>
        </div>
      `).join('')}
    </div>
  `;
};

const renderResults = () => {
  const resultsList = document.getElementById('results-list');
  if (resultsList) {
    resultsList.innerHTML = '';

    if (state.challenges.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'result-item';
      empty.textContent = 'Nenhum desafio registrado ainda.';
      resultsList.appendChild(empty);
    } else {
      state.challenges.slice().reverse().forEach((challenge, index) => {
        const item = document.createElement('div');
        item.className = 'result-item';
        const skillLabelMap = new Map(PILOT_SKILLS.map((skill) => [skill.key, skill.label]));
        const skillChips = Object.entries(challenge.skillScores || {})
          .map(([skill, score]) => `<span class="skill-chip">${skillLabelMap.get(skill) || skill}: ${Math.round(score)}</span>`)
          .join('');

        item.innerHTML = `
          <div class="result-item__header">
            <strong>#${state.challenges.length - index}</strong>
            <span>${challenge.title || challenge.challengeType}</span>
            <span class="result-score">${Math.round(challenge.score)}/100</span>
          </div>
          <p>${challenge.summary || 'Resultado sem descrição.'}</p>
          <div class="result-item__meta">
            <span>${challenge.challengeType}</span>
            <span>${challenge.completedAt ? new Date(challenge.completedAt).toLocaleString('pt-BR') : ''}</span>
          </div>
          <div class="result-skill-chips">${skillChips}</div>
        `;
        resultsList.appendChild(item);
      });
    }
  }

  renderPilotCard();
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const createSvgElement = (tagName) => document.createElementNS(SVG_NS, tagName);
const buildSeriesPoints = (series, totalDurationMs, plotWidth, plotHeight, padding) => series
  .map((entry) => {
    const x = padding + ((entry.elapsedMs / Math.max(1, totalDurationMs)) * plotWidth);
    const y = padding + (plotHeight - ((clamp(entry.value, 0, 100) / 100) * plotHeight));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  })
  .join(' ');
const buildBrakeSeries = (plan, totalDurationMs, stepMs = 100) => {
  const series = [];
  for (let elapsedMs = 0; elapsedMs <= totalDurationMs; elapsedMs += stepMs) {
    const frame = getFrameAt(plan, elapsedMs);
    series.push({
      elapsedMs,
      value: frame.targets.brake || 0,
    });
  }
  return series;
};
const buildActualBrakeSeries = (samples) => samples.map((sample) => ({
  elapsedMs: sample.elapsedMs,
  value: sample.values.brake,
}));
const renderBrakePrecisionVisualizer = (visualizer, challenge, definition) => {
  const frame = challenge?.currentFrame || challenge?.previewFrame || null;
  const config = challenge?.plan?.settings || getBrakePrecisionSettings();
  const phase = frame?.phase || challenge?.plan?.phases?.[0] || null;
  const completed = Boolean(challenge?.completed);
  const currentValue = completed
    ? Math.round(challenge?.samples?.[challenge.samples.length - 1]?.values?.brake ?? getSelectedRoleValueOrZero('brake'))
    : getSelectedRoleValueOrZero('brake');
  const targetValue = Math.round(frame?.targets?.brake?.[0] ?? frame?.targets?.brake ?? currentValue);
  const tolerance = config.tolerance;
  const stepIndex = challenge?.plan?.phases && frame?.phase
    ? Math.max(0, challenge.plan.phases.indexOf(frame.phase))
    : 0;
  const stepTotal = challenge?.plan?.phases?.length || config.steps || 3;
  const stepDurationMs = phase?.durationMs || config.delayMs || 3000;
  const activeStepElapsed = runtime.activeChallenge && frame
    ? Math.max(0, challenge.elapsedMs - (phase?.startMs || 0))
    : 0;
  const remainingMs = runtime.activeChallenge
    ? Math.max(0, stepDurationMs - activeStepElapsed)
    : stepDurationMs;
  const withinTolerance = Math.abs(currentValue - targetValue) <= tolerance;
  const finalScore = completed && challenge?.result?.score != null
    ? Math.round(challenge.result.score)
    : null;
  const timerText = runtime.activeChallenge
    ? formatCountdownSeconds(remainingMs)
    : completed
      ? 'Finalizado'
      : `${Math.round(stepDurationMs / 1000)}s total`;

  visualizer.innerHTML = `
    <div class="precision-panel precision-panel--brake${completed ? ' precision-panel--completed' : ''}">
      <div class="precision-panel__header">
        <div>
          <p class="section-eyebrow">${completed ? 'Resultado final' : `STEP ${stepIndex + 1} DE ${stepTotal}`}</p>
          <h3>${frame?.phase?.name || definition.title}</h3>
        </div>
        <div class="precision-panel__score">
          <span>Score</span>
          <strong>${runtime.activeChallenge?.liveScore != null
            ? `${Math.round(runtime.activeChallenge.liveScore)}%`
            : finalScore != null
              ? `${finalScore}%`
              : '--'}</strong>
        </div>
      </div>
      <div class="precision-panel__content">
        <div class="precision-meter">
          <div class="precision-meter__current">${currentValue}%</div>
          <div class="precision-meter__track">
            <div class="precision-meter__grid"></div>
            <div class="precision-meter__zone" style="bottom: ${clamp(targetValue - tolerance, 0, 100)}%; height: ${clamp(tolerance * 2, 4, 24)}%;"></div>
            <div class="precision-meter__fill" style="height: ${currentValue}%; opacity: ${runtime.activeChallenge ? 1 : 0.78};"></div>
            <div class="precision-meter__target" style="bottom: ${targetValue}%;"></div>
          </div>
          <div class="precision-meter__footer">ALVO: ${targetValue}% ±${tolerance}% • ${stepTotal} passos</div>
        </div>
          <div class="precision-ring">
          <span>TEMPO</span>
          <div class="precision-ring__circle" style="--progress: ${frame && runtime.activeChallenge ? clamp(1 - (remainingMs / Math.max(1, stepDurationMs)), 0, 1) : completed ? 1 : 0};">
            <strong>${timerText}</strong>
          </div>
          <small>${Math.round(stepDurationMs / 1000)}s total</small>
        </div>
      </div>
      <div class="precision-panel__status ${completed || (runtime.activeChallenge && withinTolerance) ? 'precision-panel__status--good' : ''}">
        ${runtime.activeChallenge
          ? (withinTolerance ? 'NA ZONA - MANTENHA!' : 'Ajuste fino da pressão')
          : completed
            ? 'RODADA FINALIZADA'
            : 'Aguardando início'}
      </div>
    </div>
  `;
};
const renderTrailBrakingVisualizer = (visualizer, challenge, definition) => {
  const currentFrame = challenge?.currentFrame || challenge?.previewFrame || null;
  const totalDurationMs = challenge?.plan?.totalDurationMs || 1;
  const width = 960;
  const height = 320;
  const padding = 28;
  const plotWidth = width - (padding * 2);
  const plotHeight = height - (padding * 2);
  const actualSeries = buildActualBrakeSeries(challenge?.samples || []);
  const idealSeries = challenge?.plan ? buildBrakeSeries(challenge.plan, totalDurationMs) : [];
  const actualPoints = buildSeriesPoints(actualSeries, totalDurationMs, plotWidth, plotHeight, padding);
  const idealPoints = buildSeriesPoints(idealSeries, totalDurationMs, plotWidth, plotHeight, padding);
  const cursorX = padding + (clamp((challenge?.elapsedMs || 0) / Math.max(1, totalDurationMs), 0, 1) * plotWidth);
  const gridLines = [0, 25, 50, 75, 100].map((value) => {
    const y = padding + (plotHeight - ((value / 100) * plotHeight));
    return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="trail-chart__grid-line" />`;
  }).join('');
  const tickLabels = Array.from({ length: Math.floor(totalDurationMs / 1000) + 1 }, (_, index) => {
    const x = padding + ((index / Math.max(1, totalDurationMs / 1000)) * plotWidth);
    return `<text x="${x}" y="${height - 8}" class="trail-chart__tick">${index}s</text>`;
  }).join('');
  const completed = Boolean(challenge?.completed);
  const score = runtime.activeChallenge?.liveScore != null
    ? Math.round(runtime.activeChallenge.liveScore)
    : completed && challenge.result?.score != null
      ? Math.round(challenge.result.score)
      : '--';

  visualizer.innerHTML = `
    <div class="trail-panel${completed ? ' trail-panel--completed' : ''}">
      <div class="trail-panel__header">
        <div>
          <p class="section-eyebrow">${completed ? 'Resultado final' : 'Trail Braking'}</p>
          <h3>${currentFrame?.phase?.name || definition.title}</h3>
        </div>
        <div class="trail-panel__score">
          <span>ACURÁCIA</span>
          <strong>${score}%</strong>
        </div>
      </div>
      <svg class="trail-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de trail braking">
        <rect x="0" y="0" width="${width}" height="${height}" class="trail-chart__background" />
        ${gridLines}
        ${tickLabels}
        ${completed ? '' : `<line x1="${cursorX}" y1="${padding}" x2="${cursorX}" y2="${height - padding}" class="trail-chart__cursor" />`}
        <polyline points="${idealPoints}" class="trail-chart__ideal" />
        <polyline points="${actualPoints}" class="trail-chart__actual" />
      </svg>
      <div class="trail-panel__legend">
        <span><i class="trail-panel__swatch trail-panel__swatch--ideal"></i>Linha ideal</span>
        <span><i class="trail-panel__swatch trail-panel__swatch--actual"></i>Pressão atual</span>
        <span><i class="trail-panel__swatch trail-panel__swatch--cursor"></i>Captura</span>
      </div>
    </div>
  `;
};
const renderSyncVisualizer = (visualizer, challenge, definition) => {
  const values = getRoleValueMap();
  const frame = challenge?.currentFrame || challenge?.previewFrame || null;
  const targets = frame?.targets || values;

  visualizer.innerHTML = '';
  visualizer.className = 'challenge-visualizer challenge-visualizer--sync';

  const chart = document.createElement('div');
  chart.className = 'axis-chart';

  getRoleKeys().forEach((role) => {
    const roleDef = ROLE_DEFS[role];
    const currentValue = clamp(values[role] || 0, 0, 100);
    const targetValue = clamp(targets[role] || 0, 0, 100);

    const row = document.createElement('div');
    row.className = `axis-chart__row axis-chart__row--${roleDef.colorClass}`;
    row.innerHTML = `
      <div class="axis-chart__label">
        <span>${roleDef.label}</span>
        <strong>${Math.round(currentValue)}%</strong>
      </div>
      <div class="axis-chart__track">
        <div class="axis-chart__target" style="left: ${targetValue}%"></div>
        <div class="axis-chart__current" style="width: ${currentValue}%"></div>
      </div>
      <div class="axis-chart__hint">
        <span>Target ${Math.round(targetValue)}%</span>
        <span>${role === 'throttle' ? 'Saída' : roleDef.shortLabel}</span>
      </div>
    `;
    chart.appendChild(row);
  });

  visualizer.appendChild(chart);

  if (challenge?.plan) {
    const timeline = document.createElement('div');
    timeline.className = 'challenge-timeline';
    challenge.plan.phases.forEach((phase) => {
      const phaseNode = document.createElement('div');
      phaseNode.className = `challenge-timeline__phase${frame?.phase === phase ? ' challenge-timeline__phase--active' : ''}`;
      phaseNode.style.flexGrow = String(phase.durationMs);
      phaseNode.title = `${phase.name} - ${phase.label || ''}`;
      phaseNode.textContent = phase.name;
      timeline.appendChild(phaseNode);
    });
    visualizer.appendChild(timeline);
  }
};
const drawVisualizer = () => {
  const visualizer = document.getElementById('visualizer');
  if (!visualizer) return;

  const definition = getCurrentChallengeDefinition();
  const presentationMode = getChallengeVisualizationMode(definition);
  const challenge = runtime.activeChallenge || runtime.pendingChallenge
    || (presentationMode === 'trail-graph' || presentationMode === 'brake-precision'
      ? runtime.lastCompletedChallenge
      : null);

  visualizer.innerHTML = '';
  visualizer.className = `challenge-visualizer challenge-visualizer--${presentationMode}`;

  if (presentationMode === 'brake-precision') {
    renderBrakePrecisionVisualizer(visualizer, challenge, definition);
    return;
  }

  if (presentationMode === 'trail-graph') {
    renderTrailBrakingVisualizer(visualizer, challenge, definition);
    return;
  }

  renderSyncVisualizer(visualizer, challenge, definition);
};

const stopActiveChallenge = () => {
  clearChallengeTimer();
};

const finalizeChallenge = () => {
  const challenge = runtime.activeChallenge;
  if (!challenge) return;

  stopActiveChallenge();

  const result = challenge.definition.evaluate(challenge.samples, challenge.plan);
  runtime.lastCompletedChallenge = {
    ...challenge,
    completed: true,
    elapsedMs: challenge.plan.totalDurationMs,
    currentFrame: getFrameAt(challenge.plan, challenge.plan.totalDurationMs),
    result,
  };
  state.challenges.push({
    ...result,
    title: challenge.definition.title,
    duration: Math.round(challenge.plan.totalDurationMs / 1000),
    settings: challenge.definition.settings || [],
  });
  updateConfig();
  runtime.activeChallenge = null;
  renderResults();
  renderChallengePage();
};

const runChallengeTick = () => {
  if (runtime.pendingChallenge) {
    const remainingMs = runtime.pendingChallenge.countdownEndsAt - Date.now();
    if (remainingMs > 0) {
      renderChallengePage();
      refreshLiveReadouts();
      return;
    }

    const pendingChallenge = runtime.pendingChallenge;
    startActiveChallenge(pendingChallenge);
    return;
  }

  const challenge = runtime.activeChallenge;
  if (!challenge) return;

  const now = Date.now();
  challenge.elapsedMs = now - challenge.startedAt;
  if (challenge.elapsedMs > challenge.plan.totalDurationMs) {
    challenge.elapsedMs = challenge.plan.totalDurationMs;
  }

  const currentFrame = getFrameAt(challenge.plan, challenge.elapsedMs);
  challenge.currentFrame = currentFrame;
  const sample = {
    elapsedMs: challenge.elapsedMs,
    phase: currentFrame.phase.name,
    values: getRoleValueMap(),
    targets: currentFrame.targets,
  };
  challenge.samples.push(sample);
  const recentScore = challenge.definition.evaluate(challenge.samples, challenge.plan).score;
  challenge.liveScore = recentScore;

  renderChallengePage();

  if (challenge.elapsedMs >= challenge.plan.totalDurationMs) {
    finalizeChallenge();
  }
};

const startSelectedChallenge = () => {
  const definition = getChallengeDefinition(state.ui.selectedChallengeType);
  const missingRoles = getMissingRolesForChallenge(definition.id);

  if (!navigator.hid) {
    const statusNode = document.getElementById('status-text');
    if (statusNode) {
      statusNode.textContent = 'WebHID não disponível. Use Chrome ou Edge.';
    }
    return;
  }

  if (missingRoles.length) {
    const statusNode = document.getElementById('status-text');
    if (statusNode) {
      statusNode.textContent = `Falta configurar: ${missingRoles.map((role) => ROLE_DEFS[role].label.toLowerCase()).join(', ')}.`;
    }
    return;
  }

  stopActiveChallenge();
  runtime.activeChallenge = null;
  runtime.pendingChallenge = null;
  runtime.lastCompletedChallenge = null;
  const plan = definition.buildPlan();
  runtime.pendingChallenge = {
    definition,
    plan,
    previewFrame: getFrameAt(plan, 0),
    countdownEndsAt: Date.now() + 3000,
  };
  renderChallengePage();
  refreshLiveReadouts();
  runtime.timerId = setInterval(runChallengeTick, 100);
  runChallengeTick();
};

const bindChallengeControls = () => {
  const startButton = document.getElementById('start-challenge');
  if (startButton) {
    startButton.addEventListener('click', startSelectedChallenge);
  }
};

const updateStateFromSelectionInputs = () => {
  getRoleKeys().forEach((role) => {
    const deviceSelect = document.getElementById(ROLE_DEFS[role].deviceSelectId);
    if (deviceSelect) {
      const selection = getRoleSelection(role);
      deviceSelect.value = selection.deviceId || '';
    }
  });
};

const PILOT_SKILLS = [
  { key: 'brakePrecision', label: 'Precisão de frenagem' },
  { key: 'brakeModulation', label: 'Modulação de brake' },
  { key: 'trailBraking', label: 'Trail braking' },
  { key: 'steeringPrecision', label: 'Precisão de steering' },
  { key: 'steeringSmoothness', label: 'Suavidade do steering' },
  { key: 'throttleControl', label: 'Controle de throttle' },
  { key: 'exitDrive', label: 'Saída de curva' },
  { key: 'coordination', label: 'Coordenação dos inputs' },
  { key: 'consistency', label: 'Consistência' },
];

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
    refreshLiveReadouts();
  }

  if (page === 'settings') {
    bindSettings();
    renderSelectedDeviceSummary();
    refreshLiveReadouts();
  }

  if (page === 'results') {
    renderResults();
  }

  if (page === 'challenge') {
    bindChallengeControls();
    renderChallengeSelector();
    renderChallengePage();
  }

  updateVersionLabels();
  updateStateFromSelectionInputs();
};

window.addEventListener('DOMContentLoaded', initPage);

const EVENT_NAMES = new Set([
  'inspection_started',
  'inspection_succeeded',
  'stage_started',
  'stage_succeeded',
  'error',
  'completed',
]);

const STAGES = new Set(['inspection', 'generation', 'copy', 'translation', 'runtime_patch', 'sign', 'verify', 'completed']);

export function redactSensitiveText(text) {
  if (text === null || text === undefined) return text;
  const source = String(text);
  return source
    .replace(/(apiKey|token|authorization)\s*[:=]?\s*(Bearer\s+)?[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
}

function redactValue(value) {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}

export function createGeneratorEvent({ event, stage = null, message = '', value = null }) {
  if (!EVENT_NAMES.has(event)) throw new TypeError(`Unknown generator event: ${String(event)}`);
  if (stage !== null && !STAGES.has(stage)) throw new TypeError(`Unknown generator stage: ${String(stage)}`);
  if (typeof message !== 'string') throw new TypeError('Generator event message must be a string.');
  return {
    event,
    stage,
    message: redactSensitiveText(message),
    value: redactValue(value),
  };
}

export function serializeGeneratorEvent(event) {
  return JSON.stringify(createGeneratorEvent(event));
}

export const inspectionStarted = (value = null) => createGeneratorEvent({
  event: 'inspection_started', stage: 'inspection', message: 'Inspecting the official Claude app.', value,
});

export const inspectionSucceeded = (value = null) => createGeneratorEvent({
  event: 'inspection_succeeded', stage: 'inspection', message: 'Official app inspection succeeded.', value,
});

export const stageStarted = (stage, value = null) => createGeneratorEvent({
  event: 'stage_started', stage, message: `${stage} started.`, value,
});

export const stageSucceeded = (stage, value = null) => createGeneratorEvent({
  event: 'stage_succeeded', stage, message: `${stage} completed.`, value,
});

export const errorEvent = (stage, message, value = null) => createGeneratorEvent({
  event: 'error', stage, message, value,
});

export const completed = (value = null) => createGeneratorEvent({
  event: 'completed', stage: 'completed', message: 'Generation completed.', value,
});

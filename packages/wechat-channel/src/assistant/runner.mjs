// One runner per database. The host owns lifecycle and must await stop before recovery.
export function startRunner(assistant, { intervalMs = 1000, onError = () => {} } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs < 10) throw new Error('invalid interval');
  let stopped = false, timer, active;
  const run = () => {
    active = assistant.tick().catch(onError).finally(() => {
      if (!stopped) timer = setTimeout(run, intervalMs);
    });
  };
  run();
  return async () => { stopped = true; clearTimeout(timer); await active; };
}

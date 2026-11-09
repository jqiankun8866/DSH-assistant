/** Join the host's native preset before a WeChat turn can use file/office/web tools. */
export async function ensureNativeCapabilities(ctx, agent, {unpublished=false}={}) {
  const presets = ctx.get('agentPresets');
  if (!presets) return; // Standalone test hosts can provide tools globally.
  const composed=presets.composedPreset(ctx);
  // Rebinding is allowed only in the factory setup callback, before publication.
  if (composed && (!unpublished || composed!=='standard')) return;
  const projection = ctx.get('sessionProjections');
  const recorded = projection?.stateOf(agent.session, 'agentPreset');
  const target=!recorded||recorded==='standard'?'wechat-assistant':recorded;
  const selected = await presets.mount(ctx, target);
  // Old WeChat sessions predate preset composition. Record the repair so host
  // resume/scheduled deliveries can reconstruct the same native capabilities.
  if (recorded!==selected.id) agent.session.append('agent-preset/selected', { agentPreset: selected.id });
}

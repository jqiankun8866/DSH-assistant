// Register the existing session through the host registry, never copy history.
export async function publishWechatSession(ctx, agent, cwd) {
  const registry = ctx.get('workspaceRegistry');
  if (!registry) return;
  const workspace = await registry.create(cwd, '大肥鱼·微信');
  await workspace.attachSession(agent.id);
  const title = ctx.get('sessionTitle');
  if (title) await title.rename(agent.session, '大肥鱼·微信');
  await registry.pinSession(agent.id);
}

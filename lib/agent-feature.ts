/**
 * Single switch for the Beeblio AI rollout. While false, the chat panel is
 * unreachable and nothing agent-side is provisioned: no Blaxel sandbox is
 * created (the pre-warm triggers are dead), so signups cost nothing until the
 * feature ships. Set NEXT_PUBLIC_AGENT_FEATURE_ENABLED=true (e.g. on a preview
 * deployment) to restore the real handlers; when the rollout completes, retire
 * the upcoming-feature scaffolding per its header comment and hardcode true.
 */
export const AGENT_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_AGENT_FEATURE_ENABLED === "true";

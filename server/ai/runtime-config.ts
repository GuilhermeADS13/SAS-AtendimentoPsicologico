export function isAiAgentEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_AGENT_ENABLED !== "false";
}

export function isAiRagEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_RAG_ENABLED !== "false";
}

export function areClinicalToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_CLINICAL_TOOLS_ENABLED !== "false";
}

export function aiMaintenanceMessage(): string {
  return "A Luma está temporariamente em modo de manutenção. A equipe responsável deve ser acionada para orientações clínicas.";
}

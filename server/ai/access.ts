export type AiAccessContext = {
  userId: number;
  role: "user" | "patient" | "therapist" | "admin";
  therapistId?: number | null;
  patientId?: number | null;
};

export type AiScopedRecord = {
  userId: number;
  therapistId?: number | null;
  patientId?: number | null;
};

/**
 * Valida o escopo declarado antes de persistir uma conversa ou memória.
 * O agente não pode criar uma memória clínica sem um identificador clínico.
 */
export function assertAiScope(
  scope: "user" | "therapist" | "patient",
  record: AiScopedRecord,
): void {
  if (scope === "user" && (record.therapistId != null || record.patientId != null)) {
    throw new Error("Escopo de usuário não pode conter vínculo clínico");
  }
  if (scope === "therapist" && record.therapistId == null) {
    throw new Error("Escopo de terapeuta exige therapistId");
  }
  if (scope === "patient" && record.patientId == null) {
    throw new Error("Escopo de paciente exige patientId");
  }
}

/**
 * Deve ser usado em conjunto com a consulta SQL escopada. Nunca substitui o
 * filtro no banco; serve como uma segunda barreira antes de expor o registro.
 */
export function canAccessAiRecord(ctx: AiAccessContext, record: AiScopedRecord): boolean {
  if (record.userId === ctx.userId) return true;
  if (ctx.role === "admin") return false;
  if (ctx.role === "therapist" && ctx.therapistId != null) {
    return record.therapistId === ctx.therapistId;
  }
  if (ctx.role === "patient" && ctx.patientId != null) {
    return record.patientId === ctx.patientId;
  }
  return false;
}

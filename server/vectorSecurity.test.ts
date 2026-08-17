import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildVectorSearchScope } from "./ai/document-ingestion";

describe("segurança dos filtros vetoriais", () => {
  it("inclui therapistId e patientId simultaneamente para terapeuta", () => {
    const scope = buildVectorSearchScope({ userId: 10, role: "therapist", therapistId: 7, patientId: null }, 42);
    const query = new PgDialect().sqlToQuery(scope);
    expect(query.sql).toContain('"therapistId" = $1');
    expect(query.sql).toContain('"patientId" = $2');
    expect(query.params).toEqual([7, 42]);
  });

  it("não permite terapeuta pesquisar sem patientId", () => {
    expect(() => buildVectorSearchScope({ userId: 10, role: "therapist", therapistId: 7, patientId: null }, undefined))
      .toThrow("patientId válidos");
  });

  it("não permite paciente consultar outro paciente", () => {
    expect(() => buildVectorSearchScope({ userId: 10, role: "patient", therapistId: 7, patientId: 42 }, 99))
      .toThrow("Paciente não autorizado");
  });

  it("não permite administrador acessar prontuários pelo agente", () => {
    expect(() => buildVectorSearchScope({ userId: 1, role: "admin", therapistId: null, patientId: null }, 42))
      .toThrow("Administrador");
  });
});

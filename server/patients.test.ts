import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "therapist",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("patients router", () => {
  it("should list patients for authenticated therapist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will return empty list since we don't have a database in tests
    // In a real scenario, you would mock the database
    const result = await caller.patients.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("patients.get returns null when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.patients.get({ id: 1 });
    expect(result).toBeNull();
  });

  it("patients.update rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.patients.update({ id: 1, firstName: "Novo" })).rejects.toThrow(
      "Database not available",
    );
  });
});

describe("sessions router", () => {
  it("sessions.getByPatient returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.sessions.getByPatient({ patientId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("therapists router", () => {
  it("therapists.me returns null when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.therapists.me();
    expect(result).toBeNull();
  });

  it("therapists.upsert rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.therapists.upsert({ crp: "06/123456" })).rejects.toThrow(
      "Database not available",
    );
  });
});

describe("appointments router", () => {
  it("appointments.list returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.appointments.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("appointments.updateStatus rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.appointments.updateStatus({ id: 1, status: "completed" }),
    ).rejects.toThrow("Database not available");
  });
});

describe("documents router", () => {
  it("documents.getByPatient returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.documents.getByPatient({ patientId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

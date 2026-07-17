import { z } from "zod";
import { publicProcedure, router } from "./trpc";

/**
 * Só o health-check. O `notifyOwner` foi removido: dependia do Forge API do
 * Manus (nunca configurado aqui) e nenhum cliente o chamava. As notificações do
 * app saem por e-mail (server/notifications.ts).
 */
export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
});

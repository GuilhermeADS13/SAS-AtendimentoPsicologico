import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

/** Tipos de saída das rotas, para reutilizar sem redeclarar shapes. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

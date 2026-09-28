import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getAccessToken } from "./lib/supabase";
import "./index.css";

// Limpeza de dado legado: a chave "manus-runtime-user-info" guardava o usuário
// inteiro (id, nome, e-mail) no localStorage para o runtime de edição do Manus, que
// não vai mais no build. Ninguém no app lia, e o useAuth parou de escrevê-la — mas
// quem já abriu o site continua com o dado gravado no navegador. Fica aqui, e não no
// useAuth, porque precisa rodar em QUALQUER rota: /login não monta o useAuth.
try {
  localStorage.removeItem("manus-runtime-user-info");
} catch {}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // Vai para a tela de login (Supabase Auth) — sem loop se já estiver nela.
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        // Supabase Auth: envia o access token (JWT) como Bearer. O backend o
        // valida via JWKS e mapeia para a tabela users.
        const sbToken = await getAccessToken();
        if (sbToken) {
          return { Authorization: `Bearer ${sbToken}` };
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

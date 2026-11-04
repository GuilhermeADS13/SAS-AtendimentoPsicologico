import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LINK_CADASTRO_PSICOLOGA, cadastroPedidoNaUrl, origemDaUrl } from "../shared/entradaNoSite";

const raiz = path.resolve(__dirname, "..");
const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), "utf8");

describe("cadastro pedido na URL de /login", () => {
  it("o botão de teste grátis abre 'Criar conta' com psicóloga marcada", () => {
    const busca = LINK_CADASTRO_PSICOLOGA.slice(LINK_CADASTRO_PSICOLOGA.indexOf("?"));
    expect(cadastroPedidoNaUrl(busca)).toEqual({ aba: "signup", psicologa: true });
  });

  it("sem ?criar, /login continua abrindo em 'Entrar'", () => {
    expect(cadastroPedidoNaUrl("")).toEqual({ aba: "login", psicologa: false });
    expect(cadastroPedidoNaUrl("?confirmado=1")).toEqual({ aba: "login", psicologa: false });
    expect(cadastroPedidoNaUrl("?criar=qualquer")).toEqual({ aba: "login", psicologa: false });
  });

  it("?criar=paciente abre o cadastro sem marcar psicóloga", () => {
    expect(cadastroPedidoNaUrl("?criar=paciente")).toEqual({ aba: "signup", psicologa: false });
  });

  it("os botões de teste grátis da home e de preços usam o link do cadastro de psicóloga", () => {
    expect(ler("client/src/pages/Precos.tsx")).toContain("href={LINK_CADASTRO_PSICOLOGA}");
    // Topo ("Testar grátis"), "Começar agora" e "Acessar plataforma".
    expect(ler("client/src/pages/Home.tsx").match(/setLocation\(LINK_CADASTRO_PSICOLOGA\)/g)?.length).toBe(3);
  });
});

describe("origem do cadastro", () => {
  it("aceita só um rótulo curto, sem texto livre", () => {
    expect(origemDaUrl("?origem=instagram")).toBe("instagram");
    expect(origemDaUrl("?origem=TikTok")).toBe("tiktok");
    expect(origemDaUrl("?origem=yt_shorts-1")).toBe("yt_shorts-1");
    expect(origemDaUrl("?origem=")).toBeNull();
    expect(origemDaUrl("?origem=a")).toBeNull();
    expect(origemDaUrl("?origem=nome%20da%20pessoa")).toBeNull();
    expect(origemDaUrl("?origem=<script>")).toBeNull();
    expect(origemDaUrl("?origem=" + "x".repeat(31))).toBeNull();
    expect(origemDaUrl("")).toBeNull();
  });

  it("o cadastro no servidor valida a origem e grava nos dados da conta", () => {
    const rotas = ler("server/routers.ts");
    expect(rotas).toContain("origem: z.string().regex(ORIGEM_REGEX).optional()");
    expect(rotas).toContain("if (input.origem) dados.origem = input.origem;");
  });
});

describe("psicóloga aguardando o CRP", () => {
  it("'Minhas consultas' avisa que o acesso está em análise", () => {
    const tela = ler("client/src/pages/MyAppointments.tsx");
    expect(tela).toContain('pedidoProfissional?.status === "pending"');
    expect(tela).toContain("Seu acesso de psicóloga está em análise");
    // O cartão de paciente "complete seu cadastro" fica escondido para ela.
    expect(tela).toContain('!profile && pedidoProfissional?.status !== "pending"');
  });
});

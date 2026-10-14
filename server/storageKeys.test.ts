import { describe, expect, it } from "vitest";
import { chavePertenceAoUsuario, fotoPertenceAoUsuario, uidSupabase } from "./storageKeys";

/**
 * O servidor baixa e assina arquivos do bucket com a service role, que fura a RLS.
 * Por isso todo fileKey vindo do cliente tem de estar na pasta de quem o enviou.
 */
describe("posse de arquivo no bucket (fileKey)", () => {
  const dono = "sb:11111111-2222-3333-4444-555555555555";
  const uid = "11111111-2222-3333-4444-555555555555";

  it("extrai o uid só de contas do Supabase", () => {
    expect(uidSupabase(dono)).toBe(uid);
    expect(uidSupabase("dev:local")).toBeNull();
    expect(uidSupabase(null)).toBeNull();
    expect(uidSupabase("sb:")).toBeNull();
  });

  it.each([
    [`${uid}/chat/1700000000000_foto.png`, "chat"],
    [`${uid}/42/1700000000000_laudo.pdf`, "42"],
    [`${uid}/modelo/1700000000000_modelo.docx`, "modelo"],
    // ".." DENTRO do nome é legítimo (o upload só troca caracteres fora de [\w.-])
    [`${uid}/chat/1700000000000_laudo..final.pdf`, "chat"],
  ])("aceita o arquivo do próprio usuário: %s", (fileKey, pasta) => {
    expect(chavePertenceAoUsuario(fileKey, dono, pasta)).toBe(true);
  });

  it.each([
    ["arquivo de OUTRA pessoa", "99999999-0000-0000-0000-000000000000/chat/1700_x.pdf", "chat"],
    ["pasta errada (documento do prontuário usado no chat)", `${uid}/42/1700_laudo.pdf`, "chat"],
    ["paciente errado no prontuário", `${uid}/43/1700_laudo.pdf`, "42"],
    ["subida de pasta", `${uid}/chat/../../outro/chat/x.pdf`, "chat"],
    ["segmento ..", `${uid}/chat/..`, "chat"],
    ["barra dupla", `${uid}/chat//x.pdf`, "chat"],
    ["barra no início", `/${uid}/chat/x.pdf`, "chat"],
    ["barra invertida", `${uid}/chat/..\\x.pdf`, "chat"],
    ["subpasta extra", `${uid}/chat/sub/x.pdf`, "chat"],
    ["só o prefixo", `${uid}/chat/`, "chat"],
    ["vazio", "", "chat"],
  ])("recusa %s", (_motivo, fileKey, pasta) => {
    expect(chavePertenceAoUsuario(fileKey, dono, pasta)).toBe(false);
  });

  it("recusa quando o dono não é conta do Supabase", () => {
    expect(chavePertenceAoUsuario(`${uid}/chat/x.pdf`, "dev:local", "chat")).toBe(false);
  });
});

/**
 * Foto do paciente nos cards da psicóloga: o servidor assina com a service role,
 * então só aceita o caminho que o upload gera, na pasta da conta do PRÓPRIO
 * paciente (senão ele poderia apontar a foto para a de outra pessoa).
 */
describe("foto da conta (avatars)", () => {
  const openId = "sb:11111111-2222-3333-4444-555555555555";
  const uid = "11111111-2222-3333-4444-555555555555";

  it("aceita o caminho que o upload gera", () => {
    for (const ext of ["jpg", "png", "webp"]) expect(fotoPertenceAoUsuario(`${uid}/avatar.${ext}`, openId)).toBe(true);
  });

  it("recusa foto de outra conta, caminho estranho ou extensão fora", () => {
    expect(fotoPertenceAoUsuario("99999999-0000-0000-0000-000000000000/avatar.jpg", openId)).toBe(false);
    expect(fotoPertenceAoUsuario(`${uid}/../outro/avatar.jpg`, openId)).toBe(false);
    expect(fotoPertenceAoUsuario(`${uid}/avatar.svg`, openId)).toBe(false);
    expect(fotoPertenceAoUsuario(`${uid}/chat/x.jpg`, openId)).toBe(false);
    expect(fotoPertenceAoUsuario(null, openId)).toBe(false);
    expect(fotoPertenceAoUsuario(`${uid}/avatar.jpg`, "manus:abc")).toBe(false);
  });
});

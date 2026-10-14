/**
 * O "papel timbrado" de todos os e-mails do VozInterior: logo, cores da marca,
 * saudação com o nome da pessoa, um botão de ação e o rodapé.
 *
 * Feito com TABELA e estilo INLINE de propósito: Gmail e Outlook ignoram <style>,
 * flexbox e variáveis CSS. A logo é PNG (o Gmail não mostra SVG) e vem do próprio
 * site, por URL absoluta.
 */

const MARCA = "#215756"; // o verde da logo (index.css, --brand)
const FUNDO = "#f6f3ee";
const TEXTO = "#2b3a3c";
const SUAVE = "#6b7a7c";
const BORDA = "#e6e0d8";

/** Escapa texto vindo do banco (nome digitado por gente) antes de ir para o HTML. */
export function esc(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "Ana Souza" → "Ana". Vazio fica vazio (a saudação vira só "Olá!"). */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

export type EmailComMarca = {
  /** Quem recebe; sem nome, a saudação é só "Olá!". */
  nome?: string | null;
  /** Título grande do e-mail (texto puro — é escapado aqui). */
  titulo: string;
  /** Corpo em HTML. Quem chama já escapou os dados que vêm do banco. */
  corpo: string;
  botao?: { texto: string; url: string };
  /** Linha pequena depois do botão (ex.: "o link vale por 1 hora"). */
  observacao?: string;
  /** Endereço público do site, para a logo e o link do rodapé. */
  base: string;
};

export function emailComMarca({ nome, titulo, corpo, botao, observacao, base }: EmailComMarca): string {
  const saudacao = primeiroNome(nome) ? `Olá, ${esc(primeiroNome(nome))}!` : "Olá!";
  const botaoHtml = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px">
        <tr><td style="border-radius:10px;background:${MARCA}">
          <a href="${botao.url}" style="display:inline-block;padding:13px 26px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px">${esc(botao.texto)}</a>
        </td></tr>
      </table>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${FUNDO}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${FUNDO};padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 4px 18px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle"><img src="${base}/vozinterior-mark.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px"></td>
            <td style="vertical-align:middle;padding-left:10px;font-family:Arial,Helvetica,sans-serif;font-size:19px;font-weight:700;color:${MARCA}">VozInterior</td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid ${BORDA};border-radius:16px;padding:30px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEXTO}">
          <p style="margin:0 0 6px;font-size:14px;color:${SUAVE}">${saudacao}</p>
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${TEXTO}">${esc(titulo)}</h1>
          ${corpo}
          ${botaoHtml}
          ${observacao ? `<p style="margin:12px 0 0;font-size:13px;color:${SUAVE}">${observacao}</p>` : ""}
        </td></tr>
        <tr><td style="padding:18px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${SUAVE};text-align:center">
          Enviado pelo <a href="${base}" style="color:${MARCA};text-decoration:none;font-weight:600">VozInterior</a> — atendimento psicológico online.<br>
          Este é um e-mail automático; para falar com a sua psicóloga, use as Mensagens no sistema.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Bloco de detalhes (Paciente / Quando / Duração) no estilo do e-mail. */
export function detalhesDoEmail(linhas: Array<[rotulo: string, valorHtml: string | null | undefined]>): string {
  const visiveis = linhas.filter(([, v]) => !!v);
  if (!visiveis.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;background:${FUNDO};border-radius:12px">
    ${visiveis
      .map(
        ([rotulo, valor]) => `<tr>
      <td style="padding:10px 14px;font-size:13px;color:${SUAVE};width:96px;vertical-align:top">${esc(rotulo)}</td>
      <td style="padding:10px 14px;font-size:14px;color:${TEXTO};font-weight:600">${valor}</td>
    </tr>`,
      )
      .join("")}
  </table>`;
}

import { buildApoioResponse, buildCrisisSafeResponse, classifyClinicalSafetyIntent, detectaSofrimento } from "./clinical-safety";

export type SiteHelpTopic =
  | "crisis"
  | "support"
  | "boundary"
  | "appointments"
  | "reschedule"
  | "payments"
  | "profile"
  | "therapist"
  | "video"
  | "mensagens"
  | "luma"
  | "privacy"
  | "general";

export type SiteHelpResponse = {
  content: string;
  model: "site-help-local";
  topic: SiteHelpTopic;
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function answerSiteHelp(question: string): SiteHelpResponse {
  // SEGURANÇA primeiro: mesmo sendo a Luma de navegação (sem LLM), o paciente é
  // quem mais provavelmente desabafa aqui. Uma fala de crise NÃO pode cair no
  // matcher de palavra-chave — responde com acolhimento e CVV/SAMU. Diagnóstico e
  // medicação também são barrados (não é o papel da Luma).
  const intent = classifyClinicalSafetyIntent(question);
  if (intent === "crisis") {
    return { model: "site-help-local", topic: "crisis", content: buildCrisisSafeResponse() };
  }
  if (intent === "diagnosis_request") {
    return {
      model: "site-help-local",
      topic: "boundary",
      content:
        "Eu não faço diagnóstico — quem avalia isso é a sua psicóloga. Posso te ajudar a encontrar as áreas do site: Minhas Consultas, Configurações da conta ou a sala de videochamada.",
    };
  }
  if (intent === "prescription_request") {
    return {
      model: "site-help-local",
      topic: "boundary",
      content:
        "Eu não indico nem ajusto medicação — isso é com um(a) profissional. Posso te ajudar a navegar no sistema (consultas, cadastro, videochamada).",
    };
  }

  // Sofrimento sem sinal explícito de risco ("estou muito mal", "não aguento
  // mais"): antes caía no menu genérico do site. Vem antes do roteamento por
  // palavra-chave porque "estou mal, como falo com a psicóloga?" tem de ser
  // acolhido primeiro — e a resposta já aponta Mensagens.
  if (detectaSofrimento(question)) {
    return { model: "site-help-local", topic: "support", content: buildApoioResponse() };
  }

  const normalized = normalize(question);

  if (/(remarcar|desmarcar|cancelar|mudar de horario|trocar de horario|adiar)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "reschedule",
      content:
        "Para remarcar ou cancelar uma consulta, fale com a sua psicóloga — é ela quem ajusta a agenda. Você acompanha tudo em “Minhas Consultas”.",
    };
  }

  // "pago"/"paguei"/"custa" ficavam de fora ("pagar" não casa com "pago"), então
  // pergunta de preço caía no tópico de agenda. O `paga\b` evita casar com "página".
  if (/(pagamento|pagar|pago|paguei|paga\b|cobranca|valor|preco|custa|custo|boleto|pix|nota fiscal|honorario|mensalidade)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "payments",
      content:
        "Os valores e a forma de pagamento são combinados diretamente com a sua psicóloga. Suas consultas ficam em “Minhas Consultas”.",
    };
  }

  // ATENÇÃO À ORDEM: daqui até o fim, os tópicos ESPECÍFICOS vêm antes do tópico
  // genérico de agenda, que casa com "consulta|psicolog|sessao" e engolia todos eles
  // (era por isso que "onde fica minha psicóloga?" e "como entro na consulta?"
  // respondiam sobre horários).

  if (/(minha psicolog|meu psicolog|minha terapeuta|meu terapeuta|perfil (?:da|do) (?:psicolog|terapeuta)|quem (?:e|é) (?:a |o )?(?:minha |meu )?(?:psicolog|terapeuta)|sobre (?:a|o) (?:minha |meu )?(?:psicolog|terapeuta)|contato (?:da|do) (?:psicolog|terapeuta)|\bcrp\b)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "therapist",
      content:
        "Para ver quem é a sua psicóloga, o registro no CRP e os dados de contato, abra “Minha Psicóloga” no menu.",
    };
  }

  if (/(video|sala|chamada|entr(?:ar|o|a)\s+na\s+(?:consulta|sala|sessao|chamada)|acessar a consulta|camera|microfone|compartilhar)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "video",
      content:
        "Para entrar em uma consulta, abra “Minhas Consultas” e use o botão da consulta agendada no horário combinado. Dá para testar câmera e microfone antes de entrar; o acesso é liberado só para participantes autorizados.",
    };
  }

  if (/(mensagem|mensagens|chat|conversar por texto|falar por escrito|mandar recado|trocar arquivo|enviar arquivo)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "mensagens",
      content:
        "Para trocar mensagens por texto com o seu profissional (e enviar arquivos), abra “Mensagens” no menu. O mesmo chat também aparece dentro da videochamada, no botão “Mensagens”.",
    };
  }

  if (/(luma|assistente|coruja)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "luma",
      content:
        "Você está conversando com o modo de apoio do site da Luma. Ele ajuda a encontrar funções e entender a navegação, mas não consulta prontuários nem substitui a sua psicóloga.",
    };
  }

  // Privacidade vem ANTES do cadastro: "meus dados estão seguros?" é pergunta de
  // sigilo e respondia "altere seus dados e salve". Note que "dados" sozinho NÃO
  // está aqui de propósito — é ambíguo, e "como mudo meus dados" tem que continuar
  // caindo em cadastro; o que traz para cá é a moldura de sigilo/segurança.
  if (/(privacidade|lgpd|sigilo|confidencial|segur(?:o|a|os|as|anca)|prontuario|quem (?:ve|pode ver|acessa)|compartilham|vendem)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "privacy",
      content:
        "As áreas do sistema são protegidas pelo seu perfil. O modo de apoio ao site não acessa prontuários, sessões ou documentos clínicos. Veja a Política de Privacidade em “Privacidade”.",
    };
  }

  if (/(cadastro|perfil|telefone|endereco|email|e-mail|senha|foto|meus dados)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "profile",
      content:
        "Para atualizar seus dados (nome, telefone, endereço) ou trocar a senha, abra “Configurações da conta” no menu: altere o que precisar e salve. A troca de e-mail tem um passo a mais, por segurança — enviamos um código de verificação para o seu e-mail, e a mudança só vale depois que você digitar esse código.",
    };
  }

  if (/(consulta|agendamento|horario|marcar|psicolog|sessao|atendimento)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "appointments",
      content:
        "Para consultar ou acompanhar seus horários, abra “Minhas Consultas” no menu. Quando a psicóloga criar um agendamento, ele aparece nessa área.",
    };
  }

  return {
    model: "site-help-local",
    topic: "general",
    content:
      "Posso te ajudar a encontrar: Minhas Consultas, Mensagens, Configurações da conta, Minha Psicóloga ou a sala de videochamada. Me diga qual área você quer abrir.",
  };
}

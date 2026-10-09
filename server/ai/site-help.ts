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

/** Linha curta de acolhimento quando a pessoa está sofrendo MAS também pediu algo. */
const ACOLHIMENTO_BREVE =
  "Sinto muito que esteja difícil agora. Se quiser falar com a sua psicóloga, é só abrir “Mensagens” no menu — e, se apertar, o CVV atende 24h no 188.";

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

  const roteada = rotearPorPalavraChave(normalize(question));

  // Sofrimento sem sinal explícito de risco ("estou muito mal", "não aguento
  // mais"): sozinho, cairia no menu genérico do site.
  //
  // Mas acolher não pode ENGOLIR o pedido. Esta checagem vinha ANTES do
  // roteamento, e aí "estou angustiado com o valor, quanto custa a consulta?"
  // recebia o acolhimento no lugar do preço — o espelho do bug que ela veio
  // corrigir. Agora o acolhimento só SUBSTITUI a resposta quando não há tópico
  // nenhum; havendo, a pessoa recebe as duas coisas, com o acolhimento primeiro.
  if (detectaSofrimento(question)) {
    if (roteada.topic === "general") {
      return { model: "site-help-local", topic: "support", content: buildApoioResponse() };
    }
    return { ...roteada, content: `${ACOLHIMENTO_BREVE}\n\n${roteada.content}` };
  }

  return roteada;
}

/** Roteamento por palavra-chave. A ORDEM importa: específicos antes do genérico. */
function rotearPorPalavraChave(normalized: string): SiteHelpResponse {
  if (/(remarcar|desmarcar|cancelar|mudar de horario|trocar de horario|adiar)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "reschedule",
      content:
        "Para remarcar ou cancelar uma consulta, fale com a sua psicóloga — é ela quem ajusta a agenda. O caminho mais rápido é “Mensagens”, no menu. Você acompanha tudo em “Minhas Consultas”.",
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

  // "compartilhar" sozinho puxava "compartilhar um arquivo" para cá; só tela.
  if (/(video|sala|chamada|entr(?:ar|o|a)\s+na\s+(?:consulta|sala|sessao|chamada)|acessar a consulta|camera|microfone|compartilhar (?:a |minha )?tela)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "video",
      content:
        "Para entrar na consulta, abra “Minhas Consultas” e toque em “Entrar na sala” — o botão fica disponível a partir de 15 minutos antes do horário. Antes de entrar aparece uma tela para conferir câmera e microfone. Dentro da chamada, o botão “Mensagens” abre o chat com a sua psicóloga. O acesso é só para quem participa da consulta.",
    };
  }

  // `arquivo|anexo` soltos: "como envio um arquivo?" não casava com "enviar
  // arquivo" e caía no menu genérico.
  if (/(mensagem|mensagens|chat|conversar por texto|falar por escrito|mandar recado|arquivo|anexo|anexar|foto para ela)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "mensagens",
      content:
        "Para trocar mensagens com a sua psicóloga e enviar arquivos, abra “Mensagens” no menu. Os dois tiques (✓✓) ao lado da sua mensagem mostram que ela já leu, e a lupa busca no histórico da conversa. É o mesmo chat que abre dentro da videochamada, no botão “Mensagens”.",
    };
  }

  // "quem é você?" é a pergunta mais natural para quem abre o chat pela primeira
  // vez, e caía no menu genérico.
  if (/(luma|assistente|coruja|quem (?:e|eh) (?:voce|vc)|com quem (?:eu )?(?:estou|to) falando|(?:voce|vc) (?:e|eh) (?:um|uma) (?:rob|ia|bot)|\bchatbot\b)/.test(normalized)) {
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

  if (/(consulta|agendamento|horario|marcar|psicolog|sessao|atendimento|presenca|confirmar|agenda|calendario)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "appointments",
      content:
        "Suas consultas ficam em “Minhas Consultas”, no menu — quando a psicóloga agendar, aparece lá. Em cada consulta você pode tocar em “Confirmar presença” (ela é avisada) e em “Adicionar à agenda”, que salva no calendário do seu celular. Os horários são sempre os de Brasília; se o seu aparelho estiver em outro fuso, a tela mostra os dois.",
    };
  }

  return {
    model: "site-help-local",
    topic: "general",
    content:
      "Posso te ajudar a encontrar: Minhas Consultas, Mensagens, Minha Psicóloga, Configurações da conta ou Ajuda. Me diga qual área você quer abrir.",
  };
}

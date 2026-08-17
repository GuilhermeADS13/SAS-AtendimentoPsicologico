export type SiteHelpTopic = "appointments" | "profile" | "video" | "luma" | "privacy" | "general";

export type SiteHelpResponse = {
  content: string;
  model: "site-help-local";
  topic: SiteHelpTopic;
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function answerSiteHelp(question: string): SiteHelpResponse {
  const normalized = normalize(question);

  if (/(consulta|agendamento|horario|psicolog)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "appointments",
      content: "Para consultar ou acompanhar seus horários, abra “Minhas Consultas” no menu. Quando a psicóloga criar um agendamento, ele aparecerá nessa área.",
    };
  }

  if (/(cadastro|perfil|telefone|endereco|email|senha)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "profile",
      content: "Para atualizar seus dados, abra “Perfil” ou “Meu Cadastro” no menu. Altere somente as informações necessárias e salve ao finalizar.",
    };
  }

  if (/(video|sala|chamada|entrar na consulta)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "video",
      content: "Para entrar em uma consulta, abra “Minhas Consultas” e use o botão da consulta agendada no horário combinado. O acesso é liberado somente para participantes autorizados.",
    };
  }

  if (/(luma|chat|assistente|coruja)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "luma",
      content: "Você está conversando com o modo de apoio do site da Luma. Ele ajuda a encontrar funções e entender a navegação, mas não consulta prontuários nem substitui sua psicóloga.",
    };
  }

  if (/(privacidade|seguranca|dados|prontuario|registro)/.test(normalized)) {
    return {
      model: "site-help-local",
      topic: "privacy",
      content: "As áreas do sistema são protegidas pelo seu perfil. O modo de apoio ao site não acessa prontuários, sessões ou documentos clínicos.",
    };
  }

  return {
    model: "site-help-local",
    topic: "general",
    content: "Posso ajudar a encontrar Minhas Consultas, Perfil, Minha Psicóloga, a sala de videochamada ou a página da Luma. Diga qual área você deseja abrir.",
  };
}

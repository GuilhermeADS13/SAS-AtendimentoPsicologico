import { useState } from "react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import { LogoLockup } from "@/components/Logo";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { useRole } from "@/hooks/useRole";
import { ArrowLeft, LifeBuoy, Mail, Phone } from "lucide-react";

/**
 * Número do suporte técnico, em dígitos com DDD (o 55 do Brasil é acrescentado
 * na hora de montar o link). É informação pública — por isso fica no código, e
 * não numa variável VITE_*, que exigiria mexer no Dockerfile e nos build args do
 * Render para um dado que muda uma vez na vida. Vazio = mostra o e-mail no lugar.
 */
const SUPORTE_WHATSAPP = "81992419511";

const MENSAGEM_PRONTA = "Olá! Preciso de ajuda com o VozInterior.";

/**
 * E-mail do suporte. É uma conta criada só para isto, não um endereço pessoal:
 * esta página é pública e endereço exposto aqui é coletado por robôs de spam —
 * o que começa a circular não para de circular.
 *
 * Ao contrário do envio automático (que sai pela Brevo e cai em spam), este
 * caminho é confiável: é o cliente de e-mail da própria pessoa escrevendo
 * direto, sem passar por serviço nenhum.
 */
const SUPORTE_EMAIL = "suportevozinterior@gmail.com";

function linkEmail(): string | null {
  if (!SUPORTE_EMAIL) return null;
  const assunto = encodeURIComponent("Ajuda — VozInterior");
  // Já deixa a pergunta feita: sem saber a tela, a primeira resposta seria só
  // "em qual tela aconteceu?", custando um dia de ida e volta.
  const corpo = encodeURIComponent(
    "Conte o que aconteceu e em qual tela você estava:\n\n",
  );
  return `mailto:${SUPORTE_EMAIL}?subject=${assunto}&body=${corpo}`;
}

function linkWhatsApp(): string | null {
  const digitos = SUPORTE_WHATSAPP.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(MENSAGEM_PRONTA)}`;
}

type Duvida = { pergunta: string; resposta: React.ReactNode };

/**
 * Dúvidas do paciente, na ordem em que aparecem na vida real: quase todo pedido
 * de suporte é "não consigo entrar".
 */
const DUVIDAS_PACIENTE: Duvida[] = [
  {
    pergunta: "Não consigo entrar na minha conta",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Use o mesmo e-mail que você informou à sua psicóloga.</li>
        <li>A senha diferencia maiúsculas de minúsculas — confira o Caps Lock.</li>
        <li>
          Se não lembra a senha, use <strong>“Esqueci minha senha”</strong> na tela de
          entrada.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Esqueci minha senha",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Na tela de entrada, clique em <strong>“Esqueci minha senha”</strong> e informe
          seu e-mail.
        </li>
        <li>Chega uma mensagem com um link para você criar uma nova senha.</li>
        <li>O link vale por pouco tempo. Se expirar, é só pedir outro.</li>
        <li>
          Não chegou? Confira a caixa de <strong>spam</strong> (ou “lixo eletrônico”).
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Não consigo entrar na sala da consulta",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          É preciso estar conectado à sua conta — a sala não abre para quem não entrou.
        </li>
        <li>
          Entre por <strong>Minhas Consultas</strong> e clique em{" "}
          <strong>“Entrar na sala”</strong>. Esse é sempre o caminho certo.
        </li>
        <li>
          Evite links antigos, guardados de outras consultas: cada consulta tem a sua
          própria sala.
        </li>
        <li>A sala abre só para você e para a sua psicóloga.</li>
      </ul>
    ),
  },
  {
    pergunta: "O que é “Confirmar presença”?",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          É você avisando que vai comparecer. O botão fica na consulta, em{" "}
          <strong>Minhas Consultas</strong>.
        </li>
        <li>
          Sua psicóloga é avisada na hora, e a consulta passa a mostrar{" "}
          <strong>“presença confirmada ✓”</strong>.
        </li>
        <li>
          Confirmar <strong>não</strong> abre a sala nem substitui entrar na consulta — no
          horário marcado você ainda clica em “Entrar na sala”.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Como atualizo meu telefone, endereço ou foto",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Vá em <strong>Meu Cadastro</strong>. Ali você altera nome, telefone, data de
          nascimento, endereço e foto.
        </li>
        <li>
          Depois de salvar, sua psicóloga já vê os dados novos — você não precisa avisar
          ninguém.
        </li>
        <li>
          Manter o telefone em dia ajuda: é por ele que ela consegue te avisar de alguma
          mudança.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Minha câmera ou meu microfone não funcionam",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Na primeira vez, o navegador pede permissão — clique em{" "}
          <strong>Permitir</strong>.
        </li>
        <li>
          Se você negou antes, clique no <strong>cadeado</strong> ao lado do endereço do
          site e libere câmera e microfone.
        </li>
        <li>
          Feche outros programas que estejam usando a câmera (Meet, Zoom, Teams) — dois
          programas não usam a câmera ao mesmo tempo.
        </li>
        <li>No computador, Chrome ou Edge costumam funcionar melhor.</li>
      </ul>
    ),
  },
  {
    pergunta: "Não recebi o e-mail de aviso da consulta",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Procure na caixa de <strong>spam</strong> ou “lixo eletrônico” — é onde esses
          avisos costumam parar.
        </li>
        <li>
          Achou lá? Marque como <strong>“não é spam”</strong>. Os próximos passam a chegar
          na caixa de entrada.
        </li>
        <li>
          De qualquer forma, suas consultas estão sempre em{" "}
          <strong>Minhas Consultas</strong> — o e-mail é só um lembrete.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "O site demorou para abrir",
    resposta: (
      <p>
        Na primeira vez do dia, o sistema pode levar até um minuto para “acordar”. Depois
        disso ele fica rápido. Se passar muito disso, avise a gente.
      </p>
    ),
  },
  {
    pergunta: "Preciso remarcar ou cancelar uma consulta",
    resposta: (
      <p>
        Remarcações e cancelamentos são combinados diretamente com a sua psicóloga — o
        suporte não mexe em agenda. Fale com ela pelo canal que vocês já usam.
      </p>
    ),
  },
];

/**
 * Dúvidas da psicóloga. Outro público, outras perguntas: aqui ninguém pergunta
 * "como entro na sala", e sim "como cadastro", "como agendo", "onde fica o
 * prontuário". A primeira é a que mais gera confusão — o vínculo entre o
 * cadastro e a conta do paciente é feito pelo e-mail.
 */
const DUVIDAS_PSICOLOGA: Duvida[] = [
  {
    pergunta: "Como cadastro um paciente novo",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Vá em <strong>Pacientes</strong> e clique em <strong>“Novo Paciente”</strong>.
        </li>
        <li>
          O <strong>e-mail é o dado mais importante</strong>: é ele que liga o cadastro à
          conta do paciente. Use o mesmo e-mail que ele vai usar para entrar (maiúsculas e
          minúsculas não importam).
        </li>
        <li>
          O telefone vale a pena preencher — sem ele o botão de avisar por WhatsApp fica
          desligado.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Cadastrei o paciente, mas ele não vê as consultas dele",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Quase sempre é <strong>e-mail diferente</strong>: o cadastro é ligado à conta
          pelo e-mail, então se ele criou a conta com outro endereço, os dois não se
          encontram.
        </li>
        <li>
          Abra o paciente em <strong>Pacientes</strong> e confira se o e-mail é o mesmo
          que ele usa para entrar. Corrigindo o e-mail, o vínculo acontece sozinho.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Como agendo uma consulta",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Vá em <strong>Agendamentos</strong> e clique em <strong>“Nova Consulta”</strong>
          .
        </li>
        <li>Escolha o paciente, a data, o horário e a duração.</li>
        <li>
          A sala de vídeo é criada junto, sozinha — você não precisa preparar nada antes.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Como começo a videochamada",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Em <strong>Agendamentos</strong>, na linha da consulta, use o botão{" "}
          <strong>“Entrar na videochamada”</strong>.
        </li>
        <li>
          Os botões da linha são <strong>ícones, sem texto</strong>. Passe o mouse por
          cima para ver o que cada um faz.
        </li>
        <li>
          Entre sempre pela consulta do dia. Cada consulta tem a sua sala — link antigo
          leva a uma sala vazia.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Como aviso o paciente da consulta",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Na linha da consulta, o ícone verde do WhatsApp (
          <strong>“Avisar por WhatsApp”</strong>) abre a conversa com a mensagem já
          escrita.
        </li>
        <li>
          <strong>Nada é enviado sozinho</strong>: abre no seu aparelho, você lê, ajusta se
          quiser e envia.
        </li>
        <li>
          Se o ícone estiver apagado, é porque o paciente está sem telefone no cadastro.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Como sei se o paciente confirmou presença",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Na linha da consulta aparece <strong>“✓ Presença confirmada”</strong>.
        </li>
        <li>
          Você também recebe o aviso na <strong>sineta</strong>, no alto da tela. Clicando
          nele, o sistema leva direto à consulta.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Onde escrevo as anotações da sessão",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Dentro da sala de vídeo, no painel do lado direito — dá para atender e anotar ao
          mesmo tempo.
        </li>
        <li>
          As anotações <strong>salvam sozinhas</strong> enquanto você digita, e ficam
          guardadas no prontuário daquele paciente.
        </li>
        <li>
          Só você vê esse painel. O paciente, na sala dele, vê apenas o vídeo.
        </li>
      </ul>
    ),
  },
  {
    pergunta: "Como registro uma sessão no prontuário",
    resposta: (
      <p>
        Abra o paciente em <strong>Pacientes</strong> e clique em{" "}
        <strong>“Nova Sessão”</strong>. Ali entram a evolução, o humor e os próximos
        passos — é o registro clínico, diferente das anotações rápidas feitas durante a
        chamada.
      </p>
    ),
  },
  {
    pergunta: "Como baixo o prontuário em PDF ou Word",
    resposta: (
      <ul className="list-disc pl-5 space-y-1">
        <li>
          Abra o paciente e clique em <strong>“Baixar prontuário”</strong>, escolhendo PDF
          ou Word.
        </li>
        <li>
          O arquivo é gerado na hora, no seu computador, com os dados, o histórico e todas
          as sessões.
        </li>
        <li>
          Serve como <strong>cópia de segurança e para arquivar</strong>. Vale baixar de
          tempos em tempos.
        </li>
      </ul>
    ),
  },
];

/**
 * Página de ajuda — pública, de propósito.
 *
 * A maior parte dos pedidos de suporte é "não consigo entrar". Se esta página
 * exigisse login, ela falharia justamente quando é necessária. Por isso fica
 * fora do DashboardLayout e é acessível deslogado.
 *
 * Duas abas porque são dois públicos com dúvidas que não se cruzam: o paciente
 * nunca vai perguntar como baixar um prontuário, e a psicóloga não precisa
 * caçar a resposta dela no meio das dúvidas de acesso do paciente.
 */
export default function Ajuda() {
  const whats = linkWhatsApp();
  const email = linkEmail();
  const { user, loading, isTherapist } = useRole();

  // Enquanto ninguém escolheu uma aba, ela segue o papel de quem está logado —
  // assim a psicóloga cai direto na parte dela. Deslogado (ou paciente), abre na
  // aba do paciente, que é a maioria. Depois do primeiro clique, manda a escolha.
  const [abaEscolhida, setAbaEscolhida] = useState<string | null>(null);
  const aba = abaEscolhida ?? (isTherapist ? "psicologa" : "paciente");

  const listaDeDuvidas = (duvidas: Duvida[], prefixo: string) => (
    <Accordion type="single" collapsible className="w-full">
      {duvidas.map((d, i) => (
        <AccordionItem key={d.pergunta} value={`${prefixo}-${i}`}>
          <AccordionTrigger className="text-left">{d.pergunta}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
            {d.resposta}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  const conteudo = (
    <div className="max-w-2xl mx-auto space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <LifeBuoy className="w-7 h-7 text-primary" />
            Como podemos ajudar?
          </h1>
          <p className="text-muted-foreground">
            Escolha o seu caso e veja se a dúvida já está respondida. Se não estiver, é só
            chamar a gente.
          </p>
        </div>

        <Tabs value={aba} onValueChange={setAbaEscolhida} className="w-full space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="paciente">Sou paciente</TabsTrigger>
            <TabsTrigger value="psicologa">Sou psicóloga</TabsTrigger>
          </TabsList>
          <TabsContent value="paciente">
            {listaDeDuvidas(DUVIDAS_PACIENTE, "pac")}
          </TabsContent>
          <TabsContent value="psicologa">
            {listaDeDuvidas(DUVIDAS_PSICOLOGA, "psi")}
          </TabsContent>
        </Tabs>

        {/* Um cartão por canal, cada um com o seu botão. Antes era um cartão só,
            de fundo quase branco, com o e-mail reduzido a um link miúdo no pé —
            o bloco inteiro sumia na página. Aqui cada canal tem peso próprio, e
            a diferença entre eles fica na frase, não em apagar um dos dois. */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">
              Ainda precisa de ajuda?
            </h2>
            <p className="text-sm text-muted-foreground">
              Conte o que aconteceu e, se puder, diga em qual tela você estava — isso
              resolve bem mais rápido.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {whats && (
              <Card className="border-primary/40">
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <WhatsAppIcon className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-foreground">WhatsApp</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    O jeito mais rápido — costumamos responder no mesmo dia.
                  </p>
                  <Button asChild className="w-full">
                    <a href={whats} target="_blank" rel="noreferrer">
                      Chamar no WhatsApp
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )}

            {email && (
              <Card className="border-primary/40">
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-foreground">E-mail</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Para escrever com calma ou mandar uma foto da tela.
                  </p>
                  <Button asChild variant="outline" className="w-full text-foreground">
                    <a href={email}>Enviar e-mail</a>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/*
          Fronteira clínica. Este é um app de saúde mental: mais cedo ou mais
          tarde alguém escreve ao suporte em sofrimento agudo, achando que é
          atendimento. Isso não pode ficar numa fila de dúvidas técnicas
          esperando alguém ler amanhã — daí o encaminhamento explícito ao CVV.
        */}
        <Card className="border-destructive/30">
          <CardContent className="flex gap-3">
            <Phone className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">
                Se você está em crise, não espere por aqui
              </p>
              <p className="text-muted-foreground">
                Este canal é para dúvidas sobre o aplicativo e não é atendimento de
                emergência. Se você está passando por um momento difícil ou pensando em se
                machucar, ligue <strong className="text-foreground">188</strong> (CVV,
                24 horas, gratuito), converse em{" "}
                <a
                  href="https://www.cvv.org.br"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  cvv.org.br
                </a>{" "}
                ou procure o CAPS mais próximo. Em emergência, ligue{" "}
                <strong className="text-foreground">192</strong>.
              </p>
            </div>
          </CardContent>
        </Card>
    </div>
  );

  // Enquanto o papel não chegou, não escolhe layout: renderizar um e trocar para
  // o outro faria a tela piscar.
  if (loading) return <div className="min-h-screen bg-background" />;

  // Logada, a ajuda é mais uma página do app e mantém o menu lateral. Sem isso,
  // clicar em "Ajuda" no menu jogaria a pessoa numa tela sem navegação nenhuma.
  if (user) return <DashboardLayout>{conteudo}</DashboardLayout>;

  // Deslogada, precisa de layout próprio: o DashboardLayout exige login, e é
  // justamente quem não conseguiu entrar que mais precisa desta página.
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <LogoLockup />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>
      <main className="px-4 py-10">{conteudo}</main>
    </div>
  );
}

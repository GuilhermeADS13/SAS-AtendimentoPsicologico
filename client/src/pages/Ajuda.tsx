import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogoLockup } from "@/components/Logo";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";
import { ArrowLeft, LifeBuoy, Phone } from "lucide-react";

/**
 * Número do suporte técnico, em dígitos com DDD (o 55 do Brasil é acrescentado
 * na hora de montar o link). É informação pública — por isso fica no código, e
 * não numa variável VITE_*, que exigiria mexer no Dockerfile e nos build args do
 * Render para um dado que muda uma vez na vida. Vazio = mostra o e-mail no lugar.
 */
const SUPORTE_WHATSAPP = "81992419511";

const MENSAGEM_PRONTA = "Olá! Preciso de ajuda com o VozInterior.";
const SUPORTE_EMAIL = "codexmaciel@gmail.com";

function linkWhatsApp(): string | null {
  const digitos = SUPORTE_WHATSAPP.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(MENSAGEM_PRONTA)}`;
}

/**
 * As dúvidas estão na ordem em que aparecem na vida real: quase todo pedido de
 * suporte é "não consigo entrar". As respostas resolvem sozinhas — a ideia é que
 * a pessoa saia daqui sem precisar falar com ninguém.
 */
const DUVIDAS: { pergunta: string; resposta: React.ReactNode }[] = [
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
 * Página de ajuda — pública, de propósito.
 *
 * A maior parte dos pedidos de suporte é "não consigo entrar". Se esta página
 * exigisse login, ela falharia justamente quando é necessária. Por isso fica
 * fora do DashboardLayout e é acessível deslogado.
 */
export default function Ajuda() {
  const whats = linkWhatsApp();

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

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <LifeBuoy className="w-7 h-7 text-primary" />
            Como podemos ajudar?
          </h1>
          <p className="text-muted-foreground">
            Veja se a sua dúvida já está respondida aqui embaixo. Se não estiver, é só
            chamar a gente.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {DUVIDAS.map((d, i) => (
            <AccordionItem key={d.pergunta} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{d.pergunta}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                {d.resposta}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="font-semibold text-foreground">Ainda precisa de ajuda?</p>
              <p className="text-sm text-muted-foreground">
                Chame o suporte e conte o que aconteceu. Se puder, diga em qual tela você
                estava — isso resolve bem mais rápido.
              </p>
            </div>
            {whats ? (
              <Button asChild size="lg">
                <a href={whats} target="_blank" rel="noreferrer">
                  <WhatsAppIcon className="w-5 h-5 mr-2" />
                  Falar no WhatsApp
                </a>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline">
                <a href={`mailto:${SUPORTE_EMAIL}?subject=${encodeURIComponent("Ajuda — VozInterior")}`}>
                  Escrever para o suporte
                </a>
              </Button>
            )}
          </CardContent>
        </Card>

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
      </main>
    </div>
  );
}

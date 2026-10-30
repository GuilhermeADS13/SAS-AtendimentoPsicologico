import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/Logo";
import { RESPONSAVEL_PELO_SERVICO } from "@/lib/suporte";
import {
  DESCONTO_FUNDADOR,
  DIAS_DE_TESTE_GRATIS,
  DIAS_PARA_O_PRIMEIRO_PACIENTE,
  MESES_PAGOS_NO_ANUAL,
  VAGAS_DE_FUNDADOR,
} from "@shared/precos";
import { ArrowLeft } from "lucide-react";

const EMAIL = "suportevozinterior@gmail.com";

function LinkDoEmail() {
  return (
    <a href={`mailto:${EMAIL}`} className="text-primary underline underline-offset-4">
      {EMAIL}
    </a>
  );
}

/**
 * Termos de Uso — públicos. Precisam bater com o que o sistema FAZ: Pix com
 * comprovante pelo WhatsApp (sem cobrança automática), vencido bloqueia só o uso
 * novo (prontuários continuam abertos) e o reembolso é proporcional aos dias não
 * usados — com devolução integral em 7 dias (direito de arrependimento, art. 49
 * do CDC). Os números vêm de shared/precos para não desatualizarem.
 */
export default function Termos() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <LogoLockup />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <article className="space-y-6 text-sm leading-relaxed text-foreground/90">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">Termos de Uso</h1>
            <p className="text-muted-foreground">
              VozInterior — Atendimento Psicológico Online · atualizados em outubro de 2026
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. Quem oferece o serviço</h2>
            <p>
              O VozInterior é oferecido por <strong>{RESPONSAVEL_PELO_SERVICO}</strong>, pessoa
              física. Contato: <LinkDoEmail /> ou o WhatsApp da página de{" "}
              <Link href="/ajuda" className="text-primary underline underline-offset-4">
                Ajuda
              </Link>
              . Ao criar a conta, você concorda com estes termos e com a{" "}
              <Link href="/privacidade" className="text-primary underline underline-offset-4">
                Política de Privacidade
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. O que é o VozInterior</h2>
            <p>
              Uma plataforma para psicólogas atenderem online: agenda, prontuário,
              videochamada, mensagens com o paciente, controle financeiro e a assistente de
              IA Luma. Quem paga é a psicóloga; o paciente usa de graça, convidado por ela.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Conta e verificação do CRP</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                O acesso profissional só é liberado depois que verificamos o seu{" "}
                <strong>CRP</strong>. Podemos recusar ou suspender cadastros com dados falsos.
              </li>
              <li>
                A conta é pessoal. Guarde a sua senha e não a compartilhe: você responde pelo
                que for feito com ela.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Responsabilidades da psicóloga</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Seguir o Código de Ética Profissional e as resoluções do Conselho Federal de
                Psicologia, inclusive as que tratam do atendimento online.
              </li>
              <li>
                Ela é a <strong>controladora</strong> dos dados dos seus pacientes (LGPD): decide
                o que registrar, obtém o consentimento necessário — no caso de menores, o de um
                dos pais ou responsável — e guarda o prontuário pelo prazo que o CFP exige. O
                VozInterior trata esses dados em nome dela, como <strong>operador</strong>.
              </li>
              <li>
                As decisões clínicas são sempre dela. O VozInterior é uma ferramenta e não
                interfere no atendimento.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">5. Assistente Luma</h2>
            <p>
              A Luma ajuda a usar o sistema, cuida da agenda e ajuda com a estrutura do
              prontuário (modelos em branco e o que o CFP pede). Ela{" "}
              <strong>não lê o conteúdo dos prontuários</strong> — não cole anotações de
              pacientes na conversa. Ela é uma IA e <strong>pode errar</strong>: confira o que
              ela sugerir antes de usar. Ela não faz diagnóstico nem substitui o julgamento
              profissional. Cada plano tem um número de perguntas por dia.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. Planos, teste grátis e preços</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Os planos, limites e valores são os da página de{" "}
                <Link href="/precos" className="text-primary underline underline-offset-4">
                  Preços
                </Link>
                . O valor é fixo dentro do limite de pacientes do plano.
              </li>
              <li>
                <strong>Teste grátis:</strong> {DIAS_DE_TESTE_GRATIS} dias com tudo liberado, sem
                cartão, contados a partir do cadastro do primeiro paciente, que deve acontecer em
                até {DIAS_PARA_O_PRIMEIRO_PACIENTE} dias depois da aprovação do CRP. Sem esse
                cadastro no prazo, o acesso pausa e a conta continua guardada. É um teste por
                pessoa (por CRP e por celular).
              </li>
              <li>
                <strong>Psicóloga Fundadora:</strong> as {VAGAS_DE_FUNDADOR} primeiras psicólogas
                pagam {DESCONTO_FUNDADOR * 100}% a menos que a tabela, enquanto continuarem
                clientes.
              </li>
              <li>
                Se os preços mudarem, avisamos com pelo menos <strong>30 dias</strong> de
                antecedência, e o valor novo só vale a partir do período seguinte ao aviso.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Pagamento e vencimento</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                O pagamento é por <strong>Pix</strong>, mensal ou anual (no anual você paga{" "}
                {MESES_PAGOS_NO_ANUAL} meses e usa 12). Não há cobrança automática: o acesso é
                renovado quando o comprovante chega.
              </li>
              <li>
                Você escolhe o dia do vencimento na aba Assinatura. Três dias antes, avisamos por
                e-mail e no sistema.
              </li>
              <li>
                Se o pagamento não for feito, ficam pausados a agenda, as videochamadas e a Luma.
                Os seus <strong>prontuários continuam abertos</strong> para consulta e
                exportação.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. Cancelamento e reembolso</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Você pode cancelar <strong>a qualquer momento</strong>, pelo WhatsApp ou por
                e-mail, sem multa.
              </li>
              <li>
                <strong>Até 7 dias depois do pagamento</strong>, devolvemos o valor inteiro
                (direito de arrependimento, art. 49 do Código de Defesa do Consumidor).
              </li>
              <li>
                Depois disso, devolvemos a parte <strong>proporcional aos dias que você não
                usou</strong>, contados do dia do pedido até o fim do período pago. Exemplo: no
                plano anual de R$ 390, quem cancela no 100º dia recebe de volta os 265 dias
                restantes, ou seja, R$ 390 × 265 ÷ 365 = <strong>R$ 283,15</strong>.
              </li>
              <li>
                A conta é feita sobre o valor que você realmente pagou (com o desconto de
                Fundadora, se tiver). A devolução é por Pix, para a conta que fez o pagamento,
                em até <strong>7 dias úteis</strong> depois do pedido.
              </li>
              <li>
                Depois do cancelamento, os seus prontuários continuam acessíveis para consulta e
                exportação, como no item 7.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">9. Disponibilidade</h2>
            <p>
              Trabalhamos para manter o sistema no ar e fazemos cópia de segurança do banco de
              dados todos os dias. Mesmo assim, podem acontecer interrupções por manutenção ou
              falha de um dos serviços que usamos. Por isso, recomendamos exportar os
              registros importantes de tempos em tempos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">10. O que não é permitido</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Usar o sistema para algo ilegal ou contrário à ética profissional.</li>
              <li>Cadastrar dados de pessoas sem base legal para isso.</li>
              <li>Tentar acessar contas ou dados de outras pessoas, ou burlar a segurança.</li>
              <li>Compartilhar a conta com quem não é a titular.</li>
            </ul>
            <p>Nesses casos, a conta pode ser suspensa.</p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">11. Alterações e foro</h2>
            <p>
              Estes termos podem mudar; avisamos por e-mail ou no sistema, e a data no topo
              indica a versão vigente. Para resolver qualquer conflito, vale o foro do seu
              domicílio. Dúvidas: <LinkDoEmail />.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}

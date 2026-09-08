import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { LogoLockup } from "@/components/Logo";
import { ArrowLeft } from "lucide-react";

/**
 * Política de privacidade — pública, exigência de LGPD para um app que trata DADO
 * DE SAÚDE (categoria sensível, art. 5º, II). Linkada no cadastro: o consentimento
 * de lá aponta para cá.
 *
 * Precisa refletir a arquitetura REAL: a videochamada é WebRTC próprio (com TURN
 * da Metered como relay quando a conexão direta falha), e a assistente Luma envia
 * dados a um provedor de IA (Groq, EUA). Declarar esses operadores e a
 * transferência internacional é o que a lei exige — não é opcional.
 */
export default function Privacidade() {
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

      <main className="max-w-2xl mx-auto px-4 py-10">
        <article className="space-y-6 text-sm leading-relaxed text-foreground/90">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-foreground">
              Política de Privacidade
            </h1>
            <p className="text-muted-foreground">
              VozInterior — Atendimento Psicológico Online · atualizada em setembro de 2026
            </p>
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">1. O que é o VozInterior</h2>
            <p>
              O VozInterior é a plataforma usada pela sua psicóloga para agendar e
              realizar consultas online e manter o registro clínico (prontuário) do seu
              atendimento. Os dados aqui tratados existem para uma única finalidade:
              viabilizar o seu atendimento psicológico.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">2. Quais dados coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Conta:</strong> nome, e-mail e senha (a senha é guardada de forma
                criptografada — nem nós conseguimos lê-la).
              </li>
              <li>
                <strong>Cadastro:</strong> telefone, data de nascimento, endereço e
                contato de emergência, quando você os informa.
              </li>
              <li>
                <strong>Dados de saúde (sensíveis):</strong> histórico e registros das
                sessões, mantidos pela psicóloga como prontuário. São a categoria mais
                protegida da LGPD e recebem o tratamento mais restrito da plataforma.
              </li>
              <li>
                <strong>Uso:</strong> registros técnicos de acesso (datas de consulta,
                avisos enviados), necessários ao funcionamento.
              </li>
            </ul>
            <p>
              Coletamos apenas o mínimo necessário para o atendimento (princípio da
              necessidade, art. 6º da LGPD).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">3. Base legal e guarda</h2>
            <p>
              Tratamos os dados com base no seu <strong>consentimento</strong> (dado no
              cadastro), na <strong>tutela da saúde</strong> (art. 11, II, “f” da LGPD, em
              procedimento realizado por profissional de saúde) e em{" "}
              <strong>obrigação regulatória</strong>: o Conselho Federal de Psicologia
              (Resolução CFP nº 001/2009) exige a guarda do prontuário por, no mínimo,{" "}
              <strong>5 anos</strong> — por isso o registro clínico não pode ser apagado
              de imediato mesmo a seu pedido, apenas arquivado até o fim do prazo.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">4. Onde os dados ficam</h2>
            <p>
              Usamos serviços contratados (operadores) para funcionar. Alguns ficam{" "}
              <strong>fora do Brasil</strong>; nesses casos há transferência internacional
              de dados (art. 33 da LGPD), feita apenas para viabilizar o atendimento e
              limitada ao necessário:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Supabase</strong> — banco de dados e arquivos (servidores nos
                <strong> EUA</strong>), com acesso restrito.
              </li>
              <li>
                <strong>Render</strong> — hospedagem da aplicação (<strong>EUA</strong>).
              </li>
              <li>
                <strong>Brevo</strong> — envio dos e-mails de aviso (recebe apenas seu
                e-mail e o conteúdo do aviso).
              </li>
              <li>
                <strong>Metered</strong> — servidor de retransmissão (TURN) que a
                videochamada usa quando a conexão direta entre os dois computadores não é
                possível. Ele apenas encaminha o tráfego, que segue{" "}
                <strong>criptografado de ponta a ponta</strong> — a Metered não consegue
                ver nem ouvir a sessão.
              </li>
              <li>
                <strong>Groq</strong> — provedor de inteligência artificial (
                <strong>EUA</strong>) que processa as mensagens da assistente Luma. Ver a
                seção 5.
              </li>
            </ul>
            <p>
              <strong>Não vendemos nem compartilhamos seus dados</strong> com terceiros
              além desses operadores, necessários ao serviço.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">5. Assistente de IA (Luma)</h2>
            <p>
              A Luma é uma assistente que ajuda a usar o sistema (agendar, tirar dúvidas)
              e a consultar informações do seu próprio atendimento. Para responder, ela
              envia o texto da conversa e os dados estritamente necessários a um provedor
              de IA (<strong>Groq</strong>, nos EUA), que processa e devolve a resposta.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                A Luma acessa <strong>apenas os dados do paciente vinculado à conversa</strong> —
                nunca de outros pacientes.
              </li>
              <li>
                Ela <strong>não substitui a sua psicóloga</strong> e não faz diagnóstico
                nem conduz terapia. Em situações de crise, orienta procurar ajuda
                (CVV 188, emergência 192) e a profissional.
              </li>
              <li>
                O provedor de IA processa os dados para gerar a resposta daquela conversa;
                não os usa para outra finalidade.
              </li>
              <li>
                Se preferir não usar a assistente, basta não interagir com ela — o
                atendimento e o restante do sistema funcionam normalmente.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">6. Pacientes menores de idade</h2>
            <p>
              Quando o paciente é <strong>menor de 18 anos</strong>, o tratamento dos
              dados depende do <strong>consentimento de pelo menos um dos pais ou do
              responsável legal</strong> (art. 14 da LGPD), e é feito sempre no melhor
              interesse do menor. O cadastro é realizado pela psicóloga, que confirma ter
              obtido esse consentimento do responsável. Coletamos apenas os dados
              indispensáveis ao atendimento.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">7. Seus direitos</h2>
            <p>
              Nos termos do art. 18 da LGPD, você pode a qualquer momento pedir{" "}
              <strong>acesso</strong> aos seus dados, <strong>correção</strong> (boa parte
              você mesmo edita em “Meu Cadastro”), <strong>eliminação</strong> (ressalvada
              a guarda obrigatória do prontuário, acima) e{" "}
              <strong>revogação do consentimento</strong>. É só escrever para{" "}
              <a
                href="mailto:suportevozinterior@gmail.com"
                className="text-primary underline underline-offset-4"
              >
                suportevozinterior@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">8. Segurança</h2>
            <p>
              O acesso ao prontuário é exclusivo da sua psicóloga. As salas de vídeo são
              1:1 e exigem que cada participante esteja <strong>autenticado</strong> e seja
              parte daquela consulta; a videochamada é <strong>criptografada de ponta a
              ponta</strong> e <strong>não é gravada</strong> — o conteúdo da sessão não é
              armazenado. Todo o tráfego é criptografado (HTTPS) e as senhas seguem
              política de complexidade mínima.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">9. Controlador e encarregado</h2>
            <p>
              A <strong>controladora</strong> dos dados é a psicóloga responsável pelo seu
              atendimento, que decide sobre o tratamento e responde por ele. Para exercer
              seus direitos, tirar dúvidas sobre privacidade ou falar com o{" "}
              <strong>encarregado pelo tratamento de dados</strong> (art. 41 da LGPD), use
              o canal{" "}
              <a
                href="mailto:suportevozinterior@gmail.com"
                className="text-primary underline underline-offset-4"
              >
                suportevozinterior@gmail.com
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">10. Alterações e contato</h2>
            <p>
              Esta política pode ser atualizada; a data no topo indica a versão vigente.
              Dúvidas sobre privacidade:{" "}
              <a
                href="mailto:suportevozinterior@gmail.com"
                className="text-primary underline underline-offset-4"
              >
                suportevozinterior@gmail.com
              </a>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}

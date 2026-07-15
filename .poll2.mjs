// Observa a sonda (notifications id=6) e a solicitação falsa (id=4).
// A sonda é quem revela o motivo: a fila grava errorMessage no fracasso.
import { config } from "dotenv";
config({ path: "C:/Users/Guilh/OneDrive/Área de Trabalho/Sas Psicologico/.env.local", override: true });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const ATE = Date.now() + 17 * 60 * 1000;
const hora = () => new Date().toLocaleTimeString("pt-BR");

while (Date.now() < ATE) {
  const [n] = await sql`SELECT status, "errorMessage" FROM notifications WHERE id = 6`;
  const [s] = await sql`SELECT "notifiedAt" FROM "therapistRequests" WHERE id = 4`;

  if (n && n.status !== "pending") {
    console.log(`${hora()} SONDA: status=${n.status}`);
    if (n.status === "sent") {
      console.log(">>> A BREVO ACEITOU. O envio funciona.");
    } else {
      console.log(`>>> FALHOU. Motivo: ${n.errorMessage}`);
    }
    console.log(`solicitação id=4 notifiedAt: ${s?.notifiedAt ?? "ainda nulo"}`);
    await sql.end();
    process.exit(0);
  }

  console.log(`${hora()} sonda ainda pendente (o ciclo roda de 15 em 15 min)...`);
  // Mantém o container acordado: hibernando, o setInterval não roda.
  await fetch("https://sas-atendimento-psicologico.onrender.com/").catch(() => {});
  await new Promise((r) => setTimeout(r, 45_000));
}

console.log(`${hora()} 17 min e a sonda nem foi tentada — o agendador não está rodando.`);
await sql.end();
process.exit(1);

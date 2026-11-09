// Service worker do VozInterior: existe para o sistema poder ser instalado como app.
//
// NÃO guarda nada em cache, de propósito: as páginas e a API carregam prontuário e
// dados de pacientes, que não podem ficar gravados no aparelho. Só trata a abertura
// de página (navegação): sem internet, mostra um aviso em vez da tela de erro do
// navegador. Todo o resto vai direto para a rede, como se ele não existisse.

const SEM_INTERNET = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem internet — VozInterior</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbf8f3;color:#1f2d2d;
font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
h1{font-size:1.25rem;margin:0 0 8px;color:#215756}button{margin-top:16px;padding:10px 18px;border:0;
border-radius:10px;background:#215756;color:#fff;font:inherit;cursor:pointer}</style></head>
<body><main><h1>Você está sem internet</h1><p>O VozInterior precisa de conexão para abrir.<br>
Confira o Wi-Fi ou os dados móveis e tente de novo.</p>
<button onclick="location.reload()">Tentar de novo</button></main></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(SEM_INTERNET, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});

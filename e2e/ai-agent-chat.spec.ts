import { test, expect } from "@playwright/test";

test.describe("conversa com o agente RAG", () => {
  test("envia pergunta e exibe resposta com fonte autorizada", async ({ page }) => {
    let requestBody = "";
    await page.route("**/api/trpc/ai.chat**", async (route) => {
      requestBody = route.request().url();
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          result: {
            data: {
              json: {
                choices: [{
                  message: {
                    role: "assistant",
                    content: "Com base nos registros autorizados, encontrei uma informação relevante.\n\nFonte: prontuario-001.pdf, página 2.",
                  },
                }],
              },
            },
          },
        }]),
      });
    });

    await page.goto("/__e2e__/agent-chat");
    await expect(page.getByRole("heading", { name: "Agente RAG — teste E2E" })).toBeVisible();

    const input = page.getByTestId("ai-chat-input");
    await input.fill("Quais informações estão nos meus registros autorizados?");
    await expect(page.getByTestId("ai-chat-submit")).toBeEnabled();
    await input.press("Enter");

    await expect(page.getByTestId("ai-chat-submit")).toBeDisabled();
    await expect(page.getByText("Quais informações estão nos meus registros autorizados?", { exact: true })).toBeVisible();
    await expect(page.getByText("Com base nos registros autorizados, encontrei uma informação relevante.", { exact: false })).toBeVisible();
    await expect(page.getByText("Fonte: prontuario-001.pdf, página 2.", { exact: true })).toBeVisible();
    await expect(page.getByTestId("ai-chat-submit")).toBeDisabled();

    expect(requestBody).toBeTruthy();
    expect(decodeURIComponent(requestBody)).toContain("registros autorizados");
    expect(requestBody).not.toContain("service_role");
  });

  test("exibe erro de transporte sem perder a pergunta do usuário", async ({ page }) => {
    await page.route("**/api/trpc/ai.chat**", async (route) => {
      await route.fulfill({ status: 503, body: "temporarily unavailable" });
    });

    await page.goto("/__e2e__/agent-chat");
    await page.getByTestId("ai-chat-input").fill("O serviço está disponível?");
    await page.getByTestId("ai-chat-input").press("Enter");

    await expect(page.getByText("O serviço está disponível?", { exact: true })).toBeVisible();
    await expect(page.getByText("Falha ao conversar com o agente", { exact: true })).toBeVisible();
  });
});

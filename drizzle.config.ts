import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Carrega .env.local (dev) e depois .env — sem sobrescrever o que já existir no
// ambiente. Assim `pnpm drizzle-kit migrate` acha a DATABASE_URL local.
config({ path: ".env.local" });
config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});

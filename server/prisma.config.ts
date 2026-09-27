import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, ".env") });

import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
  keepAlive: true,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    adapter,
  },
});

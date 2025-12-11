// BiblioFlow Prisma Configuration
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Legge DATABASE_URL dal file .env
    url: process.env.DATABASE_URL!,
  },
});

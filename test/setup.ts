import { env } from "cloudflare:workers";
import migration from "../migrations/0001_initial.sql?raw";

for (const statement of migration
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean)) {
  await env.DB.prepare(statement).run();
}
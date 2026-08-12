import { env } from "cloudflare:test";
import migration from "../migrations/0001_initial.sql?raw";

await env.DB.exec(migration);

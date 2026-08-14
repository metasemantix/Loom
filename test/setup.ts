import { env } from "cloudflare:workers";
import migration from "../migrations/0001_initial.sql?raw";
import productSlice from "../migrations/0002_product_slice.sql?raw";

for (const statement of `${migration}\n${productSlice}`
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean)) {
  await env.DB.prepare(statement).run();
}

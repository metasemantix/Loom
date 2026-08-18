import { env } from "cloudflare:workers";
import migration from "../migrations/0001_initial.sql?raw";
import productSlice from "../migrations/0002_product_slice.sql?raw";
import humanProjects from "../migrations/0003_human_projects.sql?raw";
import projectLifecycle from "../migrations/0004_project_lifecycle.sql?raw";

for (const statement of `${migration}\n${productSlice}\n${humanProjects}\n${projectLifecycle}`
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean)) {
  await env.DB.prepare(statement).run();
}

import { env } from "cloudflare:workers";
import migration from "../migrations/0001_initial.sql?raw";
import productSlice from "../migrations/0002_product_slice.sql?raw";
import humanProjects from "../migrations/0003_human_projects.sql?raw";
import projectLifecycle from "../migrations/0004_project_lifecycle.sql?raw";

function statements(sql:string){const result:string[]=[],lines:string[]=[],flush=()=>{const value=lines.join("\n").trim().replace(/;$/,"");lines.length=0;if(value)result.push(value)};let trigger=false;for(const line of sql.split("\n")){if(/^CREATE TRIGGER\b/.test(line.trim()))trigger=true;lines.push(line);if(trigger?/^END;$/.test(line.trim()):line.trim().endsWith(";")){flush();trigger=false}}flush();return result}
for(const sql of [migration,productSlice,humanProjects,projectLifecycle])for(const statement of statements(sql))await env.DB.prepare(statement).run();

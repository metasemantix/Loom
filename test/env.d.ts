import type { Env as LoomEnv } from "../src/types";

declare global {
  namespace Cloudflare {
    interface Env extends LoomEnv {}
  }
}

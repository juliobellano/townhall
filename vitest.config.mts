import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // TOWNHALL_CREATOR=cached keeps tests off the network even if a real key is in the environment.
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000, env: { TOWNHALL_CREATOR: "cached" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});

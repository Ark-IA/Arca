import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Dummy secrets — encryption.ts / webhook-signature.ts read these
    // at module load. Tests never hit a real Meta/Supabase service, so
    // any 32-byte hex / non-empty string will do; keep them lexically
    // identical to the CI build env so behaviour matches.
    env: {
      ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
      META_APP_SECRET: "test-meta-app-secret",

      // Pin the timezone. Date-only strings like `new Date("2026-05-18")`
      // parse as UTC midnight but `getDay()` reads them back in LOCAL
      // time, so west of Greenwich they land on the previous day and
      // every day-of-week assertion shifts by one. CI runs on UTC and
      // never noticed; a developer machine in America/Bogota (UTC-5)
      // failed two tests in `dashboard/date-utils.test.ts` that had
      // nothing wrong with them.
      //
      // Pinning here rather than fixing each test: the suite should
      // give the same answer on every machine, and a test that only
      // passes in one timezone is a test nobody can trust anywhere.
      TZ: "UTC",
    },
    clearMocks: true,
  },
});

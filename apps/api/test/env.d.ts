declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
    SETUP_CODE?: string;
    GEMINI_API_KEY?: string;
    JEV_API_KEY?: string;
  }
}

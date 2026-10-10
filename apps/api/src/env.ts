/** Worker bindings: the generated `Env` plus secrets, which `wrangler types` cannot see. */
export type Bindings = Env & { SETUP_CODE?: string };

/** Everything a handler needs from the outside world, injected so tests control it. */
export type Deps = Readonly<{
  now: () => number;
  newId: () => string;
}>;

export type AppEnv = { Bindings: Bindings; Variables: { deps: Deps } };

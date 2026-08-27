// Root-level re-export shim. Consumers using classic/Node10 module
// resolution (e.g. apps/worker's tsc, which compiles to CommonJS without a
// modern moduleResolution setting) resolve a bare subpath import like
// "@trend/core/aliexpress" to this literal file, ignoring package.json's
// "exports" map entirely — that map is only consulted under
// node16/nodenext/bundler resolution (e.g. Next.js in apps/web). Keep both
// working: this file for classic resolution, "exports" for the rest.
export * from "./src/aliexpress";

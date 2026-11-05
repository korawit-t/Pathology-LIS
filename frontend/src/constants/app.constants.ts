declare const __APP_VERSION__: string
declare const __BUILD_ID__: string
// Both come from Vite's `define` (vite.config.js). The typeof guards let this
// module load under Vitest, which has no `define`: the root-level update
// banner imports it, so every test that renders the app would otherwise throw.
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev"
// Changes on every build, unlike APP_VERSION (see useNewBuildAvailable).
export const BUILD_ID: string = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev"

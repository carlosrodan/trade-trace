import { context, build } from "esbuild";
import { builtinModules } from "node:module";

const options = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules],
  format: "cjs",
  target: "es2020",
  sourcemap: false,
  minify: !process.argv.includes("--watch"),
  outfile: "main.js",
  loader: {
    ".png": "dataurl",
  },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const buildContext = await context(options);
  await buildContext.watch();
} else {
  await build(options);
}

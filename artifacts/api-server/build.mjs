import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, mkdir, writeFile } from "node:fs/promises";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  const publicDir = path.resolve(artifactDir, "public");
  await rm(distDir, { recursive: true, force: true });
  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, "index.html"), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Chess API Server</title>
  <meta name="description" content="Production API server for the chess application.">
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0b1020; color: #eef2ff; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top right, #263a6b 0, #0b1020 46%); }
    main { width: min(880px, calc(100% - 40px)); margin: 0 auto; padding: 72px 0; }
    .eyebrow { color: #91a7ff; font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 14px 0; font-size: clamp(42px, 8vw, 76px); line-height: .98; letter-spacing: -.05em; }
    .lead { max-width: 650px; color: #b9c2da; font-size: 19px; line-height: 1.6; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 42px; }
    .card { border: 1px solid #2b3860; border-radius: 18px; padding: 22px; background: rgba(18, 27, 53, .75); box-shadow: 0 20px 60px rgba(0, 0, 0, .2); }
    .card h2 { margin-top: 0; }
    .card p, li { color: #b9c2da; line-height: 1.6; }
    code, pre { color: #d8e0ff; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    code { color: #a9b9ff; }
    pre { overflow: auto; padding: 14px; border-radius: 10px; background: #080d1b; }
    a { color: #a9b9ff; }
    @media (max-width: 650px) { .grid { grid-template-columns: 1fr; } main { padding: 44px 0; } }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Chess API Server</p>
    <h1>Backend online.</h1>
    <p class="lead">Production API services for authentication, matchmaking, online games, puzzles, coaching, statistics, and the chess engine.</p>
    <div class="grid">
      <section class="card"><h2>Service status</h2><p>✓ API server is deployed and accepting requests.</p><p><a href="/api/healthz">Check health endpoint →</a></p></section>
      <section class="card"><h2>Base URL</h2><pre>https://api-server-pluh.vercel.app</pre><p>Use the <code>/api</code> prefix for application routes.</p></section>
    </div>
    <section class="card" style="margin-top:16px"><h2>Available services</h2><ul><li><code>/api/auth</code> — authentication and OTP sessions</li><li><code>/api/matchmaking</code> — matchmaking queue</li><li><code>/api/games</code> — online games and moves</li><li><code>/api/puzzles</code> — puzzle generation and themes</li><li><code>/api/coach</code> — chess coaching</li><li><code>/api/stats</code> — player statistics</li><li><code>/api/engine</code> — Stockfish analysis</li></ul></section>
  </main>
</body>
</html>
`);

  const { copyFile } = await import("node:fs/promises");
  await mkdir(distDir, { recursive: true });
  await mkdir(path.resolve(distDir, "chess-server"), { recursive: true });
  await copyFile(
    path.resolve(artifactDir, "src/chess-server/stockfish-worker.cjs"),
    path.resolve(distDir, "stockfish-worker.cjs"),
  );
  await copyFile(
    path.resolve(artifactDir, "src/chess-server/stockfish-worker.cjs"),
    path.resolve(distDir, "chess-server", "stockfish-worker.cjs"),
  );

  await esbuild({
    entryPoints: [
      path.resolve(artifactDir, "src/index.ts"),
      path.resolve(artifactDir, "src/vercel.ts"),
    ],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    minify: true,
    treeShaking: true,
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg",
      "pg-native",
      "stockfish",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: false,
    plugins: [
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
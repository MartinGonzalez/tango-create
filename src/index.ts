#!/usr/bin/env bun

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const TANGO_API_TAG = "v0.0.2-rc46";

const CATEGORIES = [
  "developer-tools",
  "productivity",
  "media",
  "communication",
  "finance",
  "utilities",
] as const;

const ICONS = [
  "branch", "play", "post", "puzzle", "star", "gear", "chat", "code",
  "folder", "search", "terminal", "lightning", "globe", "lock", "heart",
] as const;

// ── Interactive prompt ──

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` (${fallback})` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || fallback || "");
    });
  });
}

function choose(question: string, options: readonly string[], fallback: string): Promise<string> {
  return new Promise((resolve) => {
    console.log(`  ${question}`);
    options.forEach((opt, i) => {
      const marker = opt === fallback ? " (default)" : "";
      console.log(`    ${i + 1}. ${opt}${marker}`);
    });
    rl.question(`  Choose [1-${options.length}]: `, (answer) => {
      const index = parseInt(answer.trim(), 10) - 1;
      if (index >= 0 && index < options.length) {
        resolve(options[index]);
      } else {
        resolve(fallback);
      }
    });
  });
}

async function confirm(question: string, fallback = true): Promise<boolean> {
  const hint = fallback ? "Y/n" : "y/N";
  const answer = await ask(`${question} [${hint}]`);
  if (!answer) return fallback;
  return answer.toLowerCase().startsWith("y");
}

// ── Templates ──

function packageJson(opts: {
  name: string;
  id: string;
  displayName: string;
  description: string;
  category: string;
  icon: string;
  label: string;
  hasBackend: boolean;
}): string {
  const manifest: Record<string, unknown> = {
    id: opts.id,
    name: opts.displayName,
    description: opts.description,
    group: "Custom",
    category: opts.category,
    runtime: "react",
    entrypoint: "./dist/index.js",
    hostApiVersion: "2.0.0",
    launcher: {
      sidebarShortcut: {
        enabled: true,
        label: opts.label,
        icon: opts.icon,
        order: 50,
      },
    },
    panels: {
      sidebar: true,
      first: true,
      second: false,
      right: false,
    },
    permissions: [],
  };

  if (opts.hasBackend) {
    manifest.backendEntrypoint = "./dist/backend.js";
  }

  return JSON.stringify(
    {
      name: opts.name,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "dist/index.js",
      scripts: {
        dev: "bun node_modules/tango-api/src/cli.ts dev",
        build: "bun node_modules/tango-api/src/cli.ts build",
        sync: "bun node_modules/tango-api/src/cli.ts sync",
        validate: "bun node_modules/tango-api/src/cli.ts validate",
        test: "bun test ./test",
      },
      dependencies: {
        "tango-api": `github:MartinGonzalez/tango-api#${TANGO_API_TAG}`,
      },
      devDependencies: {
        "@types/react": "^18.0.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      tango: {
        instrument: manifest,
      },
    },
    null,
    2,
  );
}

function frontendIndex(displayName: string, hasBackend: boolean): string {
  const backendImport = hasBackend
    ? `
  // Call a backend action
  async function handleGreet() {
    try {
      const result = await api.actions.call<{ name: string }, { greeting: string }>(
        "hello",
        { name: "Tango" },
      );
      setMessage(result.greeting);
    } catch (err: any) {
      setMessage(\`Error: \${err.message}\`);
    }
  }
`
    : "";

  const backendButton = hasBackend
    ? `
          <UIButton label="Call Backend" variant="secondary" onClick={handleGreet} />`
    : "";

  return `import { useState } from "react";
import {
  defineReactInstrument,
  useInstrumentApi,
  UIRoot,
  UISection,
  UICard,
  UIButton,
} from "tango-api";

function SidebarPanel() {
  return (
    <UIRoot style={{ padding: 12 }}>
      <UISection title="${displayName}">
        <UICard>
          <p style={{ opacity: 0.6, fontSize: 13 }}>
            Your instrument sidebar. Add navigation, lists, or controls here.
          </p>
        </UICard>
      </UISection>
    </UIRoot>
  );
}

function MainPanel() {
  const api = useInstrumentApi();
  const [message, setMessage] = useState("Hello from ${displayName}!");
${backendImport}
  return (
    <UIRoot style={{ padding: 12 }}>
      <UISection title="${displayName}">
        <UICard>
          <p style={{ fontSize: 14, marginBottom: 12 }}>{message}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <UIButton label="Click me" variant="primary" onClick={() => setMessage("Button clicked!")} />${backendButton}
          </div>
        </UICard>
      </UISection>
    </UIRoot>
  );
}

export default defineReactInstrument({
  defaults: {
    visible: {
      sidebar: true,
      first: true,
    },
  },
  panels: {
    sidebar: SidebarPanel,
    first: MainPanel,
  },
});
`;
}

function backendFile(): string {
  return `import {
  defineBackend,
  type InstrumentBackendContext,
} from "tango-api/backend";

async function onStart(ctx: InstrumentBackendContext): Promise<void> {
  ctx.logger.info("Backend started");
}

async function onStop(): Promise<void> {
  // Clean up resources here
}

export default defineBackend({
  kind: "tango.instrument.backend.v2",
  onStart,
  onStop,
  actions: {
    hello: {
      input: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
      output: {
        type: "object",
        properties: {
          greeting: { type: "string" },
        },
        required: ["greeting"],
      },
      handler: async (
        _ctx: InstrumentBackendContext,
        input?: { name?: string },
      ) => {
        return { greeting: \`Hello, \${input?.name ?? "world"}!\` };
      },
    },
  },
});
`;
}

function tsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        noEmit: true,
        allowImportingTsExtensions: true,
      },
      include: ["src"],
    },
    null,
    2,
  );
}

function tangoEnvDts(): string {
  return `declare namespace TangoSettings {
  type Instrument = {
    [key: string]: unknown;
  };
}
`;
}

function gitignore(): string {
  return `node_modules/
dist/
bun.lock
bun.lockb
`;
}

function tangoJson(dirName: string): string {
  return JSON.stringify(
    { instruments: [{ path: "." }] },
    null,
    2,
  );
}

// ── Main ──

async function main() {
  console.log("");
  console.log("  \x1b[1m\x1b[35mtango-create\x1b[0m — Scaffold a new Tango instrument");
  console.log("");

  // Name
  const rawName = await ask("Instrument directory name", "my-instrument");
  const dirName = rawName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const id = dirName;

  // Display name
  const defaultDisplayName = dirName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const displayName = await ask("Display name", defaultDisplayName);

  // Sidebar label
  const label = await ask("Sidebar label", displayName);

  // Icon
  const icon = await choose("Sidebar icon:", ICONS, "puzzle");

  // Category
  const category = await choose("Category:", CATEGORIES, "utilities");

  // Backend
  const hasBackend = await confirm("Include backend?", true);

  console.log("");

  // Create directory
  const targetDir = resolve(process.cwd(), dirName);
  if (existsSync(targetDir)) {
    console.log(`  \x1b[31mError:\x1b[0m Directory "${dirName}" already exists.`);
    rl.close();
    process.exit(1);
  }

  console.log(`  Creating ${dirName}/...`);
  mkdirSync(join(targetDir, "src"), { recursive: true });

  // Write files
  const description = `A Tango instrument.`;

  writeFileSync(
    join(targetDir, "package.json"),
    packageJson({ name: dirName, id, displayName, description, category, icon, label, hasBackend }),
  );
  writeFileSync(join(targetDir, "src", "index.tsx"), frontendIndex(displayName, hasBackend));
  if (hasBackend) {
    writeFileSync(join(targetDir, "src", "backend.ts"), backendFile());
  }
  writeFileSync(join(targetDir, "tsconfig.json"), tsconfig());
  writeFileSync(join(targetDir, "tango-env.d.ts"), tangoEnvDts());
  writeFileSync(join(targetDir, ".gitignore"), gitignore());
  writeFileSync(join(targetDir, "tango.json"), tangoJson(dirName));

  console.log("  Installing dependencies...");

  // Install deps
  const install = Bun.spawn(["bun", "install"], {
    cwd: targetDir,
    stdout: "ignore",
    stderr: "pipe",
  });
  const installExit = await install.exited;
  if (installExit !== 0) {
    const stderr = await new Response(install.stderr).text();
    console.log(`  \x1b[33mWarning:\x1b[0m bun install exited with code ${installExit}`);
    if (stderr) console.log(`  ${stderr.trim()}`);
  }

  console.log("");
  console.log(`  \x1b[32m✓\x1b[0m Instrument created!`);
  console.log("");
  console.log("  Next steps:");
  console.log(`    cd ${dirName}`);
  console.log("    bun run dev");
  console.log("");
  console.log("  This will build your instrument and connect to a running Tango app.");
  console.log("  Make sure Tango is running on port 4243.");
  console.log("");

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

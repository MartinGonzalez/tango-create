#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";

const TEMPLATE_REPO = "https://github.com/MartinGonzalez/tango-instrument-template.git";
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

// ── CLI flags ──

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  const args = argv.slice(2); // skip bun + script path
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    // Boolean flags (no value or next arg is also a flag)
    if (key === "backend" || key === "no-backend") {
      flags[key] = true;
    } else if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

const flags = parseFlags(process.argv);

// ── Interactive prompt (skipped when flag provided) ──

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, fallback?: string, flagValue?: string): Promise<string> {
  if (flagValue !== undefined) return Promise.resolve(flagValue);
  const suffix = fallback ? ` (${fallback})` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || fallback || "");
    });
  });
}

function choose(question: string, options: readonly string[], fallback: string, flagValue?: string): Promise<string> {
  if (flagValue !== undefined) {
    // Validate the flag value is a valid option
    if (options.includes(flagValue as any)) return Promise.resolve(flagValue);
    console.log(`  \x1b[33mWarning:\x1b[0m "${flagValue}" is not a valid option. Using "${fallback}".`);
    return Promise.resolve(fallback);
  }
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

async function confirm(question: string, fallback = true, flagValue?: boolean): Promise<boolean> {
  if (flagValue !== undefined) return flagValue;
  const hint = fallback ? "Y/n" : "y/N";
  const answer = await ask(`${question} [${hint}]`);
  if (!answer) return fallback;
  return answer.toLowerCase().startsWith("y");
}

// ── Template processing ──

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "node_modules" || entry === ".git") continue;
      results.push(...walkFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function replaceVariables(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function stripConditionalBlocks(content: string, block: string): string {
  const singleLineRegex = new RegExp(
    `^[\\t ]*(?:\\/\\/|\\{/\\*) *\\{\\{#${block}\\}\\}.*$\\n([\\s\\S]*?)^[\\t ]*(?:\\/\\/|\\{/\\*) *\\{\\{/${block}\\}\\}.*$\\n?`,
    "gm",
  );
  let result = content.replace(singleLineRegex, "");

  const jsxRegex = new RegExp(
    `[\\t ]*\\{/\\* *\\{\\{#${block}\\}\\} *\\*/\\}\\s*\\n?([\\s\\S]*?)\\{/\\* *\\{\\{/${block}\\}\\} *\\*/\\}\\s*\\n?`,
    "g",
  );
  result = result.replace(jsxRegex, "");

  return result;
}

function stripConditionalMarkers(content: string): string {
  let result = content;
  result = result.replace(/^[\t ]*(?:\/\/|{\/\*) *\{\{#IF_BACKEND\}\}.*$\n?/gm, "");
  result = result.replace(/^[\t ]*(?:\/\/|{\/\*) *\{\{\/IF_BACKEND\}\}.*$\n?/gm, "");
  result = result.replace(/[\t ]*\{\/\* *\{\{#IF_BACKEND\}\} *\*\/\}\s*\n?/g, "");
  result = result.replace(/[\t ]*\{\/\* *\{\{\/IF_BACKEND\}\} *\*\/\}\s*\n?/g, "");
  return result;
}

function removeBackendFromPackageJson(targetDir: string): void {
  const pkgPath = join(targetDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  if (pkg.tango?.instrument?.backendEntrypoint) {
    delete pkg.tango.instrument.backendEntrypoint;
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

// ── Main ──

async function main() {
  const isNonInteractive = Object.keys(flags).length > 0;

  console.log("");
  console.log("  \x1b[1m\x1b[35mtango-create\x1b[0m — Scaffold a new Tango instrument");
  console.log("");

  // Name
  const rawName = await ask("Instrument directory name", "my-instrument", flags["name"] as string | undefined);
  const dirName = rawName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  // Display name
  const defaultDisplayName = dirName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const displayName = await ask("Display name", defaultDisplayName, flags["display-name"] as string | undefined);

  // Sidebar label
  const label = await ask("Sidebar label", displayName, flags["label"] as string | undefined);

  // Icon
  const icon = await choose("Sidebar icon:", ICONS, "puzzle", flags["icon"] as string | undefined);

  // Category
  const category = await choose("Category:", CATEGORIES, "utilities", flags["category"] as string | undefined);

  // Backend
  const backendFlag = flags["backend"] ? true : flags["no-backend"] ? false : undefined;
  const hasBackend = await confirm("Include backend?", true, backendFlag);

  console.log("");

  // Check target doesn't exist
  const targetDir = resolve(process.cwd(), dirName);
  if (existsSync(targetDir)) {
    console.log(`  \x1b[31mError:\x1b[0m Directory "${dirName}" already exists.`);
    rl.close();
    process.exit(1);
  }

  // Clone template
  console.log("  Cloning template...");
  const clone = Bun.spawn(["git", "clone", "--depth", "1", TEMPLATE_REPO, dirName], {
    cwd: resolve(process.cwd()),
    stdout: "ignore",
    stderr: "pipe",
  });
  const cloneExit = await clone.exited;
  if (cloneExit !== 0) {
    const stderr = await new Response(clone.stderr).text();
    console.log(`  \x1b[31mError:\x1b[0m Failed to clone template.`);
    if (stderr) console.log(`  ${stderr.trim()}`);
    rl.close();
    process.exit(1);
  }

  // Remove .git from clone
  rmSync(join(targetDir, ".git"), { recursive: true, force: true });

  // Template variables
  const vars: Record<string, string> = {
    INSTRUMENT_ID: dirName,
    DISPLAY_NAME: displayName,
    DESCRIPTION: "A Tango instrument.",
    CATEGORY: category,
    ICON: icon,
    SIDEBAR_LABEL: label,
    TANGO_API_TAG: TANGO_API_TAG,
  };

  // Process all files
  console.log("  Applying template variables...");
  const files = walkFiles(targetDir);
  for (const filePath of files) {
    let content = readFileSync(filePath, "utf-8");
    content = replaceVariables(content, vars);
    if (!hasBackend) {
      content = stripConditionalBlocks(content, "IF_BACKEND");
    } else {
      content = stripConditionalMarkers(content);
    }
    writeFileSync(filePath, content);
  }

  // Handle no-backend: remove backend file and strip from package.json
  if (!hasBackend) {
    const backendPath = join(targetDir, "src", "backend.ts");
    if (existsSync(backendPath)) {
      unlinkSync(backendPath);
    }
    removeBackendFromPackageJson(targetDir);
  }

  // Initialize fresh git repo
  console.log("  Initializing git repository...");
  const gitInit = Bun.spawn(["git", "init"], {
    cwd: targetDir,
    stdout: "ignore",
    stderr: "ignore",
  });
  await gitInit.exited;

  // Install dependencies
  console.log("  Installing dependencies...");
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

# tango-create

Scaffold a new [Tango](https://github.com/MartinGonzalez/tango-app) instrument in seconds.

## Usage

### Interactive (human)

```bash
bunx github:MartinGonzalez/tango-create
```

Prompts you for instrument name, display name, sidebar icon, category, and whether to include a backend.

### Non-interactive (AI / CI)

Pass all options as flags to skip prompts entirely:

```bash
bunx github:MartinGonzalez/tango-create \
  --name my-tool \
  --display-name "My Tool" \
  --label "My Tool" \
  --icon code \
  --category developer-tools \
  --backend
```

### Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--name` | Directory name (kebab-case) | `my-instrument` |
| `--display-name` | Human-readable name shown in Tango | Derived from name |
| `--label` | Text shown in the sidebar shortcut | Same as display name |
| `--icon` | Sidebar icon | `puzzle` |
| `--category` | Marketplace category | `utilities` |
| `--backend` | Include a backend entry point | yes |
| `--no-backend` | Skip backend | — |

### Available icons

`branch`, `play`, `post`, `puzzle`, `star`, `gear`, `chat`, `code`, `folder`, `search`, `terminal`, `lightning`, `globe`, `lock`, `heart`

### Available categories

`developer-tools`, `productivity`, `media`, `communication`, `finance`, `utilities`

## What it generates

```
my-instrument/
├── src/
│   ├── index.tsx        # Frontend (React + Tango UI components)
│   └── backend.ts       # Backend (if selected)
├── package.json         # Dependencies + tango.instrument manifest
├── tsconfig.json
├── tango-env.d.ts       # Generated types for settings
├── tango.json           # Source manifest for marketplace discovery
└── .gitignore
```

## After scaffolding

```bash
cd my-instrument
bun run dev
```

This builds your instrument and connects to a running Tango app on port 4243. Edits to `src/` hot-reload automatically.

## How it works

Clones the [tango-instrument-template](https://github.com/MartinGonzalez/tango-instrument-template) repo, replaces `{{PLACEHOLDER}}` variables with your choices, strips conditional blocks if backend is not selected, then runs `git init` and `bun install`.

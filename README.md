# Beeblio (local edition)

Beeblio is an AI research workspace. The Next.js UI and Eve agent run on your computer. A project links to an existing folder; Beeblio reads and edits its files in place.

## Requirements

- Node.js 24 and pnpm 11
- An OpenRouter API key and model ID
- Python 3 and any local analysis packages you want the agent to use
- LibreOffice for local previews of legacy Office documents

## Start

```bash
pnpm install
cp .env.example .env.local
# Add OPENROUTER_API_KEY and OPENROUTER_MODEL_ID to .env.local
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The single `pnpm dev` command applies SQLite migrations and starts both Next.js and Eve. It creates `.beeblio/beeblio.sqlite` and an internal service secret automatically. The Eve endpoint listens on `127.0.0.1:2000`.

Choose **Link Project Folder** and select any existing local folder. Beeblio records its absolute path in SQLite. It does not import, duplicate, or move the folder. Deleting a project from the dashboard only removes its listing; the folder remains on disk.

## Local services

- **Database:** SQLite in `.beeblio/beeblio.sqlite`; migrations live in `drizzle/`.
- **Files:** The selected folder is the source of truth. Browser uploads and downloads go through local Next.js routes.
- **Agent compute:** Eve runs shell commands and Python directly on your computer with the linked project folder as the working directory. It uses your installed packages and tools. No container or separate compute server is needed.
- **Document exports:** Markdown, DOCX, and LaTeX exports run locally. The PDF export option is removed; convert an exported DOCX to PDF with your local software if needed. Legacy Office previews use LibreOffice when installed.
- **External APIs:** OpenRouter is required for model calls. Google, Monid, Brave, and Crossref are optional and only needed for their respective features.

Local data is not automatically backed up. Back up project folders and `.beeblio/beeblio.sqlite` if you need to preserve both files and conversation history.

## Commands

```bash
pnpm typecheck
pnpm build
pnpm build:eve
pnpm db:migrate
```

The local launcher binds the UI and Eve to loopback addresses.

# Beeblio

Beeblio is a local AI research workspace. Its Next.js interface and Eve agent run on your computer, and each project points to an existing folder. Beeblio reads and edits that folder directly; linking a project does not copy or upload its files.

This is an early local-first release. It is intended for a single trusted user on one computer. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Please report security issues as described in [SECURITY.md](SECURITY.md).

## License

Beeblio is **source available** under the [PolyForm Noncommercial License 1.0.0](LICENSE.md). Personal and other noncommercial use is permitted; commercial use requires separate permission from the copyright holder. This is not an OSI-approved open-source license. Third-party dependencies retain their own licenses.

## Requirements

- Node.js 24 and pnpm 11
- An OpenRouter API key and model ID for the agent
- Bash and Python 3 for local agent commands and analysis
- Optional: LibreOffice (`soffice`) for previews of legacy Office files; other command-line tools and Python packages for the workflows you want to run

The folder picker uses macOS's native chooser. On other systems, enter an existing absolute folder path in the project form.

## Run locally

```bash
pnpm install
cp .env.example .env.local
# Set OPENROUTER_API_KEY and OPENROUTER_MODEL_ID in .env.local
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The root URL redirects to `/workspace`. `pnpm dev` creates `.beeblio/` if needed, applies SQLite migrations, and starts both the Next.js UI and the Eve agent. They listen on `127.0.0.1:3000` and `127.0.0.1:2000` respectively.

Choose **Link Project Folder** to select a folder. You can also paste its absolute path. Beeblio stores the resolved path in SQLite and works with the files in place. On linking, it adds any missing `1-References/`, `2-Data/`, `3-Analysis/`, and `4-Reports/` folders, plus `1-References/references.bib` and `3-Analysis/literature-matrix.matrix`. Existing files are preserved. Agent file tools display the folder as `/workspace`; agent shell commands run on your computer with that folder as the working directory. `$BEEBLIO_PROJECT_DIR` contains its absolute path.

## Configuration

The main agent needs `OPENROUTER_API_KEY`, `OPENROUTER_MODEL_ID`, and `OPENROUTER_MODEL_CONTEXT_WINDOW_TOKENS`. Set the context window to the token limit of the OpenRouter model you selected. Copy [`.env.example`](./.env.example) for all settings:

| Setting | Used for |
| --- | --- |
| `OPENROUTER_MODEL_ID_LITE` | Lightweight tasks such as conversation titles and sentence suggestions |
| `OPENROUTER_MODEL_ID_REVIEW` | Document review; falls back to the main model |
| `OPENROUTER_VISION_MODEL_ID` | Image analysis; falls back to the main model if it supports vision |
| `GOOGLE_API_KEY`, `GOOGLE_TRANSCRIPTION_MODEL_ID` | Google key and selected transcription model for audio transcription |
| `GOOGLE_KNOWLEDGE_EMBEDDING_MODEL_ID`, `GOOGLE_KNOWLEDGE_QUERY_MODEL_ID` | Selected Google models for creating and querying Knowledge stores |
| `MONID_API_KEY`, `BRAVE_SEARCH_API_KEY` | Optional research and web tools |
| `CROSSREF_MAILTO` | Contact address for scholarly metadata requests |

The application has one local user and no browser login, accounts, credits, billing, or entitlement checks. Keep the servers bound to loopback: the agent's Bash tool uses your computer's own environment and can access files outside a project folder through shell commands.

## Where data lives

- **Project files:** Your linked folders. Browser uploads, downloads, and agent file operations use local filesystem routes.
- **Application data:** `.beeblio/beeblio.sqlite` stores projects, conversation state, knowledge metadata, and share records. Schema migrations are in [`drizzle/`](./drizzle/).
- **Internal secret:** `.beeblio/agent-secret` is generated automatically for the local UI-to-agent connection.
- **Agent compute:** Eve runs Bash and Python on the host. No Docker image, Blaxel job, compute server, or separate database server is required. The bundled `beeblio_research` Python helper is available to agent commands; other Python packages come from your local environment.

Beeblio still calls external model and research APIs when those features are used. Back up both your project folders and `.beeblio/` if you need to preserve files and conversation history.

## Documents

The Markdown editor can export DOCX, DOCX with Mendeley or Zotero citations, LaTeX, and portable Markdown. Direct PDF export and its Gotenberg service have been removed. To make a PDF, export DOCX and convert it with your local document software. Legacy Office previews use local LibreOffice when available.

## Development commands

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm build:eve
pnpm db:migrate
```

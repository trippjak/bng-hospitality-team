# Knowledge Graph and Rulings

Integrate persistent memory cleanly across **Basic Memory** (`~/code/ontologies/`), **Notion**, and repository Doc-system v3 ledgers.

## Basic Memory (`basic-memory` MCP)

- Active graphs under `~/code/ontologies/`: `jake`, `launch-fulfillment`, `rocketfuel-recharge`, `launch-uk`, `launch-family`.
- Read target brand ontology (`Design System.md`, `Site Architecture.md`, `Ubiquitous Language.md`, `Known Doc Conflicts.md`) and `jake/toolchain/Antigravity UX-UI Studio.md` at project start.
- **Privacy invariant:** `ontologies` repositories are ingest-safe by construction. Store confidential prospect intel, career notes, and unpublished commercial/pricing models only in local private auto-memory (`[excluded]` markers prevent backfilling).
- **Windows CLI reindex gotcha:** Pass flags after subcommands with UTF-8 forced:
  ```powershell
  $env:PYTHONIOENCODING='utf-8'; $env:PYTHONUTF8='1'
  uvx basic-memory reindex -p <project> --full
  ```

## Notion vs. Immutable Repo Rulings (`D-NNN`)

- Use Notion MCP (`notion-search`, `notion-fetch`, `notion-spec-to-implementation`) when reading PRDs or publishing operator briefs.
- Record durable architectural or UX governance trade-offs locally inside the target repository as Doc-system v3 **`D-NNN` Rulings** (`coordination/decisions/d/D-NNN.md`), keeping `GLOSSARY.md` focused purely on "what it IS" domain definitions without implementation leakage.

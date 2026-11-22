# Model Seat Routing

Use flat-rate subscriptions only; route external CLI **Model Seats** exclusively through [seat-dispatch.mjs](../scripts/seat-dispatch.mjs). A **Model Seat** is strictly an execution channel for authoring or running a **Gate Subagent**, never an independent third reviewer taxonomy.

## Seat Matrix

| Task profile | Preferred **Model Seat** | Invocation / Mode | Fallback when blocked |
|---|---|---|---|
| Studio orchestration & Evidence Packet synthesis | `antigravity-native` | `gemini-4-carbon-high` (or `argon`) | Host default native model |
| UI Ratchet triage and repairs | `codex-cli` | `--model gpt-6.2-astra --cwd <project>`, read-only for triage and `--sandbox workspace-write` for authorized repairs (see [UI Ratchet](../../ui-ratchet/SKILL.md)) | Report a blocked lead |
| Aesthetic/frontend UI authoring (`ux-ui-team` lead) | `antigravity-native` | `gemini-4-argon-high` | `claude-sonnet-5-5-high` native |
| `ux-copywriter` **Specialist Subagent** (`Copy` authoring/tightening) | `antigravity-native` or `claude-cli` / `codex-cli` | `invoke_subagent("ux-copywriter")` or `seat-dispatch.mjs --seat claude-cli --agent ux-copywriter --target <dir> [--image ...]` | Native `ux-copywriter` (`claude-sonnet-5-5-high` / `gemini-4-argon-high`) |
| `no-vibe-code` **Gate Subagent** (brand intent & vibe tells) | `antigravity-native` or `claude-cli` | `invoke_subagent("no-vibe-code")` or `seat-dispatch.mjs --seat claude-cli --gate no-vibe-code (--target <dir> \| --evidence-file <packet.json>) --image ...` | Switch between `antigravity-native` (`Claude 5.5`) and `claude-cli` |
| `ux-ui-qa` **Gate Subagent** (Laws of UX, WCAG 2.2 AA, geometry) | `antigravity-native` or `codex-cli` | `invoke_subagent("ux-ui-qa")` or `seat-dispatch.mjs --seat codex-cli --gate ux-ui-qa (--target <dir> \| --evidence-file <packet.json>) --image ...` | `antigravity-native` fresh `ux-ui-qa` subagent |
| Site-wide **Veto Lenses** (`Compass`, `Iris`, `Atlas`) | `team-meeting` skill (`my-skills`) | Landmark cutovers only (route launch, domain flip, sprint close) | N/A (not used inside per-screen UI loops) |

## Subscription Gotchas and Multimodal Gate Dispatch

- **Ambient API keys override OAuth:** Windows `HKCU:\Environment` contains `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. Always use `seat-dispatch.mjs`, which strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and `OPENAI_API_KEY` from child environments by default (`D-002`).
- **Never pass `--bare` to `claude`:** Claude Code `--bare` skips OAuth keychain reads and forces `ANTHROPIC_API_KEY`.
- **Single-command subagent CLI dispatch (`--gate` / `--agent`):** Passing `--gate <no-vibe-code|ux-ui-qa>` or `--agent ux-copywriter` strips YAML frontmatter from `plugin/agents/<name>.md`, attaches either a complete Host Evidence Packet via `--evidence-file <packet.json>` (Stage 3, containing static + DOM probe metrics + states) or static `--target <dir>` `--evidence` JSON (Mode A), and delivers desktop/mobile captures (`--image desktop.png --image mobile.png`) over `$0` OAuth (`codex exec -i` on Codex; `--tools Read` without `--permission-mode plan` on Claude).
- **Self-contained text-only audits use `--no-tools`:** For text-only critiques with inline code/evidence, pass `--no-tools` (`--tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}'`) so `claude-cli` omits `--permission-mode plan` and skips 51k-token MCP schemas.
- **No silent fallback (`ux-ui-team` compliance):** When `seat-dispatch.mjs --seat claude-cli` returns exit code `2` (`blocked_oauth_missing`), record the gap cleanly, surface `Remove-Item Env:ANTHROPIC_API_KEY; claude auth login` to the operator if external `Claude Fable 5.2` is needed, and explicitly switch to `antigravity-native` (`Claude Opus 5.5` / `Sonnet 5.5`).
- **Prompt transport:** Supply prompts via `stdin` (`--prompt-file`, `--prompt`, or `--gate`) so Windows `cmd.exe` quoting never alters multiline briefs.

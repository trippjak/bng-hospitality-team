# Bundled sources

- trippjak/my-skills at 266535d1c05ae9109f903f058cb2de26279bef1e: blind-code-review, bounded-qa, brand-design-audit, fact-checker, ratchet-review, section-close, session-open, supabase-postgres-best-practices, team-meeting, ui-ratchet, ux-ui-team, web-perf, workers-best-practices.
- trippjak/ux-ui-studio at f9ec5491fb132c8f098b079c3f38b5427b711645: ux-ui-studio, paper-canvas, and the three Studio agent definitions. Shared ui-ratchet resolves to the my-skills copy.
- Matt Pocock 1.3.1 installed distribution: code-review, diagnosing-bugs, domain-modeling, research, grilling, codebase-design, tdd, prototype, pr, wizard, writing-for-agents, improve-codebase-architecture. License included.

Bundled files retain upstream examples and references to project-specific tools. Use local skill entry points in preference to any upstream installation path. Optional external apps and provider accounts are operator supplied.

TypeScript compiler API 5.9.3 ships under node_modules/typescript with its notices. The UI loader prefers this compiler before upstream machine-specific fallbacks. The 4D and blind review loaders resolve the same copy through normal Node module resolution.

Windows portability: the 4D analyzer and blind-review masker try the Windows Python launcher first so a Microsoft Store python3 alias cannot intercept a valid Python installation.

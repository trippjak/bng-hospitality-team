# Install the BNG Hospitality team

## 1. Install the plugin and configure the project

1. In Perplexity Computer, open **Plugins → Add custom → Upload plugin or skill**. Select the original BNG ZIP. On its plugin page, check that 28 skills including bng-team, ratchet-review, ui-ratchet and ux-ui-studio are listed. Look for the Basic Memory connector if you intend to use the live cloud graph. An organization administrator may need to allow it. [Perplexity upload instructions](https://www.perplexity.ai/help-center/en/articles/2026100802-create-or-upload-a-custom-plugin)
2. Extract a separate copy of the ZIP to access the setup files. In the BNG project's settings, paste the contents of PROJECT-INSTRUCTIONS.md into its instructions. Fill in the verified platform repository and approved policy source. Complete the ontology settings in step 2 below.
3. Connect GitHub for the BNG platform repository. The skill procedures, scripts, references, and Studio gate definitions are bundled. For filesystem execution, extract the entire ZIP and run scripts from their owning skill directories. Install the project’s normal test/build dependencies. The TypeScript parser is included. Python, browser tooling, authenticated model seats, design services, and preview infrastructure are runtime prerequisites on the branches that use them.
4. In **Teammates → + Create teammate**, enter the role name and paste the matching prompt from skills/bng-team/references/teammates/ into **Advanced**. Create the teammate and use it in the BNG project. Start with Project Host and Domain & Evidence Analyst. Create the other roles as needed. Confirm each can see the project instructions and bng-team and its assigned procedures. ROLE-SETUP.md lists per-role tools and inputs. [Perplexity teammate setup](https://www.perplexity.ai/help-center/en/articles/2026102601-perplexity-teammates)

## 2. Connect the BNG ontology

Choose the route that matches where the authoritative BNG notes already live.

**Basic Memory Cloud, live graph**

1. Open the Basic Memory web app with the BNG-authorized account. Select the correct workspace and locate the BNG project. Identify an index note, a sourced domain note, and one related note. Record their exact titles and the expected relationship for the verification below. If a new project needs to be initialized, obtain the owner's approved BNG source and import the approved notes in the intended workspace before continuing. [Basic Memory web app](https://docs.basicmemory.com/cloud/web-app)
2. Open the installed plugin in Perplexity and connect **basic-memory**. Complete authorization with the same BNG-authorized account. The package specifies the hosted HTTPS endpoint at `https://cloud.basicmemory.com/mcp`. If the connector was skipped during import, have the workspace administrator enable the existing connector or add an approved remote connector using this URL and Streamable HTTP, then connect the account. [Cloud connection](https://docs.basicmemory.com/cloud/routing)
3. Open the BNG project's connector settings and select the authorized account. In a fresh BNG task ask: “Use Basic Memory list_memory_projects. Return the name and ID of the BNG project in the intended workspace. If ambiguous, show the matching BNG entries and stop.” Match the result to the project you inspected. Set ONTOLOGY_PROJECT to its verified ID, or its confirmed unique name if the installed server uses names.
4. Ask: “Using that exact project on every call, search_notes for the index by title, then read_note using its returned identifier. Return the index permalink and one linked concept.” Match the contents against the index you inspected. Save that permalink as ONTOLOGY_INDEX in project instructions. Use project_id for an ID and project for a name according to the server's tool schema. [Basic Memory MCP reference](https://docs.basicmemory.com/reference/mcp-tools-reference)

**Windows local Basic Memory, project-file snapshot**

1. On the machine that owns the notes, run `bm project list`. Identify the BNG project and inspect it with `bm project info "<confirmed-name>"`. If approved notes already exist in a dedicated folder but have no project registration, register that folder with `bm project add "<chosen-name>" "<absolute-folder>"`. Verify the index, one sourced concept and a linked note locally. [Basic Memory CLI](https://docs.basicmemory.com/local/cli-basics)
2. Copy the approved BNG index and relevant Markdown notes, preserving folder structure, into a dated folder such as `bng-wiki/YYYY-MM-DD/`. Add a small source note recording the Basic Memory project name, export date, and index path. Upload the folder to the BNG project's files. Set ONTOLOGY_PROJECT, ONTOLOGY_INDEX and WIKI_SNAPSHOT to those verified values. Mark the mode **snapshot**. Keep the local graph authoritative and refresh the export after approved changes.
3. For live hosted access to a local-only ontology, first provision an owner-approved remote BNG project containing the approved notes, then follow the cloud steps. Connecting the packaged endpoint alone does not copy Windows files.

## 3. Verify from two teammates

Choose a real concept and relationship you already checked in the source. Substitute their actual values in this prompt and send it to Domain & Evidence in a fresh BNG task.

> Retrieve <known term> from our configured BNG ontology. In live mode, search within the configured project, read the exact matching note, traverse its links using build_context, and read the target of <known relation>. In snapshot mode, open the index, concept and linked Markdown file. Return the access mode, project identity, concept permalink or file, definition, applicable property/platform scope, related concept, and underlying policy or repo source. List the actual tool calls or files opened. If a value is missing, identify the gap.

1. Compare the output with the original notes. **Live pass** requires observed connector calls, the correct project on each scoped call, the expected relationship and matching source. **Snapshot pass** requires the correct dated export and readable linked files. If an older relation is missing in build_context, widen its timeframe to include the notes' dates and retry.
2. Give the same term to a consuming teammate, such as Interaction Designer, in a fresh task without supplying the analyst's answer. Ask which rule applies to the relevant screen and request the same provenance. Pass when both retrieve the same scoped definition and authority.
3. Ask for a deliberately absent term, such as BNG-ONTOLOGY-ABSENT-TEST-9471. Expect an unresolved term and a handoff to Domain & Evidence. If either teammate answers from generic knowledge, correct project scope or project-file visibility and repeat.
4. Record the date, access mode, resolved BNG project, note and related-note identifiers, source, and results in the project handoff. If project discovery works but reads are empty, verify the workspace/account and index contents. If the live tool is absent, report the live check as unverified and use the approved snapshot route.

## Verify an extracted installation

From the extracted plugin root, run these commands with Node available. Install Python 3 for Python-language checks.

```text
node skills/ratchet-review/scripts/measure_4d.mjs --selftest
node skills/ui-ratchet/scripts/measure-ui-ratchet.mjs --selftest
node skills/ui-ratchet/scripts/measure-ui-ratchet.mjs --print-dom-probe
node skills/ux-ui-studio/scripts/seat-dispatch.mjs --help
```

For an existing 1.0.0 install, open the plugin page, select More actions → Replace file, and select this ZIP. Update project instructions and replace each saved role prompt from the corresponding teammate file; the 2.0.0 routing skill is bng-team.

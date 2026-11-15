# @webship.co/workspace-rag

The **RAG** workspace of the [Webship Workspace](https://github.com/webship/workspace) dashboard:
the `rag/` folder (type `sites`), its settings file (`core/config/workspace.rag.settings.yml`),
its commands and its docs, as a plugin.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-rag
bash core/scripts/plugins.sh --activate rag --with-needs     # puts `rag` on the workspaces list of settings.yml
bash core/scripts/plugins.sh --install rag      # the folder, its settings file (once), its commands, its docs (once)
```

The settings file and the docs are placed once and never overwritten: they hold what you put there.
`--deactivate` takes the workspace off the list; the folder and its content stay.

## What it needs

The AI items land in the four AI folders, so the manifest needs them (`needs`): `ai-agents`, `ai-skills`, `ai-commands`, `ai-prompts`. `--activate rag` and `--install rag` stop while one is missing and name it; with `--with-needs` they are required, activated and installed first.

## The AI items

The plugin carries its own AI items (`ai/` in the package, the manifest's `ai` block), written for the work this folder is for. `--install` places each one in the workspace folder of its kind, when that folder is an active workspace folder; `--uninstall` removes them, and keeps one that was edited in its folder.

| Item | Kind | Lands in | What it is for |
| --- | --- | --- | --- |
| `rag-index-keeper` | Agent | `ai-agents/rag-index-keeper.md` | Runs the Milvus instance of `rag/` and works with the project indexes in it: list, describe, search, bind, back up, make it known to an AI CLI; never drops an index or rebuilds an instance unasked |
| `rag-workflow` | Skill | `ai-skills/rag-workflow/` | How work is done in `rag/`: look, build, index from the project's folder, search, back up; every command with its flags, the `milvus` and `rag` settings keys |
| `/rag-search` | Command | `ai-commands/rag-search.md` | `/rag-search <workspace>/<project> <question>`: checks the index is there, searches it and answers from the passages, each with its file |
| `rag-start-and-search` | Prompt | `ai-prompts/rag-start-and-search.md` | A new session that starts the vector database, says what is indexed and searches one project's index |

From its folder an item is installed into the AI CLI (Claude Code by default) like any other: the folder's page on the dashboard, or `bash cmd-tools-ai-items.sh <name> --install` in the AI folder (`--to dev/<project>` for one project). A prompt is not installed: the New screen form lists it as the start of a new session. The body of every item is plain Markdown any AI CLI can follow; Claude Code is the default shape (the frontmatter, the launch line of a prompt). Every command, flag, settings key and path an item names is checked by `tests/items.test.ts`; the shape of the items is the one of the reference, [`docs/plugin-items-pattern.md` of the WordPress plugin](https://github.com/webship/workspace-wordpress/blob/1.0.x/docs/plugin-items-pattern.md).

## The commands

| Command |
| --- |
| `cmd-milvus-backup.sh` |
| `cmd-milvus-mcp.sh` |
| `cmd-milvus-project.sh` |
| `cmd-tools-rag.sh` |
| `cmd-tools-reclaim.sh` |

The bash functions these commands call live in the dashboard's `core/scripts/functions`.

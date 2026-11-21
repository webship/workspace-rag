# @webship.co/workspace-rag

The **RAG** workspace of the [Webship Workspace](https://github.com/webship/workspace) dashboard:
the `rag/` folder (type `sites`), its settings file (`core/config/workspace.rag.settings.yml`),
its commands and its docs, as a plugin; the index builder, `cmd-tools-ragify.sh`, placed in every sites and
code folder so a project is indexed from its own folder; and the RAG menu on every project row of those folders.

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

## Index a project

`--install` also places the index builder, `cmd-tools-ragify.sh`, in every sites and code folder of the
workspace (dev, test, products, modules, …), the way the graph plugin places its graph builder. A
project is indexed from its own folder, into the Milvus instance of `rag/`:

```bash
cd ~/workspace/rag && bash cmd-milvus-project.sh                      # once: the vector database, as a container project
cd ~/workspace/<workspace> && bash cmd-tools-ragify.sh <project>      # build the index, or rebuild it
cd ~/workspace/<workspace> && bash cmd-tools-ragify.sh <project> --query "where is the front page built"
```

| Flag | What it does |
| --- | --- |
| `--scope` | `custom` (the project's own code), `contrib` (with the contrib modules, themes and profiles: the default) or `all` |
| `--all` | The same as `--scope all`: nothing is left out |
| `--exclude` | More paths to leave out, on top of the scope's |
| `--append` | Add to the index instead of rebuilding it |
| `--embedding` | `bm25`, matched by words inside Milvus (the default: no model, nothing leaves the machine), or `openai`, which also sends every chunk to the OpenAI API |
| `--milvus-instance` | Index into another server of `rag/`, remembered in `rag/bindings.yml`; `default` unbinds |
| `--query`, `--limit` | Ask the index a question instead of building it, and how many passages come back |

The builder is the core's (`ragify_project`, in `core/scripts/functions/fun-ragify.sh`, with its argument
file). What the plugin adds is `scripts/functions/fun-rag-builder.sh`, placed in
`core/scripts/plugins/rag/functions/`: the scope a build leaves out when the graph plugin is not
installed (the same three layers), and a record of each index it built,
`rag/.indexes/<workspace>/<project>.json` (the collection, the server, the scope, the retrieval and
when). The index itself is the collection in Milvus; the record is in the rag folder and never in the
project, since a repository must not gain a file because somebody indexed it. The builder runs the
indexer with `uv run`, so the machine that runs it needs `uv` (the dashboard's container has it).

## The RAG menu of a project row

Every project row of a folder the builder is in carries a **RAG** button, after Graph: the rows of `rag/`
itself are its servers and carry none. Beside the button, the state of the project's index: `built 2 h ago`
(when it was last built), `none`, or `building…` while its build runs; the button's name says it too, for a
screen reader, and its tooltip gives the date and the server. The menu, loaded when it opens:

| Entry | What it does |
| --- | --- |
| **Build the index** / **Rebuild the index** | Runs `cmd-tools-ragify.sh <project>` in a screen session: a notice links to it in Screens, and the row says `built just now` once it is done. Disabled, and saying why, while the server is not running |
| **Follow the build in Screens** | In place of the one above while the build runs |
| **Search the index…** | A dialog with a search field: the passages that match, best first, each with its file and lines (BM25, on this machine) |
| **Describe the index** | A dialog: the collection, the server, when and at which scope it was built, how many passages, the retrieval, the fields, and the command that rebuilds it |
| **Open the RAG workspace** | The `rag/` page, where the servers are built, started and stopped (**Start it in the RAG workspace** while the server is down) |
| **Remove the index** | After the confirm dialog: drops the project's collection and its record; the project is untouched |

The state comes from what the server says (its collections, asked once a page and kept a few seconds) and,
until it has answered or while it is down, from the record the builder left. A record of an index the server
no longer has is dropped when the menu opens. The dashboard reaches a server over its REST API: from its DDEV
container by the server's container name, from a dashboard run on the machine by the port the server publishes
there (`milvus.grpc_port`, or the one the build found free); with `milvus.authorization` on, with the token.

The menu is drawn by the plugin in the dashboard's `rag` slot, which a dashboard gives the plugin once it has
registered it (webship/workspace#570). On an older dashboard the core's own RAG menu shows in that slot, now
that the builder is there.

## The commands

| Command | Where it lands |
| --- | --- |
| `cmd-milvus-backup.sh` | `rag/` |
| `cmd-milvus-mcp.sh` | `rag/` |
| `cmd-milvus-project.sh` | `rag/` |
| `cmd-tools-rag.sh` | `rag/` |
| `cmd-tools-reclaim.sh` | `rag/` |
| `cmd-tools-ragify.sh` | every sites and code folder |

The bash functions these commands call live in the dashboard's `core/scripts/functions`, and the
plugin's own in `core/scripts/plugins/rag/functions/`.

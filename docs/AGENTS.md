# RAG

The Milvus vector database, and the per-project RAG indexes held in it.

Part of the **Webship Workspace** (`~/workspace`), a container-based harness (DDEV by default). The rules in the root
`CLAUDE.md` apply here too; what follows is what is specific to this folder.

## What lives here

A Milvus instance is a DDEV project like any other — start and stop it from its row. The indexes
themselves live inside Milvus, not on disk; `bindings.yml` records which instance holds which
project's index.

**Index a project from its own workspace, never from here.** The RAG plugin places
`cmd-tools-ragify.sh` in every sites and code folder:

```bash
cd ~/workspace/dev && bash cmd-tools-ragify.sh <project>                              # build or rebuild
cd ~/workspace/dev && bash cmd-tools-ragify.sh <project> --query "where is it configured"
```

Each build leaves a record here, `.indexes/<workspace>/<project>.json`: the collection, the server,
the scope, the retrieval and when. The index is in Milvus. On the dashboard, the RAG menu of a project's
row builds or rebuilds it (in a screen session), searches it, describes it and removes it.

Retrieval is BM25 by default: the database builds the vectors itself, so no model runs and nothing
leaves this machine.

## The rule that matters here

Everything goes through DDEV. Never a host `composer`, `drush` or `mysql`:

```bash
ddev composer require drupal/something
ddev drush cr
ddev export-db --file=…        # not mysqldump
ddev delete -y -O              # not a dropped database
```

`ddev start` takes `-y`; **`ddev stop` does not**. Never write a `$databases` block into
`settings.php` — DDEV's `settings.ddev.php` owns the connection.

## Commands here

```bash
bash cmd-milvus-backup.sh                             # Milvus (backup)
bash cmd-milvus-mcp.sh                                # Milvus (mcp)
bash cmd-milvus-project.sh                            # Milvus (vector database for RAG)
bash cmd-tools-rag.sh                                 # RAG indexes (list, search, serve over MCP)
```

Every one locates the workspace from its own path, so there is nothing to export and nothing to
install. `--help` on any of them lists its arguments.

## AI items for this folder

The plugin of this folder (`@webship.co/workspace-rag`) places its own AI items in the AI folders of the
workspace, when they are active:

- `rag-index-keeper` (`ai-agents/`): Runs the Milvus instance of `rag/` and works with the project indexes in it: list, describe, search, bind, back up, make it known to an AI CLI; never drops an index or rebuilds an instance unasked
- `rag-workflow` (`ai-skills/`): How work is done in `rag/`: look, build, index from the project's folder, search, back up; every command with its flags, the `milvus` and `rag` settings keys
- `/rag-search` (`ai-commands/`): `/rag-search <workspace>/<project> <question>`: checks the index is there, searches it and answers from the passages, each with its file
- `rag-start-and-search` (`ai-prompts/`): A new session that starts the vector database, says what is indexed and searches one project's index

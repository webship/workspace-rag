# @webship.co/workspace-rag

The **RAG** workspace of the [Webship Workspace](https://github.com/webship/workspace) dashboard:
the `rag/` folder (type `sites`), its settings file (`core/config/workspace.rag.settings.yml`),
its commands and its docs, as a plugin.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-rag
bash core/scripts/plugins.sh --activate rag     # puts `rag` on the workspaces list of settings.yml
bash core/scripts/plugins.sh --install rag      # the folder, its settings file (once), its commands, its docs (once)
```

The settings file and the docs are placed once and never overwritten: they hold what you put there.
`--deactivate` takes the workspace off the list; the folder and its content stay.

## The commands

| Command |
| --- |
| `cmd-milvus-backup.sh` |
| `cmd-milvus-mcp.sh` |
| `cmd-milvus-project.sh` |
| `cmd-tools-rag.sh` |
| `cmd-tools-reclaim.sh` |

The bash functions these commands call live in the dashboard's `core/scripts/functions`.

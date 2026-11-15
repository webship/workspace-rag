---
name: rag-workflow
description: How work is done in the `rag/` folder of the Webship Workspace — how the Milvus instance is built, backed up and made known to an AI CLI, how the per-project indexes are listed, described, searched, bound and removed with `cmd-tools-rag.sh`, with the flags of each command and the settings keys of the folder (the `milvus` and `rag` blocks). Use when asked to "start the vector database", "search this project's index", "which projects are indexed", "back up Milvus", or when a command of `rag/` is about to be run.
argument-hint: '[what you are about to do in rag]'
---

# rag-workflow

`~/workspace/rag` is the RAG folder of a Webship Workspace (container-based, DDEV by default).
RAG is the Milvus vector database, and the per-project indexes held in it: an instance is a container project, and the indexes live inside it, not on disk. It comes with the RAG plugin (`@webship.co/workspace-rag`), which places the commands below in the folder. Every command finds the workspace from its own path; run it from the folder, and read `bash <command> --help` before quoting a flag.

## The order of work

1. **Look at what runs**: `bash cmd-tools-rag.sh --rag-action status`, and
   `bash cmd-tools-rag.sh --rag-action servers`.
2. **Build** an instance when there is none: `bash cmd-milvus-project.sh`.
3. **Index a project from its own folder**, with that folder's indexing tool; then
   `bash cmd-tools-rag.sh` lists it here.
4. **Search**: `bash cmd-tools-rag.sh dev/mysite --rag-action search --query "the question"`.
5. **Back up** before a change: `bash cmd-milvus-backup.sh`. Never `--force` an instance that
   holds indexes.

## Builders

| Builder | Builds | Flags |
| --- | --- | --- |
| `cmd-milvus-project.sh` | A Milvus instance with its web UI, as a container project; with no name, the one `milvus.project` names | `--attu-version` `--authorization` `--force` `--grpc-port` `--launch` `--milvus-version` `--public-uri` |

## Commands

| Command | What it does | Flags |
| --- | --- | --- |
| `cmd-milvus-backup.sh` | Backs up a Milvus instance (its metadata, its segments, its list of collections): `[instance]` | none |
| `cmd-milvus-mcp.sh` | Makes the whole database known to the AI CLI of this machine: `--mcp-action` is `status` (the default), `register`, `unregister` or `serve` | `--mcp-action` |
| `cmd-tools-rag.sh` | The project indexes: `[index]`, and `--rag-action` is `list` (the default), `info`, `search`, `remove`, `servers`, `bind`, `status`, `mcp-register`, `mcp-unregister` or `serve` | `--limit` `--milvus-project` `--query` `--rag-action` |
| `cmd-tools-reclaim.sh` | Disk held by projects whose folder is gone: a dry run unless `--apply` | `--apply` `--keep-days` `--list-protected` `--only` |

## Settings

| Key | File | What it says |
| --- | --- | --- |
| `doc.name` | `core/config/workspace.rag.settings.yml` | The folder under the workspace root: `rag` |
| `type` | `core/config/workspace.rag.settings.yml` | `sites`: the rows of the page are built sites, with the Build, Tests, Checks, Users, Backup and Remove actions |
| `milvus.project` | `core/config/workspace.rag.settings.yml` | The name of the instance the commands take when none is given: `milvus` |
| `milvus.version`, `milvus.attu_version`, `milvus.grpc_port`, `milvus.public_uri` | `core/config/workspace.rag.settings.yml` | The releases of the database and of its web UI, the port it is published on, and the address the web UI answers at |
| `milvus.authorization` | `core/config/workspace.rag.settings.yml` | Authentication of the database: off, this being a local one |
| `rag.embedding` | `core/config/workspace.rag.settings.yml` | How passages are matched: `bm25`, by words, with no model called |
| `rag.collection_prefix` | `core/config/workspace.rag.settings.yml` | What the name of an index's collection starts with |
| `rag.chunk_lines`, `rag.chunk_overlap`, `rag.max_file_kb` | `core/config/workspace.rag.settings.yml` | How a file is cut into passages, and the largest file that is read |
| `presentation.noun`, `presentation.kind`, `presentation.also_files` | `core/config/workspace.rag.settings.yml` | How the page reads: one item is an `instance`, laid out as projects with files beside them |
| `assistant.name`, `assistant.placeholder` | `core/config/workspace.rag.settings.yml` | What the assistant is called on this page; `default` takes the workspace's |
| `workspaces` | `core/config/settings.yml` | The active folders; `rag` is on it once the plugin is activated |

## Rules

- **`--force` deletes every index.** It rebuilds the instance and removes its volumes: never add
  it unasked, and back the instance up first (`bash cmd-milvus-backup.sh`).
- **`--rag-action remove` drops an index**: only when asked, and say which one first.
- **Search before you answer.** A passage that came back is quoted with the file it is from; when
  nothing comes back, say so, do not answer from memory as if it had.
- **Nothing leaves the machine by default.** Retrieval is BM25 (`rag.embedding`): the database
  builds the vectors itself and no model is called. Do not switch it unasked.
- **Never print the token** of an instance.
- **Containers only** (DDEV by default): the database runs in its own container project.
- `bash cmd-tools-reclaim.sh` is a report until `--apply` is added: never add it unasked.

The RAG plugin places these beside this one, each in the workspace folder of its kind: the agent `rag-index-keeper` (`ai-agents/`), the command `/rag-search` (`ai-commands/`) and the prompt `rag-start-and-search` (`ai-prompts/`).

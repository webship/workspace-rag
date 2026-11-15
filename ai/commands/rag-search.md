---
description: Search the index of a project in the Milvus instance of the rag/ folder of the Webship Workspace with cmd-tools-rag.sh, and answer from the passages that come back, each with the file it is from.
argument-hint: '<workspace>/<project> <question>'
---

# /rag-search

Search a project's index in `~/workspace/rag` from: `$ARGUMENTS`

The arguments are the text typed after the command: the first word is the index, as
`<workspace>/<project>` or the project alone, and what follows is the question. With no index
or no question, stop and ask for what is missing. The workspace is container-based (DDEV by
default): the database runs in its own container project, and by default no model is called.

## 1. Make sure the index is there

```bash
cd ~/workspace/rag
bash cmd-tools-rag.sh --rag-action status
bash cmd-tools-rag.sh
```

If the database is not up, say so and stop (`ddev start -y` in the instance's folder starts
it; ask first). If the project has no index, say so: it is indexed from its own folder, not
from here.

## 2. Search

```bash
bash cmd-tools-rag.sh <index> --rag-action search --query "<question>"
bash cmd-tools-rag.sh <index> --rag-action search --query "<question>" --limit 10
```

Use the second form when the first passages do not answer the question. Retrieval matches
words: ask again with the words the project itself would use.

## 3. Answer from what came back

Answer the question from the passages only, and name the file each part comes from. When the
passages do not answer it, say that, and say what was searched for. Never answer from memory
as if the index had said it. For the instance itself, hand over to the `rag-index-keeper`
agent; the `rag-workflow` skill has every action.

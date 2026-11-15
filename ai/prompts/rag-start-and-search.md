Start the vector database of the rag folder, say which projects are indexed in it, and search one.

The launch line is for Claude Code, the default; the text between the triple quotes can be given to another AI CLI as it is.

```
claude --permission-mode bypassPermissions """
Start the vector database of the rag folder and search the index of <workspace>/<project> for: <question>
# ~/workspace/rag · a Milvus instance as a container project · container-based (DDEV by default)
# never --force (it deletes every index) and never --rag-action remove in this session
# retrieval is by words, on this machine: no model is called and nothing leaves it

1. bash cmd-tools-rag.sh --rag-action status
   tell me whether the database is up
2. if no instance is there: bash cmd-milvus-project.sh --help, then bash cmd-milvus-project.sh
   tell me the address of its web UI
3. bash cmd-tools-rag.sh
   tell me which projects are indexed; if <workspace>/<project> is not, say so and stop:
   a project is indexed from its own folder
4. bash cmd-tools-rag.sh <workspace>/<project> --rag-action info
5. bash cmd-tools-rag.sh <workspace>/<project> --rag-action search --query "<question>"

Answer the question from the passages that came back, with the file each part is from.
If they do not answer it, say so and tell me what you searched for.
"""
```

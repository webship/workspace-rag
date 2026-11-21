#!/usr/bin/env bash

# workspace-name: RAG index (build or ask)

# Index a project of this workspace into the Milvus vector database held in ~/workspace/rag, or ask
# its index a question. Placed in every sites and code folder by the RAG plugin.
#
# The RAG counterpart of cmd-tools-graphify.sh: graphify parses the CODE into a graph and reads no
# Markdown, Twig, *.module hooks or Drupal wiring YAML; this indexes the text of exactly those and
# retrieves passages from them. The default retrieval is BM25 inside Milvus: no model, no key,
# nothing leaves the machine.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings and extra lists.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

ARGPARSE_DESCRIPTION="Build or query the Milvus RAG index of a project in the __WORKSPACE__ workspace"
source ${WORKSPACE_SCRIPTS}/args/arg-ragify.sh || exit 1 ;

shift $#;

# The Milvus server this folder's projects index into is the rag folder's: its settings say which.
ragify_use_rag_settings ;

if [ -n "${QUERY}" ] ; then
  ragify_query_project ;
else
  # The core's builder does the indexing; the record it leaves in rag/.indexes/ is what the RAG
  # menu on the project's row reads (when it was built, at which scope).
  ragify_project || exit 1 ;
  ragify_record_index "${doc_name}" "${PROJECT_NAME}" ;
fi

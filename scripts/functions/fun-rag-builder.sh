#!/usr/bin/env bash

# What the RAG plugin's index builder (cmd-tools-ragify.sh) needs beyond the core's ragify_project:
# the scope it indexes when the graph plugin is not installed, and the record of each index it built.
#
# Placed by `plugins.sh --install rag` in core/scripts/plugins/rag/functions/, which bootstrap.sh
# sources after the core's own functions: a function defined here is the one a command calls.

# The trees an index leaves out, in the three layers --scope chooses from:
#   custom   the project's own code only
#   contrib  custom + contrib modules, themes and profiles   THE DEFAULT
#   all      everything, core and vendor included
# The same lists the graph plugin uses for graphify: a built Drupal site is mostly vendored code, and
# indexing it buries the project's own text under its dependencies'.
RAGIFY_ALWAYS_EXCLUDES="vendor web/libraries web/sites/default/files docroot/libraries docroot/sites/default/files node_modules graphify-out";
RAGIFY_CORE_EXCLUDES="web/core docroot/core";
RAGIFY_CONTRIB_EXCLUDES="web/modules/contrib web/themes/contrib web/profiles/contrib docroot/modules/contrib docroot/themes/contrib docroot/profiles/contrib drush/contrib";

# The core's ragify_scope_excludes() hands the scope to graphify_scope_excludes(), which lives in the
# graph plugin since the knowledge graph left the core. Without that plugin it is not defined, and
# `--scope contrib` printed "command not found" and indexed vendor/ and web/core as well. With the
# graph plugin installed its lists are used, as before; without it, the same lists from here.
function ragify_scope_excludes() {
  if declare -F graphify_scope_excludes > /dev/null ; then
    graphify_scope_excludes "$1" ;
    return ;
  fi
  case "$1" in
    all)     printf '%s' "" ;;
    custom)  printf '%s %s %s' "${RAGIFY_ALWAYS_EXCLUDES}" "${RAGIFY_CORE_EXCLUDES}" "${RAGIFY_CONTRIB_EXCLUDES}" ;;
    *)       printf '%s %s' "${RAGIFY_ALWAYS_EXCLUDES}" "${RAGIFY_CORE_EXCLUDES}" ;;
  esac
}

# The rag folder's `milvus:` block, where the core's Milvus functions read it: milvus_project (the default
# server), milvus_authorization and milvus_token, milvus_grpc_port. A command of the rag folder loads that
# file as its own settings; the builder runs in the project's folder, whose settings have no such block,
# so the core's query fell back to a server called "milvus" whatever the settings named, and an instance
# with authentication on was asked without its token. Only the milvus_* keys are taken: doc_name and the
# rest stay the folder's own.
function ragify_use_rag_settings() {
  local file="${WORKSPACE_CONFIG}/workspace.rag.settings.yml";
  [ -f "${file}" ] || return 0 ;
  eval "$(parse_yaml "${file}" | grep -E '^milvus_[A-Za-z0-9_]*=')";
}

# Where the record of one project's index lives: rag/.indexes/<workspace>/<project>.json.
#
# In the rag folder, beside the servers, and never in the project: half the projects worth indexing
# are repositories we ship, and a repository must not gain a file because somebody indexed it. The
# folder is a hidden one, so the rag page never lists it as a server.
function ragify_record_file() {
  printf '%s/rag/.indexes/%s/%s.json' "${WORKSPACE_ROOT}" "$1" "$2";
}

# Record that the index of <workspace>/<project> was just built: the collection, the server that
# holds it, the scope, the retrieval and when. The RAG menu on the project's row says "built …" from
# it without asking Milvus for every row; the index itself is still the collection in Milvus.
#
# Called after ragify_project succeeded, so the settings it read (rag_collection_prefix, the
# binding it may have written) are the ones this reads.
function ragify_record_index() {
  local workspace="$1" project="$2" file tmp collection server scope embedding;

  collection="$(rag_collection_name "${workspace}" "${project}")";
  server="$(rag_resolve_instance "${workspace}" "${project}" '_settings_')";

  scope="${SCOPE:-contrib}";
  [ "${ALL}" == 'yes' ] && scope="all";

  embedding="${EMBEDDING:-_settings_}";
  if [ "${embedding}" == '_settings_' ] ; then
    eval $(parse_yaml "${WORKSPACE_CONFIG}/workspace.rag.settings.yml" "rag_rec_");
    embedding="$(milvus_setting "${rag_rec_rag_embedding}")";
    embedding="${embedding:-bm25}";
  fi

  file="$(ragify_record_file "${workspace}" "${project}")";
  mkdir -p "$(dirname "${file}")" || return 1 ;
  tmp="${file}.tmp.$$";
  # JSON written by python3 (which the argument parser already needs), so a value can never break it.
  python3 - "${workspace}" "${project}" "${collection}" "${server}" "${scope}" "${embedding}" "${APPEND}" > "${tmp}" <<'PYEOF' || { rm -f "${tmp}" ; return 1 ; }
import json, sys, datetime
workspace, project, collection, server, scope, embedding, append = sys.argv[1:8]
print(json.dumps({
    "workspace": workspace,
    "project": project,
    "collection": collection,
    "server": server,
    "scope": scope,
    "retrieval": embedding,
    "appended": append == "yes",
    "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}, indent=2))
PYEOF
  mv "${tmp}" "${file}" ;
  echo "  Recorded in ${file#${WORKSPACE_ROOT}/}";
}

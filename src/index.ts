/**
 * The RAG workspace for Webship Workspace: the `rag/` folder as a plugin.
 *
 * What the package carries is placed by the installer from the manifest (the folder's settings file,
 * its commands, its docs and its AI items, each in the folder of its kind; the index builder
 * cmd-tools-ragify.sh in every sites and code folder, and its function file) and listed by --activate;
 * the dashboard draws the workspace from the settings file like any other.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';

export const WORKSPACE_KEY = 'rag';

/** The AI items the installer places, each in the workspace folder of its kind (ai/ in this package). */
export const AGENTS = ['rag-index-keeper'];
export const SKILLS = ['rag-workflow'];
export const AI_COMMANDS = ['rag-search'];
export const PROMPTS = ['rag-start-and-search'];

export function register(api: PluginApi): void {
  api.addAssistantContext(() => `The rag/ workspace is the RAG workspace (a plugin, @webship.co/workspace-rag); its commands are the cmd-*.sh scripts in that folder. A project is indexed from its own workspace folder with cmd-tools-ragify.sh <project> (the plugin places it in every sites and code folder; --query asks the index), and each build leaves a record in rag/.indexes/<workspace>/<project>.json. It comes with AI items for work in this folder: the agent \`rag-index-keeper\` (ai-agents/), the skill \`rag-workflow\` (ai-skills/), the command \`/rag-search\` (ai-commands/) and the prompt \`rag-start-and-search\` (ai-prompts/).`);
}

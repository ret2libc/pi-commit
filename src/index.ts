import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommitCommand } from "./commands/commit.ts";

export default function (pi: ExtensionAPI) {
  registerCommitCommand(pi);
}

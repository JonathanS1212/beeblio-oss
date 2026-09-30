/**
 * Agents reference files with either `workspace:` or `/workspace/` Markdown
 * links. The former is blocked by the markdown sanitizer; the latter becomes
 * a normal anchor and reaches Streamdown's external-link dialog.
 *
 * Rewriting the link into a backticked `/workspace/...` mention before
 * rendering routes it through the chat's inline-code file chip, which opens
 * the file in the workspace editor (see WorkspaceFileMention).
 */

// Link text allows one level of nested balanced brackets; the destination is
// captured without the optional `workspace/` prefix (added back below).
const WORKSPACE_LINK_PATTERN =
  /\[((?:[^\[\]]|\[[^\]]*\])*)\]\(\s*(?:workspace:+\/*((?:workspace\/)?[^\s()]*)|\/workspace\/([^\s()]*))\s*\)/g;

export function rewriteWorkspaceSchemeLinks(markdown: string): string {
  return markdown.replace(WORKSPACE_LINK_PATTERN, (match, _text: string, schemePath: string | undefined, absolutePath: string | undefined) => {
    const path = (schemePath ?? absolutePath ?? "").replace(/^\/+/, "").replace(/^workspace\//, "").replace(/\/+$/, "");
    if (!path) return match;

    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return match;
    }
    // A path that could break out of the code span stays a (blocked) link.
    if (/[`\\\n]/.test(decoded)) return match;
    return `\`/workspace/${decoded}\``;
  });
}

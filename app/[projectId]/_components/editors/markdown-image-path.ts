const absoluteImageSource = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i;

/**
 * Resolves a markdown-relative asset reference (for example
 * `../assets/figure.png`) against the referencing document's directory.
 * Returns the workspace-root-relative decoded path plus any `?query`/`#fragment`
 * suffix, or null when the source is absolute/external or escapes the
 * workspace root. Shared by the workspace and share-link URL builders and by
 * the share asset route's server-side validation.
 */
export function resolveWorkspaceAssetPath(
  markdownPath: string,
  imageSource: string,
): { path: string; suffix: string } | null {
  const source = imageSource.trim();
  if (!source || absoluteImageSource.test(source)) return null;

  const suffixIndex = [source.indexOf("?"), source.indexOf("#")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const sourcePath = suffixIndex === undefined ? source : source.slice(0, suffixIndex);
  const suffix = suffixIndex === undefined ? "" : source.slice(suffixIndex);

  const resolvedSegments = markdownPath.split("/").slice(0, -1).filter(Boolean);

  for (const encodedSegment of sourcePath.replaceAll("\\", "/").split("/")) {
    if (!encodedSegment) continue;
    const segment = safelyDecodeSegment(encodedSegment);
    if (segment === ".") continue;
    if (segment === "..") {
      if (resolvedSegments.length === 0) return null;
      resolvedSegments.pop();
      continue;
    }
    if (segment.includes("/") || segment.includes("\\")) return null;
    resolvedSegments.push(segment);
  }

  if (resolvedSegments.length === 0) return null;
  return { path: resolvedSegments.join("/"), suffix };
}

function encodedWorkspacePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * Rewrites a relative markdown image source into the authenticated workspace
 * API URL. External and unresolvable sources are returned unchanged.
 */
export function resolveMarkdownImageSource(
  projectId: string,
  markdownPath: string,
  imageSource: string,
) {
  const resolved = resolveWorkspaceAssetPath(markdownPath, imageSource);
  if (!resolved) return imageSource;
  return `/api/workspace/${encodeURIComponent(projectId)}/${encodedWorkspacePath(resolved.path)}${resolved.suffix}`;
}

/**
 * Rewrites a relative markdown image source into the share-link asset URL,
 * which serves the shared document and the assets it references without a
 * session. External and unresolvable sources are returned unchanged.
 */
export function resolveShareImageSource(
  shareId: string,
  markdownPath: string,
  imageSource: string,
) {
  const resolved = resolveWorkspaceAssetPath(markdownPath, imageSource);
  if (!resolved) return imageSource;
  return `/api/share/${encodeURIComponent(shareId)}/${encodedWorkspacePath(resolved.path)}${resolved.suffix}`;
}

/**
 * Builds the markdown-friendly path of a workspace asset relative to the
 * document that references it (for example `../assets/figure.png`). Segments
 * are percent-encoded so names with spaces stay valid markdown destinations.
 */
export function workspacePathRelativeToDocument(documentPath: string, assetPath: string) {
  const directory = documentPath.replaceAll("\\", "/").split("/").filter(Boolean).slice(0, -1);
  const assetSegments = assetPath.replaceAll("\\", "/").split("/").filter(Boolean);
  const filename = assetSegments.at(-1) ?? "";
  const assetDirectory = assetSegments.slice(0, -1);

  let common = 0;
  while (common < directory.length && common < assetDirectory.length && directory[common] === assetDirectory[common]) common += 1;

  const parts = [
    ...Array.from({ length: directory.length - common }, () => ".."),
    ...assetDirectory.slice(common),
    filename,
  ];
  return parts.map((segment) => segment === ".." ? segment : encodeURIComponent(segment)).join("/");
}

function safelyDecodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function appendLocalAssetRevision(
  url: string,
  revision: string | number | undefined,
): string {
  if (revision === undefined || revision === "") {
    return url;
  }

  const hashIndex = url.indexOf("#");
  const beforeHash = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const hash = hashIndex < 0 ? "" : url.slice(hashIndex);
  const encodedRevision = encodeURIComponent(String(revision));
  const revisionPattern = /([?&])hf_md_rev=[^&#]*/;

  if (revisionPattern.test(beforeHash)) {
    return `${beforeHash.replace(revisionPattern, `$1hf_md_rev=${encodedRevision}`)}${hash}`;
  }

  const separator = beforeHash.includes("?") ? "&" : "?";
  return `${beforeHash}${separator}hf_md_rev=${encodedRevision}${hash}`;
}

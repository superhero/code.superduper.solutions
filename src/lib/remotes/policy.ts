// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Provider, RemoteAccess } from "./types.ts";
export const providers = [
  { id: "github", name: "GitHub", library: "Octokit", host: "https://github.com", icon: "devicon-github-original", tokenUrl: "https://github.com/settings/personal-access-tokens", scopes: "Repository contents: read/write. Pull requests and issues: read/write. Workflows: write when changing workflow files." },
  { id: "gitlab", name: "GitLab", library: "GitBeaker", host: "https://gitlab.com", icon: "devicon-gitlab-plain", tokenUrl: "https://gitlab.com/-/user_settings/personal_access_tokens", scopes: "api, read_repository and write_repository. Your GitLab role still controls protected branches." },
  { id: "bitbucket", name: "Bitbucket", library: "Bitbucket.js", host: "https://bitbucket.org", icon: "devicon-bitbucket-original", tokenUrl: "https://id.atlassian.com/manage-profile/security/api-tokens", scopes: "Scoped API token: repository read/write, pull request read/write and issue read/write. App passwords are no longer supported." },
] as const;
export function secureUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a complete HTTPS URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || /[\u0000-\u0020\u007f\\]/.test(value))
    throw new Error("Use an HTTPS URL without credentials, query parameters or a fragment.");
  return url;
}
export function normalizeHost(provider: Provider, value: string): string {
  if (!providers.some(item => item.id === provider)) throw new Error("Choose a supported upstream provider.");
  const url = secureUrl(value.trim());
  if (provider === "bitbucket" && (url.origin !== "https://bitbucket.org" || url.pathname !== "/"))
    throw new Error("This integration supports Bitbucket Cloud. Use https://bitbucket.org.");
  if (provider === "github" && url.pathname !== "/") throw new Error("Use your GitHub or GitHub Enterprise origin without an API path.");
  if (/%2f|%5c|%2e/i.test(url.pathname) || url.pathname.includes("//")) throw new Error("Use the upstream's canonical HTTPS address.");
  return url.href.replace(/\/$/, "");
}
export function apiBase(provider: Provider, host: string): string {
  const normalized = normalizeHost(provider, host);
  return provider === "github" ? normalized === "https://github.com" ? "https://api.github.com" : `${normalized}/api/v3`
    : provider === "gitlab" ? `${normalized}/api/v4` : "https://api.bitbucket.org/2.0";
}
export function normalizeRelay(value: string): string { return value.trim() ? secureUrl(value.trim()).href.replace(/\/$/, "") : ""; }
export function repositoryUrl(value: string, access?: Pick<RemoteAccess, "provider" | "host">): string {
  const url = secureUrl(value.trim());
  const parts = url.pathname.replace(/\.git\/?$/, "").split("/").filter(Boolean);
  if (parts.length < 2 || parts.some(part => !/^[\w.~-]+$/.test(part) || part === "." || part === ".."))
    throw new Error("Use the repository's HTTPS clone URL, including its owner or namespace.");
  if (access) {
    const host = new URL(normalizeHost(access.provider, access.host));
    const prefix = host.pathname.replace(/\/$/, "");
    if (url.origin !== host.origin || prefix && !url.pathname.startsWith(prefix + "/"))
      throw new Error("The repository does not belong to this connection's host. Choose a matching connection.");
  }
  return url.href.replace(/\/$/, "");
}
/** Known public Git hosts whose Smart HTTP endpoint does not allow browser CORS. */
export function requiresGitRelay(value: string): boolean {
  try {
    const host = new URL(repositoryUrl(value)).hostname;
    return host === "github.com" || host === "www.github.com";
  } catch { return false; }
}
export function repositoryPath(value: string, access: Pick<RemoteAccess, "provider" | "host">): string {
  const url = new URL(repositoryUrl(value, access)), host = new URL(normalizeHost(access.provider, access.host));
  const path = url.pathname.slice(host.pathname.replace(/\/$/, "").length).replace(/^\//, "").replace(/\.git$/, "");
  if (access.provider !== "gitlab" && path.split("/").length !== 2) throw new Error("Choose a repository, not a branch or file URL.");
  return path;
}
export function refName(value: string): string {
  if (!value || value === "HEAD" || value === "@" || value.startsWith("-") || /[\u0000-\u0020\u007f~^:?*\[\\]/.test(value) || value.includes("..") || value.includes("@{") || value.endsWith(".") || value.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw new Error("Enter a valid Git reference name.");
  return value;
}
export function remoteName(value: string): string { if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error("Use a remote name with letters, digits, dashes or underscores."); return value; }
export function displayRemoteUrl(value: string): { url: string; needsUrl?: boolean } {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return { url: "HTTPS URL required", needsUrl: true };
    const needsUrl = !!(url.username || url.password || url.search || url.hash);
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    return { url: url.href.replace(/\/$/, ""), ...(needsUrl ? { needsUrl: true } : {}) };
  } catch { return { url: "HTTPS URL required", needsUrl: true }; }
}
export function remoteError(error: unknown, token = ""): string {
  const status = (error as { status?: number })?.status;
  if (status === 401) return "Authentication was rejected. Check or replace the connection token.";
  if (status === 403) return "Access denied. Check token scopes, repository permissions and your organization's SSO approval.";
  if (status === 404) return "This resource is unavailable. Check the repository path and your access permissions.";
  if (status === 409 || status === 422) return "The upstream rejected this change. Refresh and check branches, conflicts and required fields.";
  if (status === 429) return "The upstream rate limit was reached. Wait before trying again.";
  let message = error instanceof Error ? error.message : "The upstream operation failed.";
  if (token) message = message.split(token).join("[redacted]");
  return message.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=_.-]+/gi, "$1 [redacted]")
    .replace(/(authorization|private-token)\s*[:=]\s*[^\r\n,}]+/gi, "$1: [redacted]").slice(0, 500);
}

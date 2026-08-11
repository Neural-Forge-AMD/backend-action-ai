// Internal utility: pulls a private GitHub repo's file tree + file contents
// using the GITHUB_PAT secret (server-side only). Never exposed to the browser.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_REPO = "Neural-Forge-AMD/backend-action-ai";
const SKIP_DIRS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  ".venv/",
  "venv/",
  "__pycache__/",
  ".terraform/",
  ".idea/",
  ".vscode/",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Light JWT check (anon key is a JWT). The real gate is the GITHUB_PAT secret.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return json({ ok: false, error: "Missing Authorization header" }, 401, corsHeaders);
  }

  const token = Deno.env.get("GITHUB_PAT");
  if (!token) {
    return json({ ok: false, error: "GITHUB_PAT secret is not configured" }, 500, corsHeaders);
  }

  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") ?? DEFAULT_REPO;
  const ref = url.searchParams.get("ref") ?? "";
  const path = url.searchParams.get("path") ?? "";

  const gh = (apiPath: string) =>
    fetch(`https://api.github.com${apiPath}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nativelyai-integration",
      },
    });

  try {
    if (path) {
      const res = await gh(`/repos/${repo}/contents/${path}${ref ? `?ref=${ref}` : ""}`);
      if (!res.ok) {
        const body = await res.text();
        return json({ ok: false, path, error: `GitHub ${res.status}: ${body.slice(0, 300)}` }, 502, corsHeaders);
      }
      const data = await res.json();
      return json(
        {
          ok: true,
          path,
          name: data.name,
          size: data.size ?? 0,
          encoding: data.encoding ?? null,
          content: data.content ?? null,
        },
        200,
        corsHeaders,
      );
    }

    // Listing: resolve default branch, then full recursive tree
    let branch = ref;
    if (!branch) {
      const repoRes = await gh(`/repos/${repo}`);
      if (repoRes.ok) {
        const info = await repoRes.json();
        branch = info.default_branch ?? "main";
      }
    }
    const treeRes = await gh(`/repos/${repo}/git/trees/${branch}?recursive=1`);
    if (!treeRes.ok) {
      const body = await treeRes.text();
      return json({ ok: false, error: `GitHub ${treeRes.status}: ${body.slice(0, 300)}` }, 502, corsHeaders);
    }
    const tree = await treeRes.json();
    const entries = (tree.tree ?? [])
      .filter((e: { type?: string }) => e.type === "blob")
      .map((e: { path?: string; size?: number }) => ({ path: e.path ?? "", size: e.size ?? 0 }))
      .filter((e: { path: string }) => !SKIP_DIRS.some((d) => e.path.startsWith(d)));

    return json(
      { ok: true, repo, ref: branch, truncated: tree.truncated ?? false, count: entries.length, entries },
      200,
      corsHeaders,
    );
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500, corsHeaders);
  }
});

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders, ...corsHeaders },
  });
}

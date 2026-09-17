import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CANDIDATES = [
  process.env.DJANGO_ORIGIN,
  process.env.NEXT_PUBLIC_API_ORIGIN,
  "http://127.0.0.1:8877",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8001",
  "http://127.0.0.1:8000",
].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

let cachedOrigin: string | null = null;

async function findDjango(): Promise<string | null> {
  const origins = cachedOrigin ? [cachedOrigin, ...CANDIDATES.filter((item) => item !== cachedOrigin)] : CANDIDATES;
  for (const origin of origins) {
    try {
      const response = await fetch(`${origin}/api/health/`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        cachedOrigin = origin;
        return origin;
      }
    } catch {
      if (cachedOrigin === origin) cachedOrigin = null;
    }
  }
  return null;
}

function applySetCookies(from: Headers, to: Headers) {
  const cookies =
    typeof from.getSetCookie === "function"
      ? from.getSetCookie()
      : from.get("set-cookie")
        ? [from.get("set-cookie") as string]
        : [];
  for (const cookie of cookies) {
    to.append("set-cookie", cookie.replace(/;\s*Domain=[^;]+/i, ""));
  }
}

async function proxy(request: NextRequest, path: string[]) {
  const origin = await findDjango();
  if (!origin) {
    return NextResponse.json(
      {
        detail:
          "Django is not running. In the backend PowerShell window (venv active) run: python manage.py runserver 127.0.0.1:8877",
      },
      { status: 503 }
    );
  }

  const incoming = new URL(request.url);
  let destPath = `/api/${path.join("/")}`;
  if (!destPath.endsWith("/")) destPath += "/";
  const target = `${origin}${destPath}${incoming.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (["host", "connection", "content-length"].includes(lower)) return;
    headers.set(key, value);
  });

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  try {
    const response = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
    const out = new Headers();
    response.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (["transfer-encoding", "connection", "set-cookie"].includes(lower)) return;
      out.set(key, value);
    });
    applySetCookies(response.headers, out);
    return new NextResponse(response.body, { status: response.status, headers: out });
  } catch {
    cachedOrigin = null;
    return NextResponse.json(
      {
        detail: `Could not proxy to Django at ${origin}. Restart it with: python manage.py runserver 127.0.0.1:8877`,
      },
      { status: 503 }
    );
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;

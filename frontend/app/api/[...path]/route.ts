import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) return Response.json({ detail: "Invalid API path." }, { status: 400 });
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && Buffer.byteLength(body) > 5 * 1024 * 1024 + 10000) return Response.json({ detail: "File/request exceeds 5 MB." }, { status: 413 });
  try {
    const base = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const response = await fetch(`${base}/api/${path.join("/")}${request.nextUrl.search}`, {
      method: request.method, headers: { "Content-Type": "application/json", "Accept": request.headers.get("accept") || "application/json" }, body, cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180000)]),
    });
    return new Response(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control":"no-store", "X-Accel-Buffering":"no" } });
  } catch {
    return Response.json({ detail: "The soil service is unavailable. Start the FastAPI backend and retry." }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST };

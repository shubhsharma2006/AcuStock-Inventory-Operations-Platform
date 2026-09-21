import { NextRequest, NextResponse } from "next/server";

const backendBaseUrl = process.env.BACKEND_URL ?? process.env.ACUSTOCK_BACKEND_URL ?? "http://127.0.0.1:5001";

const invalidProductionBackend = process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(backendBaseUrl);

async function proxyRequest(request: NextRequest, path: string[]) {
  if (invalidProductionBackend) {
    return NextResponse.json(
      { success: false, error: "Backend proxy is not configured for production" },
      { status: 503 }
    );
  }
  const targetPath = path.length > 0 ? `/${path.join("/")}` : "/";
  const url = new URL(`${backendBaseUrl}/api${targetPath}`);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  };

  const response = await fetch(url, init);
  const responseBody = await response.arrayBuffer();

  return new NextResponse(responseBody, {
    status: response.status,
    headers: response.headers,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  return proxyRequest(request, path);
}

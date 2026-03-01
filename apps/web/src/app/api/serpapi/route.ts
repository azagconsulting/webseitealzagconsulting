import { NextRequest, NextResponse } from "next/server";

const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const apiKey = typeof body?.serpApiKey === "string" ? body.serpApiKey.trim() : "";

    if (!query) {
      return NextResponse.json({ error: "Query fehlt." }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: "SerpAPI-Key fehlt." }, { status: 400 });
    }

    const url = new URL(SERPAPI_ENDPOINT);
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("gl", "de");
    url.searchParams.set("hl", "de");
    url.searchParams.set("num", "20");
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `SerpAPI-Fehler: ${response.status}`, detail: text?.slice(0, 500) },
        { status: 502 },
      );
    }

    const data = await response.json();
    const organic: Array<{ title: string; link: string; snippet?: string; position?: number }> = Array.isArray(
      data?.organic_results,
    )
      ? data.organic_results.map((item: Record<string, unknown>) => ({
          title: String(item.title ?? ""),
          link: String(item.link ?? ""),
          snippet: typeof item.snippet === "string" ? item.snippet : undefined,
          position: typeof item.position === "number" ? item.position : undefined,
        }))
      : [];

    const filtered = organic.filter((item) => item.title && item.link).slice(0, 20);
    return NextResponse.json({ results: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler bei SerpAPI.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

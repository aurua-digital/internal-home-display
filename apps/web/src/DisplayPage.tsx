import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DEFAULT_THEME, type Theme, type Widget } from "@hd/modules";
import { api } from "./api";
import { Fit, StaticGrid, WidgetView, canvasStyle, useNow } from "./canvas";

interface Doc {
  id: string;
  name: string;
  layout: Widget[];
  theme: Theme;
  updatedAt: string;
}

/** The page the Raspberry Pi shows full screen: /d/<secret token>. */
export default function DisplayPage() {
  const { token } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const [generation, setGeneration] = useState(0);
  const now = useNow(1000);

  const load = useCallback(async () => {
    try {
      const d = await api<Doc>("GET", `/api/d/${token}`);
      setDoc({ ...d, theme: { ...DEFAULT_THEME, ...d.theme } });
      setError("");
    } catch (e) {
      // Network blip: keep showing what we have. Only a 404 means the link is dead.
      if ((e as any).status === 404) setError((e as Error).message);
    }
  }, [token]);

  useEffect(() => {
    document.title = "Home Display";
    document.documentElement.style.cssText = "background:#000;overflow:hidden;cursor:none";
    document.body.style.cssText = "margin:0;background:#000;overflow:hidden";
    load();
  }, [load]);

  // Live updates from the admin app. EventSource reconnects by itself after a network drop.
  useEffect(() => {
    const es = new EventSource(`/api/d/${token}/events`);
    es.addEventListener("layout", () => load());
    es.addEventListener("data", () => setGeneration((g) => g + 1));
    es.addEventListener("revoked", () => setError("This display link was replaced. Open the new link from the admin app."));
    es.addEventListener("hello", () => load());
    return () => es.close();
  }, [token, load]);

  // Safety net: pick up changes even if the event stream is blocked.
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <Message text={error} />;
  if (!doc) return <Message text="Loading…" />;

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Fit cover>
        {() => (
          <div style={canvasStyle(doc.theme)}>
            <StaticGrid
              widgets={doc.layout}
              render={(w) => (
                <WidgetView
                  key={`${w.id}:${generation}`}
                  widget={w}
                  theme={doc.theme}
                  now={now}
                  loadData={(widget) => api("GET", `/api/d/${token}/widgets/${widget.id}`)}
                />
              )}
            />
          </div>
        )}
      </Fit>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div style={{ height: "100vh", background: "#0f172a", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", fontSize: 28, textAlign: "center", padding: 40 }}>
      {text}
    </div>
  );
}

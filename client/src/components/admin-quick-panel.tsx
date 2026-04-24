import { useEffect, useState, useCallback } from "react";
import { ref, get, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

interface PanelStats {
  activeVisitors: number;
  totalSignups: number;
  lastUpdated: string;
  connected: boolean;
}

export function AdminQuickPanel() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<PanelStats | null>(null);

  // Ctrl+Shift+A keyboard shortcut
  useEffect(() => {
    const keys: string[] = [];
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "A") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      keys.push(e.key);
      if (keys.length > 10) keys.shift();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Live Firebase stats when panel is open
  useEffect(() => {
    if (!open) return;

    const rootRef = ref(rtdb, "/");
    const unsub = onValue(rootRef, (snapshot) => {
      const data = snapshot.val() || {};
      const now = Date.now();
      const cutoff = now - 5 * 60 * 1000;
      const visitors = Object.values(
        (data.activeVisitors || {}) as Record<string, { joined: number }>
      ).filter((v) => v.joined > cutoff);

      setStats({
        activeVisitors: visitors.length,
        totalSignups: Object.keys(data.signups || {}).length,
        lastUpdated: new Date().toLocaleTimeString(),
        connected: true,
      });
    }, () => {
      setStats((s) => s ? { ...s, connected: false } : null);
    });

    return () => unsub();
  }, [open]);

  const exportCSV = useCallback(async () => {
    try {
      const snapshot = await get(ref(rtdb, "signups"));
      if (!snapshot.exists()) { alert("No signups yet."); return; }

      const rows: string[] = ["Name,Location,Destination,Timestamp"];
      snapshot.forEach((child) => {
        const d = child.val();
        const name = (d.firstName || "—").replace(/"/g, "'");
        const loc = (d.location || "—").replace(/"/g, "'");
        const dest = (d.destination || "—").replace(/"/g, "'");
        const ts = d.joined ? new Date(d.joined).toLocaleString() : "—";
        rows.push(`"${name}","${loc}","${dest}","${ts}"`);
      });

      const blob = new Blob([rows.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `signups_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[AdminPanel] CSV export failed:", err);
      alert("Export failed. Check console.");
    }
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        background: "#fff",
        border: "2px solid #1A2530",
        padding: "20px 24px",
        zIndex: 9999,
        minWidth: 320,
        maxWidth: 400,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        fontFamily: "system-ui, sans-serif",
      }}
      data-testid="admin-quick-panel"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#1A2530" }}>
          🔧 Admin Panel — Firebase
        </h4>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#5C6A7A", lineHeight: 1 }}
          data-testid="admin-panel-close"
        >
          ×
        </button>
      </div>

      {stats ? (
        <div style={{ fontSize: 13, lineHeight: "2", color: "#2A3A4A" }}>
          <div>👥 <strong>Active Visitors:</strong> {stats.activeVisitors}</div>
          <div>📝 <strong>Total Signups:</strong> {stats.totalSignups}</div>
          <div>🕐 <strong>Last Updated:</strong> {stats.lastUpdated}</div>
          <div>
            🔗 <strong>Database:</strong>{" "}
            {stats.connected
              ? <span style={{ color: "#4A6A5E" }}>Connected ✅</span>
              : <span style={{ color: "#c0392b" }}>Disconnected ❌</span>}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#7A8A9A", marginBottom: 8 }}>Loading Firebase data…</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button
          onClick={exportCSV}
          style={{
            background: "#1A2530",
            color: "#fff",
            border: "none",
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
          data-testid="admin-panel-export"
        >
          Export Signups (CSV)
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "1px solid #E2DDD5",
            padding: "7px 14px",
            cursor: "pointer",
            fontSize: 12,
            color: "#5C6A7A",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: "#9AA8B4" }}>
        Shortcut: Ctrl + Shift + A
      </div>
    </div>
  );
}

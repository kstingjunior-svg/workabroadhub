import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";

export function FirebaseConnectionBanner() {
  const [offline, setOffline] = useState(false);
  const [everConnected, setEverConnected] = useState(false);

  useEffect(() => {
    const connectedRef = ref(rtdb, ".info/connected");
    const unsub = onValue(connectedRef, (snap) => {
      const connected = snap.val() === true;
      if (connected) {
        setEverConnected(true);
        setOffline(false);
      } else if (everConnected) {
        setOffline(true);
      }
    });
    return () => unsub();
  }, [everConnected]);

  if (!offline) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: "#FFEAA7",
        color: "#1A2530",
        textAlign: "center",
        padding: "8px 16px",
        zIndex: 9998,
        fontSize: 13,
        fontWeight: 500,
      }}
      data-testid="firebase-offline-banner"
    >
      📡 Reconnecting to live updates…
    </div>
  );
}

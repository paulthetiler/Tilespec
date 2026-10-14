"use client";

import { useEffect, useState } from "react";
import styles from "@/app/admin/admin.module.css";

// Sites often lose signal. Say so plainly: nothing can be saved offline, and
// nothing typed on this page is thrown away while waiting.
export function ConnectionStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (online) return null;
  return <p className={styles.offline} role="alert">No connection. Nothing can be saved until the signal returns. Keep this page open: what you have entered stays here.</p>;
}

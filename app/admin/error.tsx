"use client";

import styles from "./admin.module.css";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className={styles.panel} role="alert"><h1>Records are temporarily unavailable</h1><p>We could not load your authorised records. Please retry. If the problem continues, contact your TileSPEC administrator.</p><button type="button" onClick={reset} className={styles.button}>Try again</button></section>;
}

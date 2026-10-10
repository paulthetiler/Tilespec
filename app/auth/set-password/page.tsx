import type { Metadata } from "next";
import Link from "next/link";
import { requirePasswordSession } from "./session";
import { setPassword } from "./actions";
import styles from "@/app/login/page.module.css";

export const metadata: Metadata = {
  title: "Set your password | TileSPEC Admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  await requirePasswordSession();
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const message = error === "password"
    ? "Use a password between 12 and 128 characters and enter the same password in both fields."
    : error === "unavailable"
      ? "Password updates are temporarily unavailable. Please try again later."
      : error === "rejected"
        ? "We could not update your password. Try a different password or contact the owner."
        : "";

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>TileSPEC <span>ADMIN</span></Link></header>
    <section className={styles.panel} aria-labelledby="password-title">
      <p className={styles.eyebrow}>SECURE ACCOUNT ACCESS</p>
      <h1 id="password-title">Set your password</h1>
      <p className={styles.intro}>Choose a unique password with at least 12 characters. A password manager can help you create and keep it securely.</p>
      {message && <p className={styles.notice} role="alert">{message}</p>}
      <form action={setPassword} className={styles.form}>
        <label htmlFor="new-password">New password<input id="new-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <label htmlFor="confirm-password">Confirm password<input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label>
        <button type="submit">Save password</button>
      </form>
      <p className={styles.note}>Setting a password does not grant business access. The owner assigns your role and allocated work separately.</p>
      <Link className={styles.back} href="/login">Return to sign in</Link>
    </section>
  </main>;
}

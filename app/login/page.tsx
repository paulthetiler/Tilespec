import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeAdminRedirect } from "@/lib/supabase/navigation";
import { signIn } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sign in | TileSPEC Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

type Search = { reason?: string | string[]; error?: string | string[]; next?: string | string[] };
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams;
  const configured = isSupabaseConfigured();
  const reason = first(query.reason);
  const error = first(query.error);
  const next = safeAdminRedirect(first(query.next));
  let message = "";
  if (!configured || reason === "configuration") {
    message = "The TileSPEC backend needs configuration before you can sign in. The owner must connect the TileSPEC environment and provision authorised accounts.";
  } else if (reason === "membership") {
    message = "Your account does not have active TileSPEC access. Contact the owner to arrange your account and contract permissions.";
  } else if (reason === "invitation") {
    message = "This account link could not be verified. Contact the owner for a new invitation or password recovery link.";
  } else if (reason === "unavailable" || error === "unavailable") {
    message = "Sign-in is temporarily unavailable. Please try again later.";
  } else if (error === "invalid") {
    message = "We could not sign you in with those details. Check your email and password and try again.";
  } else if (reason === "signed_out") {
    message = "You have signed out.";
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>TileSPEC <span>ADMIN</span></Link></header>
    <section className={styles.panel} aria-labelledby="login-title">
      <p className={styles.eyebrow}>COMMERCIAL CONTRACT MANAGEMENT</p>
      <h1 id="login-title">Sign in</h1>
      <p className={styles.intro}>Access your allocated contracts, site records and approvals.</p>
      {message && <p className={styles.notice} role={error || reason === "unavailable" ? "alert" : "status"}>{message}</p>}
      {configured && <form action={signIn} className={styles.form}>
        <input type="hidden" name="next" value={next}/>
        <label htmlFor="email">Email address<input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} required/></label>
        <label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required/></label>
        <button type="submit">Sign in securely</button>
      </form>}
      <p className={styles.note}>Accounts and permissions are managed by the owner. Your role and allocated work determine what you can access.</p>
      <p className={styles.note}>Need an invitation or password recovery link? Contact the owner to arrange one.</p>
      <Link className={styles.back} href="/">Return to TileSPEC website</Link>
    </section>
  </main>;
}

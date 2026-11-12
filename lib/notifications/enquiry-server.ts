import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailConfiguration, publicBaseUrl, sendEmail } from "./send";
import { enquiryRecipient, type EnquiryDeps } from "./enquiry";

/**
 * Enquiry alerts wired to the real email service and database. `client` is the connection that proves the
 * request: the publishable-key connection (with the visitor's token or the retry key) or a signed-in office
 * session. No service key is used.
 */
export function enquiryDeps(client: SupabaseClient): EnquiryDeps {
  return {
    rpc: (fn, args) => client.rpc(fn, args),
    send: input => sendEmail(input),
    configured: emailConfiguration().configured,
    to: enquiryRecipient(),
    baseUrl: publicBaseUrl(),
  };
}

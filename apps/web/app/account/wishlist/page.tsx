import { redirect } from "next/navigation";

// Needs customer sign-in, which isn't built yet. The page that used to be here rendered controls
// that saved nothing, so it now goes back to the account overview, which offers what does work.
export default function Page() {
  redirect("/account");
}

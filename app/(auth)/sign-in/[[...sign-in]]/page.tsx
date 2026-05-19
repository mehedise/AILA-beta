import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to AILA"
      subtitle="Continue turning business cards and spreadsheets into clean, classified leads."
    >
      <SignIn appearance={{ elements: { card: "shadow-none border-0" } }} />
    </AuthShell>
  );
}

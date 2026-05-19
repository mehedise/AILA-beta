import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Get started"
      title="Create your AILA account"
      subtitle="Upload Excel files or PDFs and we’ll extract, verify, and classify every lead."
    >
      <SignUp appearance={{ elements: { card: "shadow-none border-0" } }} />
    </AuthShell>
  );
}

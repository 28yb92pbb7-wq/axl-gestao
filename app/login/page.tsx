import { supabaseEnabled } from "@/lib/backend";
import LoginForm from "@/components/login-form";
export const dynamic = "force-dynamic";
export default function LoginPage() {
  return <LoginForm remote={supabaseEnabled()} />;
}

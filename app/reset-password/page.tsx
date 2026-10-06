import PasswordRecoveryForm from "@/components/password-recovery-form";
export const metadata = {
  title: "Recuperar acesso — AXL Gestão",
  referrer: "no-referrer" as const,
};
export default function ResetPasswordPage() {
  return <PasswordRecoveryForm />;
}

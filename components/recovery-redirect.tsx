"use client";
import { useEffect } from "react";
import { recoveryTokens } from "@/lib/password-recovery";
export default function RecoveryRedirect() {
  useEffect(() => {
    if (
      window.location.pathname !== "/reset-password" &&
      recoveryTokens(window.location.hash)
    )
      window.location.replace("/reset-password" + window.location.hash);
  }, []);
  return null;
}

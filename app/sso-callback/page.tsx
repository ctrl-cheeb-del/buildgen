"use client";

import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function SSOCallbackPage() {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { setActive } = useClerk();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (!signInLoaded || !signUpLoaded || handled.current) return;
    handled.current = true;

    async function handleCallback() {
      const si = signIn!;
      const su = signUp!;

      // If the OAuth sign-in detected no existing account, the verification
      // status will be "transferable" — transfer to sign-up to create one.
      if (si.firstFactorVerification?.status === "transferable") {
        console.log("[SSO] Transferring sign-in to sign-up (new user)");
        try {
          const res = await su.create({ transfer: true });
          if (res.status === "complete" && res.createdSessionId) {
            await setActive({ session: res.createdSessionId });
            router.replace("/world");
            return;
          }
        } catch (err) {
          console.error("[SSO] Transfer to sign-up failed:", err);
          router.replace("/login");
          return;
        }
      }

      // Normal sign-in completed
      if (si.status === "complete" && si.createdSessionId) {
        console.log("[SSO] Sign-in complete");
        await setActive({ session: si.createdSessionId });
        router.replace("/world");
        return;
      }

      // Sign-up completed (e.g. came via signUp.authenticateWithRedirect)
      if (su.status === "complete" && su.createdSessionId) {
        console.log("[SSO] Sign-up complete");
        await setActive({ session: su.createdSessionId });
        router.replace("/world");
        return;
      }

      // Check if sign-up verification is transferable (reverse direction)
      if (su.verifications?.externalAccount?.status === "transferable") {
        console.log("[SSO] Transferring sign-up to sign-in (existing user)");
        try {
          const res = await si.create({ transfer: true });
          if (res.status === "complete" && res.createdSessionId) {
            await setActive({ session: res.createdSessionId });
            router.replace("/world");
            return;
          }
        } catch (err) {
          console.error("[SSO] Transfer to sign-in failed:", err);
          router.replace("/login");
          return;
        }
      }

      console.warn("[SSO] Unhandled state", {
        signInStatus: si.status,
        signUpStatus: su.status,
        firstFactor: si.firstFactorVerification?.status,
        externalAccount: su.verifications?.externalAccount?.status,
      });
      router.replace("/login");
    }

    handleCallback().catch((err) => {
      console.error("[SSO] Callback error:", err);
      router.replace("/login");
    });
  }, [signInLoaded, signUpLoaded, signIn, signUp, setActive, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 text-sm animate-pulse">Signing you in…</p>
    </div>
  );
}

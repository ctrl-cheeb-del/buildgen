"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SSOCallbackPage() {
  return (
    <AuthenticateWithRedirectCallback
      signInUrl="/login"
      signUpUrl="/login"
      signInForceRedirectUrl="/world"
      signUpForceRedirectUrl="/world"
    />
  );
}

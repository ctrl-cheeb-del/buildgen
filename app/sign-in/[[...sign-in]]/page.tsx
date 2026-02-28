"use client";

import { useEffect } from "react";

export default function SignInPage() {
  useEffect(() => {
    window.location.href = "/login";
  }, []);

  return null;
}

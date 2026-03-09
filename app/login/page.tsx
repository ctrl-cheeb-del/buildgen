"use client";

import { useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import TiltedCard from "@/components/TiltedCard";

export default function LoginPage() {
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { isSignedIn, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (userLoaded && isSignedIn) {
      router.replace("/world");
    }
  }, [userLoaded, isSignedIn, router]);

  const handleSignIn = async () => {
    if (!signInLoaded || !signUpLoaded) return;

    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_x",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/world",
      });
    } catch {
      // If sign-in fails (e.g. no account yet), try sign-up
      await signUp.authenticateWithRedirect({
        strategy: "oauth_x",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/world",
      });
    }
  };

  if (!userLoaded || isSignedIn) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-10">
      <div className="flex w-full max-w-7xl gap-12 items-center">
        {/* Left side - Sign in */}
        <div className="flex-1 flex flex-col items-center justify-center px-16">
          <div className="w-full max-w-md space-y-10">
            <div className="space-y-3">
              <h1 className="font-[family-name:var(--font-geist-pixel-square)] text-4xl tracking-tight text-gray-900">
                Welcome back
              </h1>
              <p className="font-[family-name:var(--font-geist-pixel-square)] text-gray-500 text-sm">
                Sign in to MistralVerse
              </p>
            </div>

            <button
              onClick={handleSignIn}
              disabled={!signInLoaded || !signUpLoaded}
              className="login-btn group relative w-full flex items-center justify-center gap-3 px-8 py-4.5 bg-black text-white rounded-2xl font-medium text-lg active:scale-[0.98] transition-all duration-300 shadow-[0_2px_12px_rgba(0,0,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer overflow-hidden"
            >
              <svg
                viewBox="0 0 24 24"
                className="relative z-10 w-5 h-5 fill-white"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="relative z-10 font-[family-name:var(--font-geist-pixel-square)] text-sm">Continue with X</span>
            </button>

            <p className="font-[family-name:var(--font-geist-pixel-square)] text-xs text-gray-400 text-center leading-relaxed">
              By continuing, you agree to our terms of service and privacy
              policy.
            </p>
          </div>
        </div>

        {/* Right side - City image with tilt effect */}
        <div className="w-[55%] shrink-0 flex items-center justify-center">
          <TiltedCard
            imageSrc="/city.webp"
            altText="City skyline"
            containerHeight="800px"
            containerWidth="100%"
            imageHeight="800px"
            imageWidth="100%"
            rotateAmplitude={3}
            scaleOnHover={1.01}
            borderRadius="24px"
          />
        </div>
      </div>
    </div>
  );
}

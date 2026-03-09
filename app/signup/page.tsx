"use client";

import { SignUp, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import TiltedCard from "@/components/TiltedCard";

export default function SignUpPage() {
  const { isSignedIn, isLoaded: userLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (userLoaded && isSignedIn) {
      router.replace("/world");
    }
  }, [userLoaded, isSignedIn, router]);

  if (!userLoaded || isSignedIn) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-10">
      <div className="flex w-full max-w-7xl gap-12 items-center">
        {/* Left side - Sign up */}
        <div className="flex-1 flex flex-col items-center justify-center px-16">
          <SignUp
            forceRedirectUrl="/world"
            signInForceRedirectUrl="/world"
            appearance={{
              elements: {
                rootBox: "w-full max-w-md",
                cardBox: "shadow-none border-none",
                card: "shadow-none border-none bg-transparent",
              },
            }}
          />
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

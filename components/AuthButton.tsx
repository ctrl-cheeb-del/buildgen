"use client";

import { SignInButton, SignOutButton, useUser } from "@clerk/nextjs";

export default function AuthButton() {
  const { isSignedIn, user, isLoaded } = useUser();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button className="flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur-2xl border border-white/25 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)] text-sm font-medium text-white/90 hover:bg-white/25 transition-colors">
          Sign in with 𝕏
        </button>
      </SignInButton>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/15 backdrop-blur-2xl border border-white/25 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_16px_rgba(0,0,0,0.2)]">
      {user.imageUrl && (
        <img
          src={user.imageUrl}
          alt=""
          className="w-6 h-6 rounded-full"
        />
      )}
      <span className="text-sm font-medium text-white/90 max-w-[120px] truncate">
        {user.username || user.firstName || "User"}
      </span>
      <SignOutButton>
        <button className="text-xs text-white/50 hover:text-white/80 ml-1">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}

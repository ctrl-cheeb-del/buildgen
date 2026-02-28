"use client";

import { SignInButton, SignOutButton, useUser } from "@clerk/nextjs";

export default function AuthButton() {
  const { isSignedIn, user, isLoaded } = useUser();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <SignInButton mode="modal">
        <button className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow text-sm font-medium text-gray-700 hover:bg-white transition-colors">
          Sign in with 𝕏
        </button>
      </SignInButton>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg shadow">
      {user.imageUrl && (
        <img
          src={user.imageUrl}
          alt=""
          className="w-6 h-6 rounded-full"
        />
      )}
      <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">
        {user.username || user.firstName || "User"}
      </span>
      <SignOutButton>
        <button className="text-xs text-gray-400 hover:text-gray-600 ml-1">
          Sign out
        </button>
      </SignOutButton>
    </div>
  );
}

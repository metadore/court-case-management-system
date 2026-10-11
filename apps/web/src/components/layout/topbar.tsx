"use client";

import { useAuth } from "@/lib/auth";
import { NotificationBell } from "./notification-bell";
import { CommandPalette, CommandPaletteTrigger } from "@/components/ui/command-palette";

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <>
      {/* Always-mounted palette — manages its own open state via Ctrl/Cmd+K */}
      <CommandPalette />
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">
            Welcome, <span className="font-medium text-gray-900">{user?.firstName} {user?.lastName}</span>
          </p>
          <CommandPaletteTrigger />
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
            {user?.role}
          </span>
          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign Out
          </button>
        </div>
      </header>
    </>
  );
}
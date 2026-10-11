"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/dashboard",                       label: "Dashboard",         roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/cases",                           label: "Cases",             roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/hearings",                        label: "Hearings",          roles: ["ADMIN", "JUDGE", "CLERK"] },
  { href: "/docket",                          label: "Docket",            roles: ["ADMIN", "JUDGE", "CLERK"] },
  { href: "/calendar",                        label: "Calendar",          roles: ["ADMIN", "JUDGE", "CLERK"] },
  { href: "/payments",                        label: "Payments",          roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/notifications",                   label: "Notifications",     roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/subscriptions",                   label: "Subscriptions",     roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/lawyers/profile",                 label: "My Profile",        roles: ["LAWYER"] },
  { href: "/settings/profile",                label: "Profile",           roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/settings/security",               label: "Security (2FA)",    roles: ["ADMIN", "JUDGE", "CLERK", "LAWYER", "PUBLIC"] },
  { href: "/reports",                         label: "Reports",           roles: ["ADMIN", "JUDGE", "CLERK"],  group: "Admin" },
  { href: "/admin",                           label: "Users",             roles: ["ADMIN"],                    group: "Admin" },
  { href: "/admin/analytics",                 label: "Analytics",         roles: ["ADMIN", "JUDGE"],           group: "Admin" },
  { href: "/admin/fee-waivers",               label: "Fee Waivers",       roles: ["ADMIN", "CLERK"],           group: "Admin" },
  { href: "/admin/courtrooms",                label: "Courtrooms",        roles: ["ADMIN"],                    group: "Admin" },
  { href: "/admin/interpreters",              label: "Interpreters",      roles: ["ADMIN", "CLERK"],           group: "Admin" },
  { href: "/admin/notification-providers",    label: "Notif. Providers",  roles: ["ADMIN"],                    group: "Admin" },
  { href: "/admin/outbound-notifications",    label: "Delivery Queue",    roles: ["ADMIN"],                    group: "Admin" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const filteredItems = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );
  const mainItems  = filteredItems.filter((i) => !i.group);
  const adminItems = filteredItems.filter((i) => i.group === "Admin");

  function NavLink({ item }: { item: typeof navItems[0] }) {
    const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
    return (
      <Link
        href={item.href}
        className={`block rounded-lg px-4 py-2 text-sm font-medium transition ${
          isActive
            ? "bg-blue-50 text-blue-700"
            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="text-xl font-bold text-blue-900">
          TPT Court
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {mainItems.map((item) => <NavLink key={item.href} item={item} />)}

        {adminItems.length > 0 && (
          <div className="pt-4">
            <p className="mb-1 px-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Admin</p>
            {adminItems.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
        )}
      </nav>
    </aside>
  );
}
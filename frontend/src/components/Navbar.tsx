"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard",   label: "Dashboard" },
  { href: "/profile",     label: "Profile" },
  { href: "/inventory",   label: "Inventory" },
  { href: "/grocery-list", label: "Grocery List" },
  { href: "/family",      label: "Family" },
  { href: "/assistant",   label: "AI Assistant" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <span className="text-xl select-none">🥬</span>
          <span className="font-bold text-gray-900 text-lg leading-none">
            NutriFridge{" "}
            <span className="text-green-600">AI</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-green-50 text-green-700"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

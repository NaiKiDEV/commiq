import React from "react";
import { NavLink, Outlet } from "react-router-dom";

const nav = [
  {
    label: "Basic",
    children: [
      { to: "/", label: "Counter" },
      { to: "/todos", label: "Todo List" },
    ],
  },
  {
    label: "Advanced",
    children: [
      { to: "/store-deps", label: "Store Dependencies" },
      { to: "/async", label: "Async Commands" },
      { to: "/stream", label: "Event Stream" },
      { to: "/devtools", label: "Devtools" },
    ],
  },
];

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `block px-3 py-1.5 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-indigo-50 text-indigo-700 font-medium dark:bg-indigo-950 dark:text-indigo-300"
            : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur supports-backdrop-filter:bg-white/60">
        <div className="max-w-7xl mx-auto flex items-center h-14 px-6">
          <span className="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            commiq
          </span>
          <span className="ml-2 text-xs font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
            examples
          </span>
          <div className="flex-1" />
          <a
            href="https://github.com/naikidev/commiq"
            target="_blank"
            rel="noopener"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        <aside className="hidden md:block w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 py-6 pr-4 pl-6 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
          {nav.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2 px-3">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.children.map((item) => (
                  <SidebarLink key={item.to} {...item} />
                ))}
              </div>
            </div>
          ))}
        </aside>

        <main className="flex-1 min-w-0 px-6 py-8 md:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React from "react";

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
        {description}
      </p>
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  badge,
}: {
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      {badge && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
          {badge}
        </span>
      )}
    </div>
  );
}

export function CardBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = "default",
  size = "sm",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "sm" | "xs";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 disabled:opacity-50 disabled:pointer-events-none";
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    xs: "px-2 py-1 text-xs",
  };
  const variants = {
    default:
      "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700",
    primary:
      "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
    danger:
      "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900",
    ghost:
      "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  color = "zinc",
}: {
  children: React.ReactNode;
  color?: "zinc" | "green" | "red" | "amber" | "indigo";
}) {
  const colors = {
    zinc: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
    green: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400",
    amber: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
    indigo: "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400",
  };
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${colors[color]}`}
    >
      {children}
    </span>
  );
}

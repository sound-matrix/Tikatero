"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary:
    "border-transparent bg-[linear-gradient(135deg,var(--coral),var(--orange))] text-white shadow-[0_6px_16px_rgba(242,92,84,0.25)] hover:brightness-105",
  secondary: "border-line bg-white text-ink hover:bg-soft",
  trust: "border-transparent bg-teal text-white hover:brightness-105",
  vip: "border-transparent bg-gold text-ink hover:brightness-105",
} as const;

export type ButtonVariant = keyof typeof variants;

const base =
  "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] px-5 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  href?: undefined;
};

type LinkButtonProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  className?: string;
  href: ComponentProps<typeof Link>["href"];
};

function classes(variant: ButtonVariant | undefined, className: string | undefined) {
  return cn(base, variants[variant ?? "secondary"], className);
}

function isLinkButton(props: ButtonProps | LinkButtonProps): props is LinkButtonProps {
  return props.href !== undefined;
}

export function Button(props: ButtonProps | LinkButtonProps) {
  if (isLinkButton(props)) {
    const { variant, className, href, ...rest } = props;
    return <Link href={href} className={classes(variant, className)} {...rest} />;
  }

  const { variant, className, type = "button", ...rest } = props;
  return <button type={type} className={classes(variant, className)} {...rest} />;
}

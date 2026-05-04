// ABOUTME: Standard shadcn cn() utility — merges Tailwind classes with clsx
// ABOUTME: and resolves conflicts via tailwind-merge.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

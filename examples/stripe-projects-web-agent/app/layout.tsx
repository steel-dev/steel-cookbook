// https://github.com/steel-dev/steel-cookbook/tree/main/examples/stripe-projects-web-agent

import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Web Agent Studio with Stripe Projects",
  description:
    "A live, cited browser research agent provisioned by Stripe Projects.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

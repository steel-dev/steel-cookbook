import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Steel + AI SDK Browser Agent",
  description: "Chat with a browser agent built on Vercel AI SDK v6 and Steel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

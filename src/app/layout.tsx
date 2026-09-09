import type { Metadata } from "next";
import "./globals.css";
import "./voting.css";
import "./hof.css";

export const metadata: Metadata = {
  title: "Horses of Fame — Chapter I: Genesis",
  description: "2,222 Genesis Horses. 22 horses race. The community decides.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

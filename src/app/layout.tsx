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
      <body>{process.env.NEXT_PUBLIC_HOF_TOKEN_MODE === "testnetMockUSDC" && <div role="note" style={{textAlign:"center",padding:12,background:"#17130a",color:"#e8c875"}}>TEST ONLY / NO VALUE — MockUSDC · Owner-trusted voting</div>}{children}</body>
    </html>
  );
}

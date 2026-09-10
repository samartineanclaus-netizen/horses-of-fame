import BrandHeader from "@/components/BrandHeader";
import "./brand.css";
import type { Metadata } from "next";
import "./globals.css";
import "./voting.css";
import "./hof.css";
import "./luxury.css";

const configuredOrigin = process.env.NEXT_PUBLIC_HOF_SITE_URL;
const verifiedOrigin = configuredOrigin && /^https:\/\/[^<>\s]+$/.test(configuredOrigin)
  ? new URL(configuredOrigin) : undefined;

export const metadata: Metadata = {
  ...(verifiedOrigin ? { metadataBase: verifiedOrigin } : {}),
  title: "Horses of Fame — Chapter I: Genesis",
  description: "22 Hall of Fame race horses and 2,200 voting Genesis NFTs. The community decides.",
  icons: { icon: "/brand/hof-logo.webp", apple: "/brand/hof-logo.webp" },
  openGraph: {title:"Horses of Fame — Genesis",description:"22 horses race. The community decides.",...(verifiedOrigin ? {images:[{url:"/brand/hof-banner.webp",width:2048,height:682,alt:"Horses of Fame official banner"}]} : {})},
  twitter: {card:"summary_large_image",title:"Horses of Fame — Genesis",...(verifiedOrigin ? {images:["/brand/hof-banner.webp"]} : {})},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><BrandHeader/>{process.env.NEXT_PUBLIC_HOF_TOKEN_MODE === "testnetMockUSDC" && <div role="note" className="rhTestnetNotice"><span className="rhNetworkAccent rhTestnetBadge">Robinhood Testnet</span> TEST ONLY / NO VALUE — MockUSDC · Owner-trusted voting</div>}<div id="main-content" tabIndex={-1}>{children}</div></body>
    </html>
  );
}

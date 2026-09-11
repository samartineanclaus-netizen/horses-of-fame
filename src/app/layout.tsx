import BrandHeader from "@/components/BrandHeader";
import "./brand.css";
import type { Metadata } from "next";
import "./globals.css";
import "./voting.css";
import "./hof.css";
import "./luxury.css";

const productionOrigin = new URL("https://hof-site.vercel.app");
const socialImage = "https://hof-site.vercel.app/brand/hof-banner.webp";

export const metadata: Metadata = {
  metadataBase: productionOrigin,
  title: "Horses of Fame — Chapter I: Genesis",
  description: "22 Hall of Fame race horses and 2,200 voting Genesis NFTs. The community decides.",
  icons: { icon: "/brand/hof-logo.webp", apple: "/brand/hof-logo.webp" },
  openGraph: {title:"Horses of Fame — Genesis",description:"22 horses race. The community decides.",images:[{url:socialImage,width:2048,height:682,type:"image/webp",alt:"Horses of Fame official banner"}]},
  twitter: {card:"summary_large_image",title:"Horses of Fame — Genesis",images:[{url:socialImage,alt:"Horses of Fame official banner"}]},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><BrandHeader/>{process.env.NEXT_PUBLIC_HOF_TOKEN_MODE === "testnetMockUSDC" && <div role="note" className="rhTestnetNotice"><span className="rhNetworkAccent rhTestnetBadge">Robinhood Testnet</span> TEST ONLY / NO VALUE — MockUSDC · Owner-trusted voting</div>}<div id="main-content" tabIndex={-1}>{children}</div></body>
    </html>
  );
}

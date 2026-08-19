import type { Metadata, Viewport } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Pedi-Growth — Walking check for families and clinicians",
  description:
    "A mobile-first platform that helps families and clinicians capture, understand, and communicate gait-related concerns more consistently and earlier. Not a diagnostic tool.",
  robots: "noindex, nofollow", // MVP: private product
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#1f2d33" },
  ],
};

const THEME_BOOTSTRAP = `(function(){try{var stored=localStorage.getItem("theme");var systemDark=window.matchMedia("(prefers-color-scheme: dark)").matches;var dark=stored==="dark"||((stored==null||stored==="system")&&systemDark);document.documentElement.classList.toggle("dark",dark);document.documentElement.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${sourceSerif.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <div className="clinical-shell">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}

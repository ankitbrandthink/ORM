import type { Metadata } from "next";
import "../styles/globals.css";
import { ThemeProvider } from "./providers";

export const metadata: Metadata = {
  title: "ORM CMS Platform",
  description: "CRO / ORM social listening & reputation management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

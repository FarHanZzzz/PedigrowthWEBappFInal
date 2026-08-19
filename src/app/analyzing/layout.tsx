import AppShell from "@/components/AppShell";

export default function AnalyzingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

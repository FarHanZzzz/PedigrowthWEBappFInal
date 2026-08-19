import AppShell from "@/components/AppShell";

export default function ResultsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

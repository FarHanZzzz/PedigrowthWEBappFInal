import AppShell from "@/components/AppShell";

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

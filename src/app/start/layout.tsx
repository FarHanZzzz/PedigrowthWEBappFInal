import AppShell from "@/components/AppShell";

export default function StartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

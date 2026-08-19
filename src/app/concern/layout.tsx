import AppShell from "@/components/AppShell";

export default function ConcernLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

import AppShell from "@/components/AppShell";

export default function ClinicianEntryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

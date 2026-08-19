import AppShell from "@/components/AppShell";

export default function CaptureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}

import AppSidebar from "@/components/app-sidebar";
export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return <AppSidebar>{children}</AppSidebar>;
}

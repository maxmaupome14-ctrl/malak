import AppSidebar from "@/components/app-sidebar";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppSidebar>{children}</AppSidebar>;
}

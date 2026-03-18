import AppSidebar from "@/components/app-sidebar";
export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return <AppSidebar>{children}</AppSidebar>;
}

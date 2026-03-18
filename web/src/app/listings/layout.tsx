import AppSidebar from "@/components/app-sidebar";

export default function ListingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppSidebar>{children}</AppSidebar>;
}

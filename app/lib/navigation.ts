import { settingsRouteForRole, type AppRole } from "@/app/lib/auth";

// All new UI must use primitives and follow /styleguide.
export type NavItem = {
  label: string;
  href: string;
  icon?: string;
};

export const csrNav: NavItem[] = [
  { label: "Dashboard", href: "/ams" },
  { label: "Customers", href: "/ams/accounts" },
  { label: "Policies", href: "/ams/policies" },
  { label: "Service Cases", href: "/ams/service-cases" },
  { label: "Renewals", href: "/ams/renewals" },
  { label: "Settings", href: settingsRouteForRole("csr") },
];

export const producerNav: NavItem[] = [
  { label: "Dashboard", href: "/crm" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Win Deals", href: "/crm/win-deals" },
  { label: "Tasks", href: "/crm/tasks" },
  { label: "Calendar", href: "/crm/calendar" },
  { label: "Activity", href: "/crm/activity" },
  { label: "Settings", href: settingsRouteForRole("producer") },
];

export const marketingNav: NavItem[] = [
  { label: "Dashboard", href: "/marketing" },
  { label: "Campaigns", href: "/marketing/campaigns" },
  { label: "Templates", href: "/marketing/templates" },
  { label: "Automations", href: "/marketing/automations" },
  { label: "Settings", href: settingsRouteForRole("marketing") },
];

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Users", href: "/admin/users" },
  { label: "Settings", href: settingsRouteForRole("admin") },
];

export function getNavForRole(role: AppRole): NavItem[] {
  switch (role) {
    case "csr":
      return csrNav;
    case "producer":
      return producerNav;
    case "marketing":
      return marketingNav;
    case "admin":
      return adminNav;
    default:
      return [];
  }
}

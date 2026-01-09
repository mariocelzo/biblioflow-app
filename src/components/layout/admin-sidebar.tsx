"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Users,
  MapPin,
  AlertTriangle,
  BookOpen,
  Calendar,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Shield,
  LogOut,
  QrCode,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/admin",
    badge: null,
  },
  {
    title: "Scanner QR",
    icon: QrCode,
    href: "/admin/scanner",
    badge: null,
    highlight: true, // Evidenzia come nuova funzionalità
  },
  {
    title: "Richieste Libri",
    icon: Package,
    href: "/admin/richieste",
    badge: null,
  },
  {
    title: "Gestione Posti",
    icon: MapPin,
    href: "/admin/posti",
    badge: null,
  },
  {
    title: "Prenotazioni",
    icon: Calendar,
    href: "/admin/prenotazioni",
    badge: null,
  },
  {
    title: "Utenti",
    icon: Users,
    href: "/admin/utenti",
    badge: null,
  },
  {
    title: "Prestiti Libri",
    icon: BookOpen,
    href: "/admin/prestiti",
    badge: null,
  },
  {
    title: "Anomalie",
    icon: AlertTriangle,
    href: "/admin/anomalie",
    badge: null,
    badgeVariant: "destructive" as const,
  },
];

const bottomItems = [
  {
    title: "Statistiche",
    icon: BarChart3,
    href: "/admin/statistiche",
  },
  {
    title: "Impostazioni",
    icon: Settings,
    href: "/admin/impostazioni",
  },
];

export function AdminSidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "relative flex flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-64",
        className
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <div>
              <h2 className="text-lg font-bold text-foreground">BiblioFlow</h2>
              <p className="text-xs text-muted-foreground">Admin Panel</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8", collapsed && "mx-auto")}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "bg-primary/10 text-primary hover:bg-primary/15",
                  collapsed && "justify-center px-2"
                )}
              >
                <Icon className={cn("h-5 w-5 flex-shrink-0")} />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant={item.badgeVariant || "secondary"}
                        className="h-5 min-w-5 px-1 text-xs"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Button>
            </Link>
          );
        })}

        <Separator className="my-3" />

        {/* Bottom Items */}
        {bottomItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "bg-primary/10 text-primary",
                  collapsed && "justify-center px-2"
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Info & Logout */}
      <div className="border-t p-2">
        <Link href="/">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 text-muted-foreground hover:text-foreground",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Torna all&apos;App</span>}
          </Button>
        </Link>
      </div>
    </div>
  );
}

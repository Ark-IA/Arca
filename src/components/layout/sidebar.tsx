"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  CheckSquare,
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ChevronsLeft,
  Radio,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: "roleOwner",
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    labelKey: "roleAdmin",
    // Primary-tinted: significant but not as scarce as owner.
    className:
      "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    labelKey: "roleAgent",
    // Neutral slate: the operational default.
    className:
      "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    labelKey: "roleViewer",
    // Muted slate: read-only role; visually quieter than agent.
    className:
      "border-border bg-card text-muted-foreground",
  },
};
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  /**
   * When true, the nav row renders a small "Beta" chip after the label.
   * Purely informational — doesn't affect routing or access.
   */
  beta?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
  { href: "/notifications", labelKey: "notifications", icon: Bell },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  // Empresas va pegada a Contactos: son las dos caras de la misma ficha
  // (la persona y dónde trabaja) y quien busca una suele querer la otra.
  { href: "/companies", labelKey: "companies", icon: Building2 },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
  { href: "/tasks", labelKey: "tasks", icon: CheckSquare },
  { href: "/calendar", labelKey: "calendar", icon: CalendarDays },
  { href: "/broadcasts", labelKey: "broadcasts", icon: Radio },
  { href: "/automations", labelKey: "automations", icon: Zap },
  { href: "/flows", labelKey: "flows", icon: Workflow, beta: true },
  { href: "/agents", labelKey: "aiAgents", icon: Bot },
];

const bottomNavItems = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

interface SidebarProps {
  /** Controlled on mobile by the Header's hamburger button. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from "next-intl";

/**
 * Clave del ancho plegado en localStorage.
 *
 * El estado vive en el navegador, no en la base: es una preferencia de
 * ESTE dispositivo. En una pantalla chica se quiere plegado y en un monitor
 * grande desplegado, y guardarlo en el perfil obligaria a la misma eleccion
 * en los dos. Mismo criterio que usa el tema (`wacrm.theme`).
 */
const CLAVE_PLEGADO = "wacrm.sidebar.collapsed";

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  // Arranca desplegado y se corrige en el primer efecto. Leer localStorage
  // durante el render romperia la hidratacion: el servidor no lo tiene y
  // React se quejaria de que el HTML no coincide.
  const [plegado, setPlegado] = useState(false);

  useEffect(() => {
    try {
      setPlegado(localStorage.getItem(CLAVE_PLEGADO) === "1");
    } catch {
      // localStorage puede lanzar en navegacion privada; se queda desplegado.
    }
  }, []);

  const alternarPlegado = () => {
    setPlegado((v) => {
      const siguiente = !v;
      try {
        localStorage.setItem(CLAVE_PLEGADO, siguiente ? "1" : "0");
      } catch {}
      return siguiente;
    });
  };
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  // Only surface the account-name strip when it actually carries
  // information. A solo user's personal account is named after them
  // (the 017 signup trigger seeds it from `full_name`), so showing it
  // here would just duplicate the user name in the footer below. Once
  // the account is renamed or the user joins a shared account, the
  // name diverges and the strip becomes meaningful — that's the signal
  // we gate on. Wait for the profile fetch to settle first, otherwise
  // the strip flashes in once the row resolves (a layout jump).
  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  // Close the drawer when route changes — users opened it to navigate,
  // so once they pick a destination the drawer should get out of the way.
  useEffect(() => {
    onClose?.();
    // Only pathname drives this — onClose identity doesn't need to re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open on
  // mobile. No-ops on desktop because the sidebar isn't positioned there.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop — only exists on mobile and only when open. Clicking
          it closes the drawer. Hidden from lg+ since the sidebar is
          part of the main flex row there. */}
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          // Mobile: fixed drawer that slides in from the left.
          "superficie-holografica fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-border bg-card",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, always visible — reset all the mobile framing.
          // El ancho se anima solo en lg+: en movil es un cajon que se
          // desliza y animar tambien el ancho encimaria dos movimientos.
          "lg:static lg:z-0 lg:translate-x-0 lg:transition-[width] lg:duration-200",
          plegado ? "lg:w-16" : "lg:w-60",
          // `relative` para poder anclar el tirador de plegado al borde.
          "lg:relative",
        )}
        aria-label="Primary"
      >
        {/* Tirador de plegado.
            Va montado SOBRE el borde derecho, a la altura del logotipo, y no
            dentro del menu: plegada la barra mide 64px y ahi no caben el
            monograma y un boton uno al lado del otro. Colgado del borde se ve
            igual en los dos estados y no le quita sitio a nada.
            Chevrones dobles y no una hamburguesa: la hamburguesa significa
            "abrir un menu", y esto pliega uno que ya esta abierto. */}
        <button
          type="button"
          onClick={alternarPlegado}
          aria-expanded={!plegado}
          aria-label={plegado ? t("expand") : t("collapse")}
          title={plegado ? t("expand") : t("collapse")}
          className={cn(
            "absolute -right-3 top-[1.375rem] z-10 hidden size-6 items-center justify-center lg:flex",
            "rounded-full border border-border bg-card text-muted-foreground shadow-md",
            "transition-all hover:border-primary/50 hover:bg-primary hover:text-primary-foreground hover:shadow-lg hover:shadow-primary/20",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <ChevronsLeft
            className={cn(
              "size-3.5 transition-transform duration-200",
              // Un solo icono que gira, en vez de dos que se intercambian: la
              // rotacion se anima y deja claro que es el mismo control.
              plegado && "rotate-180",
            )}
          />
        </button>

        {/* Logo row. On mobile we put a close button here; on desktop the
            close button is hidden since the sidebar is always-visible. */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4",
            plegado && "lg:justify-center lg:px-0",
          )}
        >
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            title={plegado ? t("title") : undefined}
          >
            {/* El monograma circular de ARK-IA, el mismo del favicon. A este
                tamano un logotipo horizontal seria ilegible; el monograma no. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/favicon.png"
              alt=""
              aria-hidden="true"
              className="h-8 w-8 shrink-0 rounded-full"
            />
            <span
              className={cn(
                "text-sm font-semibold text-foreground",
                plegado && "lg:hidden",
              )}
            >
              {t("title")}
            </span>
          </Link>

          {/* Cerrar el cajon: solo movil. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main navigation */}
        <nav className="scroll-invisible flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              const showUnreadDot =
                item.href === "/inbox" && totalUnread > 0 && !isActive;

              // Unlike the inbox dot, the notifications count stays visible
              // even while the page is active — it reflects unread state
              // (cleared by marking notifications read), not "currently
              // viewing this section".
              const showNotificationBadge =
                item.href === "/notifications" && unreadNotifications > 0;

              return (
                <li key={item.href} className="relative">
                  <Link
                    href={item.href}
                    // Plegado, el nombre desaparece: el title lo devuelve al
                    // pasar el mouse. Sin esto la barra queda como una fila de
                    // iconos que hay que adivinar.
                    title={plegado ? t(item.labelKey as string) : undefined}
                    className={cn(
                      // Taller on mobile so fingers can hit the row reliably (≥44px).
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                      plegado && "lg:justify-center lg:gap-0 lg:px-0",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className={cn("flex-1", plegado && "lg:hidden")}>
                      {t(item.labelKey as string)}
                    </span>
                    {item.beta && (
                      <span
                        aria-label={t("beta")}
                        className={cn(
                          "rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300",
                          plegado && "lg:hidden",
                        )}
                      >
                        {t("beta")}
                      </span>
                    )}
                    {/* Plegados, el punto y el contador se pegan al icono en
                        vez de ocupar una columna propia: en 64px de ancho no
                        entran al lado del texto que ya no existe. */}
                    {showUnreadDot && (
                      <span
                        aria-label={t("unreadConversations", { count: totalUnread })}
                        className={cn(
                          "relative flex h-2 w-2",
                          plegado && "lg:absolute lg:right-3 lg:top-2",
                        )}
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                    )}
                    {showNotificationBadge && (
                      <span
                        aria-label={t("unreadNotifications", { count: unreadNotifications })}
                        className={cn(
                          "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground",
                          plegado && "lg:absolute lg:right-1.5 lg:top-1 lg:h-4 lg:min-w-4 lg:text-[9px]",
                        )}
                      >
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="my-4 border-t border-border" />

          <ul className="flex flex-col gap-1">
            {bottomNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={plegado ? t(item.labelKey as string) : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2",
                      plegado && "lg:justify-center lg:gap-0 lg:px-0",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className={cn(plegado && "lg:hidden")}>
                      {t(item.labelKey as string)}
                    </span>
                  </Link>
                </li>
              );
            })}

            {/* El control de plegado ya no vive aca: subio al borde derecho
                del encabezado, colgado sobre la linea divisoria. */}
          </ul>
        </nav>

        {/* User section */}
        <div className="shrink-0 border-t border-border p-3">
          {/* Account name display — surfaced only when the account
              name differs from the user's own name (see
              `showAccountStrip`). For a default solo account the two
              match, so we hide it to avoid duplicating the user name
              below; for renamed or shared accounts it tells the user
              which account they're acting in. */}
          {showAccountStrip && account?.name && !plegado ? (
            <div className="mb-2 flex items-center gap-2 px-3 text-xs text-muted-foreground">
              <UsersRound className="size-3.5 shrink-0" />
              {/* `title=` exposes the full name on hover when it
                  gets truncated (long account names + narrow
                  sidebars). Cheap a11y win. */}
              <span className="truncate" title={account.name}>
                {account.name}
              </span>
              {accountRole ? (
                // Always render the chip — owners used to be
                // invisible here, which made them indistinguishable
                // from admins at a glance. Now everyone sees their
                // role (with a colour cue) regardless of tier.
                (() => {
                  const meta = ROLE_CHIP[accountRole];
                  const Icon = meta.icon;
                  return (
                    <span
                      className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.className}`}
                    >
                      <Icon className="size-3" />
                      {t(meta.labelKey as string)}
                    </span>
                  );
                })()
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              title={plegado ? (profile?.full_name ?? profile?.email ?? undefined) : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:outline-none data-popup-open:bg-muted/60",
                plegado && "lg:justify-center lg:gap-0 lg:px-0",
              )}
            >
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? t("defaultAvatar")}
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                  {profile?.full_name?.charAt(0)?.toUpperCase() ??
                    profile?.email?.charAt(0)?.toUpperCase() ??
                    "U"}
                </AvatarFallback>
              </Avatar>
              <div className={cn("min-w-0 flex-1", plegado && "lg:hidden")}>
                <p className="truncate text-sm font-medium text-foreground">
                  {profile?.full_name ?? t("defaultUser")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? ""}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=profile"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <User className="size-4" />
                {t("menuProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings?tab=whatsapp"
                    onClick={onClose}
                    className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                  />
                }
              >
                <Settings className="size-4" />
                {t("menuSettings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={signOut}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <LogOut className="size-4" />
                {t("menuSignOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}

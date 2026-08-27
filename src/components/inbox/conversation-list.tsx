"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import { Search, ChevronDown, X, MessageCircle, Inbox } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/*
 * Lucide quito los iconos de marca por motivos de marca registrada, asi que
 * los de Facebook e Instagram se dibujan aqui. Son de una sola forma cada
 * uno: pesan menos que traer una libreria de iconos de marcas entera.
 */
function IconoFacebook({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12Z" />
    </svg>
  );
}

function IconoInstagram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Bandejas por canal.
 *
 * Son pestanas y no un filtro mas del menu desplegable porque la division
 * por canal es la principal: quien atiende Instagram no quiere ver WhatsApp
 * mezclado, y las metricas se leen por canal. Un filtro escondido en un
 * menu no comunica esa separacion.
 */
const CANALES_BANDEJA = [
  { value: "todos", etiqueta: "Todos", icono: Inbox },
  { value: "whatsapp", etiqueta: "WhatsApp", icono: MessageCircle },
  { value: "facebook", etiqueta: "Facebook", icono: IconoFacebook },
  { value: "instagram", etiqueta: "Instagram", icono: IconoInstagram },
] as const;

type CanalDeBandeja = (typeof CANALES_BANDEJA)[number]["value"];

const CLAVE_CANAL = "wacrm.inbox.canal";

/**
 * Distintivo del canal, en la esquina del avatar.
 *
 * Cada canal lleva su color de marca y no el acento del producto: el punto
 * es reconocerlo sin leer, y el verde de WhatsApp, el azul de Facebook y el
 * rosa de Instagram ya estan aprendidos por todo el mundo.
 */
function DistintivoDeCanal({ canal }: { canal: string }) {
  const estilos: Record<string, { fondo: string; Icono: React.ComponentType<{ className?: string }> }> = {
    whatsapp: { fondo: "bg-[#25D366]", Icono: MessageCircle },
    facebook: { fondo: "bg-[#1877F2]", Icono: IconoFacebook },
    instagram: { fondo: "bg-[#E1306C]", Icono: IconoInstagram },
  };
  const e = estilos[canal] ?? estilos.whatsapp;
  const { Icono } = e;
  return (
    <span
      title={canal}
      className={cn(
        "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white ring-2 ring-card",
        e.fondo,
      )}
    >
      <Icono className="h-2.5 w-2.5" />
    </span>
  );
}
import { formatDistanceToNow } from "date-fns";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { COLOR_DE_COLA, colasDe, esMia, useColas } from "@/hooks/use-colas";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-primary",
  pending: "bg-amber-500",
  closed: "bg-muted-foreground",
};



type InboxFilter = ConversationStatus | "all" | "unread" | "mis-colas";

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  
  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
    { label: t("filterMisColas"), value: "mis-colas" },
    { label: t("filterAll"), value: "all" },
    { label: t("filterUnread"), value: "unread" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterClosed"), value: "closed" },
  ], [t]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");

  // Colas. `esMia` decide qué le toca a cada uno; acá solo se resuelve
  // quién soy y en qué colas estoy.
  const { user, accountRole } = useAuth();
  const { colas } = useColas();
  const misColas = useMemo(() => colasDe(colas, user?.id), [colas, user?.id]);
  const nombresDeCola = useMemo(
    () => new Map(colas.map((c) => [c.id, c])),
    [colas],
  );

  /**
   * Un asesor arranca viendo lo suyo; quien administra, todo.
   *
   * Se aplica UNA sola vez y no en cada render: si se forzara siempre, el
   * asesor no podría cambiar a «Todas» — el filtro se le revertiría solo al
   * siguiente render y parecería que el desplegable está roto.
   */
  const yaSeEligioInicial = useRef(false);
  useEffect(() => {
    if (yaSeEligioInicial.current || !accountRole) return;
    yaSeEligioInicial.current = true;
    if (accountRole === "agent") setFilter("mis-colas");
  }, [accountRole]);
  // Bandeja por canal. Se guarda en el navegador para que quien atiende
  // solo Instagram no tenga que volver a elegirlo en cada recarga.
  const [canal, setCanal] = useState<CanalDeBandeja>("todos");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_CANAL);
      if (guardado && CANALES_BANDEJA.some((c) => c.value === guardado)) {
        setCanal(guardado as CanalDeBandeja);
      }
    } catch {
      // Navegacion privada: se queda en "todos".
    }
  }, []);

  const elegirCanal = useCallback((c: CanalDeBandeja) => {
    setCanal(c);
    try {
      localStorage.setItem(CLAVE_CANAL, c);
    } catch {}
  }, []);

  /**
   * Canal que llega en la dirección, desde el aviso de mensaje nuevo.
   *
   * Cuando entra algo por un canal que no se está mirando, el aviso ofrece
   * "Ver" y trae a la bandeja con `?canal=facebook`. Sin leerlo acá, ese botón
   * dejaría en la bandeja con el filtro anterior y el mensaje seguiría
   * invisible — que es exactamente el problema que el aviso venía a resolver.
   */
  useEffect(() => {
    const pedido = new URLSearchParams(window.location.search).get("canal");
    if (!pedido || !CANALES_BANDEJA.some((c) => c.value === pedido)) return;
    elegirCanal(pedido as CanalDeBandeja);
    // Se limpia de la barra: si se quedara, recargar volvería a forzar ese
    // canal y no se podría cambiar de forma persistente.
    const url = new URL(window.location.href);
    url.searchParams.delete("canal");
    window.history.replaceState({}, "", url.toString());
  }, [elegirCanal]);
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  /**
   * Cuántas conversaciones hay en un canal.
   *
   * Sale de las que ya están cargadas, no de una consulta aparte: es el mismo
   * dato y evita un viaje más al servidor cada vez que se abre el selector.
   */
  const cuentaDeCanal = useCallback(
    (valor: CanalDeBandeja) =>
      valor === "todos"
        ? conversations.length
        : conversations.filter((x) => (x.channel ?? "whatsapp") === valor).length,
    [conversations],
  );

  /**
   * Sin leer por canal.
   *
   * Es el dato que de verdad importa en el selector: el total dice cuántas
   * conversaciones hay, pero lo que hace falta saber es dónde hay algo
   * esperando. Con el selector filtrado en WhatsApp, un mensaje de Facebook
   * era invisible -- sonaba el aviso y no había forma de ver de dónde venía.
   */
  const sinLeerDeCanal = useCallback(
    (valor: CanalDeBandeja) =>
      conversations
        .filter((x) => valor === "todos" || (x.channel ?? "whatsapp") === valor)
        .reduce((n, x) => n + (x.unread_count > 0 ? 1 : 0), 0),
    [conversations],
  );

  /**
   * ¿Hay algo sin leer en un canal que NO se está mirando?
   *
   * Con el selector en "Todos" no aplica: ahí se ve todo. Solo tiene sentido
   * cuando la lista está filtrada, que es justo cuando un mensaje de otro
   * canal desaparece de la vista.
   */
  const hayEnOtroCanal = useMemo(() => {
    if (canal === "todos") return false;
    return conversations.some(
      (c) => c.unread_count > 0 && (c.channel ?? "whatsapp") !== canal,
    );
  }, [conversations, canal]);

  const filtered = useMemo(() => {
    let result = conversations;

    // El canal se filtra PRIMERO, antes que estado o busqueda: es la
    // division principal de la bandeja, no un filtro mas. Las
    // conversaciones anteriores a los canales multiples no tienen el campo
    // y son de WhatsApp.
    if (canal !== "todos") {
      result = result.filter((c) => (c.channel ?? "whatsapp") === canal);
    }

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter === "mis-colas") {
      result = result.filter((c) => esMia(c, user?.id, misColas));
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
    // `canal` va en las dependencias: sin él este memo nunca se recalculaba al
    // cambiar de canal, y el cambio solo se veía al salir del módulo y volver
    // -- que es lo que remonta el componente y descarta el valor memorizado.
  }, [
    conversations,
    canal,
    filter,
    search,
    selectedTagIds,
    selectedCompany,
    user?.id,
    misColas,
  ]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    // w-full on mobile so the list occupies the whole viewport when it's
    // the single pane showing; fixed 320px on desktop where it shares the
    // row with the thread + contact sidebar.
    <div className="flex h-full w-full flex-col border-r border-border bg-card lg:w-80">
      {/* Bandejas por canal. El contador de cada una sale de las
          conversaciones ya cargadas, no de una consulta aparte: es el mismo
          dato y evita un viaje mas al servidor en cada cambio de pestana. */}
      <div className="shrink-0 border-b border-border p-3 pb-2">
        <Select
          value={canal}
          onValueChange={(v) => v && elegirCanal(v as CanalDeBandeja)}
        >
          <SelectTrigger
            aria-label="Canal de la bandeja"
            className={cn(
              "w-full transition-colors",
              // El selector toma el color del canal elegido: en una bandeja
              // compartida, saber de un vistazo cuál estás mirando evita
              // contestar en el canal equivocado.
              canal === "todos"
                ? "border-border bg-muted text-foreground hover:border-primary/40"
                : "border-primary/30 bg-primary/10 font-medium text-primary hover:border-primary/50",
            )}
          >
            <SelectValue>
              {(() => {
                const c = CANALES_BANDEJA.find((x) => x.value === canal)!;
                const Icono = c.icono;
                return (
                  <span className="flex items-center gap-2">
                    <Icono className="h-4 w-4 shrink-0" />
                    {c.etiqueta}
                    {/* Aviso de que hay algo sin leer en OTRO canal: un punto
                        que late en el propio selector. Es lo único visible
                        cuando la lista está filtrada y el mensaje entró por un
                        canal que no se está mirando. */}
                    {hayEnOtroCanal && (
                      <span className="relative ml-1 flex size-2 shrink-0">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
                        <span className="relative inline-flex size-2 rounded-full bg-primary" />
                      </span>
                    )}
                    <span className="ml-auto rounded-full bg-background/60 px-1.5 text-[10px] font-semibold tabular-nums">
                      {cuentaDeCanal(canal)}
                    </span>
                  </span>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          {/* `alignItemWithTrigger={false}` es lo que lo vuelve instantáneo.
              Por defecto Base UI alinea la opción elegida con el disparador:
              mide el contenido, calcula el desplazamiento y lo anima, y eso
              es medio segundo entre el clic y el cambio de canal. Sin esa
              alineación se abre como un desplegable normal, hacia abajo y de
              inmediato. */}
          <SelectContent alignItemWithTrigger={false}>
            {CANALES_BANDEJA.map((c) => {
              const Icono = c.icono;
              const cuantas = cuentaDeCanal(c.value);
              const sinLeer = sinLeerDeCanal(c.value);
              return (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex w-full items-center gap-2">
                    <Icono className="h-4 w-4 shrink-0" />
                    {c.etiqueta}

                    {/* Sin leer va PRIMERO y en verde: es lo que hay que
                        atender. El total va detrás, apagado, como referencia. */}
                    {sinLeer > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                        {sinLeer}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] tabular-nums text-muted-foreground",
                        sinLeer > 0 ? "" : "ml-auto",
                      )}
                    >
                      {cuantas}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Search + Filter */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder={t("searchPlaceholder")}
            className="border-border bg-muted pl-9 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted">
                {activeFilter?.label ?? t("filterAll")}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="border-border bg-popover"
            >
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                  className={cn(
                    "text-sm",
                    filter === opt.value
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedTagIds.length > 0
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("tags")}
                {selectedTagIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {selectedTagIds.length}
                  </span>
                )}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onCheckedChange={() => toggleTag(t.id)}
                    className="text-sm text-popover-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      <span className="truncate">{t.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {companies.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "inline-flex max-w-40 items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  selectedCompany
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="truncate">{selectedCompany ?? t("company")}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 border-border bg-popover"
              >
                <DropdownMenuItem
                  onClick={() => setSelectedCompany(null)}
                  className={cn(
                    "text-sm",
                    selectedCompany === null
                      ? "text-primary"
                      : "text-popover-foreground"
                  )}
                >
                  {t("allCompanies")}
                </DropdownMenuItem>
                {companies.map((co) => (
                  <DropdownMenuItem
                    key={co}
                    onClick={() => setSelectedCompany(co)}
                    className={cn(
                      "text-sm",
                      selectedCompany === co
                        ? "text-primary"
                        : "text-popover-foreground"
                    )}
                  >
                    <span className="truncate">{co}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasContactFilters && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedTagIds.map((id) => {
              const tag = tagsById.get(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleTag(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag?.color ?? "var(--muted-foreground)" }}
                  />
                  <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
            {selectedCompany && (
              <button
                onClick={() => setSelectedCompany(null)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground hover:bg-muted/70"
              >
                <span className="max-w-24 truncate">{selectedCompany}</span>
                <X className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={clearContactFilters}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {t("clearAll")}
            </button>
          </div>
        )}
      </div>

      {/* Conversation Items.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("noConversations")}</p>
            {/* Un asesor solo ve lo que se le asignó o lo que espera en una de
                sus colas. Sin nada de eso, la bandeja está vacía y sin esta
                línea parece rota: la misma pantalla que ve alguien con
                trabajo pendiente y alguien a quien no le llegó ninguno. */}
            {accountRole === "agent" && conversations.length === 0 && (
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {t("vacioAsesor")}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                cola={conv.cola_id ? nombresDeCola.get(conv.cola_id) : undefined}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  /** Cola en la que espera, ya resuelta a nombre y color. */
  cola?: { name: string; color: string };
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
}

function ConversationItem({
  conversation,
  cola,
  isActive,
  onSelect,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50",
        isActive && "border-l-2 border-primary bg-muted/70"
      )}
    >
      {/* Avatar con distintivo de canal.
          El distintivo va pegado al avatar y no en una columna aparte: en la
          vista "Todos" hay que poder identificar el canal de un vistazo sin
          que cada fila gane ancho. */}
      <div className="relative shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
          {contact?.avatar_url ? (
            <img
              src={contact.avatar_url}
              alt={displayName}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </div>
        <DistintivoDeCanal canal={conversation.channel ?? "whatsapp"} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {displayName}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo}</span>
        </div>
        {/* La cola, cuando la hay.
            Va en su propia línea y no junto al nombre: en la vista de todas,
            saber que algo espera en Ventas cambia quién debería abrirlo, y
            apretado contra el nombre se pierde entre nombres largos. */}
        {cola && (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                COLOR_DE_COLA[cola.color] ?? COLOR_DE_COLA.slate,
              )}
            />
            <span className="truncate">{cola.name}</span>
          </span>
        )}

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {conversation.last_message_text || t("noMessagesYet")}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {conversation.unread_count > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {conversation.unread_count}
              </span>
            )}
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                STATUS_COLORS[conversation.status]
              )}
              title={conversation.status}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

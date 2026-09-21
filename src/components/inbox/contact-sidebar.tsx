"use client";

/**
 * El panel derecho de la bandeja: todo lo que hay que saber del contacto
 * sin salir de la conversación.
 *
 * Antes era una columna larga con todo apilado —datos, etiquetas,
 * oportunidades, notas—, y el resultado era que lo de abajo no lo veía
 * nadie: para llegar a las notas había que desplazarse por encima de dos
 * secciones que casi nunca hacían falta. Y lo que sí hace falta a diario en
 * mitad de una conversación —qué pasó antes con esta persona, qué quedó
 * pendiente— no estaba.
 *
 * Ahora son pestañas, como en los CRM que la gente ya sabe usar: cada una
 * es una pregunta distinta y ninguna tapa a las otras.
 *
 *   Datos        ¿quién es y cómo lo contacto?
 *   Actividad    ¿qué pasó antes con esta persona?
 *   Tareas       ¿qué quedó pendiente?
 *   Negocios     ¿qué está en juego?
 *   Archivos     ¿qué nos mandó o le mandamos?
 *   Notas        ¿qué anotó el equipo?
 *
 * Los paneles de actividad, tareas, archivos y notas son LOS MISMOS que usa
 * la ficha completa del contacto. No hay una segunda versión que se pueda
 * quedar atrás: si mañana la línea de tiempo aprende un tipo de evento
 * nuevo, aparece en los dos sitios el mismo día.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canSendMessages } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import type { Contact, Deal, Tag } from "@/types";
import {
  Activity,
  ArrowUpRight,
  CheckSquare,
  Copy,
  Check,
  DollarSign,
  FileText,
  Mail,
  Phone,
  PhoneCall,
  StickyNote,
  Tag as TagIcon,
  User,
  type LucideIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslations } from "next-intl";

import { PanelLineaDeTiempo } from "@/components/registros/panel-linea-de-tiempo";
import { PanelTareasDeContacto } from "@/components/registros/panel-tareas-de-contacto";
import { PanelAdjuntos } from "@/components/registros/panel-adjuntos";
import { PanelNotas } from "@/components/registros/panel-notas";
import { AvisoProximaGestion } from "@/components/registros/aviso-proxima-gestion";
import { useTelefono } from "@/components/telefonia/contexto-telefono";

interface ContactSidebarProps {
  contact: Contact | null;
}

type Pestana = "datos" | "actividad" | "tareas" | "negocios" | "archivos" | "notas";

const PESTANAS: { id: Pestana; etiqueta: string; icono: LucideIcon }[] = [
  { id: "datos", etiqueta: "Datos", icono: User },
  { id: "actividad", etiqueta: "Actividad", icono: Activity },
  { id: "tareas", etiqueta: "Tareas", icono: CheckSquare },
  { id: "negocios", etiqueta: "Negocios", icono: DollarSign },
  { id: "archivos", etiqueta: "Archivos", icono: FileText },
  { id: "notas", etiqueta: "Notas", icono: StickyNote },
];

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const tThread = useTranslations("Inbox.messageThread");
  const { accountRole } = useAuth();
  const puedeEditar = accountRole ? canSendMessages(accountRole) : false;

  // La pestaña abierta, junto al contacto AL QUE PERTENECE.
  //
  // Al cambiar de conversación hay que volver a Datos: quedarse en
  // «Archivos» mostrando los de otra persona es la clase de error que no se
  // nota hasta que alguien menciona un archivo que el cliente nunca mandó.
  //
  // Se guarda el par y se decide al dibujar, en vez de reponer la pestaña
  // desde un efecto. Con el efecto habría un instante —el que va entre
  // dibujar y correr el efecto— en el que la pestaña vieja ya está en
  // pantalla con el contacto nuevo, y ese instante es justamente el error
  // que se quiere evitar.
  const [elegida, setElegida] = useState<{ id: string | null; pestana: Pestana }>({
    id: null,
    pestana: "datos",
  });
  const pestana = elegida.id === (contact?.id ?? null) ? elegida.pestana : "datos";
  const setPestana = (p: Pestana) => setElegida({ id: contact?.id ?? null, pestana: p });

  if (!contact) {
    return (
      <div className="border-border bg-card flex h-full w-88 items-center justify-center border-l">
        <p className="text-muted-foreground px-6 text-center text-sm">
          {tThread("selectConversation")}
        </p>
      </div>
    );
  }

  return (
    <div className="border-border bg-card flex h-full w-88 flex-col border-l">
      <Cabecera contact={contact} />

      {/* Las pestañas. Icono y texto: solo iconos obliga a adivinar, y en
          una columna de este ancho los seis nombres entran en dos filas. */}
      <div className="border-border grid shrink-0 grid-cols-3 gap-px border-b">
        {PESTANAS.map((p) => {
          const Icono = p.icono;
          const activa = pestana === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                activa
                  ? "text-primary border-primary border-b-2 -mb-px"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icono className="h-4 w-4" />
              {p.etiqueta}
            </button>
          );
        })}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {pestana === "datos" && <PanelDatos contact={contact} />}

          {pestana === "actividad" && (
            <PanelLineaDeTiempo tipo="contact" registroId={contact.id} conChat={false} />
          )}

          {pestana === "tareas" && (
            <PanelTareasDeContacto contactId={contact.id} puedeEditar={puedeEditar} />
          )}

          {pestana === "negocios" && <PanelNegocios contactId={contact.id} />}

          {pestana === "archivos" && (
            <PanelAdjuntos
              tipo="contact"
              registroId={contact.id}
              puedeEditar={puedeEditar}
            />
          )}

          {pestana === "notas" && (
            <PanelNotas
              tipo="contact"
              registroId={contact.id}
              puedeEditar={puedeEditar}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Quién es, y las dos cosas que se hacen con eso: llamarlo y escribirle.
 *
 * Va fuera de las pestañas a propósito. El nombre y el teléfono son lo que
 * se mira mientras se habla, y esconderlos detrás de una pestaña obligaría
 * a volver a «Datos» cada vez que hay que dictar un número.
 */
function Cabecera({ contact }: { contact: Contact }) {
  const [copiado, setCopiado] = useState(false);
  const telefono = useTelefono();
  const puedeLlamar = !!telefono?.disponible && !!contact.phone;

  // Con nombre de usuario no hay ni nombre de perfil ni teléfono: el
  // identificador es mejor etiqueta que una cadena vacía, que dejaría la
  // inicial del avatar en blanco.
  const nombre =
    contact.name ||
    contact.phone ||
    contact.whatsapp_user_id ||
    contact.whatsapp_id ||
    "?";

  const copiarTelefono = useCallback(async () => {
    if (!contact.phone) return;
    try {
      await navigator.clipboard.writeText(contact.phone);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin portapapeles (páginas no seguras) el número igual se ve y se
      // puede seleccionar a mano. No hace falta avisar de nada.
    }
  }, [contact.phone]);

  return (
    <div className="border-border from-primary/10 via-primary/5 shrink-0 border-b bg-gradient-to-r to-transparent p-3">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {contact.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contact.avatar_url}
              alt={nombre}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            nombre.charAt(0).toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">{nombre}</p>
          {contact.company && (
            <p className="text-muted-foreground truncate text-xs">{contact.company}</p>
          )}
        </div>

        {/* A la ficha completa. Es el puente entre las dos pantallas: lo que
            no cabe en esta columna —campos personalizados, etiquetas,
            próxima gestión— está a un clic y con dirección propia. */}
        <Link
          href={`/contacts/${contact.id}`}
          title="Abrir la ficha completa"
          className="text-muted-foreground hover:text-primary hover:bg-muted rounded-md p-1.5 transition-colors"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {contact.phone && (
        <div className="mt-2 flex gap-1">
          <button
            onClick={copiarTelefono}
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{contact.phone}</span>
            {copiado ? (
              <Check className="text-primary h-3 w-3 shrink-0" />
            ) : (
              <Copy className="h-3 w-3 shrink-0" />
            )}
          </button>

          {/* Llamar solo aparece con extensión asignada. Un botón que no
              puede funcionar es peor que ninguno: se pulsa, no pasa nada, y
              queda la duda de si falló la llamada o el CRM. */}
          {puedeLlamar && (
            <button
              // Mismo saneado que la ficha del contacto: Asterisk no entiende
              // espacios ni paréntesis, y se conservan '+', '*' y '#' porque
              // forman parte de números internacionales y códigos de central.
              onClick={() => telefono?.llamar(contact.phone!.replace(/[^\d*#+]/g, ""))}
              title="Llamar"
              className="text-primary hover:bg-primary/10 rounded-md px-2 py-1.5 transition-colors"
            >
              <PhoneCall className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Datos de contacto, etiquetas y qué toca hacer después. */
function PanelDatos({ contact }: { contact: Contact }) {
  const router = useRouter();
  const tSidebar = useTranslations("Inbox.sidebar");
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id);
      if (!vigente || !data) return;
      setTags(
        data
          .filter((ct: Record<string, unknown>) => ct.tags)
          .map((ct: Record<string, unknown>) => ({
            ...(ct.tags as Tag),
            contact_tag_id: ct.id as string,
          })),
      );
    })();
    // Al cambiar de contacto, la respuesta de la consulta anterior puede
    // llegar tarde y pintar las etiquetas de quien ya no se está mirando.
    return () => {
      vigente = false;
    };
  }, [contact.id]);

  return (
    <div className="space-y-4">
      {/* Lo primero no es el correo: es qué sigue con esta persona. Es el
          mismo aviso que abre la ficha completa. */}
      <AvisoProximaGestion
        contactId={contact.id}
        onIr={() => {
          // Desde la bandeja no hay pestaña donde agendar: se abre la ficha
          // completa, que sí la tiene, ya puesta en esa pestaña.
          router.push(`/contacts/${contact.id}?tab=next`);
        }}
      />

      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors"
        >
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </a>
      )}

      <div>
        <p className="text-muted-foreground flex items-center gap-1.5 px-1 text-[11px] font-medium tracking-wider uppercase">
          <TagIcon className="h-3 w-3" />
          {tSidebar("tags")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1 px-1">
          {tags.length === 0 ? (
            <p className="text-muted-foreground text-xs">{tSidebar("noTags")}</p>
          ) : (
            tags.map((tag) => (
              <span
                key={tag.contact_tag_id}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Las oportunidades abiertas con este contacto. */
function PanelNegocios({ contactId }: { contactId: string }) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (!vigente) return;
      setDeals(data ?? []);
      setCargando(false);
    })();
    return () => {
      vigente = false;
    };
  }, [contactId]);

  if (cargando) {
    return <p className="text-muted-foreground px-1 text-xs">Cargando…</p>;
  }

  if (deals.length === 0) {
    return <p className="text-muted-foreground px-1 text-xs">{tSidebar("noDeals")}</p>;
  }

  return (
    <div className="space-y-2">
      {deals.map((deal) => (
        <div key={deal.id} className="bg-muted rounded-lg px-3 py-2">
          <p className="text-foreground text-sm font-medium">{deal.title}</p>
          <div className="text-muted-foreground mt-1 flex items-center justify-between gap-2 text-xs">
            <span className="tabular-nums">
              {deal.currency ?? "$"}
              {deal.value.toLocaleString()}
            </span>
            {deal.stage && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                style={{
                  backgroundColor: `${deal.stage.color}20`,
                  color: deal.stage.color,
                }}
              >
                {deal.stage.name}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

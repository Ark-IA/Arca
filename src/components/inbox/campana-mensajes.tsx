'use client';

/**
 * Campanita de mensajes pendientes, en el encabezado.
 *
 * El aviso emergente dura unos segundos y desaparece: sirve para enterarse en
 * el momento, no para revisar después. Esta campanita es lo contrario — está
 * siempre, dice cuántos mensajes esperan y de qué canal, y lleva a la
 * conversación exacta.
 *
 * Va en el encabezado y no en el menú lateral porque el menú se pliega, y una
 * señal que se puede esconder no sirve como señal.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageCircle } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMensajesPendientes, type Pendiente } from '@/hooks/use-mensajes-pendientes';
import { cn } from '@/lib/utils';
import type { Canal } from '@/types';

/* Lucide quitó los iconos de marca, así que Facebook e Instagram se dibujan
   acá. Una forma cada uno: pesan menos que traer una librería entera. */
function IconoFacebook(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.44 2.91h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
    </svg>
  );
}

function IconoInstagram(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16Zm0 6.03a3.81 3.81 0 1 0 0 7.62 3.81 3.81 0 0 0 0-7.62Zm0 6.29a2.48 2.48 0 1 1 0-4.96 2.48 2.48 0 0 1 0 4.96Zm4.85-6.44a.89.89 0 1 1-1.78 0 .89.89 0 0 1 1.78 0Z" />
    </svg>
  );
}

const CANAL: Record<
  Canal,
  { etiqueta: string; icono: (p: React.SVGProps<SVGSVGElement>) => React.ReactElement; color: string }
> = {
  whatsapp: { etiqueta: 'WhatsApp', icono: MessageCircle as never, color: 'text-[#25D366]' },
  facebook: { etiqueta: 'Messenger', icono: IconoFacebook, color: 'text-[#1877F2]' },
  instagram: { etiqueta: 'Instagram', icono: IconoInstagram, color: 'text-[#E1306C]' },
};

/** Hace cuánto, dicho como lo diría una persona. */
function hace(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

function iniciales(nombre: string): string {
  return (
    nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function CampanaMensajes() {
  const { pendientes, total } = useMensajesPendientes();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);

  const abrirConversacion = (p: Pendiente) => {
    setAbierto(false);
    // `c` es el parámetro que la bandeja ya usa para abrir una conversación
    // concreta; `canal` lo agregué para que además deje el filtro en el canal
    // correcto. Sin lo segundo, la conversación podría no estar en la lista
    // visible y el enlace no abriría nada.
    router.push(`/inbox?canal=${p.canal}&c=${p.conversationId}`);
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={
              total > 0 ? `${total} mensajes sin leer` : 'Mensajes pendientes'
            }
            className={cn(
              'relative flex size-9 items-center justify-center rounded-md transition-colors',
              'text-muted-foreground hover:bg-muted hover:text-foreground',
              total > 0 && 'text-primary',
            )}
          >
            <Bell className="size-[18px]" />
            {total > 0 && (
              <>
                {/* El número, no solo un punto: "hay algo" y "hay catorce"
                    llevan a decisiones distintas. */}
                <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground">
                  {total > 99 ? '99+' : total}
                </span>
                <span className="absolute -right-0.5 -top-0.5 size-4 animate-ping rounded-full bg-primary/50" />
              </>
            )}
          </button>
        }
      />

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Mensajes nuevos</p>
          {total > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {total}
            </span>
          )}
        </div>

        {pendientes.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <Bell className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Todo al día.</p>
            <p className="text-xs text-muted-foreground">
              No hay mensajes sin leer en ningún canal.
            </p>
          </div>
        ) : (
          <ul className="max-h-[22rem] overflow-y-auto">
            {pendientes.map((p) => {
              const meta = CANAL[p.canal] ?? CANAL.whatsapp;
              const Icono = meta.icono;
              return (
                <li key={p.conversationId}>
                  <button
                    type="button"
                    onClick={() => abrirConversacion(p)}
                    className="flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-muted"
                  >
                    <span className="relative shrink-0">
                      <Avatar className="size-8">
                        {p.avatarUrl ? (
                          <AvatarImage src={p.avatarUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="bg-primary/10 text-[11px] font-medium text-primary">
                          {iniciales(p.quien)}
                        </AvatarFallback>
                      </Avatar>
                      {/* El canal, en la esquina del avatar: es lo que dice a
                          qué bandeja hay que ir antes de leer nada. */}
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border border-card bg-card',
                          meta.color,
                        )}
                        title={meta.etiqueta}
                      >
                        <Icono className="size-2.5" />
                      </span>
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {p.quien}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {hace(p.cuando)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {p.preview || `Mensaje por ${meta.etiqueta}`}
                      </span>
                    </span>

                    {p.sinLeer > 1 && (
                      <span className="mt-1 shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
                        {p.sinLeer}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

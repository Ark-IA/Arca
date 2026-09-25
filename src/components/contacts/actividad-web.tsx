'use client';

/**
 * Qué hizo el contacto en la página web antes de escribir: de dónde llegó la
 * primera vez, de dónde la última, y las últimas páginas que vio.
 *
 * No dibuja nada si el contacto nunca pasó por la página: una sección vacía
 * en cada ficha de alguien que solo escribió por WhatsApp es ruido.
 */

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { describirOrigen } from '@/lib/seguimiento-web/atribucion';
import type { EventoWeb, VisitanteWeb } from '@/types';

const MAX_PAGINAS = 8;

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ActividadWeb({ contactId }: { contactId: string }) {
  const [visitantes, setVisitantes] = useState<VisitanteWeb[]>([]);
  const [paginas, setPaginas] = useState<EventoWeb[]>([]);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      const db = createClient();
      const { data: vs } = await db
        .from('visitantes_web')
        .select('*')
        .eq('contact_id', contactId)
        .order('primera_visita', { ascending: true });
      const lista = (vs ?? []) as VisitanteWeb[];
      if (!vigente) return;
      setVisitantes(lista);
      if (lista.length === 0) return;

      const { data: evs } = await db
        .from('eventos_web')
        .select('*')
        .in(
          'visitante',
          lista.map((v) => v.visitante)
        )
        .in('sitio_id', [...new Set(lista.map((v) => v.sitio_id))])
        .eq('tipo', 'page_view')
        .order('ocurrio_en', { ascending: false })
        .limit(MAX_PAGINAS);
      if (vigente) setPaginas((evs ?? []) as EventoWeb[]);
    })();
    return () => {
      vigente = false;
    };
  }, [contactId]);

  if (visitantes.length === 0) return null;

  const primero = visitantes.find((v) => v.primer_origen)?.primer_origen;
  const ultimo = [...visitantes]
    .sort((a, b) => b.ultima_visita.localeCompare(a.ultima_visita))
    .find((v) => v.ultimo_origen)?.ultimo_origen;

  return (
    <div className="border-border mb-3 rounded-md border p-3 text-sm">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
        <Globe className="size-3.5" />
        Actividad web
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Llegó por</dt>
        <dd>{describirOrigen(primero)}</dd>
        {ultimo && describirOrigen(ultimo) !== describirOrigen(primero) && (
          <>
            <dt className="text-muted-foreground">Última vez</dt>
            <dd>{describirOrigen(ultimo)}</dd>
          </>
        )}
        {primero?.aterrizaje && (
          <>
            <dt className="text-muted-foreground">Entró en</dt>
            <dd className="truncate font-mono">{primero.aterrizaje}</dd>
          </>
        )}
      </dl>
      {paginas.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {paginas.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span className="truncate font-mono">{p.ruta}</span>
              <span className="text-muted-foreground shrink-0">
                {fecha(p.ocurrio_en)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

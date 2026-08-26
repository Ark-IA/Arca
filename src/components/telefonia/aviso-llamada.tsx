'use client';

/**
 * Aviso de llamada entrante, y barra de llamada en curso.
 *
 * Vive en el armazón, así que aparece en cualquier módulo: la llamada puede
 * entrar mientras se atiende la bandeja, se revisa un embudo o se edita un
 * contacto, y en todos esos casos hay que poder contestar sin salir de lo que
 * se estaba haciendo.
 *
 * Va arriba y al centro a propósito. Los avisos de sonner ocupan la esquina
 * superior derecha, la burbuja del teléfono la inferior derecha y el menú la
 * izquierda; el centro superior es la única franja que no le quita sitio a
 * nada, y además es donde la vista va sola cuando algo suena.
 *
 * Contestada, el aviso desaparece y queda una barra delgada: se sigue
 * hablando mientras se contesta un chat, que es exactamente el caso de uso de
 * quien atiende dos canales a la vez.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  UserPlus,
  UserRound,
} from 'lucide-react';

import { useTelefono } from '@/components/telefonia/contexto-telefono';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface Identificado {
  id: string;
  name: string | null;
  company: string | null;
}

function reloj(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2);
  return partes.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function AvisoLlamada() {
  const tel = useTelefono();
  const { accountId } = useAuth();
  const router = useRouter();

  const [quien, setQuien] = useState<Identificado | null>(null);
  const [buscado, setBuscado] = useState(false);

  const estado = tel?.estado ?? 'cargando';
  const numero = tel?.interlocutor ?? '';
  const entrante = estado === 'entrante';
  const enCurso = estado === 'en-llamada' || estado === 'llamando';

  /**
   * ¿Quién llama?
   *
   * Se busca por los últimos 8 dígitos y no por el número completo: la central
   * entrega el número como llegó de la operadora -- con prefijo de país, sin
   * él, con un 0 delante -- y el contacto puede estar guardado de otra forma.
   * Comparar el final es lo único que acierta en los tres casos.
   */
  const identificar = useCallback(async () => {
    if (!accountId || numero === '') return;
    const digitos = numero.replace(/\D/g, '');
    if (digitos.length < 7) {
      setBuscado(true);
      return;
    }
    const { data } = await createClient()
      .from('contacts')
      .select('id, name, company')
      .eq('account_id', accountId)
      .like('phone', `%${digitos.slice(-8)}`)
      .limit(1);
    setQuien(((data ?? []) as Identificado[])[0] ?? null);
    setBuscado(true);
  }, [accountId, numero]);

  useEffect(() => {
    if (!entrante) return;
    setQuien(null);
    setBuscado(false);
    void identificar();
  }, [entrante, identificar]);

  if (!tel || (!entrante && !enCurso)) return null;

  const nombre = quien?.name?.trim() || null;

  // ------------------------------------------------------------------
  // Llamada en curso: barra delgada, lo mínimo para no estorbar.
  // ------------------------------------------------------------------
  if (enCurso) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border bg-popover/95 py-1.5 pl-3 pr-1.5 shadow-xl backdrop-blur">
          <span className="relative flex size-2 shrink-0">
            {/* Punto que late: dice "sigue en curso" sin ocupar texto. */}
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>

          <span className="max-w-[40vw] truncate text-xs text-foreground">
            {estado === 'llamando' ? 'Llamando a ' : ''}
            <span className="font-medium">{nombre ?? numero}</span>
          </span>

          {estado === 'en-llamada' && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {reloj(tel.segundos)}
            </span>
          )}

          <button
            type="button"
            onClick={tel.alternarSilencio}
            aria-label={tel.silenciado ? 'Activar el micrófono' : 'Silenciar el micrófono'}
            className={cn(
              'flex size-7 items-center justify-center rounded-full transition-colors',
              tel.silenciado
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {tel.silenciado ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
          </button>

          <button
            type="button"
            onClick={tel.colgar}
            aria-label="Colgar"
            className="flex size-7 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700"
          >
            <PhoneOff className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Llamada entrante.
  // ------------------------------------------------------------------
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md animate-in fade-in slide-in-from-top-2 overflow-hidden rounded-2xl border border-primary/30 bg-popover shadow-2xl duration-200">
        <div className="flex items-center gap-3 p-4">
          <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            {/* El halo que late es lo que hace que se lea como "está sonando"
                y no como un aviso más. */}
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            {nombre ? (
              <span className="relative text-sm font-semibold">{iniciales(nombre)}</span>
            ) : (
              <PhoneIncoming className="relative size-5" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
              Llamada entrante
            </p>
            <p className="truncate text-base font-semibold text-foreground">
              {nombre ?? numero}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {nombre
                ? [numero, quien?.company].filter(Boolean).join(' · ')
                : buscado
                  ? 'Número desconocido'
                  : 'Identificando…'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={tel.colgar}
              aria-label="Rechazar la llamada"
              title="Rechazar"
              className="flex size-11 items-center justify-center rounded-full bg-red-600 text-white transition-all hover:bg-red-700 hover:shadow-lg hover:shadow-red-900/30"
            >
              <PhoneOff className="size-5" />
            </button>
            <button
              type="button"
              onClick={tel.contestar}
              aria-label="Contestar la llamada"
              title="Contestar"
              className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
            >
              <PhoneCall className="size-5" />
            </button>
          </div>
        </div>

        {/* Ir a la ficha o crear el contacto: SIEMPRE opcional y nunca
            automático. Abrir la ficha solo porque entró una llamada sacaría a
            la persona de lo que estaba haciendo sin pedirle permiso, que es
            justo lo que hay que evitar mientras suena un teléfono. */}
        {buscado && (
          <div className="border-t border-border bg-muted/30 px-4 py-2">
            {quien ? (
              <button
                type="button"
                onClick={() => router.push(`/contacts?id=${quien.id}`)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                <UserRound className="size-3.5" />
                Ver la ficha de {nombre ?? 'este contacto'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push(`/contacts?nuevo=${encodeURIComponent(numero)}`)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                <UserPlus className="size-3.5" />
                Crear contacto con este número
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

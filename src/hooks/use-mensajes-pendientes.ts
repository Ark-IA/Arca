'use client';

/**
 * Las conversaciones con mensajes sin leer, para la campanita del encabezado.
 *
 * Existe porque el aviso emergente no alcanza: dura unos segundos y se va. Si
 * alguien estaba fuera del escritorio, atendiendo el teléfono o simplemente
 * mirando otra pestaña, el mensaje quedó sin señal visible. La campanita es lo
 * que se puede consultar CUANDO uno quiera, no solo en el instante en que
 * llega.
 *
 * Se apoya en el mismo canal de tiempo real que el resto de la bandeja, así
 * que el número se actualiza solo sin recargar ni preguntar cada pocos
 * segundos.
 */

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Canal } from '@/types';

export interface Pendiente {
  conversationId: string;
  canal: Canal;
  /** Nombre del contacto, o su teléfono / identificador si no tiene. */
  quien: string;
  avatarUrl: string | null;
  preview: string;
  cuando: string | null;
  sinLeer: number;
}

/** Cuántas conversaciones lista la campanita. Más no cabe ni se lee. */
const TOPE = 12;

export function useMensajesPendientes() {
  const { accountId, user } = useAuth();
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!accountId) return;
    const { data, error } = await createClient()
      .from('conversations')
      .select(
        'id, channel, unread_count, last_message_text, last_message_at, contact:contacts(name, phone, whatsapp_user_id, avatar_url)',
      )
      .eq('account_id', accountId)
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })
      .limit(TOPE);

    if (error) {
      setCargando(false);
      return;
    }

    type Fila = {
      id: string;
      channel: string | null;
      unread_count: number;
      last_message_text: string | null;
      last_message_at: string | null;
      contact: {
        name?: string | null;
        phone?: string | null;
        whatsapp_user_id?: string | null;
        avatar_url?: string | null;
      } | null;
    };

    setPendientes(
      ((data ?? []) as Fila[]).map((f) => ({
        conversationId: f.id,
        // Las conversaciones anteriores a los canales múltiples no traen el
        // campo y son de WhatsApp.
        canal: (f.channel ?? 'whatsapp') as Canal,
        quien:
          f.contact?.name?.trim() ||
          f.contact?.phone ||
          f.contact?.whatsapp_user_id ||
          'Sin nombre',
        avatarUrl: f.contact?.avatar_url ?? null,
        preview: (f.last_message_text ?? '').replace(/\s+/g, ' ').trim(),
        cuando: f.last_message_at,
        sinLeer: f.unread_count,
      })),
    );
    setCargando(false);
  }, [accountId]);

  useEffect(() => {
    if (!user || !accountId) return;
    void cargar();

    // Un canal propio, no compartido con la bandeja: si compartieran nombre,
    // una de las dos suscripciones pisaría a la otra al abrir la bandeja.
    const supabase = createClient();
    const canal = supabase
      .channel('campanita-pendientes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          // Se recarga la lista entera en vez de intentar aplicar el cambio
          // sobre el estado: el evento trae la fila pero no el contacto, y
          // reconstruirlo a mano daría nombres vacíos en la campanita.
          void cargar();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [user, accountId, cargar]);

  const total = pendientes.reduce((n, p) => n + p.sinLeer, 0);

  return { pendientes, total, cargando, recargar: cargar };
}

'use client';

/**
 * Aviso sonoro de mensaje nuevo, para toda la aplicación.
 *
 * Vive en el armazón y no en la bandeja. Antes estaba dentro de la página de
 * la bandeja, lo que significaba que si estabas mirando Contactos, Negocios o
 * el Panel -- que es la mitad del tiempo -- no sonaba nada. El aviso existe
 * justamente para enterarte cuando NO estás mirando la bandeja.
 *
 * No pinta nada: solo escucha y suena.
 */

import { useCallback, useEffect, useRef } from 'react';

import { useRealtime } from '@/hooks/use-realtime';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  avisarMensajeNuevo,
  mantenerAudioVivo,
  sonidoActivado,
} from '@/lib/inbox/aviso-sonoro';
import type { Message } from '@/types';

type Canal = 'whatsapp' | 'facebook' | 'instagram';

function esCanal(v: unknown): v is Canal {
  return v === 'whatsapp' || v === 'facebook' || v === 'instagram';
}

export function AvisadorMensajes() {
  const { user, accountId } = useAuth();

  /**
   * conversación → canal.
   *
   * El evento de tiempo real solo trae las columnas de `messages`, y el canal
   * vive en `conversations`. Se consulta una vez por conversación y se
   * recuerda: sin la caché, una ráfaga de diez mensajes serían diez consultas
   * para averiguar diez veces lo mismo.
   */
  const canalPorConversacion = useRef<Map<string, Canal>>(new Map());

  useEffect(() => {
    // Se engancha aunque no haya sesión todavía: el gesto que reanima el
    // audio puede ser el propio inicio de sesión.
    return mantenerAudioVivo();
  }, []);

  const alLlegarMensaje = useCallback(
    (evento: { eventType: string; new: Message }) => {
      if (evento.eventType !== 'INSERT') return;
      const msg = evento.new;

      // Solo lo que ENTRA. El mismo evento se dispara con lo que uno envía, y
      // oír un aviso al contestar convierte el sonido en ruido; un sonido
      // molesto termina apagado, y entonces no avisa de nada.
      if (msg.sender_type !== 'customer') return;
      if (!sonidoActivado()) return;

      const recordado = canalPorConversacion.current.get(msg.conversation_id);
      if (recordado) {
        avisarMensajeNuevo(recordado);
        return;
      }

      // Suena YA con el tono de WhatsApp y se corrige el canal para la
      // próxima. Esperar a la consulta metería medio segundo de retraso entre
      // el mensaje y el aviso, y un aviso tarde se atribuye al mensaje
      // equivocado.
      avisarMensajeNuevo('whatsapp');

      void (async () => {
        const { data } = await createClient()
          .from('conversations')
          .select('channel')
          .eq('id', msg.conversation_id)
          .maybeSingle();
        const canal = (data as { channel?: unknown } | null)?.channel;
        if (esCanal(canal)) {
          canalPorConversacion.current.set(msg.conversation_id, canal);
        }
      })();
    },
    [],
  );

  useRealtime({
    // Nombre propio: compartir el canal con la bandeja haría que al abrirla
    // una de las dos suscripciones pisara a la otra.
    channelName: 'aviso-mensajes-global',
    onMessageEvent: alLlegarMensaje,
    enabled: !!user && !!accountId,
  });

  return null;
}

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
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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

/** Cómo se llama cada canal para una persona. */
const ETIQUETA_CANAL: Record<Canal, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Messenger',
  instagram: 'Instagram',
};

export function AvisadorMensajes() {
  const { user, accountId } = useAuth();
  const router = useRouter();

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

  /**
   * Aviso en pantalla, con el canal y de quién.
   *
   * El sonido dice QUE llegó algo; esto dice DÓNDE. Sin ello, con la bandeja
   * filtrada en WhatsApp un mensaje de Messenger sonaba y no aparecía por
   * ningún lado: quedaba en un canal que no se estaba mirando.
   *
   * No se muestra si ya estás mirando ese mismo canal en la bandeja — ahí el
   * mensaje aparece solo en la lista y un aviso encima sería ruido. El canal
   * que se está viendo se lee de la misma preferencia que guarda la bandeja.
   */
  const avisarEnPantalla = useCallback(
    async (canal: Canal, conversationId: string) => {
      let viendo: string | null = null;
      try {
        viendo = localStorage.getItem('wacrm.inbox.canal');
      } catch {
        // Navegación privada: se avisa igual, que es lo seguro.
      }
      const enLaBandeja = window.location.pathname.startsWith('/inbox');
      if (enLaBandeja && (viendo === canal || viendo === 'todos' || !viendo)) return;

      // Se busca de quién es para poder nombrarlo. Un aviso que dice
      // "mensaje nuevo" sin decir de quién obliga a entrar a mirar igual.
      let quien = 'Alguien';
      try {
        const { data } = await createClient()
          .from('conversations')
          .select('contact:contacts(name, phone)')
          .eq('id', conversationId)
          .maybeSingle();
        const c = (data as { contact?: { name?: string; phone?: string } | null } | null)?.contact;
        quien = c?.name || c?.phone || 'Alguien';
      } catch {
        /* se usa el genérico */
      }

      toast(`${quien} escribió por ${ETIQUETA_CANAL[canal]}`, {
        description: 'Mensaje nuevo sin leer.',
        action: {
          label: 'Ver',
          // El canal viaja en la dirección: la bandeja lo lee al abrirse y se
          // posiciona sola. Con localStorage a secas no bastaría, porque la
          // lista solo lo consulta al montarse.
          onClick: () => router.push(`/inbox?canal=${canal}`),
        },
      });
    },
    [router],
  );

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
        void avisarEnPantalla(recordado, msg.conversation_id);
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
          void avisarEnPantalla(canal, msg.conversation_id);
        }
      })();
    },
    [avisarEnPantalla],
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

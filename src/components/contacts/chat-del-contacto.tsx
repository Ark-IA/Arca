'use client';

/**
 * La conversación con el cliente, dentro de su ficha.
 *
 * Es el mismo hilo de la bandeja —`MessageThread`— y no una versión
 * recortada: escribir, mandar audios, adjuntar, citar, reaccionar y ver los
 * estados de entrega tienen que funcionar igual acá que allá. Una segunda
 * caja de texto «más simple» habría empezado bien y habría terminado siendo
 * la versión donde no se puede mandar una plantilla.
 *
 * Lo que este componente aporta es lo que la bandeja resuelve por su cuenta y
 * la ficha no tenía:
 *
 *   · encontrar CUÁL conversación es la de este contacto
 *   · guardar los mensajes en memoria mientras se está mirando
 *   · escuchar los que lleguen en vivo
 *
 * Si el contacto nunca escribió no hay hilo que mostrar, y eso se dice: la
 * ventana de 24 horas de WhatsApp impide iniciar una charla con texto suelto,
 * así que la salida es la plantilla —el botón que ya está arriba en la ficha—
 * y no un campo de texto que fallaría al enviar.
 */

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { MessageThread } from '@/components/inbox/message-thread';
import { useRealtime } from '@/hooks/use-realtime';
import type {
  Contact,
  Conversation,
  ConversationStatus,
  Message,
} from '@/types';

export function ChatDelContacto({ contact }: { contact: Contact }) {
  const [conversacion, setConversacion] = useState<Conversation | null>(null);
  const [mensajes, setMensajes] = useState<Message[]>([]);
  const [cargando, setCargando] = useState(true);
  /**
   * Se sube de a uno para obligar al hilo a releer.
   *
   * Los avisos en vivo son «mejor esfuerzo»: si la conexión se cae y vuelve,
   * lo que pasó en el medio no llega nunca. Volver a leer al reconectar es lo
   * que evita que la ficha se quede mostrando una conversación congelada sin
   * dar ninguna señal de que lo está.
   */
  const [resync, setResync] = useState(0);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      setCargando(true);
      const supabase = createClient();
      // La más reciente. Un contacto puede tener varias conversaciones
      // —una por canal, o reabiertas con el tiempo— y la que se quiere ver
      // desde la ficha es siempre la última que tuvo actividad.
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!vigente) return;
      setConversacion((data as Conversation) ?? null);
      setMensajes([]);
      setCargando(false);
    })();
    return () => {
      vigente = false;
    };
  }, [contact.id]);

  const alCargarMensajes = useCallback((cargados: Message[]) => {
    setMensajes(cargados);
  }, []);

  const alLlegarMensaje = useCallback((m: Message) => {
    setMensajes((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  const alActualizarMensaje = useCallback((id: string, cambios: Partial<Message>) => {
    setMensajes((prev) => prev.map((m) => (m.id === id ? { ...m, ...cambios } : m)));
  }, []);

  const alCambiarEstado = useCallback(
    (_conversationId: string, status: ConversationStatus) => {
      setConversacion((prev) => (prev ? { ...prev, status } : prev));
    },
    [],
  );

  const alCambiarAsignacion = useCallback(
    (_conversationId: string, assignedAgentId: string | null) => {
      setConversacion((prev) =>
        prev ? { ...prev, assigned_agent_id: assignedAgentId ?? undefined } : prev,
      );
    },
    [],
  );

  // Mensajes en vivo de ESTA conversación. El nombre del canal lleva el id del
  // contacto para no chocar con el de la bandeja si las dos pantallas están
  // abiertas en pestañas distintas: dos suscripciones con el mismo nombre se
  // pisan y una de las dos deja de recibir.
  const { isConnected } = useRealtime({
    channelName: `ficha-contacto:${contact.id}`,
    onMessageEvent: (evento) => {
      if (!conversacion || evento.new?.conversation_id !== conversacion.id) return;
      if (evento.eventType === 'INSERT') alLlegarMensaje(evento.new);
      if (evento.eventType === 'UPDATE') alActualizarMensaje(evento.new.id, evento.new);
    },
    enabled: !!conversacion,
  });

  // Al recuperar la conexión se relee, por lo que quedó en el hueco.
  const [estabaConectado, setEstabaConectado] = useState(isConnected);
  if (estabaConectado !== isConnected) {
    setEstabaConectado(isConnected);
    if (isConnected) setResync((n) => n + 1);
  }

  if (cargando) {
    return (
      <div className="border-border bg-card text-muted-foreground flex h-full items-center justify-center rounded-xl border text-sm">
        Cargando la conversación…
      </div>
    );
  }

  if (!conversacion) {
    return (
      <div className="border-border bg-card flex h-full flex-col items-center justify-center gap-3 rounded-xl border p-8 text-center">
        <div className="bg-muted flex size-12 items-center justify-center rounded-full">
          <MessageSquare className="text-muted-foreground size-5" />
        </div>
        <div>
          <p className="text-foreground text-sm font-medium">
            Todavía no hay conversación con este contacto
          </p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
            WhatsApp no deja escribirle primero con un mensaje suelto. Usá
            «Enviar plantilla», acá arriba: con eso se abre el hilo y a partir
            de su respuesta ya se puede conversar normal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-card flex h-full min-h-0 overflow-hidden rounded-xl border">
      <MessageThread
        conversation={conversacion}
        contact={contact}
        messages={mensajes}
        onMessagesLoaded={alCargarMensajes}
        onNewMessage={alLlegarMensaje}
        onUpdateMessage={alActualizarMensaje}
        onStatusChange={alCambiarEstado}
        onAssignChange={alCambiarAsignacion}
        resyncToken={resync}
        onRefresh={() => setResync((n) => n + 1)}
      />
    </div>
  );
}

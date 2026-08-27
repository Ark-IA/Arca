/**
 * A quién se le entrega una conversación.
 *
 * Aparece en dos sitios que hasta ahora no se hablaban: el nodo `handoff` de
 * un flujo y el paso `assign_conversation` de una automatización. Los dos
 * hacían lo mismo a medias — asignar a una persona concreta — y ninguno de
 * los dos sabía devolverle la conversación al agente de IA.
 *
 * Vive en un módulo aparte a propósito. Si cada motor escribiera su propio
 * UPDATE, tarde o temprano uno olvidaría un campo: un flujo entregaría a la
 * cola dejando la IA encendida, la IA seguiría contestando encima del asesor,
 * y desde afuera parecería que la plataforma responde dos veces.
 *
 * Los tres destinos:
 *
 *   ia      -> vuelve a contestar el agente automático
 *   cola    -> queda pendiente y sin dueño; la toma quien esté libre
 *   asesor  -> queda a nombre de una persona concreta
 */

export type DestinoConversacion = 'ia' | 'cola' | 'asesor'

export const DESTINOS: DestinoConversacion[] = ['ia', 'cola', 'asesor']

/**
 * Deduce el destino de una configuración que puede ser vieja.
 *
 * Antes de que existiera el campo `destino`, un `handoff` con `assign_to`
 * significaba «a esta persona» y sin él «a la cola». Se respeta esa lectura
 * para que ningún flujo ya escrito cambie de comportamiento al desplegar.
 */
export function resolverDestino(cfg: {
  destino?: string | null
  assign_to?: string | null
  agent_id?: string | null
}): DestinoConversacion {
  if (cfg.destino && (DESTINOS as string[]).includes(cfg.destino)) {
    return cfg.destino as DestinoConversacion
  }
  return cfg.assign_to || cfg.agent_id ? 'asesor' : 'cola'
}

export interface OpcionesDeEntrega {
  /** Para el destino `asesor`. */
  asesorId?: string | null
  /** Para el destino `cola`. Sin ella, la conversación espera sin cola. */
  colaId?: string | null
}

/**
 * El parche que hay que aplicar sobre `conversations`.
 *
 * Devuelve el objeto completo en vez de escribir en la base para que se pueda
 * comprobar sin simular Supabase — la parte que importa aquí es exactamente
 * QUÉ campos se tocan, y eso se lee mejor en una prueba que en un mock.
 */
export function parcheDeEntrega(
  destino: DestinoConversacion,
  opciones: OpcionesDeEntrega = {},
): Record<string, unknown> {
  const ahora = new Date().toISOString()
  const { asesorId, colaId } = opciones

  if (destino === 'ia') {
    return {
      // La cola se limpia. Una conversación que volvió al agente no está
      // esperando a nadie, y dejarla listada en Ventas haría que un asesor
      // la abriera para encontrarse con que el bot ya la está atendiendo.
      cola_id: null,
      // Los tres a la vez. Dejar el asesor puesto haría que la IA se saltara
      // la conversación igual, porque una persona a cargo tiene prioridad
      // sobre el agente: el destino quedaría escrito y no pasaría nada.
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      // El contador vuelve a cero. Sin esto, entregarle una conversación
      // larga al agente no haría nada en cuanto se hubiera gastado el tope,
      // y la acción sería un botón que a veces funciona: peor que no tenerlo.
      ai_reply_count: 0,
      status: 'open',
      updated_at: ahora,
    }
  }

  if (destino === 'cola') {
    return {
      assigned_agent_id: null,
      // `colaId ?? null` y no `...(colaId ? {} : {})`: cuando el flujo no
      // eligió cola hay que BORRAR la que hubiera de una entrega anterior,
      // no dejarla puesta. Omitir el campo la conservaría, y la conversación
      // seguiría apareciendo en una cola que ya no le corresponde.
      cola_id: colaId ?? null,
      // La IA se calla. Mandar a la cola es pedir una persona; si el agente
      // siguiera contestando, el cliente recibiría respuestas automáticas
      // mientras espera a alguien de verdad.
      ai_autoreply_disabled: true,
      status: 'pending',
      updated_at: ahora,
    }
  }

  // asesor
  return {
    ...(asesorId ? { assigned_agent_id: asesorId } : {}),
    // Igual que arriba: al pasar a una persona concreta, la conversación
    // deja de estar esperando en una cola.
    cola_id: null,
    ai_autoreply_disabled: true,
    status: 'pending',
    updated_at: ahora,
  }
}

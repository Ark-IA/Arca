/**
 * Traduce los codigos de error de Meta a algo que un operador entienda.
 *
 * Meta devuelve textos como "Message Undeliverable." — literalmente eso, con
 * punto final y sin decir que hacer. Quien atiende ve una equis roja y no
 * sabe si el problema es suyo, del cliente o de la configuracion.
 *
 * Cada entrada dice DOS cosas: que paso y que se puede hacer. La segunda es
 * la que evita que alguien reintente veinte veces el mismo envio.
 */

export interface MotivoDeFallo {
  /** Una linea, la que va junto a la equis. */
  resumen: string;
  /** Que hacer. Vacio cuando no hay nada que hacer del lado del operador. */
  queHacer?: string;
}

const MOTIVOS: Record<number, MotivoDeFallo> = {
  131026: {
    resumen: 'WhatsApp no pudo entregar el mensaje a este contacto.',
    queHacer:
      'Suele pasar con contactos que escriben usando nombre de usuario en vez de numero. ' +
      'Para poder responderles hace falta verificar la empresa en Meta Business.',
  },
  131047: {
    resumen: 'Pasaron mas de 24 horas desde el ultimo mensaje del cliente.',
    queHacer: 'Usa una plantilla aprobada para retomar la conversacion.',
  },
  131049: {
    resumen: 'Meta decidio no entregar este mensaje para cuidar la experiencia del usuario.',
    queHacer: 'Suele afectar a mensajes de marketing. Espera o cambia el contenido.',
  },
  131050: {
    resumen: 'El contacto pidio no recibir mas mensajes de marketing.',
    queHacer: 'Solo se le puede escribir por temas de servicio o transaccionales.',
  },
  131051: { resumen: 'Tipo de mensaje no soportado.' },
  131052: {
    resumen: 'No se pudo descargar el archivo adjunto.',
    queHacer: 'Verifica que el enlace sea publico y siga en linea.',
  },
  131053: {
    resumen: 'El archivo no se pudo subir a WhatsApp.',
    queHacer: 'Revisa el formato y que no supere el tamano maximo.',
  },
  130472: {
    resumen: 'El numero del contacto esta dentro de un experimento de Meta y no recibe mensajes.',
  },
  131000: { resumen: 'Error interno de WhatsApp.', queHacer: 'Reintenta en unos minutos.' },
  131005: { resumen: 'Sin permiso para enviar a este contacto.' },
  131008: { resumen: 'Falta un dato obligatorio en el mensaje.' },
  131009: { resumen: 'Un dato del mensaje tiene un valor invalido.' },
  131016: { resumen: 'El servicio de WhatsApp no esta disponible.', queHacer: 'Reintenta mas tarde.' },
  131021: {
    resumen: 'No se puede enviar un mensaje al propio numero del negocio.',
  },
  131031: {
    resumen: 'La cuenta de WhatsApp Business esta bloqueada.',
    queHacer: 'Revisa el estado de la cuenta en Meta Business Manager.',
  },
  133010: { resumen: 'El numero no esta registrado en la API de WhatsApp.' },
  100: { resumen: 'Meta rechazo la peticion por un parametro invalido.' },
};

/**
 * Devuelve el motivo legible. Cuando el codigo no esta en la tabla se usa lo
 * que haya mandado Meta: es feo, pero es mejor que no decir nada — y el
 * codigo queda a la vista para poder buscarlo.
 */
export function explicarFallo(
  codigo?: number | null,
  titulo?: string | null,
  detalle?: string | null,
): MotivoDeFallo | null {
  if (codigo && MOTIVOS[codigo]) return MOTIVOS[codigo];

  const textoDeMeta = detalle || titulo;
  if (textoDeMeta) {
    return {
      resumen: codigo ? `${textoDeMeta} (codigo ${codigo})` : textoDeMeta,
    };
  }
  if (codigo) return { resumen: `WhatsApp rechazo el mensaje (codigo ${codigo}).` };
  return null;
}

/**
 * BSUID — Business-Scoped User ID
 *
 * Desde 2026 Meta permite que la gente use WhatsApp con un nombre de usuario
 * en vez de exponer su numero. A esas cuentas se les asigna un identificador
 * propio POR NEGOCIO, con la forma `CC.alfanumerico`:
 *
 *     CO.4509733672618188
 *
 * Lo importante, y lo que costo dias descubrir: la API NO acepta un BSUID en
 * el campo `to`. Puesto ahi, Meta lo interpreta como si fuera un telefono, le
 * quita el prefijo, ACEPTA la peticion devolviendo un identificador de
 * mensaje valido... y despues avisa por webhook que no lo pudo entregar, con
 * el error 131026 "Message undeliverable".
 *
 * Es el peor modo de fallo posible: la llamada responde 200, parece exitosa,
 * y el rechazo llega segundos despues por otro canal.
 *
 * El campo correcto es `recipient`, y la documentacion es explicita en que
 * hay que OMITIR `to` cuando se usa:
 *
 *     { "messaging_product": "whatsapp",
 *       "recipient_type": "individual",
 *       "recipient": "CO.4509733672618188",
 *       "type": "text", "text": { "body": "..." } }
 *
 * Con `recipient`, la respuesta de Meta devuelve `user_id` en vez de `wa_id`
 * y el identificador del mensaje cambia de prefijo (`wamid.HBgT…` en lugar
 * de `wamid.HBgQ…`): son las dos senales de que lo reconocio bien.
 *
 * Referencia: developers.facebook.com/documentation/business-messaging/
 *             whatsapp/business-scoped-user-ids/
 */

/**
 * Un BSUID son dos letras mayusculas, un punto y alfanumericos.
 * Un telefono E.164 nunca tiene punto, asi que la forma alcanza para
 * distinguirlos sin ambiguedad.
 */
export function esBsuid(destino: string | null | undefined): boolean {
  if (!destino) return false
  return /^[A-Z]{2}\.[A-Za-z0-9_-]{1,128}$/.test(destino.trim())
}

/**
 * Devuelve el campo que corresponde al destinatario, listo para mezclar en
 * el cuerpo de la peticion:
 *
 *     const body = { messaging_product: 'whatsapp', ...campoDestinatario(to), ... }
 *
 * Existe como funcion en vez de repetir el condicional en cada envio porque
 * los puntos donde se arma el cuerpo son seis (texto, media, plantilla,
 * interactivo, reaccion, difusion) y basta olvidarse de uno para que ese
 * tipo de mensaje falle solo con los contactos de nombre de usuario — que es
 * justo el caso que menos se prueba.
 */
export function campoDestinatario(destino: string): Record<string, string> {
  return esBsuid(destino) ? { recipient: destino } : { to: destino }
}

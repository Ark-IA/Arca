/**
 * Credenciales de TURN con caducidad.
 *
 * coturn, configurado con `use-auth-secret`, no guarda usuarios: valida cada
 * credencial contra un secreto compartido. El CRM firma un usuario con marca
 * de tiempo y coturn comprueba la firma. Asi:
 *
 *   - no hay usuario ni clave fijos que puedan filtrarse para siempre;
 *   - una credencial robada de la consola del navegador deja de servir sola;
 *   - no hace falta dar de alta a nadie en el TURN cuando entra al equipo.
 *
 * El formato lo define el propio coturn (la "TURN REST API"):
 *
 *     usuario = <marca_de_tiempo_de_caducidad>:<identificador>
 *     clave   = base64( HMAC-SHA1( secreto, usuario ) )
 */

import { createHmac } from 'node:crypto'
import type { ServidorIce } from './sip'

/**
 * Doce horas. Bastante mas que cualquier llamada, y bastante menos que una
 * credencial eterna. La credencial se comprueba al empezar la llamada, asi
 * que una que caduque a mitad no corta la conversacion en curso.
 */
const VIGENCIA_SEGUNDOS = 12 * 60 * 60

export function credencialTurn(
  secreto: string,
  identificador: string,
  ahoraMs: number = Date.now(),
): { username: string; credential: string } {
  const caduca = Math.floor(ahoraMs / 1000) + VIGENCIA_SEGUNDOS
  const username = `${caduca}:${identificador}`
  const credential = createHmac('sha1', secreto).update(username).digest('base64')
  return { username, credential }
}

/**
 * Arma la lista de servidores ICE para el navegador.
 *
 * El orden importa: el navegador prueba primero los de arriba. STUN primero
 * porque una ruta directa siempre es mejor -- menos latencia y no consume
 * ancho de banda del servidor. TURN queda de red de seguridad.
 *
 * Se ofrece TURN por UDP, por TCP y por TLS en el 443... no: el 443 lo ocupa
 * nginx. Por TLS en el 5349, que es el puerto estandar. Un cortafuegos que
 * bloquee tambien eso deja al usuario sin telefono, y en ese caso hay que
 * hablar con quien administre esa red.
 */
export function servidoresIce(host: string, secreto: string | undefined, identificador: string): ServidorIce[] {
  const lista: ServidorIce[] = [{ urls: `stun:${host}:3478` }]

  // Sin secreto configurado se sigue adelante con STUN solo. Es peor, pero
  // funciona en la mayoria de las redes; devolver un error dejaria el
  // telefono completamente muerto por una variable de entorno olvidada.
  if (!secreto) return lista

  const { username, credential } = credencialTurn(secreto, identificador)
  lista.push(
    { urls: `turn:${host}:3478?transport=udp`, username, credential },
    { urls: `turn:${host}:3478?transport=tcp`, username, credential },
    { urls: `turns:${host}:5349?transport=tcp`, username, credential },
  )
  return lista
}

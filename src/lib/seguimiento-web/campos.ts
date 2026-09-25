/**
 * Qué se guarda de un formulario y cómo se saca de él un contacto.
 *
 * Puro, sin base. Las páginas de los clientes nombran los campos como
 * quieren ("nombre", "your-name", "celular", "wpforms[fields][2]"), así que
 * se busca por nombre primero y por forma del valor después.
 *
 * Adaptado de trycompai/crm (MIT, ver licenses/trycompai-crm.txt). Allá un
 * contacto es un correo; acá el teléfono manda, porque lo que sigue es
 * escribirle por WhatsApp.
 */

import { isValidE164 } from '@/lib/whatsapp/phone-utils';

export type CamposFormulario = Record<string, string>;

const MAX_CAMPOS = 40;
const MAX_NOMBRE_CAMPO = 64;
const MAX_VALOR = 512;

/** Nunca se guardan: ni aunque la página los mande. */
const SENSIBLE =
  /pass|clave|contrase|secret|token|card|tarjeta|cvv|cvc|ssn|iban|routing|cuenta_banc/i;

/** Un número de tarjeta pegado en un campo cualquiera. */
const TARJETA = /^[0-9 -]{13,25}$/;

const CORREO = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/** Correos que no lee una persona: no son un contacto. */
const CORREO_DE_MAQUINA =
  /^(no-?reply|do-?not-?reply|noresponder|no-?responder|mailer-daemon|postmaster|bounce[s]?|notifications?|notificaciones)@/i;

export function limpiarCampos(crudos: unknown): CamposFormulario {
  const limpios: CamposFormulario = {};
  if (!crudos || typeof crudos !== 'object' || Array.isArray(crudos))
    return limpios;

  for (const [clave, valor] of Object.entries(crudos).slice(0, MAX_CAMPOS)) {
    if (typeof valor !== 'string') continue;
    const texto = valor.trim();
    if (!texto) continue;
    if (SENSIBLE.test(clave)) continue;
    // Un teléfono también son 13+ dígitos con espacios; lo que distingue a una
    // tarjeta es no tener un "+" delante y pasar Luhn.
    if (TARJETA.test(texto) && pasaLuhn(texto)) continue;

    limpios[clave.slice(0, MAX_NOMBRE_CAMPO)] = texto.slice(0, MAX_VALOR);
  }

  return limpios;
}

export function correoDe(campos: CamposFormulario): string | null {
  for (const [clave, valor] of Object.entries(campos)) {
    if (!/mail|correo/i.test(clave)) continue;
    const c = correoValido(valor);
    if (c) return c;
  }
  for (const valor of Object.values(campos)) {
    const c = correoValido(valor);
    if (c) return c;
  }
  return null;
}

export function esCorreoDeMaquina(correo: string): boolean {
  return CORREO_DE_MAQUINA.test(correo);
}

/**
 * El teléfono, en E.164 sin "+", o null.
 *
 * Solo se busca en campos que se llaman como un teléfono: un número de
 * documento o un código postal tienen la misma forma, y confundirlos crearía
 * un contacto al que se le escribe por WhatsApp a un número que no existe.
 */
export function telefonoDe(
  campos: CamposFormulario,
  paisPorDefecto: string
): string | null {
  for (const [clave, valor] of Object.entries(campos)) {
    if (
      !/tel|phone|celular|m[oó]vil|mobile|whats|cel\b|^cel|contacto_num/i.test(
        clave
      )
    )
      continue;
    const t = normalizarTelefono(valor, paisPorDefecto);
    if (t) return t;
  }
  return null;
}

/**
 * "+57 300 123 4567" → "573001234567"; "300 123 4567" con país 57 → igual;
 * "0057 300…" → igual. Si no queda algo con forma de E.164, null.
 */
export function normalizarTelefono(
  valor: string,
  paisPorDefecto: string
): string | null {
  const crudo = valor.trim();
  if (!crudo) return null;

  const internacional = crudo.startsWith('+') || crudo.startsWith('00');
  let digitos = crudo.replace(/\D/g, '');
  if (crudo.startsWith('00')) digitos = digitos.replace(/^00/, '');

  if (!internacional) {
    // Número nacional: se le quita el 0 de larga distancia y se le pone el
    // indicativo, salvo que ya venga con él escrito sin "+".
    const nacional = digitos.replace(/^0+/, '');
    if (!(nacional.startsWith(paisPorDefecto) && nacional.length > 10)) {
      digitos = `${paisPorDefecto}${nacional}`;
    } else {
      digitos = nacional;
    }
  }

  return isValidE164(digitos) && digitos.length >= 10 ? digitos : null;
}

export function nombreDe(campos: CamposFormulario): string | null {
  const nombre = elegir(
    campos,
    /^(first[\s_-]?name|fname|given|nombres?|primer[\s_-]?nombre)$/i
  );
  const apellido = elegir(
    campos,
    /^(last[\s_-]?name|lname|surname|family|apellidos?)$/i
  );

  if (nombre) return apellido ? `${nombre} ${apellido}` : nombre;

  return (
    elegir(
      campos,
      /^(full[\s_-]?name|name|nombre[\s_-]?completo|your-name)$/i
    ) ?? elegir(campos, /name|nombre/i)
  );
}

export function empresaDe(campos: CamposFormulario): string | null {
  return elegir(
    campos,
    /company|empresa|compa[nñ][ií]a|organizaci[oó]n|negocio/i
  );
}

function elegir(campos: CamposFormulario, patron: RegExp): string | null {
  for (const [clave, valor] of Object.entries(campos)) {
    // Un campo "nombre" que trae un correo no es un nombre.
    if (patron.test(clave) && valor.trim() && !valor.includes('@'))
      return valor.trim().slice(0, 120);
  }
  return null;
}

function correoValido(valor: string): string | null {
  const c = valor.trim().toLowerCase();
  return CORREO.test(c) ? c : null;
}

function pasaLuhn(texto: string): boolean {
  const digitos = texto.replace(/\D/g, '');
  if (digitos.length < 13 || digitos.length > 19) return false;
  let suma = 0;
  for (let i = 0; i < digitos.length; i += 1) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  return suma % 10 === 0;
}

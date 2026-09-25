/**
 * Quién es superadministrador de esta instalación.
 *
 * Los correos de `ARCA_SUPERADMINS` (separados por coma), leídos en el
 * servidor. No es un rol en la base a propósito: el dueño de la cuenta del
 * cliente administra su cuenta y podría darse cualquier rol que viva ahí.
 * Una variable del servidor solo la cambia quien opera el servidor.
 */

export function correosSuperadmin(): string[] {
  return (process.env.ARCA_SUPERADMINS ?? '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

export function esSuperadmin(correo: string | null | undefined): boolean {
  if (!correo) return false;
  return correosSuperadmin().includes(correo.trim().toLowerCase());
}

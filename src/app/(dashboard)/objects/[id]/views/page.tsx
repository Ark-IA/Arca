import { redirect } from 'next/navigation';

/**
 * Oculto hasta terminarlo. La pantalla guarda su configuración, pero ninguna
 * otra la aplica todavía (ver ESTADO.md): mostrarla haría creer que funciona.
 * El trabajo hecho está en `pantalla-pendiente.tsx`, que no es una ruta.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/objects/${id}`);
}

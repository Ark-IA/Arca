/**
 * Nombre con el que se presenta esta instalación.
 *
 * ARCA se instala un servidor por cliente, y cada uno puede querer su propio
 * nombre en el título de la pestaña, el login y el menú. Se fija al
 * construir la imagen (NEXT_PUBLIC_*), igual que el idioma. Los logos se
 * cambian reemplazando los archivos de `public/brand/`.
 */
export const MARCA = process.env.NEXT_PUBLIC_ARCA_MARCA?.trim() || 'ARCA';

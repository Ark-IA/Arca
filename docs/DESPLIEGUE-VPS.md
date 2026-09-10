# Despliegue en VPS

Cómo poner Arca en producción en un VPS con Docker, detrás de un proxy inverso
con TLS automático, conviviendo con los demás servicios de la plataforma.

> Para desarrollo local con Docker, vea [docker.md](./docker.md). Este documento
> cubre sólo el despliegue en servidor.

---

## 1. Arquitectura

```
                    Internet
                  :80 │ :443
                      ▼
            ┌─────────────────────┐
            │       Traefik       │  proxy inverso
            │  TLS · Let's Encrypt│  descubre por etiquetas de Docker
            └──────────┬──────────┘
                       │  red: root_default
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐
   │   n8n   │   │   arca   │   │  email   │
   │  :5678  │   │  :3000   │   │  :8080   │
   └─────────┘   └────┬─────┘   └──────────┘
                      │
                      ▼
              Supabase Cloud
                 (externo)
```

Arca no lleva contenedor de base de datos: usa **Supabase Cloud**. Sólo necesita
salida a internet y las claves del proyecto. Eso simplifica el despliegue —no hay
volumen de Postgres que respaldar— pero significa que **la disponibilidad de Arca
depende de Supabase**.

---

## 2. Requisitos previos

| | |
|---|---|
| VPS | Ubuntu 22.04 o 24.04 LTS, 2 vCPU / 8 GB mínimo |
| Docker | 24+ con Compose v2 |
| Traefik | corriendo en la red `root_default` |
| DNS | registro **A** del dominio → IP del VPS |
| Supabase | proyecto creado, con las migraciones de `supabase/` aplicadas |

> El registro DNS debe resolver **antes** de levantar el stack: Traefik pide el
> certificado por desafío TLS-ALPN y falla si el dominio no apunta al servidor.
> Verifique con `dig +short arca.sudominio.com`.

---

## 3. Variables: build vs runtime

Es la parte que más confusión causa, y conviene entenderla antes de desplegar.

**Se incrustan en el bundle al construir** (`NEXT_PUBLIC_*`). Viajan al navegador
del usuario, así que sólo pueden contener valores públicos. **Cambiarlas obliga a
reconstruir la imagen**, no basta con reiniciar:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_APP_LOCALE
```

**Se leen en cada arranque** y nunca entran en la imagen. Son secretos de
servidor: quien los tenga controla el proyecto entero de Supabase.

```
SUPABASE_SERVICE_ROLE_KEY
ENCRYPTION_KEY
META_APP_SECRET
```

`ENCRYPTION_KEY` debe ser hexadecimal de 64 caracteres:

```bash
openssl rand -hex 32
```

> **No la rote a la ligera.** Cifra credenciales guardadas en la base; si la
> cambia, lo cifrado con la anterior deja de poder descifrarse.

---

## 4. Puesta en marcha

```bash
git clone https://github.com/Ark-IA/Arca.git arca
cd arca

cp .env.local.example .env.local
nano .env.local
```

Añada al final del mismo `.env.local` las dos variables del despliegue:

```ini
ARCA_HOST=arca.sudominio.com
TRAEFIK_NETWORK=root_default      # docker network ls | grep -i traefik
```

Levante combinando el archivo base con la superposición de producción:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f app
```

Qué aporta cada archivo:

| | |
|---|---|
| `docker-compose.yml` | construcción, variables, healthcheck |
| `docker-compose.prod.yml` | quita la publicación de puertos, añade las etiquetas de Traefik y limita la memoria a 1 GB |

Sin la superposición, la aplicación quedaría publicada directamente en un puerto
del host, sin TLS y saltándose el proxy.

### Verificación

```bash
docker compose ps                     # healthy
curl -I https://arca.sudominio.com    # HTTP/2 200, certificado válido
```

---

## 5. Actualizar

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Recuerde que cambiar cualquier `NEXT_PUBLIC_*` exige `--build`: un `restart` no
basta, porque esos valores ya están incrustados en el bundle.

---

## 6. Convivencia con los demás servicios

En un VPS de 2 vCPU / 8 GB compartido, el reparto aproximado es:

| Servicio | Memoria |
|---|---|
| Sistema | ~0.7 GB |
| Traefik | ~0.1 GB |
| n8n | ~0.4 GB |
| Arca | ~0.6 GB (techo de 1 GB) |
| email (nginx + PHP-FPM) | ~0.3 GB |
| MySQL | ~1.0 GB |
| **Libre** | **~4 GB** |

Dos advertencias sobre este tamaño de máquina:

- **Añada swap.** Sin swap, un pico puntual dispara el OOM killer y Docker mata
  el contenedor más grande, que suele ser el que menos conviene perder:

  ```bash
  fallocate -l 4G /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ```

- **Nada de inferencia local aquí.** La transcripción con whisper.cpp y cualquier
  modelo servido con Ollama saturan los dos núcleos mientras corren; durante esos
  segundos los webhooks de n8n dan timeout y el envío de campañas se frena. Esas
  cargas necesitan su propia máquina.

---

## 7. Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| Certificado autofirmado | El DNS no resolvía al levantar | `dig +short $ARCA_HOST`, corrija el registro A y reinicie el servicio |
| 404 desde Traefik | El contenedor no está en la red del proxy | `docker network ls`; ajuste `TRAEFIK_NETWORK` |
| La app usa el Supabase equivocado | `NEXT_PUBLIC_*` quedó incrustado de un build anterior | Reconstruya con `--build` |
| 500 en rutas de servidor | Falta `SUPABASE_SERVICE_ROLE_KEY` o `ENCRYPTION_KEY` | `docker compose logs app`; revise `.env.local` |
| El contenedor muere sin aviso | OOM killer | `dmesg | grep -i oom`; añada swap |
| `npm ci` falla al construir | Versión de npm | El Dockerfile fija Node 24 por esto; no lo baje a Node 20 |

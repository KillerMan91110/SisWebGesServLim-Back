# Despliegue de MedGo: Supabase + Render + Vercel

| Pieza | Servicio | Repositorio |
|---|---|---|
| Base de datos PostgreSQL | **Supabase** | — |
| Backend (API + Socket.io) | **Render** | `SisWebGesServLim-Back` |
| Frontend (React + Vite) | **Vercel** | `SisWebGesServLim-Front` |

Orden: **1) Supabase → 2) Render → 3) Vercel → 4) volver a Render para el CORS.**

---

## 1. Supabase (base de datos)

1. En [supabase.com](https://supabase.com) → **New project**.
   - Región: **South America (São Paulo)**, la más cercana a Lima.
   - Guarda la **contraseña de la base de datos** (la necesitarás en la cadena de conexión).
2. Arriba, botón **Connect** → pestaña **Connection string** → elige **Session pooler**.
   Copia la cadena (reemplaza `[YOUR-PASSWORD]` por tu contraseña):
   ```
   postgresql://postgres.<ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
   > Usa **Session pooler** y no "Direct connection": Render no tiene IPv6 y la conexión directa de Supabase sí lo requiere.
3. No hace falta crear tablas a mano: las migraciones (`npm run migrate`) crean todo, incluidas
   las extensiones `cube` y `earthdistance`. Si alguna vez da error de extensiones, actívalas en
   **Database → Extensions**.

### 1.1 Crear las tablas — Opción rápida: SQL Editor de Supabase

1. Abre `supabase/schema.sql` de este repositorio y copia **todo** su contenido.
2. En Supabase: **SQL Editor → New query** → pega → **Run**. Debe decir *Success. No rows returned*.
3. Verifica en **Table Editor** que aparecen 11 tablas (usuarios, solicitudes_atencion, etc.).

El script crea las extensiones, todas las tablas, activa **Row Level Security** (para que la API
pública de Supabase no exponga datos) y registra las migraciones, así el `npm run migrate` de
Render no intentará crearlas otra vez. Ejecútalo **una sola vez** y en una base vacía.
Si agregas una migración nueva, regenera el archivo con `npm run schema:supabase`.

Después crea el administrador con `npm run seed:admin` (abajo) o con el bloque opcional al final del script.

### 1.1 (alternativa) Crear las tablas y el administrador desde tu PC

En PowerShell, dentro de `D:\Tesis\Back` (la variable solo vive en esa ventana):

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<password>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
npm run migrate
npm run seed:admin -- "Nombre del Admin" admin@tucentro.pe "UnaClaveSegura2026!"
```

### 1.2 (Opcional) Copiar los datos de tu base local a Supabase

Solo si quieres llevar los usuarios y atenciones que ya tienes (incluye las cuentas de prueba):

```powershell
# 1) Respaldo de la base LOCAL (abre una ventana nueva, sin DATABASE_URL)
npm run backup                       # muestra el nombre del archivo creado

# 2) Restaurarlo en Supabase (en la ventana donde definiste DATABASE_URL)
npm run backup:restaurar -- respaldo-AAAAMMDD-HHMMSS-manual.json --confirmar
```

---

## 2. Render (backend)

### Opción A — Blueprint (recomendada)
1. [render.com](https://render.com) → **New → Blueprint** → conecta GitHub y elige `SisWebGesServLim-Back`.
2. Render lee `render.yaml` y te pide las variables marcadas como manuales:
   - `DATABASE_URL` → la cadena **Session pooler** de Supabase.
   - `CORS_ORIGIN` → por ahora pon `http://localhost:5173` (la cambiarás en el paso 4).
   - `VERCEL_PROYECTO` → déjala vacía por ahora.
3. **Apply**. `JWT_SECRET` se genera solo.

### Opción B — Web Service manual
**New → Web Service** → repo `SisWebGesServLim-Back`:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Build Command | `npm ci && npm run migrate` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | Free |

Variables de entorno (**Environment**):

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `TRUST_PROXY` | `1` |
| `DATABASE_URL` | cadena Session pooler de Supabase |
| `JWT_SECRET` | una cadena larga y aleatoria (no la de tu `.env` local) |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | URL de Vercel (paso 4) |
| `TZ_APP` | `America/Lima` |
| `RADIO_LLEGADA_METROS` | `50` |
| `MINUTOS_AVISO_SIN_MEDICO` | `10` |
| `BACKUP_INTERVALO_HORAS` | `24` |
| `BACKUP_RETENER` | `14` |

### Comprobar
Abre `https://<tu-servicio>.onrender.com/api/health` → `{"status":"ok"}`
y `https://<tu-servicio>.onrender.com/api/health/db` → muestra la hora de la base (conectó a Supabase).

---

## 3. Vercel (frontend)

1. [vercel.com](https://vercel.com) → **Add New → Project** → importa `SisWebGesServLim-Front`.
2. Framework: **Vite** (se detecta solo). Build: `npm run build`. Output: `dist`.
3. **Environment Variables** (marca *Production* y *Preview*):

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://<tu-servicio>.onrender.com/api` |
| `VITE_SOCKET_URL` | `https://<tu-servicio>.onrender.com` |

4. **Deploy**. Copia la URL final, por ejemplo `https://medgo-front.vercel.app`.

> Las variables `VITE_*` se incrustan al compilar: si las cambias, vuelve a desplegar en Vercel.
> `vercel.json` ya hace que rutas como `/admin` o `/solicitud/25` funcionen al recargar.

---

## 4. Conectar Vercel con Render (CORS)

En Render → tu servicio → **Environment**:

| Variable | Valor |
|---|---|
| `CORS_ORIGIN` | `https://medgo-front.vercel.app` (tu URL de Vercel, sin `/` al final) |

Puedes poner varias separadas por comas (por ejemplo, un dominio propio).
Si también quieres que funcionen las vistas previas de Vercel:
`CORS_PERMITIR_PREVIEWS_VERCEL=true` y `VERCEL_PROYECTO=medgo-front` (el nombre del proyecto en Vercel).

Guarda → Render vuelve a desplegar solo.

---

## 5. Lista de verificación

- [ ] `/api/health/db` responde con la hora de Supabase.
- [ ] Inicias sesión con el admin creado en el paso 1.1.
- [ ] Un paciente se registra (acepta la política de privacidad) y publica una solicitud.
- [ ] Un médico se registra, el admin lo verifica y el médico ve la solicitud en el mapa.
- [ ] El chat y la campana de notificaciones funcionan en tiempo real.
- [ ] El navegador pide permiso de ubicación (requiere HTTPS: Vercel ya lo da).

---

## Limitaciones de los planes gratuitos (para tenerlas en cuenta)

- **Render Free se duerme** tras 15 minutos sin visitas: la primera carga tarda ~1 minuto, y
  mientras duerme no corren los recordatorios ni los respaldos automáticos. Durante las dos
  semanas de uso del personal conviene mantenerlo despierto: un monitor gratuito (por ejemplo
  UptimeRobot) que visite `/api/health` cada 10 minutos, o pasar a un plan de pago.
- **El disco de Render es temporal**: los respaldos JSON que genera el sistema se borran en cada
  despliegue o reinicio. Descárgalos desde **Panel de control → Seguridad y respaldos → Descargar**.
- **Supabase Free pausa el proyecto** tras unos días sin actividad; se reactiva desde su panel.

## Seguridad antes de abrir el sistema al personal

- Usa un `JWT_SECRET` nuevo en Render (nunca el de tu `.env` local) y no subas archivos `.env` a GitHub.
- Si copiaste los datos locales, **desactiva las cuentas de prueba** (`*@test.com`,
  `*@example.com`, `*.demo@medgo.test`) en **Panel de control → Usuarios**.
- Crea las cuentas reales del personal administrativo con `npm run seed:admin` (paso 1.1).

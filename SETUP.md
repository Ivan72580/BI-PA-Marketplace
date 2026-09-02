# Puesta en marcha — Plei Marketplace Intelligence (v1: Monitor)

Esta guía cubre lo que no se puede automatizar desde acá: crear cuentas en
servicios externos. Todo lo demás (schema, páginas, insights) ya está armado
en el repo.

## 1. Base de datos (Postgres gratis)

Elegí una de las dos, ambas tienen plan free suficiente para este volumen de datos:

### Opción A: Supabase

1. [supabase.com](https://supabase.com) → "New project" → esperá a que termine de aprovisionarse (~2 min).
2. Adentro del proyecto, apretá el botón **"Connect"** (arriba del dashboard — Supabase movió esto hace poco, ya no está en Project Settings).
3. En el panel que se abre, elegí la pestaña **"ORM" → "Prisma"**: te muestra dos strings listos para copiar, ya con el formato correcto:
   - **Transaction pooler** → va en `DATABASE_URL` (la usa la app).
   - **Direct connection** → va en `DIRECT_URL` (la usa Prisma solo para migrar).
4. Reemplazá `[YOUR-PASSWORD]` en ambas por la contraseña que elegiste al crear el proyecto (o el botón de reset si no la recordás).

### Opción B: Neon

1. [neon.tech](https://neon.tech) → "New project".
2. En el dashboard, el connection string está directo en la pantalla principal ("Connection string"). Neon no separa pooler/directa de forma obligatoria: podés usar el mismo valor para `DATABASE_URL` y `DIRECT_URL` sin problema.

Pegá los valores en `.env` (copiá `.env.example` a `.env` primero).

## 2. Login con Google Workspace

1. Andá a [Google Cloud Console](https://console.cloud.google.com/) → creá un proyecto (o usá uno existente de la empresa).
2. **APIs & Services → OAuth consent screen**: tipo "Internal" si querés que solo gente de tu Workspace pueda verlo en la pantalla de consentimiento (recomendado).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, tipo "Web application".
   - Authorized redirect URI (desarrollo): `http://localhost:3000/api/auth/callback/google`
   - Authorized redirect URI (producción, una vez que tengas la URL de Vercel): `https://tu-dominio.vercel.app/api/auth/callback/google`
4. Copiá el **Client ID** y **Client Secret** a `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. En `.env`, poné `ALLOWED_GOOGLE_DOMAIN="plei.com"` — esto bloquea el login a cualquiera que no tenga un correo de ese dominio, aunque tenga cuenta de Google. **Importante**: esto es una segunda capa de seguridad, no reemplaza la configuración de Google Cloud Console (ver más abajo) — si tu app de Google sigue en modo "Testing" con solo tu cuenta como test user, nadie más va a poder ni siquiera llegar a esta validación.

### Compartir el acceso con el equipo (obligatorio para que otros puedan entrar)

Google, por defecto, bloquea el login de cualquiera que no esté explícitamente autorizado mientras la app esté en modo "Testing". Andá a **Google Cloud Console → tu proyecto → APIs & Services → OAuth consent screen** y elegí una de estas dos opciones:

- **Rápida**: en "Audience" (o "Test users"), agregá a mano el email de cada persona del equipo que va a probar la app. Funciona al toque, hasta 100 emails.
- **Si tu proyecto está bajo el Workspace de @plei.com**: cambiá "User Type" de "External" a "Internal" — así cualquier cuenta @plei.com entra sola, sin agregar a nadie a mano, y queda restringido al dominio también del lado de Google.

Si vas a compartir la app por un link que no sea `localhost` (por ejemplo, una vez desplegada en Vercel), también hay que agregar esa URL real en **Authorized redirect URIs**, dentro de las credenciales OAuth del mismo proyecto — el formato es `https://tu-dominio-de-deploy.vercel.app/api/auth/callback/google`.
6. Generá `AUTH_SECRET` corriendo en la terminal: `openssl rand -base64 32`, y pegalo en `.env`.

## 3. Instalar, migrar e importar los datos

```bash
npm install
npx prisma migrate dev --name init                    # crea las tablas en tu base
npx prisma migrate dev --name add_composite_indexes    # agrega los índices de performance
npm run db:import                                      # sincroniza data/events.csv (upsert real)
```

El import es seguro de correr más de una vez (usa upsert): si volvés a exportar
de Hex con datos más recientes, correr el mismo comando actualiza en vez de duplicar.

## 4. Correrlo en local

```bash
npm run dev
```

Entrá a `http://localhost:3000` — te va a pedir login con Google (dominio restringido).

## 5. Deploy (Vercel, gratis en esta etapa)

1. **GitHub**: asegurate de que tu código local (con todos los cambios más recientes) esté comiteado y pusheado al repo.
2. **Vercel**: en [vercel.com](https://vercel.com) → "Add New" → "Project" → importá el repo. Next.js se detecta solo, no hace falta tocar la config de build.
3. **Variables de entorno**: antes de deployar, cargá en *Settings → Environment Variables* las mismas de tu `.env` local — `DATABASE_URL`, `DIRECT_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_GOOGLE_DOMAIN` y `AUTH_SECRET`. Sin `AUTH_SECRET` el login no funciona en producción.
4. **Deploy**: te da una URL tipo `https://tu-proyecto.vercel.app` — el login todavía no va a andar hasta el paso siguiente.
5. **Google Cloud Console**: volvé a *Credentials → tu OAuth Client ID* y agregá la URL real de Vercel en dos lugares — *Authorized JavaScript origins* (`https://tu-proyecto.vercel.app`) y *Authorized redirect URIs* (`https://tu-proyecto.vercel.app/api/auth/callback/google`, con esa ruta exacta).
6. **Test users / Internal**: confirmá en *OAuth consent screen* que los emails del equipo estén autorizados (ver sección de login más abajo).
7. Probá vos primero con tu propio usuario antes de compartir el link.

**Nota de costos**: el plan Hobby de Vercel es gratuito pero sus términos son
para uso no comercial. Mientras esto es una iniciativa propia en etapa
temprana no hay problema; el día que genere ingresos directos, pasar a Vercel
Pro (~US$20/mes) es lo correcto.

## Actualizar los datos (procedimiento recurrente)

Cuando tengas un export nuevo desde Hex:

1. Descargalo y guardalo pisando el archivo existente en `data/events.csv` (siempre el mismo nombre y lugar).
2. Corré `npm run db:import`.

Es seguro repetirlo las veces que haga falta — el importador sincroniza (inserta lo nuevo y actualiza lo que cambió, como un rating cargado después del partido), no duplica ni requiere que armes ningún archivo distinto cada vez.

## Caché y performance (agregado para que aguante crecimiento de datos y varios usuarios a la vez)

Las consultas pesadas (Overview, tabla de facilities, heatmap, etc.) ahora se cachean 5 minutos server-side — si dos personas (o dos pestañas tuyas) miran el mismo filtro dentro de esa ventana, la segunda carga es instantánea, no recalcula nada. No requiere ninguna configuración de tu parte, ya viene activo.

**Importante**: como el caché dura 5 minutos, después de correr `npm run db:import` los datos nuevos pueden tardar hasta 5 minutos en reflejarse en la interfaz (no es inmediato). Si alguna vez necesitás verlo al instante después de importar, reiniciá `npm run dev` (en producción, un nuevo deploy también lo limpia).

Si en algún momento este delay se vuelve molesto, se puede conectar el importador a un endpoint que invalide el caché apenas termina de sincronizar — quedó preparado para eso (`GAMES_DATA_TAG` en `app/lib/db/cache.ts`), pero no lo armamos todavía porque agrega una pieza más (un endpoint autenticado) que no hacía falta para esta etapa.

## Qué quedó afuera de esta v1 (a propósito)

- Las pantallas de `Marketplace`, `Funnel`, y las rutas `/city`, `/facility`,
  `/region` siguen con datos de ejemplo (mock) — no se tocaron en esta etapa,
  quedan marcadas como "Demo" en el menú lateral. Se migran al esquema real
  en la siguiente etapa.
- El filtro superior (Región/Market) ahora vive en la URL (`?regionId=...`),
  no en el contexto global — así las vistas de Overview/Estacionalidad son
  compartibles por link. Como consecuencia, esas pantallas de demo dejaron
  de reaccionar al filtro (van a mostrar siempre sus datos fijos de ejemplo).
- `Facility Cost` y `Gross Profit` no se importan (tu equipo no gestiona ese
  dato hoy). Si en el futuro empieza a cargarse, se agrega al modelo sin
  romper nada de lo existente.

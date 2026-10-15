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
npx prisma generate         # genera el cliente de Prisma — no depender del postinstall automático
npx prisma migrate deploy   # aplica TODAS las migraciones que ya están en prisma/migrations/ a tu base
npm run db:import           # sincroniza data/events.csv (upsert real)
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

**Migraciones en cada deploy**: el build (`npm run build`) corre `prisma migrate deploy` antes de compilar — cada vez que pusheás a `main`, Vercel aplica solo las migraciones que todavía no estén en la base real (usando las variables de entorno de Vercel, nunca tu `.env` local), antes de que la nueva versión quede live. No hace falta correr nada a mano contra producción nunca. Si una migración fallara (por ejemplo, un `DIRECT_URL` mal cargado), el deploy entero falla en vez de quedar a mitad de camino — es la base real protegida por el mismo motivo.

**Nota de costos**: el plan Hobby de Vercel es gratuito pero sus términos son
para uso no comercial. Mientras esto es una iniciativa propia en etapa
temprana no hay problema; el día que genere ingresos directos, pasar a Vercel
Pro (~US$20/mes) es lo correcto.

## 6. Entorno de desarrollo separado (para no gastar el cupo de Neon en pruebas)

Neon (plan free) da 5 GB de transferencia por mes, y ese cupo es **por
proyecto** — no importa si la consulta viene de `localhost` o de la URL de
Vercel: si usan el mismo `DATABASE_URL`, cuentan contra el mismo cupo. Si
todos los días probás cambios en tu compu contra la misma base que usa
producción, esas pruebas ya están gastando el cupo real, aunque nunca las
pushees.

La solución es tener un segundo proyecto de Neon, gratis, solo para tu
compu — Neon permite hasta 100 proyectos por cuenta. Esto **no toca
producción en ningún momento**: `.env` está en `.gitignore` (nunca se sube
al repo) y Vercel no lee ese archivo — sus variables están configuradas
aparte, en *Settings → Environment Variables* de tu proyecto en Vercel. Cambiar
tu `.env` local es 100% reversible y no puede romper nada en la app real.

1. **Creá el proyecto nuevo**: en el mismo dashboard de [neon.tech](https://neon.tech)
   donde ya tenés el de producción, apretá "New project" de nuevo. Poné un
   nombre que lo distinga (ej: `plei-dev`). Copiá el connection string que
   te da (igual que en el paso 1 de esta guía).
2. **Guardá una copia de tu `.env` actual**, por si querés volver atrás:
   duplicá el archivo y renombrá la copia, por ejemplo `.env.produccion-backup.txt`
   (con `.txt` al final para que no se confunda con un `.env` real).
3. **Editá `.env`** (el de siempre, no la copia) y reemplazá los valores de
   `DATABASE_URL` y `DIRECT_URL` por los del proyecto nuevo.
4. **Creá las tablas en la base nueva**, corriendo en la terminal, parado en
   la carpeta del proyecto:
   ```bash
   npx prisma migrate deploy
   ```
   Esto replica toda la estructura (tablas y columnas) que ya existe en
   producción, pero en la base vacía nueva — no lee ni modifica nada de la
   base real.
5. **(Opcional) Cargá datos de prueba**: si todavía tenés a mano los mismos
   CSV que usaste para cargar producción, podés importarlos también acá con
   `npm run db:import` (y `db:import-game-reviews` / `db:import-satisfaction`
   si corresponde) — con `.env` ya apuntando a la base nueva, van a escribir
   ahí, no en la real. Si no querés cargar nada, la base queda vacía y
   algunas pantallas van a mostrar "sin datos", pero alcanza para probar que
   una pantalla no se rompe.
6. **Confirmá que quedó bien**: `npm run dev` y entrá a `http://localhost:3000`.
   De ahora en más, todo lo que hagas ahí adentro (recargar, filtrar, probar
   un cambio) pega contra la base de prueba, no contra la real.

Si alguna vez necesitás mirar los datos reales desde tu compu (poco común),
restaurá el backup del paso 2 pisando `.env`, y acordate de volver a poner
los valores de desarrollo después.

**Cuando se agregue una tabla o columna nueva** (una migración nueva en
`prisma/migrations/`), hay que correr `npx prisma migrate deploy` una vez
más para que la base de desarrollo la tenga también — se va a avisar
explícitamente cada vez que pase.

## Actualizar los datos (procedimiento recurrente)

Cuando tengas un export nuevo desde Hex:

1. Descargalo y guardalo pisando el archivo existente en `data/events.csv` (siempre el mismo nombre y lugar).
2. Corré `npm run db:import`.

Es seguro repetirlo las veces que haga falta — el importador sincroniza (inserta lo nuevo y actualiza lo que cambió, como un rating cargado después del partido), no duplica ni requiere que armes ningún archivo distinto cada vez.

**Sobre la ventana de 2 años del export**: el importador solo toca los partidos que están presentes en el CSV que le pasás — nunca borra nada que no aparezca ahí. Un partido de hace 3 años que ya no entra en la ventana de la exportación se queda intacto en la base, no se pierde.

### Automatizarlo (opcional): que se sincronice solo todos los días

En vez del paso manual de arriba, `npm run auto-import` busca en tu carpeta de Descargas el archivo más reciente con el patrón `events_output_YYYY-MM-XXXXXXX.csv`, lo copia a `data/events.csv`, y corre la sincronización — todo en un solo comando.

Para que corra solo una vez por día, programalo con el **Programador de Tareas de Windows**:

1. Abrí "Programador de tareas" (buscalo en el menú de inicio).
2. "Crear tarea básica" → nombre a tu gusto (ej: "Sync Plei diario").
3. Desencadenador: "Diariamente", elegí el horario que prefieras (ideal: después de la hora en que sueles descargar el export de Hex).
4. Acción: "Iniciar un programa".
   - Programa/script: `cmd.exe`
   - Argumentos: `/c npm run auto-import`
   - Iniciar en: la ruta completa de tu proyecto (ej: `D:\Backup\BI App\marketplace-intelligence-main`)
5. Terminar. Podés probarlo enseguida haciendo clic derecho sobre la tarea → "Ejecutar", sin esperar al horario programado.

Si no bajaste ningún export nuevo ese día, el script no encuentra nada y no hace nada (no rompe nada, solo no tiene novedades que sincronizar).

**Si algo no anduvo bien**: la ventana de `cmd.exe` se cierra sola apenas el proceso termina (haya salido bien o mal), así que no da tiempo a leer nada en pantalla — no es un indicador confiable de si funcionó. Revisá en cambio `logs\auto-import.log` dentro de la carpeta del proyecto: ahí queda registrada cada corrida completa, línea por línea, incluida la salida real del import y cualquier error (por ejemplo, si el archivo llegó pero falló al copiarlo o al sincronizar con la base). Si tres fuentes están configuradas y una falla, las otras dos igual se procesan — no se corta todo por una sola.

### Mantener producción y pre-producción al día con el mismo import

El `.env` de tu PC suele apuntar a pre-producción, mientras que la app de Vercel lee de otra base. Por eso un import normal solo actualiza la base del `.env`. Para que `npm run auto-import` (y la tarea programada) cargue las dos, agregá al `.env` de tu PC:

```
PROD_DATABASE_URL="…la misma conexión que DATABASE_URL en Vercel…"
PROD_DIRECT_URL="…la misma que DIRECT_URL en Vercel (opcional; si falta se usa PROD_DATABASE_URL)…"
REVALIDATE_URL="https://TU-APP.vercel.app/api/revalidate"   # solo se avisa tras importar a producción
REVALIDATE_SECRET="…el mismo valor que en Vercel…"
```

Cada fuente se sincroniza primero con la base del `.env` y después con producción. Si una falla, la otra igual se intenta, y el log (`logs\auto-import.log`) marca cuál destino falló y su host (sin credenciales). Si `PROD_DATABASE_URL` no está definida, el log lo avisa en cada corrida. Para ponerte al día solo en producción: `npm run auto-import -- --only=prod` (o `--only=local`). El import es un upsert por id, así que repetirlo no duplica nada.

## Caché y performance (agregado para que aguante crecimiento de datos y varios usuarios a la vez)

Las consultas pesadas (Overview, tabla de facilities, heatmap, etc.) ahora se cachean 5 minutos server-side — si dos personas (o dos pestañas tuyas) miran el mismo filtro dentro de esa ventana, la segunda carga es instantánea, no recalcula nada. No requiere ninguna configuración de tu parte, ya viene activo.

**Importante**: el caché dura 30 minutos, así que después de un import los datos nuevos pueden tardar hasta ese tiempo en verse. Hay tres formas de saltearlo:

1. **Automática al terminar el import** (opcional): definí `REVALIDATE_SECRET` (cualquier texto largo, el mismo valor en Vercel y en el `.env` de tu PC) y `REVALIDATE_URL=https://TU-APP.vercel.app/api/revalidate` en el `.env` de tu PC. Al final de `npm run db:import` el script avisa a la app y el caché se limpia solo. Si falta alguna de las dos variables, o el aviso falla, el import igual termina bien (solo lo informa por consola).
2. **Manual**: en `/admin/users`, botón **Actualizar datos ahora** (solo Admin).
3. En desarrollo local, reiniciar `npm run dev`.

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

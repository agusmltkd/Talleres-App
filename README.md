# Talleres de tacógrafo · guía de puesta en marcha

App web para el equipo comercial: mapa de los centros técnicos de tacógrafo de España y Portugal, ficha de cada taller (estado, comercial, contactos, visitas, ventas y equipos), agenda, rutas, panel de resultados e importación/exportación a Excel. Funciona en el ordenador y se instala en el móvil como una app.

- **Web**: GitHub Pages (gratis).
- **Base de datos y usuarios**: Supabase (el plan gratuito sobra para un equipo pequeño).

Se tarda unos 20 minutos. No hace falta programar: solo copiar y pegar.

---

## Antes de nada: pruébala sin instalar nada

Abre `index.html` desde la web publicada añadiendo `?demo` al final (por ejemplo `https://tuusuario.github.io/talleres/?demo`). Entra como administrador o como comercial de prueba. Lo que hagas en modo demo se guarda solo en ese navegador y no toca la base de datos real.

Mientras `js/config.js` no esté relleno, la app arranca siempre en modo demo.

---

## Paso 1 · Crear la base de datos en Supabase

1. Entra en <https://supabase.com>, crea una cuenta (con el email de la empresa) y pulsa **New project**.
   - Nombre: `talleres` (o el que quieras).
   - Contraseña de la base de datos: genera una y guárdala (no la necesita la app, pero no la pierdas).
   - Región: **Europe (Frankfurt / Paris / London)**, la más cercana.
2. Cuando termine de crearse, ve a **SQL Editor** (menú de la izquierda) → **New query**.
3. Abre el archivo `supabase/schema.sql` de esta carpeta, copia **todo** su contenido, pégalo y pulsa **Run**. Debe decir *Success*.
   Esto crea las tablas, los permisos (quién puede ver y cambiar qué) y la sincronización en tiempo real.

## Paso 2 · Configurar el acceso

En **Authentication**:

1. **Sign In / Providers** (o *Providers* → *Email*): deja activado **Email** y **desactiva "Allow new users to sign up"**. Así nadie puede registrarse solo: los usuarios los creas tú.
2. **URL Configuration**:
   - **Site URL**: la dirección donde quedará publicada la app (la tendrás en el paso 4, por ejemplo `https://tuusuario.github.io/talleres/`). Puedes volver aquí después.
   - **Redirect URLs**: añade esa misma dirección. Es para que funcione el enlace de "He olvidado mi contraseña".

## Paso 3 · Crear los usuarios

1. **Authentication → Users → Add user → Create new user**.
2. Pon el email y una contraseña inicial, y marca **Auto Confirm User**.
3. Repite para cada persona (tu padre, cada comercial…). Todos se crean como **comercial**.
4. Para hacer **administrador** a tu padre (o a quien vaya a gestionar), vuelve al **SQL Editor** y ejecuta, cambiando el email y el nombre:

   ```sql
   update public.perfiles set rol = 'admin', nombre = 'Nombre Apellido'
   where email = 'correo@empresa.com';
   ```

   El resto de nombres y colores se pueden cambiar luego desde la propia app (**Gestión → Usuarios**).

Cada persona puede cambiar su contraseña desde el menú de su cuenta (círculo con sus iniciales, arriba a la derecha).

## Paso 4 · Conectar la app con Supabase

1. En Supabase pulsa el botón **Connect** (arriba) o ve a **Project Settings → API Keys**. Necesitas dos datos:
   - **Project URL** → algo como `https://abcdefghijklm.supabase.co`
   - La clave **pública**: la *publishable key* (empieza por `sb_publishable_`) o, si tu proyecto la muestra, la antigua *anon key* (empieza por `eyJ`).
2. Abre `js/config.js` con cualquier editor de texto y pégalos entre las comillas:

   ```js
   export const SUPABASE_URL = 'https://abcdefghijklm.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```

> ⚠️ **Nunca pegues la clave *secret* ni la *service_role***. La pública está pensada para ir en la web: los permisos de la base de datos (paso 1) son los que protegen los datos. Si por error pegas la secreta, la app se niega a arrancar y te avisa.

## Paso 5 · Publicarla en GitHub Pages

1. Crea una cuenta en <https://github.com> si no la tienes.
2. **New repository** → nombre `talleres` → **Public** → *Create repository*.
   (Con el plan gratuito, GitHub Pages necesita que el repositorio sea público. Solo se publica el código y el listado oficial de talleres, que ya es público; los clientes, visitas y ventas están en Supabase y solo los ve quien entra con usuario.)
3. En el repositorio: **Add file → Upload files**, arrastra **todo el contenido** de esta carpeta (los archivos y las carpetas `css`, `data`, `icons`, `js`, `supabase`) y pulsa **Commit changes**.
   `index.html` tiene que quedar en la raíz del repositorio, no dentro de otra carpeta.
4. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch: `main` / `(root)` → **Save**.
5. En uno o dos minutos te dará la dirección: `https://tuusuario.github.io/talleres/`. Ponla en Supabase como *Site URL* y *Redirect URL* (paso 2) si no lo hiciste.

## Paso 6 · Primer arranque (como administrador)

1. Abre la dirección y entra con el usuario administrador.
2. Ve a **Gestión → Datos → Talleres del registro oficial → "Cargar talleres que falten"**. Sube a la base de datos los 881 centros (registro oficial del Ministerio a 30/09/2026, lista del IPQ de Portugal y tu recopilatorio de redes 2025). Solo hay que hacerlo una vez.
3. Opcional pero recomendable: **Gestión → Datos → Ubicación exacta → "Buscar direcciones exactas"**. Busca cada taller por su dirección en OpenStreetMap para colocarlo en su sitio exacto (ahora está en el centro de su código postal). Va a un taller por segundo, así que tarda unos 15 minutos; puedes pararlo y seguir otro día. Los que no encuentre se pueden colocar a mano arrastrando el pin desde su ficha.
4. **Gestión → Asignar talleres por provincia**: reparte los talleres entre los comerciales de un golpe.
5. Pasa la dirección a los comerciales con su email y contraseña.

## Instalarla en el móvil

- **Android (Chrome)**: abrir la dirección → menú ⋮ → **Instalar aplicación** / *Añadir a pantalla de inicio*.
- **iPhone (Safari)**: abrir la dirección → botón compartir → **Añadir a pantalla de inicio**.

Aparece con su icono y se abre a pantalla completa. **"Cerca de mí"** usa el GPS del móvil para ordenar la lista por distancia (hay que permitir la ubicación la primera vez).

---

## Qué puede hacer cada rol

| | Administrador | Comercial |
|---|---|---|
| Ver todos los talleres en el mapa | ✔ | ✔ |
| Editar cualquier taller, asignar comerciales | ✔ | — |
| Editar sus talleres, quedarse con uno libre | ✔ | ✔ |
| Visitas, contactos, ventas y equipos | De todos | De sus talleres |
| Panel de resultados | Todo el equipo y por comercial | Los suyos |
| Gestión (usuarios, carga de datos, geolocalización, importar Excel) | ✔ | — |
| Exportar a Excel | ✔ | ✔ (lo que ve en la lista) |

Los cambios aparecen al momento en los demás dispositivos (el punto verde arriba indica que está sincronizado).

## Importar desde Excel

**Gestión → Datos → Excel → "Importar Excel…"** (admite .xlsx, .xls y .csv). Reconoce columnas como *Nombre, CIF, Dirección, CP, Población, Teléfono, Email, Estado, Comercial, Notas* (da igual mayúsculas o acentos). Antes de guardar enseña un resumen de cuántos talleres se actualizarán (coinciden por CIF y código postal, o por nombre y código postal) y cuántos se añadirán como nuevos.

## Mantenimiento

- **Actualizar el registro oficial**: cuando el Ministerio publique un PDF nuevo, pásamelo y te genero el `data/talleres.json` actualizado. Sustitúyelo en GitHub y pulsa **Gestión → "Actualizar tarjetas y bajas del registro"** y **"Cargar talleres que falten"**. No se pierde nada de lo que haya apuntado el equipo.
- **Si cambias archivos de la app**: abre `sw.js` y sube el número de `VERSION` (`'v1'` → `'v2'`). Así los móviles que la tienen instalada cargan la versión nueva.
- **Copias de seguridad**: **Gestión → Datos → Excel → "Exportar todo a Excel"** guarda talleres, visitas, ventas, equipos y contactos. Conviene hacerlo de vez en cuando.
- **Supabase gratis**: si el proyecto pasa una semana sin ningún uso, Supabase lo pausa; se reactiva desde su panel con un clic. Con uso diario no pasa.
- **Mapas y direcciones**: se usan los servicios gratuitos de OpenStreetMap, pensados para uso moderado; para un equipo comercial es de sobra.

## Estructura

```
index.html            la app
css/app.css           estilos (modo claro y oscuro)
js/config.js          ← aquí van los datos de Supabase
js/*.js               mapa, ficha, agenda, ruta, resultados, gestión…
data/talleres.json    centros oficiales (España + Portugal + recopilatorio 2025)
data/cp.json          centros de códigos postales
data/provincias.json  contornos de provincias
supabase/schema.sql   script de la base de datos
sw.js, manifest.webmanifest, icons/   para instalarla en el móvil
```

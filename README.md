# MiArmario
Control de prendas

## Inicio de sesión

En Firebase Authentication, activa el proveedor **Google** y desactiva los
demás proveedores si solo quieres permitir este método. En **Settings >
Authorized domains**, añade `fsmdasanlo.github.io` y, para pruebas locales,
`localhost` si aún no aparecen. El navegador debe permitir ventanas emergentes.
Si ya existen cuentas con otros proveedores, revisa su acceso antes de
desactivarlos: este cambio no migra ni vincula esas cuentas.

## Prendas y reglas de Firestore

Cada prenda nueva requiere un precio en euros (puede ser cero). Las prendas
guardadas antes de introducir el precio siguen visibles; al editarlas se debe
indicar su precio. Para que el guardado funcione, publica el contenido completo
de `firestore.rules` en **Firestore Database > Reglas** antes de publicar la
versión actual de la aplicación.

## Asistente y Cloud Function

`recommendOutfit` es una función callable de Firebase de segunda generación,
en `us-central1`. Permite las llamadas desde `https://fsmdasanlo.github.io` y
`http://localhost:5173`; Firebase gestiona el preflight y la autenticación
sigue siendo obligatoria.

Para desplegar únicamente esta función, compila primero desde `functions`
con `npm run build` y después, desde la raíz del proyecto, ejecuta:

```sh
firebase deploy --only functions:recommendOutfit --project miarmario-15bf6
```

La función necesita el secreto `GROQ_API_KEY` configurado en Firebase.
Después del despliegue, comprueba el preflight desde PowerShell:

```powershell
curl.exe -i -X OPTIONS 'https://us-central1-miarmario-15bf6.cloudfunctions.net/recommendOutfit' -H 'Origin: https://fsmdasanlo.github.io' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type'
```

La respuesta debe ser `204` e incluir `Access-Control-Allow-Origin` con el
origen solicitado, `Access-Control-Allow-Methods: POST` y los encabezados
solicitados en `Access-Control-Allow-Headers`. Repite la comprobación con el
origen `http://localhost:5173`. Si aparece `404`, comprueba el proyecto, la
región y el despliegue de la función.

## Publicación manual en GitHub Pages

La aplicación se compila con Vite para la ruta `/MiArmario/` y utiliza
rutas con `#`, por lo que GitHub Pages no necesita redirecciones para la
navegación. El `index.html` de la raíz es para desarrollo; Pages debe
servir el contenido compilado de `dist`.

1. En GitHub, abre **Settings > Pages** y selecciona **GitHub Actions** como
   origen de publicación.
2. Para utilizar la configuración Firebase existente, añade en **Settings >
   Secrets and variables > Actions > Variables** las variables
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET` y
   `VITE_FIREBASE_APP_ID`. `VITE_FIREBASE_MESSAGING_SENDER_ID` es opcional.
   Son valores de configuración del cliente y estarán visibles en la
   aplicación publicada; no incluyas credenciales privadas. Sin los valores
   obligatorios, la aplicación mostrará las instrucciones de configuración.
3. Sube estos cambios a la rama predeterminada del repositorio. En **Actions**,
   selecciona **Publicar en GitHub Pages**, pulsa **Run workflow** y elige la
   rama que contiene los cambios. El flujo solo se ejecuta manualmente:
   instala las dependencias, compila y publica `dist`.
4. Comprueba el resultado en https://fsmdasanlo.github.io/MiArmario/.

Para comprobar la compilación localmente, ejecuta `npm ci` y después
`npm run build`. El resultado se genera en `dist`.

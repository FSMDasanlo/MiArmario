# MiArmario
Control de prendas

## Inicio de sesión

En Firebase Authentication, activa el proveedor **Google** y desactiva los
demás proveedores si solo quieres permitir este método. En **Settings >
Authorized domains**, añade `fsmdasanlo.github.io` y, para pruebas locales,
`localhost` si aún no aparecen. El navegador debe permitir ventanas emergentes.
Si ya existen cuentas con otros proveedores, revisa su acceso antes de
desactivarlos: este cambio no migra ni vincula esas cuentas.

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

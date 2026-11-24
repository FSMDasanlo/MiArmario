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

### Añadir mediante código o fotografía

En **Añadir prenda**, pulsa **Código de barras o QR** para usar la cámara o
introducir el código manualmente. Se consultan códigos EAN/UPC válidos y QR
GS1 que contengan un GTIN; no se abren las direcciones incluidas en los QR.
Los datos proceden de [Open Products Facts](https://world.openproductsfacts.org/),
disponibles bajo la [ODbL](https://opendatacommons.org/licenses/odbl/1.0/).
Es un catálogo comunitario, no oficial de Inditex, y puede no tener la prenda
o todos sus datos. La búsqueda envía el código al catálogo y está sujeta a sus
límites y disponibilidad. La cámara requiere HTTPS o localhost y permiso del
navegador; si no está disponible, utiliza la entrada manual.

Al añadir una prenda, tanto **Crear con foto** como el selector de
**Fotografía** permiten elegir una imagen JPG, PNG o WebP de hasta 5 MB.
Se propone ZARA como marca si el campo está vacío; es un valor predeterminado,
no una identificación de la marca, y puedes cambiarlo. Se solicita confirmación
antes de enviar cada foto a Groq, mediante una función autenticada que usa
`qwen/qwen3.8-27b` para sugerir nombre, categoría y color. El análisis puede
generar costes y sus sugerencias pueden ser incorrectas. Evita fotografiar
personas o información sensible. Si no aceptas el envío, la foto queda
seleccionada para guardarla normalmente, pero no se analiza. Al editar una
prenda, cambiar la foto no inicia un análisis.

Ambos métodos rellenan solo los datos disponibles sin sustituir el texto ya
introducido. Revisa las sugerencias y completa manualmente los datos que
falten, incluidos precio, temporada y estilo; no se guarda nada hasta pulsar
**Añadir al armario**.

Para activar el análisis, configura el secreto `GROQ_API_KEY` en Firebase si
aún no existe. Compila desde `functions` con `npm run build` y, desde la raíz,
despliega únicamente la nueva función:

```sh
firebase deploy --only functions:analyzeGarmentPhoto --project miarmario-15bf6
```

La función se despliega en `us-central1`, requiere inicio de sesión y tiene
un límite independiente de ocho solicitudes por usuario y minuto. Después,
publica la nueva versión de la web siguiendo los pasos de GitHub Pages de
abajo. Ninguno de estos pasos se ejecuta automáticamente al modificar el código.

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

## Vestuario Virtual

La sección permite guardar una fotografía personal de cuerpo entero, elegir una
prenda con foto y solicitar una simulación orientativa. Antes de cada solicitud
hay que aceptar expresamente el envío de ambas fotografías a Google Vertex AI.
El modelo `gemini-nano-banana-2.1` usa el endpoint global: no se garantiza que
el procesamiento tenga lugar en España ni en la UE. Cada intento puede generar
costes y el resultado no garantiza la talla ni el ajuste real.

La foto y el último resultado se guardan en rutas privadas de Storage por UID.
Se sustituyen al guardar una nueva foto o generar correctamente un nuevo
resultado, y pueden eliminarse desde la sección. Las funciones los escriben
mediante el SDK administrativo sin crear enlaces de descarga; el navegador usa
lecturas autenticadas. No se guardan imágenes en Firestore. Las reglas locales
de Storage deben desplegarse para habilitar estas lecturas y eliminaciones;
Firestore no necesita nuevas reglas. Las prendas siguen usando sus mecanismos
existentes.

Para una primera prueba real, tras revisar y autorizar expresamente costes y
tratamiento de imágenes:

1. Comprueba la facturación y habilita la API Vertex AI (`aiplatform.googleapis.com`)
   en el proyecto `miarmario-15bf6`. Verifica el acceso al modelo. En Cloud Run,
   comprueba la cuenta de servicio de las funciones y concédele el rol
   **Vertex AI User** (`roles/aiplatform.user`) y acceso adecuado a Firestore y
   al bucket. No se necesita una clave API de Gemini.
2. Identifica el bucket en Firebase > Storage y consulta su CORS actual con
   `gcloud storage buckets describe gs://NOMBRE_DEL_BUCKET --format="json(cors)"`.
   Si las lecturas autenticadas fallan por CORS, crea un archivo JSON local que
   conserve todas las entradas existentes y añada esta entrada:

   ```json
   {
     "origin": ["https://fsmdasanlo.github.io", "http://localhost:5173"],
     "method": ["GET", "DELETE"],
     "responseHeader": ["Authorization", "Content-Type", "X-Firebase-Storage-Version", "X-Firebase-AppCheck"],
     "maxAgeSeconds": 3600
   }
   ```

   El archivo debe contener un **array** de entradas CORS. Después aplica el
   array completo con `gcloud storage buckets update gs://NOMBRE_DEL_BUCKET
   --cors-file=cors-vestuario.json`. El comando sustituye la configuración
   anterior: no lo ejecutes sin conservarla. Verifica los encabezados concretos
   en el navegador; consulta la
   [documentación de Firebase](https://firebase.google.com/docs/storage/web/download-files#cors_configuration).
3. En PowerShell, desde la raíz, compila y despliega:

   ```powershell
   npm run build --prefix functions
   npm run build
   firebase deploy --only storage,functions:saveVirtualTryOnPhoto,functions:generateVirtualTryOn --project miarmario-15bf6
   ```

   Después publica la web siguiendo el procedimiento de GitHub Pages de abajo.
   Estos pasos no se realizan automáticamente.
4. Inicia sesión, sube una foto personal, selecciona una prenda con foto, lee y
   acepta el consentimiento y pulsa **Probar cómo me queda** una sola vez.

La función se ejecuta en `us-central1` y llama al modelo con ubicación `global`.
El SDK no reintenta automáticamente la solicitud al modelo; una nueva pulsación
es un nuevo intento potencialmente facturable. La aplicación conserva únicamente
el último resultado y muestra un error si no recibe exactamente una imagen.

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

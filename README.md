# Formulario de pedido Enagic

Aplicación estática que genera en el navegador una copia cumplimentada de `srcs/Kangen_Orders.pdf`. No guarda ni envía los datos a un servidor.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube todos los archivos de esta carpeta, incluido el PDF y la carpeta `vendor`.
2. En **Settings → Pages**, selecciona **Deploy from a branch**, la rama publicada y la carpeta `/ (root)`.
3. Comparte la dirección HTTPS que proporciona GitHub Pages. No compartas archivos de pedidos ni datos de clientes en el repositorio.

Para probar en local, ejecuta `py -m http.server 8000` desde esta carpeta y abre `http://localhost:8000`. Abrir directamente el HTML como archivo puede impedir la carga del PDF.

## Uso y limitaciones

- El cliente revisa el documento original, completa el formulario y dibuja su firma, sube una imagen o toma una foto con la cámara. El patrocinador también puede dibujar su firma, cargarla o fotografiarla. Las imágenes se procesan en el dispositivo y se convierten en PNG transparente; la firma del solicitante se incorpora proporcionalmente en ambas páginas y su fecha se toma del reloj del dispositivo.
- En la primera página, ambas firmas utilizan el mismo espacio máximo que la firma de la segunda página y pueden superponerse al resto del documento. Las imágenes se escalan proporcionalmente; la firma de la segunda página conserva su tamaño anterior.
- Para retirar el fondo, usa papel claro y liso, buena iluminación y una firma oscura. Revisa la vista previa: sombras, fondos complejos o trazos muy claros pueden afectar al resultado; vuelve a hacer la foto si es necesario. Se admiten los formatos de imagen que pueda abrir el navegador, de hasta 20 MB.
- La cámara requiere permiso y HTTPS o `localhost`. Si no está disponible, utiliza la opción de subir imagen. La cámara se detiene al cerrarla o al cambiar de pestaña.
- La firma del patrocinador es independiente. Si no está disponible, el documento debe completarse con ella antes de presentarlo. El Acuerdo de Distribuidor, el documento de identidad y el Acuerdo de Financiación, cuando sean necesarios, deben facilitarse por separado.
- La dirección de envío coincide por defecto con la dirección indicada; puede cambiarse. Los prefijos del teléfono y del móvil se seleccionan por separado entre los países de la UE, con España por defecto. El móvil es opcional; si se deja vacío no se incluye su prefijo en el PDF.
- Se exige un DNI / NIF personal español de ocho cifras y una letra de control válida. El formato mostrado en el formulario es ilustrativo; no se admiten NIE ni NIF de empresa en ese campo.
- La línea del patrocinador se elige entre 1 y 6 y es opcional. Los datos del reclutador son opcionales y solo se habilitan cuando se indica que se desean donar puntos; al volver a «No» se borran.
- Los importes se calculan con la tabla facilitada de noviembre de 2026: K-8 (4.600 €, IVA 966 €, envío 44 €), SD501 DX (3.740 €, IVA 785,40 €, envío 44 €) y Anespa DX (2.800 €, IVA 588 €, envío 34 €). Al marcar la inscripción en el ROI, el IVA pasa a 0 €. El total es precio más IVA y envío; no incluye la tasa administrativa ni descuenta el pago inicial. Confirma los precios y la aplicación del IVA para cada pedido; no se solicitan datos de tarjeta.
- JR IV no está disponible en el formulario web, aunque sigue apareciendo sin marcar en el PDF original, que no se modifica.
- **Generar PDF** prepara el documento en el dispositivo y permite descargarlo. La aplicación no ofrece envío por correo ni mediante el menú de compartir.
- Una imagen de firma no es una firma digital basada en certificado. Verifica con Enagic si esta modalidad es aceptable y asegúrate de cumplir las obligaciones de privacidad aplicables.
- `vendor/pdf-lib.min.js` es pdf-lib 1.17.1, distribuido bajo la licencia incluida en `vendor/pdf-lib-LICENSE.md`.

## Pruebas opcionales

Las pruebas usan Python, los paquetes `playwright` y `pymupdf` y un navegador Chromium. Tras instalar esos paquetes y el navegador de Playwright (`py -m playwright install chromium`), ejecuta `py -m unittest discover -s tests -v`. También puedes indicar la ruta de Chrome mediante la variable de entorno `CHROME_PATH`.

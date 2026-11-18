"use strict";

const form = document.getElementById("order-form");
const statusMessage = document.getElementById("status");
const downloadOptions = document.getElementById("download-options");
const downloadButton = document.getElementById("download-button");
let generatedFile = null;
let generatedUrl = null;
let revision = 0;

function invalidateOutput() {
  revision++;
  if (!generatedFile) return;
  downloadOptions.hidden = true;
  generatedFile = null;
  if (generatedUrl) URL.revokeObjectURL(generatedUrl);
  generatedUrl = null;
  setStatus("Los datos han cambiado. Vuelve a generar el PDF para actualizarlo.");
}

const prices = {
  k8: { price: 460000, vat: 96600, shipping: 4400 },
  sd501: { price: 374000, vat: 78540, shipping: 4400 },
  anespa: { price: 280000, vat: 58800, shipping: 3400 }
};
let differentShippingAddress = "";

for (const option of form.elements.phonePrefix.options) {
  form.elements.mobilePrefix.add(option.cloneNode(true));
}
form.elements.mobilePrefix.value = "+34";

function syncShippingAddress() {
  const different = form.elements.differentShipping.value === "yes";
  const shipping = form.elements.shippingAddress;
  shipping.disabled = !different;
  shipping.required = different;
  document.getElementById("shipping-required").hidden = !different;
  shipping.value = different ? differentShippingAddress : form.elements.address.value;
  shipping.setCustomValidity(different && !shipping.value.trim() ? "Introduce la dirección de envío." : "");
}

function syncPhoneValidity(phone) {
  const value = phone.value.trim();
  phone.setCustomValidity(value && (!/\d/.test(value) || value.includes("+") || value.startsWith("00"))
    ? "Introduce el teléfono sin el prefijo internacional; selecciónalo en la lista."
    : "");
}

function updatePrices() {
  const product = prices[form.elements.product.value];
  const format = cents => (cents / 100).toFixed(2).replace(".", ",");
  const vat = product && form.elements.intraCommunity.value !== "yes" ? product.vat : 0;
  form.elements.price.value = product ? format(product.price) : "";
  form.elements.vat.value = product ? format(vat) : "";
  form.elements.shipping.value = product ? format(product.shipping) : "";
  form.elements.total.value = product ? format(product.price + vat + product.shipping) : "";
}

function syncInitialPayment() {
  const payment = form.elements.initialPayment;
  payment.disabled = form.elements.fee.value === "none";
  if (payment.disabled) payment.value = "";
}

form.addEventListener("input", event => {
  const name = event.target.name;
  if (name === "shippingAddress" && form.elements.differentShipping.value === "yes") {
    differentShippingAddress = event.target.value;
    event.target.setCustomValidity(event.target.value.trim() ? "" : "Introduce la dirección de envío.");
  }
  if ((name === "address" && form.elements.differentShipping.value === "no") || name === "differentShipping") syncShippingAddress();
  if (name === "phone" || name === "mobile") syncPhoneValidity(event.target);
  if (name === "product" || name === "intraCommunity") updatePrices();
  if (name === "fee") syncInitialPayment();
  invalidateOutput();
});
syncShippingAddress();
syncPhoneValidity(form.elements.phone);
syncPhoneValidity(form.elements.mobile);
updatePrices();
syncInitialPayment();

function cropSignature(canvas) {
  const { data, width, height } = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const opacity = data[offset + 3] / 255;
      if (opacity > 0 && Math.min(data[offset], data[offset + 1], data[offset + 2]) * opacity + 255 * (1 - opacity) < 245) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) throw new Error("La imagen de firma está vacía o no es visible sobre fondo blanco.");
  const cropped = document.createElement("canvas");
  cropped.width = right - left + 1;
  cropped.height = bottom - top + 1;
  cropped.getContext("2d").drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped;
}

function removePhotoBackground(source, width, height) {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const image = document.createElement("canvas");
  image.width = Math.max(1, Math.round(width * scale));
  image.height = Math.max(1, Math.round(height * scale));
  const ctx = image.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, image.width, image.height);
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  const { data } = pixels;
  const w = image.width, h = image.height;
  const stride = w + 1;
  const integral = new Uint32Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const alpha = data[i + 3] / 255;
      const luminance = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * alpha + 255 * (1 - alpha);
      sum += Math.round(luminance);
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
    }
  }
  const radius = Math.max(12, Math.min(80, Math.round(Math.min(w, h) * 0.07)));
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - radius), y2 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius), x2 = Math.min(w, x + radius + 1);
      const average = (integral[y2 * stride + x2] - integral[y1 * stride + x2] - integral[y2 * stride + x1] + integral[y1 * stride + x1]) / ((x2 - x1) * (y2 - y1));
      const i = (y * w + x) * 4;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const opacity = Math.max(0, Math.min(1, (average - luminance - 8) / 20));
      const darken = Math.min(1, 150 / Math.max(1, luminance));
      data[i] *= darken; data[i + 1] *= darken; data[i + 2] *= darken;
      data[i + 3] = Math.min(255, data[i + 3] * opacity * 1.3);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return cropSignature(image);
}

let activeCamera = null;

function createSignatureEditor(id) {
  const root = document.getElementById(id);
  const canvas = root.querySelector("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const input = root.querySelector('input[type="file"]');
  const status = root.querySelector(".signature-status");
  const camera = root.querySelector(".camera");
  const video = camera.querySelector("video");
  let present = false, loading = false, version = 0, stream = null, cameraVersion = 0, drawing = false;
  context.lineWidth = 3;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#182c38";

  function closeCamera() {
    cameraVersion++;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
    camera.hidden = true;
    if (activeCamera === closeCamera) activeCamera = null;
    status.textContent = present ? "Cámara cerrada. Comprueba la vista previa de la firma." : "Cámara cerrada. Aún no has añadido una firma.";
  }

  function reset() {
    version++;
    loading = false;
    present = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    input.value = "";
  }

  function showImage(image) {
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale, height = image.height * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    cropSignature(canvas);
    present = true;
    status.textContent = "Firma procesada. Comprueba que se vea completa y sin fondo antes de continuar.";
  }

  async function processImage(getImage) {
    invalidateOutput();
    reset();
    const current = version;
    loading = true;
    status.textContent = "Procesando imagen…";
    let image;
    try {
      image = await getImage();
      if (current !== version) return;
      const width = image.videoWidth || image.width, height = image.videoHeight || image.height;
      if (!width || !height) throw new Error("La cámara aún no está lista. Espera un momento y vuelve a intentarlo.");
      showImage(removePhotoBackground(image, width, height));
    } catch (error) {
      if (current === version) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        present = false;
        status.textContent = error.message || "No se pudo procesar la imagen.";
      }
    } finally {
      if (image && image.close) image.close();
      if (current === version) loading = false;
    }
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  canvas.addEventListener("pointerdown", event => {
    if (loading) return;
    invalidateOutput();
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(p.x + 0.1, p.y + 0.1);
    context.stroke();
    present = true;
    status.textContent = "Firma dibujada. Puedes borrarla y volver a empezar.";
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, () => { drawing = false; });

  root.querySelector(".signature-clear").addEventListener("click", () => {
    invalidateOutput();
    closeCamera();
    reset();
    status.textContent = "Aún no has añadido una firma.";
  });
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    processImage(async () => {
      if (file.size > 20 * 1024 * 1024) throw new Error("Selecciona una imagen de hasta 20 MB.");
      try { return await createImageBitmap(file); }
      catch { throw new Error("El navegador no puede abrir esta imagen. Prueba con JPG, PNG o WebP."); }
    });
  });
  root.querySelector(".camera-open").addEventListener("click", async () => {
    if (activeCamera) activeCamera();
    const current = ++cameraVersion;
    activeCamera = closeCamera;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      status.textContent = "La cámara requiere HTTPS o localhost y un navegador compatible. También puedes subir una foto.";
      return;
    }
    status.textContent = "Solicitando acceso a la cámara…";
    try {
      const requested = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (current !== cameraVersion) { requested.getTracks().forEach(track => track.stop()); return; }
      stream = requested;
      video.srcObject = stream;
      camera.hidden = false;
      await video.play();
      status.textContent = "Encuadra la firma sobre papel claro y pulsa Tomar foto.";
    } catch (error) {
      if (current !== cameraVersion) return;
      closeCamera();
      status.textContent = "No se pudo abrir la cámara. Comprueba los permisos y que no esté en uso, o sube una foto.";
    }
  });
  root.querySelector(".camera-close").addEventListener("click", closeCamera);
  root.querySelector(".camera-capture").addEventListener("click", () => {
    processImage(async () => {
      if (video.readyState < 2) throw new Error("La cámara aún no está lista. Espera un momento y vuelve a intentarlo.");
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d").drawImage(video, 0, 0);
      closeCamera();
      return frame;
    });
  });
  return {
    get present() { return present; },
    get loading() { return loading; },
    png() { return cropSignature(canvas).toDataURL("image/png"); }
  };
}

const applicantSignature = createSignatureEditor("applicant-signature");
const sponsorSignature = createSignatureEditor("sponsor-signature");
document.addEventListener("visibilitychange", () => { if (document.hidden && activeCamera) activeCamera(); });

function formattedDate(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(-2)}`;
}

function inputDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

async function buildPdf(data) {
  if (!window.PDFLib) throw new Error("No se pudo cargar la biblioteca para generar el PDF.");
  const response = await fetch("srcs/Kangen_Orders.pdf");
  if (!response.ok) throw new Error("No se pudo abrir el formulario original.");
  const { PDFDocument, PDFName, StandardFonts, rgb } = PDFLib;
  const source = await PDFDocument.load(await response.arrayBuffer());
  const pdf = await PDFDocument.create();
  const copiedPages = await pdf.copyPages(source, source.getPageIndices());
  for (const copiedPage of copiedPages) {
    const annotations = copiedPage.node.Annots();
    if (annotations) {
      for (let i = annotations.size() - 1; i >= 0; i--) {
        const annotation = annotations.lookup(i);
        if (annotation.lookup(PDFName.of("Subtype")) === PDFName.of("Widget")) annotations.remove(i);
      }
    }
    pdf.addPage(copiedPage);
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const page = pages[0];
  const height = page.getHeight();
  const value = name => String(data.get(name) || "").trim();

  function text(name, x, top, width, maxSize = 10) {
    const content = value(name);
    if (!content) return;
    let size = maxSize;
    let textWidth;
    try {
      textWidth = font.widthOfTextAtSize(content, size);
    } catch {
      throw new Error(`El campo «${form.elements[name].closest("label").innerText.trim()}» contiene caracteres que el PDF no admite. Utiliza letras y símbolos habituales.`);
    }
    if (textWidth > width) size *= width / textWidth;
    if (size < 7) throw new Error(`El contenido del campo «${form.elements[name].closest("label").innerText.trim()}» es demasiado largo para el PDF. Acórtalo.`);
    page.drawText(content, { x, y: height - top - size, size, font, color: rgb(0.06, 0.16, 0.23) });
  }
  function mark(x, top) {
    page.drawText("X", { x, y: height - top - 10, size: 10, font });
  }
  function imageInBox(target, image, x, top, width, boxHeight, alignLeft = false) {
    const scale = Math.min(width / image.width, boxHeight / image.height);
    const w = image.width * scale, h = image.height * scale;
    target.drawImage(image, { x: alignLeft ? x : x + (width - w) / 2, y: target.getHeight() - top - (boxHeight + h) / 2, width: w, height: h });
  }

  text("name", 24, 94, 195);
  text("company", 229, 94, 325);
  text("address", 24, 120, 530);
  text("zip", 24, 147, 117);
  text("city", 159, 147, 269);
  text("country", 448, 147, 107);
  text("shippingAddress", 24, 175, 530);
  text("phone", 24, 214, 289);
  text("mobile", 334, 214, 220);
  text("email", 24, 242, 307);
  text("vatNumber", 349, 242, 205);
  text("price", 285, 287, 79, 9);
  text("vat", 285, 300, 79, 9);
  text("shipping", 285, 313, 79, 9);
  text("total", 285, 353, 79, 9);
  text("initialPayment", 465, 355, 74, 9);
  text("sponsorName", 119, 540, 155, 9);
  text("sponsorId", 119, 557, 154, 9);
  text("recruiterName", 378, 540, 188, 9);
  text("recruiterId", 378, 557, 188, 9);
  text("sponsorLine", 182, 574, 23, 9);
  text("sponsorEmail", 363, 574, 202, 9);

  for (const top of [285.8, 299.6, 312.8, 324.8]) {
    page.drawCircle({ x: 32.8, y: height - top - 5.7, size: 5.4, borderColor: rgb(0, 0, 0), borderWidth: 0.8 });
  }
  const positions = {
    registration: { user: [111, 78], distributor: [185, 78] },
    product: { k8: [28, 286], sd501: [28, 299], anespa: [28, 325] },
    payment: { transfer: [199, 401], visa: [293, 401], mc: [339, 401], amex: [374, 401] },
    fee: { "30": [402, 327], "60": [439, 327], "100": [472, 327], "160": [502, 327], "240": [533, 327] }
  };
  for (const [key, choices] of Object.entries(positions)) {
    const pos = choices[value(key)];
    if (pos) mark(...pos);
  }
  const date = formattedDate(new Date());
  page.drawText(date, { x: 337, y: height - 507 - 9, size: 9, font });
  const signature = await pdf.embedPng(applicantSignature.png());
  imageInBox(page, signature, 109, 490.5, 180, 42, true);
  const page2 = pages[1];
  imageInBox(page2, signature, 36, 735, 180, 42);
  page2.drawText(`Firma del solicitante · ${date}`, { x: 36, y: page2.getHeight() - 790, size: 9, font });

  if (sponsorSignature.present) {
    const sponsorImage = await pdf.embedPng(sponsorSignature.png());
    imageInBox(page, sponsorImage, 110, 591.5, 180, 42, true);
  }
  if (value("sponsorDate")) page.drawText(inputDate(value("sponsorDate")), { x: 403, y: height - 607 - 9, size: 9, font });
  return pdf.save();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (applicantSignature.loading || sponsorSignature.loading) { setStatus("Espera a que termine de procesarse la firma.", true); return; }
  if (!applicantSignature.present) { setStatus("Dibuja o sube la firma del solicitante antes de continuar.", true); return; }
  const data = new FormData(form);
  data.set("shippingAddress", form.elements.shippingAddress.value);
  data.set("phone", `${data.get("phonePrefix")} ${String(data.get("phone")).trim()}`);
  const mobile = String(data.get("mobile")).trim();
  data.set("mobile", mobile ? `${data.get("mobilePrefix")} ${mobile}` : "");
  const startingRevision = revision;
  const sponsorHasSignature = sponsorSignature.present;
  if (sponsorHasSignature !== Boolean(data.get("sponsorDate"))) {
    setStatus("Indica tanto la firma como la fecha del patrocinador, o deja ambos campos vacíos.", true);
    return;
  }
  const button = document.getElementById("submit-button");
  button.disabled = true;
  downloadOptions.hidden = true;
  setStatus("Preparando el documento…");
  try {
    const bytes = await buildPdf(data);
    if (revision !== startingRevision) throw new Error("Los datos han cambiado durante la generación. Vuelve a generar el PDF.");
    if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    generatedFile = new File([bytes], "Pedido-Enagic.pdf", { type: "application/pdf" });
    generatedUrl = URL.createObjectURL(generatedFile);
    downloadButton.onclick = () => {
      const link = document.createElement("a");
      link.href = generatedUrl;
      link.download = generatedFile.name;
      link.click();
    };
    downloadOptions.hidden = false;
    setStatus("PDF preparado. Ya puedes descargarlo.");
  } catch (error) {
    console.error("Error al generar el PDF:", error);
    setStatus(error.message || "No se pudo generar el PDF. Vuelve a intentarlo.", true);
  } finally {
    button.disabled = false;
  }
});

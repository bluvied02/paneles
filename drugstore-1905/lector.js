'use strict'
// EL LECTOR DE CODIGOS CON LA CAMARA
//
// Sin sacar foto: la camara queda abierta y el codigo se lee solo, en cuanto
// entra en el recuadro. Vibra, suena y muestra el codigo leido.
//
// Dos motores, el que haya:
//   - El lector que trae el navegador (BarcodeDetector: Chrome en Android).
//   - ZXing (se baja la primera vez que se usa): Safari en iPhone, que no trae
//     lector propio. Se le pasa solo la franja del medio de la imagen (donde
//     esta el recuadro), achicada: es mucho mas rapido que la imagen entera y
//     en el iPhone es lo que hace que lea.
// Formatos: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, ITF y Codabar.
//
// En los iPhone nuevos la camara no enfoca de cerca: se pone zoom (si el
// celular lo deja) para leer con el celular a 20 cm. Si igual no lee, el boton
// "Foto" usa la camara del iPhone (que enfoca sola) y lee el codigo de la foto.
// Y siempre se puede escribir el codigo a mano.

const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar']
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
let zxingCargando = null

function cargarZXing () {
  if (window.ZXing) return Promise.resolve(window.ZXing)
  if (!zxingCargando) {
    zxingCargando = new Promise((ok, mal) => {
      const s = document.createElement('script')
      s.src = ZXING_URL
      s.onload = () => ok(window.ZXing)
      s.onerror = () => { zxingCargando = null; mal(new Error('No se pudo cargar el lector (¿sin internet?).')) }
      document.head.append(s)
    })
  }
  return zxingCargando
}

// Un lector de ZXing listo para usar, con los formatos de los productos.
async function lectorZXing () {
  const ZX = await cargarZXing()
  const F = ZX.BarcodeFormat
  const hints = new Map()
  hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.CODABAR])
  hints.set(ZX.DecodeHintType.TRY_HARDER, true)
  const lector = new ZX.MultiFormatReader()
  lector.setHints(hints)
  // Lee un lienzo; null si no hay codigo.
  return (lienzo) => {
    try {
      const r = lector.decodeWithState(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.HTMLCanvasElementLuminanceSource(lienzo))))
      return r ? r.getText() : null
    } catch (e) { return null }
  }
}

// Copia un pedazo de la imagen (x, y, ancho, alto) a un lienzo, achicado.
function recortar (lienzo, fuente, x, y, w, h, maximo) {
  const escala = Math.min(1, maximo / Math.max(w, h))
  lienzo.width = Math.max(1, Math.round(w * escala))
  lienzo.height = Math.max(1, Math.round(h * escala))
  lienzo.getContext('2d', { willReadFrequently: true }).drawImage(fuente, x, y, w, h, 0, 0, lienzo.width, lienzo.height)
  return lienzo
}

// Un "bip" cortito al leer. El audio se prepara en el toque que abre la camara
// (en el iPhone no puede sonar nada que no empiece con un toque).
function prepararPitido () {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx && !S.audio) S.audio = new Ctx()
    if (S.audio && S.audio.state === 'suspended') S.audio.resume()
  } catch (e) { /* sin sonido */ }
}
function pitido () {
  try {
    const a = S.audio
    if (!a) return
    const o = a.createOscillator()
    const g = a.createGain()
    o.frequency.value = 1650
    g.gain.value = 0.07
    o.connect(g)
    g.connect(a.destination)
    o.start()
    o.stop(a.currentTime + 0.07)
  } catch (e) { /* sin sonido */ }
}

// Lee el codigo de una foto (el boton "Foto": la camara del iPhone enfoca sola).
async function leerFoto (archivo) {
  const leer = await lectorZXing()
  const img = await new Promise((ok, mal) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => mal(new Error('No se pudo abrir la foto'))
    i.src = URL.createObjectURL(archivo)
  })
  const w = img.naturalWidth
  const h = img.naturalHeight
  const lienzo = document.createElement('canvas')
  // Entera, y si no, la franja del medio (a lo ancho y a lo alto).
  const intentos = [[0, 0, w, h, 1600], [0, h * 0.3, w, h * 0.4, 1600], [w * 0.3, 0, w * 0.4, h, 1600], [0, 0, w, h, 900]]
  for (const [x, y, cw, ch, max] of intentos) {
    const t = leer(recortar(lienzo, img, x, y, cw, ch, max))
    if (t) { URL.revokeObjectURL(img.src); return t }
  }
  URL.revokeObjectURL(img.src)
  return null
}

// Abre la camara y devuelve el codigo leido, o null si se cierra.
// Con opciones.alLeer(codigo) queda abierta leyendo uno tras otro (contar,
// recibir): cada codigo se pasa a alLeer, que devuelve el texto a mostrar.
async function leerCodigo (opciones = {}) {
  prepararPitido()
  await esperarAtras()
  return new Promise((resolver) => {
    let terminado = false
    let stream = null
    let reloj = null
    const continuo = typeof opciones.alLeer === 'function'
    // Cada vuelta de lectura lleva su numero: al pausar se corta la que corria.
    let ciclo = 0
    let seguir = null
    let ultimo = { c: '', t: 0 }
    const video = document.createElement('video')
    video.muted = true
    video.autoplay = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('muted', '')
    const marco = el('div', { clase: 'marco' })
    const texto = el('div', { clase: 'texto-lector' }, opciones.texto || 'Apuntá al código de barras')
    const manual = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'O escribí el código', enterkeyhint: 'search', autocomplete: 'off' })
    const linterna = el('button', { 'aria-label': 'Linterna', estilo: { visibility: 'hidden' } }, icono('linterna'))
    const botonZoom = el('button', { clase: 'btn chico', estilo: { display: 'none', background: 'rgba(0,0,0,.45)', color: '#fff', border: 0 } })
    const foto = el('input', { type: 'file', accept: 'image/*', capture: 'environment', estilo: { display: 'none' } })

    const terminar = (codigo, porAtras) => {
      if (terminado) return
      terminado = true
      clearTimeout(reloj)
      if (stream) stream.getTracks().forEach((t) => t.stop())
      caja.remove()
      S.cerrarLector = null
      if (!porAtras) { S.ignorarPop++; history.back() }
      resolver(codigo || null)
    }
    const leido = (codigo, aMano) => {
      if (terminado) return
      const c = String(codigo || '').trim()
      if (!c) return
      if (continuo) {
        ciclo++
        clearTimeout(reloj)
        const ahora = Date.now()
        // El mismo codigo que recien se leyo (sigue adelante de la camara): no suma de nuevo.
        if (!aMano && c === ultimo.c && ahora - ultimo.t < 1600) { setTimeout(() => { if (seguir && !terminado) seguir() }, 250); return }
        ultimo = { c, t: ahora }
        vibrar(70)
        pitido()
        marco.classList.add('ok')
        manual.value = ''
        Promise.resolve().then(() => opciones.alLeer(c)).catch((err) => err.message || 'No se pudo').then((msg) => {
          if (terminado) return
          poner(texto, el('span', { clase: 'codigo-leido' }, msg || c))
          setTimeout(() => { marco.classList.remove('ok'); if (seguir && !terminado) seguir() }, 650)
        })
        return
      }
      vibrar(70)
      pitido()
      marco.classList.add('ok')
      poner(texto, el('span', { clase: 'codigo-leido' }, c))
      setTimeout(() => terminar(c), 260)
    }
    const buscarManual = () => { if (manual.value.trim()) leido(manual.value.trim(), true) }
    manual.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscarManual() } })
    foto.addEventListener('change', async () => {
      const archivo = foto.files && foto.files[0]
      foto.value = ''
      if (!archivo) return
      poner(texto, 'Buscando el código en la foto…')
      try {
        const c = await leerFoto(archivo)
        if (c) leido(c)
        else poner(texto, 'No encontré un código en la foto. Probá de nuevo con el código derecho y ocupando buena parte de la foto, o escribilo abajo.')
      } catch (err) { poner(texto, err.message || 'No se pudo leer la foto.') }
    })

    const caja = el('div', { clase: 'lector', role: 'dialog', 'aria-label': 'Lector de códigos' },
      video, marco,
      el('div', { clase: 'arriba-lector' },
        el('button', { 'aria-label': 'Cerrar', onclick: () => terminar(null) }, icono('cerrar')),
        el('b', {}, opciones.titulo || 'Escanear'),
        el('div', { estilo: { display: 'flex', gap: '8px', alignItems: 'center' } }, botonZoom, linterna)),
      texto,
      el('div', { clase: 'abajo-lector' },
        el('div', { estilo: { display: 'flex', gap: '8px' } }, manual, el('button', { clase: 'btn primario', onclick: buscarManual }, continuo ? 'Sumar' : 'Buscar')),
        continuo ? el('button', { clase: 'btn primario grande', onclick: () => terminar(null) }, icono('ok'), opciones.textoListo || 'Listo') : null,
        el('button', { clase: 'btn', estilo: { background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }, onclick: () => foto.click() }, icono('escanear'), 'No lee: sacar una foto del código'),
        foto))
    document.body.append(caja)
    history.pushState({ lector: true }, '', location.hash)
    S.cerrarLector = () => terminar(null, true)

    ;(async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        poner(texto, 'Este navegador no deja usar la cámara en vivo. Tocá "sacar una foto del código" o escribilo abajo.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      } catch (err) {
        poner(texto, err && err.name === 'NotAllowedError'
          ? 'No hay permiso para la cámara. En el iPhone: Ajustes → Safari → Cámara → Permitir (o Preguntar). Mientras, usá "sacar una foto del código".'
          : 'No se pudo abrir la cámara en vivo. Usá "sacar una foto del código" o escribilo abajo.')
        return
      }
      if (terminado) { stream.getTracks().forEach((t) => t.stop()); return }
      video.srcObject = stream
      try { await video.play() } catch (e) { /* ya arranca solo */ }

      // Enfoque continuo, zoom para leer de un poco mas lejos, y la linterna.
      const pista = stream.getVideoTracks()[0]
      let cap = {}
      try { cap = pista && pista.getCapabilities ? pista.getCapabilities() : {} } catch (e) { cap = {} }
      try {
        if (Array.isArray(cap.focusMode) && cap.focusMode.includes('continuous')) await pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
      } catch (e) { /* sin enfoque */ }
      if (cap.zoom && cap.zoom.max >= 1.5) {
        let zoom = Math.min(2, cap.zoom.max)
        const poner2 = async () => { try { await pista.applyConstraints({ advanced: [{ zoom }] }) } catch (e) {} botonZoom.textContent = (Math.round(zoom * 10) / 10).toString().replace('.', ',') + 'x' }
        botonZoom.style.display = ''
        botonZoom.onclick = () => { zoom = zoom > 1.2 ? Math.max(cap.zoom.min || 1, 1) : Math.min(2, cap.zoom.max); poner2() }
        poner2()
      }
      if (cap.torch) {
        let prendida = false
        linterna.style.visibility = 'visible'
        linterna.onclick = async () => { prendida = !prendida; try { await pista.applyConstraints({ advanced: [{ torch: prendida }] }) } catch (e) {} }
      }
      poner(texto, opciones.texto || 'Apuntá al código de barras (a unos 20 cm)')

      // 1. El lector del navegador (Android).
      let detector = null
      if ('BarcodeDetector' in window) {
        try {
          const soportados = await window.BarcodeDetector.getSupportedFormats()
          const formats = FORMATOS_NATIVOS.filter((f) => soportados.includes(f))
          if (formats.length) detector = new window.BarcodeDetector({ formats })
        } catch (e) { detector = null }
      }
      if (detector) {
        const mirar = async (g) => {
          if (terminado || g !== ciclo) return
          try {
            if (video.readyState >= 2) {
              const encontrados = await detector.detect(video)
              if (g !== ciclo) return
              const c = encontrados.find((x) => x.rawValue)
              if (c) return leido(c.rawValue)
            }
          } catch (e) { /* cuadro sin codigo */ }
          reloj = setTimeout(() => mirar(g), 110)
        }
        seguir = () => mirar(++ciclo)
        seguir()
        return
      }

      // 2. ZXing (iPhone): la franja del medio, achicada; cada tanto la imagen entera.
      let leer
      try { leer = await lectorZXing() } catch (err) { poner(texto, (err.message || 'No se pudo usar el lector.') + ' Usá "sacar una foto del código".'); return }
      const lienzo = document.createElement('canvas')
      let vuelta = 0
      const probar = (g) => {
        if (terminado || g !== ciclo) return
        const w = video.videoWidth
        const h = video.videoHeight
        if (w && h && video.readyState >= 2) {
          vuelta++
          let c = null
          if (vuelta % 5 === 0) c = leer(recortar(lienzo, video, 0, 0, w, h, 1000))
          else {
            // La franja horizontal del medio (donde esta el recuadro).
            const bw = w * 0.9
            const bh = h * (w < h ? 0.3 : 0.45)
            c = leer(recortar(lienzo, video, (w - bw) / 2, (h - bh) / 2 - h * 0.04, bw, bh, 900))
          }
          if (c) return leido(c)
        }
        reloj = setTimeout(() => probar(g), 70)
      }
      seguir = () => probar(++ciclo)
      seguir()
    })()
  })
}

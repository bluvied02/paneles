// PROMOCIONES
//
// El calculo vive aca, compartido entre la pantalla y el proceso principal:
// el descuento que ve el cliente en pantalla es exactamente el que se guarda
// y el que sale en el ticket. Dos formas de calcular una promo son dos
// totales distintos y una venta que no cierra.
//
// Cuatro tipos, los de Gestion Comercio:
//   porcentaje — 10% en todo un rubro (el de los fines de semana en bebidas)
//   descuento  — $100 menos por unidad
//   precio     — precio fijo por unidad: alfajores a $1.000
//   nxm        — lleva 3, paga 2
//   llevando   — llevando unas Doritos, la Coca o Pepsi de medio litro sale
//                20% menos (una unidad con descuento por cada Doritos)
//
// Una linea recibe una sola promo: la que mas le descuenta al cliente. Las
// promos no se suman entre si. El descuento a mano (F4) va despues, sobre lo
// que queda.

const TIPOS_PROMO = {
  porcentaje: 'Porcentaje',
  descuento: 'Pesos de descuento por unidad',
  precio: 'Precio fijo por unidad',
  nxm: 'Lleva N, paga M',
  llevando: 'Llevando uno, descuento en otro',
  combo: 'Combo'
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

const ESCALA_CANT = 1000 // las cantidades van en milesimas, como en cantidad.js

function dosCifras (n) { return String(n).padStart(2, '0') }

function fechaLocal (d) {
  return d.getFullYear() + '-' + dosCifras(d.getMonth() + 1) + '-' + dosCifras(d.getDate())
}

function minutosDe (hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  return h <= 23 && mi <= 59 ? h * 60 + mi : null
}

// Esta vigente en este momento? Fechas y dias segun el calendario (un sabado es
// sabado desde las 00:00), y el horario puede cruzar la medianoche (22:00 a 06:00).
function vigente (promo, ahora) {
  if (!promo || promo.activa === false || promo.borrada) return false
  const d = ahora instanceof Date ? ahora : new Date(ahora || Date.now())
  const hoy = fechaLocal(d)
  if (promo.desde && hoy < promo.desde) return false
  if (promo.hasta && hoy > promo.hasta) return false
  if (Array.isArray(promo.dias) && promo.dias.length && !promo.dias.includes(d.getDay())) return false
  const desde = minutosDe(promo.horaDesde)
  const hasta = minutosDe(promo.horaHasta)
  if (desde != null && hasta != null && desde !== hasta) {
    const ya = d.getHours() * 60 + d.getMinutes()
    const dentro = desde < hasta ? ya >= desde && ya < hasta : ya >= desde || ya < hasta
    if (!dentro) return false
  }
  return true
}

// La promo alcanza a este producto? `rubrosExpandidos` trae el rubro elegido y
// todos sus subrubros: elegir "Bebidas" incluye "Bebidas › Cervezas".
function alcanza (promo, item) {
  if (!item || !item.productoId || item.precioManual) return false
  if (promo.alcance === 'todo') return true
  if (promo.alcance === 'productos') return (promo.productoIds || []).includes(item.productoId)
  const rubros = promo.rubrosExpandidos || promo.rubroIds || []
  return !!item.rubroId && rubros.includes(item.rubroId)
}

// Lo que hay que llevar para que valga una promo "llevando" (las Doritos).
function alcanzaDisparador (promo, item) {
  if (!item || !item.productoId || item.precioManual) return false
  const d = promo.disparador || {}
  if ((d.productoIds || []).includes(item.productoId)) return true
  const rubros = d.rubrosExpandidos || d.rubroIds || []
  return !!item.rubroId && rubros.includes(item.rubroId)
}

function redondear (n) { return Math.round(n) }

// El texto corto de la promo, para la linea de la venta y el ticket.
function etiqueta (promo, formatoPesos) {
  const pesos = formatoPesos || ((c) => '$' + (c / 100))
  if (promo.tipo === 'porcentaje') return String(promo.valor / 100).replace('.', ',') + '% OFF'
  if (promo.tipo === 'descuento') return pesos(promo.valor) + ' menos c/u'
  if (promo.tipo === 'precio') return 'a ' + pesos(promo.valor) + ' c/u'
  if (promo.tipo === 'nxm') return promo.lleva + 'x' + promo.paga
  if (promo.tipo === 'llevando') return String(promo.valor / 100).replace('.', ',') + '% OFF llevando ' + (promo.nombreDisparador || 'el otro')
  if (promo.tipo === 'combo') return 'Combo ' + pesos(promo.precio)
  return ''
}

// Descuento de UNA promo en cada linea (sin decidir todavia cual gana).
function descuentosDe (promo, items) {
  const res = items.map(() => 0)
  if (promo.tipo === 'llevando') return descuentosLlevando(promo, items, res)
  const idx = []
  items.forEach((it, i) => { if (alcanza(promo, it)) idx.push(i) })
  if (!idx.length) return res

  if (promo.tipo === 'porcentaje') {
    for (const i of idx) res[i] = redondear(bruto(items[i]) * promo.valor / 10000)
  } else if (promo.tipo === 'descuento') {
    for (const i of idx) res[i] = Math.min(bruto(items[i]), redondear(promo.valor * items[i].cantidad / ESCALA_CANT))
  } else if (promo.tipo === 'precio') {
    for (const i of idx) res[i] = Math.max(0, bruto(items[i]) - redondear(promo.valor * items[i].cantidad / ESCALA_CANT))
  } else if (promo.tipo === 'nxm') {
    const lleva = Number(promo.lleva)
    const paga = Number(promo.paga)
    if (!(lleva > paga && paga >= 1)) return res
    // Grupos: cada producto por separado (3 alfajores iguales), o todo junto si
    // la promo deja mezclar (2 alfajores de uno y 1 de otro tambien es 3x2).
    const grupos = {}
    for (const i of idx) {
      const clave = promo.mezclar ? 'todo' : items[i].productoId
      if (!grupos[clave]) grupos[clave] = []
      grupos[clave].push(i)
    }
    for (const lineas of Object.values(grupos)) {
      // Cada unidad entera con su precio. Las que salen gratis son las mas
      // baratas: es lo que hace cualquier kiosco y lo que no se discute.
      const unidades = []
      for (const i of lineas) {
        const enteras = Math.min(999, Math.floor(items[i].cantidad / ESCALA_CANT))
        for (let k = 0; k < enteras; k++) unidades.push({ i, precio: Number(items[i].precioUnit) || 0 })
      }
      const gratis = Math.floor(unidades.length / lleva) * (lleva - paga)
      unidades.sort((a, b) => a.precio - b.precio)
      for (let k = 0; k < gratis; k++) res[unidades[k].i] += unidades[k].precio
    }
  }
  return res
}

// Cada unidad de lo que hay que llevar habilita UNA unidad con descuento. La
// unidad que lleva el descuento no cuenta como la que hay que llevar (dos
// Doritos no se descuentan entre si si las dos cosas son lo mismo), y el
// descuento va a lo mas barato, como en el 3x2.
function descuentosLlevando (promo, items, res) {
  const pct = Number(promo.valor) || 0
  if (pct <= 0) return res
  const unidades = []
  items.forEach((it, i) => {
    const d = alcanzaDisparador(promo, it)
    const b = alcanza(promo, it)
    if (!d && !b) return
    const enteras = Math.min(999, Math.floor((Number(it.cantidad) || 0) / ESCALA_CANT))
    for (let k = 0; k < enteras; k++) unidades.push({ i, precio: Number(it.precioUnit) || 0, d, b })
  })
  const usadas = new Set()
  const conDescuento = unidades.filter((u) => u.b).sort((a, b) => a.precio - b.precio)
  const quePide = unidades.filter((u) => u.d)
  for (const u of conDescuento) {
    if (usadas.has(u)) continue
    // Primero las que solo sirven para habilitar: asi no se gasta una unidad
    // que podria llevar el descuento.
    const habilita = quePide.find((x) => x !== u && !usadas.has(x) && !x.b) || quePide.find((x) => x !== u && !usadas.has(x))
    if (!habilita) break
    usadas.add(habilita)
    usadas.add(u)
    res[u.i] += redondear(u.precio * pct / 10000)
  }
  return res
}

function bruto (it) {
  return redondear((Number(it.cantidad) || 0) * (Number(it.precioUnit) || 0) / ESCALA_CANT)
}

// --- combos ------------------------------------------------------------------
//
// Un combo tiene "lugares" (componentes), y cada lugar acepta cualquiera de
// varios productos: "1 Smirnoff (cualquiera de los 5) + 2 Monster (cualquiera
// de los 8, mezclados)". Dos combos cargados en vez de 200 combinaciones.
//
// Se arma solo en la venta: si en el carrito estan las unidades para llenar
// todos los lugares, esas unidades pasan a costar el precio del combo. Se arma
// tantas veces como alcance (2 Smirnoff y 4 Monster = 2 combos), y solo si
// juntos salen menos que separados.

function alcanzaComponente (comp, item) {
  if (!item || !item.productoId || item.precioManual) return false
  if ((comp.productoIds || []).includes(item.productoId)) return true
  const rubros = comp.rubrosExpandidos || comp.rubroIds || []
  return !!item.rubroId && rubros.includes(item.rubroId)
}

function armarCombos (items, combos) {
  const usadas = items.map(() => 0) // unidades de cada linea ya metidas en un combo
  const descuentos = items.map(() => 0)
  const nombres = items.map(() => [])
  const armados = []

  for (const combo of combos) {
    const comps = (combo.componentes || []).filter((c) => Number(c.cantidad) > 0)
    const precio = Number(combo.precio) || 0
    if (!comps.length || precio <= 0) continue
    let veces = 0
    let separado = 0
    const lineasDelCombo = new Set()

    while (veces < 200) {
      // Se prueba llenar cada lugar con las unidades libres. Primero las mas
      // caras: el cliente que lleva el sabor mas caro es el que mas ahorra.
      const prueba = usadas.slice()
      const tomadas = []
      let completo = true
      for (const comp of comps) {
        let falta = Math.round(Number(comp.cantidad))
        const candidatas = items
          .map((it, i) => i)
          .filter((i) => alcanzaComponente(comp, items[i]))
          .sort((a, b) => (Number(items[b].precioUnit) || 0) - (Number(items[a].precioUnit) || 0))
        for (const i of candidatas) {
          const libres = Math.floor((Number(items[i].cantidad) || 0) / ESCALA_CANT) - prueba[i]
          const toma = Math.max(0, Math.min(libres, falta))
          for (let k = 0; k < toma; k++) tomadas.push({ i, precio: Number(items[i].precioUnit) || 0 })
          prueba[i] += toma
          falta -= toma
          if (!falta) break
        }
        if (falta > 0) { completo = false; break }
      }
      if (!completo) break
      const suma = tomadas.reduce((s, u) => s + u.precio, 0)
      if (suma <= precio) break // juntos no salen menos: no es combo

      // El ahorro se reparte entre las unidades segun su precio.
      const ahorro = suma - precio
      let resto = ahorro
      tomadas.forEach((u, k) => {
        // En pesos enteros: una linea de $ 2.301,37 en el mostrador confunde. Los
        // centavos que sobran van a la ultima unidad.
        const parte = k === tomadas.length - 1 ? resto : Math.floor(ahorro * u.precio / suma / 100) * 100
        descuentos[u.i] += parte
        resto -= parte
        lineasDelCombo.add(u.i)
      })
      for (let i = 0; i < usadas.length; i++) usadas[i] = prueba[i]
      veces++
      separado += suma
    }

    if (veces) {
      for (const i of lineasDelCombo) nombres[i].push(combo.nombre)
      armados.push({
        comboId: combo.id,
        nombre: combo.nombre,
        veces,
        precioSeparado: separado,
        precioCombo: precio * veces,
        ahorro: separado - precio * veces,
        lineas: [...lineasDelCombo].sort((a, b) => a - b)
      })
    }
  }
  return { usadas, descuentos, nombres, armados }
}

// Para cada linea: que promo le toca y cuanto descuenta, y los combos que se
// armaron. Items con { productoId, rubroId, cantidad (milesimas),
// precioUnit (centavos), precioManual }.
//
// Primero los combos; lo que no entro en ningun combo sigue con las promos
// comunes (una por linea, la que mas descuenta).
function calcularVenta (items, promos, ahora, formatoPesos) {
  const lista = (items || [])
  const resultado = lista.map(() => ({ promoId: null, promoNombre: '', promoDetalle: '', descuentoPromo: 0, descuentoCombo: 0 }))
  const vigentes = (promos || [])
    .filter((p) => vigente(p, ahora))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const combos = armarCombos(lista, vigentes.filter((p) => p.tipo === 'combo'))

  // Las promos comunes ven solo las unidades que quedaron fuera de los combos.
  const restantes = lista.map((it, i) => Object.assign({}, it, {
    cantidad: Math.max(0, (Number(it.cantidad) || 0) - combos.usadas[i] * ESCALA_CANT)
  }))
  const comunes = lista.map(() => ({ promoId: null, promoNombre: '', promoDetalle: '', descuento: 0 }))
  for (const promo of vigentes.filter((p) => p.tipo !== 'combo')) {
    const desc = descuentosDe(promo, restantes)
    desc.forEach((d, i) => {
      const tope = Math.min(d, bruto(restantes[i]))
      if (tope > comunes[i].descuento) {
        comunes[i] = { promoId: promo.id, promoNombre: promo.nombre, promoDetalle: etiqueta(promo, formatoPesos), descuento: tope }
      }
    })
  }

  lista.forEach((it, i) => {
    const dCombo = Math.min(combos.descuentos[i], bruto(it))
    const dComun = Math.min(comunes[i].descuento, bruto(it) - dCombo)
    const nombresCombo = combos.nombres[i]
    const partesNombre = nombresCombo.concat(dComun ? [comunes[i].promoNombre] : [])
    const partesDetalle = (nombresCombo.length ? ['Combo'] : []).concat(dComun ? [comunes[i].promoDetalle] : [])
    resultado[i] = {
      promoId: dComun ? comunes[i].promoId : (nombresCombo.length ? 'combo' : null),
      promoNombre: partesNombre.join(' + '),
      promoDetalle: partesDetalle.join(' + '),
      descuentoPromo: dCombo + dComun,
      descuentoCombo: dCombo
    }
  })
  return { lineas: resultado, combos: combos.armados }
}

function calcular (items, promos, ahora, formatoPesos) {
  return calcularVenta(items, promos, ahora, formatoPesos).lineas
}

function textoComponentes (combo) {
  return (combo.componentes || []).map((c) => c.cantidad + ' ' + (c.nombre || 'producto')).join(' + ')
}

// Una linea con todo resuelto: promo primero, descuento a mano sobre el resto.
function importeLinea (it, promo) {
  const b = bruto(it)
  const dPromo = promo ? promo.descuentoPromo : 0
  const dManual = redondear((b - dPromo) * (Number(it.descuentoBasis) || 0) / 10000)
  return { bruto: b, descuentoPromo: dPromo, descuentoManual: dManual, descuento: dPromo + dManual, importe: b - dPromo - dManual }
}

// La frase de cuando vale, para la lista de promociones.
function textoVigencia (promo) {
  const partes = []
  const dias = Array.isArray(promo.dias) ? promo.dias.slice().sort() : []
  if (dias.length && dias.length < 7) {
    const finde = dias.length === 2 && dias[0] === 0 && dias[1] === 6
    partes.push(finde ? 'Sabados y domingos' : dias.map((d) => DIAS_CORTOS[d]).join(', '))
  } else {
    partes.push('Todos los dias')
  }
  if (minutosDe(promo.horaDesde) != null && minutosDe(promo.horaHasta) != null && promo.horaDesde !== promo.horaHasta) {
    partes.push('de ' + promo.horaDesde + ' a ' + promo.horaHasta)
  }
  const f = (s) => s ? s.slice(8, 10) + '/' + s.slice(5, 7) : ''
  if (promo.desde && promo.hasta) partes.push('del ' + f(promo.desde) + ' al ' + f(promo.hasta))
  else if (promo.desde) partes.push('desde el ' + f(promo.desde))
  else if (promo.hasta) partes.push('hasta el ' + f(promo.hasta))
  return partes.join(' · ')
}

const Promociones = { TIPOS_PROMO, DIAS_CORTOS, vigente, alcanza, alcanzaDisparador, etiqueta, calcular, calcularVenta, textoComponentes, importeLinea, textoVigencia, minutosDe, fechaLocal }
if (typeof module !== 'undefined' && module.exports) module.exports = Promociones
if (typeof window !== 'undefined') window.Promociones = Promociones

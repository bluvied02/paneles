'use strict'
// METRICAS (el Dashboard nuevo)
//
// Uno solo para la compu y el celular. Trabaja con el RESUMEN DE CADA DIA de
// cada sucursal (lo arma la caja y lo sube a la nube), nunca con las ventas
// una por una: asi "este mes" o un rango de varios meses carga rapido.
//
// Un dia (version 1):
//   { s: sucursal, d: 'AAAA-MM-DD' (dia comercial: de la apertura al cierre,
//     con la hora de corte de Configuracion), t: total vendido, n: ventas,
//     u: unidades, c: costo de lo vendido, sc: lineas sin costo, com: comisiones,
//     h: { hora: [total, ventas, costo] }, m: { medio: [importe, ventas, comision] },
//     may: [total, ventas, costo] (lo mayorista, que tambien esta en t),
//     p: [[clave, descripcion, familia, unidades, importe, costo, sinCosto]] }
// Importes en centavos, unidades en milesimas.
;(function (raiz) {
  const NOMBRE_MEDIO = { efectivo: 'Efectivo', mercado_pago: 'Mercado Pago', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia', qr: 'QR', cuenta_corriente: 'Cuenta corriente' }

  function sumarDias (dia, n) {
    const [a, m, d] = dia.split('-').map(Number)
    const f = new Date(a, m - 1, d + n)
    return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0')
  }
  function diasEntre (desde, hasta) {
    const [a1, m1, d1] = desde.split('-').map(Number)
    const [a2, m2, d2] = hasta.split('-').map(Number)
    return Math.round((new Date(a2, m2 - 1, d2) - new Date(a1, m1 - 1, d1)) / 86400000) + 1
  }
  const diaSemana = (dia) => { const [a, m, d] = dia.split('-').map(Number); return (new Date(a, m - 1, d).getDay() + 6) % 7 }

  // El periodo elegido y el anterior para comparar (de la misma largura).
  function periodo (clave, hoy, desde, hasta) {
    let p
    if (clave === 'ayer') { const a = sumarDias(hoy, -1); p = { desde: a, hasta: a, nombre: 'Ayer', contra: 'anteayer' } } else if (clave === 'semana') {
      const lunes = sumarDias(hoy, -diaSemana(hoy))
      p = { desde: lunes, hasta: hoy, nombre: 'Esta semana', contra: 'los mismos días de la semana pasada' }
      p.anterior = { desde: sumarDias(lunes, -7), hasta: sumarDias(hoy, -7) }
    } else if (clave === 'mes') {
      const primero = hoy.slice(0, 8) + '01'
      const antes = sumarDias(primero, -1)
      const diaN = Number(hoy.slice(8, 10))
      const finAnt = Math.min(diaN, Number(antes.slice(8, 10)))
      p = { desde: primero, hasta: hoy, nombre: 'Este mes', contra: 'los mismos días del mes pasado' }
      p.anterior = { desde: antes.slice(0, 8) + '01', hasta: antes.slice(0, 8) + String(finAnt).padStart(2, '0') }
    } else if (clave === 'rango' && desde && hasta) {
      const d = desde <= hasta ? desde : hasta
      const h = desde <= hasta ? hasta : desde
      const corta = (x) => x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4)
      p = { desde: d, hasta: h, nombre: d === h ? 'El ' + corta(d) : 'Del ' + corta(d) + ' al ' + corta(h), contra: d === h ? 'el día anterior' : 'el período anterior' }
    } else p = { desde: hoy, hasta: hoy, nombre: 'Hoy', contra: 'ayer' }
    if (!p.anterior) {
      const largo = diasEntre(p.desde, p.hasta)
      p.anterior = { desde: sumarDias(p.desde, -largo), hasta: sumarDias(p.desde, -1) }
    }
    p.clave = clave
    return p
  }

  // Todo lo del periodo, de las sucursales elegidas (null = todas).
  function calcular (dias, opciones = {}) {
    const { desde, hasta, sucursales } = opciones
    const corte = Number(opciones.horaCorte == null ? 5 : opciones.horaCorte)
    const elegidos = (dias || []).filter((x) => x && (!desde || x.d >= desde) && (!hasta || x.d <= hasta) && (!sucursales || !sucursales.length || sucursales.includes(x.s)))
    const r = { ventas: 0, cantidad: 0, unidades: 0, costo: 0, comisiones: 0, lineasSinCosto: 0, mayorista: { total: 0, cantidad: 0, costo: 0 } }
    const horas = Array.from({ length: 24 }, (_, i) => { const hora = (corte + i) % 24; return { hora, total: 0, cantidad: 0, costo: 0 } })
    const porHora = {}
    for (const h of horas) porHora[h.hora] = h
    const porDia = {}
    const medios = {}
    const productos = {}
    const familias = {}
    for (const x of elegidos) {
      r.ventas += x.t || 0
      r.cantidad += x.n || 0
      r.unidades += x.u || 0
      r.costo += x.c || 0
      r.comisiones += x.com || 0
      r.lineasSinCosto += x.sc || 0
      if (x.may) { r.mayorista.total += x.may[0] || 0; r.mayorista.cantidad += x.may[1] || 0; r.mayorista.costo += x.may[2] || 0 }
      const dd = porDia[x.d] || (porDia[x.d] = { dia: x.d, total: 0, cantidad: 0, costo: 0 })
      dd.total += x.t || 0
      dd.cantidad += x.n || 0
      dd.costo += x.c || 0
      // Dias viejos sin el costo por hora: se reparte con el margen del dia.
      const conCostoHora = Object.values(x.h || {}).some((v) => v.length > 2)
      for (const [hora, v] of Object.entries(x.h || {})) {
        const h = porHora[Number(hora)]
        if (!h) continue
        h.total += v[0] || 0
        h.cantidad += v[1] || 0
        h.costo += conCostoHora ? (v[2] || 0) : (x.t ? Math.round((v[0] || 0) * (x.c || 0) / x.t) : 0)
      }
      for (const [medio, v] of Object.entries(x.m || {})) {
        const m = medios[medio] || (medios[medio] = { medio, nombre: NOMBRE_MEDIO[medio] || medio, importe: 0, cantidad: 0, comision: 0 })
        m.importe += Array.isArray(v) ? v[0] || 0 : v || 0
        m.cantidad += Array.isArray(v) ? v[1] || 0 : 0
        m.comision += Array.isArray(v) ? v[2] || 0 : 0
      }
      for (const p of x.p || []) {
        const [clave, descripcion, familia, unidades, importe, costo, sinCosto] = p
        const k = String(clave || descripcion)
        const prod = productos[k] || (productos[k] = { clave: k, descripcion, familia: familia || 'Sin rubro', unidades: 0, importe: 0, costo: 0, sinCosto: false })
        prod.unidades += unidades || 0
        prod.importe += importe || 0
        prod.costo += costo || 0
        if (sinCosto) prod.sinCosto = true
        const f = familias[prod.familia] || (familias[prod.familia] = { nombre: prod.familia, unidades: 0, importe: 0, costo: 0 })
        f.unidades += unidades || 0
        f.importe += importe || 0
        f.costo += costo || 0
      }
    }
    r.ganancia = r.ventas - r.costo
    r.gananciaNeta = r.ganancia - r.comisiones
    r.ticketPromedio = r.cantidad ? Math.round(r.ventas / r.cantidad) : 0
    r.mayorista.ganancia = r.mayorista.total - r.mayorista.costo
    r.mostrador = { total: r.ventas - r.mayorista.total, cantidad: r.cantidad - r.mayorista.cantidad, costo: r.costo - r.mayorista.costo }
    r.mostrador.ganancia = r.mostrador.total - r.mostrador.costo
    r.horas = horas.map((h) => Object.assign(h, { ganancia: h.total - h.costo }))
    r.dias = []
    if (desde && hasta) {
      for (let d = desde, i = 0; d <= hasta && i < 400; d = sumarDias(d, 1), i++) {
        const x = porDia[d] || { dia: d, total: 0, cantidad: 0, costo: 0 }
        r.dias.push(Object.assign(x, { ganancia: x.total - x.costo }))
      }
    }
    const totalMedios = Object.values(medios).reduce((s, m) => s + m.importe, 0)
    r.medios = Object.values(medios).map((m) => Object.assign(m, { pct: totalMedios ? Math.round(m.importe * 10000 / totalMedios) : 0 })).sort((a, b) => b.importe - a.importe)
    r.productos = Object.values(productos).map((p) => Object.assign(p, { ganancia: p.importe - p.costo }))
    r.familias = Object.values(familias).map((f) => Object.assign(f, { ganancia: f.importe - f.costo })).sort((a, b) => b.importe - a.importe)
    r.sinCosto = r.productos.filter((p) => p.sinCosto).sort((a, b) => b.importe - a.importe)
    r.diasConDatos = Object.keys(porDia).length
    return r
  }

  function top (lista, campo, n) {
    return lista.slice().sort((a, b) => (b[campo] || 0) - (a[campo] || 0)).slice(0, n || 10)
  }

  // Cuanto cambio contra el periodo anterior: { pct (en basis), sube }.
  function variacion (actual, anterior) {
    if (!anterior) return actual ? { pct: null, sube: true, nuevo: true } : { pct: 0, sube: true }
    const pct = Math.round((actual - anterior) * 10000 / Math.abs(anterior))
    return { pct, sube: actual >= anterior }
  }

  // Barras en SVG (sirve igual en la compu y en el celular). Cada barra lleva
  // data-i para que la pantalla sepa cual se toco. series: [{ campo, clase }].
  function barrasSvg (items, opciones = {}) {
    const series = opciones.series || [{ campo: 'total', clase: 'serie-1' }]
    const ancho = opciones.ancho || 720
    const alto = opciones.alto || 220
    const abajo = 22
    const arriba = 8
    const max = Math.max(1, ...items.map((it) => Math.max(...series.map((s) => it[s.campo] || 0))))
    const paso = ancho / Math.max(1, items.length)
    const anchoBarra = Math.max(2, Math.min(28, (paso - 4) / series.length - 2))
    const esc = (v) => Math.max(0, (alto - abajo - arriba) * (v || 0) / max)
    const esa = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    let svg = '<svg viewBox="0 0 ' + ancho + ' ' + alto + '" class="grafico-barras" role="img" preserveAspectRatio="none" width="100%" height="' + alto + '">'
    svg += '<line x1="0" x2="' + ancho + '" y1="' + (alto - abajo) + '" y2="' + (alto - abajo) + '" class="eje"/>'
    items.forEach((it, i) => {
      const x0 = i * paso + (paso - series.length * (anchoBarra + 2)) / 2
      const sel = opciones.seleccionado === i ? ' sel' : ''
      svg += '<g class="barra' + sel + '" data-i="' + i + '"><rect x="' + (i * paso) + '" y="0" width="' + paso + '" height="' + alto + '" class="toque"/>'
      series.forEach((s, j) => {
        const h = esc(it[s.campo])
        const y = alto - abajo - h
        const r = Math.min(4, anchoBarra / 2, h)
        svg += '<path class="' + s.clase + '" d="M' + (x0 + j * (anchoBarra + 2)) + ',' + (alto - abajo) + 'v' + (-(h - r)) + 'q0,' + (-r) + ' ' + r + ',' + (-r) + 'h' + (anchoBarra - 2 * r) + 'q' + r + ',0 ' + r + ',' + r + 'v' + (h - r) + 'z"/>'
        void y
      })
      if (opciones.etiqueta) {
        const t = opciones.etiqueta(it, i)
        if (t) svg += '<text x="' + (i * paso + paso / 2) + '" y="' + (alto - 6) + '" class="etiqueta" text-anchor="middle">' + esa(t) + '</text>'
      }
      if (opciones.titulo) svg += '<title>' + esa(opciones.titulo(it, i)) + '</title>'
      svg += '</g>'
    })
    return svg + '</svg>'
  }

  const Metricas = { periodo, calcular, top, variacion, barrasSvg, sumarDias, diasEntre, NOMBRE_MEDIO }
  if (typeof module !== 'undefined' && module.exports) module.exports = Metricas
  else raiz.Metricas = Metricas
})(typeof window !== 'undefined' ? window : this)

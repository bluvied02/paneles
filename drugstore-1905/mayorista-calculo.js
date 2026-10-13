'use strict'
// EL CALCULO DEL PRESUPUESTO MAYORISTA
//
// Uno solo para la caja y para el celular (que lo arma sin esperar a la caja):
// mismo precio, mismo descuento y mismos totales en los dos lados.
//
// Cada linea toma su precio mayorista asi (el primero que tenga):
//   'precio'  el precio final fijado a mano para esa linea;
//   'pct'     el % de descuento de esa linea;
//   'general' el % de descuento de todo el pedido;
//   'escala'  el de la escala por cantidad de Configuracion (desde 6, desde 12...).
// Los importes en centavos, las cantidades en milesimas (1 unidad = 1000).
;(function (raiz) {
  const pctValido = (v) => {
    if (v == null || v === '') return null
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(10000, Math.max(0, n)) : null
  }
  const porPrecio = (mil, precio) => Math.round((Number(mil) || 0) * (Number(precio) || 0) / 1000)

  function precioDeLinea (conf, it, p, general) {
    const lista = p ? p.precio || 0 : Math.max(0, Math.round(Number(it.precioLista != null ? it.precioLista : it.precioUnit) || 0))
    const paso = Number(conf.redondeo) || 0
    const redondear = (v) => (paso ? Math.round(v / paso) * paso : v)
    const aMano = Math.round(Number(it.precioFijo != null ? it.precioFijo : (it.precioAMano ? it.precioUnit : NaN)))
    if (Number.isFinite(aMano) && aMano > 0) return { modo: 'precio', lista, precioUnit: aMano, descuentoBasis: lista ? Math.round((lista - aMano) * 10000 / lista) : 0 }
    const propio = pctValido(it.descuentoBasis)
    if (propio != null && it.modo !== 'general' && it.modo !== 'escala') return { modo: 'pct', lista, precioUnit: redondear(Math.round(lista * (10000 - propio) / 10000)), descuentoBasis: propio }
    if (general != null) return { modo: 'general', lista, precioUnit: redondear(Math.round(lista * (10000 - general) / 10000)), descuentoBasis: general }
    let pct = 0
    const unidades = (Number(it.cantidad) || 0) / 1000
    for (const x of conf.escalas || []) if (unidades >= x.desde) pct = x.pctBasis
    return { modo: 'escala', lista, precioUnit: redondear(Math.round(lista * (10000 - pct) / 10000)), descuentoBasis: pct }
  }

  // productoDe(id) -> { precio, costo, codigos, descripcion } o null.
  function calcular (datos, productoDe, conf) {
    const general = pctValido(datos.descuentoGeneralBasis)
    const items = []
    for (const it of datos.items || []) {
      const p = it.productoId ? productoDe(it.productoId) : null
      const cantidad = Math.round(Number(it.cantidad) || 0)
      if (cantidad <= 0) continue
      const descripcion = String((p ? p.descripcion : it.descripcion) || '').trim().slice(0, 120)
      if (!descripcion) continue
      const pr = precioDeLinea(conf || {}, it, p, general)
      const costoUnit = p ? p.costo || 0 : Math.max(0, Math.round(Number(it.costoUnit) || 0))
      items.push({
        productoId: p ? it.productoId : null,
        codigo: p ? (p.codigos || [])[0] || '' : String(it.codigo || '').slice(0, 30),
        descripcion,
        cantidad,
        precioLista: pr.lista,
        precioUnit: pr.precioUnit,
        descuentoBasis: pr.descuentoBasis,
        modo: pr.modo,
        subtotal: porPrecio(cantidad, pr.precioUnit),
        subtotalLista: porPrecio(cantidad, pr.lista),
        costoUnit,
        costo: porPrecio(cantidad, costoUnit),
        bajoCosto: costoUnit > 0 && pr.precioUnit < costoUnit,
        sinCosto: !costoUnit
      })
    }
    const total = items.reduce((s, x) => s + x.subtotal, 0)
    const totalLista = items.reduce((s, x) => s + x.subtotalLista, 0)
    const costoTotal = items.reduce((s, x) => s + x.costo, 0)
    return {
      items,
      descuentoGeneralBasis: general,
      total,
      totalLista,
      ahorro: Math.max(0, totalLista - total),
      costoTotal,
      ganancia: total - costoTotal,
      margenBasis: total ? Math.round((total - costoTotal) * 10000 / total) : 0,
      bajoCosto: items.filter((x) => x.bajoCosto).map((x) => x.descripcion),
      sinCosto: items.filter((x) => x.sinCosto).length
    }
  }

  // El numero que sigue: el mas alto + 1 (M-0001, M-0002...).
  function proximoNumero (numeros) {
    let max = 0
    for (const n of numeros || []) {
      const v = parseInt(String(n || '').replace(/\D+/g, ''), 10)
      if (v > max) max = v
    }
    return 'M-' + String(max + 1).padStart(4, '0')
  }

  const MayoristaCalculo = { calcular, precioDeLinea, proximoNumero, pctValido }
  if (typeof module !== 'undefined' && module.exports) module.exports = MayoristaCalculo
  else raiz.MayoristaCalculo = MayoristaCalculo
})(typeof window !== 'undefined' ? window : this)

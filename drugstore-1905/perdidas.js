'use strict'
// Mercadería descartada desde el celular. La caja registra la pérdida y el
// movimiento de stock juntos cuando recibe la orden.

async function secPerdidas () {
  if (!S.sucursal) return pintarSeccion('perdidas', cabecera('Pérdidas'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'perdidas')))
  const reportes = await leerDatos('reportes').catch(() => ({}))
  const hoyCaja = ((datosDe(reportes) || {}).hoy || {}).desde || hoyISO()
  const mes = S.perdidasMes || hoyCaja.slice(0, 7)
  const d = datosDe(await leerDatos('perdidas_mes:' + mes).catch(() => ({})))
  const elegirMes = el('input', { type: 'month', valor: mes, max: hoyCaja.slice(0, 7) })
  elegirMes.addEventListener('change', () => { S.perdidasMes = elegirMes.value; render() })
  const registrar = () => hojaRegistrarPerdida()
  // El encargado registra lo que se tira, pero no ve lo que cuesta.
  if (S.rol !== 'duenio') {
    return pintarSeccion('perdidas',
      cabecera('Pérdidas', nombreSucursal(S.sucursal) + ' · mercadería tirada, vencida o rota', el('button', { clase: 'btn primario', onclick: registrar }, icono('sumar'), 'Registrar pérdida')),
      el('div', { clase: 'tarjeta' }, vacio('Cada pérdida descuenta el producto del stock. La lista con lo que costó la ve el dueño.', 'perdidas',
        el('button', { clase: 'btn primario', onclick: registrar }, icono('sumar'), 'Registrar pérdida'))))
  }
  pintarSeccion('perdidas',
    cabecera('Pérdidas', nombreSucursal(S.sucursal) + ' · mercadería tirada, vencida o rota',
      el('button', { clase: 'btn primario', onclick: registrar }, icono('sumar'), 'Registrar pérdida')),
    el('div', { clase: 'tarjeta' },
      el('p', { clase: 'sub', estilo: { whiteSpace: 'normal', marginTop: 0 } }, 'Cada pérdida descuenta el producto del stock y se resta de la ganancia del mes al costo. No pasa por caja ni por cuenta corriente.'),
      el('label', { clase: 'campo' }, 'Mes', elegirMes)),
    d ? el('div', { clase: 'kpis' },
      kpi('Pérdidas registradas', String(d.registros), 'Este mes'),
      kpi('Mercadería perdida', plata(d.total), 'Al costo · se resta de la ganancia', { clase: d.total ? 'mal' : '' })) : null,
    d && d.sinCosto ? el('div', { clase: 'aviso alerta' }, d.sinCosto + ' pérdidas sin costo cargado: figuran como $ 0.') : null,
    el('div', { clase: 'tarjeta sin-relleno' },
      d ? (d.lista.length ? el('div', { clase: 'lista' }, d.lista.map((p) => el('div', {
        clase: 'item tocable' + (p.anulada ? ' inactivo' : ''), onclick: () => hojaDetallePerdida(p, d.motivos)
      },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion),
        el('div', { clase: 'sub' }, fechaCorta(p.dia) + ' · ' + (d.motivos[p.motivo] || p.motivo) + ' · ' + unidades(p.cantidad) + ' u.' + (p.anulada ? ' · anulada' : '')),
        p.nota ? el('div', { clase: 'sub' }, p.nota) : null),
      el('div', { clase: 'fin' }, el('b', { clase: 'num' }, p.anulada ? 'Anulada' : plata(p.valorCosto))))))
        : vacio('No hay pérdidas registradas en este mes.', 'perdidas'))
        : vacio('La caja todavía no subió las pérdidas. Aparecen cuando reciba la actualización.', 'perdidas')))
}

async function hojaRegistrarPerdida () {
  const suc = S.sucursal
  // Todos los activos: aunque el sistema diga 0 o negativo, lo que se tira estaba.
  const productos = (await leerCatalogo(suc)).filter((p) => p.activo !== false)
  const buscar = el('input', { type: 'search', placeholder: 'Buscar producto o código…' })
  const resultados = el('div', { clase: 'lista' })
  const elegido = el('div', { clase: 'sub' }, 'Elegí un producto de la lista')
  const cantidad = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ej.: 2 o 0,500' })
  const motivo = el('select', {}, [['podrido', 'En mal estado / podrido'], ['vencido', 'Vencido'], ['roto', 'Roto'], ['otro', 'Otro motivo']]
    .map(([id, nombre]) => el('option', { valor: id }, nombre)))
  const nota = el('input', { type: 'text', maxlength: '160', placeholder: 'Ej.: frutillas con hongos' })
  let producto = null
  const elegir = (p) => {
    producto = p
    elegido.textContent = p.descripcion + ' · stock ' + unidades(p.stock)
    buscar.value = ''
    poner(resultados)
    cantidad.focus()
  }
  const pintar = () => {
    const q = buscar.value.trim()
    const lista = (q ? productos.filter((p) => coincide(p.descripcion + ' ' + (p.codigos || []).join(' '), q)) : productos.filter((p) => p.stock > 0)).slice(0, 25)
    poner(resultados, lista.length ? lista.map((p) => el('button', { clase: 'item', onclick: () => elegir(p) }, el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, (p.codigos || [])[0] || 'sin código')),
    el('b', { clase: 'num' }, unidades(p.stock)))) : vacio('No hay productos que coincidan.', 'buscar'))
  }
  const escanear = el('button', { clase: 'btn ancho', estilo: { margin: '0 0 8px' }, onclick: async () => {
    const c = await leerCodigo({ titulo: 'Producto que se tira' })
    if (!c) return
    const p = productos.find((x) => (x.codigos || []).includes(c))
    if (p) elegir(p)
    else toast('Ese código no está en ' + nombreSucursal(suc), 'mal')
  } }, icono('escanear'), 'Escanear el producto')
  buscar.addEventListener('input', pintar)
  pintar()
  abrirHoja({
    titulo: 'Registrar pérdida',
    cuerpo: el('div', {},
      el('p', { clase: 'sub' }, 'Cargá cada producto descartado por separado. La caja descuenta el stock cuando recibe la orden.'),
      escanear,
      el('label', { clase: 'campo' }, 'Producto', buscar),
      el('div', { clase: 'tarjeta sin-relleno', estilo: { maxHeight: '180px', overflowY: 'auto' } }, resultados),
      elegido,
      el('label', { clase: 'campo' }, 'Cantidad', cantidad),
      el('label', { clase: 'campo' }, 'Motivo', motivo),
      el('label', { clase: 'campo' }, 'Detalle (opcional)', nota)),
    botones: [{ texto: 'Descontar del stock', primario: true, alTocar: async () => {
      if (!producto) return toast('Elegí el producto', 'mal')
      const n = aMilesimas(cantidad.value)
      if (!Number.isSafeInteger(n) || n <= 0) return toast('Escribí una cantidad mayor a cero', 'mal')
      cerrarHoja()
      await mandarOrden(suc, 'perdida_registrar', { productoId: producto.id, cantidad: n, motivo: motivo.value, nota: nota.value.trim() },
        { texto: 'Pérdida de ' + producto.descripcion, alTerminar: refrescarSeccion })
    } }]
  })
}

function hojaDetallePerdida (p, motivos) {
  const suc = S.sucursal
  abrirHoja({
    titulo: p.descripcion,
    cuerpo: el('div', {},
      el('div', { clase: 'fila' }, el('span', {}, 'Fecha'), el('b', {}, fechaCorta(p.dia))),
      el('div', { clase: 'fila' }, el('span', {}, 'Motivo'), el('b', {}, motivos[p.motivo] || p.motivo)),
      el('div', { clase: 'fila' }, el('span', {}, 'Cantidad'), el('b', {}, unidades(p.cantidad))),
      el('div', { clase: 'fila' }, el('span', {}, 'Valor al costo'), el('b', {}, plata(p.valorCosto))),
      p.nota ? el('p', { clase: 'sub' }, p.nota) : null,
      p.anulada ? el('p', { clase: 'sub' }, 'Anulada: ' + (p.motivoAnulacion || 'sin detalle')) : null),
    botones: p.anulada || p.origenVencimientoId ? [] : [{ texto: 'Anular pérdida', peligro: true, alTocar: () => {
      const razon = prompt('¿Por qué se anula la pérdida? La cantidad volverá al stock.')
      if (!razon || !razon.trim()) return
      cerrarHoja()
      mandarOrden(suc, 'perdida_anular', { id: p.id, motivo: razon.trim() }, { texto: 'Pérdida anulada', alTerminar: refrescarSeccion })
    } }]
  })
}

seccion('perdidas', { nombre: 'Pérdidas', icono: 'perdidas', grupo: 'mercaderia', fn: secPerdidas })

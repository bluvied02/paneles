'use strict'
// PRODUCTOS, STOCK Y ALTA DESDE EL CELULAR
//
// El flujo principal: escaneo → lo encuentro → veo stock → cambio el precio.
// Y si no existe: escaneo → "no encontrado" → crear, con el codigo ya puesto.
// Cada cambio es una orden para la caja de esa sucursal; mientras la caja no
// la aplica, el producto se ve con el valor nuevo y la marca "enviando".

// --- piezas ---------------------------------------------------------------------

function colorStock (p) {
  if (p.stock < 0) return 'rojo'
  if (p.stock === 0 || (p.minimo > 0 && p.stock < p.minimo)) return 'ambar'
  return ''
}

function itemProducto (p, alTocar, opciones = {}) {
  const m = puede('verCostos') ? margenDe(p.precio, p.costo) : null
  return el('div', { clase: 'item tocable' + (p.activo === false ? ' inactivo' : '') + (opciones.sel ? ' sel' : ''), onclick: alTocar },
    opciones.seleccionando ? el('span', { clase: 'marca-sel' }, opciones.sel ? icono('ok') : null) : null,
    p.foto ? el('img', { clase: 'mini-foto', src: p.foto, alt: '', loading: 'lazy' }) : null,
    el('div', { clase: 'cuerpo' },
      el('b', {}, p.descripcion),
      el('div', { clase: 'sub' }, [(p.codigos || [])[0] || 'sin código', p.familia || p.proveedor || ''].filter(Boolean).join(' · '),
        p._pendiente ? el('span', { clase: 'chip alerta', estilo: { marginLeft: '6px' } }, 'enviando') : null)),
    el('div', { clase: 'fin' + (opciones.rapido ? ' pila' : '') },
      opciones.rapido && puede('editarPrecios')
        ? el('button', { clase: 'btn chico rapida', 'aria-label': 'Cambiar precio', onclick: (ev) => { ev.stopPropagation(); hojaPrecio(p) } }, el('b', { clase: 'num' }, plata(p.precio)))
        : el('b', { clase: 'num' }, plata(p.precio)),
      opciones.rapido
        ? el('button', { clase: 'btn chico rapida', 'aria-label': 'Ajustar stock', onclick: (ev) => { ev.stopPropagation(); hojaAjusteStock(p) } }, el('span', { clase: 'num ' + colorStock(p) }, 'stock ' + unidades(p.stock)))
        : el('div', { clase: 'sub num ' + colorStock(p) }, 'stock ' + unidades(p.stock) + (m != null && opciones.conMargen ? ' · ' + pct(m) : ''))))
}

// Deja en el catalogo guardado lo que se acaba de mandar, para verlo ya.
function marcarPendiente (sucursalId, id, cambios) {
  const c = S.cache['c:' + sucursalId]
  if (!c) return
  const p = c.v.find((x) => x.id === id)
  if (p) Object.assign(p, cambios, { _pendiente: true })
}

// --- abrir por codigo -------------------------------------------------------------

async function escanearYAbrir () {
  const codigo = await leerCodigo({ titulo: 'Escanear producto' })
  if (codigo) await abrirPorCodigo(codigo)
}

async function abrirPorCodigo (codigo) {
  let r
  try { r = await buscarCodigo(codigo) } catch (err) { return toast(err.message, 'mal', 6) }
  if (r.producto) return hojaProducto(r.producto)
  hojaNoEncontrado(codigo, r.enOtra)
}

function hojaNoEncontrado (codigo, enOtra) {
  const otro = enOtra && enOtra.producto
  abrirHoja({
    titulo: 'Producto no encontrado',
    cuerpo: el('div', {},
      el('div', { clase: 'contador' }, el('div', { clase: 'sub' }, 'Código'), el('div', { clase: 'v', estilo: { fontSize: '26px' } }, codigo)),
      el('p', { clase: 'tenue', estilo: { textAlign: 'center' } }, 'No está cargado en ' + nombreSucursal(S.sucursal) + '.'),
      otro ? el('div', { clase: 'aviso info' }, el('b', {}, 'Existe en ' + nombreSucursal(enOtra.sucursalId)), otro.descripcion + ' · ' + plata(otro.precio)) : null,
      el('button', { clase: 'btn primario ancho grande', onclick: () => { cerrarHoja(); hojaNuevoProducto({ codigo, descripcion: otro ? otro.descripcion : '', precio: otro ? otro.precio : null, costo: otro ? otro.costo : null }) } }, icono('sumar'), otro ? 'Crear igual en esta sucursal' : 'Crear producto'),
      // Muchas veces es un producto que ya esta, con un codigo nuevo (el
      // proveedor cambio el envase): crear otro lo repetia, con el stock partido.
      el('button', { clase: 'btn ancho grande', estilo: { marginTop: '8px' }, onclick: () => { cerrarHoja(); luegoDeAtras(() => hojaAgregarCodigo(codigo)) } }, icono('editar'), 'Es un producto que ya está: agregarle este código'),
      el('button', { clase: 'btn ancho', estilo: { marginTop: '8px' }, onclick: () => { cerrarHoja(); escanearYAbrir() } }, icono('escanear'), 'Escanear otro'))
  })
}

// Buscar el producto que ya existe y agregarle el codigo que no estaba.
async function hojaAgregarCodigo (codigo) {
  const suc = S.sucursal
  const lista = await leerCatalogo(suc).catch(() => [])
  abrirHoja({
    titulo: 'Agregar el código ' + codigo,
    completa: true,
    cuerpo: el('div', {},
      el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Buscá el producto: se le agrega el código ' + codigo + ' y sigue teniendo los que tenía. El stock no cambia.'),
      buscadorParaAgregar(lista, (p) => {
        if (!confirm('¿Agregarle el código ' + codigo + ' a "' + p.descripcion + '"?')) return
        cerrarHoja()
        marcarPendiente(suc, p.id, { codigos: (p.codigos || []).concat([codigo]) })
        mandarOrden(suc, 'producto_codigo', { productoId: p.id, agregar: codigo }, { texto: 'Código nuevo de ' + p.descripcion, alTerminar: refrescarSeccion })
      }))
  })
}

// Los precios que esperan una decision porque subio el costo al recibir
// (antes solo se veian en la compu, en Recibir).
async function hojaPreciosPendientes (suc) {
  suc = suc || S.sucursal
  const lista = datosDe(await leerDatos('precios_pendientes', true).catch(() => ({})), suc) || []
  if (!lista.length) return toast('No hay precios para revisar', 'ok')
  const decididos = new Set()
  const zona = el('div', { clase: 'lista' })
  const pintar = () => poner(zona, lista.filter((x) => !decididos.has(x.productoId)).map((x) => {
    const precio = el('input', { type: 'text', inputmode: 'decimal', clase: 'num', valor: plataExacta(x.precioSugerido || x.precioActual), estilo: { width: '110px' } })
    const decidir = (datos, texto) => { decididos.add(x.productoId); mandarOrden(suc, 'precio_revisar', Object.assign({ productoId: x.productoId }, datos), { texto, callado: true }); pintar() }
    return el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
      el('div', { clase: 'cuerpo' },
        el('b', {}, x.descripcion),
        el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Costo ' + plata(x.costoAnterior) + ' → ' + plata(x.costoNuevo) + (x.subioBasis ? ' (' + (x.subioBasis > 0 ? '+' : '') + pct(x.subioBasis) + ')' : '') + ' · hoy vale ' + plata(x.precioActual))),
      el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' } },
        el('label', { clase: 'sub fila', estilo: { gap: '4px', alignItems: 'center' } }, '$', precio),
        el('button', { clase: 'btn chico primario', onclick: () => { const c = aCentavos(precio.value); if (!(c > 0)) return toast('El precio no es válido', 'mal'); decidir({ precio: c }, 'Precio de ' + x.descripcion) } }, 'Ponerle este precio'),
        el('button', { clase: 'btn chico', onclick: () => decidir({ dejar: true }, 'Dejar el precio de ' + x.descripcion) }, 'Dejarlo como está')))
  }).concat(decididos.size === lista.length ? [vacio('Listo: no quedan precios para revisar.', 'ok')] : []))
  pintar()
  abrirHoja({
    titulo: 'Subió el costo: ¿cambiás el precio?',
    completa: true,
    cuerpo: el('div', {}, el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'El precio propuesto mantiene la ganancia que tenía (o la del rubro). Cambialo si querés antes de ponerlo.'), zona),
    alCerrar: () => { if (decididos.size) { S.cache = {}; refrescarSeccion() } }
  })
}

// --- PRODUCTOS -----------------------------------------------------------------

const FILTROS_PRODUCTO = [
  ['todos', 'Todos', (p) => p.activo !== false],
  ['bajo', 'Stock bajo', (p) => p.activo !== false && (p.stock < 0 || (p.minimo > 0 && p.stock < p.minimo))],
  ['sin', 'Sin stock', (p) => p.activo !== false && p.stock <= 0],
  ['negativo', 'En negativo', (p) => p.activo !== false && p.stock < 0],
  ['sinCosto', 'Sin costo', (p) => p.activo !== false && !p.costo],
  ['pierden', 'Pierden plata', (p) => p.activo !== false && p.costo > 0 && p.precio > 0 && p.precio < p.costo],
  ['sinProv', 'Sin proveedor', (p) => p.activo !== false && !p.proveedorId],
  ['quieto', 'Sin ventas 30 días', (p) => p.activo !== false && !p.vendido30 && p.stock > 0],
  ['baja', 'Dados de baja', (p) => p.activo === false]
]
const ORDENES_PRODUCTO = [
  ['vendidos', 'Más vendidos', (a, b) => b.vendido30 - a.vendido30 || a.descripcion.localeCompare(b.descripcion, 'es')],
  ['nombre', 'Nombre (A-Z)', (a, b) => a.descripcion.localeCompare(b.descripcion, 'es')],
  ['precioAlto', 'Precio: mayor primero', (a, b) => b.precio - a.precio],
  ['precioBajo', 'Precio: menor primero', (a, b) => a.precio - b.precio],
  ['stockBajo', 'Stock: menor primero', (a, b) => a.stock - b.stock],
  ['stockAlto', 'Stock: mayor primero', (a, b) => b.stock - a.stock],
  ['margenBajo', 'Margen: menor primero', (a, b) => (margenDe(a.precio, a.costo) ?? 1e9) - (margenDe(b.precio, b.costo) ?? 1e9)],
  ['margenAlto', 'Margen: mayor primero', (a, b) => (margenDe(b.precio, b.costo) ?? -1e9) - (margenDe(a.precio, a.costo) ?? -1e9)]
]

async function secProductos (params) {
  if (!S.sucursal) return pintarSeccion('productos', cabecera('Productos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'productos')))
  const [lista, provs, rubrosD] = await Promise.all([leerCatalogo(S.sucursal), leerDatos('proveedores').catch(() => ({})), leerDatos('rubros').catch(() => ({}))])
  const proveedores = datosDe(provs) || []
  const rubros = datosDe(rubrosD) || []
  const familias = rubros.filter((r) => !r.padreId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const hijos = {}
  for (const r of rubros) if (r.padreId) (hijos[r.padreId] = hijos[r.padreId] || []).push(r.id)
  const rama = (id) => { const s = new Set([id]); const pend = [id]; while (pend.length) for (const h of hijos[pend.pop()] || []) if (!s.has(h)) { s.add(h); pend.push(h) } return s }

  const E = S.prod = Object.assign({ busca: '', filtro: 'todos', familia: '', proveedor: '', orden: 'vendidos', rapido: leerLocal('bs.rapido', true), sel: null }, S.prod || {}, params.filtro ? { filtro: params.filtro } : {})
  const busca = el('input', { type: 'search', placeholder: 'Nombre o código…', valor: E.busca, enterkeyhint: 'search' })
  const zona = el('div', { clase: 'lista' })
  const barraSel = el('div', {})
  const filtrosZona = el('div', { clase: 'filtros' })
  let limite = 60

  const selFamilia = el('select', {}, el('option', { valor: '' }, 'Todas las familias'), familias.map((f) => el('option', { valor: f.id }, f.nombre)))
  selFamilia.value = E.familia
  const selProv = el('select', {}, el('option', { valor: '' }, 'Todos los proveedores'), proveedores.map((x) => el('option', { valor: x.id }, x.nombre)))
  selProv.value = E.proveedor
  const selOrden = el('select', {}, ORDENES_PRODUCTO.filter(([id]) => !/^margen/.test(id) || puede('verCostos')).map(([id, t]) => el('option', { valor: id }, t)))
  if (!puede('verCostos') && /^margen/.test(E.orden)) E.orden = 'vendidos'
  selOrden.value = E.orden

  const filtrados = () => {
    const f = (FILTROS_PRODUCTO.find((x) => x[0] === E.filtro) || FILTROS_PRODUCTO[0])[2]
    const r = E.familia ? rama(E.familia) : null
    return lista.filter((p) => f(p) && (!r || r.has(p.rubroId)) && (!E.proveedor || p.proveedorId === E.proveedor) &&
      (!E.busca || coincide(p.descripcion + ' ' + (p.codigos || []).join(' ') + ' ' + p.rubro + ' ' + p.proveedor, E.busca)))
      .sort((ORDENES_PRODUCTO.find((x) => x[0] === E.orden) || ORDENES_PRODUCTO[0])[2])
  }
  const pintarFiltros = () => {
    poner(filtrosZona, FILTROS_PRODUCTO.filter(([id]) => (id !== 'sinCosto' && id !== 'pierden') || puede('verCostos')).map(([id, t, fn]) => el('button', { clase: 'filtro' + (E.filtro === id ? ' activo' : ''), onclick: () => { E.filtro = id; limite = 60; pintarFiltros(); pintar() } },
      t, id !== 'todos' ? el('span', { clase: 'n' }, String(lista.filter(fn).length)) : null)))
  }
  const pintarSel = () => {
    if (!E.sel) { limpiar(barraSel); return }
    const n = E.sel.size
    poner(barraSel, el('div', { clase: 'aviso info', estilo: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
      el('b', { estilo: { margin: 0, flex: '1' } }, n + (n === 1 ? ' elegido' : ' elegidos')),
      el('button', { clase: 'btn chico', onclick: () => { for (const p of filtrados().slice(0, 300)) E.sel.add(p.id); pintarSel(); pintar() } }, 'Todos los de la lista'),
      el('button', { clase: 'btn chico primario', disabled: !n, onclick: () => hojaAumento(S.sucursal, proveedores, rubros, lista, [...E.sel]) }, 'Cambiar precio %'),
      el('button', { clase: 'btn chico', disabled: !n, onclick: () => hojaAsignarProveedor([...E.sel], proveedores) }, 'Asignar proveedor'),
      el('button', { clase: 'btn chico', onclick: () => { E.sel = null; pintarSel(); pintar() } }, 'Listo')))
  }
  const pintar = () => {
    const filas = filtrados()
    poner(zona,
      filas.length
        ? filas.slice(0, limite).map((p) => itemProducto(p,
          () => { if (E.sel) { if (E.sel.has(p.id)) E.sel.delete(p.id); else E.sel.add(p.id); pintarSel(); pintar() } else hojaProducto(p) },
          { rapido: E.rapido && !E.sel, conMargen: true, seleccionando: !!E.sel, sel: E.sel && E.sel.has(p.id) }))
        : [vacio(lista.length ? 'Ningún producto coincide.' : 'Todavía no hay productos subidos de esta sucursal.', 'productos',
          E.busca ? el('button', { clase: 'btn primario', onclick: () => hojaNuevoProducto({ descripcion: /^\d{6,}$/.test(E.busca) ? '' : E.busca, codigo: /^\d{6,}$/.test(E.busca) ? E.busca : '' }) }, icono('sumar'), 'Crear "' + E.busca + '"') : null)],
      filas.length > limite ? el('button', { clase: 'btn ancho', estilo: { margin: '8px 16px', width: 'calc(100% - 32px)' }, onclick: () => { limite += 120; pintar() } }, 'Ver más (' + (filas.length - limite) + ')') : null)
    cuenta.textContent = filas.length + (filas.length === 1 ? ' producto' : ' productos')
  }
  const cuenta = el('span', { clase: 'sub' })
  const botonRapido = el('button', { clase: 'btn chico', title: 'Tocar el precio o el stock de la lista para cambiarlo ahí mismo' })
  const pintarRapido = () => { botonRapido.textContent = E.rapido ? 'Edición rápida: sí' : 'Edición rápida: no' }
  botonRapido.addEventListener('click', () => { E.rapido = !E.rapido; guardarLocal('bs.rapido', E.rapido); pintarRapido(); pintar() })
  pintarRapido()
  let espera = null
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { E.busca = busca.value; limite = 60; pintar() }, 90) })
  selFamilia.addEventListener('change', () => { E.familia = selFamilia.value; pintar() })
  selProv.addEventListener('change', () => { E.proveedor = selProv.value; pintar() })
  selOrden.addEventListener('change', () => { E.orden = selOrden.value; pintar() })
  pintarFiltros()
  pintarSel()
  pintar()
  // Los ultimos aumentos en tanda, con "Volver atrás" (antes, solo en la compu).
  const zonaAumentos = el('div', {})
  if (puede('editarPrecios')) {
    const aum = (datosDe(await leerDatos('aumentos').catch(() => ({}))) || []).slice(0, 5)
    if (aum.length) {
      poner(zonaAumentos, el('div', { clase: 'sub', estilo: { margin: '4px 0' } }, 'Últimos aumentos'), el('div', { clase: 'lista' }, aum.map((a) => el('div', { clase: 'item' },
        el('div', { clase: 'cuerpo' }, el('b', {}, pct(a.porcentajeBasis) + ' · ' + a.productos + ' productos'), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, fechaHora(a.ts) + (a.usuario ? ' · ' + a.usuario : '') + (a.alcance ? ' · ' + a.alcance : ''))),
        el('div', { clase: 'fin' }, a.revertido ? el('span', { clase: 'chip' }, 'Vuelto atrás') : el('button', { clase: 'btn chico', onclick: () => {
          if (!confirm('¿Volver atrás este aumento? Cada producto vuelve al precio que tenía, salvo los que se cambiaron a mano después.')) return
          mandarOrden(S.sucursal, 'aumento_deshacer', { id: a.id }, { texto: 'Volver atrás un aumento', alTerminar: refrescarSeccion })
        } }, 'Volver atrás'))))))
    }
  }

  const pendientesPrecio = puede('editarPrecios') ? (datosDe(await leerDatos('precios_pendientes').catch(() => ({}))) || []) : []
  pintarSeccion('productos',
    cabecera('Productos', nombreSucursal(S.sucursal) + ' · ' + lista.filter((p) => p.activo !== false).length + ' activos',
      el('button', { clase: 'btn primario', onclick: () => hojaNuevoProducto({}) }, icono('sumar'), 'Nuevo')),
    pendientesPrecio.length ? el('div', { clase: 'alerta-fila alerta', onclick: () => hojaPreciosPendientes(), estilo: { marginBottom: '10px' } },
      el('span', { clase: 'ico' }, icono('gastos')), el('div', { clase: 'txt' }, el('b', {}, pendientesPrecio.length + (pendientesPrecio.length === 1 ? ' precio para revisar' : ' precios para revisar')), el('span', { clase: 'sub' }, 'Subió el costo al recibir: decidí si cambiás el precio')), icono('flecha')) : null,
    el('div', { clase: 'buscador' }, icono('buscar'), busca,
      el('button', { clase: 'btn-ico', 'aria-label': 'Escanear', onclick: async () => { const c = await leerCodigo({ titulo: 'Buscar por código' }); if (c) { E.busca = c; busca.value = c; pintar(); const p = lista.find((x) => (x.codigos || []).includes(c)); if (p) hojaProducto(p); else hojaNoEncontrado(c) } } }, icono('escanear'))),
    filtrosZona,
    el('details', { clase: 'detalles' }, el('summary', {}, 'Ordenar, familia, proveedor y aumentos'),
      el('div', { clase: 'campo' }, 'Ordenar', selOrden),
      el('div', { clase: 'dos' }, el('div', { clase: 'campo' }, 'Familia', selFamilia), el('div', { clase: 'campo' }, 'Proveedor', selProv)),
      puede('editarPrecios') ? el('button', { clase: 'btn ancho', estilo: { marginBottom: '12px' }, onclick: () => hojaAumento(S.sucursal, proveedores, rubros, lista) }, 'Aumentar precios por proveedor o familia') : null,
      puede('editarPrecios') ? zonaAumentos : null),
    el('div', { clase: 'tarjeta-cab' }, cuenta,
      el('div', { clase: 'chips' },
        botonRapido,
        puede('editarPrecios') ? el('button', { clase: 'btn chico', onclick: () => { E.sel = E.sel ? null : new Set(); pintarSel(); pintar() } }, 'Seleccionar') : null)),
    barraSel,
    el('div', { clase: 'tarjeta sin-relleno' }, zona))
  if (E.busca && window.innerWidth > 860) busca.focus()
}

// --- la foto del producto -------------------------------------------------------
//
// Se saca con la camara, se achica aca (480 px, JPG: unos 40 KB) y viaja como
// una orden mas; la caja la sube a la nube y le pone el link al producto.

function achicarFoto (archivo, lado = 480) {
  return new Promise((resolver, rechazar) => {
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, lado / Math.max(img.width, img.height))
      const lienzo = document.createElement('canvas')
      lienzo.width = Math.round(img.width * escala)
      lienzo.height = Math.round(img.height * escala)
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height)
      URL.revokeObjectURL(img.src)
      resolver(lienzo.toDataURL('image/jpeg', 0.74))
    }
    img.onerror = () => rechazar(new Error('No se pudo abrir la foto'))
    img.src = URL.createObjectURL(archivo)
  })
}

function sacarFoto (p, sucursalId) {
  const suc = sucursalId || S.sucursal
  const entrada = el('input', { type: 'file', accept: 'image/*', capture: 'environment', estilo: { display: 'none' } })
  document.body.append(entrada)
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files && entrada.files[0]
    entrada.remove()
    if (!archivo) return
    let url
    try { url = await achicarFoto(archivo) } catch (err) { return toast(err.message, 'mal') }
    const vista = el('img', { src: url, alt: '', clase: 'foto-producto' })
    abrirHoja({
      titulo: 'Foto de ' + p.descripcion,
      cuerpo: el('div', {}, vista, el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Se ve en la lista de productos del celular, en las dos sucursales.')),
      botones: [{ texto: 'Guardar la foto', primario: true, alTocar: async () => {
        cerrarHoja()
        await mandarOrden(suc, 'producto_foto', { productoId: p.id, imagen: url.split(',')[1] }, { texto: 'Foto de ' + p.descripcion })
        marcarPendiente(suc, p.id, { foto: url })
        refrescarSeccion()
      } }]
    })
  })
  entrada.click()
}

// --- la ficha del producto ------------------------------------------------------

async function hojaProducto (p, sucursalId) {
  const suc = sucursalId || S.sucursal
  const m = margenDe(p.precio, p.costo)
  const costos = puede('verCostos')
  const precios = puede('editarPrecios')
  const extra = el('div', {}, el('div', { clase: 'esqueleto', estilo: { height: '60px', marginTop: '10px' } }))
  abrirHoja({
    titulo: p.descripcion,
    completa: true,
    cuerpo: el('div', {},
      el('div', { clase: 'chips', estilo: { marginBottom: '8px' } },
        (p.codigos || []).length ? (p.codigos || []).map((c) => el('span', { clase: 'chip num' }, c)) : el('span', { clase: 'chip' }, 'sin código'),
        p.activo === false ? el('span', { clase: 'chip mal' }, 'Dado de baja') : el('span', { clase: 'chip ok' }, 'Activo'),
        p._pendiente ? el('span', { clase: 'chip alerta' }, 'Cambios enviándose') : null),
      el('div', { clase: 'sub' }, [p.rubro || 'Sin familia', p.proveedor || 'Sin proveedor', nombreSucursal(suc)].join(' · ')),
      el('div', { clase: 'dato-grande' },
        el('div', {}, el('div', { clase: 'r' }, 'Precio'), el('div', { clase: 'v' }, plata(p.precio))),
        costos ? el('div', {}, el('div', { clase: 'r' }, 'Costo'), el('div', { clase: 'v' }, p.costo ? plata(p.costo) : '—')) : null,
        costos ? el('div', {}, el('div', { clase: 'r' }, 'Margen'), el('div', { clase: 'v ' + (m != null && m < 15 * 100 ? 'ambar' : '') }, m == null ? '—' : pct(m))) : null,
        el('div', {}, el('div', { clase: 'r' }, 'Stock'), el('div', { clase: 'v ' + colorStock(p) }, unidades(p.stock))),
        el('div', {}, el('div', { clase: 'r' }, 'Mínimo'), el('div', { clase: 'v' }, p.minimo ? unidades(p.minimo) : '—')),
        el('div', {}, el('div', { clase: 'r' }, 'Vendió 30 días'), el('div', { clase: 'v' }, unidades(p.vendido30)))),
      p.foto ? el('img', { clase: 'foto-producto', src: p.foto, alt: p.descripcion }) : null,
      el('div', { clase: 'acciones-grandes' },
        precios ? el('button', { clase: 'btn primario grande', onclick: () => hojaPrecio(p, suc) }, icono('gastos'), 'Cambiar precio') : null,
        puede('ajustarStock') ? el('button', { clase: 'btn primario grande', onclick: () => hojaAjusteStock(p, suc) }, icono('stock'), 'Ajustar stock') : null,
        puede('fotos') ? el('button', { clase: 'btn grande', onclick: () => sacarFoto(p, suc) }, icono('foto'), p.foto ? 'Cambiar la foto' : 'Sacarle una foto') : null,
        precios ? el('button', { clase: 'btn grande', onclick: () => hojaEditarProducto(p, suc) }, icono('editar'), 'Editar todo') : null,
        esEmpleado() ? null : el('button', { clase: 'btn grande', onclick: () => { const x = extra.querySelector('[data-hist]'); if (x) x.scrollIntoView({ behavior: 'smooth' }) } }, icono('historial'), 'Historial')),
      extra)
  })
  // El empleado consulta precio y stock: el historial y las ventas no son para el.
  if (esEmpleado()) { limpiar(extra); return }
  // Ventas y cambios del producto (se cargan despues de abrir: no demoran la ficha).
  try {
    const [aud, vh, va] = await Promise.all([leerDatos('auditoria').catch(() => ({})), leerDatos('ventas_hoy').catch(() => ({})), leerDatos('ventas_ayer').catch(() => ({}))])
    const cambios = (datosDe(aud, suc) || []).filter((x) => x.productoId === p.id).slice(0, 25)
    const tickets = (datosDe(vh, suc) || []).concat(datosDe(va, suc) || []).filter((v) => !v.a && v.i.some((it) => it[3] === p.id))
    const hoy = hoyISO()
    const unidHoy = tickets.filter((v) => isoLocal(new Date(v.ts)) === hoy).reduce((s, v) => s + v.i.filter((it) => it[3] === p.id).reduce((a, it) => a + it[1], 0), 0)
    poner(extra,
      el('h3', {}, 'Ventas'),
      el('div', { clase: 'dato-grande' },
        el('div', {}, el('div', { clase: 'r' }, 'Hoy'), el('div', { clase: 'v' }, unidades(unidHoy))),
        el('div', {}, el('div', { clase: 'r' }, '7 días'), el('div', { clase: 'v' }, unidades(p.vendido7 || 0))),
        el('div', {}, el('div', { clase: 'r' }, 'Última venta'), el('div', { clase: 'v', estilo: { fontSize: '14px' } }, p.ultimaVenta ? hace(p.ultimaVenta) : '—'))),
      tickets.length && seccionPermitida('ventas') ? el('div', { clase: 'lista' }, tickets.slice(0, 8).map((v) => itemVenta(v, () => hojaVenta(v, suc), p.id))) : null,
      el('h3', { 'data-hist': '' }, 'Cambios y movimientos'),
      cambios.length ? el('div', { clase: 'lista' }, cambios.map(itemAuditoria)) : el('p', { clase: 'sub' }, 'Sin cambios registrados todavía (se anotan desde la versión 0.11 de la caja).'))
  } catch (e) { limpiar(extra) }
}

// --- cambiar el precio ----------------------------------------------------------

function hojaPrecio (p, sucursalId) {
  const suc = sucursalId || S.sucursal
  const precio = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: plataExacta(p.precio) })
  const costo = el('input', { type: 'text', inputmode: 'decimal', valor: p.costo ? plataExacta(p.costo) : '', placeholder: 'Sin costo' })
  const info = el('div', { clase: 'aviso' })
  const pintarInfo = () => {
    const pr = aCentavos(precio.value)
    const co = aCentavos(costo.value)
    if (!Number.isFinite(pr)) { poner(info, 'Escribí el precio.'); info.className = 'aviso mal'; return }
    const mg = margenDe(pr, co)
    info.className = 'aviso ' + (mg == null ? '' : mg < 0 ? 'mal' : mg < 1500 ? 'alerta' : 'ok')
    poner(info, mg == null ? 'Con el costo cargado se ve la ganancia.' : [el('b', {}, 'Ganás ' + plata(pr - co) + ' por unidad'), pct(mg) + ' sobre el costo' + (pr !== p.precio ? ' · antes ' + plata(p.precio) : '')])
  }
  precio.addEventListener('input', pintarInfo)
  costo.addEventListener('input', pintarInfo)
  pintarInfo()
  // Subas rapidas, redondeadas a $10.
  const subas = el('div', { clase: 'chips', estilo: { margin: '4px 0 12px' } }, [5, 10, 15, 20].map((x) => el('button', { clase: 'btn chico', onclick: () => {
    const nuevo = Math.round(p.precio * (1 + x / 100) / 1000) * 1000
    precio.value = plataExacta(nuevo); pintarInfo()
  } }, '+' + x + '%')))
  abrirHoja({
    titulo: 'Precio · ' + p.descripcion,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Precio de venta ($)', precio),
      subas,
      el('label', { clase: 'campo' }, 'Costo ($)', costo),
      info),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const pr = aCentavos(precio.value)
      if (!Number.isFinite(pr) || pr <= 0) return toast('El precio no es válido', 'mal')
      const cambios = {}
      if (pr !== p.precio) cambios.precio = pr
      const co = costo.value.trim() ? aCentavos(costo.value) : 0
      if (!Number.isFinite(co) || co < 0) return toast('El costo no es válido', 'mal')
      if (co !== (p.costo || 0)) cambios.costo = co
      if (!Object.keys(cambios).length) return cerrarHoja()
      if (co && pr < co && !confirm('El precio queda por debajo del costo. ¿Guardar igual?')) return
      cerrarHoja()
      marcarPendiente(suc, p.id, cambios)
      await mandarOrden(suc, 'producto', { productoId: p.id, cambios }, { texto: 'Precio de ' + p.descripcion, alTerminar: refrescarSeccion })
      refrescarSeccion()
    } }]
  })
  if (window.innerWidth <= 860) setTimeout(() => { precio.focus(); precio.select() }, 250)
}

function refrescarSeccion () { if (!S.hojas.length) render() }

// --- ajustar el stock -----------------------------------------------------------

// "Mercadería recibida" y "Pérdida" no van aca: lo recibido asi no cerraba el
// pedido ni tomaba el costo, y la perdida no salia en el informe de Pérdidas.
// Esos dos llevan a su pantalla.
const MOTIVOS_STOCK = [
  ['Ajuste manual', 'ajuste'], ['Diferencia de inventario', 'ajuste'], ['Rotura', 'rotura'], ['Vencimiento', 'vencimiento'], ['Otro', 'ajuste']
]

function hojaAjusteStock (p, sucursalId) {
  const suc = sucursalId || S.sucursal
  const kg = p.unidad === 'kg'
  let suma = 0
  let motivo = 'Ajuste manual'
  const exacto = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ej: 40' })
  const otro = el('input', { type: 'text', placeholder: 'Contá qué pasó', estilo: { display: 'none', marginTop: '8px' } })
  const contador = el('div', { clase: 'contador' })
  const motivos = el('div', { clase: 'chips' })
  const pintar = () => {
    const ex = aMilesimas(exacto.value)
    const nuevo = Number.isFinite(ex) ? ex : p.stock + suma
    const dif = nuevo - p.stock
    poner(contador,
      el('div', { clase: 'sub' }, 'Ahora hay ' + unidades(p.stock) + (kg ? ' kg' : '') + ' · queda'),
      el('div', { clase: 'v ' + (nuevo < 0 ? 'rojo' : '') }, unidades(nuevo)),
      el('div', { clase: 'delta ' + (dif > 0 ? 'sube' : dif < 0 ? 'baja' : 'igual') }, dif ? (dif > 0 ? '+' : '−') + unidades(Math.abs(dif)) : 'sin cambios'))
    poner(motivos, MOTIVOS_STOCK.map(([t]) => el('button', { clase: 'filtro' + (motivo === t ? ' activo' : ''), onclick: () => { motivo = t; otro.style.display = t === 'Otro' ? '' : 'none'; pintar() } }, t)))
  }
  const paso = (n) => { exacto.value = ''; suma += n * 1000; vibrar(15); pintar() }
  exacto.addEventListener('input', () => { suma = 0; pintar() })
  pintar()
  abrirHoja({
    titulo: 'Stock · ' + p.descripcion,
    cuerpo: el('div', {},
      contador,
      el('div', { clase: 'pasos-stock' },
        [-10, -5, -1, 1, 5, 10].map((n) => el('button', { clase: 'btn', onclick: () => paso(n) }, (n > 0 ? '+' : '−') + Math.abs(n)))),
      el('label', { clase: 'campo' }, 'O el stock exacto que hay', exacto),
      el('div', { clase: 'campo' }, 'Motivo', motivos, otro),
      el('div', { clase: 'chips', estilo: { marginBottom: '8px' } },
        seccionPermitida('recibir') && puede('recibir') ? el('button', { clase: 'btn chico', onclick: () => { cerrarHoja(); luegoDeAtras(() => ir('recibir')) } }, '¿Llegó mercadería? Recibila') : null,
        seccionPermitida('perdidas') ? el('button', { clase: 'btn chico', onclick: () => { cerrarHoja(); luegoDeAtras(() => ir('perdidas')) } }, '¿Se tiró algo? Pérdidas') : null),
      el('p', { clase: 'sub' }, 'Lo aplica la caja de ' + nombreSucursal(suc) + '. Si sumás o restás, se aplica sobre lo que haya en ese momento (si se vendió mientras tanto, no se pierde). Queda registrado quién, cuándo y por qué.')),
    botones: [{ texto: 'Confirmar', primario: true, alTocar: async () => {
      const ex = aMilesimas(exacto.value)
      const tieneExacto = Number.isFinite(ex)
      if (!tieneExacto && !suma) return toast('Sumá, restá o escribí el stock exacto', 'mal')
      if (tieneExacto && ex < 0) return toast('El stock no puede ser negativo', 'mal')
      const texto = motivo === 'Otro' ? (otro.value.trim() || 'Otro') : motivo
      const tipo = (MOTIVOS_STOCK.find((x) => x[0] === motivo) || [])[1] || 'ajuste'
      cerrarHoja()
      const nuevo = tieneExacto ? ex : p.stock + suma
      marcarPendiente(suc, p.id, { stock: nuevo })
      // El exacto lleva la hora: lo que se venda hasta que la caja lo aplique se descuenta.
      await mandarOrden(suc, 'stock', Object.assign({ productoId: p.id, motivo: texto, tipo }, tieneExacto ? { cantidad: ex, ts: new Date().toISOString() } : { suma }),
        { texto: 'Stock de ' + p.descripcion, alTerminar: refrescarSeccion })
      refrescarSeccion()
    } }]
  })
}

// --- editar todo ----------------------------------------------------------------

async function hojaEditarProducto (p, sucursalId) {
  const suc = sucursalId || S.sucursal
  const [provs, rubrosD] = await Promise.all([leerDatos('proveedores').catch(() => ({})), leerDatos('rubros').catch(() => ({}))])
  const proveedores = datosDe(provs, suc) || []
  const rubros = datosDe(rubrosD, suc) || []
  const nombre = el('input', { type: 'text', valor: p.descripcion })
  const precio = el('input', { type: 'text', inputmode: 'decimal', valor: plataExacta(p.precio) })
  const costo = el('input', { type: 'text', inputmode: 'decimal', valor: p.costo ? plataExacta(p.costo) : '' })
  const minimo = el('input', { type: 'text', inputmode: 'decimal', valor: p.minimo ? unidades(p.minimo) : '' })
  // Cuantas trae la caja del proveedor: sirve para el pedido (vacio o 1 = suelto).
  const bulto = el('input', { type: 'text', inputmode: 'numeric', valor: p.bulto > 1 ? String(p.bulto) : '', placeholder: 'Suelto' })
  const prov = el('select', {}, el('option', { valor: '' }, 'Sin proveedor'), proveedores.map((x) => el('option', { valor: x.id }, x.nombre)))
  prov.value = p.proveedorId || ''
  const rub = selectorRubro(rubros, p.rubroId)
  const activo = el('select', {}, el('option', { valor: '1' }, 'Se vende'), el('option', { valor: '0' }, 'Dado de baja'))
  activo.value = p.activo === false ? '0' : '1'
  // Los codigos: se saca uno que sobra o se agrega otro (se mandan aparte).
  const zonaCodigos = el('div', {})
  const pintarCodigos = () => poner(zonaCodigos,
    el('div', { clase: 'chips' }, (p.codigos || []).map((c) => el('span', { clase: 'chip num' }, c,
      (p.codigos || []).length > 1 ? el('button', { 'aria-label': 'Sacar', estilo: { background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: '0 0 0 6px' }, onclick: () => {
        if (!confirm('¿Sacarle el código ' + c + '?')) return
        p.codigos = p.codigos.filter((x) => x !== c)
        mandarOrden(suc, 'producto_codigo', { productoId: p.id, quitar: c }, { texto: 'Sacar código de ' + p.descripcion })
        pintarCodigos()
      } }, '×') : null))),
    el('button', { clase: 'btn chico', estilo: { marginTop: '6px' }, onclick: async () => {
      const c = await leerCodigo({ titulo: 'Código nuevo de ' + p.descripcion })
      if (!c) return
      if ((p.codigos || []).includes(c)) return toast('Ya tiene ese código', '', 2)
      p.codigos = (p.codigos || []).concat([c])
      mandarOrden(suc, 'producto_codigo', { productoId: p.id, agregar: c }, { texto: 'Código nuevo de ' + p.descripcion })
      pintarCodigos()
    } }, icono('escanear'), 'Agregar otro código'))
  pintarCodigos()
  abrirHoja({
    titulo: 'Editar · ' + p.descripcion,
    completa: true,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Nombre', nombre),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Precio ($)', precio), el('label', { clase: 'campo' }, 'Costo ($)', costo)),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Stock mínimo', minimo), el('label', { clase: 'campo' }, 'Unidades por caja', bulto)),
      el('label', { clase: 'campo' }, 'Estado', activo),
      el('label', { clase: 'campo' }, 'Familia / rubro', rub),
      el('label', { clase: 'campo' }, 'Proveedor', prov),
      el('div', { clase: 'campo' }, 'Códigos de barras', zonaCodigos),
      el('p', { clase: 'sub' }, 'El stock se cambia con "Ajustar stock", así queda el motivo.')),
    botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
      const cambios = {}
      const n = nombre.value.trim()
      if (!n) return toast('El nombre no puede quedar vacío', 'mal')
      if (n !== p.descripcion) cambios.descripcion = n
      const pr = aCentavos(precio.value)
      if (!Number.isFinite(pr) || pr < 0) return toast('El precio no es válido', 'mal')
      if (pr !== p.precio) cambios.precio = pr
      const co = costo.value.trim() ? aCentavos(costo.value) : 0
      if (!Number.isFinite(co) || co < 0) return toast('El costo no es válido', 'mal')
      if (co !== (p.costo || 0)) cambios.costo = co
      const mi = minimo.value.trim() ? aMilesimas(minimo.value) : 0
      if (!Number.isFinite(mi) || mi < 0) return toast('El mínimo no es válido', 'mal')
      if (mi !== (p.minimo || 0)) cambios.minimo = mi
      const bu = bulto.value.trim() ? Math.round(Number(bulto.value.replace(',', '.'))) : 1
      if (!Number.isFinite(bu) || bu < 1 || bu > 1000) return toast('Las unidades por caja no son válidas', 'mal')
      if (bu !== (p.bulto || 1)) cambios.unidadesPorBulto = bu
      if ((prov.value || null) !== (p.proveedorId || null)) cambios.proveedorId = prov.value || null
      if ((rub.value || null) !== (p.rubroId || null)) cambios.rubroId = rub.value || null
      const act = activo.value === '1'
      if (act !== (p.activo !== false)) cambios.activo = act
      if (!Object.keys(cambios).length) return cerrarHoja()
      cerrarHoja()
      marcarPendiente(suc, p.id, Object.assign({}, cambios, cambios.descripcion ? { descripcion: cambios.descripcion } : {}, cambios.unidadesPorBulto ? { bulto: cambios.unidadesPorBulto } : {}))
      await mandarOrden(suc, 'producto', { productoId: p.id, cambios }, { texto: 'Cambios en ' + p.descripcion, alTerminar: refrescarSeccion })
      refrescarSeccion()
    } }]
  })
}

function selectorRubro (rubros, actual) {
  const porId = {}
  for (const r of rubros) porId[r.id] = r
  const ruta = (id) => { const x = []; let r = porId[id]; let n = 0; while (r && n++ < 6) { x.unshift(r.nombre); r = porId[r.padreId] } return x.join(' › ') }
  const opciones = rubros.map((r) => [r.id, ruta(r.id)]).sort((a, b) => a[1].localeCompare(b[1], 'es'))
  const s = el('select', {}, el('option', { valor: '' }, 'Sin familia'), opciones.map(([id, t]) => el('option', { valor: id }, t)))
  s.value = actual || ''
  return s
}

// --- producto nuevo -------------------------------------------------------------

async function hojaNuevoProducto (previo) {
  const suc = S.sucursal
  if (!suc) return toast('Primero tiene que conectarse una caja', 'mal')
  const [lista, provs, rubrosD] = await Promise.all([leerCatalogo(suc).catch(() => []), leerDatos('proveedores').catch(() => ({})), leerDatos('rubros').catch(() => ({}))])
  const proveedores = datosDe(provs, suc) || []
  const rubros = datosDe(rubrosD, suc) || []
  const codigo = el('input', { type: 'text', inputmode: 'numeric', valor: previo.codigo || '', placeholder: 'Escaneá o escribí (opcional)' })
  const nombre = el('input', { type: 'text', valor: previo.descripcion || '', placeholder: 'Ej: Alfajor Havanna triple', autocapitalize: 'characters' })
  const precio = el('input', { type: 'text', inputmode: 'decimal', clase: 'plata-grande', valor: previo.precio ? plataExacta(previo.precio) : '', placeholder: '0' })
  const costo = el('input', { type: 'text', inputmode: 'decimal', valor: previo.costo ? plataExacta(previo.costo) : '', placeholder: 'Opcional' })
  const stock = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0' })
  const minimo = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Opcional' })
  const prov = el('select', {}, el('option', { valor: '' }, 'Sin proveedor'), proveedores.map((x) => el('option', { valor: x.id }, x.nombre)))
  const rub = selectorRubro(rubros, '')
  const unidad = el('select', {}, el('option', { valor: 'unidad' }, 'Por unidad'), el('option', { valor: 'kg' }, 'Por kilo'))
  const iva = el('select', {}, el('option', { valor: '2100' }, '21%'), el('option', { valor: '1050' }, '10,5%'), el('option', { valor: '2700' }, '27%'), el('option', { valor: '0' }, 'Exento'))
  const avisoCodigo = el('div', {})
  const info = el('div', { clase: 'sub', estilo: { marginTop: '-4px', marginBottom: '10px' } })
  const revisarCodigo = () => {
    const c = codigo.value.trim()
    const ya = c && lista.find((x) => (x.codigos || []).includes(c))
    poner(avisoCodigo, ya ? el('div', { clase: 'aviso mal' }, el('b', {}, 'Ese código ya es de "' + ya.descripcion + '"'), el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); cerrarHoja(); hojaProducto(ya) } }, 'Ver ese producto')) : null)
    return !ya
  }
  const pintarInfo = () => {
    const mg = margenDe(aCentavos(precio.value), aCentavos(costo.value))
    info.textContent = mg == null ? '' : 'Margen ' + pct(mg) + ' sobre el costo'
  }
  codigo.addEventListener('input', revisarCodigo)
  precio.addEventListener('input', pintarInfo)
  costo.addEventListener('input', pintarInfo)
  revisarCodigo()
  pintarInfo()

  const guardar = async (otro) => {
    if (!revisarCodigo()) return toast('Ese código ya existe', 'mal')
    const n = nombre.value.trim()
    if (!n) { nombre.focus(); return toast('Falta el nombre', 'mal') }
    const pr = aCentavos(precio.value)
    if (!Number.isFinite(pr) || pr <= 0) { precio.focus(); return toast('Falta el precio', 'mal') }
    const co = costo.value.trim() ? aCentavos(costo.value) : 0
    if (!Number.isFinite(co) || co < 0) return toast('El costo no es válido', 'mal')
    const st = stock.value.trim() ? aMilesimas(stock.value) : 0
    if (!Number.isFinite(st) || st < 0) return toast('El stock no es válido', 'mal')
    const mi = minimo.value.trim() ? aMilesimas(minimo.value) : 0
    const datos = { codigo: codigo.value.trim(), descripcion: n, precio: pr, costo: co, stockInicial: st, minimo: Number.isFinite(mi) ? mi : 0, proveedorId: prov.value || null, rubroId: rub.value || null, unidad: unidad.value, iva: Number(iva.value) }
    cerrarHoja()
    await mandarOrden(suc, 'producto_nuevo', datos, {
      texto: 'Producto nuevo: ' + n,
      alTerminar: async (r) => {
        if (r.estado !== 'aplicada' || !r.resultado || !r.resultado.id) return
        refrescarSeccion()
        if (otro || S.hojas.length) return
        // Recien creado: se abre su ficha.
        setTimeout(async () => {
          const cat = await leerCatalogo(suc, true).catch(() => [])
          const nuevo = cat.find((x) => x.id === r.resultado.id)
          if (nuevo && !S.hojas.length) hojaProducto(nuevo, suc)
        }, 2500)
      }
    })
    if (otro) setTimeout(() => escanearParaCrear(), 400)
  }
  abrirHoja({
    titulo: 'Producto nuevo',
    completa: true,
    cuerpo: el('div', {},
      el('div', { clase: 'campo' }, 'Código de barras',
        el('div', { estilo: { display: 'flex', gap: '8px' } }, codigo,
          el('button', { clase: 'btn-ico', estilo: { width: '46px', height: '46px' }, 'aria-label': 'Escanear', onclick: async () => { const c = await leerCodigo({ titulo: 'Código del producto nuevo' }); if (c) { codigo.value = c; revisarCodigo() } } }, icono('escanear')))),
      avisoCodigo,
      el('label', { clase: 'campo' }, 'Nombre', nombre),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Precio de venta ($)', precio), puede('verCostos') ? el('label', { clase: 'campo' }, 'Costo ($)', costo) : null),
      info,
      el('label', { clase: 'campo' }, 'Stock que hay ahora', stock),
      el('details', { clase: 'detalles' }, el('summary', {}, 'Más datos (opcional): familia, proveedor, mínimo, unidad, IVA'),
        el('label', { clase: 'campo' }, 'Familia / rubro', rub),
        el('label', { clase: 'campo' }, 'Proveedor', prov),
        el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Stock mínimo', minimo), el('label', { clase: 'campo' }, 'Se vende', unidad)),
        el('label', { clase: 'campo' }, 'IVA', iva)),
      el('p', { clase: 'sub' }, 'Lo crea la caja de ' + nombreSucursal(suc) + ' en menos de un minuto. Con nombre y precio alcanza; lo demás se completa después.')),
    botones: [
      { texto: 'Guardar y otro', alTocar: () => guardar(true) },
      { texto: 'Guardar', primario: true, alTocar: () => guardar(false) }
    ]
  })
  if (!previo.descripcion && window.innerWidth <= 860) setTimeout(() => (previo.codigo ? nombre : codigo).focus(), 300)
}

async function escanearParaCrear () {
  const c = await leerCodigo({ titulo: 'Código del producto nuevo', texto: 'Escaneá el próximo producto' })
  if (!c) return
  const r = await buscarCodigo(c).catch(() => ({}))
  if (r.producto) { toast('Ese ya existe: ' + r.producto.descripcion); return hojaProducto(r.producto) }
  hojaNuevoProducto({ codigo: c })
}

// --- aumentos y cambios en tanda ------------------------------------------------

function hojaAumento (sucursalId, proveedores, rubros, lista, productoIds) {
  const porcentaje = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ej: 8 (o -5 para bajar)' })
  const prov = el('select', {}, el('option', { valor: '' }, 'Todos los proveedores'), proveedores.map((x) => el('option', { valor: x.id }, x.nombre)))
  const familias = rubros.filter((r) => !r.padreId).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const rub = el('select', {}, el('option', { valor: '' }, 'Todas las familias'), familias.map((x) => el('option', { valor: x.id }, x.nombre)))
  let redondeo = 'cien'
  const seg = el('div', { clase: 'seg' })
  const pintarSeg = () => { poner(seg, [['ninguno', 'Sin redondear'], ['decena', 'a $10'], ['cincuenta', 'a $50'], ['cien', 'a $100']].map(([id, t]) => el('button', { clase: redondeo === id ? 'activo' : '', onclick: () => { redondeo = id; pintarSeg() } }, t))) }
  pintarSeg()
  const cuantos = el('div', { clase: 'aviso info' })
  const hijos = {}
  for (const r of rubros) if (r.padreId) (hijos[r.padreId] = hijos[r.padreId] || []).push(r.id)
  const rama = (id) => { const s = new Set([id]); const pend = [id]; while (pend.length) for (const h of hijos[pend.pop()] || []) if (!s.has(h)) { s.add(h); pend.push(h) } return s }
  // Lo mismo que calcula la caja (precios.js): asi se ve antes de aplicar.
  const PASOS = { ninguno: 0, decena: 1000, cincuenta: 5000, cien: 10000 }
  const alcanzados = () => {
    if (productoIds) { const ids = new Set(productoIds); return lista.filter((p) => ids.has(p.id) && p.activo !== false && p.precio > 0) }
    const r = rub.value ? rama(rub.value) : null
    return lista.filter((p) => p.activo !== false && p.precio > 0 && (!prov.value || p.proveedorId === prov.value) && (!r || r.has(p.rubroId)))
  }
  const nuevoPrecio = (antes, basis) => { const bruto = antes + Math.round(antes * basis / 10000); const paso = PASOS[redondeo] || 0; return Math.max(0, paso ? Math.round(bruto / paso) * paso : bruto) }
  const ejemplos = el('div', { clase: 'lista' })
  const contar = () => {
    const prods = alcanzados()
    cuantos.textContent = prods.length + (prods.length === 1 ? ' producto va a cambiar de precio.' : ' productos van a cambiar de precio.')
    const n = Number(String(porcentaje.value).replace(',', '.'))
    poner(ejemplos, Number.isFinite(n) && n ? prods.slice().sort((a, b) => b.vendido30 - a.vendido30).slice(0, 5).map((p) => el('div', { clase: 'item' },
      el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion)),
      el('div', { clase: 'fin' }, el('span', { clase: 'sub' }, plata(p.precio) + ' → '), el('b', { clase: 'num' }, plata(nuevoPrecio(p.precio, Math.round(n * 100))))))) : null)
  }
  prov.addEventListener('change', contar)
  rub.addEventListener('change', contar)
  porcentaje.addEventListener('input', contar)
  seg.addEventListener('click', () => setTimeout(contar, 0))
  contar()
  abrirHoja({
    titulo: productoIds ? 'Cambiar precio de los elegidos' : 'Aumentar precios en ' + nombreSucursal(sucursalId),
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Cuánto (%)', porcentaje),
      productoIds ? null : el('label', { clase: 'campo' }, 'De qué proveedor', prov),
      productoIds ? null : el('label', { clase: 'campo' }, 'De qué familia', rub),
      el('div', { clase: 'campo' }, 'Redondeo', seg),
      cuantos,
      ejemplos,
      el('p', { clase: 'sub' }, 'Queda anotado en la caja y se puede volver atrás desde Productos → "Ordenar, familia, proveedor y aumentos" → Últimos aumentos.')),
    botones: [{ texto: 'Aplicar', primario: true, alTocar: async () => {
      const n = Number(String(porcentaje.value).replace(',', '.'))
      if (!Number.isFinite(n) || n === 0 || n < -50 || n > 200) return toast('Poné un porcentaje (por ejemplo 8)', 'mal')
      const cant = alcanzados().length
      if (!cant) return toast('No hay productos con precio para cambiar con ese filtro', 'mal')
      // Un 80 en vez de un 8, o todo el catalogo: se pregunta antes.
      const todo = !productoIds && !prov.value && !rub.value
      if ((Math.abs(n) > 30 || todo) && !confirm((n > 0 ? 'Subir ' : 'Bajar ') + Math.abs(n) + '% el precio de ' + cant + ' productos' + (todo ? ' (TODOS los del local)' : '') + '.\n\n¿Seguro?')) return
      cerrarHoja()
      await mandarOrden(sucursalId, 'aumento', {
        porcentajeBasis: Math.round(n * 100), redondeo, proveedorId: productoIds ? undefined : prov.value || undefined, rubroId: productoIds ? undefined : rub.value || undefined, productoIds: productoIds || undefined,
        alcance: 'Desde el celular: ' + n + '%' + (productoIds ? ' · ' + productoIds.length + ' elegidos' : (prov.value ? ' · ' + prov.selectedOptions[0].textContent : '') + (rub.value ? ' · ' + rub.selectedOptions[0].textContent : ''))
      }, { texto: 'Aumento de ' + n + '%', alTerminar: refrescarSeccion })
      if (S.prod) S.prod.sel = null
    } }]
  })
}

function hojaAsignarProveedor (ids, proveedores) {
  const prov = el('select', {}, el('option', { valor: '' }, 'Elegí el proveedor…'), proveedores.map((x) => el('option', { valor: x.id }, x.nombre)))
  abrirHoja({
    titulo: 'Asignar proveedor',
    cuerpo: el('div', {}, el('p', { clase: 'tenue' }, ids.length + ' productos elegidos.'), el('label', { clase: 'campo' }, 'Proveedor', prov)),
    botones: [{ texto: 'Asignar', primario: true, alTocar: async () => {
      if (!prov.value) return toast('Elegí el proveedor', 'mal')
      cerrarHoja()
      for (const id of ids) marcarPendiente(S.sucursal, id, { proveedorId: prov.value, proveedor: prov.selectedOptions[0].textContent })
      // Todos en una sola orden (antes era una por producto y trababa la caja).
      await mandarOrden(S.sucursal, 'productos_proveedor', { productoIds: ids, proveedorId: prov.value }, { texto: 'Proveedor de ' + ids.length + ' productos' })
      if (S.prod) S.prod.sel = null
      refrescarSeccion()
    } }]
  })
}

// --- STOCK --------------------------------------------------------------------------

async function secStock () {
  if (!S.sucursal) return pintarSeccion('stock', cabecera('Stock'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'stock')))
  const [lista, aud] = await Promise.all([leerCatalogo(S.sucursal), leerDatos('auditoria').catch(() => ({}))])
  const productos = lista.filter((p) => p.activo !== false || p.stock < 0)
  const negativos = productos.filter((p) => p.stock < 0)
  const enCero = productos.filter((p) => p.stock === 0).length
  const positivos = productos.filter((p) => p.stock > 0).length
  const esDuenio = !esEncargado() && !esEmpleado()
  const valorDe = (p) => Math.round(p.stock * (p.costo || 0) / 1000)
  const valorExistencias = productos.reduce((total, p) => total + (p.stock > 0 ? valorDe(p) : 0), 0)
  const valorNegativos = negativos.reduce((total, p) => total + valorDe(p), 0)
  const sinCosto = productos.filter((p) => p.stock > 0 && !p.costo).length
  const V = S.stockVista || (S.stockVista = { filtro: 'todos', busca: '' })
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto o código…', valor: V.busca, enterkeyhint: 'search' })
  const zona = el('div', { clase: 'lista' })
  const titulo = el('h3', {}, '')
  const filtros = el('div', { clase: 'filtros' })
  let limite = 80
  const opciones = [
    ['todos', 'Todos', productos.length],
    ['negativo', 'En negativo', negativos.length],
    ['cero', 'En cero', enCero],
    ['con', 'Con stock', positivos]
  ]
  const pintarFiltros = () => poner(filtros, opciones.map(([id, nombre, cantidad]) => el('button', {
    clase: 'filtro' + (V.filtro === id ? ' activo' : ''),
    onclick: () => { V.filtro = id; limite = 80; pintarFiltros(); pintar() }
  }, nombre, el('span', { clase: 'n' }, String(cantidad)))))
  const pintar = () => {
    const q = V.busca.trim()
    const filas = productos.filter((p) =>
      (V.filtro === 'todos' || (V.filtro === 'negativo' && p.stock < 0) || (V.filtro === 'cero' && p.stock === 0) || (V.filtro === 'con' && p.stock > 0)) &&
      (!q || coincide(p.descripcion + ' ' + (p.codigos || []).join(' '), q)))
      .sort((a, b) => a.stock - b.stock || a.descripcion.localeCompare(b.descripcion, 'es'))
    titulo.textContent = filas.length + (filas.length === 1 ? ' producto' : ' productos') + (V.filtro === 'negativo' ? ' en negativo' : '')
    poner(zona,
      filas.length ? filas.slice(0, limite).map((p) => el('div', { clase: 'item tocable' + (p.activo === false ? ' inactivo' : ''), onclick: () => hojaAjusteStock(p) },
        el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion),
          el('div', { clase: 'sub' }, ((p.codigos || [])[0] || 'sin código') + (p.activo === false ? ' · dado de baja' : ''))),
        el('div', { clase: 'fin' }, el('b', { clase: 'num ' + colorStock(p) }, unidades(p.stock)),
          el('div', { clase: 'sub' }, esDuenio && p.stock > 0 ? plata(valorDe(p)) + ' al costo' : 'en stock'))))
        : vacio(q ? 'No hay productos con esa búsqueda.' : 'No hay productos en esta categoría.', 'stock'),
      filas.length > limite ? el('button', { clase: 'btn ancho', onclick: () => { limite += 100; pintar() } }, 'Ver más (' + (filas.length - limite) + ')') : null)
  }
  busca.addEventListener('input', () => { V.busca = busca.value; limite = 80; pintar() })
  pintarFiltros()
  pintar()
  const ajustes = (datosDe(aud) || []).filter((x) => x.tipo === 'stock').slice(0, 30)
  const ponerNegativosACero = async () => {
    const actual = await leerCatalogo(S.sucursal, true)
    const cantidad = actual.filter((p) => p.stock < 0).length
    if (!cantidad) return toast('Ya no hay productos en negativo.', 'ok')
    if (!confirm('¿Poner en cero los ' + cantidad + ' productos con stock negativo de ' + nombreSucursal(S.sucursal) + '?\n\nLa caja revisa el stock actual cuando recibe la orden. Los productos con stock positivo no se tocan. Cada corrección queda en el historial.')) return
    await mandarOrden(S.sucursal, 'stock_negativos_cero', {}, { texto: 'Negativos puestos en cero', alTerminar: refrescarSeccion })
  }
  pintarSeccion('stock',
    cabecera('Stock', nombreSucursal(S.sucursal) + ' · existencias y correcciones', esDuenio ? el('button', { clase: 'btn primario', onclick: () => ir('perdidas') }, 'Registrar pérdida') : null),
    esDuenio ? el('div', { clase: 'kpis' },
      kpi('Mercadería en stock', plata(valorExistencias), 'al costo · sólo cantidades positivas', { clase: 'principal' }),
      negativos.length ? kpi('Saldo del sistema', plata(valorExistencias + valorNegativos), 'incluye los ' + negativos.length + ' productos negativos') : null) : null,
    esDuenio && sinCosto ? el('div', { clase: 'aviso alerta' },
      sinCosto + (sinCosto === 1 ? ' producto con stock no tiene costo cargado.' : ' productos con stock no tienen costo cargado.') + ' Su valor figura como $ 0 hasta que cargues el costo.') : null,
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'fila' }, el('b', {}, positivos + ' con stock'), el('b', {}, enCero + ' en cero'), el('b', { clase: negativos.length ? 'rojo' : '' }, negativos.length + ' en negativo')),
      el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Tocá un producto para corregir su cantidad. Los negativos aparecen primero en la lista.'),
      el('button', { clase: 'btn peligro ancho', disabled: !negativos.length || !esDuenio, onclick: ponerNegativosACero },
        'Poner todos los negativos en cero' + (negativos.length ? ' (' + negativos.length + ')' : '')),
      !esDuenio && negativos.length ? el('p', { clase: 'sub' }, 'La puesta en cero de todos los negativos la hace el dueño.') : null),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: async () => {
      const c = await leerCodigo({ titulo: 'Producto a corregir' })
      if (!c) return
      const r = await buscarCodigo(c).catch(() => ({}))
      if (r.producto) hojaAjusteStock(r.producto)
      else hojaNoEncontrado(c, r.enOtra)
    } }, icono('escanear'), 'Escanear producto'),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    filtros,
    titulo,
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    el('h3', {}, 'Últimos ajustes'),
    el('div', { clase: 'tarjeta sin-relleno' }, ajustes.length ? el('div', { clase: 'lista' }, ajustes.map(itemAuditoria)) : vacio('Todavía no hay ajustes registrados.', 'historial')))
}

// --- PASAR A OTRA SUCURSAL ------------------------------------------------------------
//
// Sale del stock de la sucursal elegida arriba y entra en la otra cuando esa
// caja se conecta. La lista que se esta armando queda guardada en el celular
// hasta que se manda.

async function secPasar () {
  const otras = S.sucursales.filter((x) => x.id !== S.sucursal)
  if (!S.sucursal || !otras.length) {
    return pintarSeccion('pasar', cabecera('Pasar a otra sucursal'),
      el('div', { clase: 'tarjeta' }, vacio('Hacen falta dos sucursales conectadas a la nube.', 'pasar')))
  }
  const [lista, tr] = await Promise.all([leerCatalogo(S.sucursal), leerDatos('transferencias').catch(() => ({}))])
  const clave = 'bs.pasar.' + S.sucursal
  const P = S.pasar && S.pasar.suc === S.sucursal ? S.pasar : (S.pasar = { suc: S.sucursal, lineas: leerLocal(clave, []), destino: otras[0].id })
  if (!otras.some((x) => x.id === P.destino)) P.destino = otras[0].id
  const guardar = () => guardarLocal(clave, P.lineas)

  const destino = el('select', {}, otras.map((x) => el('option', { valor: x.id, selected: x.id === P.destino }, x.nombre)))
  destino.addEventListener('change', () => { P.destino = destino.value })
  const nota = el('input', { type: 'text', maxlength: '120', placeholder: 'Opcional: quién lo lleva…' })
  const zona = el('div', { clase: 'lista' })
  const resumen = el('div', { clase: 'sub', estilo: { margin: '6px 2px' } })
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto para agregar…', enterkeyhint: 'search' })
  const resultados = el('div', { clase: 'lista' })
  const tarjetaResultados = el('div', { clase: 'tarjeta sin-relleno', estilo: { display: 'none' } }, resultados)

  const agregar = (p) => {
    const ya = P.lineas.find((l) => l.productoId === p.id)
    if (ya) ya.cantidad += 1000
    else P.lineas.unshift({ productoId: p.id, descripcion: p.descripcion, codigo: (p.codigos || [])[0] || '', stock: p.stock || 0, cantidad: 1000 })
    guardar()
    busca.value = ''
    poner(resultados)
    tarjetaResultados.style.display = 'none'
    pintar()
    toast(p.descripcion + ' agregado', 'ok', 1.5)
  }
  const pintar = () => {
    poner(zona, P.lineas.length ? P.lineas.map((l, i) => {
      const cant = el('b', { clase: 'num' }, unidades(l.cantidad))
      const mover = (d) => { l.cantidad = Math.max(1000, l.cantidad + d); guardar(); pintar() }
      return el('div', { clase: 'item' },
        el('div', { clase: 'cuerpo' },
          el('b', {}, l.descripcion),
          el('div', { clase: 'sub' }, (l.codigo || 'sin código') + ' · hay ' + unidades(l.stock)),
          l.cantidad > l.stock ? el('div', { clase: 'sub ambar' }, 'Mandás más de lo que dice el sistema') : null),
        el('div', { clase: 'fin fila' },
          el('button', { clase: 'btn-ico', 'aria-label': 'Uno menos', onclick: () => l.cantidad <= 1000 ? (P.lineas.splice(i, 1), guardar(), pintar()) : mover(-1000) }, icono(l.cantidad <= 1000 ? 'basura' : 'restar')),
          cant,
          el('button', { clase: 'btn-ico', 'aria-label': 'Uno más', onclick: () => mover(1000) }, icono('sumar'))))
    }) : vacio('Escaneá o buscá lo que va a la otra sucursal.', 'pasar'))
    const u = P.lineas.reduce((a, l) => a + l.cantidad, 0)
    resumen.textContent = P.lineas.length ? P.lineas.length + (P.lineas.length === 1 ? ' producto · ' : ' productos · ') + unidades(u) + ' unidades' : ''
  }
  busca.addEventListener('input', () => {
    const q = busca.value.trim()
    tarjetaResultados.style.display = q.length < 2 ? 'none' : ''
    if (q.length < 2) return poner(resultados)
    const filas = lista.filter((p) => p.activo !== false && coincide(p.descripcion + ' ' + (p.codigos || []).join(' '), q)).slice(0, 12)
    poner(resultados, filas.length ? filas.map((p) => itemProducto(p, () => agregar(p))) : vacio('Nada coincide.', 'buscar'))
  })
  pintar()

  const mandar = async () => {
    if (!P.lineas.length) return toast('Agregá al menos un producto', 'mal')
    const nombre = nombreSucursal(destino.value)
    if (!confirm('¿Mandar ' + P.lineas.length + (P.lineas.length === 1 ? ' producto' : ' productos') + ' de ' + nombreSucursal(S.sucursal) + ' a ' + nombre + '?\n\nSale del stock de ' + nombreSucursal(S.sucursal) + ' y entra en ' + nombre + ' cuando esa caja se conecte.')) return
    await mandarOrden(S.sucursal, 'transferencia_salida', {
      destinoId: destino.value,
      destinoNombre: nombre,
      items: P.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
      nota: nota.value.trim()
    }, { texto: 'A ' + nombre, alTerminar: () => refrescarSeccion() })
    P.lineas = []
    guardar()
    pintar()
  }

  const envios = datosDe(tr) || []
  pintarSeccion('pasar',
    cabecera('Pasar a otra sucursal', 'De ' + nombreSucursal(S.sucursal) + ' a otra: sale de acá, entra allá'),
    el('div', { clase: 'tarjeta' },
      el('label', { clase: 'campo' }, 'A qué sucursal va', destino),
      el('label', { clase: 'campo' }, 'Nota', nota)),
    el('button', { clase: 'btn primario ancho grande', estilo: { marginBottom: '10px' }, onclick: async () => {
      const c = await leerCodigo({ titulo: 'Producto que va' })
      if (!c) return
      const r = await buscarCodigo(c).catch(() => ({}))
      if (r.producto) agregar(r.producto)
      else toast('Ese código no está en ' + nombreSucursal(S.sucursal), 'mal')
    } }, icono('escanear'), 'Escanear producto'),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    tarjetaResultados,
    el('h3', {}, 'Lo que va'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona),
    resumen,
    el('button', { clase: 'btn primario ancho grande', onclick: mandar }, icono('pasar'), 'Mandar'),
    el('h3', {}, 'Últimos envíos'),
    el('div', { clase: 'tarjeta sin-relleno' }, envios.length
      ? el('div', { clase: 'lista' }, envios.slice(0, 15).map((t) => el('div', { clase: 'item' },
        el('span', { clase: 'ico', estilo: { color: 'var(--texto3)' } }, icono('pasar')),
        el('div', { clase: 'cuerpo' },
          el('b', {}, (t.tipo === 'enviada' ? 'A ' : 'De ') + t.otra),
          el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, t.items.slice(0, 4).map((it) => unidades(it.cantidad) + ' ' + it.descripcion).join(' · ') + (t.items.length > 4 ? ' y ' + (t.items.length - 4) + ' más' : '')),
          el('div', { clase: 'sub' }, fechaHora(t.fecha) + (t.nota ? ' · ' + t.nota : '')),
          // Por que no entro (antes quedaba escondido) y que paso con la mercaderia.
          t.estado === 'error' ? el('div', { clase: 'sub rojo', estilo: { whiteSpace: 'normal' } }, 'No entró: ' + (t.error || 'la otra caja no lo pudo cargar') + (t.devuelta ? '. La mercadería volvió al stock de acá.' : '. Revisá el stock: no volvió solo.')) : null,
          (t.noEntraron || []).length ? el('div', { clase: 'sub ambar', estilo: { whiteSpace: 'normal' } }, 'Volvieron al stock de acá (allá no se pudieron cargar): ' + t.noEntraron.slice(0, 6).join(', ')) : null),
        el('span', { clase: 'chip ' + (t.tipo === 'recibida' || t.estado === 'recibida' ? 'ok' : t.estado === 'error' ? 'mal' : 'alerta'), title: t.error || '' }, t.tipo === 'recibida' ? 'Entró' : t.estado === 'recibida' ? 'Llegó' : t.estado === 'error' ? 'No entró' : 'En camino'))))
      : vacio('Todavía no hay envíos.', 'historial')))
}


seccion('productos', { nombre: 'Productos', icono: 'productos', grupo: 'principal', fn: secProductos })
seccion('stock', { nombre: 'Stock', icono: 'stock', grupo: 'mercaderia', fn: secStock })
seccion('pasar', { nombre: 'Pasar a otra sucursal', icono: 'pasar', grupo: 'mercaderia', fn: secPasar })

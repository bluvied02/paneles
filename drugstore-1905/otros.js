'use strict'
// REPONER, FALTANTES, PROMOS, CIERRES, AVISOS, AJUSTES Y "MAS".

// --- REPONER (el pedido a cada proveedor, por WhatsApp) -----------------------------

async function secReponer () {
  if (!S.sucursal) return pintarSeccion('reponer', cabecera('Reponer'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'reponer')))
  const E = S.rep2 = Object.assign({ vista: 'pedidos_compra', busca: '', ajustes: {}, agregados: {} }, S.rep2 || {})
  const pestanas = el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['pedidos_compra', 'Pedidos'], ['pedido_sugerido', 'Sugerido'], ['pedido_hoy', 'Lo de hoy'], ['pedido_semana', 'La semana']].map(([id, t]) => el('button', { clase: E.vista === id ? 'activo' : '', onclick: () => { E.vista = id; render() } }, t)))
  if (E.vista === 'pedidos_compra') return secPedidosCompra(E, pestanas)
  const datos = await leerDatos(E.vista)
  const p = datosDe(datos)
  const busca = el('input', { type: 'search', placeholder: 'Buscar un producto en el pedido…', valor: E.busca })
  const zona = el('div', {})
  const clave = (f) => S.sucursal + '|' + E.vista + '|' + f.productoId
  const cant = (f) => (E.ajustes[clave(f)] != null ? E.ajustes[clave(f)] : f.sugerido)
  const pintar = () => {
    limpiar(zona)
    const grupos = (p && p.grupos) || []
    let alguno = false
    for (const g of grupos) {
      const filas = g.filas.filter((f) => coincide(f.descripcion + ' ' + (f.codigo || ''), E.busca))
      if (!filas.length) continue
      alguno = true
      const texto = () => 'Pedido ' + S.negocio + ' (' + nombreSucursal(S.sucursal) + '):\n' + g.filas.filter((f) => cant(f) > 0).map((f) => unidades(cant(f)) + ' x ' + f.descripcion).join('\n')
      // Todo termina en un pedido guardado en la caja: queda en camino, cuenta
      // para el tope y se compara al recibir.
      const guardarEnCaja = (enviado) => mandarOrden(S.sucursal, 'pedido_guardar', { proveedorId: g.proveedorId, enviado, filas: g.filas.map((f) => ({ productoId: f.productoId, cantidad: cant(f), sugerido: f.sugerido })) }, { texto: 'Pedido a ' + g.nombre })
      const mandarWhatsApp = () => {
        window.open(linkWhatsApp(g.telefono, texto()), '_blank')
        if (!g.proveedorId) return
        abrirHoja({
          titulo: '¿Se mandó el pedido?',
          cuerpo: el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Si lo mandaste por WhatsApp a ' + g.nombre + ', confirmalo así queda guardado y como enviado en la caja.'),
          botones: [{ texto: 'Sí, quedó enviado', primario: true, alTocar: (cerrar) => { cerrar(); guardarEnCaja(true) } }]
        })
      }
      zona.append(el('div', { clase: 'tarjeta sin-relleno' },
        el('div', { clase: 'tarjeta-cab', estilo: { padding: '12px 16px 4px' } },
          el('div', {}, el('h2', { estilo: { margin: 0 } }, g.nombre), el('div', { clase: 'sub' }, g.filas.length + ' productos' + (g.telefono ? ' · ' + g.telefono : ' · sin teléfono'))),
          el('div', { clase: 'chips' },
            el('a', { clase: 'btn primario chico', href: '#', onclick: (ev) => { ev.preventDefault(); mandarWhatsApp() } }, icono('mensaje'), 'WhatsApp'),
            el('button', { clase: 'btn chico', onclick: async () => { try { await navigator.clipboard.writeText(texto()); toast('Pedido copiado', 'ok') } catch (e) { toast('No se pudo copiar', 'mal') } } }, 'Copiar'),
            // Si ya hay un pedido armado de ese proveedor, la caja lo actualiza (no hace otro).
            g.proveedorId ? el('button', { clase: 'btn chico', onclick: () => guardarEnCaja(false) }, g.borrador ? 'Actualizar ' + g.borrador : 'Guardar pedido') : null)),
        el('div', { clase: 'lista' }, filas.map((f) => {
          const inp = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(cant(f)), estilo: { width: '76px', textAlign: 'right', minHeight: '40px', padding: '8px 10px' } })
          inp.addEventListener('input', () => { const n = aMilesimas(inp.value); if (Number.isFinite(n)) E.ajustes[clave(f)] = Math.max(0, n) })
          return el('div', { clase: 'item' },
            el('div', { clase: 'cuerpo' }, el('b', {}, f.descripcion), el('div', { clase: 'sub' }, 'hay ' + unidades(f.stock) + (f.vendido != null ? ' · vendido ' + unidades(f.vendido) : f.vendidas != null ? ' · vendido ' + unidades(f.vendidas) : '') + (f.estado === 'urgente' ? ' · urgente' : ''))),
            inp)
        }))))
    }
    if (!alguno) zona.append(el('div', { clase: 'tarjeta' }, vacio(!grupos.length ? (E.vista === 'pedido_hoy' ? 'Todavía no se vendió nada hoy.' : 'Nada para pedir.') : 'Nada coincide.', 'reponer')))
  }
  busca.addEventListener('input', () => { E.busca = busca.value; pintar() })
  pintar()
  pintarSeccion('reponer',
    cabecera('Reponer', nombreSucursal(S.sucursal) + ' · el pedido a cada proveedor'),
    pestanas,
    el('p', { clase: 'sub' }, E.vista === 'pedido_sugerido' ? 'Lo que conviene pedir para llegar a la próxima visita del proveedor.' : 'Se repone lo mismo que se vendió. Cambiá las cantidades y mandalo por WhatsApp.'),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    zona)
}

// Los pedidos guardados en la caja: los que armo el sistema el dia de visita,
// los enviados esperando la mercaderia y los ultimos. Se corrigen y se mandan
// por WhatsApp desde aca; la caja los guarda (ordenes pedido_guardar/estado).
async function secPedidosCompra (E, pestanas) {
  const p = datosDe(await leerDatos('pedidos_compra'))
  const zona = el('div', {})
  const fecha = (iso) => iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : ''
  if (!p) {
    zona.append(el('div', { clase: 'tarjeta' }, vacio('La caja todavía no subió los pedidos. Necesita la versión 0.44 o más nueva.', 'reponer')))
  } else {
    if (p.agenda && p.agenda.length) {
      zona.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Quién pasa'),
        el('div', { clase: 'lista' }, p.agenda.map((a) => el('div', { clase: 'item' },
          el('div', { clase: 'cuerpo' }, el('b', {}, a.nombre), el('div', { clase: 'sub' }, a.pedido ? 'Pedido ' + a.pedido.numero + ' · ' + ({ borrador: 'para revisar', enviado: 'enviado', recibido: 'llegó', cancelado: 'cancelado' })[a.pedido.estado] : a.cuando === 'hoy' ? 'Sin nada para pedir' : 'Se arma solo mañana')),
          el('span', { clase: 'chip ' + (a.cuando === 'hoy' ? 'info' : '') }, a.cuando === 'hoy' ? 'Hoy' : 'Mañana'))))))
    }
    const borradores = p.pedidos.filter((x) => x.estado === 'borrador')
    const enviados = p.pedidos.filter((x) => x.estado === 'enviado')
    const viejos = p.pedidos.filter((x) => x.estado === 'recibido' || x.estado === 'cancelado').slice(0, 10)
    const tarjeta = (x) => {
      const editable = x.estado === 'borrador'
      const clave = (f) => 'ped|' + x.id + '|' + f.productoId
      const cant = (f) => (E.ajustes[clave(f)] != null ? E.ajustes[clave(f)] : f.cantidad)
      // Lo agregado desde aca que la caja todavia no guardo.
      const agregados = E.agregados[x.id] = (E.agregados[x.id] || []).filter((a) => !x.filas.some((f) => f.productoId === a.productoId))
      const todas = () => x.filas.concat(agregados)
      const cambiado = () => todas().some((f) => cant(f) !== f.cantidad)
      const texto = () => 'Pedido ' + x.numero + ' de ' + S.negocio + ' (' + nombreSucursal(S.sucursal) + ') para ' + x.proveedorNombre + ':\n\n' +
        todas().filter((f) => cant(f) > 0).map((f) => '• ' + unidades(cant(f)) + ' ' + f.descripcion + (f.unidadesPorBulto > 1 && cant(f) % (f.unidadesPorBulto * 1000) === 0 ? ' (' + (cant(f) / 1000 / f.unidadesPorBulto) + ' x ' + f.unidadesPorBulto + ')' : '')).join('\n') + '\n\nGracias!'
      const guardar = () => mandarOrden(S.sucursal, 'pedido_guardar', { id: x.id, filas: todas().map((f) => ({ productoId: f.productoId, cantidad: cant(f), sugerido: f.sugerido })) }, { texto: 'Pedido ' + x.numero, callado: true })
      // Agregar lo que el sistema no propuso: se escanea o se busca. Queda en
      // el pedido de aca hasta tocar Guardar (o mandarlo).
      const agregar = async () => {
        const lista = await leerCatalogo(S.sucursal).catch(() => [])
        const elegir = (prod) => {
          cerrarHoja()
          if (todas().some((f) => f.productoId === prod.id)) return toast('Ya está en el pedido', '', 2)
          const bulto = Number(prod.bulto) > 1 ? Number(prod.bulto) : 1
          agregados.push({ productoId: prod.id, descripcion: prod.descripcion, codigo: (prod.codigos || [])[0] || '', cantidad: 0, sugerido: 0, unidadesPorBulto: bulto, stock: prod.stock, vendidas: prod.vendido30 })
          E.ajustes[clave({ productoId: prod.id })] = bulto * 1000
          render()
          toast('Agregado. Tocá Guardar para mandarlo a la caja.', 'ok', 3)
        }
        abrirHoja({
          titulo: 'Agregar al ' + x.numero,
          completa: true,
          cuerpo: el('div', {},
            el('button', { clase: 'btn primario ancho', estilo: { margin: '0 0 8px' }, onclick: async () => {
              const c = await leerCodigo({ titulo: 'Producto para el pedido' })
              if (!c) return
              const r = await buscarCodigo(c, S.sucursal).catch(() => ({}))
              if (r.producto) elegir(r.producto)
              else toast('Ese código no está en el catálogo', 'mal')
            } }, icono('escanear'), 'Escanear producto'),
            buscadorParaAgregar(lista, elegir))
        })
      }
      // El automatico se armo temprano: la caja lo vuelve a calcular con el
      // stock de ahora. Lo cambiado o agregado a mano queda igual.
      const recalcular = async () => {
        if (cambiado()) await guardar()
        await mandarOrden(S.sucursal, 'pedido_recalcular', { id: x.id }, { texto: 'Recalcular ' + x.numero })
        // Los numeros nuevos los trae la caja; lo recien agregado queda a la vista.
        for (const f of x.filas) delete E.ajustes[clave(f)]
        render()
      }
      // Lo mismo que el sugerido: cuanto hay, lo vendido y para cuantos dias alcanza.
      const info = (f) => {
        const linea1 = f.stock != null
          ? ['hay ' + unidades(f.stock), f.vendidas != null ? 'vendió ' + unidades(f.vendidas) + ' en 30 días' : null, f.alcanzaDias != null ? 'alcanza ' + String(f.alcanzaDias).replace('.', ',') + ' d' : null].filter(Boolean).join(' · ')
          : (f.codigo || 'sin código')
        const linea2 = [!f.sugerido ? 'agregado a mano' : f.sugerido !== f.cantidad ? 'sugerido ' + unidades(f.sugerido) : null, f.diasSinStock > 0 ? f.diasSinStock + (f.diasSinStock === 1 ? ' día' : ' días') + ' sin stock (no cuentan)' : null, f.enCamino > 0 ? unidades(f.enCamino) + ' en camino' : null, f.unidadesPorBulto > 1 ? 'caja de ' + f.unidadesPorBulto : null].filter(Boolean).join(' · ')
        return [el('div', { clase: 'sub', estilo: Object.assign({ whiteSpace: 'normal' }, f.stock != null && f.stock <= 0 ? { color: 'var(--rojo)' } : null) }, linea1), linea2 ? el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, linea2) : null]
      }
      const mandar = async () => {
        if (cambiado()) await guardar()
        window.open(linkWhatsApp(p.telefonos[x.proveedorId], texto()), '_blank')
        abrirHoja({
          titulo: '¿Se mandó el pedido?',
          cuerpo: el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Si lo mandaste por WhatsApp a ' + x.proveedorNombre + ', confirmalo así queda como enviado en la caja.'),
          botones: [{ texto: 'Sí, quedó enviado', primario: true, alTocar: (cerrar) => { cerrar(); mandarOrden(S.sucursal, 'pedido_estado', { id: x.id, estado: 'enviado' }, { texto: 'Pedido ' + x.numero + ' enviado' }) } }]
        })
      }
      const cancelar = () => {
        const motivo = el('input', { type: 'text', placeholder: 'Ej: no tenía nada, lo pedí a otro' })
        abrirHoja({
          titulo: 'Cancelar el pedido ' + x.numero,
          cuerpo: el('div', {}, el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'No se borra: queda como cancelado, con el motivo, y se puede deshacer en la caja.'), el('label', { clase: 'campo' }, '¿Por qué se cancela?', motivo)),
          botones: [{ texto: 'Cancelar pedido', peligro: true, alTocar: (cerrar) => {
            if (!motivo.value.trim()) return toast('Poné el motivo', 'mal')
            cerrar()
            mandarOrden(S.sucursal, 'pedido_estado', { id: x.id, estado: 'cancelado', motivo: motivo.value.trim() })
          } }]
        })
      }
      // "No tengo de 2 L, te mando 1,5": el pedido mandado se ajusta a lo que
      // confirmo el proveedor. Sigue enviado.
      const ajustar = async () => {
        const lineas = x.filas.map((f) => ({ productoId: f.productoId, descripcion: f.descripcion, pedido: f.cantidad, cantidad: f.cantidad }))
        const zonaLineas = el('div', { clase: 'lista' })
        const pintarLineas = () => poner(zonaLineas, lineas.map((l) => {
          const inp = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(l.cantidad), estilo: { width: '76px', textAlign: 'right', minHeight: '40px', padding: '8px 10px' } })
          inp.addEventListener('input', () => { const n = aMilesimas(inp.value); if (Number.isFinite(n)) l.cantidad = Math.max(0, n) })
          return el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, l.descripcion), el('div', { clase: 'sub' }, l.pedido ? 'pediste ' + unidades(l.pedido) : 'nuevo')), inp)
        }))
        pintarLineas()
        const catalogo = await leerCatalogo(S.sucursal).catch(() => [])
        const sumar = (prod) => {
          if (lineas.some((l) => l.productoId === prod.id)) return toast('Ya está en el pedido', '', 2)
          const bulto = Number(prod.bulto) > 1 ? Number(prod.bulto) : 1
          lineas.push({ productoId: prod.id, descripcion: prod.descripcion, pedido: 0, cantidad: bulto * 1000 })
          pintarLineas()
        }
        abrirHoja({
          titulo: 'Ajustar ' + x.numero + ' a lo que confirmó',
          completa: true,
          cuerpo: el('div', {},
            el('p', { clase: 'sub', estilo: { whiteSpace: 'normal', margin: '0 0 8px' } }, 'Poné lo que ' + x.proveedorNombre + ' dijo que manda. En 0, no viene. Sigue como enviado.'),
            zonaLineas,
            el('p', { clase: 'sub', estilo: { margin: '12px 0 6px' } }, 'Lo que manda en cambio:'),
            buscadorParaAgregar(catalogo, sumar)),
          botones: [{ texto: 'Guardar ajuste', primario: true, alTocar: (cerrar) => { cerrar(); mandarOrden(S.sucursal, 'pedido_ajustar', { id: x.id, filas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })) }, { texto: 'Ajustar ' + x.numero }) } }]
        })
      }
      // Llego: se abre Recibir con lo pedido cargado, para que entre el stock y
      // se compare con lo que vino.
      const recibir = () => ir('recibir', { pedidoId: x.id })
      return el('div', { clase: 'tarjeta sin-relleno' },
        el('div', { clase: 'tarjeta-cab', estilo: { padding: '12px 16px 4px' } },
          el('div', {}, el('h2', { estilo: { margin: 0 } }, x.proveedorNombre),
            el('div', { clase: 'sub' }, x.numero + ' · ' + (x.restoDe ? 'lo que faltó de una entrega' : x.automatico ? 'lo armó el sistema' : 'armado a mano') + ' · ' + fecha(x.creadoEn) + (x.enviadoEn && !x.restoDe ? ' · enviado ' + fecha(x.enviadoEn) : '') + (x.ajustadoEn ? ' · ajustado' : '') + (p.telefonos[x.proveedorId] ? '' : ' · sin teléfono')),
            x.atrasado ? el('div', { clase: 'sub', estilo: { whiteSpace: 'normal', color: 'var(--rojo)' } }, 'Atrasado: ya no cuenta como en camino. Si llegó, recibilo; si no viene, cancelalo.') : null),
          el('div', { clase: 'chips' },
            editable ? el('button', { clase: 'btn primario chico', onclick: mandar }, icono('mensaje'), 'WhatsApp') : null,
            editable ? el('button', { clase: 'btn chico', onclick: () => { if (!cambiado()) return toast('No cambiaste nada', '', 2); guardar().then(() => toast('Cambios mandados a la caja', 'ok')) } }, 'Guardar') : null,
            editable ? el('button', { clase: 'btn chico', onclick: recalcular }, 'Recalcular') : null,
            x.estado === 'enviado' && seccionPermitida('recibir') && puede('recibir') ? el('button', { clase: 'btn primario chico', onclick: recibir }, 'Llegó: recibir') : null,
            x.estado === 'enviado' ? el('button', { clase: 'btn chico', onclick: ajustar }, 'Ajustar') : null,
            el('button', { clase: 'btn chico', onclick: cancelar }, 'Cancelar'))),
        el('div', { clase: 'lista' }, (editable ? todas() : x.filas).map((f) => {
          if (!editable) return el('div', { clase: 'item' }, el('div', { clase: 'cuerpo' }, el('b', {}, f.descripcion)), el('b', { clase: 'num' }, unidades(f.cantidad)))
          const inp = el('input', { type: 'text', inputmode: 'decimal', valor: unidades(cant(f)), estilo: { width: '76px', textAlign: 'right', minHeight: '40px', padding: '8px 10px' } })
          inp.addEventListener('input', () => { const n = aMilesimas(inp.value); if (Number.isFinite(n)) E.ajustes[clave(f)] = Math.max(0, n) })
          return el('div', { clase: 'item' },
            el('div', { clase: 'cuerpo' }, el('b', {}, f.descripcion), ...info(f)),
            inp)
        })),
        editable ? el('div', { estilo: { padding: '4px 16px 14px' } }, el('button', { clase: 'btn chico', onclick: agregar }, icono('sumar'), 'Agregar producto')) : null)
    }
    if (borradores.length) zona.append(el('h2', { estilo: { margin: '14px 4px 6px' } }, 'Para revisar y mandar'), ...borradores.map(tarjeta))
    if (enviados.length) zona.append(el('h2', { estilo: { margin: '14px 4px 6px' } }, 'Esperando la mercadería'), ...enviados.map(tarjeta))
    if (!borradores.length && !enviados.length) zona.append(el('div', { clase: 'tarjeta' }, vacio('No hay pedidos pendientes. El día que pasa cada proveedor se arma solo (los días se cargan en la caja, en Proveedores).', 'reponer')))
    if (viejos.length) {
      zona.append(el('div', { clase: 'tarjeta' }, el('h2', {}, 'Últimos'),
        el('div', { clase: 'lista' }, viejos.map((x) => el('div', { clase: 'item' },
          el('div', { clase: 'cuerpo' }, el('b', {}, x.proveedorNombre), el('div', { clase: 'sub' }, x.numero + ' · ' + fecha(x.creadoEn))),
          el('span', { clase: 'chip ' + (x.estado === 'cancelado' ? '' : x.cumplimiento && x.cumplimiento.pct < 100 ? 'alerta' : 'ok') },
            x.estado === 'cancelado' ? 'Cancelado' : x.cumplimiento ? (x.cumplimiento.pct < 100 ? 'Llegó ' + x.cumplimiento.completas + ' de ' + x.cumplimiento.renglones : 'Completo') : 'Llegó'))))))
    }
  }
  pintarSeccion('reponer',
    cabecera('Reponer', nombreSucursal(S.sucursal) + ' · pedidos a proveedores', el('button', { clase: 'btn primario', onclick: () => hojaPedidoNuevo() }, icono('sumar'), 'Pedido nuevo')),
    pestanas,
    zona)
}

// Un pedido desde cero a un proveedor (uno que no salio en el sugerido, o
// para agregarle cosas antes del dia de visita). Si ya hay uno armado de ese
// proveedor, la caja le suma a ese (no hace otro).
async function hojaPedidoNuevo (proveedorId, nombreProveedor) {
  const suc = S.sucursal
  const [cat, provs] = await Promise.all([leerCatalogo(suc).catch(() => []), proveedorId ? Promise.resolve(null) : leerDatos('proveedores').catch(() => ({}))])
  const lista = (datosDe(provs || {}) || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const prov = el('select', {}, el('option', { valor: '' }, 'Elegí el proveedor…'), lista.map((x) => el('option', { valor: x.id }, x.nombre)))
  const lineas = []
  const zona = el('div', { clase: 'lista' })
  const pintar = () => poner(zona, lineas.length ? lineas.map((l, i) => el('div', { clase: 'item' },
    el('div', { clase: 'cuerpo' }, el('b', {}, l.descripcion), el('div', { clase: 'sub' }, 'hay ' + unidades(l.stock) + (l.bulto > 1 ? ' · caja de ' + l.bulto : ''))),
    el('div', { clase: 'fin pila' }, campoCantidad(l, pintar), el('button', { clase: 'btn chico', onclick: () => { lineas.splice(i, 1); pintar() } }, 'Sacar'))))
    : vacio('Agregá lo que le vas a pedir.', 'reponer'))
  const agregar = (p) => {
    if (lineas.some((l) => l.productoId === p.id)) return toast('Ya está en el pedido', '', 2)
    const bulto = Number(p.bulto) > 1 ? Number(p.bulto) : 1
    lineas.unshift({ productoId: p.id, descripcion: p.descripcion, stock: p.stock || 0, bulto, cantidad: bulto * 1000 })
    pintar()
  }
  // Primero lo de ese proveedor (lo que mas se vende).
  const delProveedor = () => cat.filter((p) => p.activo !== false && p.proveedorId === (proveedorId || prov.value))
  pintar()
  abrirHoja({
    titulo: 'Pedido nuevo' + (nombreProveedor ? ' a ' + nombreProveedor : ''),
    completa: true,
    cuerpo: el('div', {},
      proveedorId ? null : el('label', { clase: 'campo' }, 'Proveedor', prov),
      el('button', { clase: 'btn ancho', estilo: { margin: '0 0 8px' }, onclick: async () => {
        const c = await leerCodigo({ titulo: 'Producto para el pedido' })
        if (!c) return
        const p = cat.find((x) => (x.codigos || []).includes(c))
        if (p) agregar(p)
        else toast('Ese código no está en el catálogo', 'mal')
      } }, icono('escanear'), 'Escanear producto'),
      buscadorParaAgregar(cat, agregar),
      el('button', { clase: 'btn chico', estilo: { margin: '8px 0' }, onclick: () => {
        const sugeridos = delProveedor().filter((p) => p.minimo > 0 ? p.stock < p.minimo : p.stock <= 0).sort((a, b) => b.vendido30 - a.vendido30).slice(0, 40)
        if (!sugeridos.length) return toast('De ese proveedor no falta nada (stock bajo el mínimo o en cero)', '', 3)
        for (const p of sugeridos) if (!lineas.some((l) => l.productoId === p.id)) lineas.push({ productoId: p.id, descripcion: p.descripcion, stock: p.stock || 0, bulto: Number(p.bulto) > 1 ? Number(p.bulto) : 1, cantidad: (Number(p.bulto) > 1 ? Number(p.bulto) : 1) * 1000 })
        pintar()
      } }, 'Agregar lo que le falta de ese proveedor'),
      el('div', { clase: 'tarjeta sin-relleno' }, zona)),
    botones: [{ texto: 'Guardar pedido', primario: true, alTocar: async (cerrar) => {
      const provId = proveedorId || prov.value
      if (!provId) return toast('Elegí el proveedor', 'mal')
      const filas = lineas.filter((l) => l.cantidad > 0).map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, sugerido: 0 }))
      if (!filas.length) return toast('Agregá al menos un producto', 'mal')
      cerrar()
      await mandarOrden(suc, 'pedido_guardar', { proveedorId: provId, filas }, { texto: 'Pedido a ' + (nombreProveedor || (prov.selectedOptions[0] || {}).textContent || 'proveedor'), alTerminar: () => { if (S.seccion === 'reponer') refrescarSeccion() } })
      toast('Cuando la caja lo guarde aparece en Reponer → Pedidos, para mandarlo por WhatsApp.', '', 5)
    } }]
  })
}

// --- FALTANTES ------------------------------------------------------------------------

async function secFaltantes () {
  if (!S.sucursal) return pintarSeccion('faltantes', cabecera('Faltantes'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'faltantes')))
  const [datos, cat] = await Promise.all([leerDatos('faltantes'), leerCatalogo(S.sucursal).catch(() => [])])
  const lista = datosDe(datos) || []
  const busca = el('input', { type: 'search', placeholder: 'Buscar…' })
  const zona = el('div', { clase: 'lista' })
  const pintar = () => {
    const filas = lista.filter((p) => coincide(p.descripcion + ' ' + p.codigo + ' ' + p.proveedor + ' ' + p.familia, busca.value))
    poner(zona, filas.length ? filas.map((p) => {
      const completo = cat.find((x) => x.id === p.id) || Object.assign({ codigos: [p.codigo], precio: 0, activo: true }, p)
      return el('div', { clase: 'item tocable', onclick: () => hojaAjusteStock(completo) },
        el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion), el('div', { clase: 'sub' }, [p.proveedor || 'sin proveedor', p.vendido30 ? 'vendió ' + unidades(p.vendido30) + ' en 30 días' : ''].filter(Boolean).join(' · '))),
        el('div', { clase: 'fin' }, el('b', { clase: 'num ' + (p.stock < 0 ? 'rojo' : 'ambar') }, unidades(p.stock)), el('div', { clase: 'sub' }, p.minimo ? 'mínimo ' + unidades(p.minimo) : 'en negativo')))
    }) : vacio(lista.length ? 'Nada coincide.' : 'No falta nada: nada en negativo ni bajo el mínimo.', 'faltantes'))
  }
  busca.addEventListener('input', pintar)
  pintar()
  const negativos = lista.filter((p) => p.stock < 0).length
  pintarSeccion('faltantes',
    cabecera('Faltantes', nombreSucursal(S.sucursal) + ' · ' + negativos + ' en negativo · ' + (lista.length - negativos) + ' bajo el mínimo', el('button', { clase: 'btn', onclick: () => ir('reponer') }, icono('reponer'), 'Hacer pedido')),
    el('div', { clase: 'buscador' }, icono('buscar'), busca),
    el('p', { clase: 'sub' }, 'Primero lo que está en negativo (se vendió más de lo que el sistema tenía). Tocá uno para corregir el stock.'),
    el('div', { clase: 'tarjeta sin-relleno' }, zona))
}

// --- PROMOS -----------------------------------------------------------------------------
// Las mismas promos que la caja: ver, crear, EDITAR, duplicar, pausar y borrar. Los seis tipos
// (% off, $ menos, precio fijo, lleva N paga M, llevando uno descuento en otro y combos),
// con días, fechas y horario. Los valores van como los guarda la caja: porcentaje en
// centésimas (10% = 1000), pesos en centavos.

const TIPOS_PROMO_HOJA = [['porcentaje', '% off'], ['descuento', '$ menos'], ['precio', 'Precio fijo'], ['nxm', 'Lleva N paga M'], ['llevando', 'Llevando uno…'], ['combo', 'Combo']]

async function secPromos () {
  if (!S.sucursal) return pintarSeccion('promos', cabecera('Promos'), el('div', { clase: 'tarjeta' }, vacio('Todavía no hay sucursales conectadas.', 'promos')))
  const lista = datosDe(await leerDatos('promos')) || []
  const E = S.pro = Object.assign({ filtro: 'todas' }, S.pro || {})
  const estado = (p) => (!p.activa ? el('span', { clase: 'chip' }, 'Pausada') : p.vencida ? el('span', { clase: 'chip' }, 'Vencida') : p.vigenteAhora ? el('span', { clase: 'chip ok' }, '● Aplicándose') : el('span', { clase: 'chip alerta' }, 'Programada'))
  const cuantas = { todas: lista.length, ahora: lista.filter((p) => p.activa && p.vigenteAhora).length, pausadas: lista.filter((p) => !p.activa).length }
  const visibles = lista.filter((p) => E.filtro === 'todas' || (E.filtro === 'ahora' && p.activa && p.vigenteAhora) || (E.filtro === 'pausadas' && !p.activa))
  const otras = S.sucursales.filter((x) => x.id !== S.sucursal)
  pintarSeccion('promos',
    cabecera('Promos', nombreSucursal(S.sucursal) + ' · ' + cuantas.ahora + ' aplicándose', el('button', { clase: 'btn primario', onclick: () => hojaPromo(S.sucursal) }, icono('sumar'), 'Nueva')),
    el('div', { clase: 'seg ancho', estilo: { marginBottom: '10px' } }, [['todas', 'Todas ' + cuantas.todas], ['ahora', 'Aplicándose ' + cuantas.ahora], ['pausadas', 'Pausadas ' + cuantas.pausadas]].map(([id, t]) => el('button', { clase: E.filtro === id ? 'activo' : '', onclick: () => { E.filtro = id; render() } }, t))),
    el('div', { clase: 'tarjeta sin-relleno' }, visibles.length ? el('div', { clase: 'lista' }, visibles.map((p) => el('div', { clase: 'item' },
      el('button', { clase: 'cuerpo', estilo: { background: 'none', border: 0, textAlign: 'left', padding: 0, color: 'inherit', cursor: 'pointer' }, onclick: () => hojaPromo(S.sucursal, p) },
        el('b', {}, p.nombre), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, [p.etiqueta, p.tipo === 'combo' ? p.textoComponentes : p.textoAlcance, p.textoDisparador ? 'llevando ' + p.textoDisparador : '', p.textoVigencia, p.tipo !== 'combo' ? p.productos + ' productos' : ''].filter(Boolean).join(' · '))),
      el('div', { clase: 'fin' }, estado(p), el('div', { clase: 'chips', estilo: { marginTop: '6px', justifyContent: 'flex-end' } },
        el('button', { clase: 'btn chico', onclick: () => hojaPromo(S.sucursal, p) }, 'Editar'),
        el('button', { clase: 'btn chico', onclick: () => mandarOrden(S.sucursal, 'promo_estado', { promoId: p.id, activa: !p.activa }, { texto: (p.activa ? 'Pausar ' : 'Activar ') + p.nombre, alTerminar: refrescarSeccion }) }, p.activa ? 'Pausar' : 'Activar'),
        el('button', { clase: 'btn chico', onclick: () => hojaPromo(S.sucursal, p, true) }, 'Duplicar'),
        el('button', { clase: 'btn chico peligro', onclick: () => { if (confirm('¿Borrar "' + p.nombre + '"? Las ventas que ya la usaron no cambian.')) mandarOrden(S.sucursal, 'promo_borrar', { promoId: p.id }, { texto: 'Borrar ' + p.nombre, alTerminar: refrescarSeccion }) } }, 'Borrar')))))) : vacio(lista.length ? 'No hay promos en este filtro.' : 'No hay promociones en esta sucursal.', 'promos')),
    otras.length ? el('p', { clase: 'sub' }, 'Cada sucursal tiene sus promos: cambiá de sucursal arriba para ver o editar las de las otras.') : null)
}

// Elige productos y/o familias. `sel` = { productoIds: [], rubroIds: [] } (se modifica).
function selectorProductos (lista, rubros, sel, opciones = {}) {
  const ruta = (id) => { const x = []; let r = rubros.find((y) => y.id === id); let n = 0; while (r && n++ < 6) { x.unshift(r.nombre); r = rubros.find((y) => y.id === r.padreId) } return x.join(' › ') }
  const busca = el('input', { type: 'search', placeholder: 'Buscar producto…' })
  const resultados = el('div', { clase: 'lista' })
  const chips = el('div', { clase: 'chips', estilo: { margin: '8px 0' } })
  const selRubro = selectorRubro(rubros, '')
  selRubro.firstChild.textContent = 'Agregar una familia…'
  const pintar = () => {
    const nombre = (id) => (lista.find((p) => p.id === id) || {}).descripcion || id
    const quitar = (arr, id) => el('button', { estilo: { background: 'none', border: 0, cursor: 'pointer', color: 'inherit', padding: '0 0 0 4px' }, 'aria-label': 'Quitar', onclick: () => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); pintar() } }, '×')
    poner(chips,
      sel.productoIds.map((id) => el('span', { clase: 'chip info' }, nombre(id), quitar(sel.productoIds, id))),
      sel.rubroIds.map((id) => el('span', { clase: 'chip info' }, 'Familia: ' + ruta(id), quitar(sel.rubroIds, id))))
  }
  busca.addEventListener('input', () => {
    limpiar(resultados)
    if (busca.value.trim().length < 2) return
    for (const p of lista.filter((x) => x.activo !== false && coincide(x.descripcion + ' ' + (x.codigos || []).join(' '), busca.value)).slice(0, 8)) {
      resultados.append(el('button', { clase: 'item', onclick: () => { if (!sel.productoIds.includes(p.id)) sel.productoIds.push(p.id); busca.value = ''; limpiar(resultados); pintar() } },
        el('div', { clase: 'cuerpo' }, el('b', {}, p.descripcion)), el('span', { clase: 'num sub' }, plata(p.precio))))
    }
  })
  selRubro.addEventListener('change', () => { if (selRubro.value && !sel.rubroIds.includes(selRubro.value)) sel.rubroIds.push(selRubro.value); selRubro.value = ''; pintar() })
  pintar()
  return el('div', {}, el('div', { clase: 'buscador' }, icono('buscar'), busca), resultados, opciones.sinFamilias ? null : el('div', { estilo: { marginTop: '8px' } }, selRubro), chips)
}

// previa: la promo que se edita (o se duplica). Sin previa, una nueva.
async function hojaPromo (sucursalId, previa, duplicar) {
  const [lista, rubrosD] = await Promise.all([leerCatalogo(sucursalId), leerDatos('rubros')])
  const rubros = datosDe(rubrosD, sucursalId) || []
  const edita = !!previa && !duplicar
  const p0 = previa || {}
  const centavosATexto = (c) => c ? String(c / 100).replace('.', ',') : ''
  const nombre = el('input', { type: 'text', placeholder: 'Ej: Finde bebidas 10%', maxlength: '60', valor: duplicar ? p0.nombre + ' (copia)' : (p0.nombre || '') })
  let tipo = p0.tipo || 'porcentaje'
  let alcance = p0.alcance === 'todo' || p0.alcance === 'rubros' || p0.alcance === 'productos' ? p0.alcance : 'productos'
  let activa = previa ? p0.activa !== false : true
  const sel = { productoIds: (p0.productoIds || []).slice(), rubroIds: (p0.rubroIds || []).slice() }
  const disp = { productoIds: ((p0.disparador || {}).productoIds || []).slice(), rubroIds: ((p0.disparador || {}).rubroIds || []).slice() }
  const comps = (p0.componentes || []).map((c) => ({ nombre: c.nombre, cantidad: c.cantidad, productoIds: (c.productoIds || []).slice(), rubroIds: (c.rubroIds || []).slice() }))
  const valor = el('input', { type: 'text', inputmode: 'decimal', valor: ['porcentaje', 'llevando', 'descuento', 'precio'].includes(p0.tipo) ? centavosATexto(p0.valor) : '' })
  const lleva = el('input', { type: 'number', valor: String(p0.lleva || 3), min: '2' })
  const paga = el('input', { type: 'number', valor: String(p0.paga || 2), min: '1' })
  const mezclar = el('input', { type: 'checkbox' })
  mezclar.checked = !!p0.mezclar
  const precioCombo = el('input', { type: 'text', inputmode: 'decimal', valor: p0.tipo === 'combo' ? centavosATexto(p0.precio) : '' })
  const nombreDisp = el('input', { type: 'text', maxlength: '30', placeholder: 'Sale en el ticket (opcional)', valor: p0.nombreDisparador || '' })
  const desde = el('input', { type: 'date', valor: p0.desde || '' })
  const hasta = el('input', { type: 'date', valor: p0.hasta || '' })
  const horaDesde = el('input', { type: 'time', valor: p0.horaDesde || '' })
  const horaHasta = el('input', { type: 'time', valor: p0.horaHasta || '' })
  const dias = new Set(p0.dias && p0.dias.length ? p0.dias : [0, 1, 2, 3, 4, 5, 6])

  const segTipo = el('div', { clase: 'seg', estilo: { flexWrap: 'wrap' } })
  const zonaValor = el('div', {})
  const zonaAlcance = el('div', {})
  const pintar = () => {
    poner(segTipo, TIPOS_PROMO_HOJA.map(([id, t]) => el('button', { clase: tipo === id ? 'activo' : '', onclick: () => { tipo = id; pintar() } }, t)))
    if (tipo === 'combo') {
      const zonaComps = el('div', {})
      const pintarComps = () => poner(zonaComps, comps.map((c, i) => {
        const n = el('input', { type: 'text', placeholder: 'Qué es (ej: Monster)', maxlength: '40', valor: c.nombre || '' })
        n.addEventListener('input', () => { c.nombre = n.value })
        const q = el('input', { type: 'number', min: '1', valor: String(c.cantidad || 1) })
        q.addEventListener('input', () => { c.cantidad = Number(q.value) })
        return el('div', { clase: 'tarjeta', estilo: { marginBottom: '8px' } },
          el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Producto del combo', n), el('label', { clase: 'campo' }, 'Cantidad', q)),
          selectorProductos(lista, rubros, c),
          el('button', { clase: 'btn chico peligro', onclick: () => { comps.splice(i, 1); pintarComps() } }, 'Sacar este producto'))
      }))
      if (!comps.length) comps.push({ nombre: '', cantidad: 1, productoIds: [], rubroIds: [] })
      pintarComps()
      poner(zonaValor, el('label', { clase: 'campo' }, 'Precio del combo ($)', precioCombo), zonaComps,
        el('button', { clase: 'btn chico', onclick: () => { comps.push({ nombre: '', cantidad: 1, productoIds: [], rubroIds: [] }); pintarComps() } }, icono('sumar'), 'Agregar otro producto'))
      poner(zonaAlcance)
      return
    }
    poner(zonaValor, tipo === 'nxm'
      ? [el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Lleva', lleva), el('label', { clase: 'campo' }, 'Paga', paga)), el('label', { clase: 'campo', estilo: { display: 'flex', gap: '8px', alignItems: 'center' } }, mezclar, 'Se puede mezclar entre productos distintos')]
      : el('label', { clase: 'campo' }, tipo === 'porcentaje' ? 'Descuento (%)' : tipo === 'llevando' ? 'Descuento en lo que se lleva (%)' : tipo === 'precio' ? 'Precio fijo por unidad ($)' : 'Pesos menos por unidad ($)', valor))
    const segAlcance = el('div', { clase: 'seg' }, [['productos', 'Productos'], ['rubros', 'Familias'], ['todo', 'Todo']].map(([id, t]) => el('button', { clase: alcance === id ? 'activo' : '', onclick: () => { alcance = id; pintar() } }, t)))
    poner(zonaAlcance,
      tipo === 'llevando' ? el('div', { clase: 'campo' }, 'Qué tiene que llevar el cliente', selectorProductos(lista, rubros, disp), el('label', { clase: 'campo' }, 'Nombre corto', nombreDisp)) : null,
      el('div', { clase: 'campo' }, tipo === 'llevando' ? 'A qué se le hace el descuento' : 'A qué productos', segAlcance),
      alcance === 'todo' ? el('p', { clase: 'sub' }, 'Vale para todos los productos del local.') : selectorProductos(lista, rubros, sel, { sinFamilias: alcance === 'productos' }))
  }
  pintar()
  const segDias = el('div', { clase: 'chips' })
  const pintarDias = () => poner(segDias, [1, 2, 3, 4, 5, 6, 0].map((d) => el('button', { clase: 'filtro' + (dias.has(d) ? ' activo' : ''), onclick: () => { if (dias.has(d) && dias.size > 1) dias.delete(d); else dias.add(d); pintarDias() } }, DIAS[d])))
  pintarDias()
  const chkActiva = el('input', { type: 'checkbox' })
  chkActiva.checked = activa
  chkActiva.addEventListener('change', () => { activa = chkActiva.checked })
  abrirHoja({
    titulo: (edita ? 'Editar promo' : duplicar ? 'Duplicar promo' : 'Promo nueva') + ' · ' + nombreSucursal(sucursalId),
    completa: true,
    cuerpo: el('div', {},
      el('label', { clase: 'campo' }, 'Nombre (sale en el ticket)', nombre),
      el('div', { clase: 'campo' }, 'Qué tipo de promo', segTipo), zonaValor, zonaAlcance,
      el('div', { clase: 'campo' }, 'Qué días', segDias),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Desde el día', desde), el('label', { clase: 'campo' }, 'Hasta el día', hasta)),
      el('div', { clase: 'dos' }, el('label', { clase: 'campo' }, 'Desde la hora', horaDesde), el('label', { clase: 'campo' }, 'Hasta la hora', horaHasta)),
      el('p', { clase: 'sub' }, 'Dejá fechas y horas vacías para que valga siempre. Un horario puede cruzar la medianoche (22:00 a 06:00).'),
      el('label', { clase: 'campo', estilo: { display: 'flex', gap: '8px', alignItems: 'center' } }, chkActiva, 'Activa (si no, queda pausada)')),
    botones: [{ texto: edita ? 'Guardar cambios' : 'Crear promo', primario: true, alTocar: async () => {
      const promo = { nombre: nombre.value.trim(), tipo, activa, dias: dias.size === 7 ? [] : [...dias], desde: desde.value, hasta: hasta.value, horaDesde: horaDesde.value, horaHasta: horaHasta.value }
      if (edita) promo.id = p0.id
      if (!promo.nombre) return toast('Ponele un nombre', 'mal')
      if ((promo.horaDesde || promo.horaHasta) && !(promo.horaDesde && promo.horaHasta)) return toast('Completá la hora desde y hasta', 'mal')
      if (promo.desde && promo.hasta && promo.desde > promo.hasta) return toast('La fecha "desde" es posterior a "hasta"', 'mal')
      if (tipo === 'combo') {
        promo.precio = aCentavos(precioCombo.value)
        if (!(promo.precio > 0)) return toast('Poné el precio del combo', 'mal')
        promo.componentes = comps.filter((c) => c.productoIds.length || c.rubroIds.length).map((c) => ({ nombre: (c.nombre || '').trim(), cantidad: Math.round(Number(c.cantidad) || 0), productoIds: c.productoIds, rubroIds: c.rubroIds }))
        if (promo.componentes.some((c) => !c.nombre)) return toast('Ponele nombre a cada producto del combo', 'mal')
        if (!promo.componentes.length) return toast('Elegí los productos del combo', 'mal')
      } else {
        promo.alcance = alcance
        promo.productoIds = alcance === 'productos' ? sel.productoIds.slice() : []
        promo.rubroIds = alcance === 'rubros' ? sel.rubroIds.slice() : []
        if (tipo === 'nxm') { promo.lleva = Number(lleva.value); promo.paga = Number(paga.value); promo.mezclar = mezclar.checked } else if (tipo === 'porcentaje' || tipo === 'llevando') promo.valor = Math.round(Number(String(valor.value).replace(',', '.')) * 100)
        else promo.valor = aCentavos(valor.value)
        if (tipo !== 'nxm' && !(promo.valor > 0)) return toast('Completá el valor del descuento', 'mal')
        if (alcance === 'productos' && !promo.productoIds.length) return toast('Elegí a qué productos se aplica', 'mal')
        if (alcance === 'rubros' && !promo.rubroIds.length) return toast('Elegí a qué familias se aplica', 'mal')
        if (tipo === 'llevando') {
          if (!disp.productoIds.length && !disp.rubroIds.length) return toast('Elegí qué tiene que llevar el cliente', 'mal')
          promo.disparador = { productoIds: disp.productoIds.slice(), rubroIds: disp.rubroIds.slice() }
          promo.nombreDisparador = nombreDisp.value.trim()
        }
      }
      cerrarHoja()
      await mandarOrden(sucursalId, 'promo_guardar', { promo }, { texto: 'Promo ' + promo.nombre, alTerminar: refrescarSeccion })
    } }]
  })
}

// --- CIERRES DE CAJA ----------------------------------------------------------------

async function secCierres () {
  const datos = await leerDatos('cierres')
  const E = S.cie = Object.assign({ filtro: '' }, S.cie || {})
  const todos = []
  for (const [id, f] of Object.entries(datos)) for (const c of f.datos || []) todos.push(Object.assign({ sucursal: S.sucursales.length > 1 ? f.nombre : '', sucursalId: id }, c))
  todos.sort((a, b) => String(b.cerradaEn).localeCompare(String(a.cerradaEn)))
  const lista = todos.filter((c) => !E.filtro || c.sucursalId === E.filtro)
  const conDif = lista.filter((c) => c.fueraDeTolerancia)
  const faltante = lista.filter((c) => c.diferencia < 0 && c.fueraDeTolerancia).reduce((s, c) => s + c.diferencia, 0)
  pintarSeccion('cierres',
    cabecera('Cierres de caja', 'Cada turno: lo que tendría que haber y lo que contaron'),
    S.sucursales.length > 1 ? el('div', { clase: 'filtros' },
      el('button', { clase: 'filtro' + (!E.filtro ? ' activo' : ''), onclick: () => { E.filtro = ''; render() } }, 'Todas'),
      S.sucursales.map((x) => el('button', { clase: 'filtro' + (E.filtro === x.id ? ' activo' : ''), onclick: () => { E.filtro = x.id; render() } }, x.nombre))) : null,
    el('div', { clase: 'kpis' },
      kpi('Cierres', String(lista.length), 'los últimos'),
      kpi('Con diferencia', String(conDif.length), conDif.length ? 'fuera de la tolerancia' : 'todos cerraron bien', { clase: conDif.length ? 'alerta' : '' }),
      kpi('Faltó en total', plata(Math.abs(faltante)), faltante ? 'en los cierres con diferencia' : 'nada', { clase: faltante ? 'mal' : '' })),
    el('div', { clase: 'tarjeta sin-relleno' }, lista.length ? el('div', { clase: 'lista' }, lista.map(itemCierre)) : vacio('Todavía no hay cierres subidos.', 'cierres')))
}

// --- AVISOS ---------------------------------------------------------------------------------

async function contarAvisos () {
  if (esEmpleado()) return
  try {
    const visto = leerLocal('bs.avisosVistos', '') || '1970-01-01'
    const { count } = await S.sb.from('pos_avisos').select('id', { count: 'exact', head: true }).gt('creado', visto)
    for (const i of document.querySelectorAll('[data-insignia]')) { i.textContent = count > 99 ? '99+' : String(count || ''); i.style.display = count ? '' : 'none' }
  } catch (e) { /* sin avisos */ }
}

async function secAvisos () {
  let data = []
  try {
    const r = await S.sb.from('pos_avisos').select('*').order('creado', { ascending: false }).limit(150)
    if (r.error) throw r.error
    data = r.data || []
    DB.set('avisos', data)
    red(true)
  } catch (err) {
    if (!esDeRed(err)) throw err
    red(false)
    data = (await DB.get('avisos')) || []
  }
  const anul = await leerDatos('anulaciones').catch(() => ({}))
  guardarLocal('bs.avisosVistos', new Date().toISOString())
  contarAvisos()
  const tono = { cierre: 'mal', anulacion: 'alerta', pedido_anulacion: 'alerta', personal: 'mal', caja: 'mal', pago: 'alerta', resumen: 'info', sistema: 'alerta', descuento: 'alerta', reponer: 'info', pedido: 'info', gasto: 'alerta', stock: 'alerta', deuda: 'alerta', encargo: 'ok' }
  const ico = { cierre: 'caja', anulacion: 'ventas', pedido_anulacion: 'ventas', personal: 'clientes', caja: 'caja', pago: 'apagar', resumen: 'reportes', sistema: 'nube', descuento: 'ventas', reponer: 'reponer', pedido: 'reponer', gasto: 'caja', stock: 'stock', deuda: 'clientes', encargo: 'pedidos' }
  const pedidos = []
  for (const [id, f] of Object.entries(anul)) for (const p of f.datos || []) pedidos.push(Object.assign({ sucursalId: id, sucursal: f.nombre }, p))
  const bloques = []
  let dia = ''
  let actual = null
  for (const a of data) {
    const d = isoLocal(new Date(a.creado))
    if (d !== dia) { dia = d; actual = el('div', { clase: 'lista' }); bloques.push(el('h3', {}, fechaCorta(d)), el('div', { clase: 'tarjeta sin-relleno' }, actual)) }
    const va = a.tipo === 'pedido' ? 'reponer' : a.tipo === 'encargo' ? 'encargos' : ''
    actual.append(el('div', { clase: 'item' + (va ? ' tocable' : ''), onclick: va ? () => ir(va) : null },
      el('span', { clase: 'chip ' + (tono[a.tipo] || 'info'), estilo: { padding: '6px' } }, icono(ico[a.tipo] || 'avisos')),
      el('div', { clase: 'cuerpo' }, el('b', { estilo: { whiteSpace: 'normal' } }, a.titulo), el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, (a.nombre || '') + ' · ' + hora(a.creado) + (a.texto ? ' · ' + a.texto : '')))))
  }
  pintarSeccion('avisos',
    cabecera('Avisos', 'Lo que pasó en los locales y te conviene saber'),
    await panelNotificaciones(),
    pedidos.length ? el('div', { clase: 'tarjeta' }, el('h2', {}, 'Ventas a cuenta para anular'),
      pedidos.map((p) => el('div', { clase: 'fila', estilo: { display: 'block' } },
        el('div', { estilo: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
          el('div', { clase: 'izq' }, el('b', {}, (p.cliente || 'Sin cliente') + ' · ' + plata(p.total)), el('div', { clase: 'sub' }, p.sucursal + ' · ' + p.numero + ' · pidió ' + p.usuario + ': ' + p.motivo)),
          el('div', { clase: 'chips' },
            el('button', { clase: 'btn chico peligro', onclick: () => { const m = prompt('Motivo de la anulación', p.motivo || ''); if (m) mandarOrden(p.sucursalId, 'anular_venta', { ventaId: p.ventaId, motivo: m }, { texto: 'Anular ' + p.numero, alTerminar: refrescarSeccion }) } }, 'Anular'),
            el('button', { clase: 'btn chico', onclick: () => mandarOrden(p.sucursalId, 'anulacion_rechazar', { ventaId: p.ventaId }, { texto: 'No anular ' + p.numero, alTerminar: refrescarSeccion }) }, 'No anular'))),
        el('div', { clase: 'sub' }, (p.items || []).map((it) => unidades(it.cantidad) + ' × ' + it.descripcion).join(' · '))))) : null,
    bloques.length ? bloques : el('div', { clase: 'tarjeta' }, vacio('Todavía no hubo avisos.', 'avisos')))
}

function urlBase64AUint8 (b64) {
  const relleno = '='.repeat((4 - b64.length % 4) % 4)
  const bin = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...bin].map((c) => c.charCodeAt(0)))
}

async function panelNotificaciones () {
  const caja = el('div', { clase: 'tarjeta' }, el('h2', {}, 'Notificaciones en este ' + (/iphone|android/i.test(navigator.userAgent) ? 'celular' : 'dispositivo')))
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    caja.append(el('p', { clase: 'tenue' }, esIOS && !instalada
      ? 'En el iPhone, primero agregá esta página a la pantalla de inicio: Compartir → "Agregar a inicio". Después abrila desde el ícono y volvé acá.'
      : 'Este navegador no puede recibir notificaciones.'))
    return caja
  }
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))])
  if (!reg) { caja.append(el('p', { clase: 'tenue' }, 'Las notificaciones no están disponibles ahora. Probá recargar la página.')); return caja }
  const actual = await reg.pushManager.getSubscription()
  const estado = el('p', { clase: 'tenue' })
  const boton = el('button', { clase: 'btn primario' })
  const pintar = (sub) => {
    estado.textContent = sub
      ? (esEncargado() ? '✓ Te llegan los avisos del local: pedidos a proveedores, lo que hay que reponer, empleado que no llegó y problemas de la caja.' : '✓ Te llegan: el resumen de ayer cada mañana, faltante al cerrar la caja, ventas anuladas (y si alguien anula muchas), empleado que no llegó, caja cerrada o sin conexión, pedidos de anulación y pagos a proveedores del día.')
      : 'Activalas para enterarte cuando pasa algo importante, aunque no tengas la app abierta.'
    boton.textContent = sub ? 'Desactivar' : 'Activar notificaciones'
    boton.className = 'btn' + (sub ? '' : ' primario')
  }
  pintar(actual)
  boton.addEventListener('click', async () => {
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await S.sb.from('pos_suscripciones').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
      pintar(null)
      return
    }
    const { data } = await S.sb.from('pos_datos').select('datos').eq('sucursal_id', '_').eq('clave', 'vapid_publica').maybeSingle()
    if (!data) return toast('Todavía no está listo: la caja tiene que conectarse una vez con la versión nueva.', 'mal', 6)
    const permiso = await Notification.requestPermission()
    if (permiso !== 'granted') return toast('Sin permiso para notificaciones. Se habilita en los ajustes del celular.', 'mal', 6)
    try {
      const nueva = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64AUint8(data.datos.publica) })
      const { error } = await S.sb.from('pos_suscripciones').upsert({ endpoint: nueva.endpoint, datos: nueva.toJSON(), email: S.email.toLowerCase() })
      if (error) throw error
      pintar(nueva)
      toast('Listo: las notificaciones llegan a este ' + (esIOS ? 'celular' : 'dispositivo'), 'ok')
    } catch (err) { toast('No se pudo activar: ' + err.message, 'mal', 6) }
  })
  caja.append(estado, boton)
  return caja
}

// --- AJUSTES --------------------------------------------------------------------------

function secAjustes () {
  const tema = leerLocal('bs.tema', 'auto')
  pintarSeccion('ajustes',
    cabecera('Ajustes', S.email),
    el('div', { clase: 'tarjeta' },
      el('div', { clase: 'fila' }, el('span', {}, 'Tema'), el('div', { clase: 'seg' }, [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([id, t]) => el('button', { clase: tema === id ? 'activo' : '', onclick: () => { guardarLocal('bs.tema', id); aplicarTema(); secAjustes() } }, t)))),
      el('div', { clase: 'fila' }, el('span', {}, 'Accesos rápidos del inicio'), el('button', { clase: 'btn chico', onclick: () => hojaAccesos() }, 'Editar')),
      S.sucursales.length > 1 ? el('div', { clase: 'fila' }, el('span', {}, 'Sucursal'), el('button', { clase: 'btn chico', onclick: () => hojaSucursales() }, nombreSucursal(S.sucursal))) : null,
      el('div', { clase: 'fila' }, el('span', {}, 'Conexión y cajas'), el('button', { clase: 'btn chico', onclick: () => hojaConexion() }, S.enLinea ? 'Conectado' : 'Sin conexión'))),
    el('div', { clase: 'tarjeta' },
      el('h2', {}, 'Usar como app'),
      el('p', { clase: 'tenue', estilo: { margin: 0 } }, /iphone|ipad/i.test(navigator.userAgent)
        ? 'En Safari: Compartir → "Agregar a inicio". Queda un ícono y se abre a pantalla completa, con la cámara y las notificaciones.'
        : 'En Chrome: menú ⋮ → "Instalar aplicación" o "Agregar a la pantalla principal".')),
    esEmpleado() ? null : tarjetaBloqueo(),
    el('div', { clase: 'tarjeta' },
      el('button', { clase: 'btn peligro ancho', onclick: async () => {
        const quedan = S.cola.length + (S.fallidas || []).length
        if (!confirm((quedan ? 'Quedan ' + quedan + (quedan === 1 ? ' cosa sin mandar: si salís, se borra.\n\n' : ' cosas sin mandar: si salís, se borran.\n\n') : '') + '¿Salir de la cuenta en este dispositivo? Se apagan las notificaciones y se borra lo guardado de esta cuenta.')) return
        await salirDelTodo()
        pantallaEntrar()
      } }, icono('salir'), 'Salir')))
}

// Pedir un PIN para abrir la app: si el celular se pierde, no se ve nada sin el.
function tarjetaBloqueo () {
  const b = leerLocal('bs.bloqueo', null)
  const activar = () => {
    const pin = el('input', { type: 'password', inputmode: 'numeric', maxlength: '8', placeholder: '4 a 8 números' })
    const otra = el('input', { type: 'password', inputmode: 'numeric', maxlength: '8', placeholder: 'Otra vez' })
    const minutos = el('select', {}, [[1, 'Al minuto'], [5, 'A los 5 minutos'], [15, 'A los 15 minutos'], [60, 'A la hora']].map(([v, t]) => el('option', { valor: String(v) }, t)))
    minutos.value = '5'
    abrirHoja({
      titulo: 'PIN para abrir la app',
      cuerpo: el('div', {},
        el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Lo pide al abrir la app y al volver a ella después de un rato. Si te lo olvidás, entrás de nuevo con tu mail y contraseña. No es el PIN de la caja: puede ser otro.'),
        el('label', { clase: 'campo' }, 'PIN', pin), el('label', { clase: 'campo' }, 'Repetilo', otra),
        el('label', { clase: 'campo' }, 'Pedirlo de nuevo', minutos)),
      botones: [{ texto: 'Guardar', primario: true, alTocar: async () => {
        if (!/^\d{4,8}$/.test(pin.value.trim())) return toast('El PIN tiene que tener de 4 a 8 números', 'mal')
        if (pin.value.trim() !== otra.value.trim()) return toast('Los dos PIN no son iguales', 'mal')
        const sal = uuid()
        guardarLocal('bs.bloqueo', { huella: await huellaPin(pin.value.trim(), sal), sal, minutos: Number(minutos.value) })
        cerrarHoja()
        toast('Listo: la app pide el PIN para abrirse', 'ok')
        secAjustes()
      } }]
    })
  }
  return el('div', { clase: 'tarjeta' },
    el('h2', {}, 'PIN para abrir la app'),
    el('p', { clase: 'tenue', estilo: { margin: '0 0 10px' } }, b ? '✓ La app pide el PIN al abrirse. Si perdés el celular, en la caja (Configuración → Ver desde el celular) podés cerrar la sesión a distancia.' : 'Si perdés el celular o te lo roban, sin el PIN no se ve nada. También podés cerrar la sesión a distancia desde la caja (Configuración → Ver desde el celular).'),
    b ? el('button', { clase: 'btn ancho', onclick: () => { if (!confirm('¿Sacar el PIN? La app se va a abrir sin pedirlo.')) return; guardarLocal('bs.bloqueo', ''); try { localStorage.removeItem(conEspacio('bs.bloqueo')) } catch (e) {} secAjustes() } }, 'Sacar el PIN')
      : el('button', { clase: 'btn primario ancho', onclick: activar }, 'Poner un PIN'))
}

// --- LO QUE MANDE ------------------------------------------------------------------------
//
// Todo lo que salio de este celular: lo que no se pudo mandar (se reintenta o
// se borra), lo que espera a la caja y lo que la caja aplico o rechazo en los
// ultimos 7 dias, con el motivo. Lo rechazado de una lista (un conteo, una
// recepcion, una venta, un pase) se vuelve a cargar para corregirlo y mandarlo
// de nuevo: antes, la lista ya se habia borrado y se perdia.

const SE_VUELVE_A_CARGAR = { conteo: 'contar', recepcion: 'recibir', venta_celular: 'vender', transferencia_salida: 'pasar' }

async function volverACargar (o) {
  const suc = o.sucursal_id
  const d = o.datos || {}
  const cat = await leerCatalogo(suc).catch(() => [])
  const porId = new Map(cat.map((p) => [p.id, p]))
  const linea = (id, extra) => { const p = porId.get(id) || {}; return Object.assign({ productoId: id, descripcion: p.descripcion || 'Producto', codigo: (p.codigos || [])[0] || '', stock: p.stock || 0, ts: new Date().toISOString() }, extra) }
  const sumar = (lineas, nuevas) => { for (const l of nuevas) if (l.productoId && !lineas.some((x) => x.productoId === l.productoId)) lineas.push(l) }
  if (o.tipo === 'transferencia_salida') {
    const clave = 'bs.pasar.' + suc
    const lineas = leerLocal(clave, []) || []
    sumar(lineas, (d.items || []).map((it) => linea(it.productoId, { cantidad: it.cantidad })))
    guardarLocal(clave, lineas)
    S.pasar = null
  } else {
    const clave = { conteo: 'bs.contar.', recepcion: 'bs.recibir.', venta_celular: 'bs.vender.' }[o.tipo] + suc
    const L = leerLocal(clave, null) || { lineas: [] }
    L.lineas = L.lineas || []
    if (o.tipo === 'conteo') sumar(L.lineas, (d.items || []).map((it) => linea(it.productoId, { cantidad: it.cantidad, ts: it.ts || new Date().toISOString() })))
    if (o.tipo === 'venta_celular') sumar(L.lineas, (d.items || []).map((it) => linea(it.productoId, { cantidad: it.cantidad, precioUnit: (porId.get(it.productoId) || {}).precio || it.precioUnit, rubroId: (porId.get(it.productoId) || {}).rubroId || null })))
    if (o.tipo === 'recepcion') {
      L.proveedorId = L.proveedorId || d.proveedorId || ''
      L.numero = L.numero || d.numero || ''
      sumar(L.lineas, (d.lineas || []).map((l) => l.nuevo
        ? { productoId: 'nuevo:' + (l.nuevo.codigo || l.nuevo.descripcion), nuevo: l.nuevo, descripcion: l.nuevo.descripcion, codigo: l.nuevo.codigo || '', stock: 0, cantidad: l.cantidad, costoUnit: l.costoUnit, vence: l.vence || '', unidadesPorBulto: 1, ts: new Date().toISOString() }
        : linea(l.productoId, { cantidad: l.cantidad, costoUnit: l.costoUnit, vence: l.vence || '', unidadesPorBulto: (porId.get(l.productoId) || {}).bulto || 1 })))
    }
    guardarLocal(clave, L)
  }
  if (S.listas) S.listas = {}
  if (suc !== S.sucursal) cambiarSucursalSinPintar(suc)
  toast('Lo cargué de nuevo: corregí lo que haga falta y mandalo', 'ok', 4)
  ir(SE_VUELVE_A_CARGAR[o.tipo])
}

function secMandado () {
  for (const o of S.hechas || []) o.visto = true
  DB.set('hechas', S.hechas || [])
  const chip = (texto, clase) => el('span', { clase: 'chip ' + clase }, texto)
  const fila = (o, estado, botones) => el('div', { clase: 'item', estilo: { flexWrap: 'wrap' } },
    el('div', { clase: 'cuerpo' },
      el('b', {}, o.texto),
      el('div', { clase: 'sub' }, nombreSucursal(o.sucursal_id) + ' · ' + fechaHora(o.creado)),
      o.error ? el('div', { clase: 'sub rojo', estilo: { whiteSpace: 'normal' } }, o.error) : o.mensaje ? el('div', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, o.mensaje) : null),
    el('div', { clase: 'fin' }, estado),
    botones && botones.length ? el('div', { clase: 'fila', estilo: { width: '100%', gap: '8px', marginTop: '6px', flexWrap: 'wrap' } }, botones) : null)
  const reintentar = async (o) => {
    S.fallidas = (S.fallidas || []).filter((x) => x.id !== o.id)
    await guardarFallidas()
    S.cola.push(Object.assign({}, o, { error: undefined, fallo: undefined }))
    await guardarCola()
    await vaciarCola()
    secMandado()
  }
  const borrar = async (o) => {
    if (!confirm('¿Borrar "' + o.texto + '"? No se manda más.')) return
    S.fallidas = (S.fallidas || []).filter((x) => x.id !== o.id)
    await guardarFallidas()
    secMandado()
  }
  const deNuevo = (o) => mandarOrden(o.sucursal_id, o.tipo, o.datos, { texto: o.texto }).then(() => secMandado())
  const fallidas = (S.fallidas || []).map((o) => fila(o, chip('No se mandó', 'mal'), [
    el('button', { clase: 'btn chico primario', onclick: () => reintentar(o) }, 'Reintentar'),
    SE_VUELVE_A_CARGAR[o.tipo] ? el('button', { clase: 'btn chico', onclick: async () => { S.fallidas = S.fallidas.filter((x) => x.id !== o.id); await guardarFallidas(); volverACargar(o) } }, 'Volver a cargar') : null,
    el('button', { clase: 'btn chico', onclick: () => borrar(o) }, 'Borrar')]))
  const cola = S.cola.map((o) => fila(o, chip('Sin enviar', 'alerta')))
  const esperan = [...S.esperando.values()].map((o) => fila(o, chip('Esperando la caja', 'alerta')))
  const hechas = (S.hechas || []).filter((o) => !o.silencioso)
  const malas = hechas.filter((o) => o.estado !== 'aplicada')
  const buenas = hechas.filter((o) => o.estado === 'aplicada')
  pintarSeccion('mandado',
    cabecera('Lo que mandé', 'Desde este celular · los últimos ' + DIAS_HECHAS + ' días'),
    fallidas.length ? [el('h3', {}, 'No se pudieron mandar'), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, fallidas))] : null,
    malas.length ? [el('h3', {}, 'La caja no lo aplicó'), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, malas.map((o) => fila(o, chip('✗ No entró', 'mal'), [
      SE_VUELVE_A_CARGAR[o.tipo] ? el('button', { clase: 'btn chico primario', onclick: () => volverACargar(o) }, 'Volver a cargar y corregir') : null,
      el('button', { clase: 'btn chico', onclick: () => deNuevo(o) }, 'Mandar de nuevo igual')]))))] : null,
    cola.length || esperan.length ? [el('h3', {}, 'En camino'), el('div', { clase: 'tarjeta sin-relleno' }, el('div', { clase: 'lista' }, cola, esperan))] : null,
    el('h3', {}, 'Aplicado en la caja'),
    el('div', { clase: 'tarjeta sin-relleno' }, buenas.length ? el('div', { clase: 'lista' }, buenas.slice(0, 80).map((o) => fila(o, chip('✓', 'ok')))) : vacio('Todavía no hay nada aplicado en estos días.', 'nube')),
    el('p', { clase: 'sub', estilo: { whiteSpace: 'normal' } }, 'Si algo no entró, el motivo está debajo. Las listas (conteos, recepciones, ventas y pases) se pueden volver a cargar para corregirlas y mandarlas de nuevo.'))
}

seccion('mandado', { nombre: 'Lo que mandé', icono: 'historial', grupo: 'control', fn: secMandado })

// --- MAS (celular) ---------------------------------------------------------------------------

function secMas () {
  const ids = ['metricas', 'reportes', 'clientes', 'encargos', 'mayorista', 'caja', 'gastos', 'contar', 'recibir', 'stock', 'perdidas', 'pasar', 'proveedores', 'personal', 'vencimientos', 'envases', 'rubrosganancia', 'medios', 'apagar', 'reponer', 'faltantes', 'promos', 'cierres', 'cierresemana', 'cierremes', 'historial', 'avisos', 'mandado', 'ajustes']
  pintarSeccion('mas',
    cabecera('Más', S.negocio + (esEncargado() ? ' · encargado' : '')),
    el('div', { clase: 'mas-grilla' }, ids.filter((id) => SECCIONES[id] && seccionPermitida(id)).map((id) => el('button', { clase: 'acceso', onclick: () => ir(id) },
      el('span', { clase: 'ico' }, icono(SECCIONES[id].icono)), SECCIONES[id].nombre,
      id === 'avisos' ? el('span', { clase: 'insignia', 'data-insignia': '', estilo: { display: 'none' } }) : null))))
  contarAvisos()
}

seccion('reponer', { nombre: 'Reponer', icono: 'reponer', grupo: 'mercaderia', fn: secReponer })
seccion('faltantes', { nombre: 'Faltantes', icono: 'faltantes', grupo: 'mercaderia', fn: secFaltantes })
seccion('promos', { nombre: 'Promos', icono: 'promos', grupo: 'mercaderia', fn: secPromos })
seccion('cierres', { nombre: 'Cierres de caja', icono: 'cierres', grupo: 'control', fn: secCierres })
seccion('avisos', { nombre: 'Avisos', icono: 'avisos', grupo: 'control', fn: secAvisos })
seccion('ajustes', { nombre: 'Ajustes', icono: 'ajustes', grupo: 'control', fn: secAjustes })
seccion('mas', { nombre: 'Más', icono: 'mas', grupo: 'oculto', fn: secMas })

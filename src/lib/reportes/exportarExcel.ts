import { ahoraTexto, descargarBlob, sufijoArchivo, textoPeriodo } from './formato'
import type { Celda, ColumnaReporte, PeriodoReporte, ReporteCargado } from './tipos'

const NUM_FMT: Record<ColumnaReporte['tipo'], string | undefined> = {
  texto: undefined,
  moneda: '"$"#,##0',
  numero: '#,##0',
  fecha: 'dd/mm/yyyy',
  fechahora: 'dd/mm/yyyy hh:mm',
}

// exceljs escribe las fechas como UTC y Excel no tiene zona horaria: sin este ajuste, una orden de
// las 2:00 p. m. (hora de Colombia) aparecería a las 7:00 p. m. Se le suma el desfase a propósito
// para que Excel muestre la hora local tal cual se ve en la pantalla.
const aLocalParaExcel = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000)

const valorExcel = (c: Celda) => (c instanceof Date ? aLocalParaExcel(c) : c)

// Excel: máx. 31 caracteres y sin : \ / ? * [ ]
const nombreHoja = (s: string) => s.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)

const AZUL = 'FF1C7FD6'

// Una hoja por reporte. Con varios, se antepone una hoja "Resumen" con las cifras clave de todos.
export async function exportarExcel(reportes: ReporteCargado[], periodo: PeriodoReporte, nombreBase: string) {
  const { default: ExcelJS } = await import('exceljs')
  const libro = new ExcelJS.Workbook()
  libro.creator = 'CarWash SM'
  libro.created = new Date()

  if (reportes.length > 1) {
    const hoja = libro.addWorksheet('Resumen')
    hoja.getCell('A1').value = 'Resumen del periodo'
    hoja.getCell('A1').font = { bold: true, size: 14 }
    hoja.getCell('A2').value = `Periodo: ${textoPeriodo(periodo)} · generado ${ahoraTexto()}`
    hoja.getCell('A2').font = { color: { argb: 'FF666666' } }
    let fila = 4
    for (const { info, tabla } of reportes) {
      hoja.getCell(fila, 1).value = info.label
      hoja.getCell(fila, 1).font = { bold: true, color: { argb: AZUL } }
      hoja.getCell(fila, 2).value = `${tabla.filas.length} registros`
      hoja.getCell(fila, 2).font = { color: { argb: 'FF666666' } }
      fila++
      for (const item of tabla.resumen) {
        hoja.getCell(fila, 1).value = `   ${item.etiqueta}`
        const celda = hoja.getCell(fila, 2)
        celda.value = item.valor
        celda.numFmt = item.tipo === 'moneda' ? '"$"#,##0' : '#,##0'
        celda.alignment = { horizontal: 'right' }
        fila++
      }
      fila++
    }
    hoja.getColumn(1).width = 38
    hoja.getColumn(2).width = 18
  }

  for (const { info, tabla } of reportes) {
    const hoja = libro.addWorksheet(nombreHoja(info.label))
    hoja.getCell('A1').value = info.label
    hoja.getCell('A1').font = { bold: true, size: 14 }
    hoja.getCell('A2').value = `Periodo: ${textoPeriodo(periodo)} · generado ${ahoraTexto()}`
    hoja.getCell('A2').font = { color: { argb: 'FF666666' } }

    // Bloque de resumen: etiquetas en una fila y valores debajo.
    let fila = 4
    tabla.resumen.forEach((item, i) => {
      const etiqueta = hoja.getCell(fila, i + 1)
      etiqueta.value = item.etiqueta
      etiqueta.font = { bold: true, size: 9, color: { argb: 'FF555555' } }
      etiqueta.alignment = { wrapText: true, vertical: 'top' }
      const valor = hoja.getCell(fila + 1, i + 1)
      valor.value = item.valor
      valor.numFmt = item.tipo === 'moneda' ? '"$"#,##0' : '#,##0'
      valor.font = { bold: true, size: 12 }
      valor.alignment = { horizontal: 'left' }
    })
    fila += 3

    const encabezado = fila
    tabla.columnas.forEach((c, i) => {
      const celda = hoja.getCell(encabezado, i + 1)
      celda.value = c.encabezado
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
      celda.alignment = { wrapText: true, vertical: 'middle', horizontal: c.tipo === 'moneda' || c.tipo === 'numero' ? 'right' : 'left' }
      hoja.getColumn(i + 1).width = Math.max(c.ancho, 12)
    })
    hoja.getRow(encabezado).height = 30

    tabla.filas.forEach((f, r) => {
      const row = hoja.getRow(encabezado + 1 + r)
      f.forEach((c, i) => {
        const celda = row.getCell(i + 1)
        celda.value = valorExcel(c)
        const fmt = NUM_FMT[tabla.columnas[i].tipo]
        if (fmt) celda.numFmt = fmt
      })
    })

    if (tabla.filas.length > 0) {
      hoja.autoFilter = {
        from: { row: encabezado, column: 1 },
        to: { row: encabezado + tabla.filas.length, column: tabla.columnas.length },
      }
    }
    hoja.views = [{ state: 'frozen', ySplit: encabezado, xSplit: 0 }]
  }

  const buffer = await libro.xlsx.writeBuffer()
  descargarBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nombreBase}_${sufijoArchivo(periodo)}.xlsx`,
  )
}

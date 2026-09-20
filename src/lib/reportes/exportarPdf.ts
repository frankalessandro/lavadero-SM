import { ahoraTexto, descargarBlob, formatoCelda, formatoResumen, sufijoArchivo, textoPeriodo } from './formato'
import type { PeriodoReporte, ReporteCargado } from './tipos'

// Hoja A4 horizontal, una sección por reporte (cada uno empieza en hoja nueva). Solo van las
// columnas marcadas para PDF: las que no caben en la hoja viajan completas en el Excel.
const MARGEN = 10
const AZUL: [number, number, number] = [28, 127, 214]

export async function exportarPdf(reportes: ReporteCargado[], periodo: PeriodoReporte, nombreBase: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const anchoUtil = doc.internal.pageSize.getWidth() - MARGEN * 2

  reportes.forEach(({ info, tabla }, idx) => {
    if (idx > 0) doc.addPage()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(30, 41, 59)
    doc.text(info.label, MARGEN, 16)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 110, 125)
    doc.text(`CarWash SM · Periodo: ${textoPeriodo(periodo)} · ${tabla.filas.length} registros`, MARGEN, 21.5)

    let y = 26
    if (tabla.resumen.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: MARGEN, right: MARGEN },
        head: [tabla.resumen.map((r) => r.etiqueta)],
        body: [tabla.resumen.map(formatoResumen)],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.8, halign: 'center', textColor: [30, 41, 59] },
        headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold' },
        bodyStyles: { fontStyle: 'bold', fontSize: 10 },
      })
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5
    }

    const idxPdf = tabla.columnas.map((c, i) => (c.enPdf === false ? -1 : i)).filter((i) => i >= 0)
    if (tabla.filas.length === 0) {
      doc.setFontSize(10)
      doc.setTextColor(100, 110, 125)
      doc.text('Sin registros en este periodo.', MARGEN, y + 6)
      return
    }

    const columnas = idxPdf.map((i) => tabla.columnas[i])
    const pesoTotal = columnas.reduce((s, c) => s + c.ancho, 0)
    const estilos: Record<number, { cellWidth: number; halign: 'left' | 'right' }> = {}
    columnas.forEach((c, k) => {
      estilos[k] = {
        cellWidth: (c.ancho / pesoTotal) * anchoUtil,
        halign: c.tipo === 'moneda' || c.tipo === 'numero' ? 'right' : 'left',
      }
    })

    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, bottom: 12 },
      head: [columnas.map((c) => c.encabezado)],
      body: tabla.filas.map((f) => idxPdf.map((i) => formatoCelda(f[i], tabla.columnas[i].tipo))),
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'left' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: estilos,
      // Repite el encabezado en cada hoja y no parte una fila por la mitad.
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
    })
  })

  // Pie con numeración: se pinta al final, cuando ya se sabe el total de hojas.
  const total = doc.getNumberOfPages()
  const alto = doc.internal.pageSize.getHeight()
  const generado = ahoraTexto()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(140, 150, 165)
    doc.text(`Generado ${generado}`, MARGEN, alto - 6)
    doc.text(`Hoja ${i} de ${total}`, doc.internal.pageSize.getWidth() - MARGEN, alto - 6, { align: 'right' })
  }

  descargarBlob(doc.output('blob'), `${nombreBase}_${sufijoArchivo(periodo)}.pdf`)
}

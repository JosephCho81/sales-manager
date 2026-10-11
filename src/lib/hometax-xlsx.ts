import ExcelJS from 'exceljs'
import {
  HOMETAX_SHEET_NAME, HOMETAX_NOTES, HOMETAX_NOTE_MERGE_COLS, HOMETAX_HEADERS,
  HOMETAX_REQUIRED_COLS, HOMETAX_DATA_START_ROW,
} from '@/lib/hometax-template'

/** 홈택스 업로드 양식 xlsx — 1~6행은 원본 양식 그대로, 7행부터 데이터 */
export async function buildHometaxWorkbook(dataRows: string[][]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(HOMETAX_SHEET_NAME)

  HOMETAX_NOTES.forEach((text, i) => {
    const r = i + 1
    ws.getCell(r, 1).value = text
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' }
    ws.mergeCells(r, 1, r, HOMETAX_NOTE_MERGE_COLS[i])
  })

  const headerRow = ws.getRow(HOMETAX_DATA_START_ROW - 1)
  HOMETAX_HEADERS.forEach((h, c) => {
    const cell = headerRow.getCell(c + 1)
    cell.value = h
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
    if (HOMETAX_REQUIRED_COLS.has(c)) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } }
    }
  })

  dataRows.forEach((cells, i) => {
    const row = ws.getRow(HOMETAX_DATA_START_ROW + i)
    cells.forEach((v, c) => {
      const cell = row.getCell(c + 1)
      cell.value = v
      cell.numFmt = '@'   // 텍스트 서식 — '01'·'08'의 앞자리 0 유지
    })
  })
  ws.columns.forEach(col => { col.width = 16 })

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

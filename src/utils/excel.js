import * as XLSX from 'xlsx'

// 셀 스타일 헬퍼
const headerStyle = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: '1E293B' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: { bottom: { style: 'thin', color: { rgb: '94A3B8' } } }
}

// 재고현황 엑셀
export function downloadStockExcel(itemStats, base, today) {
  const headers = ['도면번호', '품목명', '1SET 필요수량', '현재고 (EA)', `조립가능 (SET)`, `과부족 (기준 ${base}SET)`, '상태']

  const rows = itemStats.map(i => [
    i.code,
    i.name,
    i.needPerSet,
    i.stock,
    i.assemblable,
    i.surplus >= 0 ? i.surplus : i.surplus,
    i.status === 'empty' ? '재고없음' : i.status === 'low' ? '발주필요' : '정상'
  ])

  const data = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)

  // 컬럼 너비
  ws['!cols'] = [
    { wch: 8 }, { wch: 38 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 18 }, { wch: 10 }
  ]

  // 행 높이
  ws['!rows'] = [{ hpt: 22 }, ...rows.map(() => ({ hpt: 18 }))]

  // 헤더 행 고정
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  // 상태 컬럼 색상 (G열)
  rows.forEach((row, i) => {
    const rowNum = i + 2 // 1-indexed, header=1
    const statusCell = `G${rowNum}`
    const surplusCell = `F${rowNum}`
    const status = row[6]

    if (ws[statusCell]) {
      ws[statusCell].s = {
        font: { bold: true, color: { rgb: status==='재고없음'?'DC2626':status==='발주필요'?'D97706':'16A34A' } },
        alignment: { horizontal: 'center' }
      }
    }
    if (ws[surplusCell]) {
      const val = row[5]
      ws[surplusCell].s = {
        font: { bold: true, color: { rgb: val < 0 ? 'DC2626' : '16A34A' } },
        alignment: { horizontal: 'right' }
      }
      // 양수는 + 표시
      if (val >= 0) ws[surplusCell].v = val
    }
  })

  const wb = XLSX.utils.book_new()
  wb.Props = { Title: 'CST 부품 재고현황', Company: '㈜아이엔티에스' }
  XLSX.utils.book_append_sheet(wb, ws, `재고현황_${today}`)
  XLSX.writeFile(wb, `INTS_CST_재고현황_${today}.xlsx`)
}

// 입출고 이력 엑셀
export function downloadHistoryExcel(filtered, today) {
  const headers = ['No', '날짜', '구분', '도면번호', '품목명', '수량', '단위', '메모']

  const rows = filtered.map((t, i) => [
    filtered.length - i,
    t.date,
    t.type,
    t.itemCode || 'SET',
    t.itemName || (t.setQty ? `CST ${t.setQty}SET 출하` : ''),
    t.type === '출하계획' ? t.setQty : t.quantity,
    t.type === '출하계획' ? 'SET' : 'EA',
    t.memo || ''
  ])

  const data = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)

  ws['!cols'] = [
    { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
    { wch: 38 }, { wch: 10 }, { wch: 6 }, { wch: 30 }
  ]
  ws['!rows'] = [{ hpt: 22 }, ...rows.map(() => ({ hpt: 18 }))]
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  // 구분 컬럼 색상 (C열)
  rows.forEach((row, i) => {
    const rowNum = i + 2
    const typeCell = `C${rowNum}`
    if (ws[typeCell]) {
      const type = row[2]
      ws[typeCell].s = {
        font: { bold: true, color: { rgb: type==='입고'?'1E40AF':type==='출고'?'DC2626':'16A34A' } },
        alignment: { horizontal: 'center' }
      }
    }
    // 수량 오른쪽 정렬
    const qtyCell = `F${rowNum}`
    if (ws[qtyCell]) ws[qtyCell].s = { alignment: { horizontal: 'right' }, font: { bold: true } }
    // 날짜 가운데
    const dateCell = `B${rowNum}`
    if (ws[dateCell]) ws[dateCell].s = { alignment: { horizontal: 'center' } }
  })

  // 요약 행 추가 (빈 행 + 합계)
  const inTotal  = filtered.filter(t=>t.type==='입고').reduce((s,t)=>s+t.quantity,0)
  const outTotal = filtered.filter(t=>t.type==='출고').reduce((s,t)=>s+t.quantity,0)
  const summaryRow = rows.length + 2
  XLSX.utils.sheet_add_aoa(ws, [
    [],
    ['', '', '입고 합계', '', '', inTotal, 'EA', ''],
    ['', '', '출고 합계', '', '', outTotal, 'EA', ''],
  ], { origin: summaryRow - 1 })

  const wb = XLSX.utils.book_new()
  wb.Props = { Title: 'CST 입출고 이력', Company: '㈜아이엔티에스' }
  XLSX.utils.book_append_sheet(wb, ws, `입출고이력_${today}`)
  XLSX.writeFile(wb, `INTS_CST_입출고이력_${today}.xlsx`)
}

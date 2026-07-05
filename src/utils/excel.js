import * as XLSX from 'xlsx'

export function downloadStockExcel(itemStats, base, today) {
  const data = [
    ['도면번호','품목명','1SET 필요수량','현재고','조립가능(SET)',`과부족(기준${base}SET)`,'상태'],
    ...itemStats.map(i => [
      i.code, i.name, i.needPerSet, i.stock, i.assemblable,
      i.surplus >= 0 ? `+${i.surplus}` : `${i.surplus}`,
      i.status==='empty'?'재고없음': i.status==='low'?'발주필요':'정상'
    ])
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{wch:8},{wch:36},{wch:14},{wch:10},{wch:14},{wch:16},{wch:10}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '재고현황')
  XLSX.writeFile(wb, `CST_재고현황_${today}.xlsx`)
}

export function downloadHistoryExcel(filtered, today) {
  const data = [
    ['No','날짜','구분','코드','품목명','수량','메모'],
    ...filtered.map((t,i) => [
      filtered.length-i, t.date, t.type,
      t.itemCode||'SET',
      t.itemName||(t.setQty?`CST ${t.setQty}SET 출하`:''),
      t.type==='출하계획'?`${t.setQty} SET`:`${t.quantity} EA`,
      t.memo||''
    ])
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{wch:6},{wch:12},{wch:8},{wch:8},{wch:36},{wch:12},{wch:30}]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '입출고이력')
  XLSX.writeFile(wb, `CST_입출고이력_${today}.xlsx`)
}

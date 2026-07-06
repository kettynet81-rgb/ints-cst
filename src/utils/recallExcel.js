import * as XLSX from 'xlsx'

// 셀 스타일 헬퍼
const style = (opts) => opts

export function downloadRecallTemplate() {
  const wb = XLSX.utils.book_new()
  wb.Props = { Title: 'CST 리콜수리 입력양식', Company: '㈜아이엔티에스' }

  const aoa = [
    // 1행: 회사/제목
    ['㈜아이엔티에스 · C-CASSETTE 리콜 수리 현황', '', '', '', '', '', ''],
    // 2행: 빈 행
    ['', '', '', '', '', '', ''],
    // 3행: 작성 안내
    ['※ 교체항목 복수 입력 시 쉼표로 구분 (예: 견시창 교체, RFID 교체)', '', '', '', '', '', ''],
    ['※ 날짜 형식: YYYY-MM-DD (예: 2026-07-07)', '', '', '', '', '', ''],
    ['※ 유·무상: 유상 또는 무상 입력', '', '', '', '', '', ''],
    // 6행: 빈 행
    ['', '', '', '', '', '', ''],
    // 7행: 헤더
    ['RFID NO', '교체 항목', '유·무상', '차수', '반출일', '반입일', '비고'],
    // 8행: 예시 (흐리게 표시됨 - 삭제 후 실제 데이터 입력)
    ['▶ 예시) IFZD412', '견시창 교체, RFID 교체', '유상', '12차', '2026-07-07', '2026-07-10', 'RFID 구형'],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 컬럼 너비
  ws['!cols'] = [
    {wch:14}, {wch:32}, {wch:8}, {wch:8}, {wch:13}, {wch:13}, {wch:20}
  ]

  // 행 높이
  ws['!rows'] = [
    {hpt:28}, {hpt:6}, {hpt:16}, {hpt:16}, {hpt:16},
    {hpt:8}, {hpt:22}, {hpt:20}
  ]

  // 병합: 제목행
  ws['!merges'] = [
    { s:{r:0,c:0}, e:{r:0,c:6} },
    { s:{r:2,c:0}, e:{r:2,c:6} },
    { s:{r:3,c:0}, e:{r:3,c:6} },
    { s:{r:4,c:0}, e:{r:4,c:6} },
  ]

  // 스타일 적용
  // 제목
  ws['A1'].s = {
    font:      { bold:true, sz:14, color:{rgb:'FFFFFF'} },
    fill:      { fgColor:{rgb:'1E293B'} },
    alignment: { horizontal:'center', vertical:'center' },
  }

  // 안내문구
  ;['A3','A4','A5'].forEach(addr => {
    if (ws[addr]) ws[addr].s = {
      font:      { sz:9, color:{rgb:'6B7280'}, italic:true },
      fill:      { fgColor:{rgb:'F8FAFC'} },
    }
  })

  // 헤더 행
  const headerCols = ['A7','B7','C7','D7','E7','F7','G7']
  const headerColors = {
    'A7':'1E40AF', 'B7':'1E40AF', 'C7':'DC2626',
    'D7':'6B21A8', 'E7':'065F46', 'F7':'92400E', 'G7':'374151'
  }
  headerCols.forEach(addr => {
    ws[addr].s = {
      font:      { bold:true, sz:11, color:{rgb:'FFFFFF'} },
      fill:      { fgColor:{rgb: headerColors[addr]||'1E293B'} },
      alignment: { horizontal:'center', vertical:'center' },
      border: {
        bottom: { style:'medium', color:{rgb:'FFFFFF'} }
      }
    }
  })

  // 예시 행 - 흐리게 (삭제하고 입력하라는 표시)
  'ABCDEFG'.split('').forEach(col => {
    const addr = `${col}8`
    if (!ws[addr]) ws[addr] = {v:'', t:'s'}
    ws[addr].s = {
      fill:      { fgColor:{rgb:'F1F5F9'} },
      font:      { color:{rgb:'94A3B8'}, italic:true, sz:10 },
      alignment: { horizontal: ['C','D'].includes(col)?'center':'left', vertical:'center' },
      border:    { bottom:{ style:'dashed', color:{rgb:'CBD5E1'} } }
    }
  })

  XLSX.utils.book_append_sheet(wb, ws, '리콜수리 입력양식')
  XLSX.writeFile(wb, 'CST_리콜수리_입력양식.xlsx')
}

export function downloadRecallExcel(filtered, roundFilter) {
  const wb = XLSX.utils.book_new()
  wb.Props = { Title: 'CST 리콜 수리 현황', Company: '㈜아이엔티에스' }

  const today = new Date().toLocaleDateString('ko-KR')
  const paidCount = filtered.filter(r=>r.payType==='유상').length
  const freeCount = filtered.filter(r=>r.payType==='무상').length

  const aoa = [
    [`㈜아이엔티에스 · C-CASSETTE 리콜 수리 현황 ${roundFilter!=='전체'?'- '+roundFilter:''}`, '', '', '', '', '', '', ''],
    [`출력일: ${today}   유상 ${paidCount}EA / 무상 ${freeCount}EA / 합계 ${filtered.length}EA`, '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['NO', 'RFID NO', '교체 항목', '유·무상', '차수', '반출일', '반입일', '비고'],
    ...filtered.map((r,i) => [
      i+1, r.rfid,
      (Array.isArray(r.repairItems)?r.repairItems:[r.repairItem||'']).join(', '),
      r.payType, r.round, r.outDate||'', r.inDate||'', r.memo||''
    ]),
    ['', '', '', '', '', '', '', ''],
    ['합계', `${filtered.length}EA`, '', `유상 ${paidCount} / 무상 ${freeCount}`, '', '', `미반입 ${filtered.filter(r=>!r.inDate).length}EA`, ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  ws['!cols'] = [{wch:5},{wch:12},{wch:32},{wch:8},{wch:8},{wch:13},{wch:13},{wch:20}]
  ws['!rows'] = [{hpt:26},{hpt:18},{hpt:6},{hpt:22},...filtered.map(()=>({hpt:18})),{hpt:6},{hpt:20}]
  ws['!merges'] = [
    {s:{r:0,c:0},e:{r:0,c:7}},
    {s:{r:1,c:0},e:{r:1,c:7}},
  ]

  // 제목
  ws['A1'].s = { font:{bold:true,sz:14,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'1E293B'}}, alignment:{horizontal:'center',vertical:'center'} }
  // 부제
  if (ws['A2']) ws['A2'].s = { font:{sz:10,color:{rgb:'6B7280'}}, fill:{fgColor:{rgb:'F8FAFC'}}, alignment:{horizontal:'center'} }

  // 헤더
  const hcols = ['A4','B4','C4','D4','E4','F4','G4','H4']
  hcols.forEach(addr => {
    if (!ws[addr]) return
    ws[addr].s = { font:{bold:true,sz:11,color:{rgb:'FFFFFF'}}, fill:{fgColor:{rgb:'1E293B'}}, alignment:{horizontal:'center',vertical:'center'} }
  })

  // 데이터 행
  for (let i = 0; i < filtered.length; i++) {
    const rowNum = i + 5
    const bg = i % 2 === 0 ? 'FFFFFF' : 'F8FAFC'
    const r = filtered[i]
    'ABCDEFGH'.split('').forEach((col, ci) => {
      const addr = `${col}${rowNum}`
      if (!ws[addr]) ws[addr] = {v:'', t:'s'}
      ws[addr].s = {
        fill: { fgColor:{rgb: !r.inDate?'FFFBEB':bg} },
        alignment: { horizontal:['A','D','E'].includes(col)?'center':'left', vertical:'center' },
        border: { bottom:{style:'thin',color:{rgb:'E5E7EB'}} },
        font: col==='B' ? {bold:true,color:{rgb:'1E40AF'}} :
              col==='D' ? {bold:true,color:{rgb:r.payType==='유상'?'DC2626':'2563EB'}} : {}
      }
    })
  }

  // 합계 행
  const sumRow = filtered.length + 6
  if (ws[`A${sumRow}`]) ws[`A${sumRow}`].s = { font:{bold:true}, fill:{fgColor:{rgb:'1E293B'}}, alignment:{horizontal:'center'} }

  const label = roundFilter !== '전체' ? roundFilter : '전체'
  XLSX.utils.book_append_sheet(wb, ws, `리콜현황_${label}`)
  XLSX.writeFile(wb, `INTS_CST_리콜현황_${label}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`)
}

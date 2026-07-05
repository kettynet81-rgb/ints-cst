import { useState, useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function PrintModal({ transactions, stockMap, onClose }) {
  const [type, setType]       = useState('stock')   // stock | history | shipment
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]   = useState('')
  const [baseQty, setBaseQty] = useState('112')

  const base = Number(baseQty) || 0

  // 재고현황 데이터
  const stockData = useMemo(() => ITEMS.map(item => {
    const stock = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    const surplus = stock - item.needPerSet * base
    const status = stock === 0 ? '재고없음' : assemblable < 50 ? '발주필요' : '정상'
    return { ...item, stock, assemblable, surplus, status }
  }), [stockMap, base])

  // 이력 데이터
  const historyData = useMemo(() => {
    return transactions
      .filter(t => (t.type==='입고'||t.type==='출고'))
      .filter(t => !dateFrom || t.date >= dateFrom)
      .filter(t => !dateTo   || t.date <= dateTo)
      .sort((a,b) => b.date.localeCompare(a.date))
  }, [transactions, dateFrom, dateTo])

  // 출하계획 데이터
  const shipData = useMemo(() => {
    return transactions
      .filter(t => t.type==='출하계획' && t.isHeader)
      .filter(t => !dateFrom || t.date >= dateFrom)
      .filter(t => !dateTo   || t.date <= dateTo)
      .sort((a,b) => a.date.localeCompare(b.date))
  }, [transactions, dateFrom, dateTo])

  const handlePrint = () => {
    const printWin = window.open('', '_blank', 'width=1000,height=700')
    const now = new Date().toLocaleDateString('ko-KR')

    let tableHTML = ''

    if (type === 'stock') {
      tableHTML = `
        <h2>부품 재고 현황 (기준 ${base}SET)</h2>
        <p style="color:#666;margin-bottom:12px">출력일: ${now}</p>
        <table>
          <thead><tr>
            <th>코드</th><th>품목명</th><th>필요수량</th>
            <th>현재고</th><th>조립가능(SET)</th>
            <th>과부족(${base}SET)</th><th>상태</th>
          </tr></thead>
          <tbody>
            ${stockData.map((item,i) => `
              <tr class="${item.status==='재고없음'?'red':item.status==='발주필요'?'yellow':''}">
                <td class="center">${item.code}</td>
                <td>${item.name}</td>
                <td class="center">${item.needPerSet}</td>
                <td class="right"><b>${item.stock.toLocaleString()}</b></td>
                <td class="right ${item.assemblable<50?'red-text':''}">${item.assemblable.toLocaleString()}</td>
                <td class="right ${item.surplus<0?'red-text':'green-text'}">${item.surplus>=0?'+':''}${item.surplus.toLocaleString()}</td>
                <td class="center ${item.status==='재고없음'?'red-text':item.status==='발주필요'?'orange-text':'green-text'}">${item.status}</td>
              </tr>`).join('')}
          </tbody>
        </table>`

    } else if (type === 'history') {
      tableHTML = `
        <h2>입출고 이력${dateFrom||dateTo ? ` (${dateFrom||'전체'} ~ ${dateTo||'전체'})` : ''}</h2>
        <p style="color:#666;margin-bottom:12px">출력일: ${now} · 총 ${historyData.length}건</p>
        <table>
          <thead><tr>
            <th>날짜</th><th>구분</th><th>코드</th><th>품목명</th><th>수량(EA)</th><th>메모</th>
          </tr></thead>
          <tbody>
            ${historyData.map(t => `
              <tr>
                <td class="center">${t.date}</td>
                <td class="center ${t.type==='입고'?'blue-text':'red-text'}">${t.type}</td>
                <td class="center"><b>${t.itemCode}</b></td>
                <td>${t.itemName}</td>
                <td class="right"><b>${t.quantity.toLocaleString()}</b></td>
                <td style="color:#666">${t.memo||''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`

    } else {
      tableHTML = `
        <h2>출하 계획${dateFrom||dateTo ? ` (${dateFrom||'전체'} ~ ${dateTo||'전체'})` : ''}</h2>
        <p style="color:#666;margin-bottom:12px">출력일: ${now} · 총 ${shipData.length}건</p>
        <table>
          <thead><tr>
            <th>출하일</th><th>SET 수량</th><th>상태</th><th>메모</th>
          </tr></thead>
          <tbody>
            ${shipData.map(t => `
              <tr>
                <td class="center"><b>${t.date}</b></td>
                <td class="right" style="font-size:15px"><b>${t.setQty?.toLocaleString()} SET</b></td>
                <td class="center ${t.status==='confirmed'?'green-text':'blue-text'}">${t.status==='confirmed'?'확정':'계획'}</td>
                <td style="color:#666">${t.memo||''}</td>
              </tr>`).join('')}
          </tbody>
        </table>`
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>INTS CST 재고관리 - 인쇄</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'맑은 고딕',sans-serif; font-size:12px; padding:20px; color:#111; }
          .header { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:10px; border-bottom:2px solid #1e293b; }
          .header-left { display:flex; align-items:center; gap:10px; }
          .company { font-size:11px; color:#666; }
          h2 { font-size:16px; font-weight:800; color:#1e293b; margin-bottom:4px; }
          table { width:100%; border-collapse:collapse; font-size:11px; }
          th { background:#1e293b; color:#fff; padding:7px 8px; text-align:center; font-weight:700; white-space:nowrap; }
          td { padding:6px 8px; border-bottom:1px solid #e2e8f0; vertical-align:middle; }
          tr:nth-child(even) { background:#f8fafc; }
          .red    { background:#fff5f5 !important; }
          .yellow { background:#fffdf0 !important; }
          .center { text-align:center; }
          .right  { text-align:right; }
          .red-text    { color:#dc2626; font-weight:700; }
          .green-text  { color:#16a34a; font-weight:700; }
          .blue-text   { color:#1e40af; font-weight:700; }
          .orange-text { color:#d97706; font-weight:700; }
          @media print {
            body { padding:10px; }
            @page { margin:10mm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <div>
              <div style="font-size:18px;font-weight:900;color:#1e40af;letter-spacing:1px">INTS</div>
              <div class="company">㈜아이엔티에스 · C-CST 재고관리</div>
            </div>
          </div>
        </div>
        ${tableHTML}
        <script>window.onload=()=>{window.print()}<\/script>
      </body>
      </html>
    `)
    printWin.document.close()
  }

  return (
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{fontSize:16,fontWeight:700,color:'#0f172a'}}>🖨 인쇄 설정</div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {/* 인쇄 항목 선택 */}
          <div style={S.section}>
            <div style={S.sectionLabel}>인쇄 항목</div>
            <div style={S.typeRow}>
              {[
                {id:'stock',   label:'📊 재고 현황'},
                {id:'history', label:'📋 입출고 이력'},
                {id:'shipment',label:'📦 출하 계획'},
              ].map(t => (
                <button key={t.id} style={type===t.id ? S.typeActive : S.typeBtn}
                  onClick={()=>setType(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 재고현황: 기준 SET */}
          {type === 'stock' && (
            <div style={S.section}>
              <div style={S.sectionLabel}>기준 SET (과부족 계산용)</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="number" value={baseQty} onChange={e=>setBaseQty(e.target.value)}
                  style={{...S.inp, width:100}} />
                <span style={{fontSize:13,color:'#64748b'}}>SET</span>
              </div>
            </div>
          )}

          {/* 날짜 범위 */}
          {(type === 'history' || type === 'shipment') && (
            <div style={S.section}>
              <div style={S.sectionLabel}>날짜 범위</div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <input type="text" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  placeholder="시작일 (예: 2026-07-01)"
                  style={{...S.inp, width:180}} />
                <span style={{color:'#94a3b8'}}>~</span>
                <input type="text" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  placeholder="종료일 (예: 2026-07-31)"
                  style={{...S.inp, width:180}} />
              </div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:6}}>
                {type==='history' ? `${historyData.length}건` : `${shipData.length}건`} 해당
              </div>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>취소</button>
          <button style={S.printBtn} onClick={handlePrint}>🖨 인쇄 미리보기</button>
        </div>
      </div>
    </div>
  )
}

const S = {
  overlay:   {position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000},
  modal:     {background:'#fff',borderRadius:12,width:520,boxShadow:'0 20px 60px rgba(0,0,0,0.25)',overflow:'hidden'},
  header:    {padding:'18px 22px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'},
  closeBtn:  {background:'none',border:'none',fontSize:16,color:'#94a3b8',cursor:'pointer'},
  body:      {padding:'20px 22px',display:'flex',flexDirection:'column',gap:20},
  section:   {display:'flex',flexDirection:'column',gap:8},
  sectionLabel:{fontSize:11,fontWeight:700,color:'#64748b',letterSpacing:0.5,textTransform:'uppercase'},
  typeRow:   {display:'flex',gap:8},
  typeBtn:   {padding:'9px 16px',border:'1.5px solid #e2e8f0',borderRadius:7,background:'#fff',color:'#475569',cursor:'pointer',fontFamily:'inherit',fontWeight:500,fontSize:13},
  typeActive:{padding:'9px 16px',border:'1.5px solid #1e40af',borderRadius:7,background:'#eff6ff',color:'#1e40af',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13},
  inp:       {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b'},
  footer:    {padding:'16px 22px',borderTop:'1px solid #f1f5f9',display:'flex',justifyContent:'flex-end',gap:8},
  cancelBtn: {padding:'9px 20px',border:'1.5px solid #e2e8f0',borderRadius:7,background:'#fff',color:'#475569',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:13},
  printBtn:  {padding:'9px 24px',border:'none',borderRadius:7,background:'#1e40af',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:13},
}

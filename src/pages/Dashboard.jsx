import { useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function Dashboard({ transactions, stockMap, onInbound, onSetOut }) {
  const itemStats = useMemo(() => ITEMS.map(item => {
    const stock = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    const status = stock === 0 ? 'empty' : assemblable < 50 ? 'low' : 'ok'
    return { ...item, stock, assemblable, status }
  }), [stockMap])

  const minSet      = Math.min(...itemStats.map(i => i.assemblable))
  const emptyCount  = itemStats.filter(i => i.status === 'empty').length
  const lowCount    = itemStats.filter(i => i.status === 'low').length
  const today       = new Date().toISOString().slice(0, 10)
  const todayInQty  = transactions.filter(t => t.date === today && t.type === '입고').reduce((s,t) => s+t.quantity, 0)

  const recent = [...transactions]
    .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0))
    .slice(0, 12)

  const kpis = [
    { label:'조립가능 SET', value: minSet, unit:'SET', sub:'현재고 기준 최솟값', color:'#1e40af', bg:'#eff6ff', border:'#bfdbfe', big:true },
    { label:'재고없음',     value: emptyCount, unit:'품목', sub:'즉시 발주 필요', color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
    { label:'발주 필요',    value: lowCount,   unit:'품목', sub:'50SET 미만',      color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
    { label:'오늘 입고',    value: todayInQty, unit:'EA',   sub: today,           color:'#059669', bg:'#f0fdf4', border:'#bbf7d0' },
  ]

  return (
    <div style={S.wrap}>
      {/* KPI */}
      <div style={S.kpiGrid}>
        {kpis.map(k => (
          <div key={k.label} style={{...S.kpiCard, background:k.bg, border:`1px solid ${k.border}`}}>
            <div style={{...S.kpiVal, color:k.color, fontSize: k.big ? 38 : 30}}>{k.value.toLocaleString()}</div>
            <div style={{...S.kpiUnit, color:k.color}}>{k.unit}</div>
            <div style={S.kpiLabel}>{k.label}</div>
            <div style={S.kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* 하단 그리드 */}
      <div style={S.grid}>
        {/* 재고 테이블 */}
        <div style={S.card}>
          <div style={S.cardHead}>
            <div>
              <div style={S.cardTitle}>부품 재고 현황</div>
              <div style={S.cardSub}>A1 ~ A29 · 전체 {ITEMS.length}개 품목</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <LegendDot color="#dc2626" label="재고없음"/>
              <LegendDot color="#d97706" label="발주필요"/>
              <LegendDot color="#16a34a" label="정상"/>
            </div>
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['코드','품목명','필요','현재고','조립가능','상태'].map((h,i) => (
                    <th key={h} style={{...S.th, textAlign: i===1?'left':'center'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemStats.map((item, i) => {
                  const rowBg = item.status==='empty' ? '#fff5f5' : item.status==='low' ? '#fffdf0' : i%2===0 ? '#f8fafc' : '#fff'
                  return (
                    <tr key={item.code} style={{background:rowBg}}>
                      <td style={{...S.td,textAlign:'center'}}>
                        <span style={S.codeTag}>{item.code}</span>
                      </td>
                      <td style={{...S.td,textAlign:'left',maxWidth:200}}>{item.name}</td>
                      <td style={{...S.td,textAlign:'center',color:'#94a3b8',fontSize:12}}>{item.needPerSet}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{item.stock.toLocaleString()}</td>
                      <td style={{...S.td,textAlign:'center',fontWeight:700,
                        color:item.status==='empty'?'#dc2626':item.status==='low'?'#d97706':'#16a34a',
                        fontVariantNumeric:'tabular-nums'}}>
                        {item.assemblable.toLocaleString()}
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        {item.status==='empty' && <Badge c="#dc2626" bg="#fee2e2" t="재고없음"/>}
                        {item.status==='low'   && <Badge c="#d97706" bg="#fef3c7" t="발주필요"/>}
                        {item.status==='ok'    && <Badge c="#16a34a" bg="#dcfce7" t="정상"/>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 최근 이력 */}
        <div style={S.sideCard}>
          <div style={S.cardHead}>
            <div>
              <div style={S.cardTitle}>최근 입출고</div>
              <div style={S.cardSub}>최신 12건</div>
            </div>
          </div>
          <div style={{overflowY:'auto',flex:1}}>
            {recent.length === 0 && (
              <div style={{padding:32,textAlign:'center',color:'#94a3b8',fontSize:13}}>기록 없음</div>
            )}
            {recent.map((tx, i) => (
              <div key={i} style={{...S.actRow, borderBottom: i<recent.length-1?'1px solid #f1f5f9':'none'}}>
                <div style={{...S.actDot, background: tx.type==='입고'?'#3b82f6':'#f97316'}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      [{tx.itemCode}] {tx.itemName}
                    </span>
                    <span style={tx.type==='입고' ? S.tagIn : S.tagOut}>{tx.type}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
                    <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{tx.quantity.toLocaleString()} EA</span>
                    <span style={{fontSize:11,color:'#94a3b8'}}>{tx.date}</span>
                  </div>
                  {tx.memo && <div style={{fontSize:11,color:'#94a3b8',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tx.memo}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Badge({ c, bg, t }) {
  return <span style={{background:bg,color:c,padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,letterSpacing:0.3}}>{t}</span>
}
function LegendDot({ color, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#64748b'}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:color,flexShrink:0}}/>
      {label}
    </div>
  )
}

const S = {
  wrap: { display:'flex', flexDirection:'column', gap:20, height:'100%' },
  kpiGrid: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 },
  kpiCard: { borderRadius:10, padding:'18px 20px' },
  kpiVal:  { fontWeight:800, lineHeight:1, marginBottom:2 },
  kpiUnit: { fontSize:12, fontWeight:700, marginBottom:8 },
  kpiLabel:{ fontSize:14, fontWeight:700, color:'#1e293b', marginBottom:3 },
  kpiSub:  { fontSize:11, color:'#94a3b8' },

  grid: { display:'grid', gridTemplateColumns:'1fr 300px', gap:16, flex:1, minHeight:0 },
  card: { background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', overflow:'hidden' },
  sideCard: { background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', overflow:'hidden' },
  cardHead: { padding:'14px 18px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  cardTitle:{ fontSize:14, fontWeight:700, color:'#0f172a' },
  cardSub:  { fontSize:11, color:'#94a3b8', marginTop:2 },

  tableWrap:{ overflowY:'auto', flex:1 },
  table:    { width:'100%', borderCollapse:'collapse' },
  th: { background:'#1e293b', color:'#94a3b8', padding:'9px 14px', fontSize:11, fontWeight:600, position:'sticky', top:0, whiteSpace:'nowrap', letterSpacing:0.5 },
  td: { padding:'8px 14px', fontSize:13, color:'#1e293b', borderBottom:'1px solid #f8fafc' },
  codeTag: { background:'#eff6ff', color:'#1e40af', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:800 },

  actRow: { display:'flex', gap:10, padding:'10px 16px', alignItems:'flex-start' },
  actDot: { width:8, height:8, borderRadius:'50%', flexShrink:0, marginTop:4 },
  tagIn:  { background:'#dbeafe', color:'#1e40af', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:700, flexShrink:0 },
  tagOut: { background:'#ffedd5', color:'#ea580c', padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:700, flexShrink:0 },
}

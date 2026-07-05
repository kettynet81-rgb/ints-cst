import { useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function Dashboard({ transactions, stockMap }) {
  const itemStats = useMemo(() => ITEMS.map(item => {
    const stock = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    const status = stock === 0 ? 'empty' : assemblable < 50 ? 'low' : 'ok'
    return { ...item, stock, assemblable, status }
  }), [stockMap])

  const minSet     = Math.min(...itemStats.map(i => i.assemblable))
  const emptyCount = itemStats.filter(i => i.status === 'empty').length
  const lowCount   = itemStats.filter(i => i.status === 'low').length

  return (
    <div style={S.wrap}>
      {/* 상단 요약 바 */}
      <div style={S.summaryBar}>
        <div style={S.sumItem}>
          <span style={S.sumLabel}>조립가능 SET</span>
          <span style={{...S.sumVal, color:'#1e40af'}}>{minSet.toLocaleString()} SET</span>
        </div>
        <div style={S.sumDivider}/>
        <div style={S.sumItem}>
          <span style={S.sumLabel}>재고없음</span>
          <span style={{...S.sumVal, color:'#dc2626'}}>{emptyCount}품목</span>
        </div>
        <div style={S.sumDivider}/>
        <div style={S.sumItem}>
          <span style={S.sumLabel}>발주필요 (50SET↓)</span>
          <span style={{...S.sumVal, color:'#d97706'}}>{lowCount}품목</span>
        </div>
        <div style={S.sumDivider}/>
        <div style={S.sumItem}>
          <span style={S.sumLabel}>전체 품목</span>
          <span style={{...S.sumVal, color:'#374151'}}>{ITEMS.length}개</span>
        </div>
      </div>

      {/* 재고 테이블 */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <div>
            <div style={S.cardTitle}>부품 재고 현황</div>
            <div style={S.cardSub}>C-CST 원부자재 A1 ~ A29</div>
          </div>
          <div style={{display:'flex',gap:10}}>
            <LegendDot color="#dc2626" label="재고없음"/>
            <LegendDot color="#d97706" label="발주필요"/>
            <LegendDot color="#16a34a" label="정상"/>
          </div>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['코드','품목명','1SET 필요수량','현재고','조립가능 (SET)','상태'].map((h,i) => (
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
                    <td style={{...S.td,textAlign:'left'}}>{item.name}</td>
                    <td style={{...S.td,textAlign:'center',color:'#94a3b8'}}>{item.needPerSet}</td>
                    <td style={{...S.td,textAlign:'right',fontWeight:700,fontVariantNumeric:'tabular-nums',fontSize:14}}>
                      {item.stock.toLocaleString()}
                    </td>
                    <td style={{...S.td,textAlign:'center',fontWeight:800,fontSize:14,
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
    </div>
  )
}

function Badge({ c, bg, t }) {
  return <span style={{background:bg,color:c,padding:'3px 10px',borderRadius:4,fontSize:11,fontWeight:700}}>{t}</span>
}
function LegendDot({ color, label }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'#64748b'}}>
      <div style={{width:8,height:8,borderRadius:'50%',background:color}}/>
      {label}
    </div>
  )
}

const S = {
  wrap: { display:'flex', flexDirection:'column', gap:16, height:'100%' },

  summaryBar: { background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'14px 24px', display:'flex', alignItems:'center', gap:0 },
  sumItem:    { display:'flex', flexDirection:'column', gap:3, padding:'0 24px' },
  sumLabel:   { fontSize:11, color:'#94a3b8', fontWeight:600, letterSpacing:0.5 },
  sumVal:     { fontSize:20, fontWeight:800 },
  sumDivider: { width:1, height:36, background:'#e2e8f0', flexShrink:0 },

  card:     { background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden' },
  cardHead: { padding:'14px 20px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  cardTitle:{ fontSize:14, fontWeight:700, color:'#0f172a' },
  cardSub:  { fontSize:11, color:'#94a3b8', marginTop:2 },

  tableWrap:{ overflowY:'auto', flex:1 },
  table:    { width:'100%', borderCollapse:'collapse' },
  th: { background:'#1e293b', color:'#94a3b8', padding:'10px 16px', fontSize:11, fontWeight:700, position:'sticky', top:0, whiteSpace:'nowrap', letterSpacing:0.8 },
  td: { padding:'9px 16px', fontSize:13, color:'#1e293b', borderBottom:'1px solid #f1f5f9' },
  codeTag: { background:'#eff6ff', color:'#1e40af', padding:'2px 9px', borderRadius:4, fontSize:11, fontWeight:800 },
}

import { useMemo } from 'react'
import { ITEMS } from '../data/items'

export default function Dashboard({ transactions, onInbound, onSetOut }) {
  // 품목별 재고 계산
  const stockMap = useMemo(() => {
    const map = {}
    for (const tx of transactions) {
      if (!map[tx.itemCode]) map[tx.itemCode] = 0
      map[tx.itemCode] += tx.type === '입고' ? tx.quantity : -tx.quantity
    }
    return map
  }, [transactions])

  // 품목별 조립가능 SET
  const itemStats = useMemo(() => ITEMS.map(item => {
    const stock = stockMap[item.code] || 0
    const assemblable = Math.floor(stock / item.needPerSet)
    return { ...item, stock, assemblable }
  }), [stockMap])

  const minAssemblable = Math.min(...itemStats.map(i => i.assemblable))
  const noStockCount   = itemStats.filter(i => i.stock === 0).length
  const lowStockCount  = itemStats.filter(i => i.stock > 0 && i.assemblable < 50).length

  // 오늘 입고 건수
  const today = new Date().toISOString().slice(0, 10)
  const todayIn = transactions.filter(t => t.date === today && t.type === '입고').length

  // 최근 이력 10건
  const recent = [...transactions]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 10)

  return (
    <div style={S.wrap}>
      {/* 상단 버튼 바 */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>재고 현황 대시보드</div>
          <div style={S.pageDate}>{new Date().toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric',weekday:'long'})}</div>
        </div>
        <div style={S.btnGroup}>
          <button style={S.btnIn} onClick={onInbound}>
            <span style={S.btnIcon}>📥</span> 입고 입력
          </button>
          <button style={S.btnOut} onClick={onSetOut}>
            <span style={S.btnIcon}>📦</span> SET 출고
          </button>
        </div>
      </div>

      {/* KPI 카드 */}
      <div style={S.kpiRow}>
        <KpiCard label="조립가능 SET" value={minAssemblable} unit="SET"
          color="#1e40af" bg="#eff6ff" desc="현재 재고 기준 최소" big />
        <KpiCard label="재고없음" value={noStockCount} unit="품목"
          color="#dc2626" bg="#fff1f2" desc="즉시 발주 필요" />
        <KpiCard label="발주 필요" value={lowStockCount} unit="품목"
          color="#d97706" bg="#fffbeb" desc="50SET 미만" />
        <KpiCard label="오늘 입고" value={todayIn} unit="건"
          color="#059669" bg="#f0fdf4" desc={today} />
      </div>

      {/* 재고현황 테이블 + 최근이력 */}
      <div style={S.mainGrid}>
        {/* 재고현황 */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>부품 재고 현황</span>
            <span style={S.cardSub}>{ITEMS.length}개 품목</span>
          </div>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['코드','품목명','필요수량','현재고','조립가능','상태'].map(h => (
                    <th key={h} style={h==='품목명' ? {...S.th,textAlign:'left'} : S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemStats.map((item, i) => {
                  const status = item.stock === 0 ? 'empty'
                    : item.assemblable < 50 ? 'low' : 'ok'
                  const rowBg = status === 'empty' ? '#fff5f5'
                    : status === 'low' ? '#fffdf0' : (i%2===0 ? '#f8fafc' : '#fff')
                  return (
                    <tr key={item.code} style={{background:rowBg}}>
                      <td style={{...S.td,fontWeight:700,color:'#1e40af',textAlign:'center'}}>{item.code}</td>
                      <td style={{...S.td,maxWidth:220}}>{item.name}</td>
                      <td style={{...S.td,textAlign:'center',color:'#64748b'}}>{item.needPerSet}</td>
                      <td style={{...S.td,textAlign:'right',fontWeight:600}}>{item.stock.toLocaleString()}</td>
                      <td style={{...S.td,textAlign:'center',fontWeight:700,
                        color: item.assemblable === 0 ? '#dc2626' : item.assemblable < 50 ? '#d97706' : '#16a34a'}}>
                        {item.assemblable.toLocaleString()}
                      </td>
                      <td style={{...S.td,textAlign:'center'}}>
                        {status === 'empty' && <Badge text="재고없음" color="#dc2626" bg="#fee2e2" />}
                        {status === 'low'   && <Badge text="발주필요" color="#d97706" bg="#fef3c7" />}
                        {status === 'ok'    && <Badge text="정상"     color="#16a34a" bg="#dcfce7" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 최근 입출고 */}
        <div style={S.sideCard}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>최근 입출고</span>
            <span style={S.cardSub}>최신 10건</span>
          </div>
          <div style={S.activityList}>
            {recent.length === 0 && (
              <div style={S.empty}>입출고 기록이 없습니다</div>
            )}
            {recent.map((tx, i) => (
              <div key={i} style={S.actItem}>
                <div style={tx.type==='입고' ? S.dotIn : S.dotOut} />
                <div style={S.actContent}>
                  <div style={S.actTop}>
                    <span style={{fontWeight:600,fontSize:13}}>[{tx.itemCode}] {tx.itemName}</span>
                    <span style={tx.type==='입고' ? S.tagIn : S.tagOut}>{tx.type}</span>
                  </div>
                  <div style={S.actBot}>
                    <span style={S.actQty}>{tx.quantity.toLocaleString()} EA</span>
                    <span style={S.actDate}>{tx.date}</span>
                  </div>
                  {tx.memo && <div style={S.actMemo}>{tx.memo}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function KpiCard({ label, value, unit, color, bg, desc, big }) {
  return (
    <div style={{...S.kpiCard, background: bg, borderLeft:`4px solid ${color}`}}>
      <div style={{...S.kpiValue, color, fontSize: big ? 40 : 32}}>{value.toLocaleString()}</div>
      <div style={{...S.kpiUnit, color}}>{unit}</div>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiDesc}>{desc}</div>
    </div>
  )
}

function Badge({ text, color, bg }) {
  return <span style={{background:bg,color,padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700}}>{text}</span>
}

const S = {
  wrap: { padding:28, minHeight:'100%' },
  topBar: { display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24 },
  pageTitle: { fontSize:22,fontWeight:700,color:'#0f172a' },
  pageDate: { fontSize:13,color:'#64748b',marginTop:3 },
  btnGroup: { display:'flex',gap:10 },
  btnIn: { display:'flex',alignItems:'center',gap:6,padding:'11px 22px',background:'#1e40af',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14,boxShadow:'0 4px 12px rgba(30,64,175,0.35)' },
  btnOut: { display:'flex',alignItems:'center',gap:6,padding:'11px 22px',background:'#065f46',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontWeight:700,fontSize:14,boxShadow:'0 4px 12px rgba(6,95,70,0.35)' },
  btnIcon: { fontSize:16 },
  kpiRow: { display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,marginBottom:24 },
  kpiCard: { background:'#fff',borderRadius:10,padding:'20px 22px',boxShadow:'0 1px 4px rgba(0,0,0,0.08)' },
  kpiValue: { fontWeight:800,lineHeight:1 },
  kpiUnit: { fontSize:13,fontWeight:600,marginTop:2,marginBottom:6 },
  kpiLabel: { fontSize:14,fontWeight:700,color:'#1e293b',marginBottom:2 },
  kpiDesc: { fontSize:11,color:'#94a3b8' },
  mainGrid: { display:'grid',gridTemplateColumns:'1fr 320px',gap:20,alignItems:'start' },
  card: { background:'#fff',borderRadius:10,boxShadow:'0 1px 4px rgba(0,0,0,0.08)',overflow:'hidden' },
  sideCard: { background:'#fff',borderRadius:10,boxShadow:'0 1px 4px rgba(0,0,0,0.08)',overflow:'hidden' },
  cardHeader: { padding:'16px 20px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center' },
  cardTitle: { fontWeight:700,fontSize:15,color:'#0f172a' },
  cardSub: { fontSize:12,color:'#94a3b8' },
  tableWrap: { overflowX:'auto',maxHeight:560,overflowY:'auto' },
  table: { width:'100%',borderCollapse:'collapse' },
  th: { background:'#1e293b',color:'#fff',padding:'10px 14px',fontSize:12,fontWeight:600,textAlign:'center',position:'sticky',top:0,whiteSpace:'nowrap' },
  td: { padding:'9px 14px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9' },
  activityList: { padding:'4px 0',maxHeight:560,overflowY:'auto' },
  actItem: { display:'flex',gap:12,padding:'12px 18px',borderBottom:'1px solid #f8fafc',alignItems:'flex-start' },
  dotIn: { width:10,height:10,borderRadius:'50%',background:'#3b82f6',marginTop:4,flexShrink:0 },
  dotOut: { width:10,height:10,borderRadius:'50%',background:'#f97316',marginTop:4,flexShrink:0 },
  actContent: { flex:1,minWidth:0 },
  actTop: { display:'flex',justifyContent:'space-between',alignItems:'center',gap:6,marginBottom:3 },
  actBot: { display:'flex',justifyContent:'space-between',alignItems:'center' },
  tagIn: { background:'#dbeafe',color:'#1d4ed8',padding:'1px 8px',borderRadius:12,fontSize:11,fontWeight:600,flexShrink:0 },
  tagOut: { background:'#ffedd5',color:'#ea580c',padding:'1px 8px',borderRadius:12,fontSize:11,fontWeight:600,flexShrink:0 },
  actQty: { fontSize:13,fontWeight:700,color:'#0f172a' },
  actDate: { fontSize:11,color:'#94a3b8' },
  actMemo: { fontSize:11,color:'#94a3b8',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' },
  empty: { padding:32,textAlign:'center',color:'#94a3b8',fontSize:14 },
}

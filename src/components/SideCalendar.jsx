import { useState, useMemo } from 'react'
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// 2026년 대한민국 공휴일 (제헌절 7/17 제외 - 2008년부터 공휴일 아님)
const HOLIDAYS = {
  // ── 2026 법정 공휴일
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체휴무',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체휴무',
  '2026-06-06': '현충일',
  '2026-06-08': '현충일 대체휴무',
  '2026-07-17': '제헌절 (기념일)',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체휴무',
  '2026-10-02': '추석 연휴',
  '2026-10-03': '추석·개천절',
  '2026-10-04': '추석 연휴',
  '2026-10-05': '추석 대체휴무',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스',
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function SideCalendar({ transactions, onNavigate }) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(null)
  const [modal, setModal]   = useState(null) // { date, plan? }
  const [form, setForm]     = useState({ memo: '', setQty: '' })
  const [saving, setSaving] = useState(false)

  // 출하계획 맵
  const planMap = useMemo(() => {
    const m = {}
    transactions
      .filter(t => t.type === '출하계획' && t.isHeader)
      .forEach(t => {
        if (!m[t.date]) m[t.date] = []
        m[t.date].push(t)
      })
    return m
  }, [transactions])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = today.toISOString().slice(0, 10)

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const dateStr = (d) => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  const openModal = (d) => {
    if (onNavigate) { onNavigate('shipcal'); return }
    const ds = dateStr(d)
    const plans = planMap[ds] || []
    setSelected(ds)
    setModal({ date: ds, plans })
    setForm({ memo: '', setQty: '' })
  }

  const savePlan = async () => {
    if (!form.setQty || Number(form.setQty) <= 0) return
    setSaving(true)
    await addDoc(collection(db, 'transactions'), {
      type: '출하계획', isHeader: true,
      shipmentId: `ship_${Date.now()}`,
      date: modal.date,
      setQty: Number(form.setQty),
      memo: form.memo.trim(),
      status: 'planned',
      itemCode: 'SET', itemName: 'CST SET 출하',
      quantity: Number(form.setQty),
      createdAt: serverTimestamp(),
    })
    setForm({ memo: '', setQty: '' })
    setSaving(false)
  }

  const deletePlan = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    await deleteDoc(doc(db, 'transactions', id))
  }

  const prevMonth = () => { if (month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  const nextMonth = () => { if (month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  return (
    <div style={S.wrap}>
      {/* 헤더 */}
      <div style={S.header}>
        <button style={S.navBtn} onClick={prevMonth}>‹</button>
        <span style={S.title}>{year}년 {MONTHS[month]}</span>
        <button style={S.navBtn} onClick={nextMonth}>›</button>
      </div>

      {/* 요일 */}
      <div style={S.grid}>
        {DAYS.map((d,i) => (
          <div key={d} style={{...S.dayLabel, color: i===0?'#ef4444':i===6?'#60a5fa':'#94a3b8'}}>{d}</div>
        ))}
      </div>

      {/* 날짜 */}
      <div style={S.grid}>
        {cells.map((d, i) => {
          if (!d) return <div key={i}/>
          const ds = dateStr(d)
          const dow = (i) % 7
          const isHoliday = !!HOLIDAYS_2026[ds]
          const isSun = (firstDay + d - 1) % 7 === 0
          const isSat = (firstDay + d - 1) % 7 === 6
          const isToday = ds === todayStr
          const hasPlans = planMap[ds]?.length > 0
          const isSelected = selected === ds

          return (
            <div key={i} onClick={() => openModal(d)}
              style={{
                ...S.cell,
                color: isHoliday||isSun ? '#ef4444' : isSat ? '#60a5fa' : '#e2e8f0',
                background: isSelected ? '#1e40af' : isToday ? '#1e293b' : 'transparent',
                borderRadius: 4,
                fontWeight: isToday ? 700 : 400,
                position: 'relative',
              }}>
              {d}
              {hasPlans && <div style={S.dot}/>}
            </div>
          )
        })}
      </div>

      {/* 범례 */}
      <div style={S.legend}>
        <div style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'#94a3b8'}}>
          <div style={{...S.dot, position:'relative', top:0, right:0}}/>출하계획
        </div>
        {Object.entries(HOLIDAYS_2026)
          .filter(([k]) => k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`))
          .map(([k, v]) => (
            <div key={k} style={{fontSize:9,color:'#ef4444'}}>{k.slice(5)} {v}</div>
          ))}
      </div>

      {/* 날짜 클릭 모달 */}
      {modal && (
        <div style={S.modalBg} onClick={()=>{setModal(null);setSelected(null)}}>
          <div style={S.modal} onClick={e=>e.stopPropagation()}>
            <div style={S.modalTitle}>
              {modal.date}
              {HOLIDAYS_2026[modal.date] && <span style={{color:'#ef4444',fontSize:11,marginLeft:6}}>({HOLIDAYS_2026[modal.date]})</span>}
            </div>

            {/* 기존 계획 */}
            {modal.plans?.map(p => (
              <div key={p.id} style={S.planRow}>
                <span style={{color:'#60a5fa',fontWeight:700}}>{p.setQty} SET</span>
                <span style={{color:'#94a3b8',fontSize:11,flex:1,marginLeft:6}}>{p.memo||''}</span>
                <span style={{color:p.status==='confirmed'?'#22c55e':'#f59e0b',fontSize:10,marginRight:6}}>
                  {p.status==='confirmed'?'확정':'계획'}
                </span>
                {p.status!=='confirmed' && (
                  <button style={S.delBtn} onClick={()=>deletePlan(p.id)}>✕</button>
                )}
              </div>
            ))}

            {/* 새 계획 입력 */}
            <div style={{marginTop:8,display:'flex',gap:4}}>
              <input type="number" value={form.setQty} onChange={e=>setForm(f=>({...f,setQty:e.target.value}))}
                placeholder="SET수" style={{...S.inp, width:52}}/>
              <input type="text" value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))}
                placeholder="메모" style={{...S.inp, flex:1}}
                onKeyDown={e=>e.key==='Enter'&&savePlan()}/>
              <button style={S.addBtn} onClick={savePlan} disabled={saving}>+</button>
            </div>
            <button style={S.closeBtn} onClick={()=>{setModal(null);setSelected(null)}}>닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap:    {padding:'10px 8px',borderTop:'1px solid #1e293b'},
  header:  {display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6},
  title:   {fontSize:12,fontWeight:700,color:'#e2e8f0'},
  navBtn:  {background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:16,padding:'0 4px'},
  grid:    {display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1},
  dayLabel:{fontSize:9,textAlign:'center',padding:'2px 0',fontWeight:600},
  cell:    {fontSize:10,textAlign:'center',padding:'3px 0',cursor:'pointer',minHeight:20},
  dot:     {position:'absolute',bottom:1,right:1,width:4,height:4,borderRadius:'50%',background:'#22c55e'},
  legend:  {marginTop:6,display:'flex',flexDirection:'column',gap:2,padding:'4px 0',borderTop:'1px solid #1e293b'},

  modalBg: {position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'},
  modal:   {background:'#1e293b',borderRadius:10,padding:14,minWidth:220,maxWidth:260,boxShadow:'0 8px 32px rgba(0,0,0,0.4)'},
  modalTitle:{fontSize:13,fontWeight:700,color:'#e2e8f0',marginBottom:8,paddingBottom:6,borderBottom:'1px solid #334155'},
  planRow: {display:'flex',alignItems:'center',background:'#0f172a',borderRadius:5,padding:'5px 8px',marginBottom:4},
  inp:     {padding:'5px 7px',background:'#0f172a',border:'1px solid #334155',borderRadius:5,fontSize:12,color:'#e2e8f0',fontFamily:'inherit',outline:'none'},
  addBtn:  {padding:'5px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:5,cursor:'pointer',fontWeight:700,fontSize:14,fontFamily:'inherit'},
  delBtn:  {background:'none',border:'none',color:'#64748b',cursor:'pointer',fontSize:12},
  closeBtn:{marginTop:8,width:'100%',padding:'6px',background:'#334155',color:'#94a3b8',border:'none',borderRadius:5,cursor:'pointer',fontSize:12,fontFamily:'inherit'},
}

import { useState, useMemo } from 'react'
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

// 2026 공휴일 (제헌절 7/17 제외 - 2008년부터 공휴일 아님, 기념일로만 표시)
const HOLIDAYS = {
  '2026-01-01': { name:'신정', type:'holiday' },
  '2026-02-16': { name:'설날 연휴', type:'holiday' },
  '2026-02-17': { name:'설날', type:'holiday' },
  '2026-02-18': { name:'설날 연휴', type:'holiday' },
  '2026-03-01': { name:'삼일절', type:'holiday' },
  '2026-05-05': { name:'어린이날', type:'holiday' },
  '2026-05-24': { name:'부처님오신날', type:'holiday' },
  '2026-06-06': { name:'현충일', type:'holiday' },
  '2026-07-17': { name:'제헌절 (기념일)', type:'memo' },   // 공휴일 아님
  '2026-08-15': { name:'광복절', type:'holiday' },
  '2026-10-02': { name:'추석 연휴', type:'holiday' },
  '2026-10-03': { name:'추석·개천절', type:'holiday' },
  '2026-10-04': { name:'추석 연휴', type:'holiday' },
  '2026-10-09': { name:'한글날', type:'holiday' },
  '2026-12-25': { name:'크리스마스', type:'holiday' },
}

const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
const DAYS   = ['일','월','화','수','목','금','토']

export default function ShipmentCalendar({ transactions, onNavigate }) {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [picked, setPicked] = useState(null)
  const [form, setForm]   = useState({ setQty:'', memo:'' })
  const [saving, setSaving] = useState(false)

  const todayStr = today.toISOString().slice(0,10)

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

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dateStr = d => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`

  const prevMonth = () => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  const nextMonth = () => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  const savePlan = async () => {
    if (!form.setQty || Number(form.setQty) <= 0) return
    setSaving(true)
    await addDoc(collection(db,'transactions'), {
      type:'출하계획', isHeader:true,
      shipmentId:`ship_${Date.now()}`,
      date:picked, setQty:Number(form.setQty),
      memo:form.memo.trim(), status:'planned',
      itemCode:'SET', itemName:'CST SET 출하',
      quantity:Number(form.setQty),
      createdAt:serverTimestamp(),
    })
    setForm({ setQty:'', memo:'' })
    setSaving(false)
  }

  const deletePlan = async id => {
    if(!window.confirm('삭제하시겠습니까?')) return
    await deleteDoc(doc(db,'transactions',id))
  }

  const pickedPlans = picked ? (planMap[picked]||[]) : []
  const monthTotal  = Object.entries(planMap)
    .filter(([k]) => k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`))
    .reduce((s,[,v]) => s + v.reduce((ss,p) => ss+(p.setQty||0), 0), 0)

  // 달력 셀 생성
  const cells = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let d=1;d<=daysInMonth;d++) cells.push(d)
  while(cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={S.wrap}>
      {/* 상단 헤더 */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>📅 출하계획 달력</div>
          <div style={S.sub}>날짜를 클릭하여 출하계획을 등록하세요</div>
        </div>
        <div style={S.monthSummary}>
          <div style={S.summaryLabel}>{MONTHS[month]} 출하 합계</div>
          <div style={S.summaryValue}>{monthTotal.toLocaleString()} SET</div>
        </div>
      </div>

      <div style={S.calWrap}>
        {/* 달력 */}
        <div style={S.calBox}>
          {/* 월 이동 */}
          <div style={S.calHeader}>
            <button style={S.navBtn} onClick={prevMonth}>‹</button>
            <span style={S.calTitle}>{year}년 {MONTHS[month]}</span>
            <button style={S.navBtn} onClick={nextMonth}>›</button>
            <button style={S.todayBtn} onClick={()=>{setYear(today.getFullYear());setMonth(today.getMonth())}}>오늘</button>
          </div>

          {/* 요일 헤더 */}
          <div style={S.grid7}>
            {DAYS.map((d,i) => (
              <div key={d} style={{...S.dayHead, color:i===0?'#ef4444':i===6?'#3b82f6':'#6b7280'}}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={S.grid7}>
            {cells.map((d, i) => {
              if(!d) return <div key={i} style={S.emptyCell}/>
              const ds       = dateStr(d)
              const hw       = HOLIDAYS[ds]
              const isHoliday= hw?.type==='holiday'
              const isMemo   = hw?.type==='memo'
              const isSun    = (firstDay+d-1)%7===0
              const isSat    = (firstDay+d-1)%7===6
              const isToday  = ds===todayStr
              const isPicked = ds===picked
              const plans    = planMap[ds]||[]
              const hasPlans = plans.length>0

              return (
                <div key={i} onClick={()=>setPicked(ds)}
                  style={{
                    ...S.cell,
                    background: isPicked?'#1e40af':isToday?'#eff6ff':'#fff',
                    border: isPicked?'2px solid #1e40af':isToday?'2px solid #93c5fd':'1px solid #e5e7eb',
                    color: isHoliday||isSun ? '#ef4444' : isSat ? '#2563eb' : isMemo ? '#f97316' : '#111827',
                  }}>
                  <div style={{fontWeight:isToday?700:500,fontSize:13}}>{d}</div>
                  {hw && <div style={{fontSize:9,marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                    color: isPicked?'#93c5fd':isHoliday?'#ef4444':'#f97316'}}>{hw.name}</div>}
                  {hasPlans && (
                    <div style={{marginTop:2,display:'flex',flexDirection:'column',gap:1}}>
                      {plans.slice(0,2).map((p,pi)=>(
                        <div key={pi} style={{
                          background: isPicked?'rgba(255,255,255,0.2)':'#dbeafe',
                          color: isPicked?'#fff':'#1e40af',
                          borderRadius:3, padding:'1px 4px', fontSize:9, fontWeight:700,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'
                        }}>{p.setQty}SET {p.status==='confirmed'?'✓':''}</div>
                      ))}
                      {plans.length>2 && <div style={{fontSize:9,color:'#94a3b8'}}>+{plans.length-2}</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div style={S.legend}>
            <div style={S.lgItem}><div style={{...S.lgDot,background:'#ef4444'}}/> 공휴일</div>
            <div style={S.lgItem}><div style={{...S.lgDot,background:'#f97316'}}/> 기념일</div>
            <div style={S.lgItem}><div style={{...S.lgDot,background:'#dbeafe',border:'1px solid #93c5fd'}}/> 출하계획</div>
            <div style={S.lgItem}><div style={{...S.lgDot,background:'#eff6ff',border:'2px solid #93c5fd'}}/> 오늘</div>
          </div>
        </div>

        {/* 우측 사이드 패널 */}
        <div style={S.sidePanel}>
          {picked ? (
            <>
              <div style={S.sidePanelTitle}>
                {picked}
                {HOLIDAYS[picked] && (
                  <span style={{marginLeft:6,fontSize:11,color:HOLIDAYS[picked].type==='holiday'?'#ef4444':'#f97316'}}>
                    {HOLIDAYS[picked].name}
                  </span>
                )}
              </div>

              {/* 기존 계획 목록 */}
              {pickedPlans.length === 0 ? (
                <div style={{color:'#9ca3af',fontSize:12,padding:'16px 0',textAlign:'center'}}>등록된 계획이 없습니다</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
                  {pickedPlans.map(p => (
                    <div key={p.id} style={S.planCard}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontWeight:700,color:'#1e40af',fontSize:15}}>{p.setQty} SET</span>
                        <span style={{fontSize:11,padding:'2px 7px',borderRadius:10,
                          background:p.status==='confirmed'?'#dcfce7':'#fef9c3',
                          color:p.status==='confirmed'?'#16a34a':'#ca8a04',fontWeight:600}}>
                          {p.status==='confirmed'?'출하확정':'계획'}
                        </span>
                      </div>
                      {p.memo && <div style={{fontSize:12,color:'#6b7280',marginTop:4}}>{p.memo}</div>}
                      {p.status!=='confirmed' && (
                        <div style={{display:'flex',justifyContent:'flex-end',marginTop:6}}>
                          <button onClick={()=>deletePlan(p.id)}
                            style={{fontSize:11,color:'#ef4444',background:'none',border:'1px solid #fca5a5',borderRadius:4,padding:'2px 8px',cursor:'pointer'}}>
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 새 계획 추가 */}
              <div style={S.addBox}>
                <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:6}}>출하계획 추가</div>
                <div style={{display:'flex',gap:6,marginBottom:6}}>
                  <input type="number" value={form.setQty}
                    onChange={e=>setForm(f=>({...f,setQty:e.target.value}))}
                    placeholder="SET 수량" style={{...S.inp,width:80}}/>
                  <input type="text" value={form.memo}
                    onChange={e=>setForm(f=>({...f,memo:e.target.value}))}
                    placeholder="메모 (선택)" style={{...S.inp,flex:1}}
                    onKeyDown={e=>e.key==='Enter'&&savePlan()}/>
                </div>
                <button onClick={savePlan} disabled={saving||!form.setQty}
                  style={{...S.saveBtn, opacity:saving||!form.setQty?0.5:1}}>
                  {saving?'저장 중...':'+ 출하계획 추가'}
                </button>
              </div>

              {/* 출하관리로 이동 */}
              <button onClick={()=>onNavigate('shipment')}
                style={{marginTop:8,width:'100%',padding:'8px',background:'none',
                  border:'1px solid #d1d5db',borderRadius:6,cursor:'pointer',fontSize:12,
                  color:'#6b7280',fontFamily:'inherit'}}>
                출하 관리 페이지로 →
              </button>
            </>
          ) : (
            <div style={{color:'#9ca3af',fontSize:12,textAlign:'center',padding:'40px 0'}}>
              <div style={{fontSize:32,marginBottom:8}}>📋</div>
              날짜를 클릭하면<br/>출하계획을 확인하거나<br/>새로 등록할 수 있어요
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const S = {
  wrap:   {padding:'16px',background:'#f8fafc',minHeight:'100%'},
  topBar: {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,
           background:'#fff',borderRadius:10,padding:'14px 18px',border:'1px solid #e5e7eb'},
  pageTitle:{fontSize:18,fontWeight:700,color:'#111827'},
  sub:    {fontSize:12,color:'#6b7280',marginTop:2},
  monthSummary:{textAlign:'right'},
  summaryLabel:{fontSize:11,color:'#6b7280'},
  summaryValue:{fontSize:22,fontWeight:700,color:'#1e40af'},

  calWrap:  {display:'flex',gap:14,alignItems:'flex-start'},
  calBox:   {flex:1,background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:14,overflow:'hidden'},
  calHeader:{display:'flex',alignItems:'center',gap:8,marginBottom:10},
  calTitle: {flex:1,textAlign:'center',fontSize:15,fontWeight:700,color:'#111827'},
  navBtn:   {background:'none',border:'1px solid #e5e7eb',borderRadius:6,width:28,height:28,cursor:'pointer',fontSize:16,color:'#374151'},
  todayBtn: {padding:'3px 10px',background:'#f3f4f6',border:'1px solid #e5e7eb',borderRadius:6,fontSize:11,cursor:'pointer',color:'#374151',fontFamily:'inherit'},

  grid7:    {display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:3},
  dayHead:  {textAlign:'center',fontSize:11,fontWeight:600,padding:'4px 0'},
  emptyCell:{minHeight:72},
  cell:     {minHeight:72,borderRadius:6,padding:5,cursor:'pointer',transition:'all 0.1s',overflow:'hidden'},

  legend:   {display:'flex',gap:12,marginTop:10,flexWrap:'wrap'},
  lgItem:   {display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#6b7280'},
  lgDot:    {width:12,height:12,borderRadius:3,flexShrink:0},

  sidePanel:{width:220,background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:14,flexShrink:0},
  sidePanelTitle:{fontSize:13,fontWeight:700,color:'#111827',marginBottom:10,paddingBottom:8,borderBottom:'1px solid #f3f4f6'},
  planCard: {background:'#f8fafc',borderRadius:7,padding:'8px 10px',border:'1px solid #e5e7eb'},
  addBox:   {background:'#f8fafc',borderRadius:7,padding:10,border:'1px dashed #d1d5db'},
  inp:      {padding:'6px 8px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,outline:'none',fontFamily:'inherit',color:'#111827',width:'100%',boxSizing:'border-box'},
  saveBtn:  {width:'100%',padding:'7px',background:'#1e40af',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600,fontFamily:'inherit'},
}

import { useState, useMemo, useRef } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { writeLog } from '../utils/logger'
import * as XLSX from 'xlsx'

const HOLIDAYS = {
  '2026-01-01':'신정','2026-02-16':'설날 연휴','2026-02-17':'설날','2026-02-18':'설날 연휴',
  '2026-03-01':'삼일절','2026-05-05':'어린이날','2026-05-24':'부처님오신날','2026-06-06':'현충일',
  '2026-07-17':'제헌절(기념일)','2026-08-15':'광복절','2026-10-02':'추석 연휴',
  '2026-10-03':'추석·개천절','2026-10-04':'추석 연휴','2026-10-09':'한글날','2026-12-25':'크리스마스',
}
const DAYS   = ['일','월','화','수','목','금','토']
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

const EMPTY_FORM = { qty:'', serial:'', orderNo:'', timeSlot:'오전', memo:'' }

export default function ShipmentCalendar({ transactions }) {
  const { userData } = useAuth()
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [modal, setModal] = useState(null)   // { date }
  const [form,  setForm]  = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
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

  const ds = (d) => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = []
  for(let i=0;i<firstDay;i++) cells.push(null)
  for(let d=1;d<=daysInMonth;d++) cells.push(d)
  while(cells.length%7!==0) cells.push(null)

  const monthTotal = Object.entries(planMap)
    .filter(([k]) => k.startsWith(`${year}-${String(month+1).padStart(2,'0')}`))
    .reduce((s,[,v]) => s + v.reduce((ss,p) => ss+(p.setQty||0),0), 0)

  const prevMonth = () => { if(month===0){setMonth(11);setYear(y=>y-1)}else setMonth(m=>m-1) }
  const nextMonth = () => { if(month===11){setMonth(0);setYear(y=>y+1)}else setMonth(m=>m+1) }

  const openModal = (date) => {
    setModal({ date })
    setForm(EMPTY_FORM)
    setEditId(null)
  }

  const savePlan = async () => {
    if (!form.qty || Number(form.qty) <= 0) return
    setSaving(true)
    const data = {
      type:'출하계획', isHeader:true,
      shipmentId:`ship_${Date.now()}`,
      date: modal.date,
      setQty: Number(form.qty),
      quantity: Number(form.qty),
      serial: form.serial.trim(),
      orderNo: form.orderNo.trim(),
      timeSlot: form.timeSlot,
      memo: form.memo.trim(),
      status:'planned',
      itemCode:'SET', itemName:'CST SET 출하',
      createdAt: serverTimestamp(),
    }
    if (editId) {
      await updateDoc(doc(db,'transactions',editId), { ...data, createdAt: undefined })
      await writeLog({ action:'수정', target:'출하계획', docId:editId, after:data, user:userData?.name||'' })
      setEditId(null)
    } else {
      await addDoc(collection(db,'transactions'), data)
      await writeLog({ action:'입력', target:'출하계획', after:data, user:userData?.name||'' })
    }
    setForm(EMPTY_FORM)
    setSaving(false)
  }

  const startEdit = (p) => {
    setEditId(p.id)
    setForm({ qty:String(p.setQty||''), serial:p.serial||'', orderNo:p.orderNo||'', timeSlot:p.timeSlot||'오전', memo:p.memo||'' })
  }

  const deletePlan = async (p) => {
    if(!window.confirm('삭제하시겠습니까?')) return
    await deleteDoc(doc(db,'transactions',p.id))
    await writeLog({ action:'삭제', target:'출하계획', docId:p.id, before:{date:p.date,setQty:p.setQty}, user:userData?.name||'' })
  }


  const handlePrint = () => {
    const monthStr = `${year}년 ${MONTHS[month]}`
    const rows = []
    for (let d = 1; d <= daysInMonth; d++) {
      const date = ds(d)
      const plans = planMap[date] || []
      if (plans.length > 0) rows.push({ date, plans })
    }

    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>출하계획 ${monthStr}</title>
      <style>
        body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; color: #111; }
        h2 { text-align:center; font-size:18px; margin-bottom:4px; }
        .sub { text-align:center; font-size:12px; color:#666; margin-bottom:16px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        th { background:#1e293b; color:#fff; padding:7px 10px; text-align:left; }
        td { padding:6px 10px; border-bottom:1px solid #e5e7eb; vertical-align:top; }
        tr:nth-child(even) { background:#f8fafc; }
        .tag { display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; font-weight:bold; margin-right:4px; }
        .am { background:#dbeafe; color:#1e40af; }
        .pm { background:#fef9c3; color:#854d0e; }
        .confirmed { background:#dcfce7; color:#166534; }
        .planned { background:#f1f5f9; color:#475569; }
        @media print { body { padding:0; } }
      </style>
    </head><body>
      <h2>📅 ${monthStr} 출하계획</h2>
      <div class="sub">㈜아이엔티에스 · 총 ${rows.reduce((s,r)=>s+r.plans.reduce((ss,p)=>ss+(p.setQty||0),0),0).toLocaleString()} EA · 출력일: ${new Date().toLocaleDateString('ko-KR')}</div>
      <table>
        <thead><tr><th>출하일</th><th>수량 (EA)</th><th>시간</th><th>시리얼 범위</th><th>발주번호</th><th>상태</th><th>메모</th></tr></thead>
        <tbody>
          ${rows.map(r => r.plans.map(p => `
            <tr>
              <td>${r.date}${HOLIDAYS[r.date]?'<br><span style="color:#ef4444;font-size:10px">'+HOLIDAYS[r.date]+'</span>':''}</td>
              <td style="font-weight:700;color:#1e40af">${(p.setQty||0).toLocaleString()}</td>
              <td><span class="tag ${p.timeSlot==='오전'?'am':'pm'}">${p.timeSlot||'오전'}</span></td>
              <td>${p.serial||'-'}</td>
              <td>${p.orderNo||'-'}</td>
              <td><span class="tag ${p.status==='confirmed'?'confirmed':'planned'}">${p.status==='confirmed'?'확정':'계획'}</span></td>
              <td style="color:#6b7280;font-size:11px">${p.memo||''}</td>
            </tr>`).join('')).join('')}
        </tbody>
      </table>
    </body></html>`

    const w = window.open('', '_blank', 'width=900,height=700')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  // 엑셀 업로드 파싱
  const handleExcel = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { cellDates: true })
    const plans = []

    // Excel 날짜 → YYYY-MM-DD 변환 (ISO문자열/Date객체/시리얼 숫자 모두 처리)
    const toDateStr = (v) => {
      if (!v) return null
      // ISO 문자열: "2026-05-31T00:00:00.000Z"
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0,10)
      // 일반 날짜 문자열: "2026-05-31"
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
      // Date 객체
      if (v instanceof Date && !isNaN(v.getTime())) {
        const d = new Date(v.getTime() - v.getTimezoneOffset()*60000)
        return d.toISOString().slice(0,10)
      }
      // Excel 시리얼 숫자
      if (typeof v === 'number' && v > 40000 && v < 60000) {
        const d = new Date(Math.round((v - 25569) * 86400 * 1000))
        return d.toISOString().slice(0,10)
      }
      return null
    }

    const validSheets = wb.SheetNames.filter(s => !s.includes('신규'))
    validSheets.forEach(sname => {
      const ws = wb.Sheets[sname]
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null })
      let currentDates = []

      rows.forEach(row => {
        // 날짜 행 감지 (Date 객체 또는 날짜 문자열)
        const dateCells = row.slice(1).map(v => toDateStr(v))
        if (dateCells.some(d => d)) {
          currentDates = [null, ...dateCells]
          return
        }

        // 내용 행 파싱
        row.slice(1).forEach((cell, ci) => {
          const date = currentDates[ci+1]
          if (!date || !cell) return
          const text = String(cell).trim()
          if (!text) return

          // 셀 안에서 EA로 시작하는 블록 단위로 분리
          const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
          const blocks = []
          let cur = []
          lines.forEach(line => {
            if (/^\d+EA/.test(line) && cur.length) { blocks.push(cur); cur = [line] }
            else cur.push(line)
          })
          if (cur.length) blocks.push(cur)

          blocks.forEach(block => {
            const joined = block.join(' ')
            const qtyM    = joined.match(/(\d+)EA/)
            const serialM = joined.match(/\(([^)]+~[^)]+)\)/)
            const orderM  = joined.match(/발주번호[:：\s]*(\d{10})/)
            const timeM   = joined.match(/오전|오후/)
            if (qtyM) {
              plans.push({
                date, qty: Number(qtyM[1]),
                serial:  serialM ? serialM[1].trim() : '',
                orderNo: orderM  ? orderM[1] : '',
                timeSlot: timeM  ? timeM[0] : '오전',
                memo: block[0] || '',
              })
            }
          })
        })
      })
    })

    if (plans.length === 0) { alert('파싱된 일정이 없습니다.'); return }
    if (!window.confirm(`${plans.length}건의 출하계획을 등록하시겠습니까?`)) return

    for (const p of plans) {
      await addDoc(collection(db,'transactions'), {
        type:'출하계획', isHeader:true,
        shipmentId:`ship_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        date:p.date, setQty:p.qty, quantity:p.qty,
        serial:p.serial, orderNo:p.orderNo, timeSlot:p.timeSlot, memo:p.memo,
        status:'planned', itemCode:'SET', itemName:'CST SET 출하',
        createdAt:serverTimestamp(),
      })
    }
    alert(`완료: ${plans.length}건 등록되었습니다.`)
    fileRef.current.value = ''
  }

  const modalPlans = modal ? (planMap[modal.date]||[]) : []
  const isHoliday = (dateStr) => !!HOLIDAYS[dateStr]
  const hdName    = (dateStr) => HOLIDAYS[dateStr]||''

  return (
    <div style={S.wrap}>
      {/* 헤더 */}
      <div style={S.topBar}>
        <div>
          <div style={S.pageTitle}>📅 출하계획 관리</div>
          <div style={S.sub}>날짜를 클릭하여 출하계획을 등록·조회하세요</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={S.summary}>
            <div style={{fontSize:11,color:'#6b7280'}}>이번 달 출하 합계</div>
            <div style={{fontSize:22,fontWeight:700,color:'#1e40af'}}>{monthTotal.toLocaleString()} EA</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={async()=>{
              if(!window.confirm('등록된 출하계획을 전부 삭제하시겠습니까?\n(확정된 건 제외)')) return
              const targets = transactions.filter(t=>t.type==='출하계획'&&t.isHeader&&t.status!=='confirmed')
              for(const t of targets) await deleteDoc(doc(db,'transactions',t.id))
              alert(`${targets.length}건 삭제 완료`)
            }} style={{...S.uploadBtn,background:'#fee2e2',borderColor:'#fca5a5',color:'#dc2626'}}>
              🗑 계획 전체삭제
            </button>
            <button onClick={handlePrint}
              style={{...S.uploadBtn, background:'#1e293b', color:'#fff', border:'none', cursor:'pointer'}}>
              🖨 인쇄
            </button>
            <label style={S.uploadBtn}>
              📂 엑셀 업로드
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleExcel}/>
            </label>
          </div>
        </div>
      </div>

      {/* 달력 */}
      <div style={S.calBox}>
        <div style={S.calHeader}>
          <button style={S.navBtn} onClick={prevMonth}>‹</button>
          <span style={S.calTitle}>{year}년 {MONTHS[month]}</span>
          <button style={S.navBtn} onClick={nextMonth}>›</button>
          <button style={S.todayBtn} onClick={()=>{setYear(today.getFullYear());setMonth(today.getMonth())}}>오늘</button>
        </div>
        <div style={S.grid7}>
          {DAYS.map((d,i) => (
            <div key={d} style={{...S.dayHead, color:i===0?'#ef4444':i===6?'#3b82f6':'#374151'}}>{d}</div>
          ))}
        </div>
        <div style={S.grid7}>
          {cells.map((d,i) => {
            if(!d) return <div key={i} style={S.emptyCell}/>
            const date     = ds(d)
            const hw       = HOLIDAYS[date]
            const isSun    = (firstDay+d-1)%7===0
            const isSat    = (firstDay+d-1)%7===6
            const isToday  = date===todayStr
            const plans    = planMap[date]||[]
            const totalQty = plans.reduce((s,p)=>s+(p.setQty||0),0)

            return (
              <div key={i} onClick={()=>openModal(date)}
                style={{
                  ...S.cell,
                  background: isToday?'#eff6ff':'#fff',
                  border: isToday?'2px solid #93c5fd':'1px solid #e5e7eb',
                  color: hw||isSun?'#ef4444':isSat?'#2563eb':'#111827',
                }}>
                <div style={{fontWeight:isToday?700:500,fontSize:14}}>{d}</div>
                {hw && <div style={{fontSize:9,color:'#ef4444',marginTop:1,lineHeight:1.2}}>{hw}</div>}
                {totalQty > 0 && (
                  <div style={{marginTop:3}}>
                    <div style={{background:'#1e40af',color:'#fff',borderRadius:4,padding:'2px 5px',fontSize:10,fontWeight:700,textAlign:'center'}}>
                      {totalQty.toLocaleString()} EA
                    </div>
                    {plans.slice(0,2).map((p,pi)=>(
                      <div key={pi} style={{fontSize:9,color:'#374151',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {p.timeSlot} {p.serial}
                      </div>
                    ))}
                    {plans.length>2&&<div style={{fontSize:9,color:'#9ca3af'}}>+{plans.length-2}건</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* 범례 */}
        <div style={S.legend}>
          <div style={S.lgItem}><div style={{...S.lgDot,background:'#1e40af'}}/> 출하계획</div>
          <div style={S.lgItem}><div style={{...S.lgDot,background:'#ef4444'}}/> 공휴일</div>
          <div style={S.lgItem}><div style={{...S.lgDot,background:'#eff6ff',border:'2px solid #93c5fd'}}/> 오늘</div>
        </div>
      </div>

      {/* 날짜 상세 모달 */}
      {modal && (
        <div style={S.modalBg} onClick={()=>{setModal(null);setEditId(null);setForm(EMPTY_FORM)}}>
          <div style={S.modalBox} onClick={e=>e.stopPropagation()}>
            <div style={S.modalHeader}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:'#111827'}}>{modal.date}</div>
                {HOLIDAYS[modal.date] && <div style={{fontSize:12,color:'#ef4444',marginTop:2}}>{HOLIDAYS[modal.date]}</div>}
              </div>
              <button onClick={()=>{setModal(null);setEditId(null);setForm(EMPTY_FORM)}} style={S.closeBtn}>✕</button>
            </div>

            {/* 기존 계획 목록 */}
            {modalPlans.length > 0 && (
              <div style={{marginBottom:16}}>
                <div style={S.sectionLabel}>등록된 출하계획 ({modalPlans.length}건 / 합계 {modalPlans.reduce((s,p)=>s+(p.setQty||0),0).toLocaleString()} EA)</div>
                {modalPlans.map(p => (
                  <div key={p.id} style={S.planCard}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                          <span style={{fontWeight:700,color:'#1e40af',fontSize:16}}>{p.setQty?.toLocaleString()} EA</span>
                          <span style={{background:'#f3f4f6',color:'#374151',padding:'2px 8px',borderRadius:10,fontSize:11}}>{p.timeSlot||'오전'}</span>
                          <span style={{background:p.status==='confirmed'?'#dcfce7':'#fef9c3',
                            color:p.status==='confirmed'?'#16a34a':'#ca8a04',padding:'2px 8px',borderRadius:10,fontSize:11,fontWeight:600}}>
                            {p.status==='confirmed'?'출하확정':'계획'}
                          </span>
                        </div>
                        {p.serial  && <div style={{fontSize:12,color:'#374151',marginTop:4}}>📋 시리얼: {p.serial}</div>}
                        {p.orderNo && <div style={{fontSize:12,color:'#374151',marginTop:2}}>🔖 발주번호: {p.orderNo}</div>}
                        {p.memo    && <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{p.memo}</div>}
                      </div>
                      {p.status !== 'confirmed' && (
                        <div style={{display:'flex',gap:6,flexShrink:0,marginLeft:8}}>
                          <button onClick={()=>startEdit(p)} style={S.editBtn}>수정</button>
                          <button onClick={()=>deletePlan(p)} style={S.delBtn}>삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 입력 폼 */}
            <div style={S.formBox}>
              <div style={S.sectionLabel}>{editId ? '✏️ 계획 수정' : '+ 출하계획 추가'}</div>
              <div style={S.formGrid}>
                <div style={S.field}>
                  <label style={S.label}>수량 (EA) *</label>
                  <input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))}
                    placeholder="예: 56" style={S.inp}/>
                </div>
                <div style={S.field}>
                  <label style={S.label}>오전/오후</label>
                  <div style={{display:'flex',gap:6}}>
                    {['오전','오후'].map(t => (
                      <button key={t} onClick={()=>setForm(f=>({...f,timeSlot:t}))}
                        style={{flex:1,padding:'7px',border:'1px solid',borderRadius:6,cursor:'pointer',fontFamily:'inherit',fontSize:12,fontWeight:600,
                          borderColor:form.timeSlot===t?'#1e40af':'#d1d5db',
                          background:form.timeSlot===t?'#1e40af':'#fff',
                          color:form.timeSlot===t?'#fff':'#374151'}}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{...S.field, gridColumn:'1/-1'}}>
                  <label style={S.label}>시리얼 범위</label>
                  <input type="text" value={form.serial} onChange={e=>setForm(f=>({...f,serial:e.target.value}))}
                    placeholder="예: IFZF001~056" style={S.inp}/>
                </div>
                <div style={{...S.field, gridColumn:'1/-1'}}>
                  <label style={S.label}>발주번호</label>
                  <input type="text" value={form.orderNo} onChange={e=>setForm(f=>({...f,orderNo:e.target.value}))}
                    placeholder="예: 2064697146" style={S.inp}/>
                </div>
                <div style={{...S.field, gridColumn:'1/-1'}}>
                  <label style={S.label}>메모</label>
                  <input type="text" value={form.memo} onChange={e=>setForm(f=>({...f,memo:e.target.value}))}
                    placeholder="추가 메모" style={S.inp}
                    onKeyDown={e=>e.key==='Enter'&&savePlan()}/>
                </div>
              </div>
              <div style={{display:'flex',gap:8,marginTop:10}}>
                <button onClick={savePlan} disabled={saving||!form.qty}
                  style={{...S.saveBtn, opacity:saving||!form.qty?0.5:1, flex:1}}>
                  {saving?'저장 중...':(editId?'수정 완료':'출하계획 등록')}
                </button>
                {editId && (
                  <button onClick={()=>{setEditId(null);setForm(EMPTY_FORM)}} style={S.cancelBtn}>취소</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const S = {
  wrap:    {padding:16,background:'#f8fafc',minHeight:'100%',display:'flex',flexDirection:'column',gap:12},
  topBar:  {background:'#fff',borderRadius:10,padding:'14px 18px',border:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10,flexShrink:0},
  pageTitle:{fontSize:18,fontWeight:700,color:'#111827'},
  sub:     {fontSize:12,color:'#6b7280',marginTop:2},
  summary: {textAlign:'right'},
  uploadBtn:{padding:'8px 14px',background:'#f3f4f6',border:'1px solid #d1d5db',borderRadius:7,cursor:'pointer',fontSize:12,fontWeight:600,color:'#374151',fontFamily:'inherit'},

  calBox:  {background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:16,flex:1},
  calHeader:{display:'flex',alignItems:'center',gap:8,marginBottom:12},
  calTitle: {flex:1,textAlign:'center',fontSize:16,fontWeight:700,color:'#111827'},
  navBtn:  {background:'none',border:'1px solid #e5e7eb',borderRadius:6,width:32,height:32,cursor:'pointer',fontSize:18,color:'#374151'},
  todayBtn:{padding:'4px 12px',background:'#f3f4f6',border:'1px solid #e5e7eb',borderRadius:6,fontSize:12,cursor:'pointer',color:'#374151',fontFamily:'inherit'},

  grid7:   {display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4},
  dayHead: {textAlign:'center',fontSize:12,fontWeight:600,padding:'6px 0'},
  emptyCell:{minHeight:140},
  cell:    {minHeight:140,borderRadius:7,padding:6,cursor:'pointer',transition:'box-shadow 0.1s',':hover':{boxShadow:'0 2px 8px rgba(0,0,0,0.1)'}},
  legend:  {display:'flex',gap:16,marginTop:12,flexWrap:'wrap'},
  lgItem:  {display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#6b7280'},
  lgDot:   {width:12,height:12,borderRadius:3,flexShrink:0},

  modalBg: {position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:16},
  modalBox:{background:'#fff',borderRadius:12,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'},
  modalHeader:{padding:'16px 20px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'flex-start'},
  closeBtn:{background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#9ca3af',padding:4},
  sectionLabel:{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em'},
  planCard:{background:'#f8fafc',borderRadius:8,padding:'10px 12px',marginBottom:8,border:'1px solid #e5e7eb'},
  editBtn: {padding:'4px 10px',background:'#f3f4f6',border:'1px solid #d1d5db',borderRadius:5,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  delBtn:  {padding:'4px 10px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:5,cursor:'pointer',fontSize:11,color:'#dc2626',fontFamily:'inherit'},
  formBox: {padding:'0 20px 20px'},
  formGrid:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10},
  field:   {display:'flex',flexDirection:'column',gap:4},
  label:   {fontSize:11,fontWeight:600,color:'#374151'},
  inp:     {padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:6,fontSize:13,outline:'none',fontFamily:'inherit',color:'#111827'},
  saveBtn: {padding:'9px',background:'#1e40af',color:'#fff',border:'none',borderRadius:7,cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'inherit'},
  cancelBtn:{padding:'9px 16px',background:'#f3f4f6',color:'#374151',border:'1px solid #d1d5db',borderRadius:7,cursor:'pointer',fontSize:13,fontFamily:'inherit'},
}

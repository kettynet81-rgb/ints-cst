import { useState, useEffect } from "react"
import { db } from "../firebase"
import { collection, onSnapshot, doc, updateDoc, getDocs, writeBatch,
         query, where, addDoc, deleteDoc, orderBy, serverTimestamp, Timestamp } from "firebase/firestore"
import { useAuth } from "../contexts/AuthContext"
import { ITEMS } from "../data/items"

const ROLE_LABEL = { pending:"대기", approved:"승인", admin:"관리자", rejected:"거절", blocked:"차단" }

export default function AdminPage() {
  const { userData } = useAuth()
  const [users, setUsers] = useState([])
  const [holidays, setHolidays] = useState([])
  const [hForm, setHForm] = useState({ date:'', name:'' })

  // 사용자 목록
  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap => {
      const order = { admin:0, approved:1, pending:2, rejected:3, blocked:4 }
      setUsers(snap.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (order[a.role]||9)-(order[b.role]||9)))
    })
  }, [])

  // 공휴일 목록
  useEffect(() => {
    const q = query(collection(db,'holidays'), orderBy('date'))
    return onSnapshot(q, snap => setHolidays(snap.docs.map(d => ({id:d.id,...d.data()}))))
  }, [])

  const deleteUser = async (uid, name) => {
    if (!window.confirm(`${name} 사용자를 삭제하시겠습니까?`)) return
    await deleteDoc(doc(db, 'users', uid))
  }

  const changeRole = async (uid, role) => {
    await updateDoc(doc(db, "users", uid), { role })
  }

  const pendingCount = users.filter(u => u.role === "pending").length

  // 자사가공 품목 설정
  const [processing, setProcessing] = useState({})
  useEffect(() => {
    return onSnapshot(doc(db,'settings','processing'), snap => {
      if (snap.exists()) setProcessing(snap.data())
    })
  }, [])
  const toggleProcessing = async (code) => {
    const cur = processing[code] || '외주'
    const next = cur === '자사' ? '외주' : '자사'
    await updateDoc(doc(db,'settings','processing'), { [code]: next }).catch(async () => {
      await addDoc(collection(db,'settings'), {}).catch(()=>{})
      const { setDoc } = await import('firebase/firestore')
      await setDoc(doc(db,'settings','processing'), { ...processing, [code]: next })
    })
    setProcessing(p => ({...p, [code]: next}))
  }



  // 7/8→7/7, 7/10→7/9 날짜 수정 + 출고기록 없으면 재생성
  const fixShipmentDates = async () => {
    if (!window.confirm('7/8 계획 3건→7/7, 7/10 계획 2건→7/9 수정하고\n출고기록 없는 건 재생성합니다.\n\n계속하시겠습니까?')) return

    const { ITEMS } = await import('../data/items')

    const dateMap = { '2026-07-08': '2026-07-07', '2026-07-10': '2026-07-09' }
    let fixed = 0, created = 0

    for (const [oldDate, newDate] of Object.entries(dateMap)) {
      // 출하계획 찾기
      const planSnap = await getDocs(q2(collection(db,'transactions'), where('type','==','출하계획'), where('date','==',oldDate), where('isHeader','==',true)))
      for (const planDoc of planSnap.docs) {
        const plan = { id: planDoc.id, ...planDoc.data() }
        // 날짜 수정
        const batch = writeBatch(db)
        batch.update(doc(db,'transactions',plan.id), { date: newDate })

        // 관련 자식 레코드도 수정
        const childSnap = await getDocs(q2(collection(db,'transactions'), where('shipmentId','==',plan.shipmentId), where('type','==','출하계획')))
        childSnap.docs.filter(d=>!d.data().isHeader).forEach(d => batch.update(doc(db,'transactions',d.id), { date: newDate }))

        // 출고기록 있는지 확인
        const outSnap = await getDocs(q2(collection(db,'transactions'), where('shipmentId','==',plan.shipmentId), where('type','==','출고')))

        // 출고기록 없으면 생성
        if (outSnap.empty && plan.setQty) {
          for (const item of ITEMS) {
            batch.set(doc(collection(db,'transactions')), {
              type:'출고', itemCode:item.code, itemName:item.name,
              quantity: item.needPerSet * plan.setQty,
              date: newDate, shipmentId: plan.shipmentId,
              memo: `제품출하 ${plan.setQty}SET (날짜수정)`,
              createdAt: serverTimestamp()
            })
            created++
          }
        } else {
          // 출고기록 날짜도 수정
          outSnap.docs.forEach(d => batch.update(doc(db,'transactions',d.id), { date: newDate }))
        }

        await batch.commit()
        fixed++
      }
    }
    alert(`완료: 계획 ${fixed}건 날짜 수정, 출고기록 ${created}개 생성`)
  }


  // 확정됐는데 출고기록 없는 건 찾아서 재생성
  const fixMissingOutbound = async () => {
    const { ITEMS } = await import('../data/items')

    // 전체 로드 후 클라이언트 필터 (복합 인덱스 불필요)
    const allSnap = await getDocs(collection(db,'transactions'))
    const allDocs = allSnap.docs.map(d=>({id:d.id,...d.data()}))
    const confirmedPlans = allDocs.filter(d=>d.type==='출하계획'&&d.status==='confirmed'&&d.isHeader)
    const outCounts = {}
    allDocs.filter(d=>d.type==='출고'&&d.shipmentId).forEach(d=>{
      outCounts[d.shipmentId] = (outCounts[d.shipmentId]||0)+1
    })
    const missing = confirmedPlans.filter(p=>p.shipmentId&&(!outCounts[p.shipmentId]||outCounts[p.shipmentId]<30))

    alert(`전체 트랜잭션: ${allDocs.length}건\n확정 출하계획: ${confirmedPlans.length}건\n누락 발견: ${missing.length}건`)

    if (missing.length === 0) { return }

    const msg = missing.map(p=>`${p.date} / ${p.setQty}EA`).join('\n')
    if (!window.confirm(`출고기록 없는 확정 건 ${missing.length}개:\n${msg}\n\n출고기록 생성(재고 차감)하시겠습니까?`)) return

    let count = 0
    for (const plan of missing) {
      const batch = writeBatch(db)
      for (const item of ITEMS) {
        batch.set(doc(collection(db,'transactions')), {
          type:'출고', itemCode:item.code, itemName:item.name,
          quantity: item.needPerSet * plan.setQty,
          date: plan.date, shipmentId: plan.shipmentId,
          memo: `제품출하 ${plan.setQty}SET (누락재생성)`,
          createdAt: serverTimestamp()
        })
        count++
      }
      await batch.commit()
    }
    alert(`완료: 출고기록 ${count}개 생성 (재고 차감 완료)`)
  }

  // 이상 날짜 조회
  const findBadDates = async () => {
    const snap = await getDocs(collection(db,'transactions'))
    const bad = snap.docs
      .map(d => ({id:d.id,...d.data()}))
      .filter(d => d.type==='출하계획' && d.isHeader && d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date))
    if (bad.length === 0) {
      alert('이상한 날짜 데이터 없습니다!')
      return
    }
    alert('이상 날짜 발견:\n' + bad.map(d=>`${d.date} (${d.setQty||'?'}EA)`).join('\n'))
  }


  // 오늘 생성된 출고기록 롤백
  const rollbackToday = async () => {
    const today = new Date()
    today.setHours(0,0,0,0)
    const todayTs = today.getTime()
    const snap = await getDocs(collection(db,'transactions'))
    if (snap.empty) { alert('오늘 생성된 출고기록 없습니다'); return }

    const list = snap.docs
      .map(d=>({id:d.id,...d.data()}))
      .filter(d => d.type==='출고' && d.createdAt?.toDate?.()?.getTime() >= todayTs)
    const msg = list.slice(0,10).map(d=>`${d.date} ${d.itemCode} -${d.quantity}`).join('\n')
    if (!window.confirm(`오늘 생성된 출고기록 ${list.length}건 삭제:\n${msg}\n${list.length>10?'...(외 '+(list.length-10)+'건)':''}\n\n삭제하면 재고가 복구됩니다. 계속하시겠습니까?`)) return

    const batch = writeBatch(db)
    list.forEach(d => batch.delete(doc(db,'transactions',d.id)))
    await batch.commit()
    alert(`${list.length}건 삭제 완료 - 재고 복구됨`)
  }

  // 공휴일 추가/삭제
  const addHoliday = async () => {
    if (!hForm.date || !hForm.name.trim()) return
    await addDoc(collection(db,'holidays'), { date:hForm.date, name:hForm.name.trim(), createdAt:serverTimestamp() })
    setHForm({ date:'', name:'' })
  }
  const deleteHoliday = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    await deleteDoc(doc(db,'holidays',id))
  }




  // 리콜 전체 삭제
  const deleteAllRecall = async () => {
    if (!window.confirm('리콜 데이터를 전부 삭제하시겠습니까?\n(Repair 데이터는 유지됩니다)')) return
    const snap = await getDocs(query(collection(db,'recalls'), where('category','==','리콜')))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(doc(db,'recalls',d.id)))
    await batch.commit()
    alert(`${snap.docs.length}건 삭제 완료`)
  }

  // Repair 1차 데이터 업로드
  const uploadRepairData = async () => {
    if (!window.confirm('Repair 1차 28건을 업로드하시겠습니까?')) return
    try {
      const res = await fetch('/repair_1차.json')
      const data = await res.json()
      const batch = writeBatch(db)
      data.forEach(r => batch.set(doc(collection(db,'recalls')), { ...r, createdAt: serverTimestamp() }))
      await batch.commit()
      alert(`완료: ${data.length}건 업로드됐습니다!`)
    } catch(e) { alert('오류: ' + e.message) }
  }

  // 기존 리콜 데이터 일괄 업로드
  const uploadRecallData = async () => {
    if (!window.confirm('기존 리콜 이력 1,351건을 업로드합니다.\n(중복 확인 없이 전체 등록됩니다)\n\n계속하시겠습니까?')) return
    
    try {
      const res = await fetch('/recall_data.json')
      const data = await res.json()
      
      let count = 0
      const BATCH_SIZE = 50
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        const chunk = data.slice(i, i+BATCH_SIZE)
        for (const r of chunk) {
          batch.set(doc(collection(db,'recalls')), {
            ...r,
            repairItems: Array.isArray(r.repairItems) ? r.repairItems : [r.repairItems],
            createdAt: serverTimestamp()
          })
          count++
        }
        await batch.commit()
      }
      alert(`완료: ${count}건 업로드됐습니다!`)
    } catch(e) {
      alert('오류: ' + e.message)
    }
  }

  return (
    <div style={{padding:28}}>
      {/* 리콜 전체 삭제 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#991b1b'}}>🗑 리콜 데이터 전체 삭제</div>
          <div style={{fontSize:11,color:'#b91c1c',marginTop:2}}>Repair 데이터는 유지됩니다</div>
        </div>
        <button onClick={deleteAllRecall}
          style={{padding:'7px 14px',background:'#dc2626',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'}}>
          삭제 실행
        </button>
      </div>

      {/* Repair 1차 업로드 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#166534'}}>🛠 Repair 1차 데이터 업로드</div>
          <div style={{fontSize:11,color:'#16a34a',marginTop:2}}>2025-12-10 반출 / 2025-12-22 반입 28건</div>
        </div>
        <button onClick={uploadRepairData}
          style={{padding:'7px 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'}}>
          업로드 실행
        </button>
      </div>

      {/* 기존 리콜 데이터 업로드 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#1e40af'}}>📥 기존 리콜 이력 업로드</div>
          <div style={{fontSize:11,color:'#3b82f6',marginTop:2}}>파싱된 기존 리콜 데이터 1,351건을 Firestore에 등록합니다</div>
        </div>
        <button onClick={uploadRecallData}
          style={{padding:'7px 14px',background:'#1e40af',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'}}>
          업로드 실행
        </button>
      </div>

      {/* 자사/외주 가공 설정 */}
      <div style={{marginBottom:16,background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',background:'#f8fafc',borderBottom:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontWeight:700,fontSize:14,color:'#111827'}}>⚙️ 자사/외주 가공 설정</div>
          <div style={{fontSize:11,color:'#6b7280'}}>클릭하여 전환</div>
        </div>
        <div style={{padding:'12px 16px',display:'flex',flexWrap:'wrap',gap:6}}>
          {ITEMS.map(item => {
            const type = processing[item.code] || '외주'
            return (
              <button key={item.code} onClick={()=>toggleProcessing(item.code)}
                style={{padding:'5px 10px',borderRadius:6,border:'1px solid',cursor:'pointer',
                  fontFamily:'inherit',fontSize:11,fontWeight:700,transition:'all 0.15s',
                  background: type==='자사'?'#1e40af':'#f3f4f6',
                  color: type==='자사'?'#fff':'#6b7280',
                  borderColor: type==='자사'?'#1e40af':'#d1d5db'}}>
                {item.code} <span style={{fontWeight:400,opacity:0.8}}>{type}</span>
              </button>
            )
          })}
        </div>
        <div style={{padding:'8px 16px',borderTop:'1px solid #f3f4f6',fontSize:11,color:'#9ca3af'}}>
          파란색 = 자사가공 · 회색 = 외주가공
        </div>
      </div>

      {/* 7/8→7/7, 7/10→7/9 날짜 수정 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>🔧 출하 날짜 수정 (7/8→7/7, 7/10→7/9)</div>
          <div style={{fontSize:11,color:'#a16207',marginTop:2}}>날짜 수정 + 출고기록 없으면 재생성 (재고 차감)</div>
        </div>
        <button onClick={fixShipmentDates}
          style={{padding:'7px 14px',background:'#d97706',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          수정 실행
        </button>
      </div>

      {/* 확정됐는데 출고기록 없는 건 복구 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#991b1b'}}>🚨 출고기록 누락 복구 (재고 차감)</div>
          <div style={{fontSize:11,color:'#b91c1c',marginTop:2}}>확정됐는데 출고기록 없는 건 찾아서 재고 차감</div>
        </div>
        <button onClick={fixMissingOutbound}
          style={{padding:'7px 14px',background:'#dc2626',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          조회 및 복구
        </button>
      </div>

      {/* 오늘 출고기록 롤백 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#fef3c7',border:'1px solid #fde68a',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>↩ 오늘 출고기록 전체 롤백</div>
          <div style={{fontSize:11,color:'#a16207',marginTop:2}}>오늘 생성된 출고기록 삭제 → 재고 복구</div>
        </div>
        <button onClick={rollbackToday}
          style={{padding:'7px 14px',background:'#d97706',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          롤백 실행
        </button>
      </div>

      {/* 이상 날짜 조회 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#0369a1'}}>🔍 출하계획 이상 날짜 조회</div>
          <div style={{fontSize:11,color:'#0284c7',marginTop:2}}>형식이 잘못된 날짜 데이터 찾기</div>
        </div>
        <button onClick={findBadDates}
          style={{padding:'7px 14px',background:'#0284c7',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          조회
        </button>
      </div>

      {/* 공휴일 관리 */}
      <div style={{marginBottom:16,background:'#fff',border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',background:'#f8fafc',borderBottom:'1px solid #e5e7eb',fontWeight:700,fontSize:14,color:'#111827'}}>
          📅 공휴일 관리
        </div>
        <div style={{padding:'12px 16px'}}>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <input type="date" value={hForm.date} onChange={e=>setHForm(f=>({...f,date:e.target.value}))}
              style={{padding:'7px 9px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,fontFamily:'inherit'}}/>
            <input type="text" value={hForm.name} onChange={e=>setHForm(f=>({...f,name:e.target.value}))}
              placeholder="공휴일명 (예: 광복절 대체휴무)"
              style={{flex:1,padding:'7px 9px',border:'1px solid #d1d5db',borderRadius:6,fontSize:12,fontFamily:'inherit',outline:'none'}}
              onKeyDown={e=>e.key==='Enter'&&addHoliday()}/>
            <button onClick={addHoliday} disabled={!hForm.date||!hForm.name}
              style={{padding:'7px 14px',background:'#1e40af',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',opacity:!hForm.date||!hForm.name?0.5:1}}>
              추가
            </button>
          </div>
          <div style={{maxHeight:200,overflowY:'auto'}}>
            {holidays.length===0
              ? <div style={{color:'#9ca3af',fontSize:12,textAlign:'center',padding:12}}>등록된 공휴일이 없습니다</div>
              : holidays.map(h => (
                <div key={h.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  padding:'5px 10px',borderRadius:5,marginBottom:3,background:'#f8fafc'}}>
                  <div>
                    <span style={{fontWeight:700,color:'#1e40af',fontSize:13,marginRight:8}}>{h.date}</span>
                    <span style={{fontSize:12,color:'#374151'}}>{h.name}</span>
                  </div>
                  <button onClick={()=>deleteHoliday(h.id)}
                    style={{padding:'3px 8px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:4,cursor:'pointer',fontSize:11,color:'#dc2626',fontFamily:'inherit'}}>
                    삭제
                  </button>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* 사용자 관리 */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
          <div style={{fontSize:22,fontWeight:700,color:'#0f172a'}}>사용자 관리</div>
          <span style={{fontSize:13,color: pendingCount>0?'#d97706':'#64748b',fontWeight:600}}>
            {pendingCount>0 ? `⚠ 승인 대기 ${pendingCount}명` : '승인 대기 없음'}
          </span>
        </div>
        {users.map((u,i) => (
          <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',
            background:i%2===0?'#f8fafc':'#fff',borderRadius:6,marginBottom:4,border:'1px solid #e2e8f0'}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:600,color:'#0f172a',fontSize:14}}>{u.name}</div>
              <div style={{fontSize:12,color:'#64748b'}}>{u.email}</div>
            </div>
            <span style={{padding:'3px 10px',borderRadius:10,fontSize:12,fontWeight:700,
              background: u.role==='admin'?'#1e293b':u.role==='approved'?'#dcfce7':u.role==='pending'?'#fef9c3':'#fee2e2',
              color: u.role==='admin'?'#fff':u.role==='approved'?'#166534':u.role==='pending'?'#92400e':'#dc2626'}}>
              {ROLE_LABEL[u.role]||u.role}
            </span>
            {u.role==='pending' && <>
              <button onClick={()=>changeRole(u.id,'approved')} style={S.btnApprove}>승인</button>
              <button onClick={()=>changeRole(u.id,'rejected')} style={S.btnReject}>거절</button>
            </>}
            {u.role==='approved' && <>
              <button onClick={()=>changeRole(u.id,'admin')} style={S.btnAdmin}>관리자</button>
              <button onClick={()=>changeRole(u.id,'blocked')} style={S.btnReject}>차단</button>
            </>}
            {(u.role==='rejected'||u.role==='blocked') &&
              <button onClick={()=>changeRole(u.id,'approved')} style={S.btnApprove}>복구</button>}
            <button onClick={()=>deleteUser(u.id, u.name)}
              style={{padding:'5px 10px',background:'none',border:'1px solid #d1d5db',borderRadius:5,cursor:'pointer',fontSize:11,color:'#9ca3af',fontFamily:'inherit'}}>
              삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const S = {
  btnApprove:{padding:'5px 12px',background:'#16a34a',color:'#fff',border:'none',borderRadius:5,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'},
  btnReject: {padding:'5px 12px',background:'#dc2626',color:'#fff',border:'none',borderRadius:5,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'},
  btnAdmin:  {padding:'5px 12px',background:'#1e293b',color:'#fff',border:'none',borderRadius:5,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'},
}

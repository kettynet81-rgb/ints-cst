import { useState, useEffect } from "react"
import { db } from "../firebase"
import { collection, onSnapshot, doc, updateDoc, getDocs, writeBatch,
         query, where, addDoc, deleteDoc, orderBy, serverTimestamp } from "firebase/firestore"
import { useAuth } from "../contexts/AuthContext"

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

  const changeRole = async (uid, role) => {
    await updateDoc(doc(db, "users", uid), { role })
  }

  const pendingCount = users.filter(u => u.role === "pending").length

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

  // 출하확정 전체 취소 (재고 복구)
  const restoreAllConfirmed = async () => {
    if (!window.confirm('⚠ 출하 확정 전체 취소\n\n확정된 모든 출하계획을 취소하고\n차감된 재고를 전부 복구합니다.\n\n계속하시겠습니까?')) return
    const outSnap = await getDocs(query(collection(db,'transactions'), where('type','==','출고')))
    const shipmentOuts = outSnap.docs.filter(d => d.data().shipmentId)
    const planSnap = await getDocs(query(collection(db,'transactions'), where('status','==','confirmed')))
    const allDocs = [...shipmentOuts.map(d=>({id:d.id,op:'delete'})), ...planSnap.docs.map(d=>({id:d.id,op:'update'}))]
    let batch = writeBatch(db); let ops = 0
    for (const item of allDocs) {
      if (item.op==='delete') batch.delete(doc(db,'transactions',item.id))
      else batch.update(doc(db,'transactions',item.id), { status:'planned' })
      ops++
      if (ops===400) { await batch.commit(); batch=writeBatch(db); ops=0 }
    }
    if (ops>0) await batch.commit()
    alert(`완료\n출고기록 ${shipmentOuts.length}건 삭제\n출하계획 ${planSnap.docs.length}건 복구`)
  }

  // A1/A8/A14 마이그레이션
  const runMigration = async () => {
    if (!window.confirm('A1→A1-1, A8→A8-1, A14→A14-1\n기존 데이터를 일괄 변경합니다. 계속하시겠습니까?')) return
    const MAP = { 'A1':'A1-1', 'A8':'A8-1', 'A14':'A14-1' }
    const snap = await getDocs(collection(db,'transactions'))
    const batch = writeBatch(db); let count = 0
    snap.docs.forEach(d => {
      const newCode = MAP[d.data().itemCode]
      if (newCode) { batch.update(doc(db,'transactions',d.id), { itemCode:newCode }); count++ }
    })
    await batch.commit()
    alert(`완료: ${count}건 변경되었습니다.`)
  }

  return (
    <div style={{padding:28}}>
      {/* 재고 복구 */}
      <div style={{marginBottom:12,padding:'12px 14px',background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#991b1b'}}>🚨 출하확정 전체 취소 (재고 복구)</div>
          <div style={{fontSize:11,color:'#b91c1c',marginTop:2}}>확정된 모든 출하계획을 취소하고 차감된 재고를 복구합니다</div>
        </div>
        <button onClick={restoreAllConfirmed}
          style={{padding:'7px 14px',background:'#dc2626',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'}}>
          재고 복구
        </button>
      </div>

      {/* 마이그레이션 */}
      <div style={{marginBottom:16,padding:'12px 14px',background:'#fef9c3',border:'1px solid #fde68a',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>🔧 데이터 마이그레이션</div>
          <div style={{fontSize:11,color:'#a16207',marginTop:2}}>A1/A8/A14 기존 입고 데이터를 A1-1/A8-1/A14-1 (좌)로 일괄 변경</div>
        </div>
        <button onClick={runMigration}
          style={{padding:'7px 14px',background:'#d97706',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'}}>
          변경 실행
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

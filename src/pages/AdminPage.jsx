import { useState, useEffect } from "react"
import { db } from "../firebase"
import { collection, onSnapshot, doc, updateDoc, getDocs, writeBatch, query, where } from "firebase/firestore"
import { useAuth } from "../contexts/AuthContext"

const ROLE_LABEL = { pending:"대기", approved:"승인", admin:"관리자", rejected:"거절", blocked:"차단" }
const ROLE_COLOR = { pending:"#f59e0b", approved:"#16a34a", admin:"#1e40af", rejected:"#dc2626", blocked:"#dc2626" }
const ROLE_BG    = { pending:"#fef3c7", approved:"#dcfce7", admin:"#dbeafe", rejected:"#fee2e2", blocked:"#fee2e2" }

export default function AdminPage() {
  const [users, setUsers] = useState([])
  const { userData } = useAuth()

  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => {
          const order = { pending:0, approved:1, admin:2, rejected:3, blocked:4 }
        
  // 출하확정 전체 취소 (꼬인 재고 복구)
  const restoreAllConfirmed = async () => {
    if (!window.confirm(
      '⚠ 출하 확정 전체 취소\n\n확정된 모든 출하계획을 취소하고\n차감된 재고를 전부 복구합니다.\n\n계속하시겠습니까?'
    )) return

    // 1. shipmentId 있는 출고 기록 전부 삭제
    const outSnap = await getDocs(query(collection(db,'transactions'), where('type','==','출고')))
    const shipmentOuts = outSnap.docs.filter(d => d.data().shipmentId)

    // 2. 확정된 출하계획 → planned으로 되돌리기
    const planSnap = await getDocs(query(collection(db,'transactions'), where('status','==','confirmed')))

    // batch 처리 (500개 제한)
    const allDocs = [...shipmentOuts.map(d=>({id:d.id,op:'delete'})), ...planSnap.docs.map(d=>({id:d.id,op:'update'}))]
    let batch = writeBatch(db)
    let ops = 0

    for (const item of allDocs) {
      if (item.op === 'delete') batch.delete(doc(db,'transactions',item.id))
      else batch.update(doc(db,'transactions',item.id), { status:'planned' })
      ops++
      if (ops === 400) { await batch.commit(); batch = writeBatch(db); ops = 0 }
    }
    if (ops > 0) await batch.commit()

    alert(`완료\n출고기록 ${shipmentOuts.length}건 삭제\n출하계획 ${planSnap.docs.length}건 복구`)
  }

  const runMigration = async () => {
    if (!window.confirm('A1→A1-1, A8→A8-1, A14→A14-1\n기존 데이터를 일괄 변경합니다. 계속하시겠습니까?')) return
    const MAP = { 'A1': 'A1-1', 'A8': 'A8-1', 'A14': 'A14-1' }
    const snap = await getDocs(collection(db, 'transactions'))
    const batch = writeBatch(db)
    let count = 0
    snap.docs.forEach(d => {
      const newCode = MAP[d.data().itemCode]
      if (newCode) { batch.update(doc(db, 'transactions', d.id), { itemCode: newCode }); count++ }
    })
    await batch.commit()
    alert(`완료: ${count}건 변경되었습니다.`)
  }

  return (order[a.role]||9) - (order[b.role]||9)
        }))
    })
  }, [])

  const changeRole = async (uid, role) => {
    await updateDoc(doc(db, "users", uid), { role })
  }

  const pendingCount = users.filter(u => u.role === "pending").length


  // 출하확정 전체 취소 (꼬인 재고 복구)
  const restoreAllConfirmed = async () => {
    if (!window.confirm(
      '⚠ 출하 확정 전체 취소\n\n확정된 모든 출하계획을 취소하고\n차감된 재고를 전부 복구합니다.\n\n계속하시겠습니까?'
    )) return

    // 1. shipmentId 있는 출고 기록 전부 삭제
    const outSnap = await getDocs(query(collection(db,'transactions'), where('type','==','출고')))
    const shipmentOuts = outSnap.docs.filter(d => d.data().shipmentId)

    // 2. 확정된 출하계획 → planned으로 되돌리기
    const planSnap = await getDocs(query(collection(db,'transactions'), where('status','==','confirmed')))

    // batch 처리 (500개 제한)
    const allDocs = [...shipmentOuts.map(d=>({id:d.id,op:'delete'})), ...planSnap.docs.map(d=>({id:d.id,op:'update'}))]
    let batch = writeBatch(db)
    let ops = 0

    for (const item of allDocs) {
      if (item.op === 'delete') batch.delete(doc(db,'transactions',item.id))
      else batch.update(doc(db,'transactions',item.id), { status:'planned' })
      ops++
      if (ops === 400) { await batch.commit(); batch = writeBatch(db); ops = 0 }
    }
    if (ops > 0) await batch.commit()

    alert(`완료\n출고기록 ${shipmentOuts.length}건 삭제\n출하계획 ${planSnap.docs.length}건 복구`)
  }

  const runMigration = async () => {
    if (!window.confirm('A1→A1-1, A8→A8-1, A14→A14-1\n기존 데이터를 일괄 변경합니다. 계속하시겠습니까?')) return
    const MAP = { 'A1': 'A1-1', 'A8': 'A8-1', 'A14': 'A14-1' }
    const snap = await getDocs(collection(db, 'transactions'))
    const batch = writeBatch(db)
    let count = 0
    snap.docs.forEach(d => {
      const newCode = MAP[d.data().itemCode]
      if (newCode) { batch.update(doc(db, 'transactions', d.id), { itemCode: newCode }); count++ }
    })
    await batch.commit()
    alert(`완료: ${count}건 변경되었습니다.`)
  }

  return (
    <div style={{padding:28}}>
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

      <div style={{marginBottom:16,padding:'12px 14px',background:'#fef9c3',border:'1px solid #fde68a',borderRadius:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#92400e'}}>🔧 데이터 마이그레이션</div>
          <div style={{fontSize:11,color:'#a16207',marginTop:2}}>A1/A8/A14 기존 데이터를 A1-1/A8-1/A14-1 (좌)로 일괄 변경</div>
        </div>
        <button onClick={runMigration}
          style={{padding:'7px 14px',background:'#d97706',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'inherit'}}>
          변경 실행
        </button>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:22,fontWeight:700,color:"#0f172a"}}>사용자 관리</div>
        <div style={{fontSize:13,color:"#64748b",marginTop:3}}>
          {pendingCount > 0
            ? <span style={{color:"#d97706",fontWeight:600}}>⚠ 승인 대기 {pendingCount}명</span>
            : "승인 대기 없음"}
        </div>
      </div>

      <div style={{background:"#fff",borderRadius:10,boxShadow:"0 1px 4px rgba(0,0,0,0.08)",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr>
              {["이름","이메일","상태","권한 변경"].map(h => (
                <th key={h} style={{background:"#1e293b",color:"#fff",padding:"11px 16px",fontSize:12,fontWeight:600,textAlign:"left"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} style={{background:i%2===0?"#f8fafc":"#fff"}}>
                <td style={{padding:"12px 16px",fontSize:14,fontWeight:600}}>{u.name}</td>
                <td style={{padding:"12px 16px",fontSize:13,color:"#475569"}}>{u.email}</td>
                <td style={{padding:"12px 16px"}}>
                  <span style={{background:ROLE_BG[u.role],color:ROLE_COLOR[u.role],padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700}}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td style={{padding:"10px 16px"}}>
                  {u.id !== userData?.uid && (
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {u.role !== "approved" && (
                        <button onClick={()=>changeRole(u.id,"approved")} style={S.btnApprove}>승인</button>
                      )}
                      {u.role !== "admin" && (
                        <button onClick={()=>changeRole(u.id,"admin")} style={S.btnAdmin}>관리자</button>
                      )}
                      {u.role !== "rejected" && (
                        <button onClick={()=>changeRole(u.id,"rejected")} style={S.btnReject}>거절</button>
                      )}
                    </div>
                  )}
                  {u.id === userData?.uid && <span style={{fontSize:12,color:"#94a3b8"}}>본인</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const S = {
  btnApprove: {padding:"5px 14px",background:"#16a34a",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"},
  btnAdmin:   {padding:"5px 14px",background:"#1e40af",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"},
  btnReject:  {padding:"5px 14px",background:"#dc2626",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"},
}

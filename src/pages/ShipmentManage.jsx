import { useState, useMemo } from 'react'
import { collection, addDoc, deleteDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

export default function ShipmentManage({ transactions, stockMap }) {
  const shipments = transactions.filter(t => t.type === '출하계획')
    .reduce((acc, t) => {
      const key = t.shipmentId
      if (!acc[key]) acc[key] = { ...t, id: t.id, shipmentId: key }
      return acc
    }, {})

  const plans = transactions
    .filter(t => t.type === '출하계획' && t.isHeader)
    .sort((a,b) => a.date.localeCompare(b.date))

  const [adding, setAdding]   = useState(false)
  const [newPlan, setNewPlan] = useState({ date:'', setQty:'', memo:'' })
  const [saving, setSaving]   = useState(false)
  const [confirming, setConfirming] = useState(null)

  const today = new Date().toISOString().slice(0,10)

  // 계획별 재고 충족 여부
  const checkStock = (setQty) => {
    return ITEMS.every(item => (stockMap[item.code]||0) >= item.needPerSet * setQty)
  }

  const getShortage = (setQty) => {
    return ITEMS.filter(item => (stockMap[item.code]||0) < item.needPerSet * setQty)
      .map(item => `${item.code}(${(stockMap[item.code]||0)}/${item.needPerSet*setQty})`)
  }

  // 출하 계획 저장
  const savePlan = async () => {
    if (!newPlan.date || !newPlan.setQty || Number(newPlan.setQty) <= 0) return
    setSaving(true)
    const shipmentId = `ship_${Date.now()}`
    await addDoc(collection(db, 'transactions'), {
      type: '출하계획',
      isHeader: true,
      shipmentId,
      date: newPlan.date,
      setQty: Number(newPlan.setQty),
      memo: newPlan.memo,
      status: 'planned', // planned | confirmed
      createdAt: serverTimestamp(),
      // 호환용
      itemCode: 'SET', itemName: 'CST SET 출하', quantity: Number(newPlan.setQty),
    })
    setNewPlan({ date: today, setQty:'', memo:'' })
    setAdding(false)
    setSaving(false)
  }

  // 출하 확정 → 재고 차감
  const confirmShipment = async (plan) => {
    const shortage = getShortage(plan.setQty)
    if (shortage.length > 0) {
      const ok = window.confirm(`⚠ 재고 부족 품목:\n${shortage.slice(0,5).join('\n')}\n\n그래도 출하 확정하시겠습니까?`)
      if (!ok) return
    }
    setConfirming(plan.id)
    const batch = writeBatch(db)

    // 각 부품 출고 기록
    for (const item of ITEMS) {
      const ref = doc(collection(db, 'transactions'))
      batch.set(ref, {
        type: '출고',
        itemCode: item.code,
        itemName: item.name,
        quantity: item.needPerSet * plan.setQty,
        date: plan.date,
        memo: `출하확정 ${plan.setQty}SET (${plan.memo||''})`,
        shipmentId: plan.shipmentId,
        createdAt: serverTimestamp(),
      })
    }

    // 계획 상태 업데이트
    const { updateDoc } = await import('firebase/firestore')
    await updateDoc(doc(db, 'transactions', plan.id), { status: 'confirmed' })
    await batch.commit()
    setConfirming(null)
  }

  // 계획 삭제
  const deletePlan = async (id) => {
    if (!window.confirm('출하 계획을 삭제하시겠습니까?')) return
    await deleteDoc(doc(db, 'transactions', id))
  }

  const inp = (val, onChange, type='text', style={}) => (
    <input type={type} value={val} onChange={e=>onChange(e.target.value)}
      style={{width:'100%',padding:'6px 9px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:13,fontFamily:'inherit',outline:'none',...style}} />
  )

  return (
    <div style={S.wrap}>
      <div style={S.topBar}>
        <div>
          <div style={S.title}>출하 관리</div>
          <div style={S.sub}>출하 계획 등록 → 확정 시 재고 자동 차감 · 총 {plans.length}건</div>
        </div>
        <button style={S.addBtn} onClick={()=>{setAdding(true);setNewPlan({date:today,setQty:'',memo:''})}}>
          + 출하 계획 추가
        </button>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead>
            <tr>
              {['출하예정일','SET 수량','재고 충족','메모','상태',''].map((h,i)=>(
                <th key={i} style={{...S.th, textAlign: i===1?'right':'left'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 새 행 */}
            {adding && (
              <tr style={{background:'#eff6ff'}}>
                <td style={S.td}>{inp(newPlan.date, v=>setNewPlan({...newPlan,date:v}), 'date')}</td>
                <td style={S.td}>{inp(newPlan.setQty, v=>setNewPlan({...newPlan,setQty:v}), 'number', {textAlign:'right'})}</td>
                <td style={S.td}>
                  {newPlan.setQty > 0 && (
                    checkStock(Number(newPlan.setQty))
                      ? <span style={S.ok}>✔ 가능</span>
                      : <span style={S.ng}>✘ 부족</span>
                  )}
                </td>
                <td style={S.td}>{inp(newPlan.memo, v=>setNewPlan({...newPlan,memo:v}))}</td>
                <td style={S.td}><span style={S.badgePlan}>계획</span></td>
                <td style={S.td}>
                  <div style={{display:'flex',gap:4}}>
                    <button style={S.saveBtnSm} onClick={savePlan} disabled={saving}>저장</button>
                    <button style={S.cancelBtnSm} onClick={()=>setAdding(false)}>취소</button>
                  </div>
                </td>
              </tr>
            )}

            {plans.length === 0 && !adding && (
              <tr><td colSpan={6} style={{padding:40,textAlign:'center',color:'#94a3b8',fontSize:14}}>등록된 출하 계획이 없습니다</td></tr>
            )}

            {plans.map((plan, i) => {
              const ok = checkStock(plan.setQty)
              const shortage = getShortage(plan.setQty)
              const confirmed = plan.status === 'confirmed'
              return (
                <tr key={plan.id} style={{background: confirmed?'#f0fdf4': i%2===0?'#f8fafc':'#fff'}}>
                  <td style={{...S.td,fontWeight:600}}>{plan.date}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:800,fontSize:15,color:'#1e40af'}}>
                    {plan.setQty?.toLocaleString()} SET
                  </td>
                  <td style={S.td}>
                    {confirmed
                      ? <span style={S.ok}>✔ 확정완료</span>
                      : ok
                        ? <span style={S.ok}>✔ 가능</span>
                        : <span title={shortage.join(', ')} style={S.ng}>✘ {shortage.length}품목 부족</span>
                    }
                  </td>
                  <td style={{...S.td,color:'#64748b',fontSize:12}}>{plan.memo||''}</td>
                  <td style={S.td}>
                    {confirmed
                      ? <span style={S.badgeConfirm}>확정</span>
                      : <span style={S.badgePlan}>계획</span>}
                  </td>
                  <td style={S.td}>
                    {!confirmed && (
                      <div style={{display:'flex',gap:4}}>
                        <button style={S.confirmBtn} onClick={()=>confirmShipment(plan)} disabled={confirming===plan.id}>
                          {confirming===plan.id ? '처리중...' : '출하 확정'}
                        </button>
                        <button style={S.delBtn} onClick={()=>deletePlan(plan.id)}>삭제</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const S = {
  wrap:   { display:'flex', flexDirection:'column', gap:16, height:'100%' },
  topBar: { display:'flex', justifyContent:'space-between', alignItems:'flex-start' },
  title:  { fontSize:18, fontWeight:700, color:'#0f172a' },
  sub:    { fontSize:12, color:'#94a3b8', marginTop:3 },
  addBtn: { padding:'9px 20px', background:'#065f46', color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 },
  card:   { background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', overflow:'auto', flex:1 },
  table:  { width:'100%', borderCollapse:'collapse', minWidth:700 },
  th:     { background:'#1e293b', color:'#94a3b8', padding:'10px 14px', fontSize:11, fontWeight:700, position:'sticky', top:0, letterSpacing:0.8 },
  td:     { padding:'8px 14px', fontSize:13, color:'#1e293b', borderBottom:'1px solid #f1f5f9', verticalAlign:'middle' },
  ok:     { color:'#16a34a', fontWeight:700, fontSize:12 },
  ng:     { color:'#dc2626', fontWeight:700, fontSize:12, cursor:'help' },
  badgePlan:    { background:'#dbeafe', color:'#1e40af', padding:'3px 10px', borderRadius:4, fontSize:11, fontWeight:700 },
  badgeConfirm: { background:'#dcfce7', color:'#16a34a', padding:'3px 10px', borderRadius:4, fontSize:11, fontWeight:700 },
  saveBtnSm:   { padding:'5px 12px', background:'#1e40af', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit' },
  cancelBtnSm: { padding:'5px 10px', background:'#f1f5f9', color:'#475569', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontFamily:'inherit' },
  confirmBtn:  { padding:'5px 12px', background:'#065f46', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit' },
  delBtn:      { padding:'5px 10px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit' },
}

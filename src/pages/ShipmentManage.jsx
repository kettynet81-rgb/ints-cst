import { useState, useRef } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch, serverTimestamp, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.code, i.name]))

const parseDate = (v) => {
  const year = new Date().getFullYear()
  v = v.trim().replace(/[.]/g, '/')
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (slash) return `${year}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  const mmdd = v.match(/^(\d{2})(\d{2})$/)
  if (mmdd) return `${year}-${mmdd[1]}-${mmdd[2]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return v
}
const today = () => new Date().toISOString().slice(0,10)

export default function ShipmentManage({ transactions, stockMap }) {
  const [tab, setTab] = useState('product') // 'product' | 'parts'

  return (
    <div style={S.wrap}>
      {/* 서브 탭 */}
      <div style={S.tabBar}>
        <button style={tab==='product' ? S.tabActive : S.tab} onClick={()=>setTab('product')}>
          📦 제품 출하
        </button>
        <button style={tab==='parts' ? S.tabActive : S.tab} onClick={()=>setTab('parts')}>
          🔧 부품 출고
        </button>
      </div>

      {tab === 'product'
        ? <ProductShipment transactions={transactions} stockMap={stockMap} />
        : <PartsOutbound transactions={transactions} />}
    </div>
  )
}

/* ────────────────────────────────────────────
   제품 출하 탭
──────────────────────────────────────────── */
function ProductShipment({ transactions, stockMap }) {
  const plans = transactions
    .filter(t => t.type === '출하계획' && t.isHeader)
    .sort((a,b) => a.date.localeCompare(b.date))

  const [form, setForm]       = useState({ date: today(), setQty:'', memo:'' })
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [confirming, setConf] = useState(null)
  const [deleting, setDel]    = useState(null)
  const dateRef = useRef(null)
  const qtyRef  = useRef(null)
  const memoRef = useRef(null)

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))
  const qty = Number(form.setQty)

  const checkStock = (q) => ITEMS.every(i => (stockMap[i.code]||0) >= i.needPerSet * q)
  const getShort   = (q) => ITEMS.filter(i => (stockMap[i.code]||0) < i.needPerSet * q)
  const isReady    = form.date && qty > 0

  const handleSave = async () => {
    if (!isReady) return
    setSaving(true)
    const shipmentId = `ship_${Date.now()}`
    await addDoc(collection(db, 'transactions'), {
      type:'출하계획', isHeader:true, shipmentId,
      date: form.date, setQty: qty, memo: form.memo.trim(),
      status:'planned',
      itemCode:'SET', itemName:'CST SET 출하', quantity: qty,
      createdAt: serverTimestamp(),
    })
    setForm({ date: today(), setQty:'', memo:'' })
    setSaving(false); setSaved(true)
    setTimeout(() => { setSaved(false); qtyRef.current?.focus() }, 1500)
  }

  const confirmShipment = async (plan) => {
    const short = getShort(plan.setQty)
    if (short.length > 0) {
      const ok = window.confirm(`⚠ 재고 부족 품목 ${short.length}개:\n${short.slice(0,5).map(i=>`${i.code} (${i.needPerSet*plan.setQty - (stockMap[i.code]||0)}개 부족)`).join('\n')}\n\n그래도 출하 확정하시겠습니까?`)
      if (!ok) return
    }
    setConf(plan.id)
    const batch = writeBatch(db)
    for (const item of ITEMS) {
      batch.set(doc(collection(db, 'transactions')), {
        type:'출고', itemCode:item.code, itemName:item.name,
        quantity: item.needPerSet * plan.setQty,
        date: plan.date,
        memo: `제품출하 ${plan.setQty}SET${plan.memo ? ' / '+plan.memo : ''}`,
        shipmentId: plan.shipmentId, createdAt: serverTimestamp(),
      })
    }
    await updateDoc(doc(db, 'transactions', plan.id), { status:'confirmed' })
    await batch.commit()
    setConf(null)
  }

  // 확정 취소 → 차감된 재고 복구
  const cancelShipment = async (plan) => {
    const ok = window.confirm(`출하 확정을 취소하시겠습니까?\n확정 시 차감된 재고가 복구됩니다.`)
    if (!ok) return
    setConf(plan.id)
    const batch = writeBatch(db)
    // 이 출하로 생성된 출고 기록 삭제 (재고 복구)
    const relatedOuts = transactions.filter(t => t.type==='출고' && t.shipmentId===plan.shipmentId)
    relatedOuts.forEach(t => batch.delete(doc(db,'transactions',t.id)))
    // 계획 상태 복구
    batch.update(doc(db,'transactions',plan.id), { status:'planned' })
    await batch.commit()
    setConf(null)
  }

  // 계획 인라인 수정
  const [editPlanId, setEditPlanId] = useState(null)
  const [editPlan, setEditPlan]     = useState({})

  const savePlanEdit = async () => {
    await updateDoc(doc(db,'transactions',editPlanId), {
      date: editPlan.date,
      setQty: Number(editPlan.setQty),
      quantity: Number(editPlan.setQty),
      memo: editPlan.memo,
    })
    setEditPlanId(null)
  }

  const deletePlan = async (plan) => {
    if (!window.confirm('출하 계획을 삭제하시겠습니까?\n관련 출고 기록도 함께 삭제됩니다.')) return
    setDel(plan.id)
    const batch = writeBatch(db)
    // 계획 문서 삭제
    batch.delete(doc(db, 'transactions', plan.id))
    // 관련 출고 기록 삭제 (shipmentId로 연결된 것)
    if (plan.shipmentId) {
      const related = transactions.filter(t => t.shipmentId === plan.shipmentId && t.type === '출고')
      related.forEach(t => batch.delete(doc(db, 'transactions', t.id)))
    }
    await batch.commit()
    setDel(null)
  }

  return (
    <div style={S.inner}>
      {/* 입력 카드 */}
      <div style={S.inputCard}>
        <div style={S.inputLabel}>출하 등록</div>
        <div style={S.inputRow}>
          <div style={S.field}>
            <label style={S.label}>출하 날짜</label>
            <input ref={dateRef} type="text" value={form.date}
              onChange={e=>setF('date',e.target.value)}
              onBlur={e=>setF('date',parseDate(e.target.value))}
              onKeyDown={e=>e.key==='Enter'&&(setF('date',parseDate(form.date)),qtyRef.current?.focus())}
              placeholder="7/5 또는 0705"
              style={{...S.inp, width:130}} />
          </div>
          <div style={S.field}>
            <label style={S.label}>SET 수량</label>
            <input ref={qtyRef} type="number" min="1" value={form.setQty}
              onChange={e=>setF('setQty',e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&memoRef.current?.focus()}
              placeholder="0"
              style={{...S.inp, width:100, textAlign:'right', fontWeight:700, fontSize:15}} />
          </div>
          {/* 재고 충족 여부 실시간 표시 */}
          {qty > 0 && (
            <div style={{...S.field, justifyContent:'flex-end'}}>
              <label style={{...S.label, opacity:0}}>·</label>
              {checkStock(qty)
                ? <span style={S.ok}>✔ 재고 충족</span>
                : <span style={S.ng}>✘ {getShort(qty).length}품목 부족</span>}
            </div>
          )}
          <div style={{...S.field, flex:2}}>
            <label style={S.label}>메모</label>
            <input ref={memoRef} type="text" value={form.memo}
              onChange={e=>setF('memo',e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleSave()}
              placeholder="메모 입력"
              style={{...S.inp, flex:1}} />
          </div>
          <div style={{...S.field, justifyContent:'flex-end'}}>
            <label style={{...S.label, opacity:0}}>·</label>
            <button onClick={handleSave} disabled={!isReady||saving}
              style={{...S.saveBtn,
                background: saved?'#16a34a': isReady?'#065f46':'#cbd5e1',
                cursor: isReady?'pointer':'not-allowed'}}>
              {saved?'✓ 저장됨':saving?'저장 중':'저장  ↵'}
            </button>
          </div>
        </div>
        {qty > 0 && !checkStock(qty) && (
          <div style={{marginTop:8,fontSize:11,color:'#dc2626'}}>
            부족: {getShort(qty).map(i=>`${i.code}(${Math.max(0,i.needPerSet*qty-(stockMap[i.code]||0))}개)`).join(' · ')}
          </div>
        )}
      </div>

      {/* 출하 계획 목록 */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>출하 계획 목록</span>
          <span style={S.cardSub}>총 {plans.length}건 · 확정 시 재고 자동 차감</span>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['출하날짜','SET 수량','재고충족','메모','상태',''].map((h,i)=>(
                  <th key={i} style={{...S.th, textAlign:i===1?'right':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.length===0 && (
                <tr><td colSpan={6} style={{padding:40,textAlign:'center',color:'#94a3b8',fontSize:13}}>등록된 출하 계획이 없습니다</td></tr>
              )}
              {plans.map((plan,i) => {
                const ok = checkStock(plan.setQty)
                const confirmed = plan.status==='confirmed'
                const bg = confirmed?'#f0fdf4':i%2===0?'#f8fafc':'#fff'
                return (
                  <tr key={plan.id} style={{background:bg}}>
                    <td style={{...S.td,fontWeight:600}}>
                      {editPlanId===plan.id
                        ? <input type="text" value={editPlan.date} onChange={e=>setEditPlan({...editPlan,date:e.target.value})} style={{...S.tdInp,width:110}}/>
                        : plan.date}
                    </td>
                    <td style={{...S.td,textAlign:'right',fontWeight:800,fontSize:14,color:'#065f46'}}>
                      {editPlanId===plan.id
                        ? <input type="number" value={editPlan.setQty} onChange={e=>setEditPlan({...editPlan,setQty:e.target.value})} style={{...S.tdInp,width:70,textAlign:'right'}}/>
                        : <>{plan.setQty?.toLocaleString()} SET</>}
                    </td>
                    <td style={S.td}>
                      {confirmed ? <span style={S.ok}>✔ 확정완료</span>
                        : ok ? <span style={S.ok}>✔ 가능</span>
                        : <span style={S.ng}>✘ {getShort(plan.setQty).length}품목 부족</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#64748b'}}>
                      {editPlanId===plan.id
                        ? <input type="text" value={editPlan.memo} onChange={e=>setEditPlan({...editPlan,memo:e.target.value})} style={S.tdInp}/>
                        : plan.memo||''}
                    </td>
                    <td style={S.td}>
                      {confirmed
                        ? <span style={S.badgeConfirm}>확정</span>
                        : <span style={S.badgePlan}>계획</span>}
                    </td>
                    <td style={S.td}>
                      {confirmed ? (
                        <button style={S.cancelBtn} onClick={()=>cancelShipment(plan)} disabled={confirming===plan.id}>
                          {confirming===plan.id?'처리중...':'확정 취소'}
                        </button>
                      ) : editPlanId===plan.id ? (
                        <div style={{display:'flex',gap:4}}>
                          <button style={S.smSave} onClick={savePlanEdit}>저장</button>
                          <button style={S.smCancel} onClick={()=>setEditPlanId(null)}>취소</button>
                        </div>
                      ) : (
                        <div style={{display:'flex',gap:4}}>
                          <button style={S.confirmBtn} onClick={()=>confirmShipment(plan)} disabled={confirming===plan.id}>
                            {confirming===plan.id?'처리중...':'출하 확정'}
                          </button>
                          <button style={S.smSave} onClick={()=>{setEditPlanId(plan.id);setEditPlan({date:plan.date,setQty:plan.setQty,memo:plan.memo||''})}}>수정</button>
                          <button style={S.smDel} onClick={()=>deletePlan(plan)} disabled={deleting===plan.id}>삭제</button>
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
    </div>
  )
}

/* ────────────────────────────────────────────
   부품 출고 탭
──────────────────────────────────────────── */
function PartsOutbound({ transactions }) {
  const outbounds = transactions
    .filter(t => t.type==='출고' && !t.shipmentId)
    .sort((a,b) => b.date.localeCompare(a.date)||(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))

  const [form, setForm]     = useState({ date:today(), itemCode:'', quantity:'', memo:'' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({})
  const [deleting, setDel]  = useState(null)
  const codeRef = useRef(null)
  const qtyRef  = useRef(null)
  const memoRef = useRef(null)

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))
  const codeUpper = form.itemCode.trim().toUpperCase()
  const foundItem = ITEMS.find(i=>i.code===codeUpper) || ITEMS.find(i=>i.code==='A'+codeUpper)
  const isReady = form.date && foundItem && form.quantity && Number(form.quantity)>0

  const finalizeCode = (v, goNext=false) => {
    let val = v.trim().toUpperCase()
    if (/^\d+$/.test(val)) val = 'A'+val
    setF('itemCode', val)
    if (ITEMS.find(i=>i.code===val) && goNext) setTimeout(()=>qtyRef.current?.focus(),50)
  }

  const handleSave = async () => {
    if (!isReady) return
    setSaving(true)
    await addDoc(collection(db,'transactions'), {
      type:'출고', date:form.date,
      itemCode:foundItem.code, itemName:foundItem.name,
      quantity:Number(form.quantity), memo:form.memo.trim(),
      createdAt:serverTimestamp(),
    })
    setForm({date:today(),itemCode:'',quantity:'',memo:''})
    setSaving(false); setSaved(true)
    setTimeout(()=>{setSaved(false);codeRef.current?.focus()},1500)
  }

  const saveEdit = async () => {
    await updateDoc(doc(db,'transactions',editId), {
      date:editData.date, itemCode:editData.itemCode,
      itemName:ITEM_MAP[editData.itemCode]||'',
      quantity:Number(editData.quantity), memo:editData.memo,
    })
    setEditId(null)
  }

  const deleteRow = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    setDel(id); await deleteDoc(doc(db,'transactions',id)); setDel(null)
  }

  return (
    <div style={S.inner}>
      <div style={S.inputCard}>
        <div style={S.inputLabel}>부품 출고 등록 <span style={{color:'#94a3b8',fontWeight:400,fontSize:10,marginLeft:6}}>불량·기타 출고</span></div>
        <div style={S.inputRow}>
          <div style={S.field}>
            <label style={S.label}>날짜</label>
            <input type="text" value={form.date}
              onChange={e=>setF('date',e.target.value)}
              onBlur={e=>setF('date',parseDate(e.target.value))}
              onKeyDown={e=>e.key==='Enter'&&(setF('date',parseDate(form.date)),codeRef.current?.focus())}
              placeholder="7/5 또는 0705"
              style={{...S.inp,width:130}} />
          </div>
          <div style={{...S.field,flex:2}}>
            <label style={S.label}>
              품목코드
              {foundItem && <span style={{color:'#16a34a',fontWeight:700,fontSize:11,marginLeft:6}}>→ {foundItem.name}</span>}
              {form.itemCode && !foundItem && <span style={{color:'#dc2626',fontSize:11,marginLeft:6}}>→ 없는 코드</span>}
            </label>
            <input ref={codeRef} type="text" value={form.itemCode}
              onChange={e=>setF('itemCode',e.target.value.toUpperCase())}
              onKeyDown={e=>{if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();finalizeCode(form.itemCode,true)}}}
              onBlur={e=>finalizeCode(form.itemCode,false)}
              placeholder="18 또는 A18"
              style={{...S.inp,width:140,borderColor:foundItem?'#16a34a':form.itemCode?'#dc2626':'#e2e8f0'}} />
          </div>
          <div style={S.field}>
            <label style={S.label}>수량 (EA)</label>
            <input ref={qtyRef} type="number" min="1" value={form.quantity}
              onChange={e=>setF('quantity',e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&memoRef.current?.focus()}
              placeholder="0"
              style={{...S.inp,width:100,textAlign:'right',fontWeight:700,fontSize:15}} />
          </div>
          <div style={{...S.field,flex:2}}>
            <label style={S.label}>메모</label>
            <input ref={memoRef} type="text" value={form.memo}
              onChange={e=>setF('memo',e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleSave()}
              placeholder="불량, 샘플 등"
              style={{...S.inp,flex:1}} />
          </div>
          <div style={{...S.field,justifyContent:'flex-end'}}>
            <label style={{...S.label,opacity:0}}>·</label>
            <button onClick={handleSave} disabled={!isReady||saving}
              style={{...S.saveBtn,background:saved?'#16a34a':isReady?'#dc2626':'#cbd5e1',cursor:isReady?'pointer':'not-allowed'}}>
              {saved?'✓ 저장됨':saving?'저장 중':'저장  ↵'}
            </button>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>부품 출고 기록</span>
          <span style={S.cardSub}>총 {outbounds.length}건 · 행 클릭하면 수정</span>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['날짜','코드','품목명','수량 (EA)','메모',''].map((h,i)=>(
                  <th key={i} style={{...S.th,textAlign:i===3?'right':'left',width:i===0?110:i===1?70:i===3?100:i===5?80:'auto'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outbounds.map((tx,i)=>{
                const isEdit = editId===tx.id
                return (
                  <tr key={tx.id} style={{background:isEdit?'#fff5f5':i%2===0?'#f8fafc':'#fff',cursor:isEdit?'default':'pointer'}}
                    onClick={()=>!isEdit&&(setEditId(tx.id),setEditData({date:tx.date,itemCode:tx.itemCode,quantity:tx.quantity,memo:tx.memo||''}))}>
                    <td style={{...S.td,fontSize:12,color:'#475569'}}>
                      {isEdit?<input type="text" value={editData.date} onChange={e=>setEditData({...editData,date:e.target.value})} style={S.tdInp}/>:tx.date}
                    </td>
                    <td style={S.td}>
                      {isEdit?<input type="text" value={editData.itemCode} onChange={e=>setEditData({...editData,itemCode:e.target.value.toUpperCase()})} style={{...S.tdInp,width:60}}/>
                        :<span style={{...S.codeTag,background:'#fff5f5',color:'#dc2626'}}>{tx.itemCode}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#374151'}}>
                      {isEdit?ITEM_MAP[editData.itemCode]||'—':tx.itemName}
                    </td>
                    <td style={{...S.td,textAlign:'right'}}>
                      {isEdit?<input type="number" value={editData.quantity} onChange={e=>setEditData({...editData,quantity:e.target.value})} style={{...S.tdInp,textAlign:'right',width:80}}/>
                        :<span style={{fontWeight:700,color:'#dc2626'}}>{tx.quantity.toLocaleString()}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#64748b'}}>
                      {isEdit?<input type="text" value={editData.memo} onChange={e=>setEditData({...editData,memo:e.target.value})} style={S.tdInp}/>:tx.memo||''}
                    </td>
                    <td style={S.td} onClick={e=>e.stopPropagation()}>
                      {isEdit?(
                        <div style={{display:'flex',gap:4}}>
                          <button style={S.smSave} onClick={saveEdit}>저장</button>
                          <button style={S.smCancel} onClick={()=>setEditId(null)}>취소</button>
                        </div>
                      ):<button style={S.smDel} disabled={deleting===tx.id} onClick={()=>deleteRow(tx.id)}>삭제</button>}
                    </td>
                  </tr>
                )
              })}
              {outbounds.length===0&&<tr><td colSpan={6} style={{padding:40,textAlign:'center',color:'#94a3b8',fontSize:13}}>부품 출고 기록이 없습니다</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const S = {
  wrap:  {display:'flex',flexDirection:'column',gap:10,height:'100%'},
  inner: {display:'flex',flexDirection:'column',gap:12,flex:1,minHeight:0},

  tabBar:    {display:'flex',gap:4,background:'#fff',borderRadius:8,border:'1px solid #e2e8f0',padding:4,width:'fit-content'},
  tab:       {padding:'7px 18px',background:'none',border:'none',color:'#64748b',cursor:'pointer',borderRadius:6,fontFamily:'inherit',fontWeight:500,fontSize:13},
  tabActive: {padding:'7px 18px',background:'#0f172a',border:'none',color:'#fff',cursor:'pointer',borderRadius:6,fontFamily:'inherit',fontWeight:700,fontSize:13},

  inputCard:  {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',padding:'14px 18px',flexShrink:0},
  inputLabel: {fontSize:11,fontWeight:700,color:'#94a3b8',letterSpacing:1,textTransform:'uppercase',marginBottom:10},
  inputRow:   {display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'},
  field:      {display:'flex',flexDirection:'column',gap:4},
  label:      {fontSize:11,fontWeight:600,color:'#64748b',letterSpacing:0.3},
  inp:        {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b'},
  saveBtn:    {padding:'9px 20px',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,fontFamily:'inherit',whiteSpace:'nowrap'},

  ok:  {fontSize:12,fontWeight:700,color:'#16a34a'},
  ng:  {fontSize:12,fontWeight:700,color:'#dc2626'},

  card:     {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'},
  cardHead: {padding:'10px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
  cardTitle:{fontSize:13,fontWeight:700,color:'#0f172a'},
  cardSub:  {fontSize:11,color:'#94a3b8'},
  tableWrap:{overflowY:'auto',flex:1},
  table:    {width:'100%',borderCollapse:'collapse'},
  th:       {background:'#1e293b',color:'#94a3b8',padding:'8px 12px',fontSize:10,fontWeight:700,position:'sticky',top:0,letterSpacing:0.5,whiteSpace:'nowrap'},
  td:       {padding:'6px 12px',fontSize:12,color:'#1e293b',borderBottom:'1px solid #f1f5f9',verticalAlign:'middle'},
  tdInp:    {padding:'4px 7px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:12,fontFamily:'inherit',outline:'none',width:'100%'},
  codeTag:  {background:'#eff6ff',color:'#1e40af',padding:'1px 7px',borderRadius:4,fontSize:11,fontWeight:800},

  badgePlan:    {background:'#dbeafe',color:'#1e40af',padding:'2px 9px',borderRadius:4,fontSize:11,fontWeight:700},
  badgeConfirm: {background:'#dcfce7',color:'#16a34a',padding:'2px 9px',borderRadius:4,fontSize:11,fontWeight:700},
  confirmBtn:   {padding:'4px 12px',background:'#065f46',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  cancelBtn:    {padding:'4px 12px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  tdInp:        {padding:'4px 7px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:12,fontFamily:'inherit',outline:'none',width:'100%'},
  smSave:       {padding:'4px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  smSave:   {padding:'4px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  smCancel: {padding:'4px 9px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  smDel:    {padding:'4px 9px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
}

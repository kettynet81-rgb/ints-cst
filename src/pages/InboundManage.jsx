import { useState, useRef, useEffect } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.code, i.name]))
const today = () => new Date().toISOString().slice(0,10)

export default function InboundManage({ transactions }) {
  const inbounds = transactions
    .filter(t => t.type === '입고')
    .sort((a,b) => b.date.localeCompare(a.date) || (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))

  // 입력폼 상태
  const [form, setForm]     = useState({ date: today(), itemCode:'', quantity:'', memo:'' })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const qtyRef = useRef(null)
  const codeRef = useRef(null)

  // 인라인 수정
  const [editId, setEditId]   = useState(null)
  const [editData, setEditData] = useState({})
  const [deleting, setDeleting] = useState(null)

  // 품목 선택하면 수량으로 포커스
  useEffect(() => {
    if (form.itemCode) qtyRef.current?.focus()
  }, [form.itemCode])

  const setF = (k, v) => setForm(f => ({...f, [k]: v}))

  const handleSave = async () => {
    if (!form.date || !form.itemCode || !form.quantity || Number(form.quantity) <= 0) return
    setSaving(true)
    await addDoc(collection(db, 'transactions'), {
      type: '입고',
      date: form.date,
      itemCode: form.itemCode,
      itemName: ITEM_MAP[form.itemCode] || '',
      quantity: Number(form.quantity),
      memo: form.memo.trim(),
      createdAt: serverTimestamp(),
    })
    setForm({ date: today(), itemCode:'', quantity:'', memo:'' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    codeRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave()
  }

  const startEdit = (tx) => {
    setEditId(tx.id)
    setEditData({ date: tx.date, itemCode: tx.itemCode, quantity: tx.quantity, memo: tx.memo||'' })
  }

  const saveEdit = async () => {
    if (!editData.date || !editData.itemCode || !editData.quantity) return
    await updateDoc(doc(db, 'transactions', editId), {
      date: editData.date,
      itemCode: editData.itemCode,
      itemName: ITEM_MAP[editData.itemCode] || '',
      quantity: Number(editData.quantity),
      memo: editData.memo,
    })
    setEditId(null)
  }

  const deleteRow = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return
    setDeleting(id)
    await deleteDoc(doc(db, 'transactions', id))
    setDeleting(null)
  }

  const tdInp = (val, onChange, type='text', extra={}) => (
    <input type={type} value={val} onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === 'Escape' && setEditId(null)}
      style={{width:'100%', padding:'4px 7px', border:'1.5px solid #3b82f6', borderRadius:4, fontSize:12, fontFamily:'inherit', outline:'none', ...extra}} />
  )

  return (
    <div style={S.wrap}>

      {/* ── 입력바 ── */}
      <div style={S.inputCard}>
        <div style={S.inputLabel}>입고 등록</div>
        <div style={S.inputRow}>
          {/* 날짜 */}
          <div style={S.fieldWrap}>
            <label style={S.fieldLabel}>날짜</label>
            <input type="date" value={form.date} onChange={e => setF('date', e.target.value)}
              style={{...S.field, width:140}} />
          </div>

          {/* 품목 */}
          <div style={{...S.fieldWrap, flex:2}}>
            <label style={S.fieldLabel}>품목</label>
            <select ref={codeRef} value={form.itemCode} onChange={e => setF('itemCode', e.target.value)}
              style={{...S.field, flex:1}}>
              <option value="">-- 품목 선택 --</option>
              {ITEMS.map(i => (
                <option key={i.code} value={i.code}>[{i.code}]  {i.name}</option>
              ))}
            </select>
          </div>

          {/* 수량 */}
          <div style={S.fieldWrap}>
            <label style={S.fieldLabel}>수량 (EA)</label>
            <input ref={qtyRef} type="number" value={form.quantity} min="1"
              onChange={e => setF('quantity', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0"
              style={{...S.field, width:100, textAlign:'right'}} />
          </div>

          {/* 메모 */}
          <div style={{...S.fieldWrap, flex:2}}>
            <label style={S.fieldLabel}>메모</label>
            <input type="text" value={form.memo}
              onChange={e => setF('memo', e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="좌 150 / 우 150 등 (선택)"
              style={{...S.field, flex:1}} />
          </div>

          {/* 저장 */}
          <div style={{...S.fieldWrap, justifyContent:'flex-end'}}>
            <label style={{...S.fieldLabel, opacity:0}}>-</label>
            <button onClick={handleSave} disabled={saving || !form.itemCode || !form.quantity}
              style={{
                ...S.saveBtn,
                background: saved ? '#16a34a' : (!form.itemCode||!form.quantity) ? '#cbd5e1' : '#1e40af',
                cursor: (!form.itemCode||!form.quantity) ? 'not-allowed' : 'pointer',
              }}>
              {saved ? '✓ 저장됨' : saving ? '저장 중...' : '저장  ↵'}
            </button>
          </div>
        </div>

        {/* 품목 선택 시 필요수량 힌트 */}
        {form.itemCode && (
          <div style={S.hint}>
            <span style={{color:'#94a3b8'}}>1SET 필요수량:</span>
            <strong style={{color:'#1e40af',marginLeft:6}}>
              {ITEMS.find(i=>i.code===form.itemCode)?.needPerSet} EA
            </strong>
            {form.quantity && (
              <span style={{color:'#94a3b8',marginLeft:16}}>
                → {Math.floor(Number(form.quantity) / (ITEMS.find(i=>i.code===form.itemCode)?.needPerSet||1)).toLocaleString()} SET 분량
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 기록 테이블 ── */}
      <div style={S.card}>
        <div style={S.cardHead}>
          <span style={S.cardTitle}>입고 기록</span>
          <span style={S.cardSub}>총 {inbounds.length}건 · 행 클릭하면 수정</span>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['날짜','코드','품목명','수량 (EA)','메모',''].map((h,i) => (
                  <th key={i} style={{...S.th, textAlign: i===3?'right':'left',
                    width: i===0?110:i===1?70:i===3?100:i===5?80:'auto'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inbounds.map((tx, i) => {
                const isEdit = editId === tx.id
                const bg = isEdit ? '#eff6ff' : i%2===0 ? '#f8fafc' : '#fff'
                return (
                  <tr key={tx.id} style={{background:bg, cursor: isEdit?'default':'pointer'}}
                    onClick={() => !isEdit && startEdit(tx)}>
                    <td style={S.td}>
                      {isEdit
                        ? tdInp(editData.date, v=>setEditData({...editData,date:v}), 'date')
                        : <span style={{fontSize:12,color:'#475569'}}>{tx.date}</span>}
                    </td>
                    <td style={S.td}>
                      {isEdit
                        ? <select value={editData.itemCode} onChange={e=>setEditData({...editData,itemCode:e.target.value})}
                            style={{width:'100%',padding:'4px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:11,fontFamily:'inherit'}}>
                            {ITEMS.map(i=><option key={i.code} value={i.code}>{i.code}</option>)}
                          </select>
                        : <span style={S.codeTag}>{tx.itemCode}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#374151'}}>
                      {isEdit ? ITEM_MAP[editData.itemCode]||'-' : tx.itemName}
                    </td>
                    <td style={{...S.td,textAlign:'right'}}>
                      {isEdit
                        ? tdInp(String(editData.quantity), v=>setEditData({...editData,quantity:v}), 'number', {textAlign:'right'})
                        : <span style={{fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{tx.quantity.toLocaleString()}</span>}
                    </td>
                    <td style={{...S.td,fontSize:12,color:'#64748b'}}>
                      {isEdit
                        ? tdInp(editData.memo, v=>setEditData({...editData,memo:v}))
                        : tx.memo||''}
                    </td>
                    <td style={S.td} onClick={e=>e.stopPropagation()}>
                      {isEdit ? (
                        <div style={{display:'flex',gap:4}}>
                          <button style={S.smSave} onClick={saveEdit}>저장</button>
                          <button style={S.smCancel} onClick={()=>setEditId(null)}>취소</button>
                        </div>
                      ) : (
                        <button style={S.smDel} disabled={deleting===tx.id}
                          onClick={()=>deleteRow(tx.id)}>삭제</button>
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

const S = {
  wrap: {display:'flex',flexDirection:'column',gap:16,height:'100%'},

  inputCard:  {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',padding:'16px 20px'},
  inputLabel: {fontSize:12,fontWeight:700,color:'#94a3b8',letterSpacing:0.8,textTransform:'uppercase',marginBottom:12},
  inputRow:   {display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'},
  fieldWrap:  {display:'flex',flexDirection:'column',gap:4},
  fieldLabel: {fontSize:11,fontWeight:600,color:'#64748b',letterSpacing:0.3},
  field:      {padding:'8px 11px',border:'1.5px solid #e2e8f0',borderRadius:7,fontSize:13,fontFamily:'inherit',outline:'none',color:'#1e293b',transition:'border 0.15s'},
  saveBtn:    {padding:'8px 20px',color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,fontFamily:'inherit',transition:'background 0.2s',whiteSpace:'nowrap'},
  hint:       {marginTop:10,fontSize:12,color:'#64748b'},

  card:     {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flex:1,minHeight:0,overflow:'hidden'},
  cardHead: {padding:'12px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0},
  cardTitle:{fontSize:13,fontWeight:700,color:'#0f172a'},
  cardSub:  {fontSize:11,color:'#94a3b8'},

  tableWrap:{overflowY:'auto',flex:1},
  table:    {width:'100%',borderCollapse:'collapse'},
  th:       {background:'#1e293b',color:'#94a3b8',padding:'9px 14px',fontSize:11,fontWeight:700,position:'sticky',top:0,letterSpacing:0.8,whiteSpace:'nowrap'},
  td:       {padding:'7px 14px',fontSize:13,color:'#1e293b',borderBottom:'1px solid #f1f5f9',verticalAlign:'middle'},
  codeTag:  {background:'#eff6ff',color:'#1e40af',padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:800},

  smSave:   {padding:'4px 10px',background:'#1e40af',color:'#fff',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
  smCancel: {padding:'4px 9px',background:'#f1f5f9',color:'#475569',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontFamily:'inherit'},
  smDel:    {padding:'4px 9px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:4,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit'},
}

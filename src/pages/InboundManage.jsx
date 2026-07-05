import { useState, useRef } from 'react'
import { collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { ITEMS } from '../data/items'

const ITEM_MAP = Object.fromEntries(ITEMS.map(i => [i.code, i.name]))

export default function InboundManage({ transactions }) {
  const inbounds = transactions.filter(t => t.type === '입고')
    .sort((a,b) => b.date.localeCompare(a.date))

  const [editId, setEditId]   = useState(null)
  const [editData, setEditData] = useState({})
  const [adding, setAdding]   = useState(false)
  const [newRow, setNewRow]   = useState({ date:'', itemCode:'', quantity:'', memo:'' })
  const [saving, setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  const today = new Date().toISOString().slice(0,10)

  // 행 수정 시작
  const startEdit = (tx) => {
    setEditId(tx.id)
    setEditData({ date: tx.date, itemCode: tx.itemCode, quantity: tx.quantity, memo: tx.memo||'' })
    setAdding(false)
  }

  // 수정 저장
  const saveEdit = async () => {
    if (!editData.date || !editData.itemCode || !editData.quantity) return
    setSaving(true)
    await updateDoc(doc(db, 'transactions', editId), {
      date: editData.date,
      itemCode: editData.itemCode,
      itemName: ITEM_MAP[editData.itemCode] || '',
      quantity: Number(editData.quantity),
      memo: editData.memo,
    })
    setEditId(null)
    setSaving(false)
  }

  // 행 삭제
  const deleteRow = async (id) => {
    if (!window.confirm('이 행을 삭제하시겠습니까?')) return
    setDeleting(id)
    await deleteDoc(doc(db, 'transactions', id))
    setDeleting(null)
  }

  // 새 행 추가
  const addRow = async () => {
    if (!newRow.date || !newRow.itemCode || !newRow.quantity) return
    setSaving(true)
    await addDoc(collection(db, 'transactions'), {
      date: newRow.date,
      type: '입고',
      itemCode: newRow.itemCode,
      itemName: ITEM_MAP[newRow.itemCode] || '',
      quantity: Number(newRow.quantity),
      memo: newRow.memo,
      createdAt: serverTimestamp(),
    })
    setNewRow({ date: today, itemCode:'', quantity:'', memo:'' })
    setAdding(false)
    setSaving(false)
  }

  const inp = (val, onChange, type='text', style={}) => (
    <input type={type} value={val} onChange={e=>onChange(e.target.value)}
      style={{width:'100%',padding:'5px 8px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:13,fontFamily:'inherit',outline:'none',...style}} />
  )

  const sel = (val, onChange) => (
    <select value={val} onChange={e=>onChange(e.target.value)}
      style={{width:'100%',padding:'5px 8px',border:'1.5px solid #3b82f6',borderRadius:4,fontSize:13,fontFamily:'inherit',outline:'none'}}>
      <option value="">선택</option>
      {ITEMS.map(i=><option key={i.code} value={i.code}>[{i.code}] {i.name}</option>)}
    </select>
  )

  return (
    <div style={S.wrap}>
      <div style={S.topBar}>
        <div>
          <div style={S.title}>입고 관리</div>
          <div style={S.sub}>행을 클릭하면 바로 수정됩니다 · 총 {inbounds.length}건</div>
        </div>
        <button style={S.addBtn} onClick={()=>{setAdding(true);setEditId(null);setNewRow({date:today,itemCode:'',quantity:'',memo:''})}}>
          + 입고 추가
        </button>
      </div>

      <div style={S.card}>
        <table style={S.table}>
          <thead>
            <tr>
              {['날짜','품목코드','품목명','수량 (EA)','메모',''].map((h,i)=>(
                <th key={i} style={{...S.th, textAlign: i===3?'right':'left', width: i===0?110:i===1?80:i===3?90:i===5?60:'auto'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 새 행 추가 */}
            {adding && (
              <tr style={{background:'#eff6ff'}}>
                <td style={S.td}>{inp(newRow.date, v=>setNewRow({...newRow,date:v}), 'date')}</td>
                <td style={S.td}>{sel(newRow.itemCode, v=>setNewRow({...newRow,itemCode:v}))}</td>
                <td style={{...S.td,color:'#64748b',fontSize:12}}>{ITEM_MAP[newRow.itemCode]||'-'}</td>
                <td style={S.td}>{inp(newRow.quantity, v=>setNewRow({...newRow,quantity:v}), 'number', {textAlign:'right'})}</td>
                <td style={S.td}>{inp(newRow.memo, v=>setNewRow({...newRow,memo:v}))}</td>
                <td style={S.td}>
                  <div style={{display:'flex',gap:4}}>
                    <button style={S.saveBtnSm} onClick={addRow} disabled={saving}>저장</button>
                    <button style={S.cancelBtnSm} onClick={()=>setAdding(false)}>취소</button>
                  </div>
                </td>
              </tr>
            )}

            {inbounds.map((tx, i) => {
              const isEdit = editId === tx.id
              return (
                <tr key={tx.id}
                  style={{background: isEdit?'#eff6ff': i%2===0?'#f8fafc':'#fff', cursor: isEdit?'default':'pointer'}}
                  onClick={()=>!isEdit && startEdit(tx)}>
                  <td style={S.td}>
                    {isEdit ? inp(editData.date, v=>setEditData({...editData,date:v}), 'date')
                      : <span style={{fontSize:13}}>{tx.date}</span>}
                  </td>
                  <td style={S.td}>
                    {isEdit ? sel(editData.itemCode, v=>setEditData({...editData,itemCode:v}))
                      : <span style={S.codeTag}>{tx.itemCode}</span>}
                  </td>
                  <td style={{...S.td,fontSize:12,color:'#475569'}}>
                    {isEdit ? ITEM_MAP[editData.itemCode]||'-' : tx.itemName}
                  </td>
                  <td style={{...S.td,textAlign:'right',fontWeight:isEdit?400:700}}>
                    {isEdit ? inp(editData.quantity, v=>setEditData({...editData,quantity:v}), 'number', {textAlign:'right'})
                      : tx.quantity.toLocaleString()}
                  </td>
                  <td style={{...S.td,color:'#64748b',fontSize:12}}>
                    {isEdit ? inp(editData.memo, v=>setEditData({...editData,memo:v}))
                      : tx.memo||''}
                  </td>
                  <td style={S.td} onClick={e=>e.stopPropagation()}>
                    {isEdit ? (
                      <div style={{display:'flex',gap:4}}>
                        <button style={S.saveBtnSm} onClick={saveEdit} disabled={saving}>저장</button>
                        <button style={S.cancelBtnSm} onClick={()=>setEditId(null)}>취소</button>
                      </div>
                    ) : (
                      <button style={S.delBtn} onClick={()=>deleteRow(tx.id)} disabled={deleting===tx.id}>삭제</button>
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
  addBtn: { padding:'9px 20px', background:'#1e40af', color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:13 },
  card:   { background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', overflow:'auto', flex:1 },
  table:  { width:'100%', borderCollapse:'collapse', minWidth:700 },
  th:     { background:'#1e293b', color:'#94a3b8', padding:'10px 14px', fontSize:11, fontWeight:700, position:'sticky', top:0, letterSpacing:0.8, whiteSpace:'nowrap' },
  td:     { padding:'7px 14px', fontSize:13, color:'#1e293b', borderBottom:'1px solid #f1f5f9', verticalAlign:'middle' },
  codeTag:{ background:'#eff6ff', color:'#1e40af', padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:800 },
  saveBtnSm:   { padding:'4px 10px', background:'#1e40af', color:'#fff', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit' },
  cancelBtnSm: { padding:'4px 10px', background:'#f1f5f9', color:'#475569', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontFamily:'inherit' },
  delBtn:      { padding:'4px 10px', background:'#fee2e2', color:'#dc2626', border:'none', borderRadius:4, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:'inherit' },
}

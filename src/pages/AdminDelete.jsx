import { useEffect, useState } from 'react'
import { collection, getDocs, writeBatch, doc, query, where } from 'firebase/firestore'
import { db } from '../firebase'

export default function AdminDelete() {
  const [status, setStatus] = useState('대기')
  const [count, setCount] = useState(0)

  const run = async () => {
    if (!window.confirm('Repair가 아닌 모든 리콜 데이터를 삭제합니다.\nRepair 데이터는 유지됩니다.\n\n계속하시겠습니까?')) return
    setStatus('삭제 중...')
    const snap = await getDocs(collection(db,'recalls'))
    const toDelete = snap.docs.filter(d => (d.data().category||'리콜') !== 'Repair')
    const CHUNK = 400
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const batch = writeBatch(db)
      toDelete.slice(i, i+CHUNK).forEach(d => batch.delete(doc(db,'recalls',d.id)))
      await batch.commit()
      deleted += Math.min(CHUNK, toDelete.length - i)
      setCount(deleted)
    }
    setStatus(`완료: ${deleted}건 삭제 (Repair ${snap.docs.length - deleted}건 유지)`)
  }

  return (
    <div style={{padding:40,fontFamily:'Malgun Gothic'}}>
      <h2>리콜 데이터 전체 삭제</h2>
      <p style={{color:'#666',marginTop:8}}>category='리콜' 인 records 컬렉션 전체 삭제</p>
      <div style={{marginTop:20,padding:16,background:'#f8fafc',borderRadius:8,border:'1px solid #e5e7eb'}}>
        <div style={{fontSize:14,marginBottom:12}}>상태: <strong>{status}</strong> {count>0&&`(${count}건 처리됨)`}</div>
        <button onClick={run}
          style={{padding:'10px 24px',background:'#dc2626',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:14,fontWeight:700}}>
          삭제 실행
        </button>
      </div>
    </div>
  )
}

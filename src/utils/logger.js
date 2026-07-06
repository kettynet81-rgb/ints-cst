import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export async function writeLog({ action, target, docId, before = null, after = null, user = '' }) {
  try {
    await addDoc(collection(db, 'logs'), {
      action,   // '입력' | '수정' | '삭제' | '출하확정' | '확정취소'
      target,   // 'InboundManage' | 'ShipmentManage' | 'PartOut' 등
      docId: docId || '',
      before: before ? JSON.stringify(before) : null,
      after:  after  ? JSON.stringify(after)  : null,
      user,
      createdAt: serverTimestamp(),
    })
  } catch(e) { console.error('log error', e) }
}

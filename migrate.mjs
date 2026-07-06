import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'

const app = initializeApp({
  apiKey: "AIzaSyCgjC4oUR_-RLCZPeW95J3VGg7U4-Ui8bk",
  projectId: "ints-cst"
})
const db = getFirestore(app)

const MAP = { 'A1': 'A1-1', 'A8': 'A8-1', 'A14': 'A14-1' }

const snap = await getDocs(collection(db, 'transactions'))
let count = 0
const batches = []
let batch = writeBatch(db)
let ops = 0

for (const d of snap.docs) {
  const data = d.data()
  const newCode = MAP[data.itemCode]
  if (newCode) {
    batch.update(doc(db, 'transactions', d.id), { itemCode: newCode })
    ops++; count++
    if (ops === 400) { batches.push(batch); batch = writeBatch(db); ops = 0 }
  }
}
if (ops > 0) batches.push(batch)

for (const b of batches) await b.commit()
console.log(`완료: ${count}건 변경 (A1→A1-1, A8→A8-1, A14→A14-1)`)
process.exit(0)

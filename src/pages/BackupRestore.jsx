import { useState, useRef } from "react"
import { db } from "../firebase"
import { collection, getDocs, writeBatch, doc, Timestamp } from "firebase/firestore"

// 항상 백업하는 컬렉션
const CORE_COLLECTIONS = ['transactions', 'users', 'holidays', 'settings']
// 선택 백업 컬렉션
const OPTIONAL_COLLECTIONS = { recalls: '리콜/수리 이력', logs: '작업 로그' }

const BATCH_SIZE = 400
const BACKUP_VERSION = 1

// ── 값 인코딩: Firestore 타입 → JSON 안전 형태 ──────────────────────────
function encodeValue(v) {
  if (v === null || v === undefined) return null
  if (v instanceof Timestamp) {
    return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds }
  }
  if (v instanceof Date) {
    const t = Timestamp.fromDate(v)
    return { __type: 'timestamp', seconds: t.seconds, nanoseconds: t.nanoseconds }
  }
  if (Array.isArray(v)) return v.map(encodeValue)
  if (typeof v === 'object') {
    // Firestore Timestamp 유사 객체(SDK 인스턴스가 아닌 경우) 방어
    if (typeof v.seconds === 'number' && typeof v.nanoseconds === 'number' && Object.keys(v).length === 2) {
      return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds }
    }
    const out = {}
    for (const k of Object.keys(v)) out[k] = encodeValue(v[k])
    return out
  }
  return v
}

// ── 값 디코딩: JSON → Firestore 타입 ───────────────────────────────────
function decodeValue(v) {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(decodeValue)
  if (typeof v === 'object') {
    if (v.__type === 'timestamp') {
      return new Timestamp(Number(v.seconds) || 0, Number(v.nanoseconds) || 0)
    }
    const out = {}
    for (const k of Object.keys(v)) out[k] = decodeValue(v[k])
    return out
  }
  return v
}

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function BackupRestore() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [includeRecalls, setIncludeRecalls] = useState(true)
  const [includeLogs, setIncludeLogs] = useState(false)
  const [deleteMissing, setDeleteMissing] = useState(false)
  const fileRef = useRef(null)

  const targetCollections = () => {
    const list = [...CORE_COLLECTIONS]
    if (includeRecalls) list.push('recalls')
    if (includeLogs) list.push('logs')
    return list
  }

  // ── 백업 데이터 수집 ─────────────────────────────────────────────────
  const collectBackup = async (collections, onProgress) => {
    const data = {}
    const counts = {}
    for (const name of collections) {
      if (onProgress) onProgress(`${name} 읽는 중...`)
      const snap = await getDocs(collection(db, name))
      const bucket = {}
      snap.docs.forEach(d => { bucket[d.id] = encodeValue(d.data()) })
      data[name] = bucket
      counts[name] = snap.size
    }
    return {
      app: 'ints-cst',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      collections: Object.keys(data),
      counts,
      data
    }
  }

  // ── 백업 실행 ────────────────────────────────────────────────────────
  const runBackup = async () => {
    if (busy) return
    setBusy(true)
    try {
      const cols = targetCollections()
      const backup = await collectBackup(cols, setProgress)
      setProgress('파일 생성 중...')
      downloadJson(backup, `ints-cst_backup_${stamp()}.json`)
      const summary = cols.map(c => `${c}: ${backup.counts[c]}건`).join('\n')
      setProgress('')
      alert(`백업 완료\n\n${summary}\n\n총 ${Object.values(backup.counts).reduce((a, b) => a + b, 0)}건`)
    } catch (e) {
      setProgress('')
      alert('백업 실패: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── 복원 실행 ────────────────────────────────────────────────────────
  const onFilePicked = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 가능하도록 초기화
    if (!file) return
    if (busy) return

    setBusy(true)
    try {
      setProgress('백업 파일 읽는 중...')
      const text = await file.text()
      let backup
      try { backup = JSON.parse(text) }
      catch { throw new Error('JSON 형식이 아닙니다.') }

      if (!backup || !backup.data || typeof backup.data !== 'object') {
        throw new Error('INTS CST 백업 파일 형식이 아닙니다.')
      }
      if (backup.app && backup.app !== 'ints-cst') {
        throw new Error(`다른 앱의 백업 파일입니다 (${backup.app}).`)
      }

      const cols = Object.keys(backup.data)
      const counts = {}
      let total = 0
      for (const c of cols) {
        counts[c] = Object.keys(backup.data[c] || {}).length
        total += counts[c]
      }

      const when = backup.exportedAt
        ? new Date(backup.exportedAt).toLocaleString('ko-KR')
        : '(시점 정보 없음)'

      const msg =
        `[복원 확인]\n\n` +
        `백업 시점: ${when}\n` +
        `파일명: ${file.name}\n\n` +
        `대상 컬렉션 (${cols.length}개)\n` +
        cols.map(c => `  · ${c}: ${counts[c]}건`).join('\n') +
        `\n\n총 ${total}건을 덮어씁니다.` +
        (deleteMissing ? `\n\n⚠ "백업에 없는 문서 삭제"가 켜져 있습니다.\n   백업 이후 추가된 문서는 모두 삭제됩니다.` : '') +
        `\n\n복원 직전 현재 상태가 자동으로 다운로드됩니다.\n\n계속하시겠습니까?`

      if (!window.confirm(msg)) { setProgress(''); setBusy(false); return }

      // 1) 복원 직전 현재 상태 자동 백업
      setProgress('복원 전 현재 상태 백업 중...')
      const safety = await collectBackup(cols, setProgress)
      downloadJson(safety, `ints-cst_복원전_${stamp()}.json`)

      // 2) 복원 (writeBatch, 400건 단위 set 덮어쓰기)
      let written = 0, deleted = 0
      for (const name of cols) {
        const docs = Object.entries(backup.data[name] || {})
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const chunk = docs.slice(i, i + BATCH_SIZE)
          const batch = writeBatch(db)
          chunk.forEach(([id, raw]) => batch.set(doc(db, name, id), decodeValue(raw)))
          await batch.commit()
          written += chunk.length
          setProgress(`복원 중... ${name} ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length} (누적 ${written}건)`)
        }

        // 3) 옵션: 백업에 없는 문서 삭제
        if (deleteMissing) {
          setProgress(`${name} 잔여 문서 확인 중...`)
          const keep = new Set(Object.keys(backup.data[name] || {}))
          const cur = await getDocs(collection(db, name))
          const extra = cur.docs.filter(d => !keep.has(d.id))
          for (let i = 0; i < extra.length; i += BATCH_SIZE) {
            const chunk = extra.slice(i, i + BATCH_SIZE)
            const batch = writeBatch(db)
            chunk.forEach(d => batch.delete(doc(db, name, d.id)))
            await batch.commit()
            deleted += chunk.length
            setProgress(`${name} 삭제 중... ${deleted}건`)
          }
        }
      }

      setProgress('')
      alert(`복원 완료\n\n덮어쓴 문서: ${written}건` + (deleteMissing ? `\n삭제한 문서: ${deleted}건` : '') + `\n\n화면을 새로고침합니다.`)
      window.location.reload()
    } catch (err) {
      setProgress('')
      alert('복원 실패: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  const cols = targetCollections()

  return (
    <div style={{ marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>💾 데이터 백업 / 복원</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>Firestore 전체 데이터를 JSON 파일로 보관</div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* 백업 대상 */}
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>
          <b>백업 대상</b> : {cols.join(', ')}
        </div>

        {/* 옵션 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
          <label style={S.check}>
            <input type="checkbox" checked={includeRecalls} disabled={busy}
              onChange={e => setIncludeRecalls(e.target.checked)} />
            <span>{OPTIONAL_COLLECTIONS.recalls} 포함 (recalls)</span>
          </label>
          <label style={S.check}>
            <input type="checkbox" checked={includeLogs} disabled={busy}
              onChange={e => setIncludeLogs(e.target.checked)} />
            <span>{OPTIONAL_COLLECTIONS.logs} 포함 (logs)</span>
          </label>
        </div>

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={runBackup} disabled={busy} style={{ ...S.btn, background: '#16a34a', opacity: busy ? 0.6 : 1 }}>
            ⬇ 백업 다운로드
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...S.btn, background: '#1e40af', opacity: busy ? 0.6 : 1 }}>
            ⬆ 백업 파일로 복원
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFilePicked} style={{ display: 'none' }} />
          {progress && <span style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>{progress}</span>}
        </div>

        {/* 복원 옵션 */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
          <label style={{ ...S.check, color: deleteMissing ? '#b91c1c' : '#6b7280' }}>
            <input type="checkbox" checked={deleteMissing} disabled={busy}
              onChange={e => setDeleteMissing(e.target.checked)} />
            <span>복원 시 <b>백업에 없는 문서 삭제</b> (기본 꺼짐 — 켜면 백업 이후 추가된 데이터가 사라집니다)</span>
          </label>
        </div>

        {/* 안내 */}
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>
          · 복원은 문서 ID 기준 <b>덮어쓰기</b>입니다. 삭제 옵션을 켜지 않으면 기존 데이터는 지워지지 않습니다.<br />
          · 복원을 실행하면 <b>직전 상태가 자동으로 한 번 더 다운로드</b>되므로, 잘못 복원해도 그 파일로 되돌릴 수 있습니다.<br />
          · 복원 시 다운로드가 자동 실행되므로, 브라우저의 다운로드 차단을 허용해 주세요.<br />
          · 백업 파일은 사내 공유 폴더 등 앱 외부에 보관하세요.
        </div>
      </div>
    </div>
  )
}

const S = {
  btn: {
    padding: '9px 16px', color: '#fff', border: 'none', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap'
  },
  check: {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
    color: '#374151', cursor: 'pointer', fontFamily: 'inherit'
  }
}

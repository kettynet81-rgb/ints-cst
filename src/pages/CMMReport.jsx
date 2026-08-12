import { useState, useCallback, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'

// CMM xls에서 측정값 추출
function parseCMM(data) {
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const vals = {}
  for (let i = 0; i < rows.length; i++) {
    const item = String(rows[i][1] || '').trim()
    const next = rows[i + 1]
    if (item && next && String(next[1]).trim() === 'DS') {
      vals[item] = Number(next[2])
      i++
    }
  }
  return vals
}

// 성적서 양식에 CMM 데이터 채우기
function fillReport(templateData, cmmResults) {
  const wb = XLSX.read(templateData, { type: 'array' })
  const ws2 = wb.Sheets['2 CASSETTE CHECK POINT']
  const ws3 = wb.Sheets['3 CASSETTE CHECK POINT']
  const ws4 = wb.Sheets['4 SLIDER']

  if (!ws4 || !ws2) return null

  // 4 SLIDER 시트에서 RFID 순서 읽기 (직접 값 있음)
  const rows4 = XLSX.utils.sheet_to_json(ws4, { header: 1, defval: '' })
  let hdr4 = -1
  for (let i = 0; i < rows4.length; i++) {
    if (String(rows4[i][1]).includes('순번')) { hdr4 = i; break }
  }
  if (hdr4 < 0) return null

  // RFID → 순번 매핑
  const rfidSeq = {}
  for (let i = hdr4 + 1; i < rows4.length; i++) {
    const rfid = String(rows4[i][3] || '').trim()
    const seq = rows4[i][1]
    if (rfid.startsWith('IF') && seq) rfidSeq[rfid] = Number(seq)
  }

  // 시트별 헤더 행 위치
  const getHdr = (ws) => {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]).includes('순번')) return i
    }
    return -1
  }
  const hdr2 = getHdr(ws2)
  const hdr3 = ws3 ? getHdr(ws3) : -1

  if (hdr2 < 0) return null

  // CMM 데이터 채우기
  for (const [rfid, vals] of Object.entries(cmmResults)) {
    const seq = rfidSeq[rfid]
    if (!seq) continue

    // 2 CASSETTE CHECK POINT: 순번 기준 행
    const ri2 = hdr2 + seq
    const colMap2 = { 'A':4, 'B':5, 'B-1':6, 'B-2':7, 'C':8, 'D':9, 'D-1':10, 'D-2':11, 'D-3':12 }
    for (const [item, col] of Object.entries(colMap2)) {
      if (vals[item] !== undefined) {
        ws2[XLSX.utils.encode_cell({ r: ri2, c: col })] = { t: 'n', v: vals[item] }
      }
    }

    // 3 CASSETTE CHECK POINT
    if (ws3 && hdr3 >= 0) {
      const ri3 = hdr3 + seq
      const colMap3 = { 'E-1L':4, 'E-1R':5, 'F-1L':6, 'F-1R':7 }
      for (const [item, col] of Object.entries(colMap3)) {
        if (vals[item] !== undefined) {
          ws3[XLSX.utils.encode_cell({ r: ri3, c: col })] = { t: 'n', v: vals[item] }
        }
      }
    }
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

export default function CMMReport() {
  const [template, setTemplate]     = useState(null)
  const [templateName, setTName]    = useState('')
  const [results, setResults]       = useState({})
  const [status, setStatus]         = useState('')
  const [processing, setProcessing] = useState(false)
  const [watching, setWatching]     = useState(false)
  const [folderName, setFolderName] = useState('')
  const dirHandleRef = useRef(null)
  const intervalRef  = useRef(null)

  // 폴더 스캔 (새 파일도 덮어씌움)
  const scanFolder = useCallback(async (dirHandle) => {
    const newResults = {}
    let count = 0
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue
      const name = entry.name.toLowerCase()
      if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) continue
      const rfid = entry.name.replace(/\.[^.]+$/, '').trim()
      const file = await entry.getFile()
      const buf = await file.arrayBuffer()
      try {
        const vals = parseCMM(new Uint8Array(buf))
        newResults[rfid] = vals
        count++
      } catch(e) { console.error(rfid, e) }
    }
    if (count > 0) {
      setResults(prev => ({...prev, ...newResults}))
      setStatus(`${new Date().toLocaleTimeString()} — ${count}개 파일 읽음`)
    }
    return count
  }, [])

  // 폴더 선택
  const selectFolder = async () => {
    if (!window.showDirectoryPicker) { alert('Chrome/Edge에서만 지원됩니다'); return }
    try {
      const dirHandle = await window.showDirectoryPicker()
      dirHandleRef.current = dirHandle
      setFolderName(dirHandle.name)
      setStatus('폴더 선택됨: ' + dirHandle.name)
      setResults({})
    } catch(e) { if (e.name !== 'AbortError') alert('오류: ' + e.message) }
  }

  // 시작
  const startWatch = async () => {
    if (!dirHandleRef.current) { alert('폴더를 먼저 선택해주세요'); return }
    setProcessing(true)
    await scanFolder(dirHandleRef.current)
    setProcessing(false)
    setWatching(true)
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => scanFolder(dirHandleRef.current), 10000)
  }

  // 중지
  const stopWatch = () => { clearInterval(intervalRef.current); setWatching(false); setStatus('감시 중지됨') }
  useEffect(() => () => clearInterval(intervalRef.current), [])

  // 성적서 양식 업로드
  const onTemplate = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setTemplate(ev.target.result); setTName(file.name) }
    reader.readAsArrayBuffer(file)
  }

  // 다운로드
  const download = () => {
    if (!template) { alert('성적서 양식을 먼저 업로드해주세요'); return }
    const rfidList = Object.keys(results)
    if (rfidList.length === 0) { alert('CMM 데이터가 없습니다'); return }
    const out = fillReport(template, results)
    if (!out) { alert('오류: 시트 구조를 확인해주세요'); return }
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '검사성적서_완성.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const rfidList = Object.keys(results).sort()

  return (
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:14,maxWidth:900}}>
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:'14px 18px'}}>
        <div style={{fontSize:17,fontWeight:700,color:'#111827',marginBottom:2}}>📐 CMM 성적서 자동 생성</div>
        <div style={{fontSize:12,color:'#6b7280'}}>3차원 측정기 데이터 → 검사 성적서 자동 채움</div>
      </div>

      {/* 성적서 양식 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:16}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:10}}>① 성적서 양식 업로드</div>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <label style={{padding:'7px 16px',background:template?'#16a34a':'#1e40af',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
            {template ? '✓ 양식 변경' : '📂 양식 선택'}
            <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={onTemplate}/>
          </label>
          {templateName && <span style={{fontSize:12,color:'#374151'}}>{templateName}</span>}
        </div>
      </div>

      {/* CMM 폴더 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:16}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:10}}>
          ② CMM 폴더 선택
          {watching && <span style={{marginLeft:8,fontSize:11,color:'#16a34a',fontWeight:400}}>● 감시 중 (10초마다 자동 업데이트)</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <button onClick={selectFolder}
            style={{padding:'7px 16px',background:'#7c3aed',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,border:'none'}}>
            📁 폴더 선택
          </button>
          {folderName && <span style={{fontSize:12,color:'#374151',fontWeight:600}}>📂 {folderName}</span>}
          {!watching
            ? <button onClick={startWatch} disabled={!folderName||processing}
                style={{padding:'7px 16px',background:folderName?'#16a34a':'#d1d5db',color:'#fff',borderRadius:6,
                  cursor:folderName?'pointer':'not-allowed',fontSize:12,fontWeight:700,border:'none'}}>
                {processing ? '읽는 중...' : '▶ 시작'}
              </button>
            : <button onClick={stopWatch}
                style={{padding:'7px 16px',background:'#dc2626',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,border:'none'}}>
                ⏹ 중지
              </button>
          }
        </div>
        {status && <div style={{marginTop:8,fontSize:12,color:'#6b7280'}}>{status}</div>}
        {rfidList.length > 0 && (
          <div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:4}}>
            {rfidList.map(rfid => (
              <span key={rfid} style={{padding:'2px 7px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:4,fontSize:11,color:'#1e40af',fontWeight:600}}>
                {rfid}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 다운로드 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:'#111827'}}>③ 성적서 다운로드</div>
          {rfidList.length > 0 && <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{rfidList.length}개 RFID 입력됨</div>}
        </div>
        <button onClick={download} disabled={!template||rfidList.length===0}
          style={{padding:'10px 24px',background:template&&rfidList.length>0?'#16a34a':'#d1d5db',
            color:'#fff',border:'none',borderRadius:6,cursor:template&&rfidList.length>0?'pointer':'not-allowed',fontSize:13,fontWeight:700}}>
          ⬇ 성적서 다운로드
        </button>
      </div>
    </div>
  )
}

import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'

// CMM xls에서 측정값 추출
function parseCMM(data) {
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  const vals = {}
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const item = String(row[1] || '').trim()
    const next = rows[i + 1]
    if (item && next && String(next[1]).trim() === 'DS') {
      vals[item] = next[2] // Actual 값
      i++ // 다음 행 건너뜀
    }
  }
  return vals
}

// 성적서 양식에 CMM 데이터 채우기
function fillReport(templateData, cmmResults) {
  const wb = XLSX.read(templateData, { type: 'array' })

  // 2 CASSETTE CHECK POINT 시트
  const ws2 = wb.Sheets['2 CASSETTE CHECK POINT']
  const ws3 = wb.Sheets['3 CASSETTE CHECK POINT']
  const ws4 = wb.Sheets['4 SLIDER']

  if (!ws2) return null

  const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' })
  
  // 헤더 행 찾기 (순번, 검사일, RFID NO 행)
  let headerRow = -1
  for (let i = 0; i < rows2.length; i++) {
    if (String(rows2[i][1]).includes('순번')) { headerRow = i; break }
  }
  if (headerRow < 0) return null

  // 컬럼 인덱스 파악
  const headerCols = rows2[headerRow]
  // 시트2: 순번(1), 검사일(2), RFID(3), A(4), B(5), B1(6), B2(7), C(8), D(9), D1(10), D2(11), D3(12), H(13)

  // RFID → 행 매핑
  const rfidRowMap = {}
  for (let i = headerRow + 1; i < rows2.length; i++) {
    const rfid = String(rows2[i][3] || '').trim()
    if (rfid.startsWith('IF')) rfidRowMap[rfid] = i
  }

  // CMM 데이터 채우기
  for (const [rfid, vals] of Object.entries(cmmResults)) {
    const ri = rfidRowMap[rfid]
    if (ri === undefined) continue

    // 2 CASSETTE CHECK POINT 매핑
    // 2 CASSETTE CHECK POINT: A, B, B-1, B-2, C, D, D-1, D-2, D-3
    const colMap2 = { 'A':4, 'B':5, 'B-1':6, 'B-2':7, 'C':8, 'D':9, 'D-1':10, 'D-2':11, 'D-3':12 }
    for (const [item, col] of Object.entries(colMap2)) {
      if (vals[item] !== undefined) {
        const addr = XLSX.utils.encode_cell({ r: ri, c: col })
        ws2[addr] = { t: 'n', v: vals[item] }
      }
    }
  }

  // 3 CASSETTE CHECK POINT - E-1(L), E-2(R), F-1(L), F-2(R)
  const ws3 = wb.Sheets['3 CASSETTE CHECK POINT']
  if (ws3) {
    const rows3 = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: '' })
    let hdr3 = -1
    for (let i = 0; i < rows3.length; i++) {
      if (String(rows3[i][1]).includes('순번')) { hdr3 = i; break }
    }
    if (hdr3 >= 0) {
      const rfidMap3 = {}
      for (let i = hdr3 + 1; i < rows3.length; i++) {
        const rfid = String(rows3[i][3] || '').trim()
        if (rfid.startsWith('IF')) rfidMap3[rfid] = i
      }
      for (const [rfid, vals] of Object.entries(cmmResults)) {
        const ri = rfidMap3[rfid]
        if (ri === undefined) continue
        // E-1L→E-1(L), E-1R→E-2(R), F-1L→F-1(L), F-1R→F-2(R)
        const colMap3 = { 'E-1L':4, 'E-1R':5, 'F-1L':6, 'F-1R':7 }
        for (const [item, col] of Object.entries(colMap3)) {
          if (vals[item] !== undefined) {
            const addr = XLSX.utils.encode_cell({ r: ri, c: col })
            ws3[addr] = { t: 'n', v: vals[item] }
          }
        }
      }
    }
  }
  }
    if (hdr4 >= 0) {
      const rfidMap4 = {}
      for (let i = hdr4 + 1; i < rows4.length; i++) {
        const rfid = String(rows4[i][3] || '').trim()
        if (rfid.startsWith('IF')) rfidMap4[rfid] = i
      }
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
}

export default function CMMReport() {
  const [template, setTemplate]     = useState(null)
  const [templateName, setTName]    = useState('')
  const [cmmFiles, setCmmFiles]     = useState([])
  const [results, setResults]       = useState({}) // rfid → vals
  const [status, setStatus]         = useState('')
  const [processing, setProcessing] = useState(false)

  // 성적서 양식 업로드
  const onTemplate = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => { setTemplate(ev.target.result); setTName(file.name) }
    reader.readAsArrayBuffer(file)
  }


  // 폴더 선택해서 CMM 파일 자동으로 읽기
  const selectFolder = async () => {
    if (!window.showDirectoryPicker) {
      alert('폴더 선택은 Chrome/Edge에서만 지원됩니다')
      return
    }
    try {
      const dirHandle = await window.showDirectoryPicker()
      setProcessing(true)
      setStatus('폴더 읽는 중...')
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
      setResults(prev => ({...prev, ...newResults}))
      setStatus(`폴더에서 ${count}개 파일 읽기 완료`)
      setProcessing(false)
    } catch(e) {
      if (e.name !== 'AbortError') alert('오류: ' + e.message)
      setProcessing(false)
    }
  }

  // CMM 파일 업로드 (여러 개)
  const onCMM = useCallback((e) => {
    const files = Array.from(e.target.files)
    setProcessing(true)
    setStatus(`${files.length}개 파일 처리 중...`)
    const newResults = {}
    let done = 0
    for (const file of files) {
      const rfid = file.name.replace(/\.[^.]+$/, '').trim()
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const vals = parseCMM(new Uint8Array(ev.target.result))
          newResults[rfid] = vals
        } catch(err) {
          console.error(rfid, err)
        }
        done++
        if (done === files.length) {
          setResults(prev => ({...prev, ...newResults}))
          setCmmFiles(prev => [...prev, ...files.map(f=>f.name)])
          setStatus(`${done}개 파일 파싱 완료`)
          setProcessing(false)
        }
      }
      reader.readAsArrayBuffer(file)
    }
  }, [])

  // 성적서 다운로드
  const download = () => {
    if (!template) { alert('성적서 양식을 먼저 업로드해주세요'); return }
    if (Object.keys(results).length === 0) { alert('CMM 파일을 업로드해주세요'); return }
    setStatus('성적서 생성 중...')
    const out = fillReport(template, results)
    if (!out) { setStatus('오류: 시트 구조를 확인해주세요'); return }
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '검사성적서_완성.xlsx'; a.click()
    URL.revokeObjectURL(url)
    setStatus('다운로드 완료!')
  }

  const rfidList = Object.keys(results).sort()

  return (
    <div style={{padding:20,display:'flex',flexDirection:'column',gap:14,maxWidth:900}}>
      {/* 헤더 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:'14px 18px'}}>
        <div style={{fontSize:17,fontWeight:700,color:'#111827',marginBottom:2}}>📐 CMM 성적서 자동 생성</div>
        <div style={{fontSize:12,color:'#6b7280'}}>3차원 측정기 데이터 → 검사 성적서 자동 채움</div>
      </div>

      {/* STEP 1: 성적서 양식 */}
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

      {/* STEP 2: CMM 파일 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:16}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:10}}>
          ② CMM 측정 파일 업로드
          <span style={{fontSize:11,color:'#6b7280',fontWeight:400,marginLeft:8}}>여러 파일 동시 선택 가능</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <button onClick={selectFolder} disabled={processing}
            style={{padding:'7px 16px',background:'#7c3aed',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700,border:'none'}}>
            📁 폴더 선택 (자동)
          </button>
          <label style={{padding:'7px 16px',background:'#1e40af',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
            📂 파일 직접 선택
            <input type="file" accept=".xlsx,.xls,.xlsm" multiple style={{display:'none'}} onChange={onCMM} disabled={processing}/>
          </label>
          {rfidList.length > 0 && (
            <button onClick={()=>{setResults({});setCmmFiles([]);setStatus('')}}
              style={{padding:'7px 12px',background:'#f3f4f6',border:'1px solid #d1d5db',borderRadius:6,cursor:'pointer',fontSize:12,color:'#6b7280'}}>
              초기화
            </button>
          )}
        </div>
        {rfidList.length > 0 && (
          <div style={{marginTop:10,display:'flex',flexWrap:'wrap',gap:5}}>
            {rfidList.map(rfid => (
              <span key={rfid} style={{padding:'3px 8px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:4,fontSize:11,color:'#1e40af',fontWeight:600}}>
                {rfid}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* STEP 3: 다운로드 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,color:'#111827'}}>③ 성적서 다운로드</div>
          {status && <div style={{fontSize:12,color:'#16a34a',marginTop:2}}>{status}</div>}
          {rfidList.length > 0 && <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{rfidList.length}개 RFID 데이터 입력됨</div>}
        </div>
        <button onClick={download}
          disabled={!template || rfidList.length === 0}
          style={{padding:'10px 20px',background:template&&rfidList.length>0?'#16a34a':'#d1d5db',
            color:'#fff',border:'none',borderRadius:6,cursor:template&&rfidList.length>0?'pointer':'not-allowed',
            fontSize:13,fontWeight:700}}>
          ⬇ 성적서 다운로드
        </button>
      </div>
    </div>
  )
}

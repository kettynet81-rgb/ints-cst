import { useState, useCallback, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'

function parseCMM(data) {
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const vals = {}
  for (let i = 0; i < rows.length; i++) {
    const item = String(rows[i][1] || '').trim()
    const next = rows[i + 1]
    if (item && next && String(next[1]).trim() === 'DS') {
      vals[item] = Number(Number(next[2]).toFixed(4))
      i++
    }
  }
  return vals
}

function fillReport(templateData, cmmResults) {
  const wb = XLSX.read(templateData, { type: 'array', cellStyles: true, cellFormula: true })
  const ws2 = wb.Sheets['2 CASSETTE CHECK POINT']
  const ws3 = wb.Sheets['3 CASSETTE CHECK POINT']
  const ws4 = wb.Sheets['4 SLIDER']
  if (!ws4 || !ws2) return null

  const rows4 = XLSX.utils.sheet_to_json(ws4, { header: 1, defval: '' })
  let hdr4 = -1
  for (let i = 0; i < rows4.length; i++) {
    if (String(rows4[i][1]).includes('순번')) { hdr4 = i; break }
  }
  if (hdr4 < 0) return null

  const rfidSeq = {}
  for (let i = hdr4 + 1; i < rows4.length; i++) {
    const rfid = String(rows4[i][3] || '').trim()
    const seq = rows4[i][1]
    if (rfid.startsWith('IF') && seq) rfidSeq[rfid] = Number(seq)
  }

  const getHdr = (ws) => {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]).includes('순번')) return i
    }
    return -1
  }
  const hdr2 = getHdr(ws2)
  const hdr3 = ws3 ? getHdr(ws3) : -1

  for (const [rfid, vals] of Object.entries(cmmResults)) {
    const seq = rfidSeq[rfid]
    if (!seq) continue
    const ri2 = hdr2 + seq
    const colMap2 = { 'A':4, 'B':5, 'B-1':6, 'B-2':7, 'C':8, 'D':9, 'D-1':10, 'D-2':11, 'D-3':12 }
    for (const [item, col] of Object.entries(colMap2)) {
      if (vals[item] !== undefined) {
        const addr2 = XLSX.utils.encode_cell({ r: ri2, c: col })
        ws2[addr2] = { ...(ws2[addr2]||{}), t: 'n', v: vals[item], f: undefined }
      }
    }
    if (ws3 && hdr3 >= 0) {
      const ri3 = hdr3 + seq
      const colMap3 = { 'E-1L':4, 'E-1R':5, 'F-1L':6, 'F-1R':7 }
      for (const [item, col] of Object.entries(colMap3)) {
        if (vals[item] !== undefined) {
          const addr3 = XLSX.utils.encode_cell({ r: ri3, c: col })
          ws3[addr3] = { ...(ws3[addr3]||{}), t: 'n', v: vals[item], f: undefined }
        }
      }
    }
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
}

const COLS = [
  { key:'A',    label:'A' },
  { key:'B',    label:'B' },
  { key:'B-1',  label:'B-1' },
  { key:'B-2',  label:'B-2' },
  { key:'C',    label:'C' },
  { key:'D',    label:'D' },
  { key:'D-1',  label:'D-1' },
  { key:'D-2',  label:'D-2' },
  { key:'D-3',  label:'D-3' },
  { key:'E-1L', label:'E-1(L)' },
  { key:'E-1R', label:'E-2(R)' },
  { key:'F-1L', label:'F-1(L)' },
  { key:'F-1R', label:'F-2(R)' },
]


// 엑셀 시트를 HTML 테이블로 렌더링
function SheetView({ wb, sheetName, cmmResults, rfidSeq }) {
  if (!wb || !wb.Sheets[sheetName]) return null
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:Z60')
  const merges = ws['!merges'] || []

  // 병합 셀 맵
  const mergeMap = {}
  const hiddenMap = {}
  merges.forEach(m => {
    mergeMap[`${m.s.r}_${m.s.c}`] = { rowSpan: m.e.r-m.s.r+1, colSpan: m.e.c-m.s.c+1 }
    for (let r=m.s.r; r<=m.e.r; r++) {
      for (let c=m.s.c; c<=m.e.c; c++) {
        if (r!==m.s.r || c!==m.s.c) hiddenMap[`${r}_${c}`] = true
      }
    }
  })

  // CMM 값 오버레이 계산
  const overlay = {}
  if (cmmResults && rfidSeq) {
    // 헤더 행 찾기
    let hdr = -1
    for (let r=range.s.r; r<=range.e.r; r++) {
      const cell = ws[XLSX.utils.encode_cell({r,c:1})]
      if (cell && String(cell.v).includes('순번')) { hdr = r; break }
    }
    if (hdr >= 0) {
      const colMap = sheetName.includes('2') 
        ? { 'A':4,'B':5,'B-1':6,'B-2':7,'C':8,'D':9,'D-1':10,'D-2':11,'D-3':12 }
        : { 'E-1L':4,'E-1R':5,'F-1L':6,'F-1R':7 }
      for (const [rfid, vals] of Object.entries(cmmResults)) {
        const seq = rfidSeq[rfid]
        if (!seq) continue
        const ri = hdr + seq
        for (const [item, col] of Object.entries(colMap)) {
          if (vals[item] !== undefined) overlay[`${ri}_${col}`] = vals[item].toFixed(4)
        }
      }
    }
  }

  const rows = []
  for (let r=range.s.r; r<=range.e.r; r++) {
    const cells = []
    for (let c=range.s.c; c<=range.e.c; c++) {
      if (hiddenMap[`${r}_${c}`]) continue
      const addr = XLSX.utils.encode_cell({r,c})
      const cell = ws[addr]
      const merge = mergeMap[`${r}_${c}`]
      const ov = overlay[`${r}_${c}`]
      const val = ov !== undefined ? ov : (cell ? (cell.w || cell.v || '') : '')
      const isNum = cell?.t === 'n' || ov !== undefined
      cells.push(
        <td key={c}
          rowSpan={merge?.rowSpan||1}
          colSpan={merge?.colSpan||1}
          style={{
            border:'1px solid #d1d5db',
            padding:'2px 4px',
            fontSize:10,
            textAlign: isNum ? 'center' : 'left',
            whiteSpace:'nowrap',
            background: ov !== undefined ? '#eff6ff' : 'inherit',
            color: ov !== undefined ? '#1e40af' : 'inherit',
            fontWeight: ov !== undefined ? 700 : 'inherit',
            minWidth: 60,
          }}>
          {String(val).startsWith('=') ? '' : val}
        </td>
      )
    }
    rows.push(<tr key={r}>{cells}</tr>)
  }

  return (
    <div style={{overflow:'auto',maxHeight:400}}>
      <table style={{borderCollapse:'collapse',fontSize:10}}><tbody>{rows}</tbody></table>
    </div>
  )
}

export default function CMMReport() {
  const [template, setTemplate]     = useState(null)
  const [templateName, setTName]    = useState('')
  const [results, setResults]       = useState({}) // rfid → vals
  const [rfidOrder, setRfidOrder]   = useState([]) // 성적서 RFID 순서
  const [templateWb, setTemplateWb]  = useState(null)
  const [activeSheet, setActiveSheet] = useState('')
  const [rfidSeq, setRfidSeq]       = useState({})
  const [status, setStatus]         = useState('')
  const [watching, setWatching]     = useState(false)
  const [folderName, setFolderName] = useState('')
  const dirHandleRef = useRef(null)
  const intervalRef  = useRef(null)

  // 성적서 양식에서 RFID 순서 읽기
  const loadTemplate = (buf) => {
    setTemplate(buf)
    try {
      const wbObj = XLSX.read(buf, { type: 'array' })
      setTemplateWb(wbObj)
      setActiveSheet(wbObj.SheetNames[0])
      const wb = XLSX.read(buf, { type: 'array' })
      const ws4 = wb.Sheets['4 SLIDER']
      if (!ws4) return
      const rows4 = XLSX.utils.sheet_to_json(ws4, { header: 1, defval: '' })
      let hdr = -1
      for (let i = 0; i < rows4.length; i++) {
        if (String(rows4[i][1]).includes('순번')) { hdr = i; break }
      }
      if (hdr < 0) return
      const order = []
      for (let i = hdr + 1; i < rows4.length; i++) {
        const rfid = String(rows4[i][3] || '').trim()
        if (rfid.startsWith('IF')) order.push(rfid)
      }
      setRfidOrder(order)
      const seqMap = {}
      for (let i = hdr + 1; i < rows4.length; i++) {
        const rfid = String(rows4[i][3] || '').trim()
        const seq = rows4[i][1]
        if (rfid.startsWith('IF') && seq) seqMap[rfid] = Number(seq)
      }
      setRfidSeq(seqMap)
    } catch(e) {}
  }

  const onTemplate = (e) => {
    const file = e.target.files[0]; if (!file) return
    setTName(file.name)
    const reader = new FileReader()
    reader.onload = ev => loadTemplate(ev.target.result)
    reader.readAsArrayBuffer(file)
  }

  // 폴더 스캔
  const scanFolder = useCallback(async (dirHandle) => {
    const newResults = {}
    let count = 0
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue
      if (!entry.name.match(/\.xls[x]?$/i)) continue
      const rfid = entry.name.replace(/\.[^.]+$/, '').trim()
      try {
        const file = await entry.getFile()
        const buf = await file.arrayBuffer()
        const vals = parseCMM(new Uint8Array(buf))
        newResults[rfid] = vals
        count++
      } catch(e) {}
    }
    if (count > 0) {
      setResults(prev => ({...prev, ...newResults}))
      setStatus(`${new Date().toLocaleTimeString()} 업데이트 — ${Object.keys({...results,...newResults}).length}개 RFID`)
    }
    return count
  }, [results])

  const selectFolder = async () => {
    if (!window.showDirectoryPicker) { alert('Chrome/Edge에서만 지원됩니다'); return }
    try {
      const dh = await window.showDirectoryPicker()
      dirHandleRef.current = dh
      setFolderName(dh.name)
      setResults({})
      clearInterval(intervalRef.current)
      setWatching(true)
      setStatus('폴더 감시 시작...')
      await scanFolder(dh)
      intervalRef.current = setInterval(() => scanFolder(dh), 10000)
    } catch(e) { if (e.name !== 'AbortError') alert('오류: ' + e.message) }
  }

  const stopWatch = () => { clearInterval(intervalRef.current); setWatching(false); setStatus('감시 중지') }
  useEffect(() => () => clearInterval(intervalRef.current), [])

  const download = () => {
    if (!template) { alert('성적서 양식을 먼저 업로드해주세요'); return }
    const out = fillReport(template, results)
    if (!out) { alert('오류: 시트 구조를 확인해주세요'); return }
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = '검사성적서_완성.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  const displayList = rfidOrder.length > 0 ? rfidOrder : Object.keys(results).sort()
  const doneCount = displayList.filter(r => results[r]).length

  return (
    <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
      {/* 헤더 */}
      <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',padding:'12px 18px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:'#111827'}}>📐 CMM 성적서</div>
          {doneCount > 0 && <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{doneCount} / {displayList.length || '?'}개 완료</div>}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* 양식 업로드 */}
          <label style={{padding:'6px 14px',background:template?'#16a34a':'#374151',color:'#fff',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
            {template?'✓ 양식 변경':'📂 성적서 양식 업로드'}
            <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={onTemplate}/>
          </label>
          {/* 폴더 감시 */}
          {!watching
            ? <button onClick={selectFolder}
                style={{padding:'6px 14px',background:'#7c3aed',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
                📁 측정결과 폴더 선택
              </button>
            : <button onClick={stopWatch}
                style={{padding:'6px 14px',background:'#dc2626',color:'#fff',border:'none',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:700}}>
                ⏹ 감시 중지
              </button>
          }
          {watching && <span style={{fontSize:11,color:'#16a34a',fontWeight:600}}>● 실시간 감시 중</span>}
          {/* 다운로드 */}
          <button onClick={download} disabled={!template||doneCount===0}
            style={{padding:'6px 14px',background:template&&doneCount>0?'#1e40af':'#d1d5db',color:'#fff',border:'none',borderRadius:6,
              cursor:template&&doneCount>0?'pointer':'not-allowed',fontSize:12,fontWeight:700}}>
            ⬇ 다운로드
          </button>
        </div>
        {/* 선택 정보 표시 */}
        <div style={{display:'flex',gap:16,marginTop:8,flexWrap:'wrap'}}>
          {templateName && <span style={{fontSize:12,color:'#374151'}}>📋 성적서: <strong>{templateName}</strong></span>}
          {folderName && <span style={{fontSize:12,color:'#374151'}}>📁 측정결과 폴더: <strong>{folderName}</strong></span>}
        </div>
      </div>

      {status && <div style={{fontSize:11,color:'#6b7280',paddingLeft:4}}>{status}</div>}

      {/* 성적서 테이블 */}
      {/* 시트 뷰 탭 */}
      {templateWb && (
        <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'hidden'}}>
          <div style={{display:'flex',gap:0,borderBottom:'1px solid #e5e7eb',background:'#f8fafc',overflowX:'auto'}}>
            {templateWb.SheetNames.map(s=>(
              <button key={s} onClick={()=>setActiveSheet(s)}
                style={{padding:'8px 14px',border:'none',cursor:'pointer',fontSize:11,fontFamily:'inherit',
                  background:activeSheet===s?'#fff':'transparent',
                  fontWeight:activeSheet===s?700:400,
                  borderBottom:activeSheet===s?'2px solid #1e40af':'none',
                  color:activeSheet===s?'#1e40af':'#6b7280'}}>
                {s}
              </button>
            ))}
          </div>
          <SheetView wb={templateWb} sheetName={activeSheet} cmmResults={results} rfidSeq={rfidSeq}/>
        </div>
      )}

      {displayList.length > 0 && (
        <div style={{background:'#fff',borderRadius:10,border:'1px solid #e5e7eb',overflow:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,tableLayout:'fixed',minWidth:900}}>
            <colgroup>
              <col style={{width:40}}/><col style={{width:90}}/>
              {COLS.map(c=><col key={c.key} style={{width:62}}/>)}
              <col style={{width:50}}/>
            </colgroup>
            <thead>
              <tr style={{background:'#1e293b',color:'#e2e8f0'}}>
                <th style={S.th}>NO</th>
                <th style={S.th}>RFID</th>
                {COLS.map(c=><th key={c.key} style={S.th}>{c.label}</th>)}
                <th style={S.th}>상태</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map((rfid, i) => {
                const vals = results[rfid]
                return (
                  <tr key={rfid} style={{background:vals?i%2===0?'#f8fafc':'#fff':'#fffbeb'}}>
                    <td style={{...S.td,textAlign:'center',color:'#9ca3af'}}>{i+1}</td>
                    <td style={{...S.td,fontWeight:700,color:'#1e40af'}}>{rfid}</td>
                    {COLS.map(c=>(
                      <td key={c.key} style={{...S.td,textAlign:'center',color:vals?'#111827':'#d1d5db'}}>
                        {vals ? vals[c.key]?.toFixed(4) ?? '-' : '—'}
                      </td>
                    ))}
                    <td style={{...S.td,textAlign:'center'}}>
                      {vals
                        ? <span style={{color:'#16a34a',fontWeight:700}}>✓</span>
                        : <span style={{color:'#d1d5db'}}>-</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {displayList.length === 0 && (
        <div style={{background:'#fff',borderRadius:10,border:'2px dashed #e5e7eb',padding:60,textAlign:'center',color:'#9ca3af'}}>
          <div style={{fontSize:32,marginBottom:8}}>📐</div>
          <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>성적서 양식을 업로드하면 RFID 목록이 표시됩니다</div>
          <div style={{fontSize:12}}>폴더 선택 후 CMM 측정값이 실시간으로 채워져요</div>
        </div>
      )}
    </div>
  )
}

const S = {
  th: { padding:'6px 4px', fontWeight:600, fontSize:11, textAlign:'center', whiteSpace:'nowrap', borderRight:'1px solid #334155' },
  td: { padding:'5px 4px', borderBottom:'1px solid #f1f5f9', borderRight:'1px solid #f1f5f9', fontSize:11 }
}

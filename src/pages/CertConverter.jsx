import { useState, useCallback } from 'react'


function parseRfid(text) {
  const map = {}
  for (const line of text.split(/\n/)) {
    for (const m of line.matchAll(/(\d+)\s+([A-Z][A-Z0-9]{3,})/g)) {
      const no = parseInt(m[1])
      const rfid = m[2].trim()
      if (rfid !== 'RFID' && no > 0) map[no] = rfid
    }
  }
  return Object.keys(map).map(Number).sort((a, b) => a - b).map(no => ({ no, rfid: map[no] }))
}

export default function CertConverter({ isMobile }) {
  const [inputText, setInputText] = useState('')
  const [rfidList, setRfidList]   = useState([])
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [adding, setAdding]       = useState(false)

  const handleParse = useCallback(() => {
    setError('')
    if (!inputText.trim()) { setError('RFID 데이터를 붙여넣어 주세요.'); return }
    const list = parseRfid(inputText)
    if (list.length === 0) { setError('RFID 코드를 인식하지 못했습니다.'); return }

    if (adding && rfidList.length > 0) {
      const merged = [...rfidList]
      for (const item of list) {
        if (!merged.find(r => r.no === item.no)) merged.push(item)
      }
      merged.sort((a, b) => a.no - b.no)
      setRfidList(merged)
    } else {
      setRfidList(list)
    }
    setInputText('')
    setAdding(false)
  }, [inputText, rfidList, adding])

  const handleDownload = useCallback(async () => {
    if (!rfidList.length) return
    setLoading(true)
    try {
      const res = await fetch('/cert-template.xlsx')
      const buf = await res.arrayBuffer()

      const { default: ExcelJS } = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]

      rfidList.forEach(({ rfid }, i) => {
        const startRow = i * 42 + 2
        for (let r = startRow; r < startRow + 42; r++) {
          const row = ws.getRow(r)
          // 기존 셀 서식 그대로 유지하면서 값만 변경
          const eCell = row.getCell(5)
          const fCell = row.getCell(6)
          eCell.value = rfid
          fCell.value = rfid
          row.commit()
        }
      })

      const outBuf = await wb.xlsx.writeBuffer()
      const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'INTS-원자재_협력업체_데이터.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('파일 생성 중 오류: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [rfidList])

  const handleReset = () => {
    setInputText(''); setRfidList([]); setError(''); setAdding(false)
  }

  const S = {
    wrap:    { padding: isMobile ? '16px 12px' : '24px 32px', maxWidth: 800, fontFamily: 'inherit' },
    title:   { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
    sub:     { fontSize: 12, color: '#64748b', marginBottom: 20 },
    infoBox: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#475569' },
    textarea:{ width: '100%', height: 200, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
    err:     { marginTop: 8, color: '#dc2626', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, padding: '6px 12px', background: '#fef2f2' },
    btnRow:  { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    btnPri:  { padding: '9px 20px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
    btnSec:  { padding: '9px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnAdd:  { padding: '9px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
    btnDl:   { padding: '10px 28px', background: loading ? '#6b7280' : '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 700 },
    btnReset:{ padding: '10px 16px', background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    tblWrap: { maxHeight: 240, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 12 },
  }

  const showInput = rfidList.length === 0 || adding

  return (
    <div style={S.wrap}>
      <div style={S.title}>CST성적서 데이터 변환</div>
      <div style={S.sub}>RFID 표를 붙여넣으면 원본 서식 그대로 E·F열(Lot No)이 채워진 Excel을 생성합니다.</div>

      {showInput && (
        <>
          {adding && (
            <div style={{ ...S.infoBox, borderColor: '#0f766e', background: '#f0fdf4', color: '#166534' }}>
              ✚ 추가 입력 모드 — 기존 {rfidList.length}개에 이어서 붙여넣으세요.
            </div>
          )}
          {!adding && (
            <div style={S.infoBox}>
              <b style={{ display: 'block', marginBottom: 4 }}>입력 형식 예시</b>
              <code style={{ fontSize: 11, whiteSpace: 'pre', display: 'block', lineHeight: 1.6 }}>
                {'No.\tRFID\t\tNo.\tRFID\n1\tIFZG439\t29\tIFZG467\n2\tIFZG440\t30\tIFZG468'}
              </code>
            </div>
          )}
          <textarea
            value={inputText}
            onChange={e => { setInputText(e.target.value); setError('') }}
            placeholder="RFID 표 데이터를 여기에 붙여넣으세요..."
            style={S.textarea}
            autoFocus={adding}
          />
          {error && <div style={S.err}>{error}</div>}
          <div style={S.btnRow}>
            <button style={S.btnPri} onClick={handleParse}>
              {adding ? '✚ 추가' : 'RFID 파싱'}
            </button>
            {adding && (
              <button style={S.btnSec} onClick={() => { setAdding(false); setInputText(''); setError('') }}>
                취소
              </button>
            )}
          </div>
        </>
      )}

      {rfidList.length > 0 && !adding && (
        <div style={S.infoBox}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              총 {rfidList.length}EA · {rfidList.length * 42}행
            </span>
          </div>
          <div style={S.tblWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                  {['No.', 'RFID', '행 범위'].map(h => (
                    <th key={h} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfidList.map(({ no, rfid }, i) => (
                  <tr key={no} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '4px 10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{no}</td>
                    <td style={{ padding: '4px 10px', border: '1px solid #e2e8f0', fontFamily: 'monospace' }}>{rfid}</td>
                    <td style={{ padding: '4px 10px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#64748b' }}>
                      {i * 42 + 2} ~ {(i + 1) * 42 + 1}행
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <div style={{ ...S.err, marginBottom: 10 }}>{error}</div>}
          <div style={S.btnRow}>
            <button style={S.btnDl} onClick={handleDownload} disabled={loading}>
              {loading ? '⏳ 생성 중...' : '↓ Excel 다운로드'}
            </button>
            <button style={S.btnAdd} onClick={() => { setAdding(true); setError('') }}>
              ✚ 데이터 추가
            </button>
            <button style={S.btnReset} onClick={handleReset}>
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

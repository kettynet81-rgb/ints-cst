import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'

const INSPECTION_ROWS = [
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0015','F_외관',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0016','F_외관 1',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0017','F_외관 2','4.8','4.4'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0018','F_외관 3',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0019','F_외관 4',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0020','F_CASSETTE 1','9.7','9.3'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0021','F_CASSETTE 2','9.7','9.3'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0022','F_CASSETTE 3','17','16'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0023','F_CASSETTE 4','17','16'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0024','F_CASSETTE 5','394.5','393.5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0025','F_CASSETTE 6',393.2,392.2],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0026','F_CASSETTE 7','421.5','420.5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0027','F_CASSETTE 8','155.5','154.5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0029','F_CASSETTE 10','9','7'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0030','F_SLIDERPAC 1','16.2','15.8'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0031','F_SLIDERPAC 2','14.2','13.6'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0032','F_SLIDERPAC 3','152.2','151.8'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0033','F_SLIDERPAC 4','143.2','142.8'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0034','F_SLIDERPAC 5','2.4','2.1'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0035','F_SLIDERPAC 6','8.4','8.1'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0036','F_SLIDERPAC 7','12.4','12.1'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0037','F_SLIDERPAC 8','152.2','151.8'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0038','F_SLIDERPAC 9','2.4','2.1'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0039','F_SLIDERPAC 10','8.4','8.1'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0040','F_SLIDERPAC 11','12.4','12.1'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0041','F_SLIDERPAC 12','142.2','141.9'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0042','F_SLIDERPAC 13','12.1','11.8'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0043','F_SLIDERPAC 14','2.2','1.9'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0044','F_SLIDERPAC 15','143.2','142.9'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0045','F_ESD COVER 1','9','5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0046','F_ESD COVER 2','9','5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0047','F_ESD COVER 3','9','5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0048','F_ESD COVER 4','9','5'],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0049','F_CASSETTE TEST 1',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0050','F_CASSETTE TEST 2',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0051','F_CASSETTE TEST 3',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0052','F_CASSETTE TEST 4',1,0],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0053','F_CASSETTE 6_1',393.2,392.2],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0054','F_CASSETTE 6_2',393.2,392.2],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0055','F_CASSETTE 8_1',153,152],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0056','F_CASSETTE 8_2',153,152],
  ['OY','X5421','Q311-176199','FDS08530',null,null,'CT0057','F_CASSETTE 8_3',153,152],
]

const HEADERS = [
  'Ship Site','vendorCode','Material Code','Design Spec','Lot No','Comments',
  'INSPECTION CODE','INSPECTION ITEM','USL','LSL',
  ...Array.from({ length: 70 }, (_, i) => `X${i + 1}`),
]

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
  const [parsed, setParsed]       = useState(false)
  const [error, setError]         = useState('')

  const handleParse = useCallback(() => {
    setError('')
    if (!inputText.trim()) { setError('RFID 데이터를 붙여넣어 주세요.'); return }
    const list = parseRfid(inputText)
    if (list.length === 0) { setError('RFID 코드를 인식하지 못했습니다. 형식을 확인해 주세요.'); return }
    setRfidList(list)
    setParsed(true)
  }, [inputText])

  const handleDownload = useCallback(() => {
    if (!rfidList.length) return
    const wsData = [HEADERS]
    for (const { rfid } of rfidList) {
      for (const tmpl of INSPECTION_ROWS) {
        const row = [...tmpl]
        row[4] = rfid
        row[5] = rfid
        for (let i = 0; i < 70; i++) row.push(null)
        wsData.push(row)
      }
    }
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    XLSX.utils.book_append_sheet(wb, ws, '원자재 협력업체 데이터')
    XLSX.writeFile(wb, 'INTS-원자재_협력업체_데이터.xlsx')
  }, [rfidList])

  const handleReset = () => { setInputText(''); setRfidList([]); setParsed(false); setError('') }

  const S = {
    wrap:    { padding: isMobile ? '16px 12px' : '24px 32px', maxWidth: 800, fontFamily: 'inherit' },
    title:   { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
    sub:     { fontSize: 12, color: '#64748b', marginBottom: 20 },
    infoBox: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#475569' },
    textarea:{ width: '100%', height: 220, border: '1px solid #cbd5e1', borderRadius: 6, padding: 10, fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
    err:     { marginTop: 8, color: '#dc2626', fontSize: 12, border: '1px solid #fca5a5', borderRadius: 4, padding: '6px 12px', background: '#fef2f2' },
    btnRow:  { display: 'flex', gap: 10, marginTop: 12 },
    btnPri:  { padding: '9px 24px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
    btnSec:  { padding: '9px 16px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
    btnDl:   { padding: '11px 32px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 },
    resHdr:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    tableWrap:{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 14 },
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>CST성적서 데이터 변환</div>
      <div style={S.sub}>RFID 표를 붙여넣으면 E·F열(Lot No)이 채워진 성적서 Excel을 생성합니다.</div>

      {!parsed ? (
        <>
          <div style={S.infoBox}>
            <b style={{ display: 'block', marginBottom: 4 }}>입력 형식 예시</b>
            <code style={{ fontSize: 11, whiteSpace: 'pre', display: 'block', lineHeight: 1.6 }}>
              {'No.\tRFID\t\tNo.\tRFID\n1\tIFZG439\t29\tIFZG467\n2\tIFZG440\t30\tIFZG468'}
            </code>
            <span style={{ display: 'block', marginTop: 6 }}>→ 엑셀/메모장에서 복사해 아래에 붙여넣으세요.</span>
          </div>

          <textarea
            value={inputText}
            onChange={e => { setInputText(e.target.value); setError('') }}
            placeholder="RFID 표 데이터를 여기에 붙여넣으세요..."
            style={S.textarea}
          />

          {error && <div style={S.err}>{error}</div>}

          <div style={S.btnRow}>
            <button style={S.btnPri} onClick={handleParse}>RFID 파싱</button>
            <button style={S.btnSec} onClick={handleReset}>초기화</button>
          </div>
        </>
      ) : (
        <>
          <div style={S.infoBox}>
            <div style={S.resHdr}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                파싱 결과 — 총 {rfidList.length}EA · {rfidList.length * 42}행 생성
              </span>
              <button style={{ ...S.btnSec, padding: '4px 12px', fontSize: 12 }} onClick={handleReset}>
                다시 입력
              </button>
            </div>

            <div style={S.tableWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                    {['No.', 'RFID', '행 범위'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{h}</th>
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
          </div>

          <div style={{ ...S.infoBox, marginBottom: 16 }}>
            <b>생성 규칙</b><br />
            • 각 RFID → 42개 검사항목 행 (E열·F열 모두 Lot No 삽입)<br />
            • 시트명: <code>원자재 협력업체 데이터</code>&nbsp;&nbsp;
            파일명: <code>INTS-원자재_협력업체_데이터.xlsx</code>
          </div>

          <button style={S.btnDl} onClick={handleDownload}>↓ Excel 다운로드</button>
        </>
      )}
    </div>
  )
}

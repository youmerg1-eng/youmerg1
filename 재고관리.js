// =====================================================
//  INVENTORY
// =====================================================
// ── 입고관리 서브탭 전환 (입고 이력 / 입고예정) ────────────────
//   ★ 견적비교는 영업 탭(salesops) 으로 이동됨 (2026-05-12)
function setInventorySubtab(key) {
  const history  = document.getElementById('inv-history-pane');
  const incoming = document.getElementById('inv-incoming-pane');
  const btnH = document.getElementById('inv-subtab-history');
  const btnI = document.getElementById('inv-subtab-incoming');
  if (!history) return;
  [history, incoming].forEach(el => { if (el) el.style.display = 'none'; });
  [btnH, btnI].forEach(b => { if (b) b.classList.remove('active'); });
  if (key === 'incoming') {
    if (incoming) incoming.style.display = 'block';
    if (btnI) btnI.classList.add('active');
    if (window.incoming && typeof window.incoming._mountToTab === 'function') {
      try { window.incoming._mountToTab(); } catch(e) { console.error('[inventory] incoming mount 실패:', e); }
    }
  } else {
    history.style.display = '';
    if (btnH) btnH.classList.add('active');
    if (typeof renderInventory === 'function') try { renderInventory(); } catch(e) {}
  }
}
window.setInventorySubtab = setInventorySubtab;

function renderInventory() {
  // Pending inbound
  const enriched = getEnriched();
  const today = todayStr();
  const pending = enriched.filter(o => o.출고요청일 && o.출고요청일 >= today && o.status === '수주')
    .slice()
    .sort((a,b) => (a.출고요청일||'').localeCompare(b.출고요청일||''))
    .slice(0,10);
  // ── D-DAY 계산: 요청일 - 오늘 ──
  const _ddayOf = (req) => {
    if (!req) return null;
    const d1 = new Date(req);
    const d0 = new Date(today);
    if (isNaN(d1) || isNaN(d0)) return null;
    const diff = Math.round((d1 - d0) / 86400000);
    return diff;
  };
  const _ddayLabel = (d) => {
    if (d === null) return '<span style="color:#bbb;">-</span>';
    if (d === 0)  return '<span style="background:#c62828;color:#fff;padding:2px 8px;border-radius:12px;font-weight:800;">D-DAY</span>';
    if (d < 0)   return `<span style="background:#5d4037;color:#fff;padding:2px 8px;border-radius:12px;font-weight:700;">D+${Math.abs(d)}</span>`;
    if (d <= 3)  return `<span style="background:#e65100;color:#fff;padding:2px 8px;border-radius:12px;font-weight:800;">D-${d}</span>`;
    if (d <= 7)  return `<span style="background:#f9a825;color:#fff;padding:2px 8px;border-radius:12px;font-weight:700;">D-${d}</span>`;
    return `<span style="background:#1565c0;color:#fff;padding:2px 8px;border-radius:12px;font-weight:600;">D-${d}</span>`;
  };
  document.getElementById('pendingInbound').innerHTML = pending.length ?
    `<div class="tbl-wrap"><table><thead><tr><th class="center">D-DAY</th><th>PJ NO</th><th>고객사</th><th>모델명</th><th>수량</th><th>출고요청일</th></tr></thead>
    <tbody>${pending.map(o=>{
      const dday = _ddayOf(o.출고요청일);
      return `<tr><td class="center">${_ddayLabel(dday)}</td><td>${o.pjNo}</td><td>${o.고객사}</td><td style="font-size:0.82em;">${o.모델명}</td><td>${fmt(o.수량)}</td><td>${dateKo(o.출고요청일)}</td></tr>`;
    }).join('')}</tbody>
    </table></div>` : '<div class="empty">출고 예정 없음</div>';

  renderInventoryHistory();
}

// ★ 2026-05 변경: 입고관리 탭은 입고이력만 표시 (출고는 별도 탭)
//   - 유형 필터 → 창고 필터 (warehouseMaster 등록 창고 자동 채움)
//   - 검색 대상 확장: 모델, B/L, 창고, 비고, 매입처, PJ NO, 단가 등 모두 포함
function renderInventoryHistory() {
  // 1) 창고 필터 셀렉트 자동 채우기 (warehouseMaster + 기존 inventory 등장 창고)
  const whSel = document.getElementById('inv-warehouse-f');
  if (whSel) {
    const whSet = new Set();
    if (typeof window.warehouseMaster !== 'undefined' && window.warehouseMaster.list) {
      try {
        window.warehouseMaster.list().forEach(w => {
          whSet.add(w.name);
          (w.zones||[]).forEach(z => whSet.add(`${w.name} · ${z.name}`));
        });
      } catch (e) {}
    }
    if (typeof inventoryData !== 'undefined') {
      inventoryData.forEach(r => { if (r.warehouse) whSet.add(r.warehouse); });
    }
    const cur = whSel.value;
    const optionsHtml = '<option value="">전체 창고</option>' +
      Array.from(whSet).sort().map(w => `<option value="${w}">${w}</option>`).join('');
    if (whSel.innerHTML !== optionsHtml) whSel.innerHTML = optionsHtml;
    if (cur && Array.from(whSet).includes(cur)) whSel.value = cur;
  }

  const whF = document.getElementById('inv-warehouse-f')?.value || '';
  const searchF = (document.getElementById('inv-search')?.value||'').toLowerCase().trim();

  // 2) 입고만 표시 (출고는 별도 탭)
  let data = [...inventoryData].filter(r => r.type === '입고').reverse();

  // 3) 창고 필터 (정확 일치 + 부분 일치 모두)
  if (whF) data = data.filter(r => {
    const w = r.warehouse || '';
    return w === whF || w.includes(whF) || whF.includes(w);
  });

  // 4) 검색 — 비고 포함 다중 필드
  if (searchF) {
    data = data.filter(r => {
      const hay = [
        r.model, r.bl, r.warehouse, r.pjNo, r.mfr, r.vendor,
        r.remarks, r.notes,
        r.unitPrice ? String(r.unitPrice) : '',
        r.totalAmount ? String(r.totalAmount) : '',
        r.watt ? String(r.watt) : ''
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchF);
    });
  }

  document.getElementById('inventoryHistoryTable').innerHTML = data.length ?
    `<div class="tbl-wrap"><table><thead><tr>
      <th class="center" style="width:32px;"><input type="checkbox" id="inv-sel-all" onclick="if(typeof toggleAllInventorySel==='function')toggleAllInventorySel(this.checked)"></th>
      <th>날짜</th><th>모델명</th><th>제조사</th>
      <th class="num">수량</th>
      <th>B/L</th><th>창고</th><th>연결 PJ</th>
      <th class="num">매입단가<br><span style="font-size:0.78em;color:#aaa;font-weight:400;">(원/Wp)</span></th>
      <th class="num">매입금액</th>
      <th>비고</th>
    </tr></thead>
    <tbody>${data.map((r,i)=>`<tr>
      <td class="center"><input type="checkbox" class="inv-row-chk" data-id="${r.id}" onchange="if(typeof updateInventorySelCount==='function')updateInventorySelCount()"></td>
      <td style="white-space:nowrap;">${r.date}</td>
      <td><strong>${r.model||'-'}</strong></td>
      <td style="font-size:0.86em;color:#555;">${r.mfr||r.vendor||'-'}</td>
      <td class="num" style="font-weight:700;">${fmt(r.qty)}매${r.watt?'<br><span style="font-size:0.78em;color:#888;font-weight:400;">'+r.watt+'W</span>':''}</td>
      <td>${r.bl||'-'}</td>
      <td>${r.warehouse||'-'}</td>
      <td>${r.pjNo||'-'}</td>
      <td class="num">${r.unitPrice?fmt(r.unitPrice)+'원':'<span style="color:#bbb;">-</span>'}</td>
      <td class="num" style="font-weight:700;color:${r.totalAmount?'#e65100':'#bbb'};">${r.totalAmount?(typeof fmtKrAmt==='function'?fmtKrAmt(r.totalAmount):fmt(r.totalAmount)+'원'):'-'}</td>
      <td style="font-size:0.82em;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#666;" title="${(r.remarks||'').replace(/"/g,'&quot;')}">${r.remarks||'-'}</td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><div class="empty-state-icon">📥</div><div class="empty-state-title">입고 이력이 없습니다</div><div class="empty-state-desc">➕ 입고 등록 버튼으로 시작하세요</div></div>';
  // 렌더 후 선택 카운터 리셋
  if (typeof updateInventorySelCount === 'function') updateInventorySelCount();
}

// 출고관리 탭 — 모델별 출고 분석 테이블 (재고관리에서 이전)
function renderShipModelTbody() {
  const tbody = document.getElementById('shipModelTbody');
  if (!tbody) return;
  const map = {};
  (typeof inventoryData !== 'undefined' ? inventoryData : []).forEach(r => {
    const key = (r.mfr||'') + '|' + (r.model||r.moduleModel||'');
    if (!map[key]) map[key] = { mfr:r.mfr||'', model:r.model||r.moduleModel||'', inQty:0, outQty:0 };
    if (r.type==='입고') map[key].inQty += Number(r.qty)||0;
    else if (r.type==='출고') map[key].outQty += Number(r.qty)||0;
  });
  // 출고가 있는 모델 우선, 출고량 많은 순
  const rows = Object.values(map).filter(r => r.outQty > 0 || r.inQty > 0).sort((a,b) => b.outQty - a.outQty);
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">데이터 없음</td></tr>'; return; }
  tbody.innerHTML = rows.map(r => {
    const cur = r.inQty - r.outQty;
    const statusTag = cur < 0 ? '<span class="tag red">재고부족</span>'
                    : cur === 0 ? '<span class="tag">0</span>'
                    : '<span class="tag green">정상</span>';
    return `<tr>
      <td style="font-weight:700;">${r.model||'-'}</td>
      <td style="font-size:0.82em;color:#888;">${r.mfr||'-'}</td>
      <td class="num" style="color:#2980b9;">${fmt(r.inQty)}</td>
      <td class="num" style="color:#e67e22;font-weight:700;">${fmt(r.outQty)}</td>
      <td class="num" style="font-weight:900;color:${cur<0?'#e74c3c':cur===0?'#f39c12':'#27ae60'};">${fmt(cur)}</td>
      <td class="center">${statusTag}</td>
      <td class="center"><button class="btn btn-xs btn-dark" onclick="openModelOutboundModal('${(r.model||'').replace(/'/g,"\\'")}')">📤 내역</button></td>
    </tr>`;
  }).join('');
}
window.renderShipModelTbody = renderShipModelTbody;

// 출고관리 탭 — 출고 이력 렌더링
function renderOutboundHistory() {
  const host = document.getElementById('outboundHistoryTable');
  if (!host) return;
  const searchF = (document.getElementById('ship-search-2')?.value || '').toLowerCase().trim();
  let data = [...(typeof inventoryData!=='undefined'?inventoryData:[])].filter(r => r.type === '출고').reverse();
  if (searchF) {
    data = data.filter(r => {
      const hay = [r.model, r.bl, r.warehouse, r.pjNo, r.mfr, r.remarks, r.notes].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(searchF);
    });
  }

  // 모델별 출고 분석 동시 렌더 (출고관리 도구 탭의 상단 분석 테이블)
  if (typeof renderShipModelTbody === 'function') renderShipModelTbody();

  host.innerHTML = data.length ?
    `<div class="tbl-wrap"><table><thead><tr>
      <th>날짜</th><th>모델명</th><th>제조사</th>
      <th class="num">수량</th>
      <th>창고</th><th>연결 PJ</th>
      <th>비고</th><th class="center">작업</th>
    </tr></thead>
    <tbody>${data.map(r=>`<tr>
      <td>${r.date}</td>
      <td><strong>${r.model||'-'}</strong></td>
      <td style="font-size:0.86em;">${r.mfr||r.vendor||'-'}</td>
      <td class="num" style="font-weight:700;color:#e65100;">${fmt(r.qty)}매</td>
      <td>${r.warehouse||'-'}</td>
      <td>${r.pjNo||'-'}</td>
      <td style="font-size:0.82em;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(r.remarks||'').replace(/"/g,'&quot;')}">${r.remarks||'-'}</td>
      <td class="center">
        <button class="btn btn-xs btn-dark" onclick="openEditInventoryModal('${r.id}')">✏️</button>
        <button class="btn btn-xs btn-danger" onclick="deleteInventory('${r.id}')">🗑</button>
      </td>
    </tr>`).join('')}</tbody></table></div>` : '<div class="empty-state"><div class="empty-state-icon">📤</div><div class="empty-state-title">출고 이력이 없습니다</div><div class="empty-state-desc">출고지시서 발행 시 자동으로 등록되거나 ➕ 출고 등록 버튼으로 직접 등록할 수 있습니다.</div></div>';
}
window.renderOutboundHistory = renderOutboundHistory;

function openInboundModal() {
  // 입력값 초기화
  ['ib-mfr','ib-model','ib-qty','ib-watt','ib-unit-price','ib-bl','ib-warehouse','ib-pjno','ib-remarks'].forEach(id=>{
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('ib-date').value = todayStr();
  const disp = document.getElementById('ib-total-amount-disp'); if (disp) disp.textContent = '- 원';
  openModal('inboundModal');
}

// 입고 모달 — 매입금액 자동 계산 (수량 × W × 단가)
function recalcInbound() {
  const qty = parseFloat(document.getElementById('ib-qty')?.value) || 0;
  const watt = parseFloat(document.getElementById('ib-watt')?.value) || 0;
  const unit = parseFloat(document.getElementById('ib-unit-price')?.value) || 0;
  const total = Math.round(qty * watt * unit);
  const disp = document.getElementById('ib-total-amount-disp');
  if (disp) disp.textContent = total ? (typeof fmtKrAmt==='function'?fmtKrAmt(total):fmt(total)+'원') : '- 원';
}
window.recalcInbound = recalcInbound;

function saveInbound() {
  const date = document.getElementById('ib-date').value;
  const model = document.getElementById('ib-model').value.trim();
  const qty = parseInt(document.getElementById('ib-qty').value)||0;
  if (!date||!model||!qty) { alert('날짜, 모델명, 수량은 필수입니다.'); return; }
  const watt = parseFloat(document.getElementById('ib-watt').value) || 0;
  const unitPrice = parseFloat(document.getElementById('ib-unit-price').value) || 0;
  const totalAmount = Math.round(qty * watt * unitPrice);
  inventoryData.push({ type:'입고', date, model, qty,
    bl: document.getElementById('ib-bl').value,
    mfr: document.getElementById('ib-mfr').value,
    warehouse: document.getElementById('ib-warehouse').value,
    pjNo: document.getElementById('ib-pjno').value,
    remarks: document.getElementById('ib-remarks').value,
    watt: watt || undefined,
    unitPrice: unitPrice || undefined,
    totalAmount: totalAmount || undefined,
    id: 'IB-'+Date.now()
  });
  saveLocal();
  closeModal('inboundModal');
  renderInventory();
  setBanner('ok','✅ 입고 등록 완료');
}

function openOutboundModal() {
  document.getElementById('ob-date').value = todayStr();
  openModal('outboundModal');
}

function saveOutbound() {
  const date = document.getElementById('ob-date').value;
  const model = document.getElementById('ob-model').value.trim();
  const qty = parseInt(document.getElementById('ob-qty').value)||0;
  if (!date||!model||!qty) { alert('날짜, 모델명, 수량은 필수입니다.'); return; }
  inventoryData.push({ type:'출고', date, model, qty,
    pjNo: document.getElementById('ob-pjno').value,
    remarks: document.getElementById('ob-remarks').value,
    id: 'OB-'+Date.now()
  });
  saveLocal();
  closeModal('outboundModal');
  renderInventory();
  setBanner('ok','✅ 출고 등록 완료');
}

function openEditInventoryModal(id) {
  const rec = inventoryData.find(r => r.id === id);
  if (!rec) return;
  document.getElementById('invEditTitle').textContent = `✏️ ${rec.type} 수정`;
  document.getElementById('inv-edit-id').value = rec.id;
  document.getElementById('inv-edit-type').value = rec.type;
  document.getElementById('inv-edit-date').value = rec.date;
  document.getElementById('inv-edit-mfr').value = rec.mfr || '';
  document.getElementById('inv-edit-model').value = rec.model;
  document.getElementById('inv-edit-qty').value = rec.qty;
  document.getElementById('inv-edit-bl').value = rec.bl || '';
  document.getElementById('inv-edit-warehouse').value = rec.warehouse || '';
  document.getElementById('inv-edit-pjno').value = rec.pjNo || '';
  document.getElementById('inv-edit-remarks').value = rec.remarks || '';
  // 매입단가/W/매입금액 (있을 수 있음)
  const wEl = document.getElementById('inv-edit-watt'); if (wEl) wEl.value = rec.watt || '';
  const upEl = document.getElementById('inv-edit-unit-price'); if (upEl) upEl.value = rec.unitPrice || '';
  if (typeof recalcInvEdit === 'function') recalcInvEdit();
  openModal('invEditModal');
}

// 수정 모달 — 매입금액 자동 계산
function recalcInvEdit() {
  const qty = parseFloat(document.getElementById('inv-edit-qty')?.value) || 0;
  const watt = parseFloat(document.getElementById('inv-edit-watt')?.value) || 0;
  const unit = parseFloat(document.getElementById('inv-edit-unit-price')?.value) || 0;
  const total = Math.round(qty * watt * unit);
  const disp = document.getElementById('inv-edit-total-amount-disp');
  if (disp) disp.textContent = total ? (typeof fmtKrAmt==='function'?fmtKrAmt(total):fmt(total)+'원') : '- 원';
}
window.recalcInvEdit = recalcInvEdit;

function saveEditInventory() {
  const id = document.getElementById('inv-edit-id').value;
  const idx = inventoryData.findIndex(r => r.id === id);
  if (idx < 0) { alert('레코드를 찾을 수 없습니다.'); return; }
  const date = document.getElementById('inv-edit-date').value;
  const model = document.getElementById('inv-edit-model').value.trim();
  const qty = parseInt(document.getElementById('inv-edit-qty').value) || 0;
  if (!date || !model || !qty) { alert('날짜, 모델명, 수량은 필수입니다.'); return; }
  const watt = parseFloat(document.getElementById('inv-edit-watt')?.value) || 0;
  const unitPrice = parseFloat(document.getElementById('inv-edit-unit-price')?.value) || 0;
  const totalAmount = Math.round(qty * watt * unitPrice);
  inventoryData[idx] = {
    ...inventoryData[idx],
    type: document.getElementById('inv-edit-type').value,
    date, model, qty,
    mfr: document.getElementById('inv-edit-mfr').value,
    bl: document.getElementById('inv-edit-bl').value,
    warehouse: document.getElementById('inv-edit-warehouse').value,
    pjNo: document.getElementById('inv-edit-pjno').value,
    remarks: document.getElementById('inv-edit-remarks').value,
    watt: watt || undefined,
    unitPrice: unitPrice || undefined,
    totalAmount: totalAmount || undefined
  };
  saveLocal();
  closeModal('invEditModal');
  renderInventory();
  setBanner('ok', '✅ 입출고 수정 완료');
}

function deleteInventory(id) {
  if (!confirm('이 입출고 이력을 삭제합니까?')) return;
  inventoryData = inventoryData.filter(r => r.id !== id);
  saveLocal();
  renderInventory();
  setBanner('ok', '✅ 입출고 이력 삭제 완료');
}

// ── 체크박스 다중 선택 / 일괄 수정·삭제 ─────────────────
function toggleAllInventorySel(checked) {
  document.querySelectorAll('.inv-row-chk').forEach(c => { c.checked = !!checked; });
  updateInventorySelCount();
}
window.toggleAllInventorySel = toggleAllInventorySel;

function _getSelectedInventoryIds() {
  return [...document.querySelectorAll('.inv-row-chk:checked')].map(c => c.dataset.id);
}

function updateInventorySelCount() {
  const cnt = _getSelectedInventoryIds().length;
  const el = document.getElementById('inv-sel-cnt');
  if (el) el.innerHTML = `선택 <strong style="color:#0d47a1;">${cnt}</strong>건`;
  // 전체선택 체크박스 상태 동기화
  const total = document.querySelectorAll('.inv-row-chk').length;
  const all = document.getElementById('inv-sel-all');
  if (all) all.checked = total > 0 && cnt === total;
}
window.updateInventorySelCount = updateInventorySelCount;

function editSelectedInventory() {
  const ids = _getSelectedInventoryIds();
  if (ids.length === 0) { alert('수정할 입고 이력을 1건 이상 체크해주세요.'); return; }
  if (ids.length > 1) {
    alert('한 번에 1건만 수정할 수 있습니다. 1건만 선택해주세요.\n(현재 ' + ids.length + '건 선택)');
    return;
  }
  openEditInventoryModal(ids[0]);
}
window.editSelectedInventory = editSelectedInventory;

function deleteSelectedInventory() {
  const ids = _getSelectedInventoryIds();
  if (ids.length === 0) { alert('삭제할 입고 이력을 1건 이상 체크해주세요.'); return; }
  if (!confirm(`선택한 ${ids.length}건의 입고 이력을 삭제하시겠습니까?\n(되돌릴 수 없습니다)`)) return;
  inventoryData = inventoryData.filter(r => !ids.includes(r.id));
  saveLocal();
  renderInventory();
  setBanner('ok', `✅ ${ids.length}건 입고 이력 삭제 완료`);
}
window.deleteSelectedInventory = deleteSelectedInventory;

// =====================================================
//  STOCK MANAGEMENT (재고관리)
// =====================================================
function renderStockTab() {
  const search = (document.getElementById('stock-search')?.value || '').toLowerCase();

  // Build stock map from inventoryData
  const stockMap = {};   // key: 'mfr|model' → { mfr, model, inQty, outQty }
  const warehouseMap = {}; // key: warehouse → { model → qty }

  inventoryData.forEach(r => {
    const key = (r.mfr||'') + '|' + (r.model||r.moduleModel||'');
    if (!stockMap[key]) stockMap[key] = { mfr: r.mfr||'', model: r.model||r.moduleModel||'', inQty:0, outQty:0 };
    if (r.type==='입고') stockMap[key].inQty += Number(r.qty)||0;
    else stockMap[key].outQty += Number(r.qty)||0;

    if (r.warehouse) {
      if (!warehouseMap[r.warehouse]) warehouseMap[r.warehouse] = {};
      const m = r.model||r.moduleModel||'';
      if (!warehouseMap[r.warehouse][m]) warehouseMap[r.warehouse][m] = 0;
      if (r.type==='입고') warehouseMap[r.warehouse][m] += Number(r.qty)||0;
      else warehouseMap[r.warehouse][m] -= Number(r.qty)||0;
    }
  });

  // ── 모델별 재고 (검색 반영) ────────────────────────────
  let rows = Object.values(stockMap);
  if (search) rows = rows.filter(r => (r.model+r.mfr).toLowerCase().includes(search));
  rows.sort((a,b) => (b.inQty-b.outQty) - (a.inQty-a.outQty));

  const totalIn    = rows.reduce((s,r)=>s+r.inQty,0);
  const totalOut   = rows.reduce((s,r)=>s+r.outQty,0);
  const totalStock = totalIn - totalOut;

  const ss = document.getElementById('stockTabStats');
  if (ss) ss.innerHTML = `
    <div class="stat s-blue"><div class="stat-lbl">등록 모델 수</div><div class="stat-val">${rows.length}</div></div>
    <div class="stat s-green"><div class="stat-lbl">총 입고 수량</div><div class="stat-val">${fmt(totalIn)}</div><div class="stat-sub">매</div></div>
    <div class="stat s-orange"><div class="stat-lbl">총 출고 수량</div><div class="stat-val">${fmt(totalOut)}</div><div class="stat-sub">매</div></div>
    <div class="stat"><div class="stat-lbl">현재 재고 합계</div><div class="stat-val">${fmt(totalStock)}</div><div class="stat-sub">매</div></div>
  `;

  const modelTbody = document.getElementById('stockModelTbody');
  if (modelTbody) {
    modelTbody.innerHTML = rows.length ? rows.map(r => {
      const cur = r.inQty - r.outQty;
      const statusTag = cur < 0 ? '<span class="tag red">재고부족</span>' : cur === 0 ? '<span class="tag">0</span>' : '<span class="tag green">정상</span>';
      const modelKey = encodeURIComponent(r.model||'');
      return `<tr>
        <td style="font-weight:700;">${r.model||'-'}</td>
        <td style="font-size:0.82em;color:#888;">${r.mfr||'-'}</td>
        <td style="text-align:right;color:#2980b9;">${fmt(r.inQty)}</td>
        <td style="text-align:right;color:#e67e22;">${fmt(r.outQty)}</td>
        <td style="text-align:right;font-weight:900;color:${cur<0?'#e74c3c':cur===0?'#f39c12':'#27ae60'};">${fmt(cur)}</td>
        <td>${statusTag}</td>
        <td style="text-align:center;">
          <button class="btn btn-xs btn-dark" onclick="openModelOutboundModal(decodeURIComponent('${modelKey}'))">📤 출고내역</button>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" class="empty">데이터 없음</td></tr>';
  }

  // ── 창고별 재고 (검색 반영) ────────────────────────────
  const whTbody = document.getElementById('stockWarehouseTbody');
  if (whTbody) {
    const whRows = [];
    Object.entries(warehouseMap).forEach(([wh, models]) => {
      Object.entries(models).forEach(([model, qty]) => {
        if (qty === 0) return;
        // 검색어 필터: 창고명 또는 모델명 매칭
        if (search && !(model.toLowerCase().includes(search) || wh.toLowerCase().includes(search))) return;
        whRows.push({ wh, model, qty });
      });
    });
    whRows.sort((a,b)=>b.qty-a.qty);
    whTbody.innerHTML = whRows.length ? whRows.map(r => `<tr>
      <td style="font-weight:700;">${r.wh}</td>
      <td style="font-size:0.82em;">${r.model}</td>
      <td style="text-align:right;font-weight:700;color:${r.qty<0?'#e74c3c':'#27ae60'};">${fmt(r.qty)}</td>
    </tr>`).join('') : `<tr><td colspan="3" class="empty">${search?'검색 결과 없음':'창고 데이터 없음'}</td></tr>`;
  }

  // ── 입출고 이력 (검색 반영, 검색 시 전체 / 미검색 시 최근 30건) ─────
  const allHist = [...inventoryData].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const hist = search
    ? allHist.filter(r => (r.model+r.mfr+r.warehouse+r.pjNo+r.bl+'').toLowerCase().includes(search))
    : allHist.slice(0, 30);

  const headEl = document.getElementById('stockHistoryHead');
  if (headEl) headEl.textContent = search ? `📜 입출고 이력 (${hist.length}건 검색됨)` : '📜 최근 입출고 이력 (30건)';

  const hw = document.getElementById('stockHistoryWrap');
  if (hw) {
    hw.innerHTML = hist.length ? `<table><thead><tr><th>날짜</th><th>유형</th><th>모델명</th><th>제조사</th><th>수량</th><th>창고</th><th>PJ NO</th><th>비고</th></tr></thead>
    <tbody>${hist.map(r=>`<tr>
      <td>${r.date||'-'}</td>
      <td>${r.type==='입고'?'<span class="tag blue">📥 입고</span>':'<span class="tag orange">📤 출고</span>'}</td>
      <td style="font-weight:700;">${r.model||r.moduleModel||'-'}</td>
      <td style="font-size:0.82em;color:#888;">${r.mfr||'-'}</td>
      <td style="text-align:right;">${fmt(Number(r.qty)||0)}</td>
      <td>${r.warehouse||'-'}</td>
      <td>${r.pjNo||'-'}</td>
      <td style="font-size:0.78em;color:#999;">${r.remarks||'-'}</td>
    </tr>`).join('')}</tbody></table>`
    : `<div class="empty">${search?'검색 결과 없음':'입출고 이력 없음'}</div>`;
  }
}

// ─────────────────────────────────────────────────────────
//  모델별 출고 내역 모달
// ─────────────────────────────────────────────────────────
function openModelOutboundModal(model) {
  const outList = [...inventoryData]
    .filter(r => r.type === '출고' && (r.model||'').trim() === model.trim())
    .sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const totalOut = outList.reduce((s,r) => s + (Number(r.qty)||0), 0);
  const inList   = inventoryData.filter(r => r.type === '입고' && (r.model||'').trim() === model.trim());
  const totalIn  = inList.reduce((s,r) => s + (Number(r.qty)||0), 0);
  const remain   = totalIn - totalOut;

  const titleEl = document.getElementById('modelOutboundTitle');
  if (titleEl) titleEl.textContent = `📤 출고 내역 — ${model}`;

  const statsEl = document.getElementById('modelOutboundStats');
  if (statsEl) statsEl.innerHTML = `
    <div style="background:#e8f5e9;border-radius:8px;padding:10px 14px;">
      <div style="font-size:0.75em;color:#888;margin-bottom:2px;">총 입고</div>
      <strong style="font-size:1.1em;color:#2e7d32;">${fmt(totalIn)} 매</strong>
    </div>
    <div style="background:#fff3e0;border-radius:8px;padding:10px 14px;">
      <div style="font-size:0.75em;color:#888;margin-bottom:2px;">총 출고</div>
      <strong style="font-size:1.1em;color:#e65100;">${fmt(totalOut)} 매</strong>
    </div>
    <div style="background:${remain<0?'#ffebee':'#e3f2fd'};border-radius:8px;padding:10px 14px;">
      <div style="font-size:0.75em;color:#888;margin-bottom:2px;">현재 재고</div>
      <strong style="font-size:1.1em;color:${remain<0?'#c62828':'#1565c0'};">${fmt(remain)} 매</strong>
    </div>`;

  const tableEl = document.getElementById('modelOutboundTable');
  if (tableEl) {
    tableEl.innerHTML = outList.length
      ? `<table>
          <thead><tr><th>출고일</th><th style="text-align:right;">수량</th><th>창고</th><th>PJ NO</th><th>비고</th></tr></thead>
          <tbody>${outList.map(r => `<tr>
            <td>${r.date||'-'}</td>
            <td style="text-align:right;font-weight:700;color:#e65100;">${fmt(Number(r.qty)||0)} 매</td>
            <td>${r.warehouse||'-'}</td>
            <td>${r.pjNo||'-'}</td>
            <td style="font-size:0.82em;color:#888;">${r.remarks||'-'}</td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<div class="empty">출고 이력이 없습니다.</div>';
  }

  openModal('modelOutboundModal');
}

const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';

// --- Auth Guard ---
const adminToken = sessionStorage.getItem('admin_token');
if (!adminToken) {
    window.location.href = 'admin-login.html';
}

function authHeaders(extra = {}) {
    return { 'Authorization': `Bearer ${adminToken}`, ...extra };
}

async function authFetch(url, options = {}) {
    options.headers = { ...options.headers, ...authHeaders() };
    const res = await fetch(url, options);
    if (res.status === 401) {
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_user');
        window.location.href = 'admin-login.html';
        throw new Error('Unauthorized');
    }
    return res;
}

// --- Toast Notification ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span>`;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Verify token is still valid
    try {
        const verifyRes = await fetch(`${API_BASE}/auth/verify`, { headers: authHeaders() });
        if (!verifyRes.ok) {
            sessionStorage.removeItem('admin_token');
            sessionStorage.removeItem('admin_user');
            window.location.href = 'admin-login.html';
            return;
        }
    } catch {
        window.location.href = 'admin-login.html';
        return;
    }

    // --- Tab Navigation ---
    const tabButtons = document.querySelectorAll('.admin-tab[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(tabId) {
        tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
        tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tabId}`));
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    // --- Image Modal ---
    const imgModal = document.getElementById('img-modal');
    const imgModalImg = document.getElementById('img-modal-img');
    document.getElementById('img-modal-close').addEventListener('click', () => {
        imgModal.hidden = true;
    });
    imgModal.addEventListener('click', (e) => {
        if (e.target === imgModal) imgModal.hidden = true;
    });

    function openImageModal(src) {
        imgModalImg.src = src;
        imgModal.hidden = false;
    }

    function imageCell(imagePath) {
        if (imagePath) {
            // Support both full URL (R2) and local path
            const src = imagePath.startsWith('http') ? imagePath : `/uploads/${encodeURIComponent(imagePath)}`;
            return `<img src="${src}" class="admin-thumb" data-fullimg="${src}" alt="สลิป">`;
        }
        return '<span class="text-muted">ไม่มีรูป</span>';
    }

    function bindThumbnails(container) {
        container.querySelectorAll('.admin-thumb').forEach(img => {
            img.addEventListener('click', () => openImageModal(img.dataset.fullimg));
        });
    }

    // --- Format Helpers ---
    function formatCurrency(amount) {
        return Number(amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ฿';
    }

    function formatServiceDate(value) {
        if (!value) return '—';
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('th-TH');
    }

    // --- Render Functions ---
    async function renderSoldOut() {
        const list = document.getElementById('sold-out-list');
        try {
            const res = await fetch(`${API_BASE}/sold-out`);
            const soldOut = await res.json();
            if (soldOut.length === 0) {
                list.innerHTML = '<p class="empty-msg">ยังไม่มีเลขที่ปิดขาย</p>';
            } else {
                list.innerHTML = soldOut
                    .sort((a, b) => a - b)
                    .map(n => `<span class="sold-tag">${String(n).padStart(2, '0')}</span>`)
                    .join('');
            }
        } catch (err) {
            list.innerHTML = '<p class="empty-msg">ไม่สามารถโหลดข้อมูลได้</p>';
        }
        updateStats();
    }

    async function renderHistory() {
        const tbody = document.getElementById('history-body');
        const noMsg = document.getElementById('no-history');
        try {
            const res = await fetch(`${API_BASE}/history`);
            const history = await res.json();

            if (history.length === 0) {
                tbody.innerHTML = '';
                noMsg.classList.remove('hidden');
                return;
            }

            noMsg.classList.add('hidden');
            tbody.innerHTML = history.map((h, i) => {
                // Transaction status
                let statusClass, statusText;
                if (h.approved === 'rejected') {
                    statusClass = 'badge-revoked';
                    statusText = 'ไม่อนุมัติ';
                } else if (h.approved === 'pending') {
                    statusClass = 'badge-pending';
                    statusText = 'รออนุมัติ';
                } else {
                    statusClass = 'badge-active';
                    statusText = 'อนุมัติแล้ว';
                }

                // Lottery result
                let lotteryNum = '—';
                let resultBadge = '';
                let cashbackCell = '—';

                if (h.guess_number) {
                    lotteryNum = h.guess_number;
                }

                if (h.lottery_result === 'won') {
                    resultBadge = '<span class="badge badge-won">🎯 ถูกรางวัล!</span>';
                    // Calculate cashback: 100% of spending, max 50,000, minus 7% tax
                    const grossAmount = h.reward_amount || 0;
                    const tax = grossAmount * 0.07;
                    const netAmount = grossAmount - tax;
                    cashbackCell = `<span class="cashback-won">${formatCurrency(netAmount)}</span><br><span class="cashback-detail">ก่อนภาษี: ${formatCurrency(grossAmount)}</span>`;
                } else if (h.lottery_result === 'lost') {
                    resultBadge = '<span class="badge badge-lost">ไม่ถูก</span>';
                    cashbackCell = '<span class="cashback-gv">GV 500 ฿</span>';
                } else if (h.lottery_result === 'pending') {
                    resultBadge = '<span class="badge badge-pending">รอผล</span>';
                }

                const dateStr = new Date(h.date || h.created_at).toLocaleString('th-TH');
                const serviceDate = formatServiceDate(h.service_date);
                const customerName = h.customer_name || h.name || '—';
                const staffName = h.staff_name || '—';

                return `<tr>
                    <td>${i + 1}</td>
                    <td>${serviceDate}</td>
                    <td>${dateStr}</td>
                    <td>${escapeHtml(customerName)}</td>
                    <td>${escapeHtml(staffName)}</td>
                    <td>${imageCell(h.image_path || h.slip_image_url)}</td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td class="lottery-num-cell">${lotteryNum}</td>
                    <td>${resultBadge || '—'}</td>
                    <td>${cashbackCell}</td>
                    <td>
                        <button class="btn-small" data-delete-history="${h.id}">ลบ</button>
                    </td>
                </tr>`;
            }).join('');

            bindThumbnails(tbody);

            tbody.querySelectorAll('[data-delete-history]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await authFetch(`${API_BASE}/history/${btn.dataset.deleteHistory}`, { method: 'DELETE' });
                    renderHistory();
                    renderApproval();
                    renderCashbackSummary();
                    updateStats();
                });
            });
        } catch (err) {
            tbody.innerHTML = '';
            noMsg.classList.remove('hidden');
        }
    }

    // --- Approval Queue ---
    async function renderApproval() {
        const tbody = document.getElementById('approval-body');
        const noMsg = document.getElementById('no-approval');
        try {
            const res = await fetch(`${API_BASE}/history`);
            const all = await res.json();
            const pending = all.filter(h => h.approved === 'pending');

            if (pending.length === 0) {
                tbody.innerHTML = '';
                noMsg.classList.remove('hidden');
                return;
            }

            noMsg.classList.add('hidden');
            tbody.innerHTML = pending.map((h, i) => {
                const dateStr = new Date(h.date || h.created_at).toLocaleString('th-TH');
                const serviceDate = formatServiceDate(h.service_date);
                const customerName = h.customer_name || h.name || '—';
                const staffName = h.staff_name || '—';
                // NOTE: NO rating scores shown here — top secret!
                return `<tr>
                    <td>${i + 1}</td>
                    <td>${serviceDate}</td>
                    <td>${dateStr}</td>
                    <td>${escapeHtml(customerName)}</td>
                    <td>${escapeHtml(staffName)}</td>
                    <td>${imageCell(h.image_path || h.slip_image_url)}</td>
                    <td>
                        <button class="btn-action btn-green btn-approve" data-approve="${h.id}">✅ อนุมัติ</button>
                        <button class="btn-action btn-red btn-reject" data-reject="${h.id}">❌ ไม่อนุมัติ</button>
                    </td>
                </tr>`;
            }).join('');

            bindThumbnails(tbody);

            tbody.querySelectorAll('[data-approve]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await authFetch(`${API_BASE}/history/${btn.dataset.approve}/approve`, { method: 'PUT' });
                        showToast('อนุมัติสำเร็จ: ลูกค้าได้คะแนนสะสม 1 สิทธิ์', 'success');
                    } catch (err) {
                        showToast('เกิดข้อผิดพลาดในการอนุมัติ', 'error');
                    }
                    renderApproval();
                    renderHistory();
                    renderCashbackSummary();
                    updateStats();
                });
            });

            tbody.querySelectorAll('[data-reject]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    try {
                        await authFetch(`${API_BASE}/history/${btn.dataset.reject}/reject`, { method: 'PUT' });
                        showToast('ปฏิเสธรายการเรียบร้อย', 'info');
                    } catch (err) {
                        showToast('เกิดข้อผิดพลาดในการปฏิเสธ', 'error');
                    }
                    renderApproval();
                    renderHistory();
                    updateStats();
                });
            });
        } catch (err) {
            tbody.innerHTML = '';
            noMsg.classList.remove('hidden');
        }
    }

    // --- Cashback Summary ---
    async function renderCashbackSummary() {
        try {
            const res = await fetch(`${API_BASE}/history`);
            const all = await res.json();

            const winners = all.filter(h => h.lottery_result === 'won');
            const losers = all.filter(h => h.lottery_result === 'lost');

            const totalGross = winners.reduce((sum, w) => sum + (Number(w.reward_amount) || 0), 0);
            const totalTax = totalGross * 0.07;
            const totalNet = totalGross - totalTax;
            const gvTotal = losers.length * 500;

            document.getElementById('cashback-winners').textContent = `${winners.length} คน`;
            document.getElementById('cashback-total-gross').textContent = formatCurrency(totalGross);
            document.getElementById('cashback-tax').textContent = formatCurrency(totalTax);
            document.getElementById('cashback-total-net').textContent = formatCurrency(totalNet);
            document.getElementById('cashback-gv-count').textContent = `${losers.length} คน`;
            document.getElementById('cashback-gv-total').textContent = formatCurrency(gvTotal);
        } catch (err) {
            console.error('ไม่สามารถโหลดข้อมูล Cashback', err);
        }
    }

    async function updateStats() {
        try {
            const res = await fetch(`${API_BASE}/stats`);
            const stats = await res.json();
            document.getElementById('total-users').textContent = stats.totalUsers || 0;
            document.getElementById('sold-slots').textContent = stats.soldSlots || 0;
            document.getElementById('available-slots').textContent = stats.availableSlots || 100;
            document.getElementById('pending-count').textContent = stats.pendingCount || 0;
            document.getElementById('total-transactions').textContent = stats.totalTransactions || 0;

            // Update approval tab badge
            const approvalTab = document.querySelector('.admin-tab[data-tab="approval"]');
            if (approvalTab) {
                const pending = stats.pendingCount || 0;
                let badge = approvalTab.querySelector('.tab-badge');
                if (pending > 0) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'tab-badge';
                        approvalTab.appendChild(badge);
                    }
                    badge.textContent = pending;
                } else if (badge) {
                    badge.remove();
                }
            }
        } catch (err) {
            console.error('ไม่สามารถโหลดสถิติได้', err);
        }
    }

    // --- Sold Out Controls ---
    document.getElementById('btn-add-soldout').addEventListener('click', async () => {
        const input = document.getElementById('sold-out-input');
        const num = parseInt(input.value, 10);
        if (isNaN(num) || num < 0 || num > 99) {
            alert('กรุณากรอกเลข 00-99');
            return;
        }
        await authFetch(`${API_BASE}/sold-out`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: num })
        });
        renderSoldOut();
        input.value = '';
    });

    document.getElementById('btn-remove-soldout').addEventListener('click', async () => {
        const input = document.getElementById('sold-out-input');
        const num = parseInt(input.value, 10);
        if (isNaN(num) || num < 0 || num > 99) {
            alert('กรุณากรอกเลข 00-99');
            return;
        }
        await authFetch(`${API_BASE}/sold-out/${num}`, { method: 'DELETE' });
        renderSoldOut();
        input.value = '';
    });

    // --- Announce Draw ---
    document.getElementById('btn-announce').addEventListener('click', async () => {
        const input = document.getElementById('winning-number');
        const dateSelect = document.getElementById('draw-date-select');
        const num = input.value.padStart(2, '0');
        if (!/^[0-9]{2}$/.test(num)) {
            alert('กรุณากรอกเลข 2 หลัก (00-99)');
            return;
        }
        if (!dateSelect.value) {
            alert('กรุณาเลือกงวดที่ต้องการประกาศผล');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE}/draw`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ winningNumber: num, drawDateLabel: dateSelect.value })
            });
            const result = await res.json();

            const resultDiv = document.getElementById('draw-result');
            resultDiv.classList.remove('hidden');
            document.getElementById('result-number').textContent = `🎯 เลขที่ออก: ${result.winningNumber}`;
            document.getElementById('result-draw-date').textContent = `📅 งวดวันที่ ${result.drawDateLabel}`;
            document.getElementById('result-winner').textContent =
                result.winners.length > 0
                    ? `ผู้ถูกรางวัล: ${result.winners.join(', ')}`
                    : 'ไม่มีผู้ถูกรางวัลในรอบนี้';

            if (result.winners.length > 0) {
                showToast(`🎉 มีผู้ถูกรางวัล ${result.winners.length} คน! Cashback จะถูกคำนวณอัตโนมัติ`, 'success');
            } else {
                showToast('ประกาศผลเรียบร้อย — ไม่มีผู้ถูกรางวัล (ทุกคนได้ GV 500 ฿)', 'info');
            }

            renderHistory();
            renderCashbackSummary();
        } catch (err) {
            alert('เกิดข้อผิดพลาดในการประกาศผล');
        }
        input.value = '';
    });

    // --- Initial Render ---
    renderSoldOut();
    renderHistory();
    renderApproval();
    renderCashbackSummary();
    updateStats();

    // --- Load Round Info ---
    try {
        const roundRes = await fetch(`${API_BASE}/round`);
        const round = await roundRes.json();
        const infoEl = document.getElementById('admin-round-info');
        const drawEl = document.getElementById('admin-draw-date');
        if (round.open) {
            infoEl.textContent = `รอบที่ ${round.round} — เปิดรับแจ้งใช้บริการ`;
        } else {
            infoEl.textContent = 'ปิดรับชั่วคราว — รายการที่ส่งจะยกยอดไปรอบถัดไป';
        }
        if (drawEl) drawEl.textContent = round.drawDate;

        // Populate draw period info
        const drawPeriodEl = document.getElementById('draw-period-value');
        if (drawPeriodEl && round.drawLabel) {
            drawPeriodEl.textContent = round.drawLabel;
        }

        // Populate draw date selector with all 24 draw dates
        const dateSelect = document.getElementById('draw-date-select');
        if (dateSelect && round.drawDates) {
            dateSelect.innerHTML = '<option value="">-- เลือกงวด --</option>';
            round.drawDates.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.label;
                opt.textContent = `งวด ${d.label}`;
                if (round.nextDraw && d.day === round.nextDraw.day && d.month === round.nextDraw.month) {
                    opt.selected = true;
                }
                dateSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูลรอบ', err);
    }

    // --- Guess Chart ---
    let guessChart = null;

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('chart-start-date').value = startOfMonth.toISOString().split('T')[0];
    document.getElementById('chart-end-date').value = today.toISOString().split('T')[0];

    async function loadGuessChart() {
        const startDate = document.getElementById('chart-start-date').value;
        const endDate = document.getElementById('chart-end-date').value;
        if (!startDate || !endDate) {
            alert('กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด');
            return;
        }
        if (startDate > endDate) {
            alert('วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/stats/guesses-by-number?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
            const data = await res.json();

            const noDataMsg = document.getElementById('no-chart-data');
            const summaryEl = document.getElementById('chart-summary');

            if (!data.length) {
                noDataMsg.style.display = '';
                summaryEl.style.display = 'none';
                if (guessChart) { guessChart.destroy(); guessChart = null; }
                return;
            }

            noDataMsg.style.display = 'none';
            summaryEl.style.display = '';

            const fmtDate = (d) => {
                const dt = new Date(d + 'T00:00:00');
                return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear() + 543}`;
            };
            document.getElementById('chart-range-text').textContent = `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
            const totalCount = data.reduce((sum, d) => sum + d.count, 0);
            document.getElementById('chart-total-count').textContent = totalCount;
            document.getElementById('chart-unique-numbers').textContent = data.length;

            const labels = data.map(d => String(d.number).padStart(2, '0'));
            const counts = data.map(d => d.count);
            const maxCount = Math.max(...counts);

            if (guessChart) guessChart.destroy();

            const ctx = document.getElementById('guesses-chart').getContext('2d');
            guessChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'จำนวนผู้ทาย',
                        data: counts,
                        backgroundColor: 'rgba(66, 135, 245, 0.75)',
                        borderColor: 'rgba(66, 135, 245, 1)',
                        borderWidth: 1,
                        borderRadius: 3,
                        maxBarThickness: 40
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1a1a2e',
                            titleColor: '#ffaa00',
                            bodyColor: '#eee',
                            borderColor: 'rgba(255, 170, 0, 0.3)',
                            borderWidth: 1,
                            callbacks: {
                                title: (items) => `เลข ${items[0].label}`,
                                label: (item) => `ผู้ทาย: ${item.raw} คน`
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#aaa',
                                font: { size: 11, family: 'Kanit' },
                                maxRotation: 90,
                                minRotation: 45
                            },
                            grid: { color: 'rgba(255,255,255,0.04)' }
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                color: '#aaa',
                                font: { size: 12 },
                                stepSize: 1,
                                precision: 0
                            },
                            grid: { color: 'rgba(255,255,255,0.06)' },
                            suggestedMax: maxCount + 1
                        }
                    }
                }
            });
        } catch (err) {
            console.error('ไม่สามารถโหลดข้อมูลกราฟ', err);
        }
    }

    document.getElementById('btn-load-chart').addEventListener('click', loadGuessChart);
    loadGuessChart();

    async function loadRankingResetDate() {
        const currentEl = document.getElementById('ranking-reset-current');
        const inputEl = document.getElementById('ranking-reset-date');
        if (!currentEl || !inputEl) return;
        try {
            const res = await authFetch(`${API_BASE}/staffs/reset-ranking`);
            const data = await res.json();
            if (data.reset_date) {
                inputEl.value = data.reset_date;
                currentEl.textContent = formatServiceDate(data.reset_date);
            } else {
                currentEl.textContent = 'ยังไม่ได้ตั้งค่า';
            }
        } catch (err) {
            currentEl.textContent = 'โหลดไม่สำเร็จ';
        }
    }

    // --- Staff Management ---
    async function renderStaffGrid() {
        const grid = document.getElementById('staff-grid');
        try {
            const res = await authFetch(`${API_BASE}/staffs/all`);
            const staffs = await res.json();
            if (!staffs.length) {
                grid.innerHTML = '<p class="empty-msg">ยังไม่มีพนักงาน — เพิ่มด้านบน</p>';
                return;
            }
            grid.innerHTML = staffs.map(s => {
                const avatarSrc = s.avatar_url
                    ? (s.avatar_url.startsWith('http') ? s.avatar_url : `/uploads/${encodeURIComponent(s.avatar_url)}`)
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(s.nickname || s.name)}&background=1a1a2e&color=00f0ff&size=80`;
                const statusClass = s.is_active ? 'staff-active' : 'staff-inactive';
                const statusText = s.is_active ? '✅ ใช้งาน' : '❌ ปิดใช้งาน';
                return `<div class="staff-card ${statusClass}">
                    <img class="staff-card-avatar" src="${avatarSrc}" alt="${escapeHtml(s.name)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=1a1a2e&color=00f0ff&size=80'">
                    <div class="staff-card-info">
                        <div class="staff-card-name">${escapeHtml(s.name)}</div>
                        ${s.nickname ? `<div class="staff-card-nick">${escapeHtml(s.nickname)}</div>` : ''}
                        <span class="staff-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="staff-card-actions">
                        ${s.is_active
                            ? `<button class="btn-small btn-red" data-deactivate-staff="${s.id}">ปิดใช้งาน</button>`
                            : `<button class="btn-small btn-green" data-activate-staff="${s.id}">เปิดใช้งาน</button>`
                        }
                        <button class="btn-small btn-red" data-delete-staff="${s.id}" type="button">ลบถาวร</button>
                    </div>
                </div>`;
            }).join('');

            // Bind deactivate/activate
            grid.querySelectorAll('[data-deactivate-staff]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const formData = new FormData();
                    formData.append('is_active', 'false');
                    await authFetch(`${API_BASE}/staffs/${btn.dataset.deactivateStaff}`, { method: 'PUT', body: formData });
                    showToast('ปิดใช้งานพนักงานแล้ว', 'info');
                    renderStaffGrid();
                });
            });
            grid.querySelectorAll('[data-activate-staff]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const formData = new FormData();
                    formData.append('is_active', 'true');
                    await authFetch(`${API_BASE}/staffs/${btn.dataset.activateStaff}`, { method: 'PUT', body: formData });
                    showToast('เปิดใช้งานพนักงานแล้ว', 'success');
                    renderStaffGrid();
                });
            });
            grid.querySelectorAll('[data-delete-staff]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const confirmed = window.confirm('ลบพนักงานถาวรใช่หรือไม่? รายการใช้งานของพนักงานคนนี้จะถูกลบด้วย');
                    if (!confirmed) return;
                    try {
                        await authFetch(`${API_BASE}/staffs/${btn.dataset.deleteStaff}/permanent`, { method: 'DELETE' });
                        showToast('ลบพนักงานถาวรแล้ว', 'success');
                        renderStaffGrid();
                        renderHistory();
                        renderApproval();
                    } catch (err) {
                        showToast('ไม่สามารถลบพนักงานได้', 'error');
                    }
                });
            });
        } catch (err) {
            grid.innerHTML = '<p class="empty-msg">ไม่สามารถโหลดรายชื่อพนักงานได้</p>';
        }
    }

    // Staff avatar preview
    const staffAvatarInput = document.getElementById('staff-avatar-input');
    const staffPreview = document.getElementById('staff-avatar-preview');
    const staffPreviewImg = document.getElementById('staff-preview-img');
    if (staffAvatarInput) {
        staffAvatarInput.addEventListener('change', () => {
            if (staffAvatarInput.files.length > 0) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    staffPreviewImg.src = e.target.result;
                    staffPreview.hidden = false;
                };
                reader.readAsDataURL(staffAvatarInput.files[0]);
            }
        });
    }
    const btnRemoveStaffImg = document.getElementById('btn-remove-staff-img');
    if (btnRemoveStaffImg) {
        btnRemoveStaffImg.addEventListener('click', () => {
            staffAvatarInput.value = '';
            staffPreview.hidden = true;
        });
    }

    // Add staff
    document.getElementById('btn-add-staff').addEventListener('click', async () => {
        const nameInput = document.getElementById('staff-name-input');
        const nickInput = document.getElementById('staff-nickname-input');
        const name = nameInput.value.trim();
        if (!name) { showToast('กรุณากรอกชื่อพนักงาน', 'error'); return; }

        const formData = new FormData();
        formData.append('name', name);
        if (nickInput.value.trim()) formData.append('nickname', nickInput.value.trim());
        if (staffAvatarInput.files.length > 0) formData.append('avatar', staffAvatarInput.files[0]);

        try {
            const res = await authFetch(`${API_BASE}/staffs`, { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(`เพิ่มพนักงาน "${name}" สำเร็จ`, 'success');
                nameInput.value = '';
                nickInput.value = '';
                staffAvatarInput.value = '';
                staffPreview.hidden = true;
                renderStaffGrid();
            } else {
                showToast(data.error || 'ไม่สามารถเพิ่มพนักงานได้', 'error');
            }
        } catch (err) {
            showToast('เกิดข้อผิดพลาดในการเพิ่มพนักงาน', 'error');
        }
    });

    const btnSaveRankingReset = document.getElementById('btn-save-ranking-reset');
    if (btnSaveRankingReset) {
        btnSaveRankingReset.addEventListener('click', async () => {
            const inputEl = document.getElementById('ranking-reset-date');
            const date = inputEl?.value;
            if (!date) {
                showToast('กรุณาเลือกวันที่รีอันดับ', 'error');
                return;
            }
            try {
                const res = await authFetch(`${API_BASE}/staffs/reset-ranking`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'save-failed');
                showToast(`ตั้งวันที่รีอันดับเป็น ${formatServiceDate(date)} แล้ว`, 'success');
                loadRankingResetDate();
            } catch (err) {
                showToast('ไม่สามารถบันทึกวันที่รีอันดับได้', 'error');
            }
        });
    }

    renderStaffGrid();
    loadRankingResetDate();

    // --- Logout ---
    document.getElementById('btn-logout').addEventListener('click', async () => {
        try {
            await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: authHeaders()
            });
        } catch { /* ignore */ }
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_user');
        window.location.href = 'admin-login.html';
    });
});

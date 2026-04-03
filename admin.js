const API_BASE = '/api';

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
            return `<img src="${src}" class="admin-thumb" data-fullimg="${src}" alt="หลักฐาน">`;
        }
        return '<span class="text-muted">ไม่มีรูป</span>';
    }

    function bindThumbnails(container) {
        container.querySelectorAll('.admin-thumb').forEach(img => {
            img.addEventListener('click', () => openImageModal(img.dataset.fullimg));
        });
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

    async function renderPermissions() {
        const tbody = document.getElementById('permissions-body');
        const noMsg = document.getElementById('no-permissions');
        try {
            const res = await fetch(`${API_BASE}/permissions`);
            const permissions = await res.json();

            if (permissions.length === 0) {
                tbody.innerHTML = '';
                noMsg.classList.remove('hidden');
                return;
            }

            noMsg.classList.add('hidden');
            tbody.innerHTML = permissions.map((p, i) => {
                const statusClass = p.revoked ? 'badge-revoked' : (p.used >= p.slots ? 'badge-used' : 'badge-active');
                const statusText = p.revoked ? 'ถูกเพิกถอน' : (p.used >= p.slots ? 'ใช้ครบแล้ว' : 'ใช้งานได้');
                return `<tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(p.name)}</td>
                    <td>${p.slots}</td>
                    <td>${p.used}</td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
                    <td>
                        ${!p.revoked ? `<button class="btn-small" data-revoke="${p.id}">เพิกถอน</button>` : '—'}
                    </td>
                </tr>`;
            }).join('');

            tbody.querySelectorAll('[data-revoke]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await authFetch(`${API_BASE}/permissions/${btn.dataset.revoke}/revoke`, { method: 'PUT' });
                    renderPermissions();
                    updateStats();
                });
            });
        } catch (err) {
            tbody.innerHTML = '';
            noMsg.classList.remove('hidden');
        }
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
                let statusClass, statusText;
                if (h.approved === 'rejected') {
                    statusClass = 'badge-revoked';
                    statusText = 'ไม่อนุมัติ';
                } else if (h.approved === 'pending') {
                    statusClass = 'badge-pending';
                    statusText = 'รออนุมัติ';
                } else if (h.won === true) {
                    statusClass = 'badge-active';
                    statusText = 'ถูกรางวัล!';
                } else if (h.won === false) {
                    statusClass = 'badge-revoked';
                    statusText = 'ไม่ถูก';
                } else {
                    statusClass = 'badge-used';
                    statusText = 'อนุมัติแล้ว - รอผล';
                }
                const dateStr = new Date(h.date).toLocaleString('th-TH');
                return `<tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(h.name)}</td>
                    <td>${h.number}</td>
                    <td>${imageCell(h.image_path)}</td>
                    <td>${dateStr}</td>
                    <td><span class="badge ${statusClass}">${statusText}</span></td>
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
                const dateStr = new Date(h.date).toLocaleString('th-TH');
                return `<tr>
                    <td>${i + 1}</td>
                    <td>${escapeHtml(h.name)}</td>
                    <td>${h.number}</td>
                    <td>${imageCell(h.image_path)}</td>
                    <td>${dateStr}</td>
                    <td>
                        <button class="btn-action btn-green btn-approve" data-approve="${h.id}">✅ อนุมัติ</button>
                        <button class="btn-action btn-red btn-reject" data-reject="${h.id}">❌ ไม่อนุมัติ</button>
                    </td>
                </tr>`;
            }).join('');

            bindThumbnails(tbody);

            tbody.querySelectorAll('[data-approve]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await authFetch(`${API_BASE}/history/${btn.dataset.approve}/approve`, { method: 'PUT' });
                    renderApproval();
                    renderHistory();
                    updateStats();
                });
            });

            tbody.querySelectorAll('[data-reject]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await authFetch(`${API_BASE}/history/${btn.dataset.reject}/reject`, { method: 'PUT' });
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

    async function updateStats() {
        try {
            const res = await fetch(`${API_BASE}/stats`);
            const stats = await res.json();
            document.getElementById('total-users').textContent = stats.totalUsers;
            document.getElementById('sold-slots').textContent = stats.soldSlots;
            document.getElementById('available-slots').textContent = stats.availableSlots;
            document.getElementById('pending-count').textContent = stats.pendingCount || 0;
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

    // --- Grant Permission ---
    document.getElementById('grant-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('grant-username');
        const slotsSelect = document.getElementById('grant-slots');
        const name = nameInput.value.trim();
        if (!name) return;

        await authFetch(`${API_BASE}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slots: parseInt(slotsSelect.value, 10) })
        });
        renderPermissions();
        updateStats();
        nameInput.value = '';
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

            renderHistory();
        } catch (err) {
            alert('เกิดข้อผิดพลาดในการประกาศผล');
        }
        input.value = '';
    });

    // --- Initial Render ---
    renderSoldOut();
    renderPermissions();
    renderHistory();
    renderApproval();
    updateStats();

    // --- Load Round Info ---
    try {
        const roundRes = await fetch(`${API_BASE}/round`);
        const round = await roundRes.json();
        const infoEl = document.getElementById('admin-round-info');
        const drawEl = document.getElementById('admin-draw-date');
        if (round.open) {
            infoEl.textContent = `รอบที่ ${round.round} — เปิดรับทายผล`;
        } else {
            infoEl.textContent = 'ปิดรับทายผลชั่วคราว — สิทธิ์ที่ส่งจะยกยอดไปรอบถัดไป';
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
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentDay = now.getDate();
            round.drawDates.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.label;
                opt.textContent = `งวด ${d.label}`;
                // Auto-select the upcoming draw date
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

    // Set default date range: start of current month to today
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

            // Format date range for display
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
    // Auto-load chart on page load
    loadGuessChart();

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

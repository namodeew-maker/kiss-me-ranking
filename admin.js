const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';
const API_ROOT = API_BASE.replace(/\/api$/, '');
const currentAdminPath = (window.location.pathname || '/').replace(/\/+$/, '') || '/';

function deriveAdminPanelPath(pathname) {
    if (pathname.endsWith('/admin.html')) {
        return `${pathname.slice(0, -'/admin.html'.length) || ''}/admin/panel`;
    }
    if (pathname.endsWith('/panel/index.html')) {
        return pathname.slice(0, -'/index.html'.length);
    }
    if (pathname.endsWith('/panel')) {
        return pathname;
    }
    return '/admin/panel';
}

const ADMIN_PANEL_PATH = deriveAdminPanelPath(currentAdminPath);
const ADMIN_LOGIN_PATH = ADMIN_PANEL_PATH.endsWith('/panel')
    ? (ADMIN_PANEL_PATH.slice(0, -'/panel'.length) || '/admin')
    : '/admin';

// --- Auth Guard ---
const adminToken = sessionStorage.getItem('admin_token');
if (!adminToken) {
    window.location.href = ADMIN_LOGIN_PATH;
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
        sessionStorage.removeItem('admin_role');
        window.location.href = ADMIN_LOGIN_PATH;
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

const ADMIN_BUTTON_TOOLTIPS = [
    ['.btn-back[href]', 'กลับไปหน้าเว็บไซต์หลักของ Kiss Me Ranking'],
    ['#btn-logout', 'ออกจากระบบผู้ดูแลในเครื่องนี้และล้าง session ปัจจุบัน'],
    ['.admin-tab[data-tab="overview"]', 'เปิดภาพรวมรอบปัจจุบัน สถิติ และลำดับงานตรวจสอบหลัก'],
    ['.admin-tab[data-tab="users"]', 'ค้นหา ดูรายละเอียด และแก้ไขข้อมูลผู้ใช้ในระบบ'],
    ['.admin-tab[data-tab="staff"]', 'เพิ่ม แก้ไข และติดตามข้อมูลพนักงานรวมถึงอันดับที่เกี่ยวข้อง'],
    ['.admin-tab[data-tab="approval"]', 'เปิดคิวรายการที่รออนุมัติหรือปฏิเสธจากผู้ดูแล'],
    ['.admin-tab[data-tab="prediction-status"]', 'ดูสถานะการทายผลทั้งหมดและกรองตามขั้นตอนของรายการ'],
    ['.admin-tab[data-tab="lottery"]', 'จัดการเลขปิด รอบแต้มการทาย และประกาศผลหวย'],
    ['.admin-tab[data-tab="settings"]', 'จัดการผู้ดูแล ระบบ Excel และงานดูแลระบบเพิ่มเติม'],
    ['#btn-refresh-rewards', 'ดึงข้อมูลสิทธิ์รางวัลและประวัติการใช้สิทธิ์ล่าสุดเข้าหน้านี้อีกครั้ง'],
    ['#btn-claim-remaining', 'ใส่ยอดคงเหลือของสิทธิ์ที่เลือกลงฟอร์มอัตโนมัติ'],
    ['#btn-save-reward-claim', 'บันทึกการใช้สิทธิ์ Cashback หรือ Gift Voucher ให้ผู้ใช้ที่เลือก'],
    ['#btn-clear-reward-claim', 'ล้างการเลือกรายการสิทธิ์และค่าในฟอร์มบันทึกการใช้สิทธิ์'],
    ['#btn-refresh-storage', 'รีเฟรชสถานะไฟล์และการเชื่อมต่อพื้นที่จัดเก็บ'],
    ['#btn-migrate-storage', 'ย้ายไฟล์อัปโหลดเดิมขึ้น Cloudflare R2 ตามการตั้งค่าปัจจุบัน'],
    ['#btn-user-search', 'ค้นหาผู้ใช้ตามคำค้นและตัวกรองที่เลือก'],
    ['#btn-user-refresh', 'โหลดรายชื่อผู้ใช้ใหม่และรีเซ็ตผลลัพธ์ล่าสุด'],
    ['#btn-user-clear-filters', 'ล้างตัวกรองผู้ใช้ทั้งหมดแล้วโหลดรายชื่อใหม่'],
    ['#btn-save-customer-rank-reset', 'บันทึกวันที่รีแรงค์ลูกค้าเพื่อเริ่มนับ Rank EXP รอบใหม่'],
    ['#btn-user-prev', 'ย้อนกลับไปหน้ารายชื่อผู้ใช้ก่อนหน้า'],
    ['#btn-user-next', 'ไปหน้ารายชื่อผู้ใช้ถัดไป'],
    ['.staff-avatar-btn', 'เลือกรูปโปรไฟล์สำหรับพนักงานที่จะเพิ่มใหม่'],
    ['#btn-add-staff', 'บันทึกรายชื่อพนักงานใหม่เข้าสู่ระบบ'],
    ['#btn-remove-staff-img', 'ลบรูปที่เลือกออกจากฟอร์มเพิ่มพนักงาน'],
    ['#btn-refresh-staff-ranking', 'ดึงอันดับพนักงานล่าสุดมาแสดงใหม่'],
    ['#btn-refresh-staff-usage-ranking', 'ดึงสถิติยอดแจ้งใช้บริการของพนักงานล่าสุด'],
    ['#btn-save-ranking-reset', 'บันทึกวันที่รีอันดับพนักงานสำหรับเริ่มรอบใหม่'],
    ['.admin-status-filter-btn[data-filter="all"]', 'แสดงรายการสถานะการทายผลทั้งหมด'],
    ['.admin-status-filter-btn[data-filter="pending"]', 'กรองเฉพาะรายการที่ยังรออนุมัติ'],
    ['.admin-status-filter-btn[data-filter="approved"]', 'กรองเฉพาะรายการที่อนุมัติแล้วและรอผล'],
    ['.admin-status-filter-btn[data-filter="rejected"]', 'กรองเฉพาะรายการที่ไม่อนุมัติ'],
    ['.admin-status-filter-btn[data-filter="decided"]', 'กรองเฉพาะรายการที่ประกาศผลแล้ว'],
    ['#btn-add-soldout', 'เพิ่มเลขที่เลือกเข้าในรายการปิดรับทาย'],
    ['#btn-remove-soldout', 'นำเลขที่เลือกออกจากรายการปิดรับทาย'],
    ['#btn-save-guess-points-cycle', 'บันทึกรอบวันสำหรับคำนวณแต้มการทายเลข'],
    ['#btn-clear-guess-points-cycle', 'ยกเลิกรอบวันรีเซ็ตพ้อยและกลับไปนับพ้อยทายเลขทั้งหมด'],
    ['#btn-recheck-guess-points', 'สั่งระบบตรวจสอบและคำนวณแต้มทายเลขใหม่อีกครั้ง'],
    ['#btn-load-chart', 'โหลดกราฟสรุปข้อมูลการทายเลขตามช่วงหรือเงื่อนไขที่เลือก'],
    ['#btn-announce', 'ประกาศผลเลขที่ออกให้กับงวดที่เลือกและอัปเดตรายการที่เกี่ยวข้อง'],
    ['#btn-refresh-admin-accounts', 'รีเฟรชรายชื่อบัญชีผู้ดูแลล่าสุดจากระบบ'],
    ['#btn-save-admin-account', 'สร้างบัญชีผู้ดูแลใหม่หรือบันทึกการแก้ไขบัญชีที่เลือก'],
    ['#btn-reset-admin-password', 'รีเซ็ตรหัสผ่านของบัญชีผู้ดูแลที่เลือก'],
    ['#btn-delete-admin-account', 'ลบบัญชีผู้ดูแลที่เลือกออกจากระบบถาวร'],
    ['.excel-admin-panel a[href="/EXCEL_ADMIN_GUIDE.md"]', 'เปิดคู่มือการใช้งานระบบ Excel ในแท็บใหม่'],
    ['#btn-export-csv', 'ส่งออกข้อมูลชุดที่เลือกเป็นไฟล์ CSV'],
    ['#btn-export-xlsx', 'ส่งออกข้อมูลชุดที่เลือกเป็นไฟล์ Excel แบบอ่านอย่างเดียว'],
    ['#btn-download-editable-xlsx', 'ดาวน์โหลดไฟล์ Excel ที่แก้ไขได้เพื่อนำไปปรับข้อมูลภายนอกระบบ'],
    ['#btn-import-excel', 'อัปโหลดไฟล์ Excel ที่แก้ไขแล้วกลับเข้าระบบเพื่ออัปเดตข้อมูล'],
    ['#btn-refresh-import-logs', 'โหลดประวัติการ import Excel ล่าสุดอีกครั้ง'],
    ['#img-modal-close', 'ปิดหน้าต่างแสดงรูปภาพ'],
    ['#user-detail-modal-close', 'ปิดหน้าต่างรายละเอียดผู้ใช้'],
    ['#btn-save-user', 'บันทึกข้อมูลผู้ใช้ที่แก้ไขในหน้ารายละเอียด'],
    ['#btn-delete-user', 'ลบผู้ใช้นี้ออกจากระบบอย่างถาวร'],
    ['#btn-user-claim-remaining', 'ใส่ยอดคงเหลือของสิทธิ์ที่เลือกลงฟอร์มผู้ใช้อัตโนมัติ'],
    ['#btn-save-user-reward-claim', 'บันทึกการใช้สิทธิ์ของผู้ใช้จากหน้ารายละเอียด'],
    ['#btn-clear-user-reward-claim', 'ล้างค่าฟอร์มการใช้สิทธิ์ในหน้ารายละเอียดผู้ใช้'],
    ['#btn-self-password', 'เปิดฟอร์มเปลี่ยนรหัสผ่านของบัญชีผู้ดูแลที่ล็อกอินอยู่'],
    ['#self-pwd-save', 'บันทึกรหัสผ่านใหม่ของบัญชีผู้ดูแลนี้'],
    ['#self-pwd-cancel', 'ปิดฟอร์มเปลี่ยนรหัสผ่านโดยไม่บันทึก'],
    ['[data-view-user]', 'เปิดหน้าต่างรายละเอียดของผู้ใช้รายการนี้'],
    ['[data-delete-reward-claim]', 'ลบประวัติการใช้สิทธิ์รายการนี้ออกจากระบบ'],
    ['[data-select-user-reward]', 'เลือกสิทธิ์รางวัลรายการนี้ไปใส่ในฟอร์มด้านล่าง'],
    ['[data-select-reward]', 'โหลดรายการสิทธิ์นี้เข้าแบบฟอร์มบันทึกการใช้สิทธิ์'],
    ['[data-delete-history]', 'ลบประวัติรายการนี้ออกจากระบบถาวร'],
    ['.btn-approve[data-approve]', 'อนุมัติรายการนี้เพื่อให้ระบบนับแต้มและอัปเดตสถานะ'],
    ['.btn-reject[data-reject]', 'ปฏิเสธรายการนี้และบันทึกว่าไม่ผ่านการตรวจสอบ'],
    ['.staff-ranking-avatar-btn', 'คลิกเพื่อดูรูปโปรไฟล์พนักงานขนาดใหญ่'],
    ['.staff-card-avatar-btn', 'คลิกเพื่อดูรูปโปรไฟล์พนักงานขนาดใหญ่'],
    ['#staff-edit-save', 'บันทึกการแก้ไขข้อมูลพนักงานรายการนี้'],
    ['#staff-edit-cancel', 'ปิดหน้าต่างแก้ไขพนักงานโดยไม่บันทึก'],
    ['[data-edit-staff]', 'เปิดฟอร์มแก้ไขชื่อเล่น ชื่อจริง หรือรูปของพนักงาน'],
    ['[data-deactivate-staff]', 'ปิดใช้งานพนักงานชั่วคราวแต่ยังเก็บข้อมูลไว้'],
    ['[data-activate-staff]', 'เปิดใช้งานพนักงานรายการนี้กลับมาแสดงผลอีกครั้ง'],
    ['[data-delete-staff]', 'ลบข้อมูลพนักงานรายการนี้ออกจากระบบถาวร'],
    ['.admin-account-item', 'เลือกบัญชีผู้ดูแลนี้เพื่อแก้ไขข้อมูลหรือรีเซ็ตรหัสผ่าน']
];

function setAdminTooltip(element, message) {
    if (!element || !message) return;
    element.dataset.adminTooltip = message;
    element.title = message;
    element.classList.add('has-admin-tooltip');
    if (!element.getAttribute('aria-description')) {
        element.setAttribute('aria-description', message);
    }
}

function applyAdminButtonTooltips(root = document) {
    const applyToElement = (element, message) => {
        if (!element || !(element instanceof Element)) return;
        setAdminTooltip(element, message);
    };

    ADMIN_BUTTON_TOOLTIPS.forEach(([selector, message]) => {
        if (root instanceof Element && root.matches(selector)) {
            applyToElement(root, message);
        }
        root.querySelectorAll?.(selector).forEach((element) => applyToElement(element, message));
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    let currentAdminSession = {
        username: sessionStorage.getItem('admin_user') || '',
        role: sessionStorage.getItem('admin_role') || 'admin',
        userId: null
    };

    // Verify token is still valid
    try {
        const verifyRes = await fetch(`${API_BASE}/auth/verify`, { headers: authHeaders() });
        if (!verifyRes.ok) {
            sessionStorage.removeItem('admin_token');
            sessionStorage.removeItem('admin_user');
            sessionStorage.removeItem('admin_role');
            window.location.href = ADMIN_LOGIN_PATH;
            return;
        }
        const verifyData = await verifyRes.json();
        currentAdminSession = {
            username: verifyData.username || currentAdminSession.username,
            role: verifyData.role || currentAdminSession.role || 'admin',
            userId: verifyData.user_id || null
        };
        sessionStorage.setItem('admin_user', currentAdminSession.username);
        sessionStorage.setItem('admin_role', currentAdminSession.role);
    } catch {
        sessionStorage.removeItem('admin_token');
        sessionStorage.removeItem('admin_user');
        sessionStorage.removeItem('admin_role');
        window.location.href = ADMIN_LOGIN_PATH;
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

    // --- Role-based UI restrictions ---
    const isEditor = currentAdminSession.role === 'editor';

    // Show role badge in header
    const headerEl = document.querySelector('.admin-header > div');
    if (headerEl) {
        const roleBadge = document.createElement('span');
        roleBadge.style.cssText = 'display:inline-block;padding:2px 10px;border-radius:8px;font-size:13px;margin-left:10px;font-weight:600;';
        if (isEditor) {
            roleBadge.style.background = '#2563eb';
            roleBadge.style.color = '#fff';
            roleBadge.textContent = `🛡️ Editor: ${currentAdminSession.username}`;
        } else {
            roleBadge.style.background = '#dc2626';
            roleBadge.style.color = '#fff';
            roleBadge.textContent = `👑 Admin: ${currentAdminSession.username}`;
        }
        headerEl.appendChild(roleBadge);
    }

    if (isEditor) {
        // Hide admin-only panels
        const adminOnlyPanels = [
            'admin-account-panel',
            'ranking-reset-panel',
            'excel-admin-panel'
        ];
        adminOnlyPanels.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Hide admin-only buttons
        const adminOnlyButtons = [
            'btn-delete-user'
        ];
        adminOnlyButtons.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Hide admin-only tabs (lottery tab for editing sold-out etc.)
        const adminOnlyTabs = ['settings'];
        adminOnlyTabs.forEach(tabName => {
            const tab = document.querySelector(`.admin-tab[data-tab="${tabName}"]`);
            if (tab) tab.style.display = 'none';
        });

        // Add self-password change button in header area
        const headerInfo = document.querySelector('.admin-header-info');
        if (headerInfo) {
            const selfPwdBtn = document.createElement('button');
            selfPwdBtn.id = 'btn-self-password';
            selfPwdBtn.className = 'btn-blue';
            selfPwdBtn.textContent = '🔑 เปลี่ยนรหัสผ่าน';
            selfPwdBtn.style.marginLeft = '10px';
            selfPwdBtn.addEventListener('click', () => openSelfPasswordModal());
            headerInfo.appendChild(selfPwdBtn);
        }
    }

    // --- Self password change modal (for editor) ---
    function openSelfPasswordModal() {
        let modal = document.getElementById('self-pwd-modal');
        if (modal) { modal.style.display = 'flex'; return; }

        modal = document.createElement('div');
        modal.id = 'self-pwd-modal';
        modal.className = 'staff-edit-modal';
        modal.innerHTML = `
            <div class="staff-edit-modal-content" style="max-width:400px;">
                <h3 style="margin-bottom:16px;color:#fff;">🔑 เปลี่ยนรหัสผ่าน</h3>
                <label style="color:#ccc;font-size:14px;">รหัสผ่านปัจจุบัน</label>
                <input type="password" id="self-pwd-current" class="staff-edit-input" placeholder="รหัสผ่านปัจจุบัน" />
                <label style="color:#ccc;font-size:14px;margin-top:8px;">รหัสผ่านใหม่</label>
                <input type="password" id="self-pwd-new" class="staff-edit-input" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" />
                <label style="color:#ccc;font-size:14px;margin-top:8px;">ยืนยันรหัสผ่านใหม่</label>
                <input type="password" id="self-pwd-confirm" class="staff-edit-input" placeholder="ยืนยันรหัสผ่านใหม่" />
                <div class="staff-edit-actions" style="margin-top:16px;">
                    <button class="btn-blue" id="self-pwd-save">💾 บันทึก</button>
                    <button class="btn-outline" id="self-pwd-cancel">ยกเลิก</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'flex';

        document.getElementById('self-pwd-cancel').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
        document.getElementById('self-pwd-save').addEventListener('click', async () => {
            const currentPwd = document.getElementById('self-pwd-current').value;
            const newPwd = document.getElementById('self-pwd-new').value;
            const confirmPwd = document.getElementById('self-pwd-confirm').value;

            if (!currentPwd || !newPwd) {
                return showToast('กรุณากรอกรหัสผ่านให้ครบ', 'error');
            }
            if (newPwd.length < 8) {
                return showToast('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            }
            if (newPwd !== confirmPwd) {
                return showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error');
            }
            try {
                const res = await fetch(`${API_BASE}/admin/me/password`, {
                    method: 'POST',
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
                showToast('เปลี่ยนรหัสผ่านสำเร็จ ✅', 'success');
                modal.style.display = 'none';
                document.getElementById('self-pwd-current').value = '';
                document.getElementById('self-pwd-new').value = '';
                document.getElementById('self-pwd-confirm').value = '';
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    let tooltipRefreshQueued = false;
    function scheduleAdminTooltipRefresh() {
        if (tooltipRefreshQueued) return;
        tooltipRefreshQueued = true;
        requestAnimationFrame(() => {
            tooltipRefreshQueued = false;
            applyAdminButtonTooltips(document);
        });
    }

    applyAdminButtonTooltips(document);
    const adminTooltipObserver = new MutationObserver(() => {
        scheduleAdminTooltipRefresh();
    });
    adminTooltipObserver.observe(document.body, { childList: true, subtree: true });

    function formatBreakableIdentifier(value) {
        const normalized = String(value || '').trim();
        if (!normalized) return '—';

        return normalized
            .split(/([\-_.:@/])/g)
            .map((part) => (/^[\-_.:@/]$/.test(part) ? `${escapeHtml(part)}<wbr>` : escapeHtml(part)))
            .join('');
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
        if (!src) return;
        imgModalImg.src = src;
        imgModal.hidden = false;
    }

    function imageCell(imagePath) {
        if (imagePath) {
            // Support both full URL (R2) and local path
            const src = resolveAssetUrl(imagePath);
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

    function formatClaimModeLabel(mode) {
        return mode === 'withdraw' ? 'ถอนเงินสด หัก 10%' : 'ใช้ซ้ำเต็มจำนวน';
    }

    function formatCashbackBalanceText(amount, netAmount) {
        return `ยอดคงเหลือ ${formatCurrency(amount)} • ถอนได้สุทธิ ${formatCurrency(netAmount)}`;
    }

    function parseFlexibleDate(value) {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
        const date = isDateOnly ? new Date(`${raw}T00:00:00`) : new Date(raw);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDateDDMMYYYY(value) {
        const date = parseFlexibleDate(value);
        if (!date) return value || '—';
        return [
            String(date.getDate()).padStart(2, '0'),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getFullYear()).padStart(4, '0')
        ].join('/');
    }

    function formatServiceDate(value) {
        if (!value) return '—';
        return formatDateDDMMYYYY(value);
    }

    function getTodayDateOnly() {
        return new Date().toISOString().split('T')[0];
    }

    function isFutureDateOnly(value) {
        if (!value) return false;
        const raw = String(value).trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw > getTodayDateOnly();
    }

    function getDisplayedRankApprovedCount(source) {
        if (!source) return 0;
        const resetDate = source.rank_reset_date || null;
        if (isFutureDateOnly(resetDate)) {
            return Number(
                source.approved_count
                ?? source.lifetime_approved
                ?? source.total_lifetime_approved
                ?? source.rank_approved_count
                ?? 0
            );
        }
        return Number(source.rank_approved_count ?? source.approved_count ?? source.lifetime_approved ?? 0);
    }

    function formatDateTime(value) {
        if (!value) return '—';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString('th-TH');
    }

    function formatShortDateTime(value) {
        if (!value) return '—';
        const date = parseFlexibleDate(value);
        if (!date) return value;
        return `${formatDateDDMMYYYY(value)} ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
    }

    function renderHistoryDateCell(value) {
        if (!value) {
            return '<div class="history-date-stack"><span class="history-date-main">—</span></div>';
        }
        const date = parseFlexibleDate(value);
        if (!date) {
            return `<div class="history-date-stack"><span class="history-date-main">${escapeHtml(String(value))}</span></div>`;
        }
        return `
            <div class="history-date-stack">
                <span class="history-date-main">${escapeHtml(formatDateDDMMYYYY(value))}</span>
                <span class="history-date-sub">${escapeHtml(date.toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit'
                }))} น.</span>
            </div>
        `;
    }

    function renderHistoryServiceDateCell(value) {
        return `
            <div class="history-date-stack history-service-date-stack">
                <span class="history-date-main">${escapeHtml(formatServiceDate(value))}</span>
            </div>
        `;
    }

    function renderUserRewardBalanceCell(user) {
        const cashbackRemaining = Number(user.cashback_remaining || 0);
        const gvRemaining = Number(user.gv_remaining || 0);
        return `
            <div class="user-reward-balance-cell">
                <div><strong>Cashback</strong> ${formatCurrency(cashbackRemaining)}</div>
                <div><strong>GV</strong> ${formatCurrency(gvRemaining)}</div>
            </div>
        `;
    }

    function formatPlatformBadge(platform) {
        const normalized = String(platform || 'line').toLowerCase();
        if (normalized === 'telegram') {
            return `<span class="platform-badge platform-badge-telegram">TELEGRAM</span>`;
        }
        return `<span class="platform-badge platform-badge-line">LINE</span>`;
    }

    function userAvatarSrc(user) {
        if (user.picture_url) return resolveAssetUrl(user.picture_url);
        const name = user.display_name || user.platform_id || 'User';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a2e&color=ff3c3c&size=96`;
    }

    const CUSTOMER_RANK_TIERS = [
        { name: 'Unranked', color: '#888888', minApproved: 0 },
        { name: 'Bronze', color: '#cd7f32', minApproved: 3 },
        { name: 'Silver', color: '#c0c0c0', minApproved: 6 },
        { name: 'Gold', color: '#ffd700', minApproved: 12 },
        { name: 'Platinum', color: '#00f0ff', minApproved: 24 },
        { name: 'Diamond', color: '#b44aff', minApproved: 48 },
        { name: 'Master', color: '#ff3c3c', minApproved: 90 },
        { name: 'Grandmaster', color: '#ffd166', minApproved: 150 },
    ];

    function getCustomerRankInfo(totalApproved) {
        const approvedCount = Number(totalApproved || 0);
        let rank = CUSTOMER_RANK_TIERS[0];
        for (let i = CUSTOMER_RANK_TIERS.length - 1; i >= 0; i--) {
            if (approvedCount >= CUSTOMER_RANK_TIERS[i].minApproved) {
                rank = CUSTOMER_RANK_TIERS[i];
                break;
            }
        }
        return rank;
    }

    function renderUserRankCell(user) {
        const approvedForRank = getDisplayedRankApprovedCount(user);
        const rank = getCustomerRankInfo(approvedForRank);
        return `
            <div class="user-rank-cell" style="--user-rank-color:${rank.color}">
                <strong>${escapeHtml(rank.name)}</strong>
                <span>${approvedForRank.toLocaleString('th-TH')} EXP</span>
            </div>
        `;
    }

    function renderUserCompactSummary(user) {
        const currentRoundPoints = Number(user.current_round_points || 0);
        const guessCredits = Math.max(0, Math.floor(currentRoundPoints / 5));
        const totalPoints = Number(user.total_points || 0);
        const approvedForRank = getDisplayedRankApprovedCount(user);
        const rank = getCustomerRankInfo(approvedForRank);
        const cashbackRemaining = Number(user.cashback_remaining || 0);
        const gvRemaining = Number(user.gv_remaining || 0);
        const lastActive = formatShortDateTime(user.last_activity_at || user.created_at);

        return `
            <div class="user-compact-summary">
                <div class="user-compact-chip-row">
                    ${formatPlatformBadge(user.platform)}
                    <span class="user-compact-chip">${Number(user.transaction_count || 0).toLocaleString('th-TH')} รายการ</span>
                    <span class="user-compact-chip">ล่าสุด ${escapeHtml(lastActive)}</span>
                </div>
                <div class="user-compact-field">
                    <span class="user-compact-label">ID</span>
                    <code class="user-platform-id-text user-platform-id-text-compact">${formatBreakableIdentifier(user.platform_id)}</code>
                </div>
                <div class="user-compact-grid">
                    <div class="user-compact-field">
                        <span class="user-compact-label">พ้อยรอบนี้</span>
                        <strong>${currentRoundPoints.toLocaleString('th-TH')} แต้ม</strong>
                        <span>${guessCredits.toLocaleString('th-TH')} สิทธิ์ทาย</span>
                    </div>
                    <div class="user-compact-field">
                        <span class="user-compact-label">แรงค์ / EXP</span>
                        <strong style="color:${rank.color}">${escapeHtml(rank.name)}</strong>
                        <span>${approvedForRank.toLocaleString('th-TH')} EXP</span>
                    </div>
                    <div class="user-compact-field">
                        <span class="user-compact-label">พ้อยรวม</span>
                        <strong>${totalPoints.toLocaleString('th-TH')}</strong>
                        <span>สะสมทั้งหมด</span>
                    </div>
                    <div class="user-compact-field">
                        <span class="user-compact-label">Cashback / GV</span>
                        <strong>${formatCurrency(cashbackRemaining)}</strong>
                        <span>GV ${formatCurrency(gvRemaining)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function formatStaffScore(value) {
        const score = Number(value || 0);
        if (!score) return '—';
        return score.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    }

    function renderStaffScoreChips(staff) {
        return `
            <div class="staff-ranking-score-chips">
                <span>เฉลี่ย ${formatStaffScore(staff.avg_score)}</span>
                <span>บริการ ${formatStaffScore(staff.avg_service_score)}</span>
                <span>หน้าตา ${formatStaffScore(staff.avg_looks_score)}</span>
                <span>คุ้มค่า ${formatStaffScore(staff.avg_value_score)}</span>
            </div>
        `;
    }

    function staffAvatarSrc(staff) {
        const displayName = staff.nickname || staff.name || 'Staff';
        if (staff.avatar_url) return resolveAssetUrl(staff.avatar_url);
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96`;
    }

    function resolveAssetUrl(value) {
        if (!value) return '';
        const normalized = String(value).trim();
        if (!normalized) return '';

        if (/^https?:\/\//i.test(normalized)) {
            try {
                const url = new URL(normalized);
                const uploadIndex = url.pathname.indexOf('/uploads/');
                if (uploadIndex >= 0) {
                    return `${API_ROOT}${url.pathname.slice(uploadIndex)}`;
                }
            } catch {
                return normalized;
            }
            return normalized;
        }

        if (normalized.startsWith('/uploads/')) {
            return `${API_ROOT}${normalized}`;
        }

        if (normalized.startsWith('uploads/')) {
            return `${API_ROOT}/${normalized}`;
        }

        const embeddedUploadIndex = normalized.indexOf('/uploads/');
        if (embeddedUploadIndex >= 0) {
            return `${API_ROOT}${normalized.slice(embeddedUploadIndex)}`;
        }

        return `${API_ROOT}/uploads/${encodeURIComponent(normalized)}`;
    }

    const storageMode = document.getElementById('storage-mode');
    const storagePublicUrl = document.getElementById('storage-public-url');
    const storageLocalExisting = document.getElementById('storage-local-existing');
    const storageLocalMissing = document.getElementById('storage-local-missing');
    const storageR2Count = document.getElementById('storage-r2-count');
    const storageLastMigration = document.getElementById('storage-last-migration');
    const storageBreakdown = document.getElementById('storage-breakdown');
    const storageMissingList = document.getElementById('storage-missing-list');
    const btnRefreshStorage = document.getElementById('btn-refresh-storage');
    const btnMigrateStorage = document.getElementById('btn-migrate-storage');
    let isStorageMigrationRunning = false;

    function setStorageBusyState(isBusy) {
        isStorageMigrationRunning = isBusy;
        if (btnMigrateStorage) {
            btnMigrateStorage.disabled = isBusy;
            btnMigrateStorage.textContent = isBusy ? 'กำลังย้ายไฟล์...' : 'ย้ายไฟล์ขึ้น R2';
        }
        if (btnRefreshStorage) btnRefreshStorage.disabled = isBusy;
    }

    function renderStorageSummary(summary, migration = null) {
        if (!summary) return;

        if (storageMode) {
            storageMode.textContent = summary.storage?.r2_enabled ? 'R2 พร้อมใช้งาน' : 'Local Disk';
        }

        if (storagePublicUrl) {
            storagePublicUrl.textContent = summary.storage?.r2_public_url
                ? `Public URL: ${summary.storage.r2_public_url}`
                : 'ยังไม่ได้ตั้งค่า R2_PUBLIC_URL';
        }

        if (storageLocalExisting) storageLocalExisting.textContent = String(summary.counts?.local_existing || 0);
        if (storageLocalMissing) storageLocalMissing.textContent = String(summary.counts?.local_missing || 0);
        if (storageR2Count) storageR2Count.textContent = String(summary.counts?.r2 || 0);

        if (storageLastMigration) {
            storageLastMigration.textContent = migration
                ? `ล่าสุดย้าย ${migration.migrated_rows || 0} แถว / อัปโหลด ${migration.uploaded_files || 0} ไฟล์`
                : `ไฟล์บน local disk ตอนนี้ ${summary.storage?.local_upload_files || 0} ไฟล์`;
        }

        if (btnMigrateStorage) {
            btnMigrateStorage.disabled = !summary.storage?.r2_enabled || isStorageMigrationRunning;
        }

        if (storageBreakdown) {
            storageBreakdown.innerHTML = Object.entries(summary.tables || {}).map(([tableName, tableSummary]) => `
                <div class="storage-breakdown-card">
                    <strong>${escapeHtml(tableName)}</strong>
                    <span>R2 แล้ว: ${Number(tableSummary.r2 || 0).toLocaleString('th-TH')}</span>
                    <span>Local ที่ยังย้ายได้: ${Number(tableSummary.local_existing || 0).toLocaleString('th-TH')}</span>
                    <span>ไฟล์หาย: ${Number(tableSummary.local_missing || 0).toLocaleString('th-TH')}</span>
                    <span>External URL: ${Number(tableSummary.external || 0).toLocaleString('th-TH')}</span>
                </div>
            `).join('');
        }

        if (storageMissingList) {
            const missingSamples = summary.missing_samples || [];
            if (missingSamples.length) {
                storageMissingList.classList.remove('hidden');
                storageMissingList.innerHTML = `<strong>ไฟล์ที่อ้างอิงอยู่แต่หาไม่เจอบนเซิร์ฟเวอร์</strong>${missingSamples.map((item) => `<div>${escapeHtml(item.table)} #${item.id} • ${escapeHtml(item.filename)}</div>`).join('')}`;
            } else {
                storageMissingList.classList.add('hidden');
                storageMissingList.innerHTML = '';
            }
        }
    }

    async function renderStorageStatus() {
        try {
            const res = await authFetch(`${API_BASE}/admin/storage/status`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'storage-status-failed');
            renderStorageSummary(data);
        } catch (err) {
            if (storageMode) storageMode.textContent = 'โหลดไม่สำเร็จ';
            if (storagePublicUrl) storagePublicUrl.textContent = 'ไม่สามารถอ่านสถานะที่เก็บรูปได้';
        }
    }

    const adminAccountPanel = document.getElementById('admin-account-panel');
    const adminAccountSession = document.getElementById('admin-account-session');
    const adminAccountSelect = document.getElementById('admin-account-select');
    const adminAccountRole = document.getElementById('admin-account-role');
    const adminAccountUsername = document.getElementById('admin-account-username');
    const adminAccountPassword = document.getElementById('admin-account-password');
    const adminAccountHelp = document.getElementById('admin-account-help');
    const adminAccountList = document.getElementById('admin-account-list');
    const adminAccountCount = document.getElementById('admin-account-count');
    const btnRefreshAdminAccounts = document.getElementById('btn-refresh-admin-accounts');
    const btnSaveAdminAccount = document.getElementById('btn-save-admin-account');
    const btnResetAdminPassword = document.getElementById('btn-reset-admin-password');
    const btnDeleteAdminAccount = document.getElementById('btn-delete-admin-account');
    const ADMIN_ROLE_LABELS = { admin: 'Admin', editor: 'Editor' };
    let adminAccounts = [];
    let selectedAdminAccountId = '';

    function renderAdminRoleBadge(role) {
        const normalized = role === 'admin' ? 'admin' : 'editor';
        return `<span class="admin-role-badge admin-role-badge-${normalized}">${escapeHtml(ADMIN_ROLE_LABELS[normalized])}</span>`;
    }

    function getSelectedAdminAccount() {
        return adminAccounts.find((account) => String(account.id) === String(selectedAdminAccountId)) || null;
    }

    function syncAdminAccountForm() {
        const selectedAccount = getSelectedAdminAccount();

        if (adminAccountSelect) {
            adminAccountSelect.value = selectedAccount ? String(selectedAccount.id) : '';
        }

        if (selectedAccount) {
            if (adminAccountUsername) adminAccountUsername.value = selectedAccount.username || '';
            if (adminAccountRole) adminAccountRole.value = selectedAccount.role || 'editor';
            if (adminAccountPassword) {
                adminAccountPassword.value = '';
                adminAccountPassword.placeholder = 'เว้นว่างหากไม่ต้องการเปลี่ยนรหัสผ่าน';
            }
            if (adminAccountHelp) {
                adminAccountHelp.textContent = selectedAccount.is_current
                    ? 'กำลังแก้ไขบัญชีที่ล็อกอินอยู่ สามารถเปลี่ยนชื่อ/role/รหัสผ่านได้ แต่จะลบบัญชีนี้ไม่ได้'
                    : 'โหมดแก้ไขผู้ดูแล: เปลี่ยน username, role และใส่รหัสผ่านใหม่เฉพาะเมื่ออยากรีเซ็ต';
            }
            if (btnSaveAdminAccount) btnSaveAdminAccount.textContent = 'อัปเดตผู้ดูแล';
            if (btnResetAdminPassword) btnResetAdminPassword.disabled = false;
            if (btnDeleteAdminAccount) btnDeleteAdminAccount.disabled = !!selectedAccount.is_current;
            return;
        }

        if (adminAccountUsername) adminAccountUsername.value = '';
        if (adminAccountRole) adminAccountRole.value = 'editor';
        if (adminAccountPassword) {
            adminAccountPassword.value = '';
            adminAccountPassword.placeholder = 'รหัสผ่านอย่างน้อย 8 ตัวอักษร';
        }
        if (adminAccountHelp) {
            adminAccountHelp.textContent = 'โหมดสร้างผู้ดูแลใหม่: ถ้าเลือกบัญชีเดิม ระบบจะเปลี่ยนเป็นโหมดแก้ไขและช่องรหัสผ่านจะเป็นทางเลือก';
        }
        if (btnSaveAdminAccount) btnSaveAdminAccount.textContent = 'สร้างผู้ดูแล';
        if (btnResetAdminPassword) btnResetAdminPassword.disabled = true;
        if (btnDeleteAdminAccount) btnDeleteAdminAccount.disabled = true;
    }

    function renderAdminAccountSession() {
        if (!adminAccountSession) return;
        adminAccountSession.innerHTML = `ล็อกอินเป็น <strong>${escapeHtml(currentAdminSession.username || '—')}</strong> ${renderAdminRoleBadge(currentAdminSession.role || 'admin')} <span class="admin-account-session-tag">• path ${escapeHtml(ADMIN_LOGIN_PATH)}</span>`;
    }

    function renderAdminAccountSelectOptions() {
        if (!adminAccountSelect) return;
        adminAccountSelect.innerHTML = `
            <option value="">-- สร้างผู้ดูแลใหม่ --</option>
            ${adminAccounts.map((account) => `<option value="${account.id}">${escapeHtml(account.username)} (${escapeHtml(account.role)})</option>`).join('')}
        `;
    }

    function renderAdminAccountList() {
        if (!adminAccountList) return;
        if (!adminAccounts.length) {
            adminAccountList.innerHTML = '<p class="empty-msg">ยังไม่มีบัญชีผู้ดูแล</p>';
            return;
        }

        adminAccountList.innerHTML = adminAccounts.map((account) => `
            <button type="button" class="admin-account-item ${String(account.id) === String(selectedAdminAccountId) ? 'is-selected' : ''}" data-admin-account-id="${account.id}">
                <div class="admin-account-item-top">
                    <span class="admin-account-item-name">${escapeHtml(account.username)}</span>
                    ${renderAdminRoleBadge(account.role)}
                </div>
                <div class="admin-account-item-meta">
                    สร้างเมื่อ ${formatDateTime(account.created_at)}
                    ${account.is_current ? `<span class="admin-account-session-tag"> • current session</span>` : ''}
                </div>
            </button>
        `).join('');

        adminAccountList.querySelectorAll('[data-admin-account-id]').forEach((button) => {
            button.addEventListener('click', () => {
                selectedAdminAccountId = button.dataset.adminAccountId || '';
                syncAdminAccountForm();
                renderAdminAccountList();
            });
        });
    }

    async function loadAdminAccounts() {
        if (!adminAccountPanel) return;

        renderAdminAccountSession();

        if ((currentAdminSession.role || 'admin') !== 'admin') {
            adminAccountPanel.hidden = true;
            return;
        }

        adminAccountPanel.hidden = false;
        if (adminAccountList) adminAccountList.innerHTML = '<p class="empty-msg">กำลังโหลดรายชื่อผู้ดูแล...</p>';

        try {
            const res = await authFetch(`${API_BASE}/admin/accounts`);
            const data = await res.json();
            if (res.status === 403) {
                adminAccountPanel.hidden = true;
                return;
            }
            if (!res.ok) throw new Error(data.error || 'load-admin-accounts-failed');

            adminAccounts = Array.isArray(data.accounts) ? data.accounts : [];
            if (data.current) {
                currentAdminSession = {
                    username: data.current.username || currentAdminSession.username,
                    role: data.current.role || currentAdminSession.role || 'admin',
                    userId: data.current.id || currentAdminSession.userId
                };
                sessionStorage.setItem('admin_user', currentAdminSession.username || '');
                sessionStorage.setItem('admin_role', currentAdminSession.role || 'admin');
            }

            if (!adminAccounts.some((account) => String(account.id) === String(selectedAdminAccountId))) {
                selectedAdminAccountId = '';
            }

            renderAdminAccountSession();
            renderAdminAccountSelectOptions();
            syncAdminAccountForm();
            renderAdminAccountList();
            if (adminAccountCount) {
                adminAccountCount.textContent = `${adminAccounts.length.toLocaleString('th-TH')} บัญชี`;
            }
        } catch (err) {
            if (adminAccountList) {
                adminAccountList.innerHTML = '<p class="empty-msg">ไม่สามารถโหลดรายชื่อผู้ดูแลได้</p>';
            }
            if (adminAccountCount) adminAccountCount.textContent = 'โหลดไม่สำเร็จ';
        }
    }

    const userSearchInput = document.getElementById('user-search-input');
    const userPlatformFilter = document.getElementById('user-platform-filter');
    const userActivityFilter = document.getElementById('user-activity-filter');
    const userPointFilter = document.getElementById('user-point-filter');
    const userRewardFilter = document.getElementById('user-reward-filter');
    const userReviewFilter = document.getElementById('user-review-filter');
    const userRankFilter = document.getElementById('user-rank-filter');
    const btnUserClearFilters = document.getElementById('btn-user-clear-filters');
    const userBody = document.getElementById('users-body');
    const noUsers = document.getElementById('no-users');
    const userPagination = document.getElementById('user-pagination');
    const userPaginationStatus = document.getElementById('user-pagination-status');
    const userPrevButton = document.getElementById('btn-user-prev');
    const userNextButton = document.getElementById('btn-user-next');
    const excelAdminStatus = document.getElementById('excel-admin-status');
    const excelExportReport = document.getElementById('excel-export-report');
    const excelEditableReport = document.getElementById('excel-editable-report');
    const excelImportReport = document.getElementById('excel-import-report');
    const excelImportFile = document.getElementById('excel-import-file');
    const excelImportResult = document.getElementById('excel-import-result');
    const excelImportLogBody = document.getElementById('excel-import-log-body');
    const excelImportLogEmpty = document.getElementById('excel-import-log-empty');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const btnExportXlsx = document.getElementById('btn-export-xlsx');
    const btnDownloadEditableXlsx = document.getElementById('btn-download-editable-xlsx');
    const btnImportExcel = document.getElementById('btn-import-excel');
    const btnRefreshImportLogs = document.getElementById('btn-refresh-import-logs');
    const userDetailEmpty = document.getElementById('user-detail-empty');
    const userDetailContent = document.getElementById('user-detail-content');
    const userDetailAvatar = document.getElementById('user-detail-avatar');
    const userDetailName = document.getElementById('user-detail-name');
    const userDetailMeta = document.getElementById('user-detail-meta');
    const userDetailTags = document.getElementById('user-detail-tags');
    const userDetailStats = document.getElementById('user-detail-stats');
    const userLinkedAccounts = document.getElementById('user-linked-accounts');
    const userAdminSearchKeys = document.getElementById('user-admin-search-keys');
    const userRecentTransactions = document.getElementById('user-recent-transactions');
    const userRecentPoints = document.getElementById('user-recent-points');
    const userPointsSummary = document.getElementById('user-points-summary');
    const userPointHistory = document.getElementById('user-point-history');
    const userRewardSummary = document.getElementById('user-reward-summary');
    const userRewardItems = document.getElementById('user-reward-items');
    const userRewardClaims = document.getElementById('user-reward-claims');
    const userRewardClaimTarget = document.getElementById('user-reward-claim-target');
    const userRewardClaimDate = document.getElementById('user-reward-claim-date');
    const userRewardClaimMode = document.getElementById('user-reward-claim-mode');
    const userRewardClaimAmount = document.getElementById('user-reward-claim-amount');
    const userRewardClaimNote = document.getElementById('user-reward-claim-note');
    const btnUserClaimRemaining = document.getElementById('btn-user-claim-remaining');
    const btnSaveUserRewardClaim = document.getElementById('btn-save-user-reward-claim');
    const btnClearUserRewardClaim = document.getElementById('btn-clear-user-reward-claim');
    const userEditDisplayName = document.getElementById('user-edit-display-name');
    const userEditPictureUrl = document.getElementById('user-edit-picture-url');
    const userDetailModal = document.getElementById('user-detail-modal');
    const userDetailModalClose = document.getElementById('user-detail-modal-close');
    const rewardOpenCount = document.getElementById('reward-open-count');
    const rewardCashbackRemaining = document.getElementById('reward-cashback-remaining');
    const rewardCashbackRemainingNet = document.getElementById('reward-cashback-remaining-net');
    const rewardGvRemaining = document.getElementById('reward-gv-remaining');
    const rewardClaimCount = document.getElementById('reward-claim-count');
    const rewardLedgerBody = document.getElementById('reward-ledger-body');
    const noRewardLedger = document.getElementById('no-reward-ledger');
    const rewardClaimsList = document.getElementById('reward-claims-list');
    const btnRefreshRewards = document.getElementById('btn-refresh-rewards');
    const rewardClaimTarget = document.getElementById('reward-claim-target');
    const rewardClaimMode = document.getElementById('reward-claim-mode');
    const rewardClaimAmount = document.getElementById('reward-claim-amount');
    const rewardClaimNote = document.getElementById('reward-claim-note');
    const btnClaimRemaining = document.getElementById('btn-claim-remaining');
    const btnSaveRewardClaim = document.getElementById('btn-save-reward-claim');
    const btnClearRewardClaim = document.getElementById('btn-clear-reward-claim');
    const guessPointsCycleStart = document.getElementById('guess-points-cycle-start');
    const guessPointsCycleEndInput = document.getElementById('guess-points-cycle-end-input');
    const guessPointsCycleCurrent = document.getElementById('guess-points-cycle-current');
    const guessPointsCycleEnd = document.getElementById('guess-points-cycle-end');
    const guessPointsRecheckStatus = document.getElementById('guess-points-recheck-status');
    const btnSaveGuessPointsCycle = document.getElementById('btn-save-guess-points-cycle');
    const btnClearGuessPointsCycle = document.getElementById('btn-clear-guess-points-cycle');
    const btnRecheckGuessPoints = document.getElementById('btn-recheck-guess-points');
    const customerRankResetDateInput = document.getElementById('customer-rank-reset-date');
    const customerRankResetCurrent = document.getElementById('customer-rank-reset-current');
    const btnSaveCustomerRankReset = document.getElementById('btn-save-customer-rank-reset');
    const guessLockStatusBadge = document.getElementById('guess-lock-status-badge');
    const guessLockStatusUntil = document.getElementById('guess-lock-status-until');
    const guessLockFromInput = document.getElementById('guess-lock-from-input');
    const guessLockUntilInput = document.getElementById('guess-lock-until-input');
    const btnGuessLock = document.getElementById('btn-guess-lock');
    const btnGuessUnlock = document.getElementById('btn-guess-unlock');
    let selectedUserId = null;
    let selectedRewardRow = null;
    let rewardLedgerState = { summary: {}, rewards: [], recentClaims: [] };
    let selectedUserPointBalance = 0;
    let selectedUserRewardRow = null;
    let currentUserPage = 1;
    let currentUserTotalPages = 1;
    let userSearchDebounceId = null;

    function setExcelAdminStatus(message, type = 'info') {
        if (!excelAdminStatus) return;
        excelAdminStatus.textContent = message;
        excelAdminStatus.dataset.state = type;
    }

    async function downloadExcelAdminFile(url, fallbackFilename) {
        const res = await authFetch(url);
        if (!res.ok) {
            let errorMessage = 'download-failed';
            try {
                const errorData = await res.json();
                errorMessage = errorData.error || errorMessage;
            } catch {
                errorMessage = await res.text();
            }
            throw new Error(errorMessage || 'download-failed');
        }

        const blob = await res.blob();
        const contentDisposition = res.headers.get('content-disposition') || '';
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
        const filename = filenameMatch?.[1] || fallbackFilename;
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        return filename;
    }

    async function importExcelAdminFile(reportKey, file) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await authFetch(`${API_BASE}/admin/import/${encodeURIComponent(reportKey)}`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || (data.errors && data.errors.length
                ? data.errors.map((item) => `แถว ${item.row}: ${item.error}`).join(' | ')
                : 'import-failed'));
        }

        return data;
    }

    function renderExcelImportLogs(logs) {
        if (!excelImportLogBody || !excelImportLogEmpty) return;

        const items = Array.isArray(logs) ? logs : [];
        if (!items.length) {
            excelImportLogBody.innerHTML = '';
            excelImportLogEmpty.textContent = 'ยังไม่มีประวัติ import Excel';
            excelImportLogEmpty.classList.remove('hidden');
            return;
        }

        excelImportLogEmpty.classList.add('hidden');
        excelImportLogBody.innerHTML = items.map((log) => `
            <tr>
                <td>${escapeHtml(formatShortDateTime(log.created_at))}</td>
                <td><strong>${escapeHtml(log.report_key || '-')}</strong></td>
                <td>${escapeHtml(log.file_name || '-')}</td>
                <td><span class="excel-log-status excel-log-status-${String(log.status || '').toLowerCase() === 'success' ? 'success' : 'failed'}">${escapeHtml(log.status || '-')}</span></td>
                <td>${Number(log.rows_read || 0).toLocaleString('th-TH')}</td>
                <td>${Number(log.rows_processed || 0).toLocaleString('th-TH')}</td>
                <td>${Number(log.rows_written || 0).toLocaleString('th-TH')}</td>
                <td>${escapeHtml(log.triggered_by_name || '-')}</td>
                <td class="excel-log-detail">${escapeHtml(log.error_summary || '-')}</td>
            </tr>
        `).join('');
    }

    async function loadExcelImportLogs() {
        if (!excelImportLogEmpty) return;
        try {
            const res = await authFetch(`${API_BASE}/admin/import-logs?limit=20`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'load-import-logs-failed');
            renderExcelImportLogs(data.logs || []);
        } catch (err) {
            if (excelImportLogBody) excelImportLogBody.innerHTML = '';
            excelImportLogEmpty.textContent = 'ไม่สามารถโหลดประวัติ import Excel ได้';
            excelImportLogEmpty.classList.remove('hidden');
        }
    }

    function getTodayDateInputValue() {
        const now = new Date();
        const offsetTime = now.getTime() - (now.getTimezoneOffset() * 60000);
        return new Date(offsetTime).toISOString().slice(0, 10);
    }

    function openUserDetailModal() {
        if (!userDetailModal) return;
        userDetailModal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function clearUserDetail() {
        selectedUserId = null;
        if (userDetailEmpty) userDetailEmpty.classList.remove('hidden');
        if (userDetailContent) userDetailContent.classList.add('hidden');
        if (userEditDisplayName) userEditDisplayName.value = '';
        if (userEditPictureUrl) userEditPictureUrl.value = '';
        if (userRewardSummary) userRewardSummary.innerHTML = '';
        if (userRewardItems) userRewardItems.innerHTML = '';
        if (userRewardClaims) userRewardClaims.innerHTML = '';
        if (userRewardClaimTarget) userRewardClaimTarget.innerHTML = 'ยังไม่ได้เลือกรายการสิทธิ์';
        if (userRewardClaimDate) userRewardClaimDate.value = getTodayDateInputValue();
        if (userRewardClaimAmount) userRewardClaimAmount.value = '';
        if (userRewardClaimNote) userRewardClaimNote.value = '';
        if (userPointsSummary) userPointsSummary.innerHTML = '';
        if (userPointHistory) userPointHistory.innerHTML = '';
        if (userAdminSearchKeys) userAdminSearchKeys.innerHTML = '';
        selectedUserPointBalance = 0;
        selectedUserRewardRow = null;
        if (userDetailModal) userDetailModal.hidden = true;
        document.body.style.overflow = '';
    }

    if (userDetailModalClose) {
        userDetailModalClose.addEventListener('click', clearUserDetail);
    }

    if (userDetailModal) {
        userDetailModal.addEventListener('click', (event) => {
            if (event.target === userDetailModal) clearUserDetail();
        });
    }

    function updateUserPagination(pagination = {}) {
        currentUserPage = pagination.page || currentUserPage || 1;
        currentUserTotalPages = pagination.total_pages || 1;

        if (userPaginationStatus) {
            userPaginationStatus.textContent = `หน้า ${currentUserPage} / ${currentUserTotalPages}`;
        }

        if (userPrevButton) userPrevButton.disabled = !pagination.has_prev;
        if (userNextButton) userNextButton.disabled = !pagination.has_next;

        if (userPagination) {
            userPagination.hidden = Number(pagination.total_items || 0) <= 0;
        }
    }

    async function renderUsers(page = currentUserPage) {
        if (!userBody || !noUsers) return;
        currentUserPage = page;

        const params = new URLSearchParams({
            search: userSearchInput?.value?.trim() || '',
            platform: userPlatformFilter?.value || 'all',
            activity: userActivityFilter?.value || 'all',
            points: userPointFilter?.value || 'all',
            rewards: userRewardFilter?.value || 'all',
            review: userReviewFilter?.value || 'all',
            rank: userRankFilter?.value || 'all',
            page: String(currentUserPage),
            limit: '12'
        });

        try {
            const res = await authFetch(`${API_BASE}/admin/users?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'load-failed');

            document.getElementById('users-total-accounts').textContent = data.summary.total_accounts || 0;
            document.getElementById('users-line-accounts').textContent = data.summary.line_accounts || 0;
            document.getElementById('users-active-accounts').textContent = data.summary.active_accounts || 0;
            updateUserPagination(data.pagination);

            if (!data.users.length) {
                if ((data.pagination?.total_items || 0) > 0 && currentUserPage > (data.pagination?.total_pages || 1)) {
                    return renderUsers(data.pagination.total_pages || 1);
                }
                userBody.innerHTML = '';
                noUsers.textContent = 'ไม่พบข้อมูลผู้ใช้ตามเงื่อนไขที่เลือก';
                noUsers.classList.remove('hidden');
                if (userPagination) userPagination.hidden = true;
                return;
            }

            noUsers.classList.add('hidden');
            userBody.innerHTML = data.users.map((user, index) => `
                <tr class="${String(selectedUserId) === String(user.id) ? 'user-row-active' : ''}">
                    <td>${((currentUserPage - 1) * (data.pagination?.limit || 12)) + index + 1}</td>
                    <td>
                        <div class="user-cell">
                            <img class="user-cell-avatar" src="${userAvatarSrc(user)}" alt="${escapeHtml(user.display_name || 'User')}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.platform_id || 'User')}&background=1a1a2e&color=ff3c3c&size=96'">
                            <div>
                                <div class="user-cell-name">${escapeHtml(user.display_name || 'ไม่มีชื่อ')}</div>
                                <div class="user-cell-sub">${user.global_user_id ? `Global: ${escapeHtml(String(user.global_user_id))}` : 'ยังไม่มี global_user_id'}</div>
                                ${renderUserCompactSummary(user)}
                            </div>
                        </div>
                    </td>
                    <td>${formatPlatformBadge(user.platform)}</td>
                    <td class="user-platform-id-cell"><code class="user-platform-id-text">${formatBreakableIdentifier(user.platform_id)}</code></td>
                    <td>
                        <div class="user-reward-balance-cell">
                            <div><strong>${Number(user.current_round_points || 0).toLocaleString('th-TH')}</strong> แต้ม</div>
                            <div><strong>${Math.max(0, Math.floor(Number(user.current_round_points || 0) / 5)).toLocaleString('th-TH')}</strong> สิทธิ์ทาย</div>
                        </div>
                    </td>
                    <td>${(user.total_points || 0).toLocaleString('th-TH')}</td>
                    <td>${renderUserRankCell(user)}</td>
                    <td>${renderUserRewardBalanceCell(user)}</td>
                    <td>${user.transaction_count || 0}</td>
                    <td class="user-last-active-cell">${formatShortDateTime(user.last_activity_at || user.created_at)}</td>
                    <td><button class="btn-small" data-view-user="${user.id}">ดูรายละเอียด</button></td>
                </tr>
            `).join('');

            userBody.querySelectorAll('[data-view-user]').forEach((btn) => {
                btn.addEventListener('click', () => loadUserDetail(btn.dataset.viewUser));
            });
        } catch (err) {
            userBody.innerHTML = '';
            noUsers.textContent = 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้';
            noUsers.classList.remove('hidden');
            if (userPagination) userPagination.hidden = true;
        }
    }

    function renderUserActivityList(container, items, renderItem) {
        if (!container) return;
        if (!items.length) {
            container.innerHTML = '<p class="empty-msg">ไม่มีข้อมูล</p>';
            return;
        }
        container.innerHTML = items.map(renderItem).join('');
    }

    function rewardTypeBadge(type) {
        const normalized = type === 'cashback' ? 'cashback' : 'gv';
        const label = normalized === 'cashback' ? 'Cashback' : 'GV 300';
        const icon = normalized === 'cashback' ? '💰' : '🎁';
        return `<span class="reward-type-badge reward-type-badge-${normalized}">${icon} ${label}</span>`;
    }

    function rewardOwnerLabel(row) {
        return row.display_name || row.platform_id || 'ไม่มีชื่อ';
    }

    function renderRewardAmountCell(row, amountKey, netKey, emphasisClass = '') {
        const amount = Number(row[amountKey] || 0);
        const netAmount = Number(row[netKey] || 0);
        if (row.reward_type === 'cashback') {
            let metaText = `ยอดคงเหลือ ${formatCurrency(amount)} • ถอนได้สุทธิ ${formatCurrency(netAmount)}`;
            if (amountKey === 'total_amount') {
                metaText = `ถ้าถอนทั้งหมดจะรับสุทธิ ${formatCurrency(netAmount)} หรือใช้ซ้ำเต็มจำนวน`;
            } else if (amountKey === 'redeemed_amount') {
                metaText = `ยอดบัญชีที่ถูกหักแล้ว • มูลค่าที่ลูกค้าใช้/รับจริง ${formatCurrency(netAmount)}`;
            }
            return `
                <span class="reward-value-strong ${emphasisClass}">${formatCurrency(amount)}</span>
                <span class="reward-value-meta">${metaText}</span>
            `;
        }
        return `
            <span class="reward-value-strong ${emphasisClass}">${formatCurrency(amount)}</span>
            <span class="reward-value-meta">Gift Voucher 300 บาท</span>
        `;
    }

    function formatRewardClaimItem(claim, allowDelete = true) {
        const amountHtml = claim.reward_type === 'cashback'
            ? (claim.claim_mode === 'withdraw'
                ? `หักยอด ${formatCurrency(claim.amount)} <span class="reward-value-meta">${formatClaimModeLabel(claim.claim_mode)}</span><span class="reward-value-meta"> • จ่ายจริง ${formatCurrency(claim.net_amount || 0)}</span>`
                : `หักยอด ${formatCurrency(claim.amount)} <span class="reward-value-meta">${formatClaimModeLabel(claim.claim_mode)}</span>`)
            : `หักยอด ${formatCurrency(claim.amount)}`;
        return `
            <div class="user-activity-item reward-claim-entry">
                <div class="reward-claim-entry-main">
                    <div class="user-activity-title">${rewardTypeBadge(claim.reward_type)} ${escapeHtml(rewardOwnerLabel(claim))}</div>
                    <div class="user-activity-meta">งวด ${escapeHtml(claim.round_label || '—')} • ${amountHtml} • บันทึกโดย ${escapeHtml(claim.redeemed_by_name || 'system')} • ${formatDateTime(claim.redeemed_at)}</div>
                    ${claim.note ? `<div class="user-activity-meta">โน้ต: ${escapeHtml(claim.note)}</div>` : ''}
                </div>
                ${(allowDelete && !isEditor) ? `<button type="button" class="btn-small" data-delete-reward-claim="${claim.id}">ลบ</button>` : ''}
            </div>
        `;
    }

    function updateUserRewardClaimSelection(row) {
        selectedUserRewardRow = row || null;
        if (!userRewardClaimTarget || !userRewardClaimDate || !userRewardClaimAmount || !userRewardClaimNote || !userRewardClaimMode) return;

        if (!row) {
            userRewardClaimTarget.innerHTML = 'ยังไม่ได้เลือกรายการสิทธิ์';
            userRewardClaimDate.value = getTodayDateInputValue();
            userRewardClaimMode.value = 'reuse';
            userRewardClaimAmount.value = '';
            userRewardClaimNote.value = '';
            userRewardClaimDate.disabled = true;
            userRewardClaimMode.disabled = true;
            userRewardClaimAmount.disabled = true;
            userRewardClaimNote.disabled = true;
            if (btnSaveUserRewardClaim) btnSaveUserRewardClaim.disabled = true;
            if (btnUserClaimRemaining) btnUserClaimRemaining.disabled = true;
            return;
        }

        userRewardClaimTarget.innerHTML = `
            <div><strong>${escapeHtml(rewardOwnerLabel(row))}</strong> • ${rewardTypeBadge(row.reward_type)}</div>
            <div class="reward-round-meta">งวด ${escapeHtml(row.round_label || '—')} • ใช้ไปแล้ว ${Number(row.claim_count || 0)} ครั้ง</div>
            <div class="reward-round-meta">${row.reward_type === 'cashback' ? formatCashbackBalanceText(row.remaining_amount || 0, row.remaining_net_amount || 0) : `ใช้ได้อีก ${formatCurrency(row.remaining_amount || 0)}`}</div>
        `;
        userRewardClaimDate.value = getTodayDateInputValue();
        userRewardClaimMode.value = row.last_claim_mode === 'withdraw' ? 'withdraw' : 'reuse';
        userRewardClaimAmount.value = '';
        userRewardClaimNote.value = '';
        const disabled = Number(row.remaining_amount || 0) <= 0;
        userRewardClaimDate.disabled = disabled;
        userRewardClaimMode.disabled = disabled || row.reward_type !== 'cashback';
        userRewardClaimAmount.disabled = disabled;
        userRewardClaimNote.disabled = disabled;
        if (btnSaveUserRewardClaim) btnSaveUserRewardClaim.disabled = disabled;
        if (btnUserClaimRemaining) btnUserClaimRemaining.disabled = disabled;
    }

    function renderUserRewardSections(data) {
        if (userRewardSummary) {
            const summary = data.rewardSummary || {};
            userRewardSummary.innerHTML = [
                { value: `${Number(summary.open_rewards || 0)} รายการ`, label: 'สิทธิ์คงค้าง' },
                { value: formatCashbackBalanceText(summary.cashback_remaining || 0, summary.cashback_remaining_net || 0), label: 'Cashback คงเหลือ' },
                { value: formatCurrency(summary.gv_remaining || 0), label: 'GV คงเหลือ' },
                { value: `${Number(summary.claim_count || 0)} ครั้ง`, label: 'ใช้สิทธิ์แล้ว' }
            ].map((item) => `
                <div class="user-reward-chip">
                    <strong>${item.value}</strong>
                    <span>${item.label}</span>
                </div>
            `).join('');
        }

        renderUserActivityList(userRewardItems, data.rewardRows || [], (row) => `
            <div class="user-activity-item">
                <div class="user-activity-title">${rewardTypeBadge(row.reward_type)} งวด ${escapeHtml(row.round_label || '—')}</div>
                <div class="user-activity-meta">ได้รับ ${formatCurrency(row.total_amount)} • ใช้แล้ว ${formatCurrency(row.redeemed_amount)} • คงเหลือ ${formatCurrency(row.remaining_amount)} • ${Number(row.claim_count || 0)} ครั้ง</div>
                ${row.reward_type === 'cashback' ? `<div class="user-activity-meta">${formatCashbackBalanceText(row.remaining_amount || 0, row.remaining_net_amount || 0)}</div>` : ''}
                <div class="user-reward-actions">
                    <button type="button" class="btn-small" data-select-user-reward="${row.lottery_guess_id}" ${Number(row.remaining_amount || 0) <= 0 ? 'disabled' : ''}>${Number(row.remaining_amount || 0) > 0 ? 'เลือกใช้สิทธิ์นี้' : 'ใช้ครบแล้ว'}</button>
                </div>
            </div>
        `);

        renderUserActivityList(userRewardClaims, data.recentRewardClaims || [], (claim) => formatRewardClaimItem(claim, true));

        userRewardItems?.querySelectorAll('[data-select-user-reward]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = (data.rewardRows || []).find((item) => Number(item.lottery_guess_id) === Number(btn.dataset.selectUserReward));
                updateUserRewardClaimSelection(row || null);
            });
        });

        if (selectedUserRewardRow) {
            const refreshedRow = (data.rewardRows || []).find((row) => Number(row.lottery_guess_id) === Number(selectedUserRewardRow.lottery_guess_id));
            updateUserRewardClaimSelection(refreshedRow || null);
        } else {
            updateUserRewardClaimSelection(null);
        }
    }

    function formatPointEntry(point) {
        const amount = Number(point.points || 0);
        const isNegative = amount < 0;
        const formattedAmount = `${isNegative ? '' : '+'}${amount.toLocaleString('th-TH')} แต้ม`;
        const metadata = point.metadata || {};
        const note = metadata.note || '';
        const adminName = metadata.redeemed_by_admin_username || '';
        return `
            <div class="user-activity-item">
                <div class="user-activity-title point-entry-title">
                    <span>${escapeHtml(point.activity_type || 'กิจกรรม')}</span>
                    <span class="${isNegative ? 'point-negative' : 'point-positive'}">${formattedAmount}</span>
                </div>
                <div class="user-activity-meta">${escapeHtml(point.source_platform || 'system')} • ${formatDateTime(point.created_at)}</div>
                ${adminName ? `<div class="user-activity-meta">บันทึกโดยแอดมิน: ${escapeHtml(adminName)}</div>` : ''}
                ${note ? `<div class="user-activity-meta">โน้ต: ${escapeHtml(note)}</div>` : ''}
            </div>
        `;
    }

    function renderUserPointsSection(data) {
        selectedUserPointBalance = Number(data.stats?.current_round_points || 0);
        const currentRoundGuessCredits = Number(data.stats?.current_round_guess_credits || 0);

        if (userPointsSummary) {
            userPointsSummary.innerHTML = [
                { value: `${selectedUserPointBalance.toLocaleString('th-TH')} แต้ม`, label: 'พ้อยทายเลขคงเหลือ' },
                { value: `${currentRoundGuessCredits.toLocaleString('th-TH')} เลข`, label: 'ทายได้ตอนนี้' },
                { value: `${escapeHtml(data.stats?.guess_point_cycle_start_date || '—')} → ${escapeHtml(data.stats?.guess_point_cycle_end_date || '—')}`, label: 'รอบสะสมปัจจุบัน' }
            ].map((item) => `
                <div class="user-reward-chip">
                    <strong>${item.value}</strong>
                    <span>${item.label}</span>
                </div>
            `).join('');
        }

        renderUserActivityList(userPointHistory, data.recentPoints || [], (point) => formatPointEntry(point));
    }

    function updateRewardClaimSelection(row) {
        selectedRewardRow = row || null;
        if (!rewardClaimTarget || !rewardClaimAmount || !rewardClaimNote || !rewardClaimMode) return;

        if (!row) {
            rewardClaimTarget.innerHTML = 'ยังไม่ได้เลือกรายการ';
            rewardClaimMode.value = 'reuse';
            rewardClaimAmount.value = '';
            rewardClaimNote.value = '';
            rewardClaimMode.disabled = true;
            rewardClaimAmount.disabled = true;
            rewardClaimNote.disabled = true;
            if (btnSaveRewardClaim) btnSaveRewardClaim.disabled = true;
            if (btnClaimRemaining) btnClaimRemaining.disabled = true;
            return;
        }

        rewardClaimTarget.innerHTML = `
            <div><strong>${escapeHtml(rewardOwnerLabel(row))}</strong> • ${rewardTypeBadge(row.reward_type)}</div>
            <div class="reward-round-meta">งวด ${escapeHtml(row.round_label || '—')} • ใช้ไปแล้ว ${Number(row.claim_count || 0)} ครั้ง</div>
            <div class="reward-round-meta">${row.reward_type === 'cashback' ? formatCashbackBalanceText(row.remaining_amount || 0, row.remaining_net_amount || 0) : `กำลังตัดจาก Gift Voucher คงเหลือ ${formatCurrency(row.remaining_amount || 0)}`}</div>
        `;
        rewardClaimMode.value = row.last_claim_mode === 'withdraw' ? 'withdraw' : 'reuse';
        rewardClaimAmount.value = '';
        rewardClaimNote.value = '';
        const disabled = Number(row.remaining_amount || 0) <= 0;
        rewardClaimMode.disabled = disabled || row.reward_type !== 'cashback';
        rewardClaimAmount.disabled = disabled;
        rewardClaimNote.disabled = disabled;
        if (btnSaveRewardClaim) btnSaveRewardClaim.disabled = disabled;
        if (btnClaimRemaining) btnClaimRemaining.disabled = disabled;
    }

    function bindRewardClaimDeleteHandlers(container) {
        container?.querySelectorAll('[data-delete-reward-claim]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const confirmed = window.confirm('ลบรายการบันทึกการใช้สิทธิ์นี้ใช่หรือไม่?');
                if (!confirmed) return;
                try {
                    const res = await authFetch(`${API_BASE}/admin/rewards/claims/${btn.dataset.deleteRewardClaim}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'delete-claim-failed');
                    showToast('ลบรายการใช้สิทธิ์แล้ว', 'success');
                    await renderCashbackSummary();
                    if (selectedUserId) await loadUserDetail(selectedUserId);
                    if (selectedRewardRow && Number(data.lottery_guess_id) === Number(selectedRewardRow.lottery_guess_id)) {
                        const updated = rewardLedgerState.rewards.find((row) => Number(row.lottery_guess_id) === Number(data.lottery_guess_id));
                        updateRewardClaimSelection(updated || null);
                    }
                } catch (err) {
                    showToast(err.message || 'ไม่สามารถลบรายการใช้สิทธิ์ได้', 'error');
                }
            });
        });
    }

    function renderRewardLedger(data) {
        rewardLedgerState = data || { summary: {}, rewards: [], recentClaims: [] };
        const summary = rewardLedgerState.summary || {};

        if (rewardOpenCount) rewardOpenCount.textContent = `${Number(summary.open_rewards || 0)} รายการ`;
        if (rewardCashbackRemaining) rewardCashbackRemaining.textContent = formatCurrency(summary.cashback_remaining || 0);
        if (rewardCashbackRemainingNet) rewardCashbackRemainingNet.textContent = `ถอนสุทธิ ${formatCurrency(summary.cashback_remaining_net || 0)} • ใช้ซ้ำเต็มจำนวน`;
        if (rewardGvRemaining) rewardGvRemaining.textContent = formatCurrency(summary.gv_remaining || 0);
        if (rewardClaimCount) rewardClaimCount.textContent = `${Number(summary.claim_count || 0)} ครั้ง`;

        document.getElementById('cashback-winners').textContent = `${Number(summary.cashback_rewards || 0)} คน`;
        document.getElementById('cashback-total-gross').textContent = formatCurrency(summary.cashback_total || 0);
        document.getElementById('cashback-tax').textContent = formatCurrency((summary.cashback_total || 0) - (summary.cashback_total_net || 0));
        document.getElementById('cashback-total-net').textContent = formatCurrency(summary.cashback_total_net || 0);
        document.getElementById('cashback-gv-count').textContent = `${Number(summary.gv_rewards || 0)} คน`;
        document.getElementById('cashback-gv-total').textContent = formatCurrency(summary.gv_total || 0);

        if (rewardLedgerBody && noRewardLedger) {
            const rows = rewardLedgerState.rewards || [];
            if (!rows.length) {
                rewardLedgerBody.innerHTML = '';
                noRewardLedger.textContent = 'ยังไม่มีสิทธิ์รางวัลที่ต้องติดตาม';
                noRewardLedger.classList.remove('hidden');
            } else {
                noRewardLedger.classList.add('hidden');
                rewardLedgerBody.innerHTML = rows.map((row) => `
                    <tr class="${selectedRewardRow && Number(selectedRewardRow.lottery_guess_id) === Number(row.lottery_guess_id) ? 'reward-ledger-row-active' : ''}">
                        <td>
                            <div class="reward-user-cell">
                                <span class="reward-user-name">${escapeHtml(rewardOwnerLabel(row))}</span>
                                <span class="reward-round-meta">${escapeHtml(row.platform || 'line')} • ${escapeHtml(row.platform_id || '—')}</span>
                            </div>
                        </td>
                        <td><span class="reward-round-meta">${escapeHtml(row.round_label || '—')}</span></td>
                        <td>${rewardTypeBadge(row.reward_type)}</td>
                        <td>${renderRewardAmountCell(row, 'total_amount', 'total_net_amount')}</td>
                        <td>${renderRewardAmountCell(row, 'redeemed_amount', 'redeemed_net_amount')}</td>
                        <td>${renderRewardAmountCell(row, 'remaining_amount', 'remaining_net_amount', 'reward-value-remaining')}</td>
                        <td>${Number(row.claim_count || 0)} ครั้ง</td>
                        <td>
                            <div class="reward-actions">
                                <button type="button" class="btn-small" data-select-reward="${row.lottery_guess_id}">บันทึกใช้สิทธิ์</button>
                                <button type="button" class="btn-small" data-view-user="${row.user_id}">ดู user</button>
                            </div>
                        </td>
                    </tr>
                `).join('');

                rewardLedgerBody.querySelectorAll('[data-select-reward]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const row = rewardLedgerState.rewards.find((item) => Number(item.lottery_guess_id) === Number(btn.dataset.selectReward));
                        updateRewardClaimSelection(row || null);
                        renderRewardLedger(rewardLedgerState);
                    });
                });

                rewardLedgerBody.querySelectorAll('[data-view-user]').forEach((btn) => {
                    btn.addEventListener('click', () => loadUserDetail(btn.dataset.viewUser));
                });
            }
        }

        renderUserActivityList(rewardClaimsList, rewardLedgerState.recentClaims || [], (claim) => formatRewardClaimItem(claim, true));
        bindRewardClaimDeleteHandlers(rewardClaimsList);

        if (selectedRewardRow) {
            const refreshedRow = (rewardLedgerState.rewards || []).find((row) => Number(row.lottery_guess_id) === Number(selectedRewardRow.lottery_guess_id));
            updateRewardClaimSelection(refreshedRow || null);
        }
    }

    async function loadUserDetail(id) {
        if (!id) return;
        try {
            const res = await authFetch(`${API_BASE}/admin/users/${id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'detail-failed');

            selectedUserId = Number(id);
            openUserDetailModal();
            userDetailEmpty.classList.add('hidden');
            userDetailContent.classList.remove('hidden');

            userDetailAvatar.src = userAvatarSrc(data.user);
            userDetailName.textContent = data.user.display_name || 'ไม่มีชื่อ';
            userDetailMeta.textContent = `บัญชีหลัก: ${data.user.platform} • ${data.user.platform_id} • สร้างเมื่อ ${formatDateTime(data.user.created_at)}`;
            userEditDisplayName.value = data.user.display_name || '';
            userEditPictureUrl.value = data.user.picture_url || '';

            const rankApprovedCount = getDisplayedRankApprovedCount({
                ...data.stats,
                lifetime_approved: data.stats?.approved_count,
                rank_reset_date: data.stats?.rank_reset_date
            });
            const rankInfo = getCustomerRankInfo(rankApprovedCount);

            userDetailTags.innerHTML = [
                `<span class="user-tag">แรงค์ ${escapeHtml(rankInfo.name)} (${rankApprovedCount.toLocaleString('th-TH')} EXP)</span>`,
                data.stats?.rank_reset_date ? `<span class="user-tag">รีแรงค์ตั้งแต่ ${formatServiceDate(data.stats.rank_reset_date)}</span>` : '',
                `<span class="user-tag">พ้อยทายเลข ${Number(data.stats?.current_round_points || 0).toLocaleString('th-TH')}</span>`,
                `<span class="user-tag">ทายได้ ${Number(data.stats?.current_round_guess_credits || 0).toLocaleString('th-TH')} เลข</span>`,
                `<span class="user-tag">รอบแต้ม ${escapeHtml(data.stats?.guess_point_cycle_start_date || '—')} ถึง ${escapeHtml(data.stats?.guess_point_cycle_end_date || '—')}</span>`,
                `<span class="user-tag">เชื่อม ${data.user.linked_account_count || 1} บัญชี LINE</span>`,
                data.user.global_user_id ? `<span class="user-tag">Global ${escapeHtml(String(data.user.global_user_id))}</span>` : ''
            ].filter(Boolean).join('');

            userDetailStats.innerHTML = [
                { label: 'รายการทั้งหมด', value: data.stats.transaction_count || 0 },
                { label: 'อนุมัติแล้ว', value: data.stats.approved_count || 0 },
                { label: 'Rank EXP', value: rankApprovedCount },
                { label: 'รอตรวจ', value: data.stats.pending_count || 0 },
                { label: 'ไม่อนุมัติ', value: data.stats.rejected_count || 0 },
                { label: 'ทายเลข', value: data.stats.lottery_guess_count || 0 },
                { label: 'พ้อยทายเลข', value: data.stats.current_round_points || 0 },
                { label: 'พ้อยรวม', value: data.stats.total_points || 0 }
            ].map((item) => `
                <div class="user-detail-stat">
                    <span class="user-detail-stat-value">${Number(item.value).toLocaleString('th-TH')}</span>
                    <span class="user-detail-stat-label">${item.label}</span>
                </div>
            `).join('');

            renderUserActivityList(userLinkedAccounts, data.linkedAccounts, (account) => `
                <div class="user-linked-chip">
                    ${formatPlatformBadge(account.platform)}
                    <span>${escapeHtml(account.platform_id)}</span>
                </div>
            `);

            renderUserActivityList(userAdminSearchKeys, [
                ...(data.linkedAccounts || []).map((account) => ({
                    label: 'LINE User ID',
                    value: account.platform_id
                })),
                ...(data.user?.global_user_id ? [{ label: 'Global User ID', value: String(data.user.global_user_id) }] : [])
            ], (item) => `
                <div class="user-linked-chip">
                    <span>${escapeHtml(item.label)}</span>
                    <span>${escapeHtml(item.value)}</span>
                </div>
            `);

            renderUserActivityList(userRecentTransactions, data.recentTransactions, (tx) => `
                <div class="user-activity-item">
                    <div class="user-activity-title">${escapeHtml(tx.staff_name || '—')} • ${escapeHtml(tx.status || '—')}</div>
                    <div class="user-activity-meta">${formatServiceDate(tx.service_date)} • ส่งเมื่อ ${formatDateTime(tx.created_at)} • ${escapeHtml(tx.platform)}:${escapeHtml(tx.platform_id)}</div>
                </div>
            `);

            renderUserActivityList(userRecentPoints, data.recentPoints, (point) => formatPointEntry(point));

            renderUserPointsSection(data);
            renderUserRewardSections(data);
            bindRewardClaimDeleteHandlers(userRewardClaims);
        } catch (err) {
            showToast('ไม่สามารถโหลดรายละเอียดผู้ใช้ได้', 'error');
            clearUserDetail();
        }
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

    // --- History State (filter + pagination) ---
    let _historyAllData = [];
    let _historyCurrentPage = 1;
    const HISTORY_PAGE_SIZE = 20;
    let _historyFilter = { query: '', type: 'all', status: 'all', result: 'all' };

    function getHistoryFiltered() {
        return _historyAllData.filter(h => {
            if (_historyFilter.query) {
                const q = _historyFilter.query.toLowerCase();
                const name = (h.customer_name || h.name || '').toLowerCase();
                const staff = (h.staff_name || '').toLowerCase();
                if (!name.includes(q) && !staff.includes(q)) return false;
            }
            if (_historyFilter.type !== 'all' && h.history_type !== _historyFilter.type) return false;
            if (_historyFilter.status !== 'all') {
                if (_historyFilter.status === 'pending' && !(h.history_type === 'transaction' && h.approved === 'pending')) return false;
                if (_historyFilter.status === 'approved' && !(h.history_type === 'transaction' && h.approved !== 'pending' && h.approved !== 'rejected')) return false;
                if (_historyFilter.status === 'rejected' && h.approved !== 'rejected') return false;
            }
            if (_historyFilter.result !== 'all') {
                if (h.history_type !== 'guess') return false;
                const resultKey = _historyFilter.result === 'pending_result' ? 'pending' : _historyFilter.result;
                if (h.lottery_result !== resultKey) return false;
            }
            return true;
        });
    }

    function buildHistoryRow(h, rowNum) {
        let statusClass = 'badge-active';
        let statusText = 'อนุมัติ';
        if (h.history_type === 'guess') {
            statusClass = 'badge-pending';
            statusText = 'ทายเลขแล้ว';
        } else if (h.approved === 'rejected') {
            statusClass = 'badge-revoked';
            statusText = 'ไม่อนุมัติ';
        } else if (h.approved === 'pending') {
            statusClass = 'badge-pending';
            statusText = 'รออนุมัติ';
        }
        let lotteryNum = '—';
        let resultBadge = '';
        let cashbackCell = '—';
        if (h.guess_number) lotteryNum = h.guess_number;
        if (h.lottery_result === 'won') {
            resultBadge = '<span class="badge badge-won">🎯 ถูกรางวัล!</span>';
            const grossAmount = h.reward_amount || 0;
            const netAmount = grossAmount * CASHBACK_WITHDRAWAL_RATE;
            cashbackCell = `<span class="cashback-won">${formatCurrency(netAmount)}</span><br><span class="cashback-detail">ใช้ซ้ำได้ ${formatCurrency(grossAmount)}</span>`;
        } else if (h.lottery_result === 'lost') {
            resultBadge = '<span class="badge badge-lost">ไม่ถูก</span>';
            cashbackCell = '<span class="cashback-gv">GV 300 ฿</span>';
        } else if (h.lottery_result === 'pending') {
            resultBadge = '<span class="badge badge-pending">รอผล</span>';
        }
        const customerName = h.customer_name || h.name || '—';
        const staffName = h.staff_name || '—';
        const pid = h.platform_id || '';
        const pidShort = pid.length > 10 ? pid.slice(0, 8) + '…' : pid;
        const customerMeta = [h.platform, pidShort].filter(Boolean).join(' • ');
        const imageHtml = h.history_type === 'transaction'
            ? imageCell(h.image_path || h.slip_image_url)
            : '<span class="history-empty-image">ไม่มีสลิป</span>';
        const actionHtml = h.history_type === 'transaction'
            ? (isEditor ? '' : `<button class="btn-small" data-delete-history="${h.id}">ลบ</button>`)
            : `<button class="btn-small" data-view-user="${h.user_id}">ดู user</button>`;
        return `<tr>
                    <td>${rowNum}</td>
                    <td class="history-service-date-cell">${renderHistoryServiceDateCell(h.service_date)}</td>
                    <td class="history-date-cell">${renderHistoryDateCell(h.date || h.created_at)}</td>
                    <td class="history-customer-cell">
                        <div class="history-customer-name">${escapeHtml(customerName)}</div>
                        <div class="history-customer-meta">${escapeHtml(customerMeta || '—')}</div>
                    </td>
                    <td class="history-staff-cell"><div class="history-staff-name">${escapeHtml(staffName)}</div></td>
                    <td>${imageHtml}</td>
                    <td class="history-status-cell"><span class="badge ${statusClass}">${statusText}</span></td>
                    <td class="lottery-num-cell">${lotteryNum}</td>
                    <td class="history-result-cell">${resultBadge || '—'}</td>
                    <td class="history-cashback-cell">${cashbackCell}</td>
                    <td><div class="history-action-group">${actionHtml}</div></td>
                </tr>`;
    }

    function renderHistoryPage() {
        const tbody = document.getElementById('history-body');
        const noMsg = document.getElementById('no-history');
        const filtered = getHistoryFiltered();
        const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
        if (_historyCurrentPage > totalPages) _historyCurrentPage = totalPages;
        if (_historyCurrentPage < 1) _historyCurrentPage = 1;
        const startIdx = (_historyCurrentPage - 1) * HISTORY_PAGE_SIZE;
        const pageData = filtered.slice(startIdx, startIdx + HISTORY_PAGE_SIZE);

        const countEl = document.getElementById('history-filter-count');
        if (countEl) countEl.textContent = filtered.length + ' รายการ';
        const resetBtn = document.getElementById('history-filter-reset');
        const hasFilter = _historyFilter.query || _historyFilter.type !== 'all' || _historyFilter.status !== 'all' || _historyFilter.result !== 'all';
        if (resetBtn) resetBtn.style.display = hasFilter ? '' : 'none';

        if (pageData.length === 0) {
            tbody.innerHTML = '';
            noMsg.classList.remove('hidden');
            renderHistoryPagination(filtered.length, totalPages);
            return;
        }
        noMsg.classList.add('hidden');
        tbody.innerHTML = pageData.map((h, i) => buildHistoryRow(h, startIdx + i + 1)).join('');
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
        tbody.querySelectorAll('[data-view-user]').forEach(btn => {
            btn.addEventListener('click', () => loadUserDetail(btn.dataset.viewUser));
        });
        renderHistoryPagination(filtered.length, totalPages);
    }

    function renderHistoryPagination(total, totalPages) {
        const container = document.getElementById('history-pagination');
        if (!container) return;
        if (total === 0 || totalPages <= 1) { container.innerHTML = ''; return; }
        const p = _historyCurrentPage;
        const pages = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - p) <= 1) pages.push(i);
            else if (Math.abs(i - p) === 2) pages.push('…');
        }
        const deduped = pages.filter((v, idx, arr) => v !== '…' || arr[idx - 1] !== '…');
        const btns = deduped.map(v => v === '…'
            ? `<span class="page-ellipsis">…</span>`
            : `<button class="page-btn${v === p ? ' active' : ''}" data-hpage="${v}">${v}</button>`
        ).join('');
        container.innerHTML = `<button class="page-btn page-prev" data-hpage="prev" ${p <= 1 ? 'disabled' : ''}>◀</button>${btns}<button class="page-btn page-next" data-hpage="next" ${p >= totalPages ? 'disabled' : ''}>▶</button><span class="pagination-info">หน้า ${p}/${totalPages} • ${total} รายการ</span>`;
        container.querySelectorAll('[data-hpage]').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.hpage;
                if (val === 'prev') _historyCurrentPage = Math.max(1, p - 1);
                else if (val === 'next') _historyCurrentPage = Math.min(totalPages, p + 1);
                else _historyCurrentPage = parseInt(val, 10);
                renderHistoryPage();
                document.getElementById('history-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    async function renderHistory() {
        const tbody = document.getElementById('history-body');
        const noMsg = document.getElementById('no-history');
        try {
            const res = await fetch(`${API_BASE}/history`);
            if (!res.ok) throw new Error('fetch-failed');
            _historyAllData = await res.json();
            _historyCurrentPage = 1;
            renderHistoryPage();
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:#f87171;padding:16px;">⚠️ โหลดประวัติไม่สำเร็จ — <button class="btn-small" onclick="renderHistory()">ลองใหม่</button></td></tr>`;
            noMsg.classList.add('hidden');
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
                        showToast('อนุมัติสำเร็จ: ลูกค้าได้ 1 พ้อยสำหรับทายเลข', 'success');
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
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#f87171;padding:16px;">⚠️ โหลดคิวไม่สำเร็จ — <button class="btn-small" onclick="renderApproval()">ลองใหม่</button></td></tr>`;
            noMsg.classList.add('hidden');
        }
    }

    // --- Cashback Summary ---
    async function renderCashbackSummary() {
        try {
            const res = await authFetch(`${API_BASE}/admin/rewards/ledger`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'reward-ledger-failed');
            renderRewardLedger(data);
        } catch (err) {
            console.error('ไม่สามารถโหลดข้อมูล Cashback', err);
            if (rewardLedgerBody) rewardLedgerBody.innerHTML = '';
            if (noRewardLedger) {
                noRewardLedger.textContent = 'ไม่สามารถโหลดข้อมูลสิทธิ์รางวัลได้';
                noRewardLedger.classList.remove('hidden');
            }
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

    btnRefreshStorage?.addEventListener('click', () => {
        renderStorageStatus();
    });

    btnRefreshRewards?.addEventListener('click', () => {
        renderCashbackSummary();
    });

    btnMigrateStorage?.addEventListener('click', async () => {
        const confirmed = window.confirm('ย้ายไฟล์รูปทั้งหมดที่ยังอยู่บน local disk ขึ้น R2 ตอนนี้ใช่หรือไม่?');
        if (!confirmed) return;

        setStorageBusyState(true);
        try {
            const res = await authFetch(`${API_BASE}/admin/storage/migrate`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'storage-migrate-failed');

            renderStorageSummary(data.summary, data.migration);
            showToast(`ย้ายข้อมูลขึ้น R2 แล้ว ${data.migration.migrated_rows || 0} แถว`, 'success');
            renderHistory();
            renderApproval();
            renderStaffGrid();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถย้ายไฟล์ขึ้น R2 ได้', 'error');
        } finally {
            setStorageBusyState(false);
        }
    });

    document.getElementById('btn-user-search')?.addEventListener('click', () => renderUsers(1));
    document.getElementById('btn-user-refresh')?.addEventListener('click', () => {
        if (userSearchInput) userSearchInput.value = '';
        if (userPlatformFilter) userPlatformFilter.value = 'all';
        if (userActivityFilter) userActivityFilter.value = 'all';
        if (userPointFilter) userPointFilter.value = 'all';
        if (userRewardFilter) userRewardFilter.value = 'all';
        if (userReviewFilter) userReviewFilter.value = 'all';
        if (userRankFilter) userRankFilter.value = 'all';
        renderUsers(1);
    });
    btnUserClearFilters?.addEventListener('click', () => {
        if (userSearchInput) userSearchInput.value = '';
        if (userPlatformFilter) userPlatformFilter.value = 'all';
        if (userActivityFilter) userActivityFilter.value = 'all';
        if (userPointFilter) userPointFilter.value = 'all';
        if (userRewardFilter) userRewardFilter.value = 'all';
        if (userReviewFilter) userReviewFilter.value = 'all';
        if (userRankFilter) userRankFilter.value = 'all';
        renderUsers(1);
    });
    btnExportCsv?.addEventListener('click', async () => {
        const reportKey = excelExportReport?.value || 'leaderboard';
        try {
            setExcelAdminStatus(`กำลังสร้างไฟล์ CSV ของ ${reportKey}...`);
            const filename = await downloadExcelAdminFile(
                `${API_BASE}/admin/export/${encodeURIComponent(reportKey)}.csv`,
                `${reportKey}.csv`
            );
            setExcelAdminStatus(`ดาวน์โหลด ${filename} สำเร็จ`, 'success');
            showToast(`ดาวน์โหลด ${filename} แล้ว`, 'success');
        } catch (err) {
            setExcelAdminStatus('ดาวน์โหลด CSV ไม่สำเร็จ', 'error');
            showToast(err.message || 'ไม่สามารถดาวน์โหลด CSV ได้', 'error');
        }
    });
    btnExportXlsx?.addEventListener('click', async () => {
        const reportKey = excelExportReport?.value || 'leaderboard';
        try {
            setExcelAdminStatus(`กำลังสร้างไฟล์ XLSX ของ ${reportKey}...`);
            const filename = await downloadExcelAdminFile(
                `${API_BASE}/admin/export/${encodeURIComponent(reportKey)}.xlsx`,
                `${reportKey}.xlsx`
            );
            setExcelAdminStatus(`ดาวน์โหลด ${filename} สำเร็จ`, 'success');
            showToast(`ดาวน์โหลด ${filename} แล้ว`, 'success');
        } catch (err) {
            setExcelAdminStatus('ดาวน์โหลด XLSX ไม่สำเร็จ', 'error');
            showToast(err.message || 'ไม่สามารถดาวน์โหลด XLSX ได้', 'error');
        }
    });
    btnDownloadEditableXlsx?.addEventListener('click', async () => {
        const reportKey = excelEditableReport?.value || 'members';
        try {
            setExcelAdminStatus(`กำลังสร้างไฟล์แก้ไขของ ${reportKey}...`);
            const filename = await downloadExcelAdminFile(
                `${API_BASE}/admin/export/${encodeURIComponent(reportKey)}-editable.xlsx`,
                `${reportKey}-editable.xlsx`
            );
            setExcelAdminStatus(`ดาวน์โหลดไฟล์แก้ไข ${filename} สำเร็จ`, 'success');
            showToast(`ดาวน์โหลดไฟล์แก้ไข ${filename} แล้ว`, 'success');
        } catch (err) {
            setExcelAdminStatus('ดาวน์โหลดไฟล์แก้ไขไม่สำเร็จ', 'error');
            showToast(err.message || 'ไม่สามารถดาวน์โหลดไฟล์แก้ไขได้', 'error');
        }
    });
    btnImportExcel?.addEventListener('click', async () => {
        const reportKey = excelImportReport?.value || 'members';
        const file = excelImportFile?.files?.[0];
        if (!file) {
            showToast('กรุณาเลือกไฟล์ Excel ก่อนอัปโหลด', 'error');
            return;
        }

        const confirmed = window.confirm(
            reportKey === 'members'
                ? 'ยืนยันอัปโหลดไฟล์ Members เพื่อแก้ไขชื่อ/รูปภาพของผู้ใช้? ถ้ามีแถวผิดแม้แถวเดียว ระบบจะยกเลิกทั้งไฟล์'
                : 'ยืนยันอัปโหลดไฟล์ Reward Claims Current เพื่อสร้างรายการใช้สิทธิ์ใหม่? ถ้ามีแถวผิดแม้แถวเดียว ระบบจะยกเลิกทั้งไฟล์'
        );
        if (!confirmed) return;

        try {
            setExcelAdminStatus(`กำลังอัปโหลด ${file.name}...`);
            if (excelImportResult) {
                excelImportResult.textContent = `กำลังตรวจสอบไฟล์ ${file.name} ...`;
            }
            const data = await importExcelAdminFile(reportKey, file);
            const resultText = reportKey === 'members'
                ? `อัปเดตสำเร็จ ${Number(data.updated || 0).toLocaleString('th-TH')} บัญชี จาก ${Number(data.rowsRead || 0).toLocaleString('th-TH')} แถว`
                : `สร้างรายการใช้สิทธิ์สำเร็จ ${Number(data.inserted || 0).toLocaleString('th-TH')} รายการ จาก ${Number(data.rowsRead || 0).toLocaleString('th-TH')} แถว`;

            if (excelImportResult) {
                excelImportResult.textContent = resultText;
            }
            setExcelAdminStatus('อัปโหลดและบันทึกไฟล์สำเร็จ', 'success');
            showToast(resultText, 'success');
            if (excelImportFile) excelImportFile.value = '';
            await loadExcelImportLogs();

            if (reportKey === 'members') {
                await renderUsers(currentUserPage);
                if (selectedUserId) await loadUserDetail(selectedUserId);
            } else {
                await renderCashbackSummary();
                if (selectedUserId) await loadUserDetail(selectedUserId);
            }
        } catch (err) {
            if (excelImportResult) {
                excelImportResult.textContent = err.message || 'อัปโหลดไฟล์ไม่สำเร็จ';
            }
            setExcelAdminStatus('อัปโหลดไฟล์ไม่สำเร็จ', 'error');
            showToast(err.message || 'ไม่สามารถอัปโหลดไฟล์ได้', 'error');
            await loadExcelImportLogs();
        }
    });
    btnRefreshImportLogs?.addEventListener('click', () => {
        loadExcelImportLogs();
    });
    btnClaimRemaining?.addEventListener('click', () => {
        if (!selectedRewardRow || !rewardClaimAmount) return;
        rewardClaimAmount.value = Number(selectedRewardRow.remaining_amount || 0).toFixed(2);
    });
    btnClearRewardClaim?.addEventListener('click', () => {
        updateRewardClaimSelection(null);
        renderRewardLedger(rewardLedgerState);
    });
    btnSaveRewardClaim?.addEventListener('click', async () => {
        if (!selectedRewardRow) {
            showToast('กรุณาเลือกรายการสิทธิ์ก่อน', 'error');
            return;
        }

        const amount = Number(rewardClaimAmount?.value || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast('กรุณากรอกยอดที่ใช้สิทธิ์ให้ถูกต้อง', 'error');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE}/admin/rewards/claims`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lottery_guess_id: selectedRewardRow.lottery_guess_id,
                    claim_mode: selectedRewardRow.reward_type === 'cashback' ? rewardClaimMode?.value || 'reuse' : null,
                    amount,
                    note: rewardClaimNote?.value || ''
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-reward-claim-failed');

            showToast('บันทึกการใช้สิทธิ์แล้ว', 'success');
            await renderCashbackSummary();
            if (selectedUserId && Number(selectedUserId) === Number(selectedRewardRow.user_id)) {
                await loadUserDetail(selectedUserId);
            }
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกการใช้สิทธิ์ได้', 'error');
        }
    });
    btnUserClaimRemaining?.addEventListener('click', () => {
        if (!selectedUserRewardRow || !userRewardClaimAmount) return;
        userRewardClaimAmount.value = Number(selectedUserRewardRow.remaining_amount || 0).toFixed(2);
    });
    btnClearUserRewardClaim?.addEventListener('click', () => {
        updateUserRewardClaimSelection(null);
    });
    btnSaveUserRewardClaim?.addEventListener('click', async () => {
        if (!selectedUserRewardRow) {
            showToast('กรุณาเลือกรายการสิทธิ์ของ user ก่อน', 'error');
            return;
        }

        const redeemedAt = String(userRewardClaimDate?.value || '').trim();
        if (!redeemedAt) {
            showToast('กรุณาระบุวันที่ใช้สิทธิ์', 'error');
            return;
        }

        const amount = Number(userRewardClaimAmount?.value || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            showToast('กรุณากรอกยอดที่ใช้สิทธิ์ให้ถูกต้อง', 'error');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE}/admin/rewards/claims`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lottery_guess_id: selectedUserRewardRow.lottery_guess_id,
                    claim_mode: selectedUserRewardRow.reward_type === 'cashback' ? userRewardClaimMode?.value || 'reuse' : null,
                    amount,
                    redeemed_at: redeemedAt,
                    note: userRewardClaimNote?.value || ''
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-user-reward-claim-failed');

            showToast('บันทึกการใช้สิทธิ์ของ user แล้ว', 'success');
            await renderCashbackSummary();
            if (selectedUserId) await loadUserDetail(selectedUserId);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกการใช้สิทธิ์ของ user ได้', 'error');
        }
    });
    userSearchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') renderUsers(1);
    });
    userSearchInput?.addEventListener('input', () => {
        window.clearTimeout(userSearchDebounceId);
        userSearchDebounceId = window.setTimeout(() => renderUsers(1), 350);
    });
    [
        userPlatformFilter,
        userActivityFilter,
        userPointFilter,
        userRewardFilter,
        userReviewFilter,
        userRankFilter
    ].forEach((filterEl) => {
        filterEl?.addEventListener('change', () => renderUsers(1));
    });
    userPrevButton?.addEventListener('click', () => {
        if (currentUserPage > 1) renderUsers(currentUserPage - 1);
    });
    userNextButton?.addEventListener('click', () => {
        if (currentUserPage < currentUserTotalPages) renderUsers(currentUserPage + 1);
    });
    document.getElementById('btn-save-user')?.addEventListener('click', async () => {
        if (!selectedUserId) {
            showToast('กรุณาเลือกผู้ใช้ก่อน', 'error');
            return;
        }
        try {
            const res = await authFetch(`${API_BASE}/admin/users/${selectedUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    display_name: userEditDisplayName.value,
                    picture_url: userEditPictureUrl.value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-failed');
            showToast('อัปเดตข้อมูลผู้ใช้แล้ว', 'success');
            renderUsers(currentUserPage);
            loadUserDetail(selectedUserId);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกข้อมูลผู้ใช้ได้', 'error');
        }
    });
    document.getElementById('btn-delete-user')?.addEventListener('click', async () => {
        if (!selectedUserId) {
            showToast('กรุณาเลือกผู้ใช้ก่อน', 'error');
            return;
        }
        const confirmed = window.confirm('ลบ User ถาวรใช่หรือไม่? ระบบจะลบประวัติการใช้บริการและการทายเลขของผู้ใช้นี้ด้วย');
        if (!confirmed) return;
        try {
            const res = await authFetch(`${API_BASE}/admin/users/${selectedUserId}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'delete-failed');
            showToast(`ลบผู้ใช้ ${data.deleted_display_name || ''} แล้ว`, 'success');
            clearUserDetail();
            renderUsers(currentUserPage);
            renderHistory();
            renderApproval();
            renderCashbackSummary();
            updateStats();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถลบผู้ใช้ได้', 'error');
        }
    });

    // --- Sold Out Controls ---
    document.getElementById('btn-add-soldout').addEventListener('click', async () => {
        const input = document.getElementById('sold-out-input');
        const num = parseInt(input.value, 10);
        if (isNaN(num) || num < 0 || num > 99) {
            alert('กรุณากรอกเลข 00-99');
            return;
        }
        const btn = document.getElementById('btn-add-soldout');
        btn.disabled = true;
        try {
            const res = await authFetch(`${API_BASE}/sold-out`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ number: num })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'add-sold-out-failed');
            await renderSoldOut();
            input.value = '';
            showToast(`เพิ่มเลข ${String(num).padStart(2, '0')} เป็น Sold Out แล้ว`, 'success');
        } catch (err) {
            showToast(err.message || 'ไม่สามารถเพิ่มเลข Sold Out ได้', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('btn-remove-soldout').addEventListener('click', async () => {
        const input = document.getElementById('sold-out-input');
        const num = parseInt(input.value, 10);
        if (isNaN(num) || num < 0 || num > 99) {
            alert('กรุณากรอกเลข 00-99');
            return;
        }
        const btn = document.getElementById('btn-remove-soldout');
        btn.disabled = true;
        try {
            const res = await authFetch(`${API_BASE}/sold-out/${num}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'remove-sold-out-failed');
            await renderSoldOut();
            input.value = '';
            showToast(`ปลดเลข ${String(num).padStart(2, '0')} ออกจาก Sold Out แล้ว`, 'success');
        } catch (err) {
            showToast(err.message || 'ไม่สามารถปลด Sold Out ได้', 'error');
        } finally {
            btn.disabled = false;
        }
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
                showToast('ประกาศผลเรียบร้อย — ไม่มีผู้ถูกรางวัล (ทุกคนได้ GV 300 ฿)', 'info');
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
    renderUsers();
    renderStorageStatus();
    updateRewardClaimSelection(null);

    // --- History Filter Bindings ---
    document.getElementById('history-search-input')?.addEventListener('input', e => {
        _historyFilter.query = e.target.value.trim();
        _historyCurrentPage = 1;
        renderHistoryPage();
    });
    document.querySelectorAll('[data-hfilter-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-hfilter-type]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _historyFilter.type = btn.dataset.hfilterType;
            _historyCurrentPage = 1;
            renderHistoryPage();
        });
    });
    document.querySelectorAll('[data-hfilter-status]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-hfilter-status]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _historyFilter.status = btn.dataset.hfilterStatus;
            _historyCurrentPage = 1;
            renderHistoryPage();
        });
    });
    document.querySelectorAll('[data-hfilter-result]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-hfilter-result]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _historyFilter.result = btn.dataset.hfilterResult;
            _historyCurrentPage = 1;
            renderHistoryPage();
        });
    });
    document.getElementById('history-filter-reset')?.addEventListener('click', () => {
        _historyFilter = { query: '', type: 'all', status: 'all', result: 'all' };
        _historyCurrentPage = 1;
        const searchInput = document.getElementById('history-search-input');
        if (searchInput) searchInput.value = '';
        document.querySelectorAll('[data-hfilter-type]').forEach(b => b.classList.toggle('active', b.dataset.hfilterType === 'all'));
        document.querySelectorAll('[data-hfilter-status]').forEach(b => b.classList.toggle('active', b.dataset.hfilterStatus === 'all'));
        document.querySelectorAll('[data-hfilter-result]').forEach(b => b.classList.toggle('active', b.dataset.hfilterResult === 'all'));
        renderHistoryPage();
    });

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
                noDataMsg.classList.remove('hidden');
                summaryEl.classList.add('hidden');
                if (guessChart) { guessChart.destroy(); guessChart = null; }
                return;
            }

            noDataMsg.classList.add('hidden');
            summaryEl.classList.remove('hidden');

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

    async function loadCustomerRankResetDate() {
        if (!customerRankResetCurrent || !customerRankResetDateInput) return;
        try {
            const res = await authFetch(`${API_BASE}/admin/customers/reset-rank`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'load-customer-rank-reset-failed');
            if (data.reset_date) {
                customerRankResetDateInput.value = data.reset_date;
                customerRankResetCurrent.textContent = formatServiceDate(data.reset_date);
            } else {
                customerRankResetDateInput.value = '';
                customerRankResetCurrent.textContent = 'ยังไม่ได้ตั้งค่า';
            }
        } catch (err) {
            customerRankResetCurrent.textContent = 'โหลดไม่สำเร็จ';
        }
    }

    async function loadGuessPointsCycle() {
        if (!guessPointsCycleCurrent || !guessPointsCycleEnd || !guessPointsCycleStart || !guessPointsCycleEndInput) return;
        try {
            const res = await authFetch(`${API_BASE}/admin/guess-points/cycle`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'load-guess-cycle-failed');
            guessPointsCycleStart.value = data.start_date || '';
            guessPointsCycleEndInput.value = data.end_date || '';
            if (data.is_configured === false) {
                guessPointsCycleCurrent.textContent = 'ยังไม่ได้ตั้งค่า (นับพ้อยทั้งหมด)';
                guessPointsCycleEnd.textContent = 'ไม่รีเซ็ตอัตโนมัติ';
            } else {
                guessPointsCycleCurrent.textContent = data.start_date ? formatServiceDate(data.start_date) : 'ยังไม่ได้ตั้งค่า';
                guessPointsCycleEnd.textContent = data.end_date ? formatServiceDate(data.end_date) : '—';
            }
        } catch (err) {
            guessPointsCycleCurrent.textContent = 'โหลดไม่สำเร็จ';
            guessPointsCycleEnd.textContent = 'โหลดไม่สำเร็จ';
        }
    }

    async function loadGuessLockStatus() {
        if (!guessLockStatusBadge) return;
        try {
            const res = await authFetch(`${API_BASE}/admin/guess-lock`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'load-guess-lock-failed');

            const lockFrom = data.lock_from;
            const lockUntil = data.lock_until;
            const now = new Date();
            const isWindowLocked = lockUntil && new Date(lockUntil) > now &&
                                    (!lockFrom || new Date(lockFrom) <= now);
            const isPending = lockFrom && new Date(lockFrom) > now;
            const roundOpen = data.is_round_open;

            if (isWindowLocked) {
                guessLockStatusBadge.textContent = '🔴 ปิดรับทาย (ล็อกโดย Admin)';
                guessLockStatusBadge.className = 'guess-lock-status-badge locked';
                if (guessLockStatusUntil) {
                    const d = new Date(lockUntil);
                    const fromLabel = lockFrom ? ` (ตั้งแต่ ${new Date(lockFrom).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })})` : '';
                    guessLockStatusUntil.textContent = `จนถึง: ${d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}${fromLabel}`;
                    guessLockStatusUntil.classList.remove('hidden');
                }
            } else if (isPending) {
                guessLockStatusBadge.textContent = '🟡 ตั้งเวลาปิดไว้ (ยังไม่ถึงเวลา)';
                guessLockStatusBadge.className = 'guess-lock-status-badge pending';
                if (guessLockStatusUntil) {
                    const fromD = new Date(lockFrom);
                    const untilD = lockUntil ? new Date(lockUntil) : null;
                    guessLockStatusUntil.textContent = `เริ่ม: ${fromD.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}${untilD ? ` → ${untilD.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}` : ''}`;
                    guessLockStatusUntil.classList.remove('hidden');
                }
            } else if (!roundOpen) {
                guessLockStatusBadge.textContent = '🟠 ปิดรับทาย (ระหว่างรอบอัตโนมัติ)';
                guessLockStatusBadge.className = 'guess-lock-status-badge auto-closed';
                if (guessLockStatusUntil) guessLockStatusUntil.classList.add('hidden');
            } else {
                guessLockStatusBadge.textContent = '🟢 เปิดรับทายเลขอยู่';
                guessLockStatusBadge.className = 'guess-lock-status-badge open';
                if (guessLockStatusUntil) guessLockStatusUntil.classList.add('hidden');
            }
        } catch (err) {
            if (guessLockStatusBadge) guessLockStatusBadge.textContent = 'โหลดไม่สำเร็จ';
        }
    }

    async function renderStaffRanking() {
        const highlightGrid = document.getElementById('staff-ranking-highlight-grid');
        const tbody = document.getElementById('staff-ranking-body');
        const emptyMessage = document.getElementById('no-staff-ranking');

        if (!highlightGrid || !tbody || !emptyMessage) return;

        try {
            const res = await fetch(`${API_BASE}/ranking/staff`);
            const staffs = await res.json();

            if (!Array.isArray(staffs) || !staffs.length) {
                highlightGrid.innerHTML = '<div class="staff-ranking-loading-card">ยังไม่มีข้อมูลอันดับพนักงาน</div>';
                tbody.innerHTML = '';
                emptyMessage.textContent = 'ยังไม่มีข้อมูลอันดับพนักงาน';
                emptyMessage.classList.remove('hidden');
                return;
            }

            emptyMessage.classList.add('hidden');

            highlightGrid.innerHTML = staffs.slice(0, 3).map((staff, index) => {
                const rank = index + 1;
                const displayName = staff.nickname || staff.name || '—';
                const subtitle = staff.name && staff.name !== staff.nickname ? `ชื่อจริง ${staff.name}` : 'พนักงานยอดนิยม';
                const avatarSrc = staffAvatarSrc(staff);
                return `<div class="staff-ranking-highlight-card ${rank === 1 ? 'is-first' : ''}">
                    <div class="staff-ranking-highlight-rank">#${rank}</div>
                    <button type="button" class="staff-ranking-avatar-btn" data-staff-preview="${avatarSrc}" data-staff-name="${escapeHtml(displayName)}">
                        <img class="staff-ranking-highlight-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96';if(this.parentElement){this.parentElement.dataset.staffPreview=this.src;}">
                    </button>
                    <div class="staff-ranking-highlight-name">${escapeHtml(displayName)}</div>
                    <div class="staff-ranking-highlight-sub">${escapeHtml(subtitle)}</div>
                    ${renderStaffScoreChips(staff)}
                    <div class="staff-ranking-highlight-meta">ล่าสุด ${staff.last_service_at ? formatDateTime(staff.last_service_at) : 'ยังไม่มีรายการอนุมัติ'}</div>
                    <div class="staff-ranking-highlight-points">${Number(staff.total_votes || 0).toLocaleString('th-TH')} รายการอนุมัติ</div>
                </div>`;
            }).join('');

            tbody.innerHTML = staffs.map((staff, index) => {
                const displayName = staff.nickname || staff.name || '—';
                const subtitle = staff.name && staff.name !== staff.nickname ? staff.name : 'พนักงานยอดนิยม';
                const avatarSrc = staffAvatarSrc(staff);
                return `<tr>
                    <td>${index + 1}</td>
                    <td>
                        <div class="staff-ranking-user-cell">
                            <button type="button" class="staff-ranking-avatar-btn" data-staff-preview="${avatarSrc}" data-staff-name="${escapeHtml(displayName)}">
                                <img class="staff-ranking-table-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96';if(this.parentElement){this.parentElement.dataset.staffPreview=this.src;}">
                            </button>
                            <div>
                                <div class="staff-ranking-user-name">${escapeHtml(displayName)}</div>
                                <div class="staff-ranking-user-sub">${escapeHtml(subtitle)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="staff-ranking-score-cell">${formatStaffScore(staff.avg_score)}</td>
                    <td class="staff-ranking-score-cell">${formatStaffScore(staff.avg_service_score)}</td>
                    <td class="staff-ranking-score-cell">${formatStaffScore(staff.avg_looks_score)}</td>
                    <td class="staff-ranking-score-cell">${formatStaffScore(staff.avg_value_score)}</td>
                    <td>${Number(staff.total_votes || 0).toLocaleString('th-TH')}</td>
                    <td>${staff.last_service_at ? formatDateTime(staff.last_service_at) : '—'}</td>
                </tr>`;
            }).join('');

            document.querySelectorAll('#staff-ranking-highlight-grid [data-staff-preview], #staff-ranking-body [data-staff-preview]').forEach((btn) => {
                btn.addEventListener('click', () => openImageModal(btn.dataset.staffPreview));
            });
        } catch (err) {
            highlightGrid.innerHTML = '<div class="staff-ranking-loading-card">ไม่สามารถโหลดอันดับพนักงานได้</div>';
            tbody.innerHTML = '';
            emptyMessage.textContent = 'ไม่สามารถโหลดอันดับพนักงานได้';
            emptyMessage.classList.remove('hidden');
        }
    }

    async function renderStaffUsageRanking() {
        const highlightGrid = document.getElementById('staff-usage-ranking-highlight-grid');
        const tbody = document.getElementById('staff-usage-ranking-body');
        const emptyMessage = document.getElementById('no-staff-usage-ranking');

        if (!highlightGrid || !tbody || !emptyMessage) return;

        try {
            const res = await fetch(`${API_BASE}/ranking/staff-usage`);
            const staffs = await res.json();

            if (!Array.isArray(staffs) || !staffs.length) {
                highlightGrid.innerHTML = '<div class="staff-ranking-loading-card">ยังไม่มีข้อมูลยอดแจ้งใช้บริการ</div>';
                tbody.innerHTML = '';
                emptyMessage.textContent = 'ยังไม่มีข้อมูลยอดแจ้งใช้บริการ';
                emptyMessage.classList.remove('hidden');
                return;
            }

            emptyMessage.classList.add('hidden');

            highlightGrid.innerHTML = staffs.slice(0, 3).map((staff, index) => {
                const rank = index + 1;
                const displayName = staff.nickname || staff.name || '—';
                const avatarSrc = staffAvatarSrc(staff);
                return `<div class="staff-ranking-highlight-card ${rank === 1 ? 'is-first' : ''}">
                    <div class="staff-ranking-highlight-rank">#${rank}</div>
                    <button type="button" class="staff-ranking-avatar-btn" data-staff-preview="${avatarSrc}" data-staff-name="${escapeHtml(displayName)}">
                        <img class="staff-ranking-highlight-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96';if(this.parentElement){this.parentElement.dataset.staffPreview=this.src;}">
                    </button>
                    <div class="staff-ranking-highlight-name">${escapeHtml(displayName)}</div>
                    <div class="staff-ranking-highlight-sub">วัดจากจำนวนการส่งแจ้งใช้บริการทั้งหมด</div>
                    <div class="staff-ranking-score-chips">
                        <span>ทั้งหมด ${Number(staff.total_submissions || 0).toLocaleString('th-TH')}</span>
                        <span>อนุมัติ ${Number(staff.approved_submissions || 0).toLocaleString('th-TH')}</span>
                        <span>รอตรวจ ${Number(staff.pending_submissions || 0).toLocaleString('th-TH')}</span>
                        <span>ปฏิเสธ ${Number(staff.rejected_submissions || 0).toLocaleString('th-TH')}</span>
                    </div>
                    <div class="staff-ranking-highlight-meta">ล่าสุด ${staff.last_service_at ? formatDateTime(staff.last_service_at) : 'ยังไม่มีรายการ'}</div>
                    <div class="staff-ranking-highlight-points">${Number(staff.total_submissions || 0).toLocaleString('th-TH')} รายการแจ้งใช้บริการ</div>
                </div>`;
            }).join('');

            tbody.innerHTML = staffs.map((staff, index) => {
                const displayName = staff.nickname || staff.name || '—';
                const subtitle = staff.name && staff.name !== staff.nickname ? staff.name : 'ยอดแจ้งใช้บริการ';
                const avatarSrc = staffAvatarSrc(staff);
                return `<tr>
                    <td>${index + 1}</td>
                    <td>
                        <div class="staff-ranking-user-cell">
                            <button type="button" class="staff-ranking-avatar-btn" data-staff-preview="${avatarSrc}" data-staff-name="${escapeHtml(displayName)}">
                                <img class="staff-ranking-table-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96';if(this.parentElement){this.parentElement.dataset.staffPreview=this.src;}">
                            </button>
                            <div>
                                <div class="staff-ranking-user-name">${escapeHtml(displayName)}</div>
                                <div class="staff-ranking-user-sub">${escapeHtml(subtitle)}</div>
                            </div>
                        </div>
                    </td>
                    <td>${Number(staff.total_submissions || 0).toLocaleString('th-TH')}</td>
                    <td>${Number(staff.approved_submissions || 0).toLocaleString('th-TH')}</td>
                    <td>${Number(staff.pending_submissions || 0).toLocaleString('th-TH')}</td>
                    <td>${Number(staff.rejected_submissions || 0).toLocaleString('th-TH')}</td>
                    <td>${staff.last_service_at ? formatDateTime(staff.last_service_at) : '—'}</td>
                </tr>`;
            }).join('');

            document.querySelectorAll('#staff-usage-ranking-highlight-grid [data-staff-preview], #staff-usage-ranking-body [data-staff-preview]').forEach((btn) => {
                btn.addEventListener('click', () => openImageModal(btn.dataset.staffPreview));
            });
        } catch (err) {
            highlightGrid.innerHTML = '<div class="staff-ranking-loading-card">ไม่สามารถโหลดอันดับยอดแจ้งใช้บริการได้</div>';
            tbody.innerHTML = '';
            emptyMessage.textContent = 'ไม่สามารถโหลดอันดับยอดแจ้งใช้บริการได้';
            emptyMessage.classList.remove('hidden');
        }
    }

    // --- Staff Edit Modal ---
    function openStaffEditModal(staffId, name, nickname, avatarSrc) {
        // Remove existing modal if any
        let existing = document.getElementById('staff-edit-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'staff-edit-modal';
        modal.className = 'img-modal-overlay';
        modal.innerHTML = `
            <div class="staff-edit-modal-content">
                <h3>✏️ แก้ไขพนักงาน</h3>
                <div class="staff-edit-avatar-wrap">
                    <img id="staff-edit-avatar-preview" src="${avatarSrc}" alt="avatar" class="staff-edit-avatar-img" onerror="this.src='https://ui-avatars.com/api/?name=S&background=1a1a2e&color=00f0ff&size=120'">
                    <label class="btn-small btn-blue staff-edit-avatar-label">📷 เปลี่ยนรูป
                        <input type="file" id="staff-edit-avatar-file" accept="image/*" hidden>
                    </label>
                </div>
                <label class="staff-edit-label">ชื่อจริง
                    <input type="text" id="staff-edit-name" value="${escapeHtml(name)}" class="staff-edit-input" placeholder="ชื่อจริง">
                </label>
                <label class="staff-edit-label">ชื่อเล่น
                    <input type="text" id="staff-edit-nickname" value="${escapeHtml(nickname)}" class="staff-edit-input" placeholder="ชื่อเล่น">
                </label>
                <div class="staff-edit-actions">
                    <button class="btn-action btn-green" id="staff-edit-save" type="button">💾 บันทึก</button>
                    <button class="btn-action btn-red" id="staff-edit-cancel" type="button">ยกเลิก</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const fileInput = document.getElementById('staff-edit-avatar-file');
        const previewImg = document.getElementById('staff-edit-avatar-preview');
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) {
                previewImg.src = URL.createObjectURL(fileInput.files[0]);
            }
        });

        document.getElementById('staff-edit-cancel').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

        document.getElementById('staff-edit-save').addEventListener('click', async () => {
            const newName = document.getElementById('staff-edit-name').value.trim();
            const newNickname = document.getElementById('staff-edit-nickname').value.trim();
            const formData = new FormData();
            if (newName) formData.append('name', newName);
            if (newNickname) formData.append('nickname', newNickname);
            if (fileInput.files && fileInput.files[0]) {
                formData.append('avatar', fileInput.files[0]);
            }
            try {
                const res = await authFetch(`${API_BASE}/staffs/${staffId}`, { method: 'PUT', body: formData });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'update failed');
                showToast('อัปเดตข้อมูลพนักงานแล้ว', 'success');
                modal.remove();
                renderStaffGrid();
                renderStaffRanking();
                renderStaffUsageRanking();
            } catch (err) {
                showToast('ไม่สามารถอัปเดตข้อมูลพนักงานได้: ' + err.message, 'error');
            }
        });
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
                const displayName = s.nickname || s.name || '—';
                const avatarSrc = s.avatar_url
                    ? resolveAssetUrl(s.avatar_url)
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=80`;
                const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=80`;
                const statusClass = s.is_active ? 'staff-active' : 'staff-inactive';
                const statusText = s.is_active ? '✅ ใช้งาน' : '❌ ปิดใช้งาน';
                return `<div class="staff-card ${statusClass}">
                    <button type="button" class="staff-card-avatar-btn" data-staff-preview="${avatarSrc}" data-staff-name="${escapeHtml(displayName)}" title="คลิกเพื่อดูรูป">
                        <img class="staff-card-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.onerror=null;this.src='${fallbackAvatar}';if(this.parentElement){this.parentElement.dataset.staffPreview='${fallbackAvatar}';}">
                    </button>
                    <div class="staff-card-info">
                        <div class="staff-card-name">${escapeHtml(displayName)}</div>
                        <span class="staff-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="staff-card-actions">
                        <button class="btn-small btn-blue" data-edit-staff="${s.id}" data-edit-name="${escapeHtml(s.name || '')}" data-edit-nickname="${escapeHtml(s.nickname || '')}" data-edit-avatar="${avatarSrc}" type="button">✏️ แก้ไข</button>
                        ${s.is_active
                            ? `<button class="btn-small btn-red" data-deactivate-staff="${s.id}">ปิดใช้งาน</button>`
                            : `<button class="btn-small btn-green" data-activate-staff="${s.id}">เปิดใช้งาน</button>`
                        }
                        ${isEditor ? '' : `<button class="btn-small btn-red" data-delete-staff="${s.id}" type="button">ลบถาวร</button>`}
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
                    renderStaffRanking();
                    renderStaffUsageRanking();
                });
            });
            grid.querySelectorAll('[data-activate-staff]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const formData = new FormData();
                    formData.append('is_active', 'true');
                    await authFetch(`${API_BASE}/staffs/${btn.dataset.activateStaff}`, { method: 'PUT', body: formData });
                    showToast('เปิดใช้งานพนักงานแล้ว', 'success');
                    renderStaffGrid();
                    renderStaffRanking();
                    renderStaffUsageRanking();
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
                        renderStaffRanking();
                        renderStaffUsageRanking();
                        renderHistory();
                        renderApproval();
                    } catch (err) {
                        showToast('ไม่สามารถลบพนักงานได้', 'error');
                    }
                });
            });
            grid.querySelectorAll('[data-staff-preview]').forEach(btn => {
                btn.addEventListener('click', () => openImageModal(btn.dataset.staffPreview));
            });
            // Bind edit staff
            grid.querySelectorAll('[data-edit-staff]').forEach(btn => {
                btn.addEventListener('click', () => {
                    openStaffEditModal(btn.dataset.editStaff, btn.dataset.editName, btn.dataset.editNickname, btn.dataset.editAvatar);
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
    function resetStaffAvatarPreview() {
        if (staffPreviewImg) staffPreviewImg.removeAttribute('src');
        if (staffPreview) staffPreview.hidden = true;
    }

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
            resetStaffAvatarPreview();
        });
    }

    resetStaffAvatarPreview();

    // Add staff
    document.getElementById('btn-add-staff').addEventListener('click', async () => {
        const nameInput = document.getElementById('staff-name-input');
        const name = nameInput.value.trim();
        if (!name) { showToast('กรุณากรอกชื่อเล่นพนักงาน', 'error'); return; }

        const formData = new FormData();
        formData.append('name', name);
        formData.append('nickname', name);
        if (staffAvatarInput.files.length > 0) formData.append('avatar', staffAvatarInput.files[0]);

        try {
            const res = await authFetch(`${API_BASE}/staffs`, { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(`เพิ่มพนักงาน "${name}" สำเร็จ`, 'success');
                nameInput.value = '';
                staffAvatarInput.value = '';
                resetStaffAvatarPreview();
                renderStaffGrid();
                renderStaffRanking();
                renderStaffUsageRanking();
            } else {
                showToast(data.error || 'ไม่สามารถเพิ่มพนักงานได้', 'error');
            }
        } catch (err) {
            showToast('เกิดข้อผิดพลาดในการเพิ่มพนักงาน', 'error');
        }
    });

    const btnRefreshStaffRanking = document.getElementById('btn-refresh-staff-ranking');
    if (btnRefreshStaffRanking) {
        btnRefreshStaffRanking.addEventListener('click', renderStaffRanking);
    }

    const btnRefreshStaffUsageRanking = document.getElementById('btn-refresh-staff-usage-ranking');
    if (btnRefreshStaffUsageRanking) {
        btnRefreshStaffUsageRanking.addEventListener('click', renderStaffUsageRanking);
    }

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

    btnSaveCustomerRankReset?.addEventListener('click', async () => {
        const date = customerRankResetDateInput?.value;
        if (!date) {
            showToast('กรุณาเลือกวันที่รีแรงค์ลูกค้า', 'error');
            return;
        }
        try {
            const res = await authFetch(`${API_BASE}/admin/customers/reset-rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-customer-rank-reset-failed');
            showToast(`ตั้งวันที่รีแรงค์ลูกค้าเป็น ${formatServiceDate(date)} แล้ว`, 'success');
            await loadCustomerRankResetDate();
            renderUsers(currentUserPage);
            if (selectedUserId) loadUserDetail(selectedUserId);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกวันที่รีแรงค์ลูกค้าได้', 'error');
        }
    });

    btnSaveGuessPointsCycle?.addEventListener('click', async () => {
        const startDate = guessPointsCycleStart?.value;
        const endDate = guessPointsCycleEndInput?.value;
        if (!startDate || !endDate) {
            showToast('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดของรอบแต้มทายเลข', 'error');
            return;
        }
        if (endDate < startDate) {
            showToast('วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น', 'error');
            return;
        }

        try {
            const res = await authFetch(`${API_BASE}/admin/guess-points/cycle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_date: startDate, end_date: endDate })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-guess-cycle-failed');
            showToast(`ตั้งรอบสะสมแต้มทายเลข ${formatServiceDate(startDate)} ถึง ${formatServiceDate(endDate)} แล้ว`, 'success');
            loadGuessPointsCycle();
            if (selectedUserId) loadUserDetail(selectedUserId);
            renderUsers(currentUserPage);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกรอบสะสมแต้มทายเลขได้', 'error');
        }
    });

    btnClearGuessPointsCycle?.addEventListener('click', async () => {
        if (!confirm('ยกเลิกการรีเซ็ตพ้อยทายเลข และกลับไปนับพ้อยทั้งหมดของลูกค้าทุกคน?')) return;

        btnClearGuessPointsCycle.disabled = true;
        const originalText = btnClearGuessPointsCycle.textContent;
        btnClearGuessPointsCycle.textContent = 'กำลังยกเลิก...';

        try {
            const res = await authFetch(`${API_BASE}/admin/guess-points/cycle`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'clear-guess-cycle-failed');
            if (guessPointsCycleStart) guessPointsCycleStart.value = '';
            if (guessPointsCycleEndInput) guessPointsCycleEndInput.value = '';
            showToast('ยกเลิกการรีเซ็ตพ้อยทายเลขแล้ว ระบบจะนับพ้อยทั้งหมด', 'success');
            loadGuessPointsCycle();
            renderUsers(currentUserPage);
            if (selectedUserId) loadUserDetail(selectedUserId);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถยกเลิกการรีเซ็ตพ้อยทายเลขได้', 'error');
        } finally {
            btnClearGuessPointsCycle.disabled = false;
            btnClearGuessPointsCycle.textContent = originalText;
        }
    });

    btnRecheckGuessPoints?.addEventListener('click', async () => {
        btnRecheckGuessPoints.disabled = true;
        const originalText = btnRecheckGuessPoints.textContent;
        btnRecheckGuessPoints.textContent = 'กำลังรีเช็ค...';
        if (guessPointsRecheckStatus) guessPointsRecheckStatus.textContent = 'กำลังตรวจข้อมูลพ้อย...';

        try {
            const res = await authFetch(`${API_BASE}/admin/guess-points/reconcile`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'recheck-guess-points-failed');

            const summaryText = `เติม ${Number(data.inserted_approved_points || 0).toLocaleString('th-TH')} พ้อย, ยกยอดเก่ากลับ ${Number(data.carried_over_points || 0).toLocaleString('th-TH')} พ้อย/${Number(data.carryover_users || 0).toLocaleString('th-TH')} user, ลบรายการผิด ${Number((data.removed_invalid_approved_points || 0) + (data.removed_orphan_spend_points || 0)).toLocaleString('th-TH')} รายการ, เพิกถอนเลขเกินสิทธิ์ ${Number(data.revoked_lottery_guesses || 0).toLocaleString('th-TH')} รายการ, ซิงก์ ${Number(data.synced_users || 0).toLocaleString('th-TH')} user`;
            if (guessPointsRecheckStatus) guessPointsRecheckStatus.textContent = summaryText;
            showToast(`รีเช็คพ้อยทายเลขแล้ว: ${summaryText}`, 'success');
            loadGuessPointsCycle();
            renderUsers(currentUserPage);
            if (selectedUserId) loadUserDetail(selectedUserId);
        } catch (err) {
            if (guessPointsRecheckStatus) guessPointsRecheckStatus.textContent = 'รีเช็คไม่สำเร็จ';
            showToast(err.message || 'ไม่สามารถรีเช็คพ้อยทายเลขได้', 'error');
        } finally {
            btnRecheckGuessPoints.disabled = false;
            btnRecheckGuessPoints.textContent = originalText;
        }
    });

    // --- Guess Lock Controls ---
    btnGuessLock?.addEventListener('click', async () => {
        const lockUntilVal = guessLockUntilInput?.value;
        if (!lockUntilVal) {
            showToast('กรุณาเลือกวันเวลา "ปิดจนถึง" อย่างน้อย', 'error');
            return;
        }
        const isoUntil = new Date(lockUntilVal).toISOString();
        const lockFromVal = guessLockFromInput?.value;
        const isoFrom = lockFromVal ? new Date(lockFromVal).toISOString() : null;
        if (isoFrom && isoFrom >= isoUntil) {
            showToast('วันเวลาเริ่มปิดต้องน้อยกว่าวันเวลาปิดจนถึง', 'error');
            return;
        }
        try {
            const res = await authFetch(`${API_BASE}/admin/guess-lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lock_from: isoFrom, lock_until: isoUntil })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'lock-failed');
            showToast(data.message || 'ตั้งเวลาปิดรับทายเลขแล้ว', 'success');
            loadGuessLockStatus();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถตั้งเวลาปิดรับทายเลขได้', 'error');
        }
    });

    btnGuessUnlock?.addEventListener('click', async () => {
        try {
            const res = await authFetch(`${API_BASE}/admin/guess-lock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lock_from: null, lock_until: null })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'unlock-failed');
            showToast(data.message || 'ยกเลิกการล็อครับทายเลขแล้ว', 'success');
            if (guessLockFromInput) guessLockFromInput.value = '';
            if (guessLockUntilInput) guessLockUntilInput.value = '';
            loadGuessLockStatus();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถยกเลิกการล็อคได้', 'error');
        }
    });

    // --- Draw Schedule Controls ---
    const THAI_MONTHS_FULL_ADMIN = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const adminDrawScheduleGrid = document.getElementById('admin-draw-schedule-grid');
    const btnSaveDrawSchedule = document.getElementById('btn-save-draw-schedule');
    const btnReloadDrawSchedule = document.getElementById('btn-reload-draw-schedule');
    const btnResetDrawSchedule = document.getElementById('btn-reset-draw-schedule');

    function renderDrawScheduleEditor(schedule) {
        if (!adminDrawScheduleGrid) return;
        // Group by month
        const byMonth = {};
        for (const e of schedule) {
            if (!byMonth[e.month]) byMonth[e.month] = {};
            byMonth[e.month][e.slot] = e;
        }
        let html = `<table class="schedule-editor-table" style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr>
                <th style="text-align:left;padding:6px 8px;">เดือน</th>
                <th style="padding:6px 8px;">งวดที่ 1 (สล็อต A)</th>
                <th style="padding:6px 8px;">งวดที่ 2 (สล็อต B)</th>
            </tr></thead><tbody>`;
        for (let m = 1; m <= 12; m++) {
            const a = byMonth[m]?.A;
            const b = byMonth[m]?.B;
            html += `<tr>
                <td style="padding:6px 8px;">🗃️ ${THAI_MONTHS_FULL_ADMIN[m-1]}</td>
                <td style="padding:4px 8px;">
                    <input type="date" class="schedule-date-input" data-month="${m}" data-slot="A"
                           value="${a?.date || ''}" style="width:140px;">
                    <span class="schedule-dow" style="font-size:11px;color:#aaa;margin-left:4px;">${a?.dayOfWeek || ''}</span>
                </td>
                <td style="padding:4px 8px;">
                    <input type="date" class="schedule-date-input" data-month="${m}" data-slot="B"
                           value="${b?.date || ''}" style="width:140px;">
                    <span class="schedule-dow" style="font-size:11px;color:#aaa;margin-left:4px;">${b?.dayOfWeek || ''}</span>
                </td>
            </tr>`;
        }
        html += '</tbody></table>';
        adminDrawScheduleGrid.innerHTML = html;
        // Update day-of-week display on change
        adminDrawScheduleGrid.querySelectorAll('.schedule-date-input').forEach(input => {
            input.addEventListener('change', () => {
                const dowSpan = input.nextElementSibling;
                if (!dowSpan) return;
                if (input.value) {
                    const d = new Date(input.value + 'T00:00:00');
                    const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
                    dowSpan.textContent = days[d.getDay()];
                } else {
                    dowSpan.textContent = '';
                }
            });
        });
    }

    async function loadDrawSchedule() {
        if (!adminDrawScheduleGrid) return;
        adminDrawScheduleGrid.innerHTML = '<p class="empty-msg">กำลังโหลดตาราง...</p>';
        try {
            const res = await authFetch(`${API_BASE}/admin/draw-schedule`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'load-schedule-failed');
            renderDrawScheduleEditor(data.schedule);
        } catch (err) {
            adminDrawScheduleGrid.innerHTML = `<p class="empty-msg" style="color:#e57373;">โหลดตารางไม่สำเร็จ: ${err.message}</p>`;
        }
    }

    btnSaveDrawSchedule?.addEventListener('click', async () => {
        const inputs = adminDrawScheduleGrid?.querySelectorAll('.schedule-date-input') || [];
        const schedule = [];
        for (const input of inputs) {
            const m = parseInt(input.dataset.month, 10);
            const slot = input.dataset.slot;
            const date = input.value;
            if (!date) { showToast(`กรุณากรอกวันที่ เดือน ${THAI_MONTHS_FULL_ADMIN[m-1]} สล็อต ${slot}`, 'error'); return; }
            schedule.push({ month: m, slot, date });
        }
        try {
            btnSaveDrawSchedule.disabled = true;
            const res = await authFetch(`${API_BASE}/admin/draw-schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-schedule-failed');
            showToast('บันทึกตารางวันออกรางวัลแล้ว', 'success');
            renderDrawScheduleEditor(data.schedule);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกตารางวันออกรางวัลได้', 'error');
        } finally {
            if (btnSaveDrawSchedule) btnSaveDrawSchedule.disabled = false;
        }
    });

    btnReloadDrawSchedule?.addEventListener('click', loadDrawSchedule);

    btnResetDrawSchedule?.addEventListener('click', async () => {
        if (!confirm('คืนค่าเริ่มต้น (วันที่ 1 และ 16 ทุกเดือน) ใช่หรือไม่?')) return;
        // Build default schedule
        const schedule = [];
        const ceYear = 2026;
        for (let m = 1; m <= 12; m++) {
            schedule.push({ month: m, slot: 'A', date: `${ceYear}-${String(m).padStart(2,'0')}-01` });
            schedule.push({ month: m, slot: 'B', date: `${ceYear}-${String(m).padStart(2,'0')}-16` });
        }
        try {
            const res = await authFetch(`${API_BASE}/admin/draw-schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schedule })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'reset-schedule-failed');
            showToast('คืนค่าตารางเริ่มต้นแล้ว', 'success');
            renderDrawScheduleEditor(data.schedule);
        } catch (err) {
            showToast(err.message || 'ไม่สามารถคืนค่าเริ่มต้นได้', 'error');
        }
    });

    adminAccountSelect?.addEventListener('change', () => {
        selectedAdminAccountId = adminAccountSelect.value || '';
        syncAdminAccountForm();
        renderAdminAccountList();
    });

    btnRefreshAdminAccounts?.addEventListener('click', loadAdminAccounts);

    btnSaveAdminAccount?.addEventListener('click', async () => {
        const username = adminAccountUsername?.value?.trim() || '';
        const password = adminAccountPassword?.value || '';
        const role = adminAccountRole?.value || 'editor';
        const selectedAccount = getSelectedAdminAccount();

        if (!username) {
            showToast('กรุณากรอก username ของผู้ดูแล', 'error');
            return;
        }
        if (!selectedAccount && password.length < 8) {
            showToast('รหัสผ่านผู้ดูแลใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            return;
        }
        if (selectedAccount && password && password.length < 8) {
            showToast('ถ้าจะเปลี่ยนรหัสผ่าน ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            return;
        }

        const originalText = btnSaveAdminAccount.textContent;
        btnSaveAdminAccount.disabled = true;
        btnSaveAdminAccount.textContent = selectedAccount ? 'กำลังอัปเดต...' : 'กำลังสร้าง...';

        try {
            const payload = { username, role };
            if (password) payload.password = password;

            const res = await authFetch(
                selectedAccount
                    ? `${API_BASE}/admin/accounts/${selectedAccount.id}`
                    : `${API_BASE}/admin/accounts`,
                {
                    method: selectedAccount ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                }
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'save-admin-account-failed');

            if (selectedAccount) {
                showToast(`อัปเดตผู้ดูแล "${username}" แล้ว`, 'success');
                if (selectedAccount.is_current) {
                    currentAdminSession = {
                        ...currentAdminSession,
                        username,
                        role
                    };
                    sessionStorage.setItem('admin_user', currentAdminSession.username || '');
                    sessionStorage.setItem('admin_role', currentAdminSession.role || 'admin');
                    renderAdminAccountSession();
                }
            } else {
                showToast(`สร้างผู้ดูแล "${username}" แล้ว`, 'success');
                selectedAdminAccountId = '';
            }

            await loadAdminAccounts();
            if (!selectedAccount) syncAdminAccountForm();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถบันทึกผู้ดูแลได้', 'error');
        } finally {
            btnSaveAdminAccount.disabled = false;
            btnSaveAdminAccount.textContent = originalText;
        }
    });

    btnResetAdminPassword?.addEventListener('click', async () => {
        const selectedAccount = getSelectedAdminAccount();
        const password = adminAccountPassword?.value || '';

        if (!selectedAccount) {
            showToast('กรุณาเลือกบัญชีผู้ดูแลก่อนรีเซ็ตรหัสผ่าน', 'error');
            return;
        }
        if (password.length < 8) {
            showToast('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร', 'error');
            return;
        }

        const originalText = btnResetAdminPassword.textContent;
        btnResetAdminPassword.disabled = true;
        btnResetAdminPassword.textContent = 'กำลังรีเซ็ต...';

        try {
            const res = await authFetch(`${API_BASE}/admin/accounts/${selectedAccount.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: selectedAccount.username,
                    role: selectedAccount.role,
                    password
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'reset-admin-password-failed');

            if (adminAccountPassword) adminAccountPassword.value = '';
            showToast(`รีเซ็ตรหัสผ่านของ "${selectedAccount.username}" แล้ว`, 'success');
            syncAdminAccountForm();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถรีเซ็ตรหัสผ่านได้', 'error');
        } finally {
            btnResetAdminPassword.textContent = originalText;
            btnResetAdminPassword.disabled = !getSelectedAdminAccount();
        }
    });

    btnDeleteAdminAccount?.addEventListener('click', async () => {
        const selectedAccount = getSelectedAdminAccount();
        if (!selectedAccount) {
            showToast('กรุณาเลือกบัญชีผู้ดูแลก่อนลบ', 'error');
            return;
        }

        const confirmed = window.confirm(`ลบบัญชีผู้ดูแล "${selectedAccount.username}" ใช่หรือไม่?`);
        if (!confirmed) return;

        const originalText = btnDeleteAdminAccount.textContent;
        btnDeleteAdminAccount.disabled = true;
        btnDeleteAdminAccount.textContent = 'กำลังลบ...';

        try {
            const res = await authFetch(`${API_BASE}/admin/accounts/${selectedAccount.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'delete-admin-account-failed');

            showToast(`ลบผู้ดูแล "${selectedAccount.username}" แล้ว`, 'success');
            selectedAdminAccountId = '';
            await loadAdminAccounts();
            syncAdminAccountForm();
        } catch (err) {
            showToast(err.message || 'ไม่สามารถลบผู้ดูแลได้', 'error');
            btnDeleteAdminAccount.disabled = !!getSelectedAdminAccount()?.is_current;
        } finally {
            btnDeleteAdminAccount.textContent = originalText;
        }
    });

    loadAdminAccounts();
    loadExcelImportLogs();
    renderStaffGrid();
    renderStaffRanking();
    renderStaffUsageRanking();
    loadRankingResetDate();
    loadCustomerRankResetDate();
    loadGuessPointsCycle();
    loadGuessLockStatus();
    loadDrawSchedule();

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
        sessionStorage.removeItem('admin_role');
        window.location.href = ADMIN_LOGIN_PATH;
    });

    // ==================== PREDICTION STATUS TAB ====================
    let adminStatusAllHistory = [];
    let adminStatusCurrentFilter = 'all';

    async function adminLoadStatusData() {
        try {
            const res = await authFetch(`${API_BASE}/history`);
            adminStatusAllHistory = await res.json();
        } catch {
            adminStatusAllHistory = [];
        }
        adminUpdateStatusCounts();
        adminRenderStatusTable();
    }

    function adminGetStatus(h) {
        if (h.approved === 'pending') return { text: '⏳ รออนุมัติ', cls: 'badge-pending', group: 'pending' };
        if (h.approved === 'rejected') return { text: '❌ ไม่อนุมัติ', cls: 'badge-rejected', group: 'rejected' };
        if (h.lottery_result === 'won') return { text: '🎉 ถูกรางวัล!', cls: 'badge-won', group: 'decided' };
        if (h.lottery_result === 'lost') return { text: '❌ ไม่ถูก', cls: 'badge-lost', group: 'decided' };
        return { text: '✅ รอผลออก', cls: 'badge-approved', group: 'approved' };
    }

    function adminUpdateStatusCounts() {
        let pending = 0, approved = 0, decided = 0;
        adminStatusAllHistory.forEach(h => {
            const s = adminGetStatus(h);
            if (s.group === 'pending') pending++;
            else if (s.group === 'approved') approved++;
            else if (s.group === 'decided') decided++;
        });
        document.getElementById('admin-stat-total').textContent = adminStatusAllHistory.length;
        document.getElementById('admin-stat-pending').textContent = pending;
        document.getElementById('admin-stat-approved').textContent = approved;
        document.getElementById('admin-stat-decided').textContent = decided;
    }

    function adminRenderStatusTable() {
        const tbody = document.getElementById('admin-status-body');
        const emptyDiv = document.getElementById('admin-status-empty');

        const filtered = adminStatusCurrentFilter === 'all'
            ? adminStatusAllHistory
            : adminStatusAllHistory.filter(h => adminGetStatus(h).group === adminStatusCurrentFilter);

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            emptyDiv.style.display = '';
            return;
        }

        emptyDiv.style.display = 'none';
        tbody.innerHTML = filtered.map((h, i) => {
            const s = adminGetStatus(h);
            const date = new Date(h.created_at || h.date);
            const dateStr = Number.isNaN(date.getTime())
                ? '—'
                : `${date.toLocaleDateString('th-TH')} ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
            const customerName = h.customer_name || h.display_name || h.name || '—';
            const guessNumber = h.guess_number ? String(h.guess_number).padStart(2, '0') : 'รอทาย';
            return `<tr>
                <td data-label="#"><span style="font-family:'Orbitron',monospace; color:var(--neon-cyan); font-weight:700;">${i + 1}</span></td>
                <td data-label="ชื่อ"><span style="font-weight:700; color:var(--text-silver); line-height:1.35;">${escapeHtml(customerName)}</span></td>
                <td data-label="เลข"><span style="font-family:'Orbitron',monospace; color:var(--gold); font-weight:900; letter-spacing:0.08em;">${escapeHtml(guessNumber)}</span></td>
                <td data-label="วันที่"><span style="line-height:1.45; color:var(--text-muted);">${escapeHtml(dateStr)}</span></td>
                <td data-label="สถานะ"><span class="badge ${s.cls}" style="display:inline-flex; align-items:center; justify-content:center; min-height:30px; padding:3px 10px; border-radius:12px; font-size:0.8rem; font-weight:bold; text-align:center; line-height:1.15; white-space:nowrap;">${s.text}</span></td>
            </tr>`;
        }).join('');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(text ?? ''));
        return div.innerHTML;
    }

    // Filter buttons for prediction status
    document.querySelectorAll('.admin-status-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.admin-status-filter-btn.active').classList.remove('active');
            btn.classList.add('active');
            btn.style.borderColor = 'var(--neon-red)';
            btn.style.color = 'var(--neon-red)';
            btn.style.background = 'rgba(255, 60, 60, 0.1)';
            adminStatusCurrentFilter = btn.dataset.filter;
            adminRenderStatusTable();
        });
    });

    // Load prediction status data when tab is activated
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.dataset.tab === 'prediction-status') {
                adminLoadStatusData();
            }
        });
    });

    // Initial load for prediction status
    adminLoadStatusData();
    // Auto-refresh every 15 seconds
    setInterval(adminLoadStatusData, 15000);
});

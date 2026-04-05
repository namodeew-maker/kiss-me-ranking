const API_BASE = '/api';

// ==================== GLOBAL STATE ====================
let currentUser = null; // { id, platform, platform_id, display_name, picture_url, progress_count }

document.addEventListener('DOMContentLoaded', () => {

    // ==================== DOM REFERENCES ====================
    const termsOverlay = document.getElementById('terms-overlay');
    const loginOptions = document.getElementById('login-options');
    const mainContent = document.getElementById('main-content');
    const termsAgree = document.getElementById('terms-agree');
    const btnAccept = document.getElementById('btn-terms-accept');

    // ==================== LIFF STATE ====================
    let liffInitialized = false;

    // Restore currentUser from session immediately (sync)
    if (!currentUser) {
        const saved = sessionStorage.getItem('currentUser');
        if (saved) {
            try { currentUser = JSON.parse(saved); } catch (_) { /* ignore */ }
        }
    }

    // ==================== TERMS GATE (bind FIRST, before any async) ====================
    if (currentUser) {
        sessionStorage.setItem('terms_accepted', 'true');
        termsOverlay.classList.add('hidden');
        showLoginOrMain();
    } else if (sessionStorage.getItem('terms_accepted')) {
        termsOverlay.classList.add('hidden');
        showLoginOrMain();
    }

    termsAgree.addEventListener('change', () => {
        btnAccept.disabled = !termsAgree.checked;
        btnAccept.classList.toggle('enabled', termsAgree.checked);
    });

    btnAccept.addEventListener('click', () => {
        sessionStorage.setItem('terms_accepted', 'true');
        termsOverlay.classList.add('hidden');
        showLoginOrMain();
    });

    // "View terms" button from main page
    const btnViewTerms = document.getElementById('btn-view-terms');
    if (btnViewTerms) {
        btnViewTerms.addEventListener('click', () => {
            termsOverlay.classList.remove('hidden');
            mainContent.style.display = 'none';
            loginOptions.style.display = 'none';
            termsAgree.checked = true;
            btnAccept.disabled = false;
            btnAccept.classList.add('enabled');
        });
    }

    // ==================== LIFF AUTO-LOGIN (non-blocking) ====================
    (async () => {
        try {
            if (typeof liff !== 'undefined') {
                await liff.init({ liffId: '2009696727-evibES3H' });
                liffInitialized = true;
                // If LIFF user is logged in, register with backend immediately
                if (liff.isLoggedIn() && !sessionStorage.getItem('currentUser')) {
                    const profile = await liff.getProfile();
                    const res = await fetch(`${API_BASE}/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            platform: 'line',
                            platform_id: profile.userId,
                            display_name: profile.displayName,
                            picture_url: profile.pictureUrl || null
                        })
                    });
                    const data = await res.json();
                    if (res.ok && data.user) {
                        currentUser = data.user;
                        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                        // Auto-skip terms + show main if LIFF login succeeded
                        sessionStorage.setItem('terms_accepted', 'true');
                        termsOverlay.classList.add('hidden');
                        showLoginOrMain();
                    }
                }
            }
        } catch (liffErr) {
            console.warn('LIFF auto-init:', liffErr.message);
        }
    })();

    // ==================== LOGIN / AUTH ====================

    /** Central login function — calls backend and stores currentUser */
    async function loginToBackend(userData) {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: userData.platform,
                    platform_id: userData.platform_id,
                    display_name: userData.display_name,
                    picture_url: userData.picture_url
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert('เข้าสู่ระบบล้มเหลว: ' + (data.error || 'Unknown error'));
                return false;
            }
            currentUser = data.user;
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            onLoginSuccess();
            return true;
        } catch (err) {
            console.error('Login error:', err);
            alert('ไม่สามารถเชื่อมต่อ Server ได้');
            return false;
        }
    }

    /** Show login options or main content based on currentUser */
    function showLoginOrMain() {
        const logoutBtn = document.getElementById('btn-logout');
        if (currentUser) {
            loginOptions.style.display = 'none';
            mainContent.style.display = '';
            if (logoutBtn) logoutBtn.style.display = '';
            updateProfileUI();
        } else {
            loginOptions.style.display = '';
            mainContent.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    }

    /** Logout — clear session and reload */
    function handleLogout() {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('terms_accepted');
        currentUser = null;
        // LIFF logout if available
        try { if (typeof liff !== 'undefined' && liff.isLoggedIn()) liff.logout(); } catch (e) { /* ignore */ }
        window.location.reload();
    }

    // Bind logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    /** After successful login — hide login, show main */
    function onLoginSuccess() {
        loginOptions.style.display = 'none';
        mainContent.style.display = '';
        updateProfileUI();
    }

    /** Update header LIFF profile area with currentUser info */
    function updateProfileUI() {
        if (!currentUser) return;
        const avatar = document.getElementById('liff-avatar');
        const nameEl = document.getElementById('liff-name');
        if (avatar && currentUser.picture_url) {
            avatar.src = currentUser.picture_url;
        } else if (avatar) {
            avatar.style.display = 'none';
        }
        if (nameEl) {
            nameEl.textContent = currentUser.display_name || currentUser.platform_id;
        }
    }

    // --- LINE Login ---
    const btnLoginLine = document.getElementById('btn-login-line');
    if (btnLoginLine) {
        btnLoginLine.addEventListener('click', async () => {
            btnLoginLine.disabled = true;
            btnLoginLine.textContent = 'กำลังเข้าสู่ระบบ...';
            try {
                if (!liffInitialized) {
                    await liff.init({ liffId: '2009696727-evibES3H' });
                    liffInitialized = true;
                }
                if (!liff.isLoggedIn()) {
                    liff.login();
                    return; // page will redirect
                }
                const profile = await liff.getProfile();
                await loginToBackend({
                    platform: 'line',
                    platform_id: profile.userId,
                    display_name: profile.displayName,
                    picture_url: profile.pictureUrl || null
                });
            } catch (err) {
                console.error('LINE login error:', err);
                alert('เข้าสู่ระบบ LINE ล้มเหลว');
            } finally {
                btnLoginLine.disabled = false;
                btnLoginLine.innerHTML = '<svg class="login-btn-icon" viewBox="0 0 24 24" width="24" height="24"><path fill="#fff" d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg><span>เข้าสู่ระบบด้วย LINE</span>';
            }
        });
    }

    // --- Telegram Login ---
    const btnLoginTelegram = document.getElementById('btn-login-telegram');
    if (btnLoginTelegram) {
        btnLoginTelegram.addEventListener('click', () => {
            // Trigger the hidden Telegram widget
            const widgetContainer = document.getElementById('telegram-widget-container');
            if (widgetContainer) {
                widgetContainer.style.display = 'block';
                btnLoginTelegram.style.display = 'none';
            }
        });
    }

    /** Telegram Widget callback — attached to window for the widget's data-onauth */
    window.onTelegramAuth = async function(user) {
        const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ');
        await loginToBackend({
            platform: 'telegram',
            platform_id: String(user.id),
            display_name: displayName,
            picture_url: user.photo_url || null
        });
    };

    // ==================== PROFILE MODAL ====================
    // Profile is now a separate page (profile.html) — no modal logic needed here

    /** Escape HTML to prevent XSS */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ==================== ROUND INFO ====================
    function getCurrentRound() {
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth(); // 0-indexed
        const year = now.getFullYear();

        if (day >= 2 && day <= 14) {
            return {
                round: 1,
                label: 'รอบที่ 1',
                period: `วันที่ 2 – 14 ${getThaiMonth(month)} ${year + 543}`,
                drawDate: `16 ${getThaiMonth(month)} ${year + 543}`,
                open: true
            };
        } else if (day >= 17 && day <= 29) {
            return {
                round: 2,
                label: 'รอบที่ 2',
                period: `วันที่ 17 – 29 ${getThaiMonth(month)} ${year + 543}`,
                drawDate: getNextDrawDate(month, year),
                open: true
            };
        } else {
            // Outside active period
            let nextRound, nextPeriod, nextDraw;
            if (day === 1 || day >= 30) {
                nextRound = 'รอบถัดไป: รอบ 1';
                const nm = day === 1 ? month : (month + 1) % 12;
                const ny = day === 1 ? year : (month === 11 ? year + 1 : year);
                nextPeriod = `เปิดรับ: วันที่ 2 – 14 ${getThaiMonth(nm)} ${ny + 543}`;
                nextDraw = `16 ${getThaiMonth(nm)} ${ny + 543}`;
            } else {
                // day 15 or 16
                nextRound = 'รอบถัดไป: รอบ 2';
                nextPeriod = `เปิดรับ: วันที่ 17 – 29 ${getThaiMonth(month)} ${year + 543}`;
                nextDraw = getNextDrawDate(month, year);
            }
            return {
                round: 0,
                label: nextRound,
                period: nextPeriod,
                drawDate: nextDraw,
                open: false
            };
        }
    }

    function getThaiMonth(m) {
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                         'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return months[m];
    }

    function getNextDrawDate(month, year) {
        const nextMonth = (month + 1) % 12;
        const nextYear = month === 11 ? year + 1 : year;
        return `1 ${getThaiMonth(nextMonth)} ${nextYear + 543}`;
    }

    const roundInfo = getCurrentRound();
    const roundBadge = document.getElementById('round-badge');
    const roundPeriod = document.getElementById('round-period');
    const roundDrawDate = document.getElementById('round-draw-date');

    if (roundBadge) {
        roundBadge.textContent = roundInfo.label;
        if (!roundInfo.open) roundBadge.classList.add('round-closed');
    }
    if (roundPeriod) roundPeriod.textContent = roundInfo.period;
    if (roundDrawDate) roundDrawDate.textContent = roundInfo.drawDate;

    // ==================== MAIN LOGIC ====================
    const lottoGrid = document.getElementById('lotto-grid');
    const selectedNumber = document.getElementById('selected-number');

    // --- Background Particles ---
    const particlesContainer = document.getElementById('particles');
    if (particlesContainer) {
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (8 + Math.random() * 12) + 's';
            p.style.animationDelay = Math.random() * 10 + 's';
            p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
            particlesContainer.appendChild(p);
        }
    }

    // --- Step Progress ---
    const stepItems = document.querySelectorAll('.step-item');
    function setActiveStep(num) {
        stepItems.forEach(s => {
            const step = parseInt(s.dataset.step, 10);
            s.classList.toggle('active', step <= num);
        });
    }

    // Load sold-out numbers from database
    let soldOutNumbers = [];
    try {
        const res = await fetch(`${API_BASE}/sold-out`);
        soldOutNumbers = await res.json();
    } catch (err) {
        console.error('ไม่สามารถโหลดข้อมูล sold out:', err);
    }

    // Generate 100 Lotto numbers (00-99)
    for (let i = 0; i <= 99; i++) {
        const numDiv = document.createElement('div');
        numDiv.className = 'lotto-num';
        const formattedNum = i.toString().padStart(2, '0');
        numDiv.textContent = formattedNum;

        if (soldOutNumbers.includes(i)) {
            numDiv.classList.add('sold-out');
            numDiv.textContent = formattedNum + ' SOLD OUT';
        }

        numDiv.addEventListener('click', () => {
            if (!numDiv.classList.contains('sold-out')) {
                const prev = document.querySelector('.lotto-num.selected');
                if (prev) prev.classList.remove('selected');
                numDiv.classList.add('selected');
                selectedNumber.textContent = formattedNum;
                setActiveStep(3);
            }
        });

        lottoGrid.appendChild(numDiv);
    }

    // Handle Form submission - send to database
    const form = document.getElementById('submission-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert('กรุณาเข้าสู่ระบบก่อนครับ!');
            return;
        }

        const staffSelect = document.getElementById('staff-select');
        const staffId = staffSelect ? staffSelect.value : '';
        if (!staffId) {
            alert('กรุณาเลือกพนักงานครับ!');
            return;
        }

        const fileInput = document.getElementById('proof');
        if (!fileInput.files.length) {
            alert('กรุณาแนบรูปสลิปครับ!');
            return;
        }

        const looksScore = document.getElementById('score-looks') ? document.getElementById('score-looks').value : 5;
        const serviceScore = document.getElementById('score-service') ? document.getElementById('score-service').value : 5;
        const valueScore = document.getElementById('score-value') ? document.getElementById('score-value').value : 5;

        try {
            const formData = new FormData();
            formData.append('platform', currentUser.platform);
            formData.append('platform_id', currentUser.platform_id);
            formData.append('staff_id', staffId);
            formData.append('looks_score', looksScore);
            formData.append('service_score', serviceScore);
            formData.append('value_score', valueScore);
            formData.append('slip', fileInput.files[0]);

            const res = await fetch(`${API_BASE}/transactions`, {
                method: 'POST',
                body: formData
            });

            const result = await res.json();
            if (res.ok && result.success) {
                setActiveStep(4);
                alert('ส่งสลิปสำเร็จ! รอ Admin ตรวจสอบ');
                form.reset();
                // Reset slider displays
                document.querySelectorAll('.slider-value').forEach(el => el.textContent = '5');
                // Reset upload preview
                const preview = document.getElementById('upload-preview');
                const uploadBox = document.getElementById('upload-box');
                if (preview) preview.hidden = true;
                if (uploadBox) uploadBox.hidden = false;
                setActiveStep(1);
            } else {
                alert('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่ทราบสาเหตุ'));
            }
        } catch (err) {
            console.error('Submit error:', err);
            alert('ไม่สามารถเชื่อมต่อ Server ได้');
        }
    });

    // Upload Box interaction with preview
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('proof');
    const uploadPreview = document.getElementById('upload-preview');
    const previewImg = document.getElementById('preview-img');
    const btnRemoveImg = document.getElementById('btn-remove-img');

    uploadBox.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                uploadPreview.hidden = false;
                uploadBox.hidden = true;
            };
            reader.readAsDataURL(file);
        }
    });

    if (btnRemoveImg) {
        btnRemoveImg.addEventListener('click', () => {
            fileInput.value = '';
            uploadPreview.hidden = true;
            uploadBox.hidden = false;
        });
    }

    // Staff selection — advance step
    const staffSelectEl = document.getElementById('staff-select');
    if (staffSelectEl) {
        staffSelectEl.addEventListener('change', () => {
            if (staffSelectEl.value) {
                setActiveStep(2);
            }
        });
    }
});

const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';
const API_ROOT = API_BASE.replace(/\/api$/, '');

// ==================== GLOBAL STATE ====================
let currentUser = null; // { id, platform, platform_id, display_name, picture_url, progress_count }
let currentVisitedStaffIds = new Set();
let mainUserIdCopyResetTimer = null;
let currentProgressData = null;
let currentLottoSelection = '';

function getTodayDateInputValue(baseDate = new Date()) {
    const tzOffset = baseDate.getTimezoneOffset() * 60000;
    return new Date(baseDate.getTime() - tzOffset).toISOString().slice(0, 10);
}

function getOffsetDateInputValue(dayOffset = 0) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - dayOffset);
    return getTodayDateInputValue(targetDate);
}

function setElementVisible(element, isVisible, displayValue = '') {
    if (!element) return;
    element.style.display = isVisible ? displayValue : 'none';
    element.classList.toggle('hidden', !isVisible);
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

async function copyTextToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
        return document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // ==================== DOM REFERENCES ====================
    const termsOverlay = document.getElementById('terms-overlay');
    const loginOptions = document.getElementById('login-options');
    const mainContent = document.getElementById('main-content');
    const termsAgree = document.getElementById('terms-agree');
    const btnAccept = document.getElementById('btn-terms-accept');
    const mainUserIdCard = document.getElementById('main-user-id-card');
    const mainUserIdValue = document.getElementById('main-user-id-value');
    const mainUserIdHelp = document.getElementById('main-user-id-help');
    const btnCopyMainUserId = document.getElementById('btn-copy-main-user-id');

    // ==================== LIFF STATE ====================
    let liffInitialized = false;
    let liffInitPromise = null; // shared promise to prevent double-init

    /** Initialize LIFF once — returns a promise, safe to call multiple times */
    function ensureLiffInit() {
        if (liffInitPromise) return liffInitPromise;
        if (typeof liff === 'undefined') return Promise.reject(new Error('LIFF SDK not loaded'));
        liffInitPromise = liff.init({ liffId: '2009696727-evibES3H' }).then(() => {
            liffInitialized = true;
        });
        return liffInitPromise;
    }

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

    btnAccept.addEventListener('click', async () => {
        sessionStorage.setItem('terms_accepted', 'true');
        termsOverlay.classList.add('hidden');

        // If LIFF already logged the user in while they were reading terms, go straight to main
        if (currentUser) {
            showLoginOrMain();
            return;
        }

        // If LIFF is initialized and user is logged in LINE, auto-register now
        if (liffInitialized && typeof liff !== 'undefined' && liff.isLoggedIn()) {
            try {
                const profile = await liff.getProfile();
                await loginToBackend({
                    platform: 'line',
                    platform_id: profile.userId,
                    display_name: profile.displayName,
                    picture_url: profile.pictureUrl || null
                });
                return; // loginToBackend calls onLoginSuccess
            } catch (e) {
                console.warn('Auto-login after terms failed:', e.message);
            }
        }

        showLoginOrMain();
    });

    // "View terms" button from main page
    const btnViewTerms = document.getElementById('btn-view-terms');
    if (btnViewTerms) {
        btnViewTerms.addEventListener('click', () => {
            termsOverlay.classList.remove('hidden');
            setElementVisible(mainContent, false);
            setElementVisible(loginOptions, false);
            termsAgree.checked = true;
            btnAccept.disabled = false;
            btnAccept.classList.add('enabled');
        });
    }

    // ==================== LIFF AUTO-LOGIN (non-blocking) ====================
    (async () => {
        try {
            const loadingTimeout = setTimeout(() => {
                console.warn('LIFF init timeout — showing normal UI');
                showLoginOrMain();
            }, 5000);

            await ensureLiffInit();

            // If LIFF user is logged in, register with backend immediately
            if (liff.isLoggedIn() && !sessionStorage.getItem('currentUser')) {
                try {
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
                        sessionStorage.setItem('terms_accepted', 'true');
                        termsOverlay.classList.add('hidden');
                    }
                } catch (profileErr) {
                    console.warn('LIFF profile/login failed:', profileErr.message);
                }
            }

            clearTimeout(loadingTimeout);
            showLoginOrMain();
        } catch (liffErr) {
            console.warn('LIFF auto-init:', liffErr.message);
            showLoginOrMain();
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
            finalizeLogin(data.user);
            return true;
        } catch (err) {
            console.error('Login error:', err);
            alert('ไม่สามารถเชื่อมต่อ Server ได้');
            return false;
        }
    }

    function finalizeLogin(user) {
        currentUser = user;
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        onLoginSuccess();
    }

    /** Show login options or main content based on currentUser */
    function showLoginOrMain() {
        const logoutBtn = document.getElementById('btn-logout');
        if (currentUser) {
            setElementVisible(loginOptions, false);
            setElementVisible(mainContent, true);
            setElementVisible(logoutBtn, true, '');
            updateProfileUI();
            refreshUserRuntimeState();
        } else {
            setElementVisible(loginOptions, true, 'flex');
            setElementVisible(mainContent, false);
            setElementVisible(logoutBtn, false);
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
        setElementVisible(loginOptions, false);
        setElementVisible(mainContent, true);
        updateProfileUI();
        refreshUserRuntimeState();
    }

    /** Update header LIFF profile area with currentUser info */
    function updateProfileUI() {
        const avatar = document.getElementById('liff-avatar');
        const nameEl = document.getElementById('liff-name');
        if (!currentUser) {
            if (nameEl) nameEl.textContent = 'กำลังโหลด...';
            renderMainUserIdCard();
            return;
        }

        if (avatar) {
            avatar.style.display = '';
            avatar.src = currentUser.picture_url
                ? resolveAssetUrl(currentUser.picture_url)
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.display_name || currentUser.platform_id || 'User')}&background=1a1a2e&color=00f0ff&size=80`;
        }
        if (nameEl) {
            nameEl.textContent = currentUser.display_name || currentUser.platform_id;
        }

        renderMainUserIdCard();
    }

    function renderMainUserIdCard() {
        if (!mainUserIdCard || !mainUserIdValue || !mainUserIdHelp || !btnCopyMainUserId) return;

        const userId = currentUser?.platform_id || currentUser?.id || '';
        const platformLabel = 'LINE User ID';

        if (!userId) {
            mainUserIdValue.textContent = '-';
            mainUserIdValue.removeAttribute('title');
            btnCopyMainUserId.disabled = true;
            btnCopyMainUserId.textContent = 'คัดลอก User ID';
            mainUserIdHelp.textContent = 'ล็อกอินแล้วคัดลอก User ID นี้ส่งให้แอดมิน เพื่อใช้ค้นหาบัญชีและหักสิทธิ์หรือเช็ครางวัลได้ตรงตัว';
            return;
        }

        mainUserIdValue.textContent = userId;
        mainUserIdValue.title = userId;
        btnCopyMainUserId.disabled = false;
        btnCopyMainUserId.textContent = 'คัดลอก User ID';
        mainUserIdHelp.textContent = `${platformLabel} นี้ใช้เป็นรหัสอ้างอิงสำหรับส่งให้แอดมิน เมื่อจะให้เช็กยอดคะแนน หักสิทธิ์ หรือดูสิทธิ์รางวัล`;
    }

    function updateLottoConfirmButton() {
        const btnLottoConfirm = document.getElementById('btn-lotto-confirm');
        if (!btnLottoConfirm) return;

        const canGuess = Boolean(currentProgressData?.can_guess_lottery);
        btnLottoConfirm.disabled = !canGuess || !currentLottoSelection;
    }

    function resetLottoSelection() {
        setSelectedLottoNumber('');
        document.querySelector('.lotto-num.selected')?.classList.remove('selected');
    }

    function hideLottoSection() {
        const lottoSection = document.getElementById('lotto-section');
        if (!lottoSection) return;
        lottoSection.hidden = true;
    }

    function showLottoSection(scrollIntoView = false) {
        const lottoSection = document.getElementById('lotto-section');
        if (!lottoSection) return;
        lottoSection.hidden = false;
        if (scrollIntoView) {
            lottoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function renderProgressState(pointBalance, guessCredits) {
        const normalizedPoints = Math.max(0, Number(pointBalance) || 0);
        const availableGuessCredits = Math.max(0, Number(guessCredits) || 0);
        const progressStep = availableGuessCredits > 0 ? 5 : Math.min(normalizedPoints, 5);
        const progressCountEl = document.getElementById('progress-count');
        const progressFillEl = document.getElementById('progress-fill');
        const lockProgressEl = document.getElementById('lock-progress-text');
        const progressHintEl = document.getElementById('progress-hint');

        if (progressCountEl) progressCountEl.textContent = `${normalizedPoints.toLocaleString('th-TH')} แต้ม`;
        if (progressFillEl) progressFillEl.style.width = `${(progressStep / 5) * 100}%`;
        if (lockProgressEl) lockProgressEl.textContent = `${normalizedPoints.toLocaleString('th-TH')} แต้ม`;

        if (progressHintEl) {
            if (!currentProgressData?.is_round_open) {
                progressHintEl.textContent = normalizedPoints > 0
                    ? 'รอบนี้ปิดรับแล้ว แต้มทายเลขจะยังอยู่จนกว่าจะครบกำหนดรอบสะสมปัจจุบัน'
                    : 'รอรอบถัดไปเพื่อเริ่มสะสมพ้อยและทายเลข';
                progressHintEl.classList.remove('unlocked');
            } else if (availableGuessCredits > 0) {
                progressHintEl.textContent = `ทายได้ ${availableGuessCredits.toLocaleString('th-TH')} เลขในรอบนี้ ใช้เลขละ 5 พ้อย`;
                progressHintEl.classList.add('unlocked');
            } else {
                const pointsNeeded = Math.max(0, Number(currentProgressData?.points_needed_for_next_guess) || 5);
                progressHintEl.textContent = `อีก ${pointsNeeded} พ้อยจะทายได้ 1 เลข`;
                progressHintEl.classList.remove('unlocked');
            }
        }

        document.querySelectorAll('#progress-section .progress-dot').forEach((dot, index) => {
            const dotIndex = index + 1;
            dot.classList.toggle('filled', dotIndex <= progressStep);
            dot.classList.toggle('current', progressStep < 5 && dotIndex === progressStep + 1);
        });
    }

    function renderTotalPoints(guessCredits) {
        const pointsEl = document.getElementById('total-points-value');
        if (pointsEl) {
            pointsEl.textContent = Number(guessCredits || 0).toLocaleString('th-TH');
        }
    }

    function clearSelectedStaff() {
        const selectedCard = document.querySelector('.staff-pick-card.selected');
        if (selectedCard) selectedCard.classList.remove('selected');

        const staffInput = document.getElementById('staff-select');
        if (staffInput) staffInput.value = '';

        setActiveStep(1);
    }

    function applyVisitedStaffState(staffIds) {
        currentVisitedStaffIds = new Set((staffIds || []).map(String));

        document.querySelectorAll('.staff-pick-card').forEach(card => {
            const isLocked = currentVisitedStaffIds.has(card.dataset.staffId);
            card.classList.toggle('is-locked', isLocked);
            card.setAttribute('aria-disabled', isLocked ? 'true' : 'false');

            if (isLocked && card.classList.contains('selected')) {
                clearSelectedStaff();
            }
        });
    }

    function syncLottoState(progressData) {
        const btnOpenLotto = document.getElementById('btn-open-lotto');
        const btnOpenLottoFooter = document.getElementById('btn-open-lotto-footer');
        const lottoOpenButtons = [btnOpenLotto, btnOpenLottoFooter].filter(Boolean);
        const lottoEntryHelp = document.getElementById('lotto-entry-help');
        const lottoEntryPanel = document.getElementById('lotto-entry-panel');
        const lottoEntryPoints = document.getElementById('lotto-entry-points');
        const lottoEntryRemaining = document.getElementById('lotto-entry-remaining');
        const lottoEntryStatus = document.getElementById('lotto-entry-status');
        if (!lottoOpenButtons.length || !lottoEntryHelp || !lottoEntryPanel || !lottoEntryPoints || !lottoEntryRemaining || !lottoEntryStatus) return;

        const setLottoOpenButtons = ({ disabled, panelText, footerText }) => {
            if (btnOpenLotto) {
                btnOpenLotto.disabled = disabled;
                btnOpenLotto.textContent = panelText;
            }
            if (btnOpenLottoFooter) {
                btnOpenLottoFooter.disabled = disabled;
                btnOpenLottoFooter.textContent = footerText || panelText;
            }
        };

        const pointBalance = Math.max(0, Number(progressData?.guess_point_balance || 0));
        const guessCredits = Math.max(0, Number(progressData?.guess_credits_remaining || 0));
        const pointsNeeded = Math.max(0, Number(progressData?.points_needed_for_next_guess || 5));
        const roundOpen = Boolean(progressData?.is_round_open);
        const canGuess = Boolean(progressData?.can_guess_lottery);

        lottoEntryHelp.classList.remove('is-unlocked');
        lottoEntryPanel.classList.remove('is-ready');
        lottoEntryStatus.classList.remove('is-ready', 'is-waiting', 'is-closed');
        lottoEntryPoints.textContent = pointBalance.toLocaleString('th-TH');
        lottoEntryRemaining.textContent = pointsNeeded.toLocaleString('th-TH');

        if (!currentUser?.platform_id) {
            setLottoOpenButtons({
                disabled: true,
                panelText: '🎰 ล็อกอินเพื่อเปิดสิทธิ์ทายเลข',
                footerText: '🎰 ทายเลข'
            });
            lottoEntryHelp.textContent = 'เมื่อสะสมครบทุก 5 พ้อย ปุ่มนี้จะเปิดให้เข้าไปเลือกเลข 00-99 ได้';
            lottoEntryStatus.textContent = 'รอเข้าสู่ระบบ';
            lottoEntryStatus.classList.add('is-waiting');
            hideLottoSection();
            resetLottoSelection();
            return;
        }

        if (!roundOpen) {
            setLottoOpenButtons({
                disabled: true,
                panelText: '⏳ รอบนี้ยังไม่เปิดให้ทายเลข',
                footerText: '⏳ ยังไม่เปิด'
            });
            lottoEntryHelp.textContent = pointBalance > 0
                ? `ตอนนี้มี ${pointBalance.toLocaleString('th-TH')} แต้ม ระบบจะเปิดให้ใช้เมื่อถึงรอบสะสมถัดไป`
                : 'รอรอบสะสมถัดไปเพื่อเริ่มเก็บพ้อยและปลดล็อกสิทธิ์ทายเลข';
            lottoEntryStatus.textContent = 'รอบนี้ปิดรับทายเลข';
            lottoEntryStatus.classList.add('is-closed');
            hideLottoSection();
            resetLottoSelection();
            return;
        }

        if (canGuess) {
            setLottoOpenButtons({
                disabled: false,
                panelText: `🎰 ใช้สิทธิ์ทายเลข ${guessCredits.toLocaleString('th-TH')} ครั้ง`,
                footerText: `🎰 ทายเลข ${guessCredits.toLocaleString('th-TH')}`
            });
            lottoEntryHelp.textContent = `พร้อมแล้วสำหรับการเลือกเลข 00-99 ตอนนี้คุณมี ${pointBalance.toLocaleString('th-TH')} แต้ม และทายได้ ${guessCredits.toLocaleString('th-TH')} ครั้ง`;
            lottoEntryHelp.classList.add('is-unlocked');
            lottoEntryPanel.classList.add('is-ready');
            lottoEntryStatus.textContent = `พร้อมใช้งาน ${guessCredits.toLocaleString('th-TH')} สิทธิ์`;
            lottoEntryStatus.classList.add('is-ready');
            lottoEntryRemaining.textContent = '0';
            return;
        }

        setLottoOpenButtons({
            disabled: true,
            panelText: `🎰 สะสมอีก ${pointsNeeded.toLocaleString('th-TH')} พ้อยเพื่อปลดล็อก`,
            footerText: `🎰 อีก ${pointsNeeded.toLocaleString('th-TH')} พ้อย`
        });
        lottoEntryHelp.textContent = `ตอนนี้มี ${pointBalance.toLocaleString('th-TH')} แต้ม ครบทุก 5 พ้อยเมื่อไร ปุ่มนี้จะเปิดให้ใช้สิทธิ์ทันที`;
        lottoEntryStatus.textContent = 'ยังไม่ถึงเกณฑ์ปลดล็อก';
        lottoEntryStatus.classList.add('is-waiting');
        hideLottoSection();
        resetLottoSelection();
    }

    async function refreshUserRuntimeState() {
        if (!currentUser?.platform_id) return;

        const platform = currentUser.platform || 'line';

        try {
            const progressRes = await fetch(`${API_BASE}/users/${encodeURIComponent(currentUser.platform_id)}/progress?platform=${encodeURIComponent(platform)}`);
            const progressData = progressRes.ok ? await progressRes.json() : null;
            const pointBalance = Number(progressData?.guess_point_balance || 0);
            const guessCredits = Number(progressData?.guess_credits_remaining || 0);

            currentProgressData = progressData;
            renderProgressState(pointBalance, guessCredits);
            renderTotalPoints(guessCredits);
            applyVisitedStaffState(progressData?.visited_staff_ids || []);
            syncLottoState(progressData);
            updateLottoConfirmButton();

            currentUser.progress_count = Number(progressData?.progress_count || 0);
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            renderMainUserIdCard();
        } catch (error) {
            console.error('Runtime state refresh error:', error);
            currentProgressData = null;
            renderProgressState(0, 0);
            renderTotalPoints(0);
            syncLottoState(null);
            updateLottoConfirmButton();
            renderMainUserIdCard();
        }
    }

    if (btnCopyMainUserId) {
        btnCopyMainUserId.addEventListener('click', async () => {
            const userId = currentUser?.platform_id || currentUser?.id || '';
            if (!userId) return;

            try {
                const copied = await copyTextToClipboard(userId);
                btnCopyMainUserId.textContent = copied ? 'คัดลอกแล้ว' : 'คัดลอกไม่สำเร็จ';
            } catch (error) {
                console.error('Copy main user ID error:', error);
                btnCopyMainUserId.textContent = 'คัดลอกไม่สำเร็จ';
            }

            clearTimeout(mainUserIdCopyResetTimer);
            mainUserIdCopyResetTimer = window.setTimeout(() => {
                btnCopyMainUserId.textContent = 'คัดลอก User ID';
            }, 1800);
        });
    }

    // --- LINE Login ---
    const btnLoginLine = document.getElementById('btn-login-line');
    if (btnLoginLine) {
        btnLoginLine.addEventListener('click', async () => {
            btnLoginLine.disabled = true;
            btnLoginLine.textContent = 'กำลังเข้าสู่ระบบ...';
            try {
                await ensureLiffInit();

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

    // ==================== IMAGE MODAL ====================
    const staffImgModal = document.getElementById('staff-img-modal');
    const staffImgModalImg = document.getElementById('staff-img-modal-img');
    const staffImgModalClose = document.getElementById('staff-img-modal-close');

    function openStaffImageModal(src, alt) {
        if (!staffImgModal || !staffImgModalImg) return;
        staffImgModalImg.src = src;
        staffImgModalImg.alt = alt || 'รูปพนักงาน';
        staffImgModal.hidden = false;
    }

    if (staffImgModalClose) {
        staffImgModalClose.addEventListener('click', () => {
            staffImgModal.hidden = true;
        });
    }

    if (staffImgModal) {
        staffImgModal.addEventListener('click', (event) => {
            if (event.target === staffImgModal) {
                staffImgModal.hidden = true;
            }
        });
    }

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

        if (day >= 1 && day <= 14) {
            return {
                round: 1,
                label: 'รอบที่ 1',
                period: `วันที่ 1 – 14 ${getThaiMonth(month)} ${year + 543}`,
                drawDate: `16 ${getThaiMonth(month)} ${year + 543}`,
                open: true
            };
        } else if (day >= 16 && day <= 29) {
            return {
                round: 2,
                label: 'รอบที่ 2',
                period: `วันที่ 16 – 29 ${getThaiMonth(month)} ${year + 543}`,
                drawDate: getNextDrawDate(month, year),
                open: true
            };
        } else {
            // Outside active period
            let nextRound, nextPeriod, nextDraw;
            if (day >= 30) {
                nextRound = 'รอบถัดไป: รอบ 1';
                const nm = (month + 1) % 12;
                const ny = month === 11 ? year + 1 : year;
                nextPeriod = `เปิดรับ: วันที่ 1 – 14 ${getThaiMonth(nm)} ${ny + 543}`;
                nextDraw = `16 ${getThaiMonth(nm)} ${ny + 543}`;
            } else {
                // day 15
                nextRound = 'รอบถัดไป: รอบ 2';
                nextPeriod = `เปิดรับ: วันที่ 16 – 29 ${getThaiMonth(month)} ${year + 543}`;
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
    const btnLottoConfirm = document.getElementById('btn-lotto-confirm');
    const btnOpenLotto = document.getElementById('btn-open-lotto');
    const btnOpenLottoFooter = document.getElementById('btn-open-lotto-footer');
    const lottoOpenButtons = [btnOpenLotto, btnOpenLottoFooter].filter(Boolean);

    function setSelectedLottoNumber(number) {
        currentLottoSelection = String(number || '');
        if (selectedNumber) {
            selectedNumber.textContent = currentLottoSelection || '--';
        }
        updateLottoConfirmButton();
    }

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

    function renderStarRatings() {
        document.querySelectorAll('.star-rating').forEach(container => {
            const targetId = container.dataset.target;
            const outputId = container.dataset.output;
            const maxScore = Math.max(1, Number(container.dataset.max || 10));
            const input = document.getElementById(targetId);
            const output = document.getElementById(outputId);
            if (!input || !output) return;

            const setValue = (value) => {
                const normalizedValue = Math.min(maxScore, Math.max(1, Number(value) || 1));
                input.value = String(normalizedValue);
                output.textContent = String(normalizedValue);
                container.querySelectorAll('.star-rating-btn').forEach(btn => {
                    btn.classList.toggle('is-active', Number(btn.dataset.value) <= normalizedValue);
                    btn.setAttribute('aria-pressed', Number(btn.dataset.value) === normalizedValue ? 'true' : 'false');
                });
            };

            container.innerHTML = Array.from({ length: maxScore }, (_, index) => {
                const score = index + 1;
                return `<button type="button" class="star-rating-btn" data-value="${score}" aria-label="ให้คะแนน ${score} จาก ${maxScore}">
                    <span class="star-rating-icon">★</span>
                    <span class="star-rating-score">${score}</span>
                </button>`;
            }).join('');

            container.querySelectorAll('.star-rating-btn').forEach(btn => {
                btn.addEventListener('click', () => setValue(Number(btn.dataset.value)));
            });

            setValue(Number(input.value || Math.max(1, Math.floor(maxScore / 2))));
        });
    }

    renderStarRatings();

    const serviceDateInput = document.getElementById('service-date');
    const serviceDateTrigger = document.getElementById('service-date-trigger');
    const serviceDateShortcutButtons = Array.from(document.querySelectorAll('.date-shortcut-btn'));

    function updateServiceDateShortcutState() {
        if (!serviceDateInput) return;
        serviceDateShortcutButtons.forEach((button) => {
            const offset = Number(button.dataset.dateOffset || 0);
            button.classList.toggle('is-active', serviceDateInput.value === getOffsetDateInputValue(offset));
        });
    }

    function setServiceDateValue(value) {
        if (!serviceDateInput) return;
        serviceDateInput.value = value;
        updateServiceDateShortcutState();
    }

    if (serviceDateInput) {
        serviceDateInput.max = getTodayDateInputValue();
        if (!serviceDateInput.value) {
            setServiceDateValue(getTodayDateInputValue());
        } else {
            updateServiceDateShortcutState();
        }
        serviceDateInput.addEventListener('input', updateServiceDateShortcutState);
    }

    if (serviceDateTrigger && serviceDateInput) {
        serviceDateTrigger.addEventListener('click', () => {
            if (typeof serviceDateInput.showPicker === 'function') {
                serviceDateInput.showPicker();
                return;
            }
            serviceDateInput.focus();
        });
    }

    serviceDateShortcutButtons.forEach((button) => {
        button.addEventListener('click', () => {
            setServiceDateValue(getOffsetDateInputValue(Number(button.dataset.dateOffset || 0)));
        });
    });

    if (serviceDateInput && !serviceDateInput.value) {
        setServiceDateValue(getTodayDateInputValue());
    }

    // --- Load Staff Cards ---
    (async () => {
        const staffGrid = document.getElementById('staff-pick-grid');
        const staffInput = document.getElementById('staff-select');
        if (!staffGrid || !staffInput) return;
        try {
            const res = await fetch(`${API_BASE}/staffs`);
            const staffs = await res.json();
            if (!staffs.length) {
                staffGrid.innerHTML = '<p class="staff-pick-loading">ยังไม่มีพนักงานในระบบ</p>';
                return;
            }
            staffGrid.innerHTML = staffs.map(s => {
                const displayName = s.nickname || s.name || '—';
                const avatarSrc = s.avatar_url
                    ? resolveAssetUrl(s.avatar_url)
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=80`;
                const avatarNode = s.avatar_url
                    ? `<button type="button" class="staff-pick-avatar-btn" data-fullimg="${avatarSrc}" data-staff-name="${escapeHtml(displayName)}" aria-label="ดูรูป ${escapeHtml(displayName)} เต็ม">
                            <img class="staff-pick-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=80'">
                        </button>
                        <span class="staff-pick-avatar-hint">+</span>`
                    : `<img class="staff-pick-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=80'">`;
                return `<div class="staff-pick-card" data-staff-id="${s.id}">
                    <div class="staff-pick-avatar-wrap">${avatarNode}</div>
                    <span class="staff-pick-name">${escapeHtml(displayName)}</span>
                </div>`;
            }).join('');

            staffGrid.querySelectorAll('.staff-pick-avatar-btn').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    openStaffImageModal(button.dataset.fullimg, button.dataset.staffName);
                });
            });

            staffGrid.querySelectorAll('.staff-pick-card').forEach(card => {
                card.addEventListener('click', () => {
                    if (card.classList.contains('is-locked')) {
                        return;
                    }
                    staffGrid.querySelectorAll('.staff-pick-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    staffInput.value = card.dataset.staffId;
                    setActiveStep(2);
                });
            });

            applyVisitedStaffState(Array.from(currentVisitedStaffIds));
        } catch (err) {
            staffGrid.innerHTML = '<p class="staff-pick-loading">ไม่สามารถโหลดรายชื่อพนักงานได้</p>';
        }
    })();

    // Load sold-out numbers from database + generate lotto grid
    (async () => {
        let soldOutNumbers = [];
        try {
            const res = await fetch(`${API_BASE}/sold-out`);
            const soldOutData = await res.json();
            soldOutNumbers = Array.isArray(soldOutData)
                ? soldOutData.map(number => Number(number))
                : [];
        } catch (err) {
            console.error('ไม่สามารถโหลดข้อมูล sold out:', err);
        }

        // Generate 100 Lotto numbers (00-99)
        for (let i = 0; i <= 99; i++) {
            const numDiv = document.createElement('div');
            numDiv.className = 'lotto-num';
            const formattedNum = i.toString().padStart(2, '0');
            numDiv.dataset.number = formattedNum;
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
                    setSelectedLottoNumber(formattedNum);
                    setActiveStep(3);
                }
            });

            lottoGrid.appendChild(numDiv);
        }
    })();

    if (btnLottoConfirm) {
        btnLottoConfirm.addEventListener('click', async () => {
            if (!currentUser?.platform_id) {
                alert('กรุณาเข้าสู่ระบบก่อนครับ!');
                return;
            }
            if (!currentLottoSelection) {
                alert('กรุณาเลือกเลขก่อนครับ!');
                return;
            }

            btnLottoConfirm.disabled = true;
            try {
                const res = await fetch(`${API_BASE}/lottery/guess`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        platform: currentUser.platform,
                        platform_id: currentUser.platform_id,
                        guess_number: currentLottoSelection
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'ไม่สามารถทายเลขได้');
                }

                alert(data.message || `ทายเลข ${currentLottoSelection} สำเร็จ`);
                resetLottoSelection();
                await refreshUserRuntimeState();
            } catch (error) {
                console.error('Lottery submit error:', error);
                alert(error.message || 'ไม่สามารถทายเลขได้');
                updateLottoConfirmButton();
            }
        });
    }

    lottoOpenButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!currentProgressData?.can_guess_lottery) {
                return;
            }
            showLottoSection(true);
        });
    });

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

        const serviceDate = document.getElementById('service-date')?.value || '';
        if (!serviceDate) {
            alert('กรุณาเลือกวันที่มาใช้บริการครับ!');
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
            formData.append('service_date', serviceDate);
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
                ['score-looks', 'score-service', 'score-value'].forEach(id => {
                    const input = document.getElementById(id);
                    if (input) input.value = '5';
                });
                renderStarRatings();
                if (serviceDateInput) {
                    setServiceDateValue(getTodayDateInputValue());
                }
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
});

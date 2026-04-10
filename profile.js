const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';
const API_ROOT = API_BASE.replace(/\/api$/, '');
const LIFF_ID = '2009696727-evibES3H';

let currentUser = null;
let copyUserIdResetTimer = null;

// ==================== HELPERS ====================
function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function thaiDate(isoStr) {
    return new Date(isoStr).toLocaleDateString('th-TH', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
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

function setElVisible(id, isVisible) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = isVisible ? '' : 'none';
    el.classList.toggle('profile-hidden', !isVisible);
    el.classList.toggle('hidden', !isVisible);
}

function showEl(id) { setElVisible(id, true); }
function hideEl(id) { setElVisible(id, false); }

const profileImgModal = document.getElementById('profile-img-modal');
const profileImgModalImg = document.getElementById('profile-img-modal-img');
const profileImgModalClose = document.getElementById('profile-img-modal-close');
const userIdValueEl = document.getElementById('user-id-value');
const copyUserIdBtn = document.getElementById('btn-copy-user-id');
const userAvatarInput = document.getElementById('user-avatar-input');
const userAvatarStatus = document.getElementById('user-avatar-status');

function persistCurrentUser() {
    if (!currentUser) return;
    sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
}

function setAvatarUploadStatus(message, state = '') {
    if (!userAvatarStatus) return;
    userAvatarStatus.textContent = message;
    userAvatarStatus.classList.remove('is-error', 'is-success');
    if (state) userAvatarStatus.classList.add(state);
}

async function copyTextToClipboard(text) {
    if (!text) return false;

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(temp);
    return copied;
}

function openProfileImageModal(src, alt = 'รูปหลักฐานการรีวิว') {
    if (!profileImgModal || !profileImgModalImg) return;
    profileImgModalImg.src = src;
    profileImgModalImg.alt = alt;
    profileImgModal.hidden = false;
}

if (profileImgModalClose) {
    profileImgModalClose.addEventListener('click', () => {
        profileImgModal.hidden = true;
    });
}

if (profileImgModal) {
    profileImgModal.addEventListener('click', (event) => {
        if (event.target === profileImgModal) {
            profileImgModal.hidden = true;
        }
    });
}

if (copyUserIdBtn) {
    copyUserIdBtn.addEventListener('click', async () => {
        const userId = userIdValueEl?.textContent?.trim();
        if (!userId || userId === '-') return;

        try {
            const copied = await copyTextToClipboard(userId);
            if (!copied) throw new Error('copy-failed');

            copyUserIdBtn.textContent = 'คัดลอกแล้ว';
        } catch {
            copyUserIdBtn.textContent = 'คัดลอกไม่ได้';
        }

        window.clearTimeout(copyUserIdResetTimer);
        copyUserIdResetTimer = window.setTimeout(() => {
            copyUserIdBtn.textContent = 'คัดลอก';
        }, 1800);
    });
}

// ==================== LOGOUT ====================
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('terms_accepted');
        try { if (typeof liff !== 'undefined' && liff.isLoggedIn()) liff.logout(); } catch (e) { /* ignore */ }
        window.location.href = 'index.html';
    });
}

// ==================== PARTICLES ====================
function spawnParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (8 + Math.random() * 12) + 's';
        p.style.animationDelay = Math.random() * 10 + 's';
        p.style.width = p.style.height = (1 + Math.random() * 2) + 'px';
        container.appendChild(p);
    }
}

// ==================== RENDER FUNCTIONS ====================

// ==================== RANK SYSTEM ====================
const RANK_TIERS = [
    { name: 'Unranked', icon: '🔘', color: '#888888', minApproved: 0 },
    { name: 'Bronze', icon: '🥉', color: '#cd7f32', minApproved: 3, image: 'Logo%20Ranking/Bronze.png' },
    { name: 'Silver', icon: '🥈', color: '#c0c0c0', minApproved: 6, image: 'Logo%20Ranking/Silver.png' },
    { name: 'Gold', icon: '🥇', color: '#ffd700', minApproved: 12, image: 'Logo%20Ranking/Gold.png' },
    { name: 'Platinum', icon: '💎', color: '#00f0ff', minApproved: 24, image: 'Logo%20Ranking/Platinum.png' },
    { name: 'Diamond', icon: '👑', color: '#b44aff', minApproved: 48, image: 'Logo%20Ranking/Diamon.png' },
    { name: 'Master', icon: '🏆', color: '#ff3c3c', minApproved: 90, image: 'Logo%20Ranking/Master.png' },
    { name: 'Grandmaster', icon: '🏆', color: '#ffd166', minApproved: 150, image: 'Logo%20Ranking/Grandmaster.png' },
];

function calculateRank(lifetimeApproved) {
    let rank = RANK_TIERS[0];
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (lifetimeApproved >= RANK_TIERS[i].minApproved) {
            rank = RANK_TIERS[i];
            break;
        }
    }
    // Find next rank
    const currentIdx = RANK_TIERS.indexOf(rank);
    const nextRank = currentIdx < RANK_TIERS.length - 1 ? RANK_TIERS[currentIdx + 1] : null;
    return { current: rank, next: nextRank, currentIdx };
}

function renderRankVisual(rank, className) {
    if (rank.image) {
        return `<img class="${className}" src="${rank.image}" alt="${escapeHtml(rank.name)} rank" loading="lazy">`;
    }
    return `<span class="${className} rank-visual-fallback" aria-hidden="true">${rank.icon}</span>`;
}

function renderRankCard(lifetimeApproved, rankResetDate = null) {
    const { current, next, currentIdx } = calculateRank(lifetimeApproved);
    const el = document.getElementById('rank-card');
    if (!el) return;

    // Progress to next rank
    let progressHtml = '';
    if (next) {
        const currentMin = Number(current.minApproved) || 0;
        const nextMin = Number(next.minApproved) || 0;
        const tierRange = Math.max(1, nextMin - currentMin);
        const approvedPct = Math.min(Math.max((lifetimeApproved - currentMin) / tierRange * 100, 0), 100);
        const remainingToNext = Math.max(nextMin - lifetimeApproved, 0);
        progressHtml = `
            <div class="rank-progress-section">
                <div class="rank-next-label">ถัดไป: <span class="rank-next-tier" style="color:${next.color}">${renderRankVisual(next, 'rank-inline-logo')} ${next.name}</span></div>
                <div class="rank-progress-bar">
                    <div class="rank-progress-fill" style="width:${approvedPct}%; background:linear-gradient(90deg, ${current.color}, ${next.color})"></div>
                </div>
                <div class="rank-progress-details">
                    <span>ใช้บริการ: ${lifetimeApproved.toLocaleString('th-TH')}/${nextMin.toLocaleString('th-TH')} ครั้ง</span>
                    <span>อีก ${remainingToNext.toLocaleString('th-TH')} ครั้ง</span>
                </div>
            </div>`;
    } else {
        progressHtml = '<div class="rank-max-label">🏆 แรงค์สูงสุดแล้ว!</div>';
    }

    // Rank tier dots
    const dotsHtml = RANK_TIERS.slice(1).map((tier, idx) => {
        const achieved = idx + 1 <= currentIdx;
        return `<div class="rank-tier-dot ${achieved ? 'achieved' : ''}" style="--tier-color:${tier.color}" title="${tier.name}">
            ${renderRankVisual(tier, 'rank-tier-logo')}
        </div>`;
    }).join('');

    el.innerHTML = `
        <div class="rank-display">
            <div class="rank-icon-wrap" style="--rank-color:${current.color}">
                ${renderRankVisual(current, 'rank-icon')}
            </div>
            <div class="rank-info">
                <div class="rank-label">แรงค์ปัจจุบัน</div>
                <div class="rank-name" style="color:${current.color}">${current.name}</div>
                <div class="rank-stats-mini">Rank EXP: ${lifetimeApproved.toLocaleString('th-TH')} จากสลิปอนุมัติ</div>
                ${rankResetDate ? `<div class="rank-reset-note">นับแรงค์ตั้งแต่ ${formatServiceDate(rankResetDate)}</div>` : ''}
            </div>
        </div>
        <div class="rank-tier-track">${dotsHtml}</div>
        ${progressHtml}
    `;
}

function renderRewardSummary(guesses) {
    const el = document.getElementById('reward-summary');
    if (!el) return;

    const wonGuesses = guesses.filter(g => g.result === 'won');
    const lostGuesses = guesses.filter(g => g.result === 'lost');
    const pendingGuesses = guesses.filter(g => g.result === 'pending');

    const totalCashback = wonGuesses.reduce((sum, g) => sum + parseFloat(g.reward_amount || 0), 0);
    const cashbackAfterWithdrawFee = totalCashback * 0.9;
    const totalGV = lostGuesses.reduce((sum, g) => sum + parseFloat(g.reward_amount || 0), 0);

    el.innerHTML = `
        <div class="reward-summary-header">🎁 สรุปรางวัลทั้งหมด</div>
        <div class="reward-summary-grid">
            <div class="reward-card reward-cashback">
                <div class="reward-card-icon">💰</div>
                <div class="reward-card-value">${totalCashback.toLocaleString('th-TH')} ฿</div>
                <div class="reward-card-label">Cashback</div>
                <div class="reward-card-sub">ถอนสุทธิหัก 10% = <strong>${cashbackAfterWithdrawFee.toLocaleString('th-TH', { maximumFractionDigits: 0 })} ฿</strong></div>
                <div class="reward-card-count">${wonGuesses.length} ครั้งที่ถูก</div>
            </div>
            <div class="reward-card reward-gv-card">
                <div class="reward-card-icon">🎟️</div>
                <div class="reward-card-value">${totalGV.toLocaleString('th-TH')} ฿</div>
                <div class="reward-card-label">Gift Voucher</div>
                <div class="reward-card-sub">300 ฿ × ${lostGuesses.length} ครั้ง</div>
                <div class="reward-card-count">${lostGuesses.length} ครั้งที่ไม่ถูก</div>
            </div>
        </div>
        ${pendingGuesses.length > 0 ? `<div class="reward-pending-note">⏳ รอผลอีก ${pendingGuesses.length} รายการ</div>` : ''}
    `;
}

function renderUserCard(user, stats) {
    const avatar = document.getElementById('user-avatar');
    avatar.src = user.picture_url
        ? resolveAssetUrl(user.picture_url)
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || 'U')}&background=1a1a2e&color=00f0ff&size=80`;

    if (currentUser) {
        currentUser.display_name = user.display_name || currentUser.display_name;
        currentUser.picture_url = user.picture_url || null;
        persistCurrentUser();
    }

    document.getElementById('user-display-name').textContent = user.display_name || '—';
    document.getElementById('user-platform-id').textContent = 'LINE Account';
    if (userIdValueEl) userIdValueEl.textContent = user.platform_id || user.id || '-';
    if (copyUserIdBtn) copyUserIdBtn.textContent = 'คัดลอก';

    const badge = document.getElementById('platform-badge');
    badge.textContent = 'LINE';
    badge.className = 'platform-badge line';

    document.getElementById('stat-total-slips').textContent = stats.totalSlips;
    document.getElementById('stat-approved').textContent = stats.approved;
    document.getElementById('stat-lotto').textContent = stats.lotto;
    document.getElementById('stat-points').textContent = Number(stats.totalPoints || 0).toLocaleString('th-TH');
}

function renderProgress(pointBalance) {
    const fill = document.getElementById('profile-progress-fill');
    const label = document.getElementById('profile-progress-count');
    const normalizedPoints = Math.max(0, Number(pointBalance) || 0);
    const progressStep = normalizedPoints >= 5 ? 5 : normalizedPoints;
    const pct = Math.min(progressStep / 5 * 100, 100);
    fill.style.width = pct + '%';
    label.textContent = `${normalizedPoints.toLocaleString('th-TH')} แต้ม`;
    for (let i = 1; i <= 5; i++) {
        const dot = document.getElementById(`pdot-${i}`);
        if (dot) dot.classList.toggle('filled', i <= progressStep);
    }
}

function renderTransactions(transactions) {
    const list = document.getElementById('tx-list');
    if (!transactions || transactions.length === 0) {
        list.innerHTML = '<div class="list-empty">ยังไม่มีประวัติส่งสลิป</div>';
        return;
    }
    list.innerHTML = transactions.map((tx, idx) => {
        const staffLabel = tx.staff_nickname
            ? `${tx.staff_nickname} <span class="staff-fullname">(${escapeHtml(tx.staff_name)})</span>`
            : escapeHtml(tx.staff_name);
        const badgeClass = tx.status === 'approved' ? 'approved' : tx.status === 'rejected' ? 'rejected' : 'pending';
        const badgeText = tx.status === 'approved' ? '✅ อนุมัติ' : tx.status === 'rejected' ? '❌ ปฏิเสธ' : '⏳ รอตรวจ';
        const rejectNote = tx.reject_reason
            ? `<div class="item-reject-note">เหตุผล: ${escapeHtml(tx.reject_reason)}</div>` : '';
        const slipSrc = tx.slip_image_url ? resolveAssetUrl(tx.slip_image_url) : '';
        const slipLink = tx.slip_image_url
            ? `<button type="button" class="slip-thumb-btn slip-thumb-link" data-slip-fullimg="${escapeHtml(slipSrc)}" aria-label="ดูรูปหลักฐานของรายการ ${idx + 1}">
                <img src="${escapeHtml(slipSrc)}" class="slip-thumb" alt="slip" onerror="this.parentElement.style.display='none'">
               </button>` : '';
        return `<div class="list-item" style="animation-delay: ${idx * 0.05}s">
            <div class="item-main">
                <div class="item-info">
                    <div class="item-number">#${idx + 1}</div>
                    <div class="item-detail">
                        <div class="item-primary">🧑‍💼 ${staffLabel}</div>
                        <div class="item-secondary">${escapeHtml(tx.round_label || '—')} &bull; ${thaiDate(tx.created_at)}</div>
                        ${rejectNote}
                    </div>
                </div>
                <div class="item-right">
                    ${slipLink}
                    <span class="item-badge ${badgeClass}">${badgeText}</span>
                </div>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-slip-fullimg]').forEach((button) => {
        button.addEventListener('click', () => {
            openProfileImageModal(button.dataset.slipFullimg);
        });
    });
}

function renderLottery(guesses) {
    const list = document.getElementById('lotto-list');
    if (!guesses || guesses.length === 0) {
        list.innerHTML = '<div class="list-empty">ยังไม่มีประวัติทายเลข</div>';
        return;
    }
    list.innerHTML = guesses.map((g, idx) => {
        let badgeClass, badgeText, rewardText = '';
        if (g.result === 'won') {
            badgeClass = 'won';
            badgeText = '🎉 ถูกรางวัล';
            if (g.reward_amount > 0) {
                rewardText = `<div class="reward-amount">รับ ${parseFloat(g.reward_amount).toLocaleString('th-TH', { minimumFractionDigits: 0 })} ฿</div>`;
            }
        } else if (g.result === 'lost') {
            badgeClass = 'lost';
            badgeText = '😔 ไม่ถูก';
            rewardText = '<div class="reward-gv">รับ GV 300 ฿</div>';
        } else {
            badgeClass = 'waiting';
            badgeText = '⏳ รอผลออก';
        }
        return `<div class="list-item lotto-item" style="animation-delay: ${idx * 0.05}s">
            <div class="item-main">
                <div class="item-info">
                    <div class="lotto-number-display">${escapeHtml(g.guess_number)}</div>
                    <div class="item-detail">
                        <div class="item-primary">เลขที่ทาย: ${escapeHtml(g.guess_number)}</div>
                        <div class="item-secondary">${escapeHtml(g.round_label || '—')} &bull; ${thaiDate(g.created_at)}</div>
                        ${rewardText}
                    </div>
                </div>
                <span class="item-badge ${badgeClass}">${badgeText}</span>
            </div>
        </div>`;
    }).join('');
}

function formatServiceDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('th-TH');
}

function buildCombinedActivities(transactions, guesses) {
    const transactionItems = (transactions || []).map((tx) => ({
        type: 'transaction',
        created_at: tx.created_at,
        round_label: tx.round_label,
        status: tx.status,
        service_date: tx.service_date,
        staff_name: tx.staff_name,
        staff_nickname: tx.staff_nickname,
        slip_image_url: tx.slip_image_url,
        reject_reason: tx.reject_reason
    }));

    const guessItems = (guesses || []).map((guess) => ({
        type: 'guess',
        created_at: guess.created_at,
        round_label: guess.round_label,
        guess_number: guess.guess_number,
        result: guess.result,
        reward_amount: guess.reward_amount
    }));

    return [...transactionItems, ...guessItems].sort((left, right) => {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
}

function renderActivityFeed(activities) {
    const list = document.getElementById('activity-list');
    const total = document.getElementById('profile-history-total');
    if (!list) return;

    if (total) {
        total.textContent = `${Number(activities?.length || 0).toLocaleString('th-TH')} รายการ`;
    }

    if (!activities || activities.length === 0) {
        list.innerHTML = '<div class="list-empty">ยังไม่มีประวัติการใช้บริการหรือผลทายเลข</div>';
        return;
    }

    list.innerHTML = activities.map((item, idx) => {
        if (item.type === 'transaction') {
            const staffLabel = item.staff_nickname
                ? `${item.staff_nickname} <span class="staff-fullname">(${escapeHtml(item.staff_name)})</span>`
                : escapeHtml(item.staff_name || '—');
            const badgeClass = item.status === 'approved' ? 'approved' : item.status === 'rejected' ? 'rejected' : 'pending';
            const badgeText = item.status === 'approved' ? '✅ อนุมัติ' : item.status === 'rejected' ? '❌ ปฏิเสธ' : '⏳ รอตรวจ';
            const slipSrc = item.slip_image_url ? resolveAssetUrl(item.slip_image_url) : '';
            const slipLink = item.slip_image_url
                ? `<button type="button" class="slip-thumb-btn slip-thumb-link" data-slip-fullimg="${escapeHtml(slipSrc)}" aria-label="ดูรูปหลักฐานของรายการกิจกรรม ${idx + 1}">
                    <img src="${escapeHtml(slipSrc)}" class="slip-thumb" alt="slip" onerror="this.parentElement.style.display='none'">
                   </button>` : '';
            return `<div class="list-item" style="animation-delay: ${idx * 0.04}s">
                <div class="item-main">
                    <div class="item-info">
                        <div class="item-number">#${idx + 1}</div>
                        <div class="item-detail">
                            <div class="item-primary"><span class="activity-type-pill activity-type-pill-transaction">🧾 ส่งสลิป</span> ${staffLabel}</div>
                            <div class="item-secondary">${escapeHtml(item.round_label || '—')} &bull; ส่งเมื่อ ${thaiDate(item.created_at)} &bull; ใช้บริการ ${formatServiceDate(item.service_date)}</div>
                            ${item.reject_reason ? `<div class="item-reject-note">เหตุผล: ${escapeHtml(item.reject_reason)}</div>` : ''}
                        </div>
                    </div>
                    <div class="item-right">
                        ${slipLink}
                        <span class="item-badge ${badgeClass}">${badgeText}</span>
                    </div>
                </div>
            </div>`;
        }

        let badgeClass = 'waiting';
        let badgeText = '⏳ รอผลออก';
        let rewardText = '';
        if (item.result === 'won') {
            badgeClass = 'won';
            badgeText = '🎉 ถูกรางวัล';
            if (item.reward_amount > 0) {
                rewardText = `<div class="reward-amount">รับ ${parseFloat(item.reward_amount).toLocaleString('th-TH', { minimumFractionDigits: 0 })} ฿</div>`;
            }
        } else if (item.result === 'lost') {
            badgeClass = 'lost';
            badgeText = '😔 ไม่ถูก';
            rewardText = '<div class="reward-gv">รับ GV 300 ฿</div>';
        }

        return `<div class="list-item lotto-item" style="animation-delay: ${idx * 0.04}s">
            <div class="item-main">
                <div class="item-info">
                    <div class="lotto-number-display">${escapeHtml(item.guess_number || '--')}</div>
                    <div class="item-detail">
                        <div class="item-primary"><span class="activity-type-pill activity-type-pill-guess">🎰 ทายเลข</span> เลขที่ทาย ${escapeHtml(item.guess_number || '--')}</div>
                        <div class="item-secondary">${escapeHtml(item.round_label || '—')} &bull; ${thaiDate(item.created_at)}</div>
                        ${rewardText}
                    </div>
                </div>
                <span class="item-badge ${badgeClass}">${badgeText}</span>
            </div>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-slip-fullimg]').forEach((button) => {
        button.addEventListener('click', () => {
            openProfileImageModal(button.dataset.slipFullimg);
        });
    });
}

// ==================== TABS ====================
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) target.style.display = '';
        });
    });
}

// ==================== LOAD DATA ====================
async function loadProfileData(platformId, platform) {
    try {
        const res = await fetch(
            `${API_BASE}/users/${encodeURIComponent(platformId)}/history?platform=${platform}`
        );
        if (!res.ok) throw new Error('ไม่พบข้อมูลผู้ใช้');
        const data = await res.json();

        const stats = {
            totalSlips: data.transactions.length,
            approved: data.transactions.filter(t => t.status === 'approved').length,
            lotto: data.guesses.length,
            totalPoints: data.total_points || 0
        };

        renderUserCard({ ...data.user, platform, platform_id: platformId }, stats);
        renderProgress(data.current_round_points ?? 0);
        renderRankCard(data.lifetime_approved || 0, data.rank_reset_date || null);
        renderRewardSummary(data.guesses);
        renderActivityFeed(buildCombinedActivities(data.transactions, data.guesses));
        renderTransactions(data.transactions);
        renderLottery(data.guesses);

        hideEl('profile-loading');
        showEl('profile-content');
    } catch (err) {
        console.error('Profile load error:', err);
        hideEl('profile-loading');
        document.getElementById('profile-not-logged-in').querySelector('h3').textContent = err.message;
        showEl('profile-not-logged-in');
    }
}

// ==================== MAIN ====================
document.addEventListener('DOMContentLoaded', async () => {
    spawnParticles();
    initTabs();

    // Restore currentUser from sessionStorage
    const saved = sessionStorage.getItem('currentUser');
    if (saved) {
        try { currentUser = JSON.parse(saved); } catch (_) { /* ignore */ }
    }

    // Try LIFF auto-login if no session user
    if (!currentUser) {
        try {
            await liff.init({ liffId: LIFF_ID });
            if (liff.isLoggedIn()) {
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
                }
            }
        } catch (e) {
            console.warn('LIFF init:', e.message);
        }
    }

    if (!currentUser) {
        hideEl('profile-loading');
        showEl('profile-not-logged-in');
        return;
    }

    if (userAvatarInput) {
        userAvatarInput.addEventListener('change', async () => {
            const file = userAvatarInput.files?.[0];
            if (!file || !currentUser?.platform_id) return;

            const formData = new FormData();
            formData.append('platform', currentUser.platform || 'line');
            formData.append('avatar', file);

            try {
                setAvatarUploadStatus('กำลังอัปโหลดรูปโปรไฟล์...', '');
                const res = await fetch(`${API_BASE}/users/${encodeURIComponent(currentUser.platform_id)}/avatar`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || 'ไม่สามารถอัปโหลดรูปโปรไฟล์ได้');
                }

                currentUser.picture_url = data.picture_url;
                persistCurrentUser();
                setAvatarUploadStatus('อัปโหลดรูปโปรไฟล์สำเร็จ', 'is-success');
                await loadProfileData(currentUser.platform_id, currentUser.platform || 'line');
            } catch (error) {
                console.error('Avatar upload error:', error);
                setAvatarUploadStatus(error.message || 'ไม่สามารถอัปโหลดรูปโปรไฟล์ได้', 'is-error');
            } finally {
                userAvatarInput.value = '';
            }
        });
    }

    await loadProfileData(currentUser.platform_id, currentUser.platform || 'line');
});

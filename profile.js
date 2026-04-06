const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';
const LIFF_ID = '2009696727-evibES3H';

let currentUser = null;

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

function showEl(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hideEl(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

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
    { name: 'Unranked',  icon: '🔘', color: '#888888', minApproved: 0,  minPoints: 0    },
    { name: 'Bronze',    icon: '🥉', color: '#cd7f32', minApproved: 3,  minPoints: 0    },
    { name: 'Silver',    icon: '🥈', color: '#c0c0c0', minApproved: 10, minPoints: 50   },
    { name: 'Gold',      icon: '🥇', color: '#ffd700', minApproved: 25, minPoints: 150  },
    { name: 'Platinum',  icon: '💎', color: '#00f0ff', minApproved: 50, minPoints: 400  },
    { name: 'Diamond',   icon: '👑', color: '#b44aff', minApproved: 100,minPoints: 1000 },
    { name: 'Master',    icon: '🏆', color: '#ff3c3c', minApproved: 200,minPoints: 2500 },
];

function calculateRank(lifetimeApproved, totalPoints) {
    let rank = RANK_TIERS[0];
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (lifetimeApproved >= RANK_TIERS[i].minApproved && totalPoints >= RANK_TIERS[i].minPoints) {
            rank = RANK_TIERS[i];
            break;
        }
    }
    // Find next rank
    const currentIdx = RANK_TIERS.indexOf(rank);
    const nextRank = currentIdx < RANK_TIERS.length - 1 ? RANK_TIERS[currentIdx + 1] : null;
    return { current: rank, next: nextRank, currentIdx };
}

function renderRankCard(lifetimeApproved, totalPoints) {
    const { current, next, currentIdx } = calculateRank(lifetimeApproved, totalPoints);
    const el = document.getElementById('rank-card');
    if (!el) return;

    // Progress to next rank
    let progressHtml = '';
    if (next) {
        const approvedPct = next.minApproved > 0 ? Math.min(lifetimeApproved / next.minApproved * 100, 100) : 100;
        const pointsPct = next.minPoints > 0 ? Math.min(totalPoints / next.minPoints * 100, 100) : 100;
        const overallPct = Math.min((approvedPct + pointsPct) / 2, 100);
        progressHtml = `
            <div class="rank-progress-section">
                <div class="rank-next-label">ถัดไป: <span style="color:${next.color}">${next.icon} ${next.name}</span></div>
                <div class="rank-progress-bar">
                    <div class="rank-progress-fill" style="width:${overallPct}%; background:linear-gradient(90deg, ${current.color}, ${next.color})"></div>
                </div>
                <div class="rank-progress-details">
                    <span>สลิป: ${lifetimeApproved}/${next.minApproved}</span>
                    <span>แต้ม: ${totalPoints.toLocaleString()}/${next.minPoints.toLocaleString()}</span>
                </div>
            </div>`;
    } else {
        progressHtml = '<div class="rank-max-label">🏆 แรงค์สูงสุดแล้ว!</div>';
    }

    // Rank tier dots
    const dotsHtml = RANK_TIERS.slice(1).map((tier, idx) => {
        const achieved = idx + 1 <= currentIdx;
        return `<div class="rank-tier-dot ${achieved ? 'achieved' : ''}" style="--tier-color:${tier.color}" title="${tier.name}">
            <span>${tier.icon}</span>
        </div>`;
    }).join('');

    el.innerHTML = `
        <div class="rank-display">
            <div class="rank-icon-wrap" style="--rank-color:${current.color}">
                <span class="rank-icon">${current.icon}</span>
            </div>
            <div class="rank-info">
                <div class="rank-label">แรงค์ปัจจุบัน</div>
                <div class="rank-name" style="color:${current.color}">${current.name}</div>
                <div class="rank-stats-mini">สลิปอนุมัติ: ${lifetimeApproved} &bull; แต้ม: ${totalPoints.toLocaleString()}</div>
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
    const cashbackAfterTax = totalCashback * 0.93; // 7% tax
    const totalGV = lostGuesses.length * 500;

    el.innerHTML = `
        <div class="reward-summary-header">🎁 สรุปรางวัลทั้งหมด</div>
        <div class="reward-summary-grid">
            <div class="reward-card reward-cashback">
                <div class="reward-card-icon">💰</div>
                <div class="reward-card-value">${totalCashback.toLocaleString('th-TH')} ฿</div>
                <div class="reward-card-label">Cashback (ก่อนภาษี)</div>
                <div class="reward-card-sub">หักภาษี 7% = <strong>${cashbackAfterTax.toLocaleString('th-TH', { maximumFractionDigits: 0 })} ฿</strong></div>
                <div class="reward-card-count">${wonGuesses.length} ครั้งที่ถูก</div>
            </div>
            <div class="reward-card reward-gv-card">
                <div class="reward-card-icon">🎟️</div>
                <div class="reward-card-value">${totalGV.toLocaleString('th-TH')} ฿</div>
                <div class="reward-card-label">Gift Voucher</div>
                <div class="reward-card-sub">500 ฿ × ${lostGuesses.length} ครั้ง</div>
                <div class="reward-card-count">${lostGuesses.length} ครั้งที่ไม่ถูก</div>
            </div>
        </div>
        ${pendingGuesses.length > 0 ? `<div class="reward-pending-note">⏳ รอผลอีก ${pendingGuesses.length} รายการ</div>` : ''}
    `;
}

function renderUserCard(user, stats) {
    const avatar = document.getElementById('user-avatar');
    if (user.picture_url) {
        avatar.src = user.picture_url;
    } else {
        avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || 'U')}&background=1a1a2e&color=00f0ff&size=80`;
    }

    document.getElementById('user-display-name').textContent = user.display_name || '—';
    document.getElementById('user-platform-id').textContent = `ID: ${user.platform_id || user.id}`;

    const badge = document.getElementById('platform-badge');
    const platform = user.platform || 'line';
    badge.textContent = platform === 'telegram' ? 'Telegram' : 'LINE';
    badge.className = 'platform-badge ' + platform;

    document.getElementById('stat-total-slips').textContent = stats.totalSlips;
    document.getElementById('stat-approved').textContent = stats.approved;
    document.getElementById('stat-lotto').textContent = stats.lotto;
    document.getElementById('stat-points').textContent = Number(stats.totalPoints || 0).toLocaleString('th-TH');
}

function renderProgress(count) {
    const fill = document.getElementById('profile-progress-fill');
    const label = document.getElementById('profile-progress-count');
    const pct = Math.min(count / 5 * 100, 100);
    fill.style.width = pct + '%';
    label.textContent = `${Math.min(count, 5)} / 5`;
    for (let i = 1; i <= 5; i++) {
        const dot = document.getElementById(`pdot-${i}`);
        if (dot) dot.classList.toggle('filled', i <= count);
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
        const slipLink = tx.slip_image_url
            ? `<a href="${escapeHtml(tx.slip_image_url)}" target="_blank" class="slip-thumb-link">
                <img src="${escapeHtml(tx.slip_image_url)}" class="slip-thumb" alt="slip" onerror="this.parentElement.style.display='none'">
               </a>` : '';
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
            rewardText = '<div class="reward-gv">รับ GV 500 ฿</div>';
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
        renderProgress(data.current_round_progress ?? (data.user.progress_count || 0));
        renderRankCard(data.lifetime_approved || 0, data.total_points || 0);
        renderRewardSummary(data.guesses);
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

    await loadProfileData(currentUser.platform_id, currentUser.platform || 'line');
});

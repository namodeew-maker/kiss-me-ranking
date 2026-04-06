const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';

// ==================== RANK TIERS (same as profile.js) ====================
const RANK_TIERS = [
    { name: 'Unranked',  icon: '🔘', color: '#888888', minApproved: 0,  minPoints: 0    },
    { name: 'Bronze',    icon: '🥉', color: '#cd7f32', minApproved: 3,  minPoints: 0    },
    { name: 'Silver',    icon: '🥈', color: '#c0c0c0', minApproved: 10, minPoints: 50   },
    { name: 'Gold',      icon: '🥇', color: '#ffd700', minApproved: 25, minPoints: 150  },
    { name: 'Platinum',  icon: '💎', color: '#00f0ff', minApproved: 50, minPoints: 400  },
    { name: 'Diamond',   icon: '👑', color: '#b44aff', minApproved: 100,minPoints: 1000 },
    { name: 'Master',    icon: '🏆', color: '#ff3c3c', minApproved: 200,minPoints: 2500 },
];

function getCustomerRank(totalApproved, totalPoints) {
    let rank = RANK_TIERS[0];
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (totalApproved >= RANK_TIERS[i].minApproved && totalPoints >= RANK_TIERS[i].minPoints) {
            rank = RANK_TIERS[i];
            break;
        }
    }
    return rank;
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

// ==================== TABS ====================
function initTabs() {
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.rank-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.rank-tab-content').forEach(c => { c.style.display = 'none'; });
            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) target.style.display = '';
        });
    });
}

// ==================== STAFF RANKING ====================
async function loadStaffRanking() {
    const list = document.getElementById('staff-ranking-list');
    try {
        const res = await fetch(`${API_BASE}/ranking/staff`);
        const staffs = await res.json();
        if (!staffs.length) {
            list.innerHTML = '<div class="ranking-loading">ยังไม่มีข้อมูลอันดับ</div>';
            return;
        }
        list.innerHTML = staffs.map((s, idx) => {
            const rank = idx + 1;
            const avatarSrc = s.avatar_url
                ? (s.avatar_url.startsWith('http') ? s.avatar_url : `/uploads/${encodeURIComponent(s.avatar_url)}`)
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(s.nickname || s.name)}&background=1a1a2e&color=00f0ff&size=80`;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const topClass = rank <= 3 ? `rank-top-${rank}` : '';
            return `<div class="ranking-item ${topClass}" style="animation-delay: ${idx * 0.05}s">
                <div class="ranking-position">${medal}</div>
                <img class="ranking-avatar" src="${avatarSrc}" alt="${s.nickname || s.name}"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=1a1a2e&color=00f0ff&size=80'">
                <div class="ranking-info">
                    <div class="ranking-name">${s.nickname || s.name}</div>
                    ${s.nickname && s.name !== s.nickname ? `<div class="ranking-sub">${s.name}</div>` : ''}
                    <div class="ranking-stats-row">
                        <span class="ranking-stat">💌 ${s.total_votes} โหวต</span>
                        <span class="ranking-stat">⭐ ${s.avg_overall}/10</span>
                    </div>
                </div>
                <div class="ranking-score-circle">
                    <span class="ranking-score-num">${s.total_votes}</span>
                    <span class="ranking-score-label">โหวต</span>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = '<div class="ranking-loading">ไม่สามารถโหลดอันดับได้</div>';
    }
}

// ==================== CUSTOMER RANKING ====================
async function loadCustomerRanking() {
    const list = document.getElementById('customer-ranking-list');
    try {
        const res = await fetch(`${API_BASE}/ranking/customers`);
        const customers = await res.json();
        if (!customers.length) {
            list.innerHTML = '<div class="ranking-loading">ยังไม่มีข้อมูลอันดับ</div>';
            return;
        }
        list.innerHTML = customers.map((c, idx) => {
            const rank = idx + 1;
            const avatarSrc = c.picture_url
                || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.display_name || 'U')}&background=1a1a2e&color=00f0ff&size=80`;
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const topClass = rank <= 3 ? `rank-top-${rank}` : '';
            const tierInfo = getCustomerRank(c.total_approved, c.total_points);
            return `<div class="ranking-item ${topClass}" style="animation-delay: ${idx * 0.05}s">
                <div class="ranking-position">${medal}</div>
                <img class="ranking-avatar" src="${avatarSrc}" alt="${c.display_name}"
                     onerror="this.src='https://ui-avatars.com/api/?name=U&background=1a1a2e&color=00f0ff&size=80'">
                <div class="ranking-info">
                    <div class="ranking-name">${c.display_name || '—'}</div>
                    <div class="ranking-tier" style="color:${tierInfo.color}">${tierInfo.icon} ${tierInfo.name}</div>
                    <div class="ranking-stats-row">
                        <span class="ranking-stat">✅ ${c.total_approved} สลิป</span>
                        <span class="ranking-stat">💎 ${c.total_points.toLocaleString()} แต้ม</span>
                    </div>
                </div>
                <div class="ranking-score-circle" style="--score-color:${tierInfo.color}">
                    <span class="ranking-score-num">${c.total_approved}</span>
                    <span class="ranking-score-label">สลิป</span>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        list.innerHTML = '<div class="ranking-loading">ไม่สามารถโหลดอันดับได้</div>';
    }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    spawnParticles();
    initTabs();
    loadStaffRanking();
    loadCustomerRanking();
});

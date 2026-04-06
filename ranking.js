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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text ?? ''));
    return div.innerHTML;
}

function getAvatarSrc(entry, fallbackName) {
    if (entry && entry.avatar_url) {
        return entry.avatar_url.startsWith('http')
            ? entry.avatar_url
            : `/uploads/${encodeURIComponent(entry.avatar_url)}`;
    }
    if (entry && entry.picture_url) {
        return entry.picture_url;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || 'U')}&background=1a1a2e&color=00f0ff&size=160`;
}

function formatRank(rank) {
    return String(rank).padStart(2, '0');
}

function renderLeaderboardBoard(list, options) {
    if (!list.length) {
        return '<div class="ranking-empty">ยังไม่มีข้อมูลอันดับ</div>';
    }

    const topThree = [0, 1, 2]
        .map(index => list[index])
        .filter(Boolean);
    const best = list[0];

    const podiumSlots = topThree.map((entry, index) => {
        const rank = index + 1;
        const avatarSrc = options.getAvatar(entry);
        return `<div class="podium-slot ${rank === 1 ? 'is-first' : ''}">
            <div class="podium-slot-rank">${formatRank(rank)}</div>
            <img class="podium-avatar" src="${avatarSrc}" alt="${escapeHtml(options.getDisplayName(entry))}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(options.getDisplayName(entry))}&background=1a1a2e&color=00f0ff&size=160'">
            <div class="podium-name">${escapeHtml(options.getDisplayName(entry))}</div>
            <div class="podium-meta">${escapeHtml(options.getSubtitle(entry))}</div>
            <div class="podium-points">${escapeHtml(options.getMetric(entry))}</div>
        </div>`;
    }).join('');

    const rows = list.map((entry, index) => {
        const rank = index + 1;
        return `<div class="leaderboard-row ${rank === 1 ? 'is-top-1' : ''}" style="animation-delay:${index * 0.04}s">
            <div class="leaderboard-row-rank">${formatRank(rank)}</div>
            <div>
                <div class="leaderboard-row-name">${escapeHtml(options.getDisplayName(entry))}</div>
                <div class="leaderboard-row-sub">${escapeHtml(options.getSubtitle(entry))}</div>
            </div>
            <div class="leaderboard-row-points">${escapeHtml(options.getMetric(entry))}</div>
        </div>`;
    }).join('');

    return `<section class="leaderboard-card leaderboard-podium">
        <div class="leaderboard-card-header">
            <div>
                <h2 class="leaderboard-card-title">Leaderboard</h2>
                <p class="leaderboard-card-subtitle">Top 3 champions</p>
            </div>
            <span class="leaderboard-mini-label">${escapeHtml(options.boardLabel)}</span>
        </div>
        <div class="leaderboard-trophy-row">
            <div class="trophy-pill">🏆 1</div>
            <div class="trophy-pill">🥈 2</div>
            <div class="trophy-pill">🥉 3</div>
        </div>
        <div class="leaderboard-podium-grid">
            ${podiumSlots}
        </div>
    </section>

    <section class="leaderboard-card leaderboard-table-card">
        <div class="leaderboard-card-header">
            <div>
                <h2 class="leaderboard-card-title">Ranking Table</h2>
                <p class="leaderboard-card-subtitle">Live scoreboard</p>
            </div>
            <span class="leaderboard-mini-label">${escapeHtml(options.metricHeader)}</span>
        </div>
        <div class="leaderboard-table">
            <div class="leaderboard-table-head">
                <div>Rank</div>
                <div>Name</div>
                <div style="text-align:right;">${escapeHtml(options.metricHeader)}</div>
            </div>
            ${rows}
        </div>
    </section>

    <section class="leaderboard-card leaderboard-best-card">
        <div class="best-player-inner">
            <div class="leaderboard-card-header">
                <div>
                    <h2 class="leaderboard-card-title">Best Player</h2>
                    <p class="leaderboard-card-subtitle">Current No.1</p>
                </div>
            </div>
            <div class="best-player-top">
                <div class="best-player-rank">1</div>
                <div class="best-player-label">Best<br>Player</div>
            </div>
            <div class="best-player-score-wrap">
                <div class="best-player-score-label">${escapeHtml(options.metricHeader)}</div>
                <div class="best-player-score">${escapeHtml(options.getMetric(best))}</div>
            </div>
            <div class="best-player-name">${escapeHtml(options.getDisplayName(best))}</div>
            <div class="best-player-meta">
                ${options.getBestMeta(best).map(meta => `<div class="best-player-chip"><span>${escapeHtml(meta.label)}</span><strong>${escapeHtml(meta.value)}</strong></div>`).join('')}
            </div>
        </div>
    </section>`;
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
            document.querySelectorAll('.rank-tab-content').forEach(c => c.classList.add('rank-tab-hidden'));
            btn.classList.add('active');
            const target = document.getElementById('tab-' + btn.dataset.tab);
            if (target) target.classList.remove('rank-tab-hidden');
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
        list.innerHTML = renderLeaderboardBoard(staffs, {
            boardLabel: 'Staff Leaderboard',
            metricHeader: 'Points',
            getAvatar: (staff) => getAvatarSrc(staff, staff.nickname || staff.name),
            getDisplayName: (staff) => staff.nickname || staff.name || '—',
            getSubtitle: (staff) => {
                const realName = staff.name && staff.name !== staff.nickname ? `ชื่อจริง ${staff.name}` : 'พนักงานยอดนิยม';
                return `${realName} • เรต ${Number(staff.avg_overall || 0).toFixed(1)}/10`;
            },
            getMetric: (staff) => String(staff.total_votes || 0),
            getBestMeta: (staff) => [
                { label: 'Votes', value: String(staff.total_votes || 0) },
                { label: 'Avg Score', value: `${Number(staff.avg_overall || 0).toFixed(1)}/10` },
                { label: 'Service', value: `${Number(staff.avg_service || 0).toFixed(1)}/10` }
            ]
        });
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
        list.innerHTML = renderLeaderboardBoard(customers, {
            boardLabel: 'Customer Leaderboard',
            metricHeader: 'Points',
            getAvatar: (customer) => getAvatarSrc(customer, customer.display_name || 'U'),
            getDisplayName: (customer) => customer.display_name || '—',
            getSubtitle: (customer) => {
                const tierInfo = getCustomerRank(customer.total_approved, customer.total_points);
                return `${tierInfo.icon} ${tierInfo.name} • อนุมัติ ${customer.total_approved || 0} ครั้ง`;
            },
            getMetric: (customer) => Number(customer.total_points || 0).toLocaleString('th-TH'),
            getBestMeta: (customer) => {
                const tierInfo = getCustomerRank(customer.total_approved, customer.total_points);
                return [
                    { label: 'Approved', value: String(customer.total_approved || 0) },
                    { label: 'Tier', value: tierInfo.name },
                    { label: 'Points', value: Number(customer.total_points || 0).toLocaleString('th-TH') }
                ];
            }
        });
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

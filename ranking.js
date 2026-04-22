const API_BASE = window.location.hostname === 'namodeew-maker.github.io'
    ? 'https://kiss-me-ranking.onrender.com/api'
    : '/api';
const API_ROOT = API_BASE.replace(/\/api$/, '');
const LATIN_NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

// ==================== RANK TIERS (same as profile.js) ====================
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

function getCustomerRank(totalApproved) {
    let rank = RANK_TIERS[0];
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
        if (totalApproved >= RANK_TIERS[i].minApproved) {
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

function renderRankLogo(rank, className) {
    if (rank?.image) {
        return `<img class="${className}" src="${rank.image}" alt="${escapeHtml(rank.name)} rank" loading="lazy">`;
    }
    return `<span class="${className} customer-rank-logo-fallback" aria-hidden="true">${rank?.icon || '🔘'}</span>`;
}

function renderCustomerTierBadge(tierInfo, className = '') {
    if (!tierInfo) return '';
    return `<span class="customer-tier-badge ${className}" style="--tier-color:${tierInfo.color}">
        <span>${escapeHtml(tierInfo.name)}</span>
    </span>`;
}

function renderRankLogoMark(tierInfo, className = '') {
    if (!tierInfo) return '';
    return `<div class="leaderboard-rank-logo-wrap ${className}" style="--tier-color:${tierInfo.color}">
        ${renderRankLogo(tierInfo, 'leaderboard-rank-logo')}
    </div>`;
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

const rankingImgModal = document.getElementById('ranking-img-modal');
const rankingImgModalImg = document.getElementById('ranking-img-modal-img');
const rankingImgModalClose = document.getElementById('ranking-img-modal-close');

function openRankingImageModal(src, alt = 'รูปโปรไฟล์') {
    if (!rankingImgModal || !rankingImgModalImg) return;
    rankingImgModalImg.src = src;
    rankingImgModalImg.alt = alt;
    rankingImgModal.hidden = false;
}

if (rankingImgModalClose) {
    rankingImgModalClose.addEventListener('click', () => {
        rankingImgModal.hidden = true;
    });
}

if (rankingImgModal) {
    rankingImgModal.addEventListener('click', (event) => {
        if (event.target === rankingImgModal) {
            rankingImgModal.hidden = true;
        }
    });
}

function getAvatarSrc(entry, fallbackName) {
    if (entry && entry.avatar_url) {
        return resolveAssetUrl(entry.avatar_url);
    }
    if (entry && entry.picture_url) {
        return resolveAssetUrl(entry.picture_url);
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName || 'U')}&background=1a1a2e&color=00f0ff&size=160`;
}

function formatRank(rank) {
    return String(rank).padStart(2, '0');
}

function formatMetricNumber(value) {
    return LATIN_NUMBER_FORMATTER.format(Number(value || 0));
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
        const displayName = options.getDisplayName(entry);
        const tierInfo = options.getTier ? options.getTier(entry) : null;
        const subtitle = options.getSubtitle(entry);
        const metaParts = [
            renderCustomerTierBadge(tierInfo, 'podium-tier-badge'),
            subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''
        ].filter(Boolean).join('');
        const avatarNode = avatarSrc
            ? `<button type="button" class="podium-avatar-btn" data-fullimg="${avatarSrc}" data-avatar-name="${escapeHtml(displayName)}" aria-label="ดูรูป ${escapeHtml(displayName)} เต็ม">
                <img class="podium-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=160'">
               </button>`
            : `<img class="podium-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=160'">`;
        return `<div class="podium-slot ${rank === 1 ? 'is-first' : ''}">
            <div class="podium-slot-rank">${formatRank(rank)}</div>
            ${renderRankLogoMark(tierInfo, 'podium-rank-logo-wrap')}
            ${avatarNode}
            <div class="podium-name">${escapeHtml(displayName)}</div>
            ${metaParts ? `<div class="podium-meta">${metaParts}</div>` : ''}
            ${options.hideMetric ? '' : `<div class="podium-points">${escapeHtml(options.getMetric(entry))}</div>`}
        </div>`;
    }).join('');

    const rows = list.map((entry, index) => {
        const rank = index + 1;
        const displayName = options.getDisplayName(entry);
        const avatarSrc = options.getAvatar(entry);
        const tierInfo = options.getTier ? options.getTier(entry) : null;
        const subtitle = options.getSubtitle(entry);
        const rowSubParts = [
            renderCustomerTierBadge(tierInfo, 'leaderboard-row-tier-badge'),
            subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''
        ].filter(Boolean).join('');
        const rowAvatar = avatarSrc
            ? `<button type="button" class="leaderboard-row-avatar-btn" data-fullimg="${avatarSrc}" data-avatar-name="${escapeHtml(displayName)}" aria-label="ดูรูป ${escapeHtml(displayName)} เต็ม">
                <img class="leaderboard-row-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96'">
               </button>`
            : `<img class="leaderboard-row-avatar" src="${avatarSrc}" alt="${escapeHtml(displayName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1a1a2e&color=00f0ff&size=96'">`;
        return `<div class="leaderboard-row ${rank === 1 ? 'is-top-1' : ''}">
            <div class="leaderboard-row-rank">${formatRank(rank)}</div>
            ${renderRankLogoMark(tierInfo, 'leaderboard-row-rank-logo-wrap')}
            <div class="leaderboard-row-main">
                ${rowAvatar}
                <div>
                <div class="leaderboard-row-name">${escapeHtml(displayName)}</div>
                ${rowSubParts ? `<div class="leaderboard-row-sub">${rowSubParts}</div>` : ''}
                </div>
            </div>
            <div class="leaderboard-row-points">${escapeHtml(options.getMetric(entry))}</div>
        </div>`;
    }).join('');

    const bestDisplayName = options.getDisplayName(best);
    const bestAvatarSrc = options.getAvatar(best);
    const bestTierInfo = options.getTier ? options.getTier(best) : null;
    const bestAvatar = bestAvatarSrc
        ? `<button type="button" class="best-player-avatar-btn" data-fullimg="${bestAvatarSrc}" data-avatar-name="${escapeHtml(bestDisplayName)}" aria-label="ดูรูป ${escapeHtml(bestDisplayName)} เต็ม">
            <img class="best-player-avatar" src="${bestAvatarSrc}" alt="${escapeHtml(bestDisplayName)}"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(bestDisplayName)}&background=1a1a2e&color=00f0ff&size=160'">
           </button>`
        : `<img class="best-player-avatar" src="${bestAvatarSrc}" alt="${escapeHtml(bestDisplayName)}"
             onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(bestDisplayName)}&background=1a1a2e&color=00f0ff&size=160'">`;

    const bestMetaItems = options.hideBestMeta
        ? []
        : (options.getBestMeta ? options.getBestMeta(best) : []);

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

    ${options.hideTable ? '' : `<section class="leaderboard-card leaderboard-table-card">
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
                <div>Badge</div>
                <div>Name</div>
                <div class="leaderboard-table-head-metric">${escapeHtml(options.metricHeader)}</div>
            </div>
            ${rows}
        </div>
    </section>`}

    <section class="leaderboard-card leaderboard-best-card">
        <div class="best-player-inner">
            <div class="leaderboard-card-header">
                <div>
                    <h2 class="leaderboard-card-title">Best Player</h2>
                    <p class="leaderboard-card-subtitle">Current No.1</p>
                </div>
            </div>
            <div class="best-player-top">
                <div class="best-player-rank-block">
                    <div class="best-player-rank">1</div>
                    <div class="best-player-label">Best<br>Player</div>
                </div>
                ${renderRankLogoMark(bestTierInfo, 'best-player-rank-logo-wrap')}
                <div class="best-player-avatar-wrap">
                    ${bestAvatar}
                    <div class="best-player-avatar-caption">อันดับสูงสุดตอนนี้</div>
                </div>
            </div>
            ${options.hideMetric ? '' : `<div class="best-player-score-wrap">
                <div class="best-player-score-label">${escapeHtml(options.metricHeader)}</div>
                <div class="best-player-score">${escapeHtml(options.getMetric(best))}</div>
                <div class="best-player-tier">${renderCustomerTierBadge(bestTierInfo, 'best-player-tier-badge')}</div>
            </div>`}
            <div class="best-player-name">${escapeHtml(bestDisplayName)}</div>
            ${bestMetaItems.length ? `<div class="best-player-meta">
                ${bestMetaItems.map(meta => `<div class="best-player-chip"><span>${escapeHtml(meta.label)}</span><strong>${escapeHtml(meta.value)}</strong></div>`).join('')}
            </div>` : ''}
        </div>
    </section>`;
}

function bindRankingImagePreview(container) {
    container.querySelectorAll('[data-fullimg]').forEach((button) => {
        button.addEventListener('click', () => {
            openRankingImageModal(button.dataset.fullimg, button.dataset.avatarName || 'รูปพนักงาน');
        });
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

// ==================== ROUND SELECT & TABS ====================
async function fetchAvailableRounds() {
    try {
        const res = await fetch(`${API_BASE}/round`);
        const data = await res.json();
        const configuredRounds = Array.isArray(data?.ranking_rounds) ? data.ranking_rounds : [];
        return configuredRounds
            .filter((round) => round && round.value && round.label)
            .map((round) => ({
                value: String(round.value),
                label: String(round.label)
            }));
    } catch {
        return [];
    }
}

function getSelectedRounds() {
    const select = document.getElementById('round-select');
    return select?.value ? [select.value] : ['all'];
}

function switchTab(tab) {
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.rank-tab-content').forEach(sec => {
        sec.classList.toggle('rank-tab-hidden', sec.id !== `tab-${tab}`);
    });
}

async function loadCustomerRanking(rounds) {
    const list = document.getElementById('customer-ranking-list');
    try {
        // TODO: ส่ง rounds ไป filter ที่ backend ถ้ามี endpoint รองรับ
        const res = await fetch(`${API_BASE}/ranking/customers`);
        const customers = await res.json();
        if (!customers.length) {
            list.innerHTML = '<div class="ranking-loading">ยังไม่มีข้อมูลอันดับ</div>';
            return;
        }
        list.innerHTML = renderLeaderboardBoard(customers, {
            boardLabel: 'Customer Leaderboard',
            metricHeader: 'Rank EXP',
            getAvatar: (customer) => getAvatarSrc(customer, customer.display_name || 'U'),
            getDisplayName: (customer) => customer.display_name || '—',
            getSubtitle: (customer) => {
                const resetText = customer.rank_reset_date
                    ? ` • รีแรงค์ ${new Date(`${customer.rank_reset_date}T00:00:00`).toLocaleDateString('th-TH')}`
                    : '';
                return `Rank EXP ${formatMetricNumber(customer.total_approved || 0)} จากสลิปอนุมัติ${resetText}`;
            },
            getTier: (customer) => getCustomerRank(customer.total_approved),
            getMetric: (customer) => formatMetricNumber(customer.total_approved || 0),
            getBestMeta: (customer) => {
                const tierInfo = getCustomerRank(customer.total_approved);
                return [
                    { label: 'Rank EXP', value: formatMetricNumber(customer.total_approved || 0) },
                    { label: 'Tier', value: tierInfo.name },
                    ...(customer.rank_reset_date ? [{ label: 'Re-rank', value: new Date(`${customer.rank_reset_date}T00:00:00`).toLocaleDateString('th-TH') }] : []),
                    { label: 'Last Active', value: customer.last_service_at ? new Date(customer.last_service_at).toLocaleDateString('th-TH') : '—' }
                ];
            }
        });
        bindRankingImagePreview(list);
    } catch (err) {
        list.innerHTML = '<div class="ranking-loading">ไม่สามารถโหลดอันดับได้</div>';
    }
}

async function loadStaffUsageRanking(rounds) {
    const list = document.getElementById('staff-usage-ranking-list');
    try {
        // TODO: ส่ง rounds ไป filter ที่ backend ถ้ามี endpoint รองรับ
        const res = await fetch(`${API_BASE}/ranking/staff-usage`);
        const staffs = await res.json();
        if (!Array.isArray(staffs) || !staffs.length) {
            list.innerHTML = '<div class="ranking-loading">ยังไม่มีข้อมูลอันดับ</div>';
            return;
        }
        const top3 = staffs.slice(0, 3);
        list.innerHTML = renderLeaderboardBoard(top3, {
            boardLabel: 'Service Usage Leaderboard',
            metricHeader: 'ยอดแจ้งใช้บริการ',
            hideTable: true,
            hideMetric: true,
            getAvatar: (staff) => getAvatarSrc(staff, staff.nickname || staff.name || 'U'),
            getDisplayName: (staff) => staff.nickname || staff.name || '—',
            getSubtitle: () => '',
            getTier: null,
            getMetric: (staff) => formatMetricNumber(staff.total_submissions || 0),
            getBestMeta: (staff) => [
                { label: 'ล่าสุด', value: staff.last_service_at ? new Date(staff.last_service_at).toLocaleDateString('th-TH') : '—' }
            ]
        });
        bindRankingImagePreview(list);
    } catch (err) {
        list.innerHTML = '<div class="ranking-loading">ไม่สามารถโหลดอันดับได้</div>';
    }
}

async function reloadRanking() {
    const tab = document.querySelector('.rank-tab-btn.active')?.dataset.tab || 'customer';
    const rounds = getSelectedRounds();
    if (tab === 'customer') {
        await loadCustomerRanking(rounds);
        return;
    }
    await loadStaffUsageRanking(rounds);
}

document.addEventListener('DOMContentLoaded', async () => {
    spawnParticles();
    const roundSelectWrap = document.getElementById('ranking-round-select');
    const roundSelect = document.getElementById('round-select');
    const rounds = await fetchAvailableRounds();
    if (roundSelectWrap && roundSelect && rounds.length) {
        roundSelect.innerHTML = rounds.map(r => `<option value="${r.value}">${r.label}</option>`).join('');
        roundSelect.value = rounds[0].value;
        roundSelectWrap.hidden = false;
        roundSelect.addEventListener('change', reloadRanking);
    }

    document.getElementById('ranking-tabs').addEventListener('click', (e) => {
        if (e.target.classList.contains('rank-tab-btn')) {
            switchTab(e.target.dataset.tab);
            reloadRanking();
        }
    });

    reloadRanking();
});

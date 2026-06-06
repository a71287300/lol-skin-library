/* ========================================
   LOL Skin Library — Frontend Logic
   Local server mode (Node.js backend)
   ======================================== */

let appData = null;
let profileData = null;
let currentFilter = 'all';
let shoppingCart = [];
let ddragonVersion = '16.11.1'; // fallback
let runesMap = new Map();

// ========================================
// Connect & Fetch Data
// ========================================

async function connectAndFetch() {
  const btn = document.getElementById('btn-connect');
  const status = document.getElementById('connect-status');

  btn.disabled = true;
  status.className = 'connect-status';
  status.textContent = '';

  // Show loading
  document.getElementById('connect-section').classList.add('hidden');
  document.getElementById('loading-section').classList.remove('hidden');

  try {
    updateLoadingText('正在連接 League Client...');
    const connectResp = await fetch('/api/lcu/connect');
    const connectResult = await connectResp.json();
    if (!connectResult.success) throw new Error(connectResult.message);

    updateLoadingText('正在讀取造型資料...');
    const skinsResp = await fetch('/api/lcu/skins');
    const skinsResult = await skinsResp.json();
    if (!skinsResult.success) throw new Error(skinsResult.message);

    updateLoadingText('正在讀取戰績與積分資料...');
    try {
      const profileResp = await fetch('/api/lcu/profile');
      const profileResult = await profileResp.json();
      if (profileResult.success) {
        profileData = profileResult.data;
      }
    } catch (e) {
      console.error('Failed to fetch profile:', e);
    }

    try {
      const vResp = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      const versions = await vResp.json();
      if (versions && versions.length > 0) ddragonVersion = versions[0];
      
      // Fetch Runes
      const runesResp = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/zh_TW/runesReforged.json`);
      if (runesResp.ok) {
        const runesData = await runesResp.json();
        runesData.forEach(tree => {
          runesMap.set(tree.id, tree.icon);
          tree.slots.forEach(slot => {
            slot.runes.forEach(rune => {
              runesMap.set(rune.id, rune.icon);
            });
          });
        });
      }
    } catch (e) {
      console.error('Failed to fetch ddragon data:', e);
    }

    // The server already processed the data into the final appData format
    appData = skinsResult.data;
    renderResults();
    if (profileData) {
      document.getElementById('app-tabs').classList.remove('hidden');
      renderProfile();
    }

  } catch (error) {
    // Show error and go back
    document.getElementById('loading-section').classList.add('hidden');
    document.getElementById('connect-section').classList.remove('hidden');
    document.getElementById('btn-connect').disabled = false;
    
    const status = document.getElementById('connect-status');
    status.className = 'connect-status error';
    status.textContent = `❌ ${error.message}`;
  }
}

// Automatically trigger fetch when page loads
document.addEventListener('DOMContentLoaded', () => {
  connectAndFetch();
});

function updateLoadingText(text) {
  document.getElementById('loading-text').textContent = text;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderResults() {
  document.getElementById('loading-section').classList.add('hidden');
  document.getElementById('results-section').classList.remove('hidden');

  const badge = document.getElementById('summoner-badge');
  badge.classList.remove('hidden');
  document.getElementById('summoner-name').textContent = appData.summoner.name;
  document.getElementById('summoner-level').textContent = `Lv. ${appData.summoner.level}`;
  document.getElementById('summoner-icon').src =
    `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${appData.summoner.profileIconId}.jpg`;

  renderStats();
  renderChampions();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  event.currentTarget.classList.add('active');

  if (tabId === 'skins') {
    document.getElementById('results-section').classList.remove('hidden');
    document.getElementById('profile-section').classList.add('hidden');
  } else if (tabId === 'profile') {
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('profile-section').classList.remove('hidden');
  }
}

function renderProfile() {
  if (!profileData) return;

  const rankedGrid = document.getElementById('ranked-grid');
  const matchList = document.getElementById('match-list');
  
  // Render Ranked
  const queues = profileData.ranked.queues || [];
  const soloQ = queues.find(q => q.queueType === 'RANKED_SOLO_5x5');
  const flexQ = queues.find(q => q.queueType === 'RANKED_FLEX_SR');
  
  let rankedHtml = '';
  [soloQ, flexQ].forEach(q => {
    if (!q) return;
    const name = q.queueType === 'RANKED_SOLO_5x5' ? '單雙積分' : '彈性積分';
    const tier = q.tier ? q.tier.toLowerCase() : 'unranked';
    const tierDisplay = q.tier ? `${q.tier} ${q.division}` : 'Unranked';
    const lp = q.tier ? `${q.leaguePoints} LP` : '';
    const winrate = (q.wins + q.losses > 0) ? Math.round((q.wins / (q.wins + q.losses)) * 100) : 0;
    
    rankedHtml += `
      <div class="ranked-card">
        <img src="https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/${tier}.png" alt="${tier}" class="ranked-icon" onerror="this.src='https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-shared-components/global/default/images/unranked.png'">
        <div class="ranked-info">
          <div class="ranked-queue">${name}</div>
          <div class="ranked-tier">${tierDisplay}</div>
          <div class="ranked-lp">${lp}</div>
          <div class="ranked-winrate">${q.wins}W ${q.losses}L ${winrate > 0 ? `(${winrate}%)` : ''}</div>
        </div>
      </div>
    `;
  });
  rankedGrid.innerHTML = rankedHtml;

  // Render Matches
  const matches = profileData.matches || [];
  if (matches.length === 0) {
    matchList.innerHTML = '<div style="color:var(--grey-200); text-align:center; padding:20px;">無近期對戰紀錄</div>';
    return;
  }

  matchList.innerHTML = matches.map(match => {
    // Current summoner is pre-filtered as participantId: 3 or 1 etc. We just take participants[0].
    const p = match.participants[0];
    if (!p) return '';
    
    const stats = p.stats;
    const isWin = stats.win;
    const kdaRatio = stats.deaths === 0 ? 'Perfect' : ((stats.kills + stats.assists) / stats.deaths).toFixed(2);
    const date = new Date(match.gameCreationDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    // Map queueId to localized name
    const queueMap = {
      400: '一般對戰',
      420: '單雙排積分',
      430: '一般對戰 (盲選)',
      440: '彈性積分',
      450: '隨機單中 (ARAM)',
      830: '電腦對戰 (新手)',
      840: '電腦對戰 (一般)',
      850: '電腦對戰 (進階)',
      900: '阿福快打 (URF)',
      1700: '競技場 (Arena)',
      1900: '阿福快打 (URF)',
      2400: '隨機單中 : 大混戰'
    };
    let modeDisplay = queueMap[match.queueId] || match.gameMode;
    if (match.gameMode === 'CLASSIC' && !queueMap[match.queueId]) modeDisplay = '經典對戰';

    // Default Champion Icon from CommunityDragon
    const champImg = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`;

    return `
      <div class="match-item ${isWin ? 'win' : 'loss'}" onclick="showMatchDetails(${match.gameId})">
        <img src="${champImg}" alt="Champ" class="match-champ-icon" onerror="this.style.display='none'">
        <div class="match-info">
          <div class="match-mode">${modeDisplay}</div>
          <div class="match-result">${isWin ? '勝利' : '戰敗'}</div>
          <div class="match-date">${date}</div>
        </div>
        <div class="match-stats">
          <div class="match-kda">${stats.kills} / ${stats.deaths} / ${stats.assists}</div>
          <div class="match-kda-ratio">${kdaRatio} KDA</div>
        </div>
      </div>
    `;
  }).join('');
}

function closeMatchModalDirect() {
  document.getElementById('match-modal').classList.add('hidden');
}

function closeMatchModal(e) {
  if (e.target.id === 'match-modal') {
    closeMatchModalDirect();
  }
}

async function showMatchDetails(gameId) {
  const modal = document.getElementById('match-modal');
  const scoreboard = document.getElementById('match-modal-scoreboard');
  
  modal.classList.remove('hidden');
  scoreboard.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--grey-200);">讀取詳細資料中...</div>';

  try {
    const resp = await fetch(`/api/lcu/match/${gameId}`);
    const result = await resp.json();
    if (!result.success) throw new Error(result.message);

    const data = result.data;
    
    // Group participants by teamId and Calculate MVP/Feeder
    const teams = {};
    let winningTeamId = null;
    let scores = [];
    
    data.participants.forEach(p => {
      if (!teams[p.teamId]) teams[p.teamId] = [];
      
      // Find identity for name
      const identity = data.participantIdentities.find(id => id.participantId === p.participantId);
      p.identity = identity ? identity.player : { summonerName: 'Unknown' };
      
      teams[p.teamId].push(p);
      
      // MVP Score Calculation
      const stats = p.stats;
      const kdaRatio = (stats.kills + stats.assists) / Math.max(stats.deaths, 1);
      const score = (kdaRatio * 100) + (stats.totalDamageDealtToChampions / 1000) + (stats.visionScore || 0);
      scores.push({ id: p.participantId, teamId: p.teamId, score, win: stats.win, kdaRatio });
      if (stats.win) winningTeamId = p.teamId;
    });

    const winningPlayers = scores.filter(s => s.teamId === winningTeamId).sort((a, b) => b.score - a.score);
    const losingPlayers = scores.filter(s => s.teamId !== winningTeamId).sort((a, b) => a.score - b.score);
    const mvpId = winningPlayers.length > 0 ? winningPlayers[0].id : null;
    const feederId = losingPlayers.length > 0 && losingPlayers[0].kdaRatio <= 1.2 ? losingPlayers[0].id : null;
    const svpId = losingPlayers.length > 0 ? losingPlayers[losingPlayers.length - 1].id : null;

    // Find max damage for the damage bar
    let maxDamage = 1;
    data.participants.forEach(p => {
      if (p.stats.totalDamageDealtToChampions > maxDamage) {
        maxDamage = p.stats.totalDamageDealtToChampions;
      }
    });

    let html = '';
    for (const teamId in teams) {
      const players = teams[teamId];
      // Team header name
      let teamName = teamId === '100' ? '藍方隊伍' : (teamId === '200' ? '紅方隊伍' : `小隊 ${teamId}`);
      
      html += `<div class="scoreboard-team team-${teamId}">
        <div class="team-header">${teamName}</div>
      `;

      players.forEach(p => {
        const stats = p.stats;
        
        // Default Champion Icon from CommunityDragon
        const champImg = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${p.championId}.png`;
        
        // Find summoner name (Riot ID format is typically gameName)
        let summonerName = p.identity.gameName || p.identity.summonerName || 'Unknown';
        
        const kda = `${stats.kills} / ${stats.deaths} / ${stats.assists}`;
        const dmg = stats.totalDamageDealtToChampions;
        const dmgPct = (dmg / maxDamage) * 100;
        
        // Items
        const items = [stats.item0, stats.item1, stats.item2, stats.item3, stats.item4, stats.item5, stats.item6];
        let itemsHtml = '<div class="player-items">';
        items.forEach(itemId => {
          if (itemId > 0) {
            // Use DataDragon for items
            itemsHtml += `<img src="https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${itemId}.png" class="item-icon" onerror="this.src=''; this.classList.add('empty');" />`;
          } else {
            itemsHtml += `<div class="item-icon empty"></div>`;
          }
        });
        itemsHtml += '</div>';
        
        // Runes (Perks)
        let perkHtml = '<div class="perks-container">';
        const mainPerk = stats.perk0 || (stats.perks && stats.perks.length > 0 ? stats.perks[0].perkId : null);
        const subStyle = stats.perkSubStyle || (stats.perks && stats.perks.length > 4 ? stats.perks[4].perkId : null);
        const mainIcon = mainPerk && runesMap.has(mainPerk) ? `https://ddragon.leagueoflegends.com/cdn/img/${runesMap.get(mainPerk)}` : '';
        const subIcon = subStyle && runesMap.has(subStyle) ? `https://ddragon.leagueoflegends.com/cdn/img/${runesMap.get(subStyle)}` : '';
        
        if (mainIcon) perkHtml += `<img src="${mainIcon}" class="perk-icon" title="主系" />`;
        if (subIcon) perkHtml += `<img src="${subIcon}" class="perk-icon perk-sub" title="副系" />`;
        perkHtml += '</div>';
        
        // Badges
        let badgesHtml = '';
        if (p.participantId === mvpId) badgesHtml += '<span class="performance-badge badge-mvp">MVP</span>';
        if (p.participantId === svpId && svpId !== feederId) badgesHtml += '<span class="performance-badge badge-mvp" style="border-color: #8da1b9; color: #8da1b9;">SVP</span>';
        if (p.participantId === feederId) badgesHtml += '<span class="performance-badge badge-feeder">戰犯</span>';

        html += `
          <div class="scoreboard-player">
            <img src="${champImg}" class="player-champ" onerror="this.style.display='none'">
            ${perkHtml}
            <div class="player-identity">
              <div class="player-name">${summonerName} ${badgesHtml}</div>
              <div class="player-kda">${kda}</div>
            </div>
            <div class="player-damage">
              <div>${dmg.toLocaleString()}</div>
              <div class="damage-bar"><div class="damage-fill" style="width: ${dmgPct}%"></div></div>
            </div>
            ${itemsHtml}
          </div>
        `;
      });
      html += `</div>`; // end team
    }

    scoreboard.innerHTML = html;

  } catch (err) {
    scoreboard.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--red);">❌ 載入失敗：${err.message}</div>`;
  }
}

function renderStats() {
  const s = appData.stats;
  const grid = document.getElementById('stats-grid');

  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label"><span class="stat-emoji">📊</span> 收集進度</div>
      <div class="stat-value gold">${s.collectionPercent}%</div>
      <div class="stat-sub">${s.ownedSkins} / ${s.totalSkins} 個造型</div>
      <div class="stat-progress">
        <div class="stat-progress-fill" style="width: 0%"></div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-label"><span class="stat-emoji">✅</span> 已擁有</div>
      <div class="stat-value green">${s.ownedSkins}</div>
      <div class="stat-sub">個造型</div>
    </div>
    <div class="stat-card">
      <div class="stat-label"><span class="stat-emoji">❌</span> 缺少</div>
      <div class="stat-value red">${s.missingSkins}</div>
      <div class="stat-sub">個造型</div>
    </div>
    <div class="stat-card">
      <div class="stat-label"><span class="stat-emoji">🏆</span> 角色總數</div>
      <div class="stat-value blue">${s.totalChampions}</div>
      <div class="stat-sub">位英雄</div>
    </div>
    <div class="stat-card">
      <div class="stat-label"><span class="stat-emoji">⚠️</span> 完全沒有造型</div>
      <div class="stat-value orange">${s.championsWithNoSkins}</div>
      <div class="stat-sub">位英雄</div>
    </div>
  `;

  requestAnimationFrame(() => {
    setTimeout(() => {
      const fill = grid.querySelector('.stat-progress-fill');
      if (fill) fill.style.width = `${s.collectionPercent}%`;
    }, 100);
  });
}

function renderChampions() {
  const grid = document.getElementById('champions-grid');
  const search = document.getElementById('search-input').value.toLowerCase();

  let champions = appData.champions.filter(c => c.totalCount > 0);

  switch (currentFilter) {
    case 'no-skins':
      champions = champions.filter(c => c.ownedCount === 0);
      break;
    case 'partial':
      champions = champions.filter(c => c.ownedCount > 0 && c.ownedCount < c.totalCount);
      break;
    case 'complete':
      champions = champions.filter(c => c.ownedCount === c.totalCount);
      break;
    case 'sale':
      champions = champions.filter(c => c.skins.some(s => s.sale && !s.owned));
      break;
  }

  if (search) {
    champions = champions.filter(c =>
      c.championName && c.championName.toLowerCase().includes(search)
    );
  }

  if (champions.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--grey-200);">
        <p style="font-size: 1.2rem; margin-bottom: 8px;">沒有符合條件的角色</p>
        <p style="font-size: 0.9rem;">試試其他篩選條件或搜尋關鍵字</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = champions.map((champ, i) => {
    const percent = champ.totalCount > 0 ? (champ.ownedCount / champ.totalCount * 100) : 0;
    const missing = champ.totalCount - champ.ownedCount;

    let cardClass = '';
    let countClass = '';
    let progressClass = 'gold';

    if (champ.ownedCount === 0) {
      cardClass = 'no-skins';
      countClass = 'none';
      progressClass = 'red';
    } else if (champ.ownedCount === champ.totalCount) {
      cardClass = 'complete';
      countClass = 'all';
      progressClass = 'green';
    }

    return `
      <div class="champ-card ${cardClass}" onclick="openModal(${champ.championId})" style="animation-delay: ${Math.min(i * 0.03, 0.5)}s">
        <div class="champ-header">
          <span class="champ-name">${champ.championName || `Champion #${champ.championId}`}</span>
          <span class="champ-count ${countClass}">${champ.ownedCount} / ${champ.totalCount}</span>
        </div>
        <div class="champ-progress">
          <div class="champ-progress-fill ${progressClass}" style="width: ${percent}%"></div>
        </div>
        <div class="champ-missing-text">
          ${missing > 0 ? `缺少 <span>${missing}</span> 個造型` : '✅ 收集完成！'}
        </div>
      </div>
    `;
  }).join('');
}

// ========================================
// Filters & Search
// ========================================

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderChampions();
}

function filterChampions() {
  renderChampions();
}

// ========================================
// Modal
// ========================================

function openModal(championId) {
  const champ = appData.champions.find(c => c.championId === championId);
  if (!champ) return;

  const modal = document.getElementById('skin-modal');
  const percent = champ.totalCount > 0 ? (champ.ownedCount / champ.totalCount * 100) : 0;

  document.getElementById('modal-champ-name').textContent = champ.championName;
  document.getElementById('modal-owned').textContent = `${champ.ownedCount} / ${champ.totalCount} 個造型`;

  const progressFill = modal.querySelector('.modal-progress-fill');
  progressFill.style.width = '0%';
  requestAnimationFrame(() => {
    setTimeout(() => { progressFill.style.width = `${percent}%`; }, 50);
  });

  // Sort skins strictly by release time (oldest to newest)
  // We sort by skinIndex since newer skins have higher indices
  const sortedSkins = [...champ.skins].sort((a, b) => a.skinIndex - b.skinIndex);

  const skinsList = document.getElementById('modal-skins-list');
  skinsList.innerHTML = sortedSkins.map(skin => {
    const imgUrl = skin.tilePath
      ? `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/${skin.tilePath.replace('/lol-game-data/assets/', '').toLowerCase()}`
      : '';

    const isInCart = shoppingCart.some(item => item.champId === champ.championId && item.skinIndex === skin.skinIndex);

    let saleBadgeHtml = '';
    let priceDisplay = skin.stillObtainable && skin.price ? `🛒 ${skin.price} RP` : (skin.stillObtainable ? '🛒 可取得' : '🔒 已絕版');
    let cartPrice = skin.price;

    // Distinguish Mythic / Prestige / Gacha from normal Legacy/Unavailable
    // We prioritize rarity tags (Mythic/Ultimate)
    if (skin.rarity === 'kMythic') {
      priceDisplay = '<span style="color: #cd9aeb; font-weight: bold;">🔮 神話 / 轉蛋限定</span>';
    } else if (skin.rarity === 'kUltimate') {
      priceDisplay = '<span style="color: #f39c12; font-weight: bold;">✨ 終極造型</span>';
    } else if (!skin.stillObtainable) {
      if (skin.isLegacy) {
        priceDisplay = '⏳ 典藏絕版';
      } else {
        priceDisplay = '<span style="color: #ff6b6b; font-weight: bold;">🔒 特殊限定 / 轉蛋</span>';
      }
    }

    if (skin.sale && !skin.owned) {
      saleBadgeHtml = '<span class="sale-badge">🔥 特價</span>';
      let salePrice = skin.sale.prices && skin.sale.prices.length > 0 ? skin.sale.prices[0].cost : null;
      let origPrice = skin.originalPrice || skin.price;
      
      if (salePrice && origPrice && salePrice !== origPrice) {
        priceDisplay = `🛒 <s>${origPrice}</s> <span class="price-sale" style="color:var(--gold-100); font-weight:bold;">${salePrice} RP</span>`;
        cartPrice = salePrice;
      } else if (salePrice) {
        priceDisplay = `🛒 <span class="price-sale" style="color:var(--gold-100); font-weight:bold;">${salePrice} RP</span>`;
        cartPrice = salePrice;
      } else if (origPrice) {
        priceDisplay = `🛒 <span class="price-sale" style="color:var(--gold-100); font-weight:bold;">${origPrice} RP</span>`;
        cartPrice = origPrice;
      }
    }

    return `
      <div class="skin-item ${skin.owned ? 'owned' : ''}">
        <div class="skin-img-wrapper" onclick="playVideo(${champ.championId}, ${skin.skinIndex})">
          <img src="${imgUrl}" alt="${skin.name}" loading="lazy"
               onerror="this.style.display='none'" />
          <span class="skin-badge ${skin.owned ? 'owned' : 'missing'}">
            ${skin.owned ? '已擁有' : '缺少'}
          </span>
          <div class="skin-play-overlay">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="skin-info">
          <div class="skin-name" title="${skin.name}">${skin.name} ${saleBadgeHtml}</div>
          <div class="skin-rarity">
            ${priceDisplay}
          </div>
          ${(!skin.owned && cartPrice) ? `
            <button class="btn-cart-add ${isInCart ? 'added' : ''}" onclick="toggleCartItem(this, ${champ.championId}, ${skin.skinIndex}, '${skin.name.replace(/'/g, "\\'")}', ${cartPrice}, '${imgUrl}', '${champ.championName.replace(/'/g, "\\'")}')">
              ${isInCart ? '移除' : '+ 購物車'}
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function toggleCartItem(btn, champId, skinIndex, name, price, imgUrl, championName) {
  const existingIndex = shoppingCart.findIndex(item => item.champId === champId && item.skinIndex === skinIndex);
  if (existingIndex > -1) {
    shoppingCart.splice(existingIndex, 1);
    if (btn) {
      btn.classList.remove('added');
      btn.textContent = '+ 購物車';
    }
  } else {
    shoppingCart.push({ champId, skinIndex, name, price, imgUrl, championName });
    if (btn) {
      btn.classList.add('added');
      btn.textContent = '移除';
    }
  }
  updateCartBadge();
  if (!document.getElementById('cart-modal').classList.contains('hidden')) {
    renderCartModal();
  }
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  badge.textContent = shoppingCart.length;
  if (shoppingCart.length > 0) {
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function openCart() {
  renderCartModal();
  document.getElementById('cart-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCart(event) {
  if (event.target === event.currentTarget) closeCartDirect();
}

function closeCartDirect() {
  document.getElementById('cart-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function renderCartModal() {
  const list = document.getElementById('cart-skins-list');
  const totalEl = document.getElementById('cart-total-rp');
  
  if (shoppingCart.length === 0) {
    list.innerHTML = '<div class="cart-empty">購物車是空的</div>';
    totalEl.textContent = '0';
    return;
  }

  let total = 0;
  list.innerHTML = shoppingCart.map(item => {
    total += item.price;
    return `
      <div class="cart-item">
        <img src="${item.imgUrl}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">
        <div class="cart-item-info">
          <div class="cart-item-champ">${item.championName}</div>
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${item.price} RP</div>
        </div>
        <button class="cart-item-remove" onclick="toggleCartItem(null, ${item.champId}, ${item.skinIndex}, '', 0, '', '')">×</button>
      </div>
    `;
  }).join('');
  
  totalEl.textContent = total;
}

function playVideo(championId, skinIndex) {
  if (championId === undefined || skinIndex === undefined) {
    alert('無法取得影片連結');
    return;
  }
  
  // 開啟瀏覽器分頁 (Weblog 會有 CAPTCHA 防護，無法在程式內用 iframe 直連)
  const url = `https://lol-skin.weblog.vc/zh-TW/${championId}/${skinIndex}/`;
  
  // 使用 fetch 通知後端開啟，或者直接前端 window.open
  // 如果在 local server 模式下，可以直接 window.open
  window.open(url, '_blank');
}

function closeModal(event) {
  if (event.target === event.currentTarget) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('skin-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModalDirect();
});

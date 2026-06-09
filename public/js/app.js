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
window.spellsMap = new Map();

// Auto-Refresh State
let autoRefreshEnabled = false;
let autoRefreshInterval = null;
let autoRefreshCountdown = null;
let autoRefreshSeconds = 5; // Refresh every 5 seconds
let countdownRemaining = 0;

// ========================================
// Auto-Refresh Logic
// ========================================

function toggleAutoRefresh(enabled) {
  autoRefreshEnabled = enabled;
  if (enabled) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function startAutoRefresh() {
  stopAutoRefresh(); // Clear any existing timers
  countdownRemaining = autoRefreshSeconds;
  updateCountdownDisplay();
  
  const countdownEl = document.getElementById('auto-refresh-countdown');
  if (countdownEl) countdownEl.classList.add('active');
  
  autoRefreshCountdown = setInterval(() => {
    countdownRemaining--;
    updateCountdownDisplay();
    
    if (countdownRemaining <= 0) {
      refreshMatchHistory();
      countdownRemaining = autoRefreshSeconds;
    }
  }, 1000);
}

function stopAutoRefresh() {
  if (autoRefreshCountdown) {
    clearInterval(autoRefreshCountdown);
    autoRefreshCountdown = null;
  }
  const countdownEl = document.getElementById('auto-refresh-countdown');
  if (countdownEl) {
    countdownEl.classList.remove('active');
    countdownEl.textContent = '';
  }
}

function updateCountdownDisplay() {
  const countdownEl = document.getElementById('auto-refresh-countdown');
  if (countdownEl) {
    countdownEl.textContent = `${countdownRemaining}s`;
  }
}

async function refreshMatchHistory() {
  try {
    const profileResp = await fetch('/api/lcu/profile');
    const profileResult = await profileResp.json();
    if (profileResult.success) {
      profileData = profileResult.data;
      renderProfile();
    }
  } catch (e) {
    console.error('Auto-refresh failed:', e);
  }
}

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

    updateLoadingText('正在讀取遊戲資料...');
    const [skinsResult, profileResult] = await Promise.all([
      fetch('/api/lcu/skins').then(r => r.json()),
      fetch('/api/lcu/profile').then(r => r.json()).catch(() => ({ success: false }))
    ]);

    if (!skinsResult.success) throw new Error(skinsResult.message);

    if (profileResult && profileResult.success) {
      profileData = profileResult.data;
    }

    // Start background fetching of static assets so we don't block the UI
    fetchStaticAssetsAsync();

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

async function fetchStaticAssetsAsync() {
  try {
    const vResp = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
    const versions = await vResp.json();
    if (versions && versions.length > 0) ddragonVersion = versions[0];
    
    // We can fetch these in parallel now
    await Promise.all([
      // Fetch Runes
      fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/zh_TW/runesReforged.json`)
        .then(r => r.json())
        .then(runesData => {
          runesData.forEach(tree => {
            runesMap.set(tree.id, tree.icon);
            tree.slots.forEach(slot => {
              slot.runes.forEach(rune => {
                runesMap.set(rune.id, rune.icon);
              });
            });
          });
        }).catch(e => console.error('Runes fetch failed', e)),
        
      // Fetch Summoner Spells
      fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-spells.json')
        .then(r => r.json())
        .then(spellsData => {
          spellsData.forEach(spell => {
            let iconUrl = spell.iconPath.toLowerCase().replace('/lol-game-data/assets/', 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/');
            window.spellsMap.set(spell.id, iconUrl);
          });
        }).catch(e => console.error('Spells fetch failed', e)),

      // Fetch Arena Augments
      fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_tw/v1/cherry-augments.json')
        .then(r => r.json())
        .then(augmentsData => {
          window.augmentsMap = new Map();
          augmentsData.forEach(aug => {
            if (aug.augmentSmallIconPath) {
              let iconUrl = aug.augmentSmallIconPath.toLowerCase().replace('/lol-game-data/assets/', 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/');
              window.augmentsMap.set(aug.id, { icon: iconUrl, name: aug.nameTRA || '增幅裝置' });
            }
          });
        }).catch(e => console.error('Augments fetch failed', e))
    ]);
  } catch (e) {
    console.error('Failed to fetch ddragon data:', e);
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

let matchChart = null;

function drawTimelineChart(timelineData) {
  const container = document.getElementById('match-modal-chart-container');
  if (!timelineData || !timelineData.frames) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  const ctx = document.getElementById('match-timeline-chart').getContext('2d');
  
  if (matchChart) {
    matchChart.destroy();
  }

  const labels = [];
  const dataPoints = [];

  timelineData.frames.forEach((frame, index) => {
    labels.push(index + '分');
    let blueGold = 0;
    let redGold = 0;
    
    // Sum gold for participants 1-5 (Blue) and 6-10 (Red)
    for (const [id, participantFrame] of Object.entries(frame.participantFrames)) {
      if (parseInt(id) <= 5) blueGold += participantFrame.totalGold;
      else redGold += participantFrame.totalGold;
    }
    
    dataPoints.push(blueGold - redGold);
  });

  matchChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '經濟差距 (藍方 - 紅方)',
        data: dataPoints,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const {ctx, chartArea} = chart;
          if (!chartArea) return null;
          
          const yScale = chart.scales.y;
          const yZero = yScale.getPixelForValue(0);
          
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          
          // Blue above zero, Red below zero
          const zeroRatio = Math.max(0, Math.min(1, (yZero - chartArea.top) / (chartArea.bottom - chartArea.top)));
          
          gradient.addColorStop(0, 'rgba(54, 162, 235, 0.5)'); // Blue top
          if (zeroRatio > 0 && zeroRatio < 1) {
            gradient.addColorStop(zeroRatio, 'rgba(54, 162, 235, 0.1)');
            gradient.addColorStop(zeroRatio, 'rgba(255, 99, 132, 0.1)');
          }
          gradient.addColorStop(1, 'rgba(255, 99, 132, 0.5)'); // Red bottom
          
          return gradient;
        },
        borderColor: (context) => {
          return context.raw >= 0 ? 'rgb(54, 162, 235)' : 'rgb(255, 99, 132)';
        },
        segment: {
          borderColor: ctx => ctx.p1.parsed.y >= 0 ? 'rgb(54, 162, 235)' : 'rgb(255, 99, 132)'
        },
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              if (val > 0) return '藍方領先 ' + val + ' 金錢';
              else if (val < 0) return '紅方領先 ' + Math.abs(val) + ' 金錢';
              return '經濟平手';
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#a0a0a0' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#a0a0a0', maxTicksLimit: 10 }
        }
      }
    }
  });
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
    
    // Fetch Timeline Data for Chart
    let timelineData = null;
    try {
      const tlResp = await fetch(`/api/lcu/match-timeline/${gameId}`);
      const tlResult = await tlResp.json();
      if (tlResult.success) timelineData = tlResult.data;
    } catch (e) {
      console.error('Failed to fetch timeline', e);
    }
    
    // Draw Chart
    drawTimelineChart(timelineData);

    // 1. Calculate Team Totals
    const teamTotals = {
      100: { kills: 0, damage: 0, gold: 0, tanking: 0 },
      200: { kills: 0, damage: 0, gold: 0, tanking: 0 }
    };

    data.participants.forEach(p => {
      const stats = p.stats;
      if (teamTotals[p.teamId]) {
        teamTotals[p.teamId].kills += stats.kills;
        teamTotals[p.teamId].damage += stats.totalDamageDealtToChampions;
        teamTotals[p.teamId].gold += stats.goldEarned;
        teamTotals[p.teamId].tanking += (stats.totalDamageTaken || 0) + (stats.damageSelfMitigated || 0);
      }
    });

    // 2. Group participants by teamId and Calculate Advanced OP Score
    const teams = {};
    let winningTeamId = null;
    let scores = [];
    
    data.participants.forEach(p => {
      if (!teams[p.teamId]) teams[p.teamId] = [];
      
      // Find identity for name
      const identity = data.participantIdentities.find(id => id.participantId === p.participantId);
      p.identity = identity ? identity.player : { summonerName: 'Unknown' };
      
      teams[p.teamId].push(p);
      
      // Advanced Score Calculation
      const stats = p.stats;
      const team = teamTotals[p.teamId] || { kills: 1, damage: 1, gold: 1, tanking: 1 };
      
      const kdaRatio = (stats.kills + stats.assists) / Math.max(stats.deaths, 1);
      const kp = team.kills > 0 ? (stats.kills + stats.assists) / team.kills : 0;
      const dmgShare = team.damage > 0 ? stats.totalDamageDealtToChampions / team.damage : 0;
      const dmgPerGold = stats.goldEarned > 0 ? stats.totalDamageDealtToChampions / stats.goldEarned : 0;
      
      // Capped KDA to prevent "KDA players" from getting infinite points
      const cappedKdaRatio = Math.min(kdaRatio, 6);
      
      let score = 0;
      score += kp * 45; // Kill Participation (Up to 45)
      score += cappedKdaRatio * 4; // KDA (Max 24)
      score += dmgShare * 30; // Damage share (Up to ~15)
      score += Math.min(Math.max(0, dmgPerGold - 1), 3) * 10; // Bonus for efficient dmg/gold, max 30 points
      
      // Support & Tank stats
      score += (stats.visionScore || 0) * 0.3; // Vision
      score += ((stats.totalHealsOnTeammates || 0) / 1000) * 2.0; // Healing allies is highly rewarded
      score += ((stats.timeCCingOthers || 0) / 10) * 1.5; // CCing enemies
      
      // Tanking stats: damage taken + mitigated
      const tanking = (stats.totalDamageTaken || 0) + (stats.damageSelfMitigated || 0);
      const teamTanking = teamTotals[p.teamId] ? teamTotals[p.teamId].tanking : (tanking || 1);
      const tankingShare = teamTanking > 0 ? tanking / teamTanking : 0;
      score += tankingShare * 20; // Absorbing damage for team, up to 20 points
      
      score += ((stats.damageDealtToObjectives || 0) / 1000) * 1.0; // Objectives
      score -= stats.deaths * 2; // Penalize feeding
      
      // Multi-kill bonuses (huge impact)
      if (stats.pentaKills > 0) score += 20;
      else if (stats.quadraKills > 0) score += 10;
      else if (stats.tripleKills > 0) score += 5;
      
      p.kp = kp;
      p.dmgPerGold = dmgPerGold;

      scores.push({ id: p.participantId, teamId: p.teamId, score, win: stats.win, kdaRatio });
      if (stats.win) winningTeamId = p.teamId;
    });

    const winningPlayers = scores.filter(s => s.teamId === winningTeamId).sort((a, b) => b.score - a.score);
    const losingPlayers = scores.filter(s => s.teamId !== winningTeamId).sort((a, b) => a.score - b.score);
    const mvpId = winningPlayers.length > 0 ? winningPlayers[0].id : null;
    const feederId = losingPlayers.length > 0 && losingPlayers[losingPlayers.length - 1].kdaRatio <= 1.5 ? losingPlayers[losingPlayers.length - 1].id : null;
    const svpId = losingPlayers.length > 0 ? losingPlayers[0].id : null;

    // Find max damage for the damage bar
    let maxDamage = 1;
    data.participants.forEach(p => {
      if (p.stats.totalDamageDealtToChampions > maxDamage) {
        maxDamage = p.stats.totalDamageDealtToChampions;
      }
    });

    let html = '';
    let advStatsBlueHtml = '';
    let advStatsRedHtml = '';
    
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
        
        // Spells
        const spell1Url = window.spellsMap.get(p.spell1Id) || '';
        const spell2Url = window.spellsMap.get(p.spell2Id) || '';
        let spellHtml = '<div class="player-spells">';
        if (spell1Url) spellHtml += `<img src="${spell1Url}" class="spell-icon" />`;
        if (spell2Url) spellHtml += `<img src="${spell2Url}" class="spell-icon" />`;
        spellHtml += '</div>';

        // Level
        const champLevel = stats.champLevel || 1;

        // Extra Stats
        const cs = (stats.totalMinionsKilled || 0) + (stats.neutralMinionsKilled || 0);
        const gold = stats.goldEarned ? (stats.goldEarned / 1000).toFixed(1) + 'k' : '0';
        const vision = stats.visionScore || 0;
        const kpPercent = p.kp ? (p.kp * 100).toFixed(0) + '%' : '0%';
        const dmgPerGoldPercent = p.dmgPerGold ? (p.dmgPerGold * 100).toFixed(0) + '%' : '0%';
        
        let extraStatsHtml = `
          <div class="player-stats-extra">
            <div title="參團率 (Kill Participation)"><span class="stat-icon">🤝</span> ${kpPercent}</div>
            <div title="傷金比 (Damage per Gold)"><span class="stat-icon">📈</span> ${dmgPerGoldPercent}</div>
            <div title="吃兵數 (CS)"><span class="stat-icon">⚔️</span> ${cs}</div>
            <div title="視野分數"><span class="stat-icon">👁️</span> ${vision}</div>
          </div>
        `;

        // Badges
        let badgesHtml = '';
        if (p.participantId === mvpId) badgesHtml += '<span class="performance-badge badge-mvp">MVP</span>';
        if (p.participantId === svpId && svpId !== feederId) badgesHtml += '<span class="performance-badge badge-mvp" style="border-color: #8da1b9; color: #8da1b9;">SVP</span>';
        if (p.participantId === feederId) badgesHtml += '<span class="performance-badge badge-feeder">戰犯</span>';
        
        // Multi-kills
        if (stats.pentaKills > 0) badgesHtml += '<span class="performance-badge badge-penta">Penta Kill</span>';
        else if (stats.quadraKills > 0) badgesHtml += '<span class="performance-badge badge-quadra">Quadra Kill</span>';
        else if (stats.tripleKills > 0) badgesHtml += '<span class="performance-badge badge-multi">Triple Kill</span>';
        else if (stats.doubleKills > 0) badgesHtml += '<span class="performance-badge badge-multi">Double Kill</span>';

        // Arena Augments
        let augmentsHtml = '<div class="augments-container">';
        const augs = [stats.playerAugment1, stats.playerAugment2, stats.playerAugment3, stats.playerAugment4];
        augs.forEach(augId => {
          if (augId && augId > 0 && window.augmentsMap && window.augmentsMap.has(augId)) {
            const augData = window.augmentsMap.get(augId);
            augmentsHtml += `<img src="${augData.icon}" class="augment-icon" title="${augData.name}" />`;
          }
        });
        augmentsHtml += '</div>';

        html += `
          <div class="scoreboard-player">
            <div class="player-champ-wrapper">
              <img src="${champImg}" class="player-champ" onerror="this.style.display='none'">
              <span class="player-level">${champLevel}</span>
            </div>
            ${spellHtml}
            ${perkHtml}
            ${augmentsHtml}
            <div class="player-identity">
              <div class="player-name">${summonerName} ${badgesHtml}</div>
              <div class="player-kda">${kda}</div>
            </div>
            <div class="player-damage">
              <div>${dmg.toLocaleString()}</div>
              <div class="damage-bar"><div class="damage-fill" style="width: ${dmgPct}%"></div></div>
            </div>
            ${extraStatsHtml}
            ${itemsHtml}
          </div>
        `;
        
        // Advanced Stats Row
        const advRow = `
          <tr>
            <td style="display: flex; align-items: center; gap: 8px;">
              <img src="${champImg}" style="width:24px; height:24px; border-radius:50%;">
              <span>${summonerName}</span>
            </td>
            <td>${(stats.totalDamageTaken || 0).toLocaleString()}</td>
            <td>${(stats.damageSelfMitigated || 0).toLocaleString()}</td>
            <td>${(stats.totalHealsOnTeammates || 0).toLocaleString()}</td>
            <td>${(stats.totalHeal || 0).toLocaleString()}</td>
            <td>${stats.timeCCingOthers || 0}s</td>
            <td>${(stats.damageDealtToObjectives || 0).toLocaleString()}</td>
          </tr>
        `;
        if (teamId === '100') advStatsBlueHtml += advRow;
        else advStatsRedHtml += advRow;
      });
      html += `</div>`; // end team
    }

    scoreboard.innerHTML = html;
    document.querySelector('#adv-stats-blue tbody').innerHTML = advStatsBlueHtml;
    document.querySelector('#adv-stats-red tbody').innerHTML = advStatsRedHtml;
    
    // Reset toggle
    document.getElementById('adv-stats-container').classList.add('hidden');

  } catch (err) {
    scoreboard.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--red);">❌ 載入失敗：${err.message}</div>`;
  }
}

function toggleAdvancedStats() {
  const container = document.getElementById('adv-stats-container');
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
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
      (c.championName && c.championName.toLowerCase().includes(search)) ||
      (c.skins && c.skins.some(s => s.name && s.name.toLowerCase().includes(search)))
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

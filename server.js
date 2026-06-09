import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'league-connect';
import open from 'open';

const { authenticate, request } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// LCU Credentials caching
let lcuCredentials = null;

// ==========================================
// 1. LCU 連線 (取得 Credentials)
// ==========================================
app.get('/api/lcu/connect', async (req, res) => {
  try {
    lcuCredentials = await authenticate({ awaitConnection: false });
    res.json({ success: true, message: '已成功連接 League Client' });
  } catch (error) {
    lcuCredentials = null;
    res.json({ success: false, message: '無法連接 League Client，請確認遊戲已開啟並登入大廳。' });
  }
});

// ==========================================
// 2. 獲取 Summoner + Skins (Proxy)
// ==========================================
app.get('/api/lcu/skins', async (req, res) => {
  if (!lcuCredentials) {
    return res.status(401).json({ success: false, message: '尚未連接 LCU，請先確認遊戲已啟動' });
  }

  try {
    // 1. Parallelize initial independent requests
    const [summonerResp, champsResp, catalogResp, cdResp] = await Promise.all([
      request({ method: 'GET', url: '/lol-summoner/v1/current-summoner' }, lcuCredentials),
      request({ method: 'GET', url: '/lol-champions/v1/owned-champions-minimal' }, lcuCredentials),
      request({ method: 'GET', url: '/lol-store/v1/catalog' }, lcuCredentials),
      fetch('https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/skins.json').catch(() => ({ ok: false }))
    ]);

    if (!summonerResp.ok) throw new Error(`獲取召喚師失敗: ${summonerResp.status}`);
    const summoner = await summonerResp.json();

    // 2. Fetch skins (depends on summonerId), while parsing others concurrently
    const skinsPromise = request({
      method: 'GET',
      url: `/lol-champions/v1/inventories/${summoner.summonerId}/skins-minimal`
    }, lcuCredentials).then(res => {
      if (!res.ok) throw new Error(`獲取造型失敗: ${res.status}`);
      return res.json();
    });

    const [champs, catalog, cdSkinsData, skins] = await Promise.all([
      champsResp.ok ? champsResp.json() : Promise.resolve([]),
      catalogResp.ok ? catalogResp.json() : Promise.resolve([]),
      cdResp.ok ? cdResp.json() : Promise.resolve({}),
      skinsPromise
    ]);

    let champsMap = {};
    for (const c of champs) champsMap[c.id] = c.alias;

    let catalogMap = {};
    for (const item of catalog) {
      if (item.inventoryType === 'CHAMPION_SKIN') {
        catalogMap[item.itemId] = {
          active: item.active,
          price: item.prices && item.prices.length > 0 ? item.prices[0].cost : null,
          currency: item.prices && item.prices.length > 0 ? item.prices[0].currency : null,
          sale: item.sale || null,
          originalPrice: item.originalPrice || null
        };
      }
    }

    let cdSkins = cdSkinsData;

    // Process data: group by champion
    const champions = {};
    
    for (const skin of skins) {
      const champId = skin.championId;
      if (!champions[champId]) {
        champions[champId] = {
          championId: champId,
          championName: null,
          championAlias: champsMap[champId] || null, // For Weblog video URL
          skins: [],
          ownedCount: 0,
          totalCount: 0,
        };
      }

      if (skin.isBase) {
        champions[champId].championName = skin.name;
        continue;
      }

      const owned = skin.ownership?.owned || false;
      const catalogItem = catalogMap[skin.id];
      const stillObtainable = catalogItem ? catalogItem.active : false;
      const price = catalogItem ? catalogItem.price : null;

      champions[champId].skins.push({
        id: skin.id,
        name: skin.name,
        owned,
        splashPath: skin.splashPath,
        tilePath: skin.tilePath,
        stillObtainable,
        price,
        sale: catalogItem ? catalogItem.sale : null,
        originalPrice: catalogItem ? catalogItem.originalPrice : null,
        rarity: (cdSkins[skin.id] ? cdSkins[skin.id].rarity : skin.rarity) || 'kNoRarity',
        isLegacy: (cdSkins[skin.id] ? cdSkins[skin.id].isLegacy : skin.isLegacy) || false,
        skinIndex: skin.id % 1000 // For Weblog video URL
      });
      
      champions[champId].totalCount++;
      if (owned) champions[champId].ownedCount++;
    }

    // Build summary
    const champList = Object.values(champions).sort((a, b) => 
      (a.championName || '').localeCompare(b.championName || '')
    );
    
    // Sort skins by time (ID ascending)
    champList.forEach(c => {
      c.skins.sort((a, b) => b.id - a.id); // Newest first
    });

    const totalSkins = champList.reduce((sum, c) => sum + c.totalCount, 0);
    const ownedSkins = champList.reduce((sum, c) => sum + c.ownedCount, 0);
    const noSkinChamps = champList.filter(c => c.ownedCount === 0 && c.totalCount > 0);

    res.json({
      success: true,
      data: {
        summoner: {
          name: summoner.displayName || summoner.gameName,
          level: summoner.summonerLevel,
          profileIconId: summoner.profileIconId,
        },
        stats: {
          totalSkins,
          ownedSkins,
          missingSkins: totalSkins - ownedSkins,
          collectionPercent: ((ownedSkins / totalSkins) * 100).toFixed(1),
          totalChampions: champList.length,
          championsWithNoSkins: noSkinChamps.length,
        },
        champions: champList,
      },
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});
// ==========================================
// 4. LCU 戰績總覽 (Ranked Stats & Match History)
// ==========================================
app.get('/api/lcu/profile', async (req, res) => {
  if (!lcuCredentials) {
    return res.json({ success: false, message: '未連接 League Client' });
  }

  try {
    const [rankedResp, matchResp] = await Promise.all([
      request({ method: 'GET', url: '/lol-ranked/v1/current-ranked-stats' }, lcuCredentials),
      request({ method: 'GET', url: '/lol-match-history/v1/products/lol/current-summoner/matches' }, lcuCredentials)
    ]);
    
    const [rankedData, matchData] = await Promise.all([
      rankedResp.ok ? rankedResp.json() : Promise.resolve({}),
      matchResp.ok ? matchResp.json() : Promise.resolve({})
    ]);

    // We only need the last 20 matches (already paginated by default usually, but we slice just in case)
    let games = [];
    if (matchData && matchData.games && matchData.games.games) {
      games = matchData.games.games.slice(0, 20);
    }

    res.json({
      success: true,
      data: {
        ranked: rankedData,
        matches: games
      }
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==========================================
// 5. LCU 單場詳細戰績 (Match Details)
// ==========================================
app.get('/api/lcu/match/:gameId', async (req, res) => {
  if (!lcuCredentials) {
    return res.json({ success: false, message: '未連接 League Client' });
  }

  try {
    const gameId = req.params.gameId;
    const matchResp = await request({
      method: 'GET',
      url: `/lol-match-history/v1/games/${gameId}`
    }, lcuCredentials);
    
    if (matchResp.status !== 200) {
      return res.json({ success: false, message: `找不到對戰資料 (HTTP ${matchResp.status})` });
    }
    
    const matchData = await matchResp.json();
    res.json({ success: true, data: matchData });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// ==========================================
// 6. LCU 單場時間軸 (Match Timeline)
// ==========================================
app.get('/api/lcu/match-timeline/:gameId', async (req, res) => {
  if (!lcuCredentials) {
    return res.json({ success: false, message: '未連接 League Client' });
  }

  try {
    const gameId = req.params.gameId;
    const timelineResp = await request({
      method: 'GET',
      url: `/lol-match-history/v1/game-timelines/${gameId}`
    }, lcuCredentials);
    
    if (timelineResp.status !== 200) {
      return res.json({ success: false, message: `找不到時間軸資料 (HTTP ${timelineResp.status})` });
    }
    
    const timelineData = await timelineResp.json();
    res.json({ success: true, data: timelineData });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

export function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const activePort = server.address().port;
      resolve(activePort);
    });

    process.on('uncaughtException', (err) => {
      console.error('發生未預期錯誤:', err);
    });
  });
}

// Check if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(async (activePort) => {
    console.log(`\n========================================`);
    console.log(`🚀 LOL Skin Library 已成功啟動！`);
    console.log(`========================================\n`);
    console.log(`📖 正在自動為您開啟瀏覽器: http://127.0.0.1:${activePort}\n`);
    
    try {
      await open(`http://127.0.0.1:${activePort}`);
    } catch (err) {
      console.log(`⚠️ 無法自動開啟瀏覽器，請手動複製以上網址在瀏覽器中貼上。`);
    }
    
    console.log(`\n(如果您想關閉程式，請直接關閉這個黑色的命令視窗)\n`);
  });
}

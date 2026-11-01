
for(const url of ["https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js","https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js"]){await new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=url;s.onload=resolve;s.onerror=()=>reject(Error("行动面板依赖加载失败："+url));document.head.append(s);});}

    // Only replaces the original renderer's captured-text input. Original parser/style/render stay intact.
async function readOriginalActionText(){
  if(typeof getCurrentMessageId!=='function'||typeof getChatMessages!=='function')throw Error('原消息读取接口不可用');
  const messages=await getChatMessages(getCurrentMessageId(),{include_swipes:true});
  if(!Array.isArray(messages)||typeof messages[0]?.message!=='string')throw Error('当前消息正文不可用');
  const blocks=[...messages[0].message.matchAll(/<action_info>((?:(?!<\/?action_info>)[\s\S])*?)<\/action_info>/gs)];
  if(blocks.length===1)return blocks[0][0];
  const frame=window.frameElement,mes=frame?.closest('.mes');
  if(!frame||!mes)throw Error('无法定位多段行动块');
  const markers=[...mes.querySelectorAll('[data-tw-original-action]')];
  const before=markers.filter(m=>m.compareDocumentPosition(frame)&4),slot=before.length-1;
  if(slot<0)throw Error('无法定位当前行动块');
  if(blocks.length!==markers.length||!blocks[slot])throw Error('行动块对应关系尚未确认');
  return blocks[slot][0];
}


    const PanelConfig = {
      '战况总览':   { icon: 'fa-solid fa-scroll',           color: '#ffd700' },
      '戰況總覽':   { icon: 'fa-solid fa-scroll',           color: '#ffd700' },
      '行动顺序':   { icon: 'fa-solid fa-hourglass-half',   color: '#63b3ed' },
      '行動順序':   { icon: 'fa-solid fa-hourglass-half',   color: '#63b3ed' },
      '攻击行动':   { icon: 'fa-solid fa-crosshairs',       color: '#fc8181' },
      '攻擊行動':   { icon: 'fa-solid fa-crosshairs',       color: '#fc8181' },
      '伤害基准计算': { icon: 'fa-solid fa-calculator',     color: '#ed8936' },
      '傷害基準計算': { icon: 'fa-solid fa-calculator',     color: '#ed8936' },
      '结算清单':   { icon: 'fa-solid fa-list-check',       color: '#68d391' },
      '結算清單':   { icon: 'fa-solid fa-list-check',       color: '#68d391' },
      '战术动作':   { icon: 'fa-solid fa-chess-knight',     color: '#9f7aea' },
      '戰術動作':   { icon: 'fa-solid fa-chess-knight',     color: '#9f7aea' },
      '战意判定':   { icon: 'fa-solid fa-heart-crack',      color: '#f56565' },
      '戰意判定':   { icon: 'fa-solid fa-heart-crack',      color: '#f56565' },
      '战斗结算':   { icon: 'fa-solid fa-flag-checkered',   color: '#48bb78' },
      '戰鬥結算':   { icon: 'fa-solid fa-flag-checkered',   color: '#48bb78' },
      '经验结算':   { icon: 'fa-solid fa-chart-line',       color: '#f6e05e' },
      '經驗結算':   { icon: 'fa-solid fa-chart-line',       color: '#f6e05e' },
      '生产准备':   { icon: 'fa-solid fa-hammer',           color: '#ed8936' },
      '生產準備':   { icon: 'fa-solid fa-hammer',           color: '#ed8936' },
      '制作检定':   { icon: 'fa-solid fa-flask',            color: '#63b3ed' },
      '製作檢定':   { icon: 'fa-solid fa-flask',            color: '#63b3ed' },
      '生产结算':   { icon: 'fa-solid fa-box-open',         color: '#48bb78' },
      '生產結算':   { icon: 'fa-solid fa-box-open',         color: '#48bb78' }
    };

    function parseActionInfo(text) {
      let content = _.trim(text);
      const tagMatch = content.match(/<action_info>([\s\S]*?)<\/action_info>/);
      if (tagMatch) content = _.trim(tagMatch[1]);
      return parsePanelContent(content);
    }

    function parsePanelContent(content) {
      const lines = _.chain(content).split('\n').map(_.trim).compact().value();
      const sections = [];
      let currentSection = null;
      _.forEach(lines, line => {
        const titleMatch = line.match(/^\{(.+?)\}$/);
        if (titleMatch) {
          if (currentSection) sections.push(currentSection);
          currentSection = { title: titleMatch[1], rows: [] };
          return;
        }
        if (_.startsWith(line, '|') && _.endsWith(line, '|') && currentSection) {
          currentSection.rows.push(_.trim(line.slice(1, -1)));
        }
      });
      if (currentSection) sections.push(currentSection);
      return { sections };
    }

    function beautifyRow(row) {
      let html = _.escape(row);

      const labels = {
        round:        '(?:回合|回合數)',
        environment:  '(?:环境|環境)',
        sequence:     '(?:序列)',
        type:         '(?:类型|類型)',
        industry:     '(?:行业|行業)',
        target:       '(?:目标|目標)',
        role:         '(?:角色)',
        attacker:     '(?:攻方)',
        defender:     '(?:守方)',
        object:       '(?:对象|對象)',
        contest:      '(?:对抗|對抗)',
        move:         '(?:招式)',
        weapon:       '(?:所使武器)',
        consume:      '(?:消耗)',
        execute:      '(?:执行|執行)',
        cert:         '(?:认证|認證)',
        coreStat:     '(?:核心属性|核心屬性)',
        quality:      '(?:品质|品質)',
        status:       '(?:状态|狀態)',
        statusApply:  '(?:状态施加|狀態施加)',
        stateSummary: '(?:状态结算|狀態結算)',
        checkResult:  '(?:检定结果|檢定結果)',
        result:       '(?:结果|結果)',
        intent:       '(?:意图|意圖)',
        battleResult: '(?:战果|戰果)',
        effect:       '(?:效果)',
        statusEffect: '(?:状态效果|狀態效果)',
        resourcePreview: '(?:资源预检|資源預檢)',
        resourceCost: '(?:资源消耗|資源消耗)',
        settlement: '(?:结算状态|結算狀態)',
        expDetail: '(?:经验明细|經驗明細)',
        expBasis: '(?:经验依据|經驗依據)',
        expTotal: '(?:EXP合计)',
        expActual: '(?:上限后实得EXP|上限後實得EXP)',
        reward: '(?:奖励|獎勵)',
        materials:    '(?:投入物)',
        input:        '(?:投入)',
        loss:         '(?:损失|損失)',
        outputList:   '(?:产出列表|產出列表)',
        eta:          '(?:预估时间|預估時間)',
        timeCost:     '(?:时间消耗|時間消耗)',
        batchCheck:   '(?:批量检查|批量檢查)',
        qualityCheck: '(?:品质要求检查\\(仅半成品\\/成品\\)|品質要求檢查\\(僅半成品\\/成品\\))',
        licenseCheck: '(?:管制投入物检查\\(仅半成品\\/成品\\)|管制投入物檢查\\(僅半成品\\/成品\\))'
      };

      const wrapLabeledValue = (label, regex, className, icon, color = null, extraClass = '') => {
        html = html.replace(regex, (m, value) => {
          const displayLabel = _.escape(label.replace(/\(\?:|\)/g, '').split('|')[0]);
          const style = color ? ` style="background:${color.background};color:${color.color};"` : '';
          const classes = [className, extraClass].filter(Boolean).join(' ');
          return `${displayLabel} <span class="${classes}"${style}><i class="${icon}"></i> ${value.trim()}</span>`;
        });
      };

      const formatResourceTokens = (value) => value
        .replace(/HP\s*\[?(\d+)\/(\d+)\]?/g, (match, current, max) => {
          const percent = (parseInt(current, 10) / parseInt(max, 10)) * 100;
          const colorClass = percent > 50 ? 'tag-hp' : 'tag-hp-low';
          return `<span class="tag ${colorClass}"><i class="fa-solid fa-heart"></i> HP ${current}/${max}</span>`;
        })
        .replace(/MP\s*\[?(\d+)\/(\d+)\]?/g, (m, cur, max) =>
          (() => {
            const percent = (parseInt(cur, 10) / parseInt(max, 10)) * 100;
            const colorClass = percent > 35 ? 'tag-mp' : 'tag-mp-low';
            return `<span class="tag ${colorClass}"><i class="fa-solid fa-droplet"></i> MP ${cur}/${max}</span>`;
          })())
        .replace(/SP\s*\[?(\d+)\/(\d+)\]?/g, (m, cur, max) =>
          (() => {
            const percent = (parseInt(cur, 10) / parseInt(max, 10)) * 100;
            const colorClass = percent > 35 ? 'tag-sp' : 'tag-sp-low';
            return `<span class="tag ${colorClass}"><i class="fa-solid fa-bolt"></i> SP ${cur}/${max}</span>`;
          })())
        .replace(/HP\s*\[?(\d+)\]?(?![\d\/])/g, (m, val) =>
          `<span class="tag tag-hp"><i class="fa-solid fa-heart"></i> HP ${val}</span>`)
        .replace(/MP\s*\[?(\d+)\]?(?![\d\/])/g, (m, val) =>
          `<span class="tag tag-mp"><i class="fa-solid fa-droplet"></i> MP ${val}</span>`)
        .replace(/SP\s*\[?(\d+)\]?(?![\d\/])/g, (m, val) =>
          `<span class="tag tag-sp"><i class="fa-solid fa-bolt"></i> SP ${val}</span>`);

      // ===== HP / MP / SP =====
      html = formatResourceTokens(html);

      // ===== 五维属性 =====
      html = html.replace(/(^|[\s\|])(力)\[?(\d+)\]?/g, (m, sep, _, val) =>
        `${sep}<span class="stat stat-str"><i class="fa-solid fa-dumbbell"></i> 力量${val}</span>`);
      html = html.replace(/(^|[\s\|])(敏)\[?(\d+)\]?/g, (m, sep, _, val) =>
        `${sep}<span class="stat stat-agi"><i class="fa-solid fa-feather-pointed"></i> 敏捷${val}</span>`);
      html = html.replace(/(^|[\s\|])(体)\[?(\d+)\]?/g, (m, sep, _, val) =>
        `${sep}<span class="stat stat-con"><i class="fa-solid fa-shield-heart"></i> 体质${val}</span>`);
      html = html.replace(/(^|[\s\|])(智)\[?(\d+)\]?/g, (m, sep, _, val) =>
        `${sep}<span class="stat stat-int"><i class="fa-solid fa-brain"></i> 智力${val}</span>`);
      html = html.replace(/(^|[\s\|])(精)\[?(\d+)\]?/g, (m, sep, _, val) =>
        `${sep}<span class="stat stat-spi"><i class="fa-solid fa-eye"></i> 精神${val}</span>`);

      // ===== 基础标签 =====
      html = html.replace(new RegExp(`${labels.round}:\\s*(\\d+)`, 'g'), (m, num) =>
        `<span class="tag tag-round"><i class="fa-solid fa-rotate"></i> 回合 ${num}</span>`);
      html = html.replace(new RegExp(`${labels.environment}:\\s*([^|]+)`, 'g'), (m, env) =>
        `环境: <span class="tag tag-env"><i class="fa-solid fa-location-dot"></i> ${env.trim()}</span>`);
      html = html.replace(new RegExp(`${labels.sequence}:\\s*([^|]+)`, 'g'), (m, seq) =>
        `序列: <span class="tag tag-round"><i class="fa-solid fa-list-ol"></i> ${seq.trim()}</span>`);
      html = html.replace(/(^|\|\s*)(消耗|消耗數值):\s*([^|]*(?:\|\s*(?:<span class="tag tag-(?:hp|mp|sp)"[^>]*>.*?<\/span>|(?:HP|MP|SP)\s*\[[^\]]+\]))*)/g,
        (m, prefix, _label, value) => `${prefix}<span class="field-label">消耗:</span> ${value.trim()}`);
      html = html.replace(new RegExp(`${labels.resourcePreview}:\\s*([^|]*(?:\\|\\s*(?:<span class="tag tag-(?:hp|mp|sp)"[^>]*>.*?<\\/span>|(?:HP|MP|SP)\\s*\\[[^\\]]+\\]))*)`, 'g'),
        (m, value) => `<span class="field-label">资源预检:</span> ${value.trim()}`);
      html = html.replace(new RegExp(`${labels.resourceCost}:\\s*([^|]*(?:\\s+(?:<span class="tag tag-(?:hp|mp|sp)"[^>]*>.*?<\\/span>|(?:HP|MP|SP)\\s*\\[[^\\]]+\\]))*)`, 'g'),
        (m, value) => `<span class="field-label">资源消耗:</span> ${value.trim()}`);

      // ===== 类型标签（战斗/制作） =====
      html = html.replace(new RegExp(`${labels.type}:\\s*([^|]+)`, 'g'), (m, type) => {
        const value = type.trim();
        const mapping = {
          '锻造':   { icon: 'fa-solid fa-hammer',         background: '#c53030', color: '#fff' },
          '炼金':   { icon: 'fa-solid fa-flask',          background: '#805ad5', color: '#fff' },
          '烹饪':   { icon: 'fa-solid fa-utensils',       background: '#dd6b20', color: '#fff' },
          '裁缝':   { icon: 'fa-solid fa-scissors',       background: '#319795', color: '#fff' },
          '基础加工': { icon: 'fa-solid fa-gears',        background: '#4a5568', color: '#fff' },
          '半成品': { icon: 'fa-solid fa-cubes',          background: '#2b6cb0', color: '#fff' },
          '成品':   { icon: 'fa-solid fa-box-open',       background: '#2f855a', color: '#fff' },
          '逃跑':   { icon: 'fa-solid fa-person-running', background: '#975a16', color: '#fff' }
        };
        const style = mapping[value];
        if (style) {
          return `类型: <span class="tag" style="background:${style.background};color:${style.color};"><i class="${style.icon}"></i> ${value}</span>`;
        }
        return `类型: <span class="tag tag-type"><i class="fa-solid fa-tag"></i> ${value}</span>`;
      });

      // ===== wrapLabeledValue 调用 =====
      wrapLabeledValue('行业:', new RegExp(`${labels.industry}:\\s*([^|]+)`, 'g'),   'tag tag-type', 'fa-solid fa-industry',        { background: '#744210', color: '#fff' });
      wrapLabeledValue('目标:', new RegExp(`${labels.target}:\\s*([^|]+)`, 'g'),     'tag tag-env',  'fa-solid fa-bullseye',         { background: '#2c5282', color: '#bee3f8' });
      wrapLabeledValue('角色:', new RegExp(`${labels.role}:\\s*([^|]+)`, 'g'),       'tag tag-env',  'fa-solid fa-user',             { background: '#285e61', color: '#e6fffa' });
      wrapLabeledValue('攻方:', new RegExp(`${labels.attacker}:\\s*([^|]+)`, 'g'),   'tag tag-hp',   'fa-solid fa-hand-fist',            { background: '#9b2c2c', color: '#fff' });
      wrapLabeledValue('守方:', new RegExp(`${labels.defender}:\\s*([^|]+)`, 'g'),   'tag tag-mp',   'fa-solid fa-shield',           { background: '#2c5282', color: '#fff' });
      wrapLabeledValue('对象:', new RegExp(`${labels.object}:\\s*([^|]+)`, 'g'),     'tag tag-env',  'fa-solid fa-crosshairs',       { background: '#4a5568', color: '#fff' });
      wrapLabeledValue('对抗:', new RegExp(`${labels.contest}:\\s*([^|]+)`, 'g'),    'tag tag-type', 'fa-solid fa-scale-balanced',   { background: '#553c9a', color: '#fff' });
      wrapLabeledValue('招式:', new RegExp(`${labels.move}:\\s*([^|]+)`, 'g'),       'tag tag-type', 'fa-solid fa-wand-sparkles',    { background: '#553c9a', color: '#fff' });
      wrapLabeledValue('所使武器:', new RegExp(`${labels.weapon}:\\s*([^|]+)`, 'g'), 'tag tag-type', 'fa-solid fa-khanda',            { background: '#744210', color: '#fff' });
      wrapLabeledValue('执行:', new RegExp(`${labels.execute}:\\s*([^|]+)`, 'g'),    'tag tag-type', 'fa-solid fa-play',             { background: '#2d3748', color: '#fff' });
      wrapLabeledValue('认证:', new RegExp(`${labels.cert}:\\s*([^|]+)`, 'g'),       'tag tag-type', 'fa-solid fa-certificate',      { background: '#975a16', color: '#fff' });

      // ===== 核心属性 =====
      html = html.replace(new RegExp(`${labels.coreStat}:\\s*(力量)`, 'g'), (m, g1) => `核心属性: <span class="stat stat-str">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.coreStat}:\\s*(智力)`, 'g'), (m, g1) => `核心属性: <span class="stat stat-int">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.coreStat}:\\s*(精神)`, 'g'), (m, g1) => `核心属性: <span class="stat stat-spi">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.coreStat}:\\s*(敏捷)`, 'g'), (m, g1) => `核心属性: <span class="stat stat-agi">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.coreStat}:\\s*(力量|智力|精神|敏捷)`, 'g'), (m, g1) => `核心属性: <span class="stat">${g1}</span>`);

      // ===== 品质 =====
      html = html.replace(new RegExp(`${labels.quality}:\\s*(普通)`, 'g'),       (m, g1) => `品质: <span style="color:#a0aec0;font-weight:600;">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.quality}:\\s*(優良|优良)`, 'g'),  (m, g1) => `品质: <span style="color:#68d391;font-weight:600;">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.quality}:\\s*(稀有)`, 'g'),       (m, g1) => `品质: <span style="color:#63b3ed;font-weight:600;">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.quality}:\\s*(史詩|史诗)`, 'g'),  (m, g1) => `品质: <span style="color:#b794f4;font-weight:600;">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.quality}:\\s*(傳說|传说)`, 'g'),  (m, g1) => `品质: <span style="color:#f6ad55;font-weight:600;">${g1}</span>`);
      html = html.replace(new RegExp(`${labels.quality}:\\s*(神話|神话)`, 'g'),  (m, g1) => `品质: <span style="color:#fc8181;font-weight:600;text-shadow:0 0 8px rgba(252,129,129,0.5);">${g1}</span>`);

      // ===== 状态 =====
      html = html.replace(new RegExp(`(^|\\|\\s*)${labels.status}:\\s*(制作失败|製作失敗|制作成功|製作成功|充足|不足(?:\\(终止\\)|\\(終止\\))?)`, 'g'), (m, prefix, state) => {
        const isBad = /失败|失敗|不足/.test(state);
        return `${prefix}状态: <span style="color:${isBad ? '#fc8181' : '#68d391'};font-weight:700;">${_.escape(state)}</span>`;
      });
      html = html.replace(new RegExp(`(^|\\|\\s*)${labels.status}:\\s*([^|]+)`, 'g'), (match, prefix, states) => {
        if (/制作失败|製作失敗|制作成功|製作成功|充足|不足/.test(states)) return match;
        const stateList = states.split(/[，,]/).map(s => s.trim()).filter(Boolean);
        const stateHtml = stateList.map(state => {
          const durationMatch = state.match(/\(([^()]*?回合)\)/);
          const duration = durationMatch ? ` (${durationMatch[1]})` : '';
          const stateName = state.replace(/\([^()]*?回合\)/, '').trim();
          return `<span class="status-effect">${stateName}${duration}</span>`;
        }).join('');
        return `${prefix}<span class="status-label">状态:</span> ${stateHtml}`;
      });
      html = html.replace(new RegExp(`${labels.statusApply}\(([^)]+)\):\\s*([^|]+)`, 'g'), (m, effectName, result) =>
        `<span class="field-label">状态施加</span><span class="tag tag-flex" style="background:#553c9a;color:#fff;"><i class="fa-solid fa-burst"></i> ${effectName}</span>: <span style="color:#d6bcfa;">${result.trim()}</span>`);
      html = html.replace(new RegExp(`${labels.stateSummary}:\\s*([^|]+)`, 'g'), (m, summary) =>
        `<span class="field-label">状态结算:</span> <span style="color:#e9d8fd;">${summary.trim()}</span>`);

      // ===== 检定结果 =====
      html = html.replace(new RegExp(`${labels.checkResult}:\\s*(大失败|大失敗)`, 'g'), (m, g1) => `检定结果: <span style="color:#e53e3e;font-weight:700;"><i class="fa-solid fa-skull-crossbones"></i> ${g1}</span>`);
      html = html.replace(new RegExp(`${labels.checkResult}:\\s*(失败|失敗)`, 'g'),     (m, g1) => `检定结果: <span style="color:#fc8181;font-weight:700;"><i class="fa-solid fa-times"></i> ${g1}</span>`);
      html = html.replace(new RegExp(`${labels.checkResult}:\\s*(成功)`, 'g'),           (m, g1) => `检定结果: <span style="color:#68d391;font-weight:700;"><i class="fa-solid fa-check"></i> ${g1}</span>`);
      html = html.replace(new RegExp(`${labels.checkResult}:\\s*(精益求精)`, 'g'),       (m, g1) => `检定结果: <span style="color:#ffd700;font-weight:700;text-shadow:0 0 8px rgba(255,215,0,0.5);"><i class="fa-solid fa-star"></i> ${g1}</span>`);

      // ===== 结果/战果 =====
      html = html.replace(new RegExp(`${labels.result}:\\s*(胜利|勝利|逃跑成功)`, 'g'), (m, g1) =>
        `结果: <span style="color:#48bb78;font-weight:700;"><i class="fa-solid fa-trophy"></i> ${_.escape(g1)}</span>`);
      html = html.replace(new RegExp(`${labels.result}:\\s*(失败|失敗|逃跑失败)`, 'g'), (m, g1) =>
        `结果: <span style="color:#fc8181;font-weight:700;"><i class="fa-solid fa-skull"></i> ${_.escape(g1)}</span>`);
      html = html.replace(new RegExp(`${labels.battleResult}:\\s*([^|]+)`, 'g'), (m, val) =>
        `战果: <span style="color:#e2e8f0;font-style:italic;">${val.trim()}</span>`);
      html = html.replace(new RegExp(`${labels.settlement}:\\s*([^|]+)`, 'g'), (m, val) =>
        `结算状态: <span style="color:#fbd38d;font-weight:600;">${val.trim()}</span>`);

      html = html.replace(new RegExp(`${labels.expDetail}:\\s*([^|]+)`, 'g'), (m, val) =>
        `经验明细: <span style="color:#e2e8f0;line-height:1.5;">${val.trim()}</span>`);
      html = html.replace(new RegExp(`${labels.expBasis}:\\s*([^|]+)`, 'g'), (m, val) =>
        `经验依据: <span style="color:#fbd38d;">${val.trim()}</span>`);
      html = html.replace(new RegExp(`${labels.expTotal}:\\s*(\\[[^\\]]+\\]|\\d+)`, 'g'), (m, val) =>
        `EXP合计: <span style="color:#f6e05e;font-weight:700;"><i class="fa-solid fa-calculator"></i> ${val}</span>`);
      html = html.replace(new RegExp(`${labels.expActual}:\\s*(\\[[^\\]]+\\]|\\d+)`, 'g'), (m, val) =>
        `上限后实得EXP: <span style="color:#ffd700;font-weight:700;"><i class="fa-solid fa-arrow-trend-up"></i> ${val}</span>`);

      // ===== 意图 =====
      html = html.replace(new RegExp(`${labels.intent}:\\s*([^|]+)`, 'g'), (m, val) =>
        `意图: <span style="color:#fbd38d;">${val.trim()}</span>`);

      // ===== 效果/状态效果 =====
      wrapLabeledValue('状态效果:', new RegExp(`${labels.statusEffect}:\\s*([^|]+)`, 'g'), 'tag tag-type', 'fa-solid fa-circle-nodes',  { background: '#44337a', color: '#e9d8fd' }, 'tag-detail');
      html = html.replace(new RegExp(`(^|\\|\\s*)${labels.effect}:\\s*([^|]+)`, 'g'), (m, prefix, value) =>
        `${prefix}效果: <span class="tag tag-type tag-detail" style="background:#2d3748;color:#e2e8f0;"><i class="fa-solid fa-star-of-david"></i> ${value.trim()}</span>`);

      // ===== 生产制作专属 =====
      wrapLabeledValue('投入物:', new RegExp(`${labels.materials}:\\s*([^|]+)`, 'g'),  'tag tag-sp', 'fa-solid fa-boxes-stacked', { background: '#276749', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('投入:',   new RegExp(`${labels.input}:\\s*([^|]+)`, 'g'),      'tag tag-sp', 'fa-solid fa-box',           { background: '#276749', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('损失:',   new RegExp(`${labels.loss}:\\s*([^|]+)`, 'g'),       'tag tag-hp', 'fa-solid fa-box-open',      { background: '#9b2c2c', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('产出列表:', new RegExp(`${labels.outputList}:\\s*([^|]+)`, 'g'), 'tag tag-sp', 'fa-solid fa-box-open',     { background: '#2f855a', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('预估时间:', new RegExp(`${labels.eta}:\\s*([^|]+)`, 'g'),      'tag tag-round', 'fa-solid fa-clock',      { background: '#4a5568', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('时间消耗:', new RegExp(`${labels.timeCost}:\\s*([^|]+)`, 'g'), 'tag tag-round', 'fa-solid fa-hourglass',  { background: '#4a5568', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('批量检查:', new RegExp(`${labels.batchCheck}:\\s*([^|]+)`, 'g'), 'tag tag-type', 'fa-solid fa-layer-group', { background: '#2b6cb0', color: '#fff' });
      wrapLabeledValue('品质要求检查(仅半成品/成品):', new RegExp(`${labels.qualityCheck}:\\s*([^|]+)`, 'g'), 'tag tag-type', 'fa-solid fa-medal',          { background: '#2c5282', color: '#fff' }, 'tag-detail');
      wrapLabeledValue('管制投入物检查(仅半成品/成品):', new RegExp(`${labels.licenseCheck}:\\s*([^|]+)`, 'g'), 'tag tag-type', 'fa-solid fa-scale-balanced', { background: '#744210', color: '#fff' }, 'tag-detail');

      // ===== 生死状态 =====
      html = html.replace(/死亡\/毁坏|死亡\/毀壞/g,
        '<span style="color:#e53e3e;font-weight:700;"><i class="fa-solid fa-skull"></i> 死亡/毁坏</span>');
      html = html.replace(/未死\/存活/g,
        '<span style="color:#68d391;font-weight:700;"><i class="fa-solid fa-heart-pulse"></i> 未死/存活</span>');

      // ===== EXP / FP =====
      html = html.replace(/EXP\s*\+(\d+)/g, (m, val) =>
        `<span style="color:#ffd700;font-weight:700;"><i class="fa-solid fa-star"></i> EXP +${val}</span>`);
      html = html.replace(/FP\s*\+(\d+)/g, (m, val) =>
        `<span style="color:#90cdf4;font-weight:700;"><i class="fa-solid fa-gem"></i> FP +${val}</span>`);
      html = html.replace(new RegExp(`${labels.reward}:\\s*`, 'g'),
        '<span class="field-label">奖励:</span> ');

      // ===== 箭头文本统一：避免显示 HTML 实体 =====
      html = html.replace(/-&gt;/g, '->');

      return html;
    }

    function renderPanel(panel, containerSelector, append = false) {
      const $container = $(containerSelector);
      if (!append) $container.empty();

      _.forEach(panel.sections, section => {
        const config = _.get(PanelConfig, section.title, {
          icon: 'fa-solid fa-circle-info',
          color: '#e8d5b7'
        });

        const $panel = $('<div class="action-panel">');

        const $header = $(`
          <div class="panel-header">
            <i class="panel-icon ${config.icon}" style="color:${config.color};"></i>
            <span class="panel-title">${_.escape(section.title)}</span>
            <i class="panel-toggle fa-solid fa-chevron-down"></i>
          </div>
        `);
        $header.on('click', function() {
          $(this).toggleClass('collapsed');
          $(this).siblings('.panel-content').toggleClass('collapsed');
        });
        $panel.append($header);

        const $content = $('<div class="panel-content">');
        _.forEach(section.rows, row => {
          $content.append(`<div class="data-row">${beautifyRow(row)}</div>`);
        });

        $panel.append($content);
        $container.append($panel);
      });
    }

    $(async () => {
      try { const panel = parseActionInfo(await readOriginalActionText()); renderPanel(panel, '#content'); }
      catch (error) { $('#content').text('行动面板读取未完成：'+error.message); }
    });
  

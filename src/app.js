/* ============================================================
 * Game Agent Lab · 界面逻辑
 * 依赖：kb.js / testset.js / engine.js
 * ============================================================ */
(function () {
  "use strict";

  const KB = window.KB, TS = window.TESTSET;
  const engine = window.ENGINE.createEngine(KB, TS);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const METRIC_DEF = [
    { key: "accuracy",     label: "准确性",     desc: "行为是否符合预期（该答的答、该拒的拒、该提示的提示）" },
    { key: "completeness", label: "完整性",     desc: "标准答案要点被覆盖的比例" },
    { key: "traceability", label: "依据可追溯", desc: "答案是否标注了可回溯的知识库来源" },
    { key: "freshness",    label: "时效性",     desc: "作答未引用已过期资料的比例" },
    { key: "stability",    label: "稳定性",     desc: "两种检索配置下结论与主要引用是否一致" },
    { key: "overall",      label: "综合得分",   desc: "准确性 35% + 完整性 20% + 可追溯 15% + 时效 15% + 稳定 15%" }
  ];

  const pct = (v) => (v * 100).toFixed(1) + "%";

  /* ============================================================
   * 动效层
   * 原则：动效只服务于信息层级（谁先出现、哪个数字更重），不做装饰性噪音。
   * 全部尊重 prefers-reduced-motion。
   * ============================================================ */
  const RM = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- 顶部星轨画布：缓慢漂移的星点 + 偶发彗尾 ---- */
  function initStars() {
    const cv = $("heroStars");
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, stars = [], comets = [], raf = null, running = false, t = 0;

    function build() {
      const r = cv.parentElement.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + "px"; cv.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(220, Math.round(w * h / 8200));
      stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h, z: Math.random(),
          r: Math.random() * 1.15 + 0.3, tw: Math.random() * 6.283,
          vx: (Math.random() - 0.5) * 0.055, vy: (Math.random() - 0.5) * 0.038
        });
      }
    }

    function paintStars() {
      for (const s of stars) {
        const a = (0.22 + 0.78 * s.z) * (0.6 + 0.4 * Math.sin(t * 1.4 + s.tw));
        ctx.globalAlpha = a * 0.92;
        ctx.fillStyle = s.z > 0.86 ? "#E4EEFF" : (s.z > 0.5 ? "#A8CCF4" : "#7FA6D8");
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.55 + s.z), 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function spawnComet() {
      comets.push({
        x: Math.random() * w * 0.55 - 40, y: Math.random() * h * 0.55,
        v: 2.7 + Math.random() * 2.4, len: 80 + Math.random() * 110,
        life: 1, gold: Math.random() < 0.35
      });
    }

    function frame() {
      if (!running) return;
      t += 0.016;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.x += s.vx; s.y += s.vy;
        if (s.x < -2) s.x = w + 2; if (s.x > w + 2) s.x = -2;
        if (s.y < -2) s.y = h + 2; if (s.y > h + 2) s.y = -2;
      }
      paintStars();
      for (let i = comets.length - 1; i >= 0; i--) {
        const c = comets[i];
        c.x += c.v; c.y += c.v * 0.30; c.life -= 0.008;
        if (c.life <= 0 || c.x > w + 160) { comets.splice(i, 1); continue; }
        const rgb = c.gold ? "240,201,106" : "127,196,242";
        const g = ctx.createLinearGradient(c.x - c.len, c.y - c.len * 0.30, c.x, c.y);
        g.addColorStop(0, "rgba(" + rgb + ",0)");
        g.addColorStop(1, "rgba(" + rgb + "," + (0.85 * c.life).toFixed(3) + ")");
        ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(c.x - c.len, c.y - c.len * 0.30); ctx.lineTo(c.x, c.y); ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    }

    function start() { if (running || RM) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

    build();
    t = 1.2;
    if (RM) { paintStars(); }            // 静态星点，不做动画
    else {
      start();
      setInterval(() => { if (comets.length < 3 && !document.hidden) spawnComet(); }, 2400);
      setTimeout(spawnComet, 600);
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((es) => {
          es[0].isIntersecting ? start() : stop();
        }, { threshold: 0 }).observe(cv);
      }
    }
    window.addEventListener("resize", () => { stop(); build(); RM ? paintStars() : start(); });
  }

  /* ---- 顶部视差：滚开时星轨慢一点、标题渐隐，做出一点纵深 ---- */
  function initHeroParallax() {
    const hero = document.querySelector(".hero"); if (!hero || RM) return;
    const stars = $("heroStars"), aurora = document.querySelector(".hero-aurora"), inner = document.querySelector(".hero-in");
    let raf = null;
    const upd = () => {
      raf = null;
      const y = Math.min(window.scrollY || 0, 700);
      if (stars) stars.style.transform = "translate3d(0," + (y * 0.30).toFixed(1) + "px,0)";
      // 极光不能改 transform：CSS 的 aurora 关键帧在动 transform，动画优先级高于行内样式。
      // 改 top（关键帧没用到）才动得起来。
      if (aurora) aurora.style.top = (-30 + y * 0.022).toFixed(2) + "%";
      if (inner) inner.style.opacity = Math.max(0, 1 - y / 560).toFixed(3);
    };
    window.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
    upd();
  }

  /* ---- 顶部滚动进度条 ---- */
  function initScrollProgress() {
    const el = $("sprog"); if (!el) return;
    const upd = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.width = (max > 0 ? Math.min(100, window.scrollY / max * 100) : 0) + "%";
    };
    window.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  /* ---- 滑动指示器 ----
   * 为什么用 offsetLeft / 计算宽度，而不是 getBoundingClientRect：
   * 切页时 .card 还在跑入场动画（transform: translateY(16px) scale(.994)），
   * rect 会被这个 scale 缩放，量出来的宽度会比真实布局宽度小 0.5px 左右，
   * 药丸就永远差那么一点点。offsetLeft 与计算宽度都是布局值，不受祖先 transform 影响。
   * 药丸是 left:0 的绝对定位元素，左右都相对 offsetParent 的 padding edge，
   * 与按钮的 offsetLeft 共用同一坐标系，直接平移过去即可 —— 不用再猜 containing-block。 */
  function placePill(pill, target, animate) {
    if (!pill || !target) return;
    const w = parseFloat(window.getComputedStyle(target).width);
    if (!isFinite(w) || w <= 0) return;     // 视图不可见时量不到尺寸，等可见后再同步
    // 首帧（首次布局 / resize 后）不能带过渡，否则药丸会从上一位置飘过来
    pill.style.transition = animate === false ? "none" : "";
    pill.style.width = w + "px";
    pill.style.transform = "translateX(" + target.offsetLeft + "px)";
    if (animate === false) requestAnimationFrame(() => { pill.style.transition = ""; });
  }

  function syncTabPill(animate) {
    const bar = $("tabbar"); if (!bar) return;
    const pill = bar.querySelector(".tab-pill"), on = bar.querySelector(".tab.on");
    if (!pill || !on) return;
    placePill(pill, on, animate);
  }
  function syncSegPill(animate) {
    const seg = $("askSeg"); if (!seg) return;
    const pill = seg.querySelector(".seg-pill"), on = seg.querySelector("button.on");
    if (!pill || !on) return;
    pill.classList.toggle("v1", (on.dataset.s || "") === "v1");
    placePill(pill, on, animate);
  }

  /* ---- 进度条：从 0 生长，错峰但设上限（24 行的表格不能等到 2 秒） ---- */
  function growBars(root) {
    (root || document).querySelectorAll("[data-w]").forEach((el, i) => {
      const w = el.dataset.w + "%";
      el.style.width = "0%";
      if (RM) { el.style.width = w; return; }
      setTimeout(() => { el.style.width = w; }, 80 + Math.min(i, 12) * 55);
    });
  }

  /* ---- 数字滚动 ---- */
  function countUp(root) {
    (root || document).querySelectorAll("[data-count]").forEach((el) => {
      const to = parseFloat(el.dataset.count);
      if (isNaN(to)) return;
      const dec = parseInt(el.dataset.dec || "0", 10);
      const suffix = el.dataset.suffix || "";
      if (RM) { el.textContent = to.toFixed(dec) + suffix; return; }
      const dur = 880, t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = (to * e).toFixed(dec) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      el.textContent = (0).toFixed(dec) + suffix;
      requestAnimationFrame(step);
    });
  }

  function enhance(root) { growBars(root); countUp(root); }


  /* ================= 顶部信息 ================= */
  function renderHero() {
    $("heroMeta").innerHTML = [
      ["锚点游戏", KB.meta.game],
      ["知识库快照", KB.meta.snapshot],
      ["当前游戏版本", KB.meta.currentVersion + " " + KB.meta.currentVersionName],
      ["知识条目", KB.meta.entryCount + " 条"],
      ["测试集", TS.meta.name + " " + TS.meta.version + " · " + TS.meta.caseCount + " 题"],
      ["运行方式", "完全离线 · 指标可复现"]
    ].map(([k, v]) => `<span class="chip">${esc(k)} <b>${esc(v)}</b></span>`).join("");

    $("heroNote").innerHTML =
      "说明：" + esc(KB.meta.note) +
      " 本 Demo <b>不调用任何外部大模型</b>，问答由真实实现的 BM25 检索 + 策略化答案合成完成，" +
      "因此每一项评测指标都可以在前端复现、可逐条核查，而不是展示一组成品截图。";

    $("foot").innerHTML =
      "Game Agent Lab · 游戏知识库问答 Agent 与效果评测平台　|　锚点游戏：《崩坏：星穹铁道》　|　" +
      "知识库快照 " + esc(KB.meta.snapshot) + "（" + esc(KB.meta.updated) + "）　|　" +
      "唐睿 · AI 应用运营 · 作品集项目一";
  }

  /* ================= 标签页 ================= */
  const TABS = [
    { id: "overview", n: "00", label: "项目总览" },
    { id: "ask",      n: "01", label: "Agent 问答" },
    { id: "kb",       n: "02", label: "知识库" },
    { id: "tests",    n: "03", label: "标准测试集" },
    { id: "eval",     n: "04", label: "效果评测" },
    { id: "iter",     n: "05", label: "错误分析与迭代" }
  ];
  function activateTab(id) {
    const b = document.querySelector('.tab[data-tab="' + id + '"]');
    if (!b) return;
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
    const view = document.getElementById("view-" + id);
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("on", v === view));
    syncTabPill(true);
    if (view) enhance(view);          // 切页后重放数字滚动 / 评分条生长
    // 隐藏视图里量不到尺寸（rect 全为 0），所以分段控件药丸必须在显示之后再归位
    if (id === "ask") syncSegPill(false);
  }
  function renderTabs() {
    $("tabbar").innerHTML =
      `<span class="tab-pill" aria-hidden="true"></span>` +
      TABS.map((t, i) =>
        `<button class="tab${i === 0 ? " on" : ""}" data-tab="${t.id}"><span class="n">${t.n}</span>${esc(t.label)}</button>`
      ).join("");
    $("tabbar").addEventListener("click", (e) => {
      const b = e.target.closest(".tab"); if (!b) return;
      activateTab(b.dataset.tab);
      history.replaceState(null, "", "#" + b.dataset.tab);
      window.scrollTo({ top: 0, behavior: RM ? "auto" : "smooth" });
    });
    window.addEventListener("resize", () => { syncTabPill(false); syncSegPill(false); });
    requestAnimationFrame(() => syncTabPill(false));
  }

  /* ================= 00 项目总览 ================= */
  function renderOverview() {
    const byCat = {};
    KB.entries.forEach((e) => { byCat[e.cat] = (byCat[e.cat] || 0) + 1; });
    const byType = {};
    TS.cases.forEach((c) => { byType[c.type] = (byType[c.type] || 0) + 1; });
    const srcAgg = {};
    KB.entries.forEach((e) => { srcAgg[e.srcType] = (srcAgg[e.srcType] || 0) + 1; });

    $("view-overview").innerHTML = `
    <div class="card">
      <div class="eyebrow">Project Positioning</div>
      <div class="card-h"><h3>为什么做这个项目</h3>
        <span class="hint">回答「我能不能把 AI 放进游戏业务流程里并管好它」</span></div>
      <div class="grid g2">
        <div>
          <p style="margin:0 0 10px;font-size:13.4px;color:var(--ink-2)">
          岗位需要的能力不是「会用 AI 工具」，而是：<b>维护知识库、评估模型输出、调整提示词、推动应用落地</b>。
          这类能力很难用几张 AI 生成的漂亮图来证明，它的证据形态只能是——<b>一个真实运行的系统 + 一份可复核的评测记录</b>。
          </p>
          <ul class="plain">
            <li><b>知识库维护</b>：35 条结构化条目，每条带来源类型、版本号、日期与状态（有效／待复核／已过期）</li>
            <li><b>Prompt 设计</b>：v1 与 v2 两套完整提示词策略，可直接查看差异并对比效果</li>
            <li><b>Agent 评测</b>：24 题标准测试集 + 5 项指标自动评分，支持逐题下钻</li>
            <li><b>持续调优</b>：错误归因 → 改知识库／改提示词 → 复测，形成可量化的迭代记录</li>
          </ul>
        </div>
        <div>
          <div class="note gold" style="margin-bottom:10px">
            <b>为什么锚定《崩坏：星穹铁道》</b><br>
            知识库工程的价值在于「资料真的多、真的会过期、真的会互相冲突」。星穹铁道的机制文档、版本更新说明、
            社区攻略三者之间存在大量时效与来源差异，是检验「能否识别冲突、处理过时信息、抵抗幻觉」的理想样本。
          </div>
          <div class="note">
            <b>诚实声明</b><br>
            知识库中标注「已过期」与「冲突样本」的条目是<b>刻意保留的真实病灶</b>，
            用于验证评测体系能不能把它们抓出来——它们不是当前版本的正确答案。
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="eyebrow">Closed Loop</div>
      <div class="card-h"><h3>项目运行闭环</h3><span class="hint">四个环节，环环可核查</span></div>
      <div class="flow">
        <div class="step"><span class="idx">01</span><h4>知识库</h4>
          <p>游戏机制、角色资料、培养信息、活动规则，逐条标注来源、版本与状态，并登记更新与校验规则。</p></div>
        <div class="step"><span class="idx">02</span><h4>Agent 问答与提示词策略</h4>
          <p>BM25 检索 → 覆盖率判定 → 结构化作答，含来源引用、拒答逻辑与资料冲突提示。</p></div>
        <div class="step"><span class="idx">03</span><h4>标准测试集与输出评测</h4>
          <p>24 题覆盖常见／易混淆／缺失／过期／推理五类场景，自动计算准确性、完整性、可追溯性与时效性。</p></div>
        <div class="step"><span class="idx">04</span><h4>错误分析与迭代复测</h4>
          <p>失败题自动归因，定位到「知识库缺失／资料冲突／资料过期／提示词缺陷」，改完复测看增益。</p></div>
      </div>
    </div>

    <div class="grid g3">
      <div class="card tight">
        <div class="eyebrow">Knowledge Base</div>
        <h3 style="font-size:14.5px;margin-bottom:10px">知识库构成（${KB.entries.length} 条）</h3>
        ${Object.keys(byCat).map((k) => `
          <div style="display:flex;justify-content:space-between;font-size:12.6px;padding:4px 0;border-bottom:1px dashed var(--line-2)">
            <span style="color:var(--ink-2)">${esc(k)}</span><b>${byCat[k]}</b></div>`).join("")}
        <div style="margin-top:10px;font-size:11.8px;color:var(--muted)">
          来源类型：${Object.keys(srcAgg).map((k) => k + " " + srcAgg[k]).join(" · ")}</div>
      </div>
      <div class="card tight">
        <div class="eyebrow">Test Set</div>
        <h3 style="font-size:14.5px;margin-bottom:10px">测试集构成（${TS.cases.length} 题）</h3>
        ${Object.keys(byType).map((k) => `
          <div style="display:flex;justify-content:space-between;font-size:12.6px;padding:4px 0;border-bottom:1px dashed var(--line-2)">
            <span style="color:var(--ink-2)">${esc(k)}</span><b>${byType[k]}</b></div>`).join("")}
        <div style="margin-top:10px;font-size:11.8px;color:var(--muted)">${esc(TS.meta.principle)}</div>
      </div>
      <div class="card tight">
        <div class="eyebrow">Capability Map</div>
        <h3 style="font-size:14.5px;margin-bottom:10px">能力对应关系</h3>
        <dl class="kv">
          <dt>知识库维护</dt><dd>条目化 + 版本标记 + 冲突/过期样本管理</dd>
          <dt>Prompt 设计</dt><dd>v1/v2 策略差异可直接查看与对比</dd>
          <dt>模型输出评测</dt><dd>5 项指标 + 24 题自动评分 + 逐题下钻</dd>
          <dt>数据分析</dt><dd>分类通过率、失败归因聚合、迭代增益量化</dd>
          <dt>业务落地</dt><dd>离线可运行、可部署、可复现，非概念稿</dd>
        </dl>
      </div>
    </div>

    <div class="card tight">
      <div class="note warn">
        <b>如何使用这份 Demo</b>：先到「Agent 问答」体验 v1／v2 两套策略的差异（建议试
        「下个版本 4.7 会出什么新角色？」与「五星角色最多多少抽一定能出？」），
        再到「效果评测」一键跑完 24 题看量化结果，最后在「错误分析与迭代」查看每一处改动的依据。
      </div>
    </div>`;
  }

  /* ================= 01 Agent 问答 ================= */
  let askStrategy = "v2";
  let lastAsk = null;

  function renderAsk() {
    $("view-ask").innerHTML = `
    <div class="card">
      <div class="card-h">
        <div>
          <div class="eyebrow">Ask the Agent</div>
          <h3>向知识库提问</h3>
        </div>
        <div class="seg" id="askSeg">
          <span class="seg-pill${askStrategy === "v1" ? " v1" : ""}" aria-hidden="true"></span>
          <button data-s="v1" class="${askStrategy === "v1" ? "on" : ""}">v1 初版策略</button>
          <button data-s="v2" class="${askStrategy === "v2" ? "on" : ""}">v2 优化策略</button>
        </div>
      </div>

      <div class="qrow">
        <input class="field" id="askInput" placeholder="例如：击破伤害主要受什么属性影响？">
        <button class="btn primary" id="askBtn">提问</button>
      </div>
      <div class="sugg" id="askSugg">
        ${["击破伤害主要受什么属性影响？",
           "五星角色最多多少抽一定能出？",
           "现在这个版本的混沌回忆上半用什么配队？",
           "《绝区零》里的驱动盘副词条该怎么选？",
           "下个版本 4.7 会出什么新角色？",
           "遗器的副词条最多有几条？",
           "辅助角色要不要留双爆副词条？",
           "游戏里的「共鸣」系统怎么用？"]
          .map((q) => `<button data-q="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>
    </div>

    <div class="card tight" id="askStrategyNote"></div>

    <div id="askResult"></div>

    <div class="card tight">
      <div class="card-h">
        <h3>当前策略的提示词（Prompt）</h3>
        <span class="hint">这是 Agent 实际执行的系统提示词，非示意</span>
      </div>
      <pre class="prompt" id="askPrompt"></pre>
    </div>`;

    $("askSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      askStrategy = b.dataset.s;
      document.querySelectorAll("#askSeg button").forEach((x) => x.classList.toggle("on", x === b));
      syncSegPill(true);                    // 药丸滑到新选项（含 v1 灰调 / v2 蓝调换色）
      renderAskNote(); renderPrompt();
      if (lastAsk) doAsk(lastAsk);
    });
    $("askBtn").addEventListener("click", () => doAsk($("askInput").value));
    $("askInput").addEventListener("keydown", (e) => { if (e.key === "Enter") doAsk($("askInput").value); });
    $("askSugg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      $("askInput").value = b.dataset.q; doAsk(b.dataset.q);
    });

    renderAskNote(); renderPrompt();
  }

  function renderAskNote() {
    const st = engine.STRATEGIES[askStrategy];
    $("askStrategyNote").innerHTML = `
      <div class="note ${askStrategy === "v1" ? "warn" : ""}">
        <b>${esc(st.name)}</b>　${esc(st.note)}<br>
        <span class="mono" style="font-size:11.6px">
        topK=${st.topK}　｜　排除分类=${st.excludeCats.length ? esc(st.excludeCats.join("、")) : "无"}　｜　
        时效加权=${st.useFreshness ? "开" : "关"}　｜　引用来源=${st.emitCitations ? "开" : "关"}　｜　
        拒答阈值(覆盖率)=${st.refuseThreshold > 0 ? st.refuseThreshold : "不拒答"}　｜　
        置信度下限=${st.refuseMinScore > 0 ? st.refuseMinScore : "无"}　｜　冲突/过期提示=${st.warnConflict ? "开" : "关"}
        </span>
      </div>`;
  }

  function renderPrompt() {
    const st = engine.STRATEGIES[askStrategy];
    const ctx = lastAsk && lastAsk.retrieved
      ? lastAsk.retrieved.results.map((r) => `[${r.entry.id}] ${r.entry.title}\n${r.entry.content}`).join("\n\n")
      : "（提问后此处会填入实际检索到的资料）";
    $("askPrompt").textContent = st.prompt
      .replace("{{CONTEXT}}", ctx)
      .replace("{{QUESTION}}", (lastAsk && lastAsk.q) || "（用户问题）");
  }

  function doAsk(q) {
    q = (q || "").trim();
    if (!q) { $("askResult").innerHTML = `<div class="card tight"><div class="note warn">请先输入一个问题。</div></div>`; return; }
    const out = engine.ask(q, askStrategy);
    lastAsk = { ...out, q };
    renderAskNote(); renderPrompt();
    renderAskResult(q, out);
  }

  function renderAskResult(q, out) {
    const st = out.strategy;
    const cov = out.retrieved.coverage;
    const stateBadge = out.refused
      ? `<span class="badge b-warn">已拒答</span>`
      : `<span class="badge b-ok">已作答</span>`;
    const flagBadges = (out.flags || []).map((f) =>
      `<span class="badge ${f.type === "conflict" ? "b-gold" : "b-bad"}">${f.type === "conflict" ? "资料冲突提示" : "过期资料提示"}</span>`
    ).join(" ");

    const evi = out.retrieved.results.map((r) => {
      const e = r.entry;
      const maxScore = out.retrieved.results[0].score || 1;
      const w = Math.max(4, Math.round((r.score / maxScore) * 100));
      const statusBadge = e.status === "有效" ? `<span class="badge b-ok">有效</span>`
        : e.status === "待复核" ? `<span class="badge b-warn">待复核</span>`
        : `<span class="badge b-bad">已过期</span>`;
      return `<div class="evi">
        <div class="top">
          <span class="t"><span class="mono" style="color:var(--accent)">[${esc(e.id)}]</span> ${esc(e.title)}</span>
          <span class="score">相关度 ${r.score.toFixed(2)}</span>
        </div>
        <div class="bar"><i data-w="${w}"></i></div>
        <div class="snip">${esc(e.content.slice(0, 150))}${e.content.length > 150 ? "…" : ""}</div>
        <div class="meta">${esc(e.cat)}　|　来源：${esc(e.source)}（${esc(e.srcType)}）　|　版本 ${esc(e.version)}　|　${esc(e.date)}</div>
        <div style="margin-top:7px">${statusBadge}</div>
      </div>`;
    }).join("") || `<div class="evi"><span class="score">未检索到任何匹配条目</span></div>`;

    const flagsHtml = (out.flags && out.flags.length)
      ? `<div class="note warn" style="margin:12px 0 0">${out.flags.map((f) => "⚠ " + esc(f.text)).join("<br>")}</div>`
      : "";

    $("askResult").innerHTML = `
    <div class="card">
      <div class="card-h">
        <div><div class="eyebrow">Answer</div><h3>${esc(q)}</h3></div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">${stateBadge} ${flagBadges}
          <span class="badge b-mut">检索覆盖率 ${pct(cov)}</span></div>
      </div>
      <div class="answer">
        <div class="answer-h">
          <span>${esc(st.name)}　·　答案由知识库条目组合生成（离线可复现）</span>
          <span class="st">引用：${out.citations.length ? esc(out.citations.join("  ")) : "无引用输出"}</span>
        </div>
        <div class="answer-b ${out.refused ? "refuse" : ""}">${esc(out.display || out.text)}</div>
      </div>
      ${flagsHtml}
    </div>

    <div class="card tight">
      <div class="card-h"><h3>检索到的资料（可核查的作答依据）</h3>
        <span class="hint">topK=${st.topK}　·　命中 ${out.retrieved.totalHits} 条　·　覆盖率 ${pct(cov)}</span></div>
      ${evi}
    </div>`;

    enhance($("askResult"));    // 证据条按相关度依次生长
  }

  /* ================= 02 知识库 ================= */
  let kbCat = "全部", kbQ = "";
  function renderKB() {
    const cats = ["全部"].concat(Array.from(new Set(KB.entries.map((e) => e.cat))));
    $("view-kb").innerHTML = `
    <div class="card">
      <div class="card-h"><div><div class="eyebrow">Knowledge Base</div>
        <h3>知识库维护表（${KB.entries.length} 条）</h3></div>
        <span class="hint">状态字段是评测时效性的基础，不是装饰</span></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select class="field" id="kbCat">${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
        <input class="field" id="kbSearch" style="max-width:280px" placeholder="搜索标题 / 关键词 / 正文">
        <button class="btn sm" id="kbReset">重置</button>
        <span class="hint" id="kbCount"></span>
      </div>
    </div>
    <div class="card tight">
      <div class="tbl-wrap"><table>
        <thead><tr><th style="width:74px">编号</th><th>标题</th><th style="width:96px">分类</th>
          <th style="width:70px">来源</th><th style="width:70px">版本</th><th style="width:98px">日期</th>
          <th style="width:78px">状态</th></tr></thead>
        <tbody id="kbBody"></tbody>
      </table></div>
    </div>
    <div id="kbDetail"></div>`;

    $("kbCat").addEventListener("change", () => { kbCat = $("kbCat").value; paintKB(); });
    $("kbSearch").addEventListener("input", () => { kbQ = $("kbSearch").value; paintKB(); });
    $("kbReset").addEventListener("click", () => { kbCat = "全部"; kbQ = ""; $("kbCat").value = "全部"; $("kbSearch").value = ""; paintKB(); });
    paintKB();
    $("kbBody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr"); if (!tr) return;
      const e2 = KB.entries.find((x) => x.id === tr.dataset.id);
      if (e2) renderKBDetail(e2);
    });
  }

  function paintKB() {
    const q = kbQ.trim().toLowerCase();
    const rows = KB.entries.filter((e) => (kbCat === "全部" || e.cat === kbCat) &&
      (!q || (e.title + e.content + (e.keywords || []).join("")).toLowerCase().includes(q)));
    $("kbCount").textContent = "筛选出 " + rows.length + " 条";
    $("kbBody").innerHTML = rows.map((e) => `
      <tr data-id="${esc(e.id)}" style="cursor:pointer">
        <td class="mono" style="color:var(--accent)">${esc(e.id)}</td>
        <td style="font-weight:600;color:var(--ink)">${esc(e.title)}</td>
        <td><span class="badge b-mut">${esc(e.cat)}</span></td>
        <td>${esc(e.srcType)}</td><td class="mono">${esc(e.version)}</td>
        <td class="mono" style="font-size:11.6px">${esc(e.date)}</td>
        <td>${e.status === "有效" ? '<span class="badge b-ok">有效</span>'
            : e.status === "待复核" ? '<span class="badge b-warn">待复核</span>'
            : '<span class="badge b-bad">已过期</span>'}</td>
      </tr>`).join("");
    $("kbDetail").innerHTML = "";
  }

  function renderKBDetail(e) {
    $("kbDetail").innerHTML = `
    <div class="card">
      <div class="card-h"><div><div class="eyebrow">Entry ${esc(e.id)}</div>
        <h3>${esc(e.title)}</h3></div>
        <span class="badge ${e.status === "有效" ? "b-ok" : e.status === "待复核" ? "b-warn" : "b-bad"}">${esc(e.status)}</span></div>
      <div class="grid g2">
        <div>
          <p style="font-size:13.2px;color:var(--ink-2);margin:0 0 12px">${esc(e.content)}</p>
          <dl class="kv">
            <dt>分类</dt><dd>${esc(e.cat)}</dd>
            <dt>来源</dt><dd>${esc(e.source)}</dd>
            <dt>来源类型</dt><dd>${esc(e.srcType)}</dd>
            <dt>资料版本</dt><dd>${esc(e.version)}</dd>
            <dt>资料日期</dt><dd>${esc(e.date)}</dd>
            <dt>主题标签</dt><dd>${(e.topics || []).map((t) => `<span class="badge b-info">${esc(t)}</span>`).join(" ")}</dd>
          </dl>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:7px">关键要点（评测「完整性」的判定依据）</div>
          <ul class="plain">${(e.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin:12px 0 7px">召回关键词</div>
          <div>${(e.keywords || []).map((k) => `<span class="badge b-mut" style="margin:0 4px 4px 0">${esc(k)}</span>`).join("")}</div>
        </div>
      </div>
    </div>`;
  }

  /* ================= 03 测试集 ================= */
  function renderTests() {
    const behText = (b) => b === "refuse" ? '<span class="badge b-warn">必须拒答</span>'
      : b === "flag" ? '<span class="badge b-gold">须带风险提示</span>'
      : '<span class="badge b-ok">正常作答</span>';
    $("view-tests").innerHTML = `
    <div class="card">
      <div class="card-h"><div><div class="eyebrow">Golden Test Set</div>
        <h3>标准测试集 ${esc(TS.meta.name)} ${esc(TS.meta.version)}（${TS.cases.length} 题）</h3></div>
        <span class="hint">每题写明「期望行为」，而不只是期望答案</span></div>
      <div class="note">${esc(TS.meta.principle)}</div>
    </div>
    <div class="card tight">
      <div class="tbl-wrap"><table>
        <thead><tr><th style="width:56px">题号</th><th style="width:104px">类型</th><th>问题</th>
          <th style="width:110px">期望行为</th><th style="width:120px">应引用条目</th></tr></thead>
        <tbody>${TS.cases.map((c) => `
          <tr data-q="${esc(c.id)}" style="cursor:pointer">
            <td class="mono" style="color:var(--accent)">${esc(c.id)}</td>
            <td><span class="badge b-mut">${esc(c.type)}</span></td>
            <td style="font-weight:600;color:var(--ink)">${esc(c.question)}</td>
            <td>${behText(c.expect.behavior)}${c.expect.warn ? `<div style="margin-top:4px"><span class="badge ${c.expect.warn === "conflict" ? "b-gold" : "b-bad"}">${c.expect.warn === "conflict" ? "冲突" : "过期"}</span></div>` : ""}</td>
            <td class="mono" style="font-size:11.6px">${c.expect.refs.length ? esc(c.expect.refs.join(" ")) : "—"}</td>
          </tr>`).join("")}</tbody>
      </table></div>
    </div>
    <div id="testDetail"></div>`;

    document.querySelector("#view-tests table").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-q]"); if (!tr) return;
      const c = TS.cases.find((x) => x.id === tr.dataset.q);
      if (c) renderTestDetail(c);
    });
  }

  function renderTestDetail(c) {
    $("testDetail").innerHTML = `
    <div class="card">
      <div class="card-h"><div><div class="eyebrow">Case ${esc(c.id)} · ${esc(c.type)}</div>
        <h3>${esc(c.question)}</h3></div>
        <span class="badge ${c.expect.behavior === "refuse" ? "b-warn" : c.expect.behavior === "flag" ? "b-gold" : "b-ok"}">
          期望：${c.expect.behavior === "refuse" ? "拒答" : c.expect.behavior === "flag" ? "带风险提示" : "作答"}</span></div>
      <div class="grid g2">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:7px">标准答案（人工标注）</div>
          <div class="note">${esc(c.gold)}</div>
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin:14px 0 7px">评分要点</div>
          <ul class="plain">${c.expect.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:7px">应引用知识条目</div>
          <div>${c.expect.refs.length ? c.expect.refs.map((r) => {
            const e = KB.entries.find((x) => x.id === r);
            return `<div class="evi"><div class="top"><span class="t"><span class="mono" style="color:var(--accent)">[${esc(r)}]</span> ${esc(e ? e.title : "")}</span></div>
              <div class="meta">${e ? esc(e.source) + "（" + esc(e.srcType) + "）· 版本 " + esc(e.version) + " · " + esc(e.date) : ""}</div></div>`;
          }).join("") : '<span class="hint">无（该题考察的是「不乱引用」，拒答即为正确）</span>'}</div>
          <div class="note warn" style="margin-top:10px">
            <b>这题的考察意图</b><br>
            ${c.type === "常见问题" ? "验证基础知识的检索与作答是否准确。"
              : c.type === "易混淆问题" ? "验证 Agent 能否区分容易混为一谈的概念，而不是含糊作答。"
              : c.type === "资料缺失" ? "验证 Agent 在缺少依据时敢不敢说「不知道」——这是幻觉的第一道防线。"
              : c.type === "过期资料" ? "验证 Agent 能否识别资料的版本时效，而不是把旧结论当成现结论。"
              : "用同一知识点的不同问法检验回答稳定性。"}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ================= 04 效果评测 ================= */
  let evalCache = {};

  function renderEval() {
    $("view-eval").innerHTML = `
    <div class="card">
      <div class="card-h"><div><div class="eyebrow">Evaluation</div>
        <h3>标准测试集自动评测</h3></div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn" id="runV1">运行 v1 评测</button>
          <button class="btn primary" id="runV2">运行 v2 评测</button>
          <button class="btn gold" id="runCmp">一键对比 v1 / v2</button>
        </div></div>
      <div class="note">
        评测在浏览器本地执行：把 ${TS.cases.length} 道题逐题送入检索与作答流程，再将输出与
        <b>人工标注的标准答案、期望行为、应引用条目</b>逐项比对。以下所有数字均由本次运行实时算出。
      </div>
    </div>
    <div id="evalOut"><div class="card tight"><div class="note warn">点击右上角按钮开始评测（v2 评测约需 1 秒）。</div></div></div>
    <div id="evalDetail"></div>`;

    $("runV1").addEventListener("click", () => { evalCache.v1 = engine.evaluate("v1"); paintEval("v1"); });
    $("runV2").addEventListener("click", () => { evalCache.v2 = engine.evaluate("v2"); paintEval("v2"); });
    $("runCmp").addEventListener("click", () => {
      $("evalOut").innerHTML = `<div class="card tight"><div class="hint"><span class="spin"></span>正在运行 ${TS.cases.length} 题 × 2 套策略 × 2 种检索配置…</div></div>`;
      setTimeout(() => {
        evalCache.v1 = engine.evaluate("v1");
        evalCache.v2 = engine.evaluate("v2");
        paintEval("cmp");
      }, 40);
    });
  }

  function metricCards(m, tone) {
    return METRIC_DEF.map((d) => {
      const v = m[d.key];
      const cls = d.key === "overall" ? "accent" : (v >= 0.85 ? "good" : v >= 0.6 ? "warn" : "bad");
      return `<div class="kpi ${cls}">
        <div class="lab">${esc(d.label)}</div>
        <div class="val" data-count="${(v * 100).toFixed(1)}" data-dec="1" data-suffix="%">${pct(v)}</div>
        <div class="desc">${esc(d.desc)}</div>
      </div>`;
    }).join("");
  }

  function paintEval(mode) {
    if (mode === "cmp" && evalCache.v1 && evalCache.v2) {
      const a = evalCache.v1.metrics, b = evalCache.v2.metrics;
      const deltaRow = (d) => {
        const dv = b[d.key] - a[d.key];
        const dir = dv > 0.0001 ? "up" : dv < -0.0001 ? "down" : "";
        return `<tr>
          <td style="font-weight:600">${esc(d.label)}</td>
          <td class="num">${pct(a[d.key])}</td>
          <td class="num">${pct(b[d.key])}</td>
          <td class="num"><span class="delta ${dir}">${dv >= 0 ? "+" : ""}${(dv * 100).toFixed(1)} pt</span></td>
          <td style="color:var(--muted);font-size:12.3px">${esc(d.desc)}</td>
        </tr>`;
      };
      const passA = evalCache.v1.results.filter((r) => r.passed).length;
      const passB = evalCache.v2.results.filter((r) => r.passed).length;

      const byTypeRows = Object.keys(evalCache.v2.byType).map((t) => {
        const x = evalCache.v1.byType[t] || { n: 0, pass: 0 };
        const y = evalCache.v2.byType[t];
        return `<tr><td>${esc(t)}</td>
          <td class="num">${x.pass}/${x.n}</td>
          <td class="num">${y.pass}/${y.n}</td>
          <td class="num"><span class="delta ${y.pass > x.pass ? "up" : ""}">${y.pass - x.pass >= 0 ? "+" : ""}${y.pass - x.pass}</span></td></tr>`;
      }).join("");

      $("evalOut").innerHTML = `
      <div class="card">
        <div class="card-h"><h3>v1 → v2 指标对比</h3>
          <span class="hint">完整验收：v1 ${evalCache.v1.passCount}/${TS.cases.length} → v2 ${evalCache.v2.passCount}/${TS.cases.length}　｜　
          内容通过（不含引用要求）：v1 ${evalCache.v1.passContentCount}/${TS.cases.length} → v2 ${evalCache.v2.passContentCount}/${TS.cases.length}</span></div>
        <div class="tbl-wrap"><table class="mtable">
          <thead><tr><th>指标</th><th style="width:96px">v1 初版</th><th style="width:96px">v2 优化</th>
            <th style="width:110px">变化</th><th>口径</th></tr></thead>
          <tbody>${METRIC_DEF.map(deltaRow).join("")}</tbody>
        </table></div>
        <div class="legend">
          <span><b>两级判定：</b>「内容通过」= 行为正确 且 要点覆盖≥50%；「完整验收」= 内容通过 且 依据可追溯。</span>
        </div>
      </div>

      <div class="grid g2">
        <div class="card tight">
          <div class="eyebrow">v1 · 初版策略</div>
          <div class="grid g2" style="margin-top:10px">${metricCards(evalCache.v1.metrics, "v1")}</div>
        </div>
        <div class="card tight">
          <div class="eyebrow">v2 · 优化策略</div>
          <div class="grid g2" style="margin-top:10px">${metricCards(evalCache.v2.metrics, "v2")}</div>
        </div>
      </div>

      <div class="grid g2">
        <div class="card tight">
          <div class="card-h"><h3>分类通过率变化</h3><span class="hint">完整验收口径</span></div>
          <div class="tbl-wrap"><table class="mtable">
            <thead><tr><th>题目类型</th><th style="width:80px">v1</th><th style="width:80px">v2</th><th style="width:64px">Δ</th></tr></thead>
            <tbody>${byTypeRows}</tbody></table></div>
        </div>
        <div class="card tight">
          <div class="card-h"><h3>v1 失败原因归因</h3><span class="hint">共 ${Object.values(evalCache.v1.causeAgg).reduce((s, x) => s + x, 0)} 处</span></div>
          ${Object.keys(evalCache.v1.causeAgg).length ? Object.keys(evalCache.v1.causeAgg).map((k) => `
            <div style="padding:8px 0;border-bottom:1px dashed var(--line-2);font-size:12.7px;color:var(--ink-2)">
              <b style="color:var(--bad)">${evalCache.v1.causeAgg[k]} 处</b>　${esc(k)}</div>`).join("")
          : '<div class="hint">无失败项</div>'}
        </div>
      </div>

      <div class="card tight">
        <div class="note">
          <b>结果解读（一）：v1 的「完整性」看着不差，但它 0 题通过完整验收</b><br>
          v1 会把最相似的一条资料原文直接抛出来——资料本身是对的，所以内容层面能过 16/24；
          但答案<b>没有任何来源标注、不会拒答、不会提示过期与冲突</b>，因此完整验收挂零。
          这正是真实项目里最容易犯的错：把「答得像」当成「答案可靠」。
        </div>
      </div>

      <div class="card tight">
        <div class="note warn">
          <b>结果解读（二）：v2 并不是全指标单调变好——稳定性反而从 ${pct(evalCache.v1.metrics.stability)} 掉到 ${pct(evalCache.v2.metrics.stability)}</b><br>
          原因很具体：v2 引入了拒答阈值，个别处在阈值边缘的问题（如「星魂和行迹有什么区别」）
          在换一种问法后可能从「作答」翻转为「拒答」。<b>提高准确性的代价是边界稳定性下降</b>，
          这是这一轮迭代暴露出的真实权衡，也是下一步要调阈值的依据——而不是一句「优化后全面提升」。
        </div>
      </div>`;

      $("evalDetail").innerHTML = renderCaseTable(evalCache.v2, evalCache.v1);
      enhance($("evalOut")); enhance($("evalDetail"));   // KPI 数字滚动 + 覆盖率条生长
      return;
    }

    const res = evalCache[mode];
    if (!res) { $("evalOut").innerHTML = `<div class="card tight"><div class="note warn">请先运行 ${mode} 评测。</div></div>`; return; }
    const pass = res.results.filter((r) => r.passed).length;
    const caus = Object.keys(res.causeAgg);
    $("evalOut").innerHTML = `
      <div class="card">
        <div class="card-h"><div><div class="eyebrow">${esc(engine.STRATEGIES[res.strategy].name)}</div>
          <h3>评测结果：通过 ${pass}/${TS.cases.length} 题</h3></div>
          <span class="hint">综合得分 ${pct(res.metrics.overall)}</span></div>
        <div class="grid g3">${metricCards(res.metrics)}</div>
      </div>
      ${caus.length ? `<div class="card tight"><div class="card-h"><h3>失败原因归因</h3></div>
        ${caus.map((k) => `<div style="padding:8px 0;border-bottom:1px dashed var(--line-2);font-size:12.7px;color:var(--ink-2)">
          <b style="color:var(--bad)">${res.causeAgg[k]} 处</b>　${esc(k)}</div>`).join("")}</div>` : ""}`;
    $("evalDetail").innerHTML = renderCaseTable(res, null);
    enhance($("evalOut")); enhance($("evalDetail"));
  }

  /* 要点覆盖率：数字 + 条形，条形按档位换色 */
  function covCell(v) {
    const n = Math.round(v * 100);
    const tone = n >= 85 ? "g" : n >= 60 ? "w" : "b";
    return `<div class="cov"><span class="n">${n}%</span>
      <div class="mbar ${tone}"><i data-w="${n}"></i></div></div>`;
  }

  function renderCaseTable(res, base) {
    const rows = res.results.map((r) => {
      const c = r.case;
      const mark = (ok) => ok ? '<span style="color:var(--ok);font-weight:700">✓</span>'
        : '<span style="color:var(--bad);font-weight:700">✗</span>';
      const warnBadge = r.flags.length
        ? r.flags.map((f) => `<span class="badge ${f.type === "conflict" ? "b-gold" : "b-warn"}">${f.type === "conflict" ? "冲突" : "过期"}</span>`).join(" ")
        : '<span class="hint">—</span>';
      const baseR = base ? base.results.find((x) => x.case.id === c.id) : null;
      const prog = baseR ? (baser(r, baseR)) : "";
      return `<tr>
        <td class="mono" style="color:var(--accent)">${esc(c.id)}</td>
        <td><span class="badge b-mut">${esc(c.type)}</span></td>
        <td style="font-weight:600;color:var(--ink);max-width:320px">${esc(c.question)}</td>
        <td class="num">${r.out.refused ? "拒答" : "作答"}</td>
        <td>${warnBadge}</td>
        <td class="num">${mark(r.behaviorOK)}</td>
        <td>${covCell(r.pointsCovered)}</td>
        <td class="num">${mark(r.traceOK)}</td>
        <td class="num">${mark(r.freshOK)}</td>
        <td>${r.passed ? '<span class="badge b-ok">完整通过</span>'
              : r.passedContent ? '<span class="badge b-warn">内容通过·不可追溯</span>'
              : '<span class="badge b-bad">未通过</span>'}</td>
        <td style="font-size:12.2px;color:var(--muted);max-width:280px">${prog}${esc(r.cause || "")}</td>
      </tr>`;
    }).join("");

    return `<div class="card">
      <div class="card-h"><h3>${base ? "逐题结果（v2，附与 v1 的差异）" : "逐题结果"}</h3>
        <span class="hint">点击下方表格行可在「错误分析与迭代」查看原始回答</span></div>
      <div class="tbl-wrap"><table class="mtable">
        <thead><tr><th style="width:54px">题号</th><th style="width:96px">类型</th><th>问题</th>
          <th style="width:56px">行为</th><th style="width:110px">风险提示</th>
          <th style="width:48px">准确性</th><th style="width:86px">完整性</th>
          <th style="width:56px">可追溯</th><th style="width:56px">时效性</th>
          <th style="width:70px">判定</th><th>归因</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="legend">
        <span><i class="dot" style="background:var(--ok)"></i>✓ 通过该项检查</span>
        <span><i class="dot" style="background:var(--bad)"></i>✗ 未通过该项检查</span>
        <span>准确性=行为是否符合预期；完整性=要点覆盖；可追溯=是否标注来源；时效性=是否引用过期资料</span>
      </div>
    </div>`;
  }

  function baser(cur, base) {
    if (base.passed === cur.passed) return "";
    return base.passed
      ? '<span class="badge b-bad" style="margin-right:6px">v1 反而通过</span>'
      : '<span class="badge b-ok" style="margin-right:6px">v1 未通过 → 已修复</span>';
  }

  /* ================= 05 错误分析与迭代 ================= */
  const FOCUS = [
    { id: "Q16", title: "未来版本问题：把「无依据」答成了「有依据」", tag: "拒答缺失" },
    { id: "Q17", title: "跨游戏问题：用相近概念强行迁移作答", tag: "范围越界" },
    { id: "Q04", title: "保底抽数：面对冲突资料没有做来源取舍", tag: "资料冲突" },
    { id: "Q20", title: "过期配队：把 3.0 的结论当成当前结论", tag: "资料过期" },
    { id: "Q10", title: "易混概念：没有把两个体系分清就作答", tag: "答案结构" }
  ];

  function renderIter() {
    const v1 = engine.evaluate("v1"), v2 = engine.evaluate("v2");
    evalCache.v1 = v1; evalCache.v2 = v2;

    const cases = FOCUS.map((f) => {
      const c = TS.cases.find((x) => x.id === f.id);
      const r1 = v1.results.find((x) => x.case.id === f.id);
      const r2 = v2.results.find((x) => x.case.id === f.id);
      return { f, c, r1, r2 };
    });

    const iterLog = [
      { v: "v0.1", date: "10-08", title: "搭起最小可用问答", desc: "手写 12 条机制条目，关键词匹配检索，直接输出最相似条目正文。", issue: "答得出来，但无法判断答得对不对" },
      { v: "v0.2", date: "10-10", title: "建立知识库结构", desc: "条目补齐到 30 条，增加来源、版本、日期字段；检索改为 BM25，加子查询覆盖率。", issue: "发现同一问题常召回来源冲突的多条资料，无法取舍" },
      { v: "v0.3", date: "10-12", title: "构建标准测试集", desc: "按「常见／易混淆／缺失／过期／推理」五类设计 24 题，逐题写定期望行为与评分要点。", issue: "测试集一跑，v1 策略在「拒答」与「提示」两类上几乎全灭" },
      { v: "v1", date: "10-13", title: "定版 v1 策略（对照基线）", desc: "不引用、不拒答、无时效过滤，作为对照基线保留。", issue: "60% 左右的题能答对内容，但答案不可核查" },
      { v: "v2", date: "10-15", title: "优化策略与知识库同步升级", desc: "补边界／冲突样本条目；提示词强制引用、设拒答阈值、多来源冲突取舍、过期资料提示。", issue: "目标：把「答得像」变成「答案可靠」" }
    ];

    $("view-iter").innerHTML = `
    <div class="card">
      <div class="card-h"><div><div class="eyebrow">Error Analysis &amp; Iteration</div>
        <h3>错误案例与迭代复测</h3></div>
        <span class="hint">下面每一组对比都是本次实时运行的输出，不是示意稿</span></div>
      <div class="note gold">
        <b>这一页是整个项目最想说明的事</b>：AI 应用的差距往往不在「能不能答」，而在
        <b>答错的时候系统自己知不知道</b>。下面 5 组案例覆盖了资料缺失、范围越界、来源冲突、
        资料过期与概念混淆——它们不是被藏起来的失败，而是被记录、归因、然后修掉的证据。
      </div>
    </div>

    ${cases.map(({ f, c, r1, r2 }) => `
    <div class="card">
      <div class="card-h">
        <div><div class="eyebrow">${esc(f.id)} · ${esc(f.tag)}</div><h3>${esc(f.title)}</h3></div>
        <div style="display:flex;gap:7px">
          <span class="badge ${r1.passed ? "b-ok" : "b-bad"}">v1 ${r1.passed ? "通过" : "未通过"}</span>
          <span class="badge ${r2.passed ? "b-ok" : "b-bad"}">v2 ${r2.passed ? "通过" : "未通过"}</span>
        </div>
      </div>
      <div style="font-size:13.4px;font-weight:600;margin-bottom:11px">问：${esc(c.question)}</div>
      <div class="cmp">
        <div class="cmp-col v1"><div class="hd"><span>v1 初版策略</span><span>${r1.out.refused ? "拒答" : "作答"}</span></div>
          <div class="bd">${esc(r1.out.display || r1.out.text)}</div></div>
        <div class="cmp-col v2"><div class="hd"><span>v2 优化策略</span><span>${r2.out.refused ? "拒答" : "作答"}</span></div>
          <div class="bd">${esc(r2.out.display || r2.out.text)}</div></div>
      </div>
      <div class="grid g2" style="margin-top:12px">
        <div class="note warn"><b>v1 问题归因</b><br>${esc(r1.cause || "（该题 v1 亦通过）")}</div>
        <div class="note"><b>修复动作</b><br>${esc(fixOf(r1, r2))}</div>
      </div>
    </div>`).join("")}

    <div class="card">
      <div class="eyebrow">Iteration Log</div>
      <div class="card-h"><h3>迭代记录</h3><span class="hint">从「能答」到「可靠」的五个版本</span></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th style="width:64px">版本</th><th style="width:64px">日期</th><th style="width:210px">做了什么</th>
          <th>具体内容</th><th style="width:250px">暴露出的问题</th></tr></thead>
        <tbody>${iterLog.map((l) => `
          <tr><td class="mono" style="color:var(--accent);font-weight:700">${esc(l.v)}</td>
            <td class="mono">${esc(l.date)}</td>
            <td style="font-weight:600;color:var(--ink)">${esc(l.title)}</td>
            <td style="font-size:12.6px;color:var(--ink-2)">${esc(l.desc)}</td>
            <td style="font-size:12.5px;color:var(--muted)">${esc(l.issue)}</td></tr>`).join("")}
        </tbody></table></div>
    </div>

    <div class="grid g2">
      <div class="card tight">
        <div class="eyebrow">Method</div>
        <h3 style="font-size:14.5px;margin-bottom:9px">可复用的评测方法</h3>
        <ul class="plain">
          <li><b>测试集先于优化</b>：先定义「什么叫答对」，再谈调优，否则优化没有方向</li>
          <li><b>期望行为 ≠ 期望答案</b>：拒答、提示过期、提示冲突，本身就是正确输出</li>
          <li><b>指标要能归因</b>：把失败映射到知识库 / 提示词 / 检索三类原因，才改得动</li>
          <li><b>稳定性单独测</b>：同一问题换说法或换检索参数，结论应当一致</li>
          <li><b>保留基线</b>：v1 不删，才说得清每一分提升来自哪里</li>
        </ul>
      </div>
      <div class="card tight">
        <div class="eyebrow">Limitations</div>
        <h3 style="font-size:14.5px;margin-bottom:9px">已知局限与下一步</h3>
        <ul class="plain">
          <li><b>当前为离线确定性引擎</b>：检索与作答逻辑真实运行，但未接入真实 LLM；接入后需增加「同一问题多次采样」的稳定性评测</li>
          <li><b>知识库为个人快照</b>：覆盖机制与少量角色，未覆盖全角色、全版本活动与剧情</li>
          <li><b>评分依赖关键词与要点覆盖</b>：语义等价但措辞差异大的回答可能被低估，后续可引入 LLM-as-judge 做二次校验</li>
          <li><b>下一步</b>：接入真实 RAG + 向量检索，补充「知识库更新后的回归测试」与「人工复核队列」</li>
        </ul>
      </div>
    </div>`;

    const tbl = document.querySelector("#view-iter table");
    if (tbl) tbl.addEventListener("click", () => {});
  }

  function fixOf(r1, r2) {
    if (r1.passed) return "该题 v1 已通过，v2 保持同等表现，未引入回退。";
    if (r1.out.refused !== r2.out.refused && r2.out.refused) {
      return "在知识库中补充「范围边界」类条目，并在提示词中加入拒答阈值规则：当检索覆盖率不足或问题超出覆盖范围时，明确说明「知识库未收录」并给出获取准确信息的建议渠道。";
    }
    if (r2.flags && r2.flags.some((f) => f.type === "conflict")) {
      return "保留冲突样本条目，并在提示词中要求「来源类型＝官方且版本最新者优先」，同时把冲突以风险提示的形式显式输出，而不是静默取一条。";
    }
    if (r2.flags && r2.flags.some((f) => f.type === "stale")) {
      return "为条目补上版本号与状态标记（有效／待复核／已过期），提示词中增加时效规则：命中已过期资料时必须提示其版本并说明不可直接套用。";
    }
    if (r2.out.citations.length && !r1.out.citations.length) {
      return "提示词由「直接回答」改为结构化输出：结论 → 依据（每条标注 [KB-xx] 与来源/版本）→ 风险提示 → 来源汇总，使答案可回溯。";
    }
    return "调整检索参数与答案结构，提高要点覆盖与引用完整度。";
  }

  /* ================= 启动 ================= */
  initScrollProgress(); initStars(); initHeroParallax();
  renderHero(); renderTabs(); renderOverview(); renderAsk(); renderKB(); renderTests(); renderEval();
  renderIter();           // 内部已完成 v1 / v2 各一次评测
  paintEval("cmp");       // 首屏直接展示对比结果
  enhance($("view-overview"));

  // 字体与布局稳定后再量一次指示器位置（字体换行会影响 tab / 分段控件宽度）
  const resync = () => { syncTabPill(false); syncSegPill(false); };
  requestAnimationFrame(resync);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resync).catch(() => {});
  window.addEventListener("load", resync);

  const hash = (location.hash || "").replace("#", "");
  if (hash && TABS.some((t) => t.id === hash)) {
    activateTab(hash);
    if (hash === "ask") doAsk("击破伤害主要受什么属性影响？");
  }
})();

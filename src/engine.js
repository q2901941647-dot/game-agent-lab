/* ============================================================
 * Game Agent Lab · 问答与评测引擎
 * ------------------------------------------------------------
 * 本引擎完全离线运行，不调用任何外部大模型。
 * 「检索增强问答」由真实实现的 BM25 检索 + 策略化答案合成完成，
 * 因此所有评测指标都可复现、可核查。
 *
 * 两套策略（用于迭代前后对比）
 *  v1 初版策略：知识库尚未覆盖范围边界与冲突样本，无引用、无拒答阈值、
 *              无时效标记 → 「什么都能答，但答案不可核查」
 *  v2 优化策略：补齐边界/冲突/过期条目 + 强制引用 + 拒答阈值 + 时效过滤
 *              + 多来源冲突提示
 * ============================================================ */

(function () {
  "use strict";

  /* ---------------- 1. 中文友好分词 ---------------- */
  const STOP = new Set(["的", "了", "是", "在", "有", "和", "与", "吗", "呢", "啊", "我", "你",
    "怎么", "什么", "如何", "哪些", "哪个", "多少", "这个", "那个", "一下", "可以", "需要",
    "要", "会", "能", "把", "被", "给", "对", "为", "就", "都", "也", "还", "但", "而", "用"]);

  function tokenize(text) {
    const s = String(text || "").toLowerCase();
    const tokens = [];
    (s.match(/[a-z0-9]+/g) || []).forEach((w) => { if (w.length > 1) tokens.push(w); });
    (s.match(/[\u4e00-\u9fa5]+/g) || []).forEach((run) => {
      for (let i = 0; i < run.length; i++) {
        tokens.push(run[i]);
        if (i + 1 < run.length) tokens.push(run.slice(i, i + 2));
      }
    });
    return tokens.filter((t) => t.length > 0);
  }

  function queryTerms(text) {
    return tokenize(text).filter((t) => !STOP.has(t));
  }

  function bigrams(text) {
    const s = String(text || "").toLowerCase().replace(/[\s\p{P}]+/gu, "");
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (i + 1 < s.length) out.push(s.slice(i, i + 2));
      else out.push(s[i]);
    }
    return out;
  }

  function overlapRatio(needle, haystack) {
    const a = bigrams(needle);
    const b = new Set(bigrams(haystack));
    if (a.length === 0) return 0;
    let hit = 0;
    a.forEach((g) => { if (b.has(g)) hit += 1; });
    return hit / a.length;
  }

  /* ---------------- 2. 索引与 BM25 ---------------- */
  const FIELD_WEIGHT = { title: 3.0, keywords: 2.6, topics: 1.6, content: 1.0, points: 1.2 };

  function buildIndex(entries) {
    const docs = [];
    const df = Object.create(null);
    entries.forEach((e) => {
      const wf = Object.create(null);
      const add = (txt, w) => { tokenize(txt).forEach((t) => { wf[t] = (wf[t] || 0) + w; }); };
      add(e.title, FIELD_WEIGHT.title);
      add((e.keywords || []).join(" "), FIELD_WEIGHT.keywords);
      add((e.topics || []).join(" "), FIELD_WEIGHT.topics);
      add(e.content, FIELD_WEIGHT.content);
      add((e.points || []).join(" "), FIELD_WEIGHT.points);
      let len = 0;
      Object.keys(wf).forEach((t) => { len += wf[t]; });
      docs.push({ id: e.id, wf, len });
      Object.keys(wf).forEach((t) => { df[t] = (df[t] || 0) + 1; });
    });
    const N = docs.length;
    let avgLen = 0;
    docs.forEach((d) => { avgLen += d.len; });
    avgLen = avgLen / Math.max(N, 1);
    const idf = Object.create(null);
    Object.keys(df).forEach((t) => { idf[t] = Math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5)); });
    return { docs, idf, avgLen, N, docById: docs.reduce((m, d) => (m[d.id] = d, m), Object.create(null)) };
  }

  const K1 = 1.5, B = 0.72;

  function scoreDoc(doc, terms, idf, avgLen) {
    let score = 0;
    terms.forEach((t) => {
      const tf = doc.wf[t];
      if (!tf) return;
      const w = idf[t] || Math.log(2);
      score += w * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.len / avgLen)));
    });
    return score;
  }

  /* ---------------- 3. 策略定义 ---------------- */
  const STRATEGIES = {
    v1: {
      key: "v1", name: "v1 · 初版策略",
      note: "知识库尚未建立范围边界与冲突样本；无引用、无拒答阈值、无时效标记。",
      topK: 3,
      excludeCats: ["边界样本", "冲突样本"],
      useFreshness: false,
      emitCitations: false,
      refuseThreshold: 0,
      refuseMinScore: 0,
      warnConflict: false,
      warnStale: false,
      structured: false,
      prompt: [
        "你是一个游戏问答助手。用户会提出关于《崩坏：星穹铁道》的问题。",
        "请从下面提供的资料中找出相关内容并回答用户。",
        "",
        "【资料】",
        "{{CONTEXT}}",
        "",
        "【用户问题】{{QUESTION}}",
        "",
        "【要求】直接回答，语言简洁。"
      ].join("\n")
    },
    v2: {
      key: "v2", name: "v2 · 优化策略",
      note: "补齐边界/冲突/过期条目；强制引用来源、设置拒答阈值、过滤过期资料、提示资料冲突。",
      topK: 5,
      excludeCats: [],
      useFreshness: true,
      emitCitations: true,
      refuseThreshold: 0.20,     // 覆盖率兜底阈值
      refuseMinScore: 25,        // 检索置信度下限（在自建知识库上校准，低于此值视为无依据）
      warnConflict: true,
      warnStale: true,
      structured: true,
      prompt: [
        "你是《崩坏：星穹铁道》的知识库问答 Agent。你的回答必须完全基于检索到的资料，不得引入资料之外的记忆。",
        "",
        "【执行规则】",
        "1. 只依据下方资料作答；资料未覆盖的内容一律不推测。",
        "2. 每条结论后必须标注引用编号，格式 [KB-xx]。",
        "3. 若资料之间存在冲突：优先采用「来源类型＝官方」且版本最新的条目，并明确提示存在冲突说法。",
        "4. 若命中的资料 status＝已过期：必须提示该资料版本，并说明不能直接套用到当前版本。",
        "5. 若检索覆盖率低于阈值，或问题超出知识库覆盖范围（其他游戏／未来版本／不存在的内容）：",
        "   必须拒答，说明「知识库未收录」，并给出获取准确信息的建议渠道。",
        "6. 禁止用相近概念迁移作答（例如用「遗器」回答「驱动盘」的问题）。",
        "",
        "【输出结构】",
        "结论 → 依据（分条，含 [KB-xx] 与来源/版本）→ 风险提示（如有）→ 来源汇总",
        "",
        "【资料】",
        "{{CONTEXT}}",
        "",
        "【用户问题】{{QUESTION}}"
      ].join("\n")
    }
  };

  /* ---------------- 4. 检索 ---------------- */
  function makeRetriever(kb) {
    const index = buildIndex(kb.entries);
    const byId = Object.create(null);
    kb.entries.forEach((e) => { byId[e.id] = e; });

    function retrieve(question, strategy, opts) {
      opts = opts || {};
      let terms = Array.from(new Set(queryTerms(question)));

      // 扰动：去掉权重最高的查询词，模拟「换一种说法问同一件事」
      if (opts.perturb && terms.length > 1) {
        let maxT = terms[0], maxW = -1;
        terms.forEach((t) => { const w = index.idf[t] || 0; if (w > maxW) { maxW = w; maxT = t; } });
        terms = terms.filter((t) => t !== maxT);
      }

      const pool = index.docs.filter((d) => !strategy.excludeCats.includes(byId[d.id].cat));
      const scored = pool.map((d) => {
        const e = byId[d.id];
        let s = scoreDoc(d, terms, index.idf, index.avgLen);
        if (strategy.useFreshness) {
          if (e.srcType === "官方") s *= 1.18;
          if (e.status === "待复核") s *= 0.94;
        }
        return { entry: e, score: s };
      }).filter((r) => r.score > 0);
      scored.sort((a, b) => b.score - a.score);

      // 检索覆盖率：命中词权重 / 查询词权重（基于 top-1 命中条目）
      let totW = 0, hitW = 0;
      const top = scored[0];
      const topDoc = top ? index.docById[top.entry.id] : null;
      Array.from(new Set(queryTerms(question))).forEach((t) => {
        const w = index.idf[t] || Math.log(2);
        totW += w;
        if (topDoc && topDoc.wf[t]) hitW += w;
      });
      const coverage = totW > 0 ? hitW / totW : 0;

      return {
        results: scored.slice(0, strategy.topK),
        coverage,
        qTerms: terms,
        totalHits: scored.length,
        topScore: top ? top.score : 0,
        topEntryId: top ? top.entry.id : null
      };
    }
    return { retrieve, byId, index };
  }

  /* ---------------- 5. 风险识别 ---------------- */
  function detectWarnings(usedEntries, strategy) {
    const flags = [];
    const core = usedEntries;
    if (strategy.warnStale) {
      const stale = core.filter((e) => e.status === "已过期");
      if (stale.length) {
        flags.push({
          type: "stale",
          text: "检索到的资料中 " + stale.map((e) => e.id + "（" + e.version + " 版本）").join("、") +
                " 已被标记为过期，仅适用于当时版本，不能直接套用到当前 4.6 版本，请以当期官方信息为准。"
        });
      }
    }
    if (strategy.warnConflict) {
      const conflictSamples = core.filter((e) => e.cat === "冲突样本");
      conflictSamples.forEach((cs) => {
        const official = usedEntries.filter((e) =>
          e.id !== cs.id && e.srcType === "官方" && (e.topics || []).some((t) => (cs.topics || []).indexOf(t) >= 0));
        if (official.length) {
          flags.push({
            type: "conflict",
            text: "关于「" + cs.topics.join("、") + "」存在互相冲突的资料：" +
                  cs.id + "（" + cs.srcType + "）的说法与 " +
                  official.map((e) => e.id + "（官方）").join("、") +
                  " 不一致。此处按「来源类型＝官方」优先取值，并保留冲突记录备查。"
          });
        }
      });
    }
    return flags;
  }

  /* ---------------- 6. 答案合成 ---------------- */
  function composeAnswer(question, ret, strategy) {
    const entries = ret.results.map((r) => r.entry);

    let refused = false, refuseReason = "";
    if (strategy.refuseThreshold > 0) {
      const boundary = entries[0] && entries[0].cat === "边界样本";
      if (boundary) {
        refused = true;
        refuseReason = entries[0].id === "KB-X04"
          ? "该问题涉及未来版本或未公开内容，知识库快照截至 4.6 版本，没有可靠依据，不作推测。"
          : "该问题超出了本知识库的覆盖范围（本知识库仅覆盖《崩坏：星穹铁道》，不覆盖其他游戏或其他游戏的对应系统）。";
      } else if (ret.coverage < strategy.refuseThreshold ||
                 (strategy.refuseMinScore > 0 && ret.topScore < strategy.refuseMinScore) ||
                 entries.length === 0) {
        refused = true;
        refuseReason = "知识库中未收录可以支撑该问题的资料（检索置信度低于校准阈值），为避免给出不可核查的答案，这里不作推测。";
      }
    }

    if (refused) {
      const text = strategy.structured
        ? "【结论】无法依据现有知识库回答该问题。\n【说明】" + refuseReason +
          "\n【建议】请以官方公告、版本更新说明或游戏内说明为准，并可在知识库补充相应资料后重新询问。"
        : "抱歉，这个问题我暂时没有找到相关资料。";
      const cite = strategy.emitCitations && entries.length && entries[0].cat === "边界样本" ? [entries[0].id] : [];
      return { text, display: text, refused: true, citations: cite, flags: [], used: cite.slice(), coverage: ret.coverage, topEntryId: ret.topEntryId };
    }

    const useN = strategy.structured ? 3 : 2;
    const usedEntries = entries.slice(0, useN);
    const flags = detectWarnings(usedEntries, strategy);
    const citations = strategy.emitCitations ? usedEntries.map((e) => e.id) : [];

    if (!strategy.structured) {
      const full = usedEntries.map((e) => e.content).join("\n");
      const clip = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
      return {
        text: full,
        display: usedEntries.map((e) => clip(e.content, 230)).join("\n\n") +
                 (full.length > 460 ? "\n\n（v1 直接输出最相似资料原文，未做结构化拆分）" : ""),
        refused: false, citations: [], flags: [],
        used: usedEntries.map((e) => e.id), coverage: ret.coverage, topEntryId: ret.topEntryId
      };
    }

    const lines = [];
    lines.push("【结论】" + entries[0].points[0] + "。");
    lines.push("");
    lines.push("【依据】");
    usedEntries.forEach((e, i) => {
      const pts = e.points.slice(0, i === 0 ? 7 : 4).map((p) => "  · " + p).join("\n");
      lines.push("· " + e.title + " [" + e.id + "]");
      lines.push(pts);
      lines.push("  （来源：" + e.source + "｜" + e.srcType + "｜版本 " + e.version + "｜" + e.date +
                 (e.status !== "有效" ? "｜状态 " + e.status : "") + "）");
    });
    if (flags.length) {
      lines.push("");
      lines.push("【风险提示】");
      flags.forEach((f) => lines.push("  ⚠ " + f.text));
    }
    lines.push("");
    lines.push("【来源汇总】" + usedEntries.map((e) => e.id + "（" + e.source + "）").join("；"));
    const text = lines.join("\n");
    return {
      text, display: text, refused: false, citations, flags,
      used: usedEntries.map((e) => e.id), coverage: ret.coverage, topEntryId: ret.topEntryId
    };
  }

  /* ---------------- 7. 单题评测 ---------------- */
  function behaviorOf(out) {
    if (out.refused) return "refuse";
    if (out.flags && out.flags.length) return "flag:" + out.flags.map((f) => f.type).sort().join("+");
    return "answer";
  }

  function runCase(c, strategy, retriever, opts) {
    opts = opts || {};
    const ret = retriever.retrieve(c.question, strategy, opts);
    const out = composeAnswer(c.question, ret, strategy);
    const exp = c.expect;

    const actualBehavior = behaviorOf(out);

    let behaviorOK;
    if (exp.behavior === "refuse") behaviorOK = out.refused;
    else if (exp.behavior === "flag") behaviorOK = !out.refused && !!out.flags.find((f) => f.type === exp.warn);
    else behaviorOK = !out.refused;

    // 评分文本 = 答案正文 + 风险提示（风险提示同样是模型输出的一部分）
    const matchText = out.text + "\n" + (out.flags || []).map((f) => f.text).join("\n");

    let pointsCovered;
    if (exp.behavior === "refuse" && out.refused) {
      pointsCovered = 1; // 正确拒答即视为满足该题要点
    } else if (exp.points.length === 0) {
      pointsCovered = out.refused ? 1 : 0;
    } else {
      pointsCovered = exp.points.filter((p) => overlapRatio(p, matchText) >= 0.5).length / exp.points.length;
    }

    const refsHit = exp.refs.filter((r) => out.citations.includes(r));
    const refsOK = exp.refs.length === 0 ? true : refsHit.length > 0;

    const traceOK = out.refused ? out.citations.length > 0 : out.citations.length > 0;

    // 时效性：只要没有把过期资料「当作有效结论」直接使用即算合格。
    // 若引用了过期资料、但同时给出了过期提示，则属于正确处理，不扣分。
    const usedStale = out.used.some((id) => retriever.byId[id] && retriever.byId[id].status === "已过期");
    const warnedStale = (out.flags || []).some((f) => f.type === "stale");
    const freshOK = out.refused ? true : (!usedStale || warnedStale);

    // 两级判定：内容通过（不看引用） vs 完整验收（内容 + 依据可追溯）
    const passedContent = behaviorOK && pointsCovered >= 0.5;
    const passed = passedContent && refsOK;

    let cause = "";
    if (!behaviorOK) {
      if (exp.behavior === "refuse") cause = "未拒答：知识库缺少范围边界条目／提示词未设置拒答阈值";
      else if (exp.warn === "conflict") cause = "未提示冲突：缺少冲突样本条目／未做多来源交叉校验";
      else if (exp.warn === "stale") cause = "未提示过期：未维护版本时效标记／未做时效过滤";
      else cause = "行为与预期不符";
    } else if (pointsCovered < 0.5) {
      cause = exp.reasoning
        ? "跨条目推理缺失：当前引擎只做条目召回与拼装，无法生成对比/推导结论"
        : "要点覆盖不足：检索召回不足或答案未结构化拆分要点";
    } else if (!refsOK) {
      cause = "引用缺失：提示词未要求标注来源，答案不可回溯";
    }

    return {
      case: c, out, ret, actualBehavior, behaviorOK, pointsCovered,
      refsOK, refsHit, traceOK, freshOK, passed, passedContent, cause, flags: out.flags || []
    };
  }

  /* ---------------- 8. 整套评测 ---------------- */
  function evaluate(strategy, retriever, cases) {
    const results = cases.map((c) => runCase(c, strategy, retriever));

    const acc = results.filter((r) => r.behaviorOK).length / results.length;
    const comp = results.reduce((s, r) => s + r.pointsCovered, 0) / results.length;
    const trace = results.filter((r) => r.traceOK).length / results.length;
    const fresh = results.filter((r) => r.freshOK).length / results.length;

    // 稳定性：换一种问法（去掉权重最高的查询词）后，行为与首要依据条目是否一致
    const stabilityRuns = cases.map((c) => {
      const a = runCase(c, strategy, retriever);
      const b = runCase(c, strategy, retriever, { perturb: true });
      const sameBehavior = behaviorOf(a.out) === behaviorOf(b.out);
      const sameTop = (a.out.topEntryId || "-") === (b.out.topEntryId || "-");
      return { id: c.id, consistent: sameBehavior && sameTop,
               a: behaviorOf(a.out), b: behaviorOf(b.out),
               aTop: a.out.topEntryId, bTop: b.out.topEntryId };
    });
    const stab = stabilityRuns.filter((r) => r.consistent).length / stabilityRuns.length;

    const metrics = { accuracy: acc, completeness: comp, traceability: trace, freshness: fresh, stability: stab };
    metrics.overall = acc * 0.35 + comp * 0.20 + trace * 0.15 + fresh * 0.15 + stab * 0.15;

    const byType = {};
    results.forEach((r) => {
      const t = r.case.type;
      byType[t] = byType[t] || { n: 0, pass: 0, passContent: 0 };
      byType[t].n += 1;
      if (r.passed) byType[t].pass += 1;
      if (r.passedContent) byType[t].passContent += 1;
    });

    const causeAgg = {};
    results.filter((r) => !r.passed).forEach((r) => {
      const key = r.cause || "其他";
      causeAgg[key] = (causeAgg[key] || 0) + 1;
    });

    return {
      strategy: strategy.key, results, metrics, byType, causeAgg, stabilityRuns,
      passCount: results.filter((r) => r.passed).length,
      passContentCount: results.filter((r) => r.passedContent).length,
      total: results.length
    };
  }

  /* ---------------- 9. 对外接口 ---------------- */
  function createEngine(kb, testset) {
    const retriever = makeRetriever(kb);
    return {
      kb, testset, retriever, STRATEGIES, FIELD_WEIGHT,
      ask(question, strategyKey) {
        const st = STRATEGIES[strategyKey] || STRATEGIES.v2;
        const ret = retriever.retrieve(question, st);
        const out = composeAnswer(question, ret, st);
        return Object.assign({ retrieved: ret, strategy: st }, out);
      },
      evaluate(strategyKey) {
        const st = STRATEGIES[strategyKey] || STRATEGIES.v2;
        return evaluate(st, retriever, testset.cases);
      },
      tokenize, queryTerms
    };
  }

  window.ENGINE = { createEngine, STRATEGIES, tokenize, overlapRatio, bigrams };
})();

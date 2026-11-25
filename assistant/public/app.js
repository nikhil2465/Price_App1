// PriceWise assistant demo client. Vanilla JS, no dependencies.
// Conversation state lives here (the server is stateless). All model output is
// escaped before rendering; only a small markdown subset is turned into HTML.
"use strict";

(() => {
  const ENDPOINT = "/api/assistant/chat";
  const MAX_HISTORY = 24;

  const log = document.getElementById("log");
  const form = document.getElementById("composer");
  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const statusEl = document.getElementById("status");
  const statusText = document.getElementById("status-text");
  const suggestions = document.getElementById("suggestions");
  const newChat = document.getElementById("new-chat");

  /** @type {{role: "user"|"assistant", content: string}[]} */
  let history = [];
  let controller = null;

  const STORE_NAMES = {
    amazon: "Amazon", flipkart: "Flipkart", croma: "Croma", "reliance-digital": "Reliance Digital",
    "vijay-sales": "Vijay Sales", "tata-cliq": "Tata CLiQ", myntra: "Myntra", ajio: "AJIO", nykaa: "Nykaa",
  };
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

  // ---------- Safe markdown (escape first, then a minimal subset) ----------
  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function inline(s) {
    let out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    out = out.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?;:)])/g, "$1<em>$2</em>");
    // Links: only http(s), never javascript:/data:. URL text is already escaped.
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) =>
      url.includes("example.invalid") ? label : `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`,
    );
    return out;
  }

  function renderMarkdown(md) {
    const lines = md.replace(/\r/g, "").split("\n");
    const html = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        const row = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const head = row(line);
        i += 2;
        const body = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
        html.push(
          `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead><tbody>` +
            body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
            "</tbody></table></div>",
        );
        continue;
      }
      if (/^\s*[-*•]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ""));
        html.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
        html.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
        continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(line);
      if (h) {
        html.push(`<h4>${inline(h[2])}</h4>`);
        i++;
        continue;
      }
      if (line.trim() === "") {
        i++;
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() !== "" && !/^\s*([-*•]|\d+[.)])\s+|^#{1,4}\s|^\s*\|/.test(lines[i])) para.push(lines[i++]);
      if (para.length === 0) para.push(lines[i++]);
      html.push(`<p>${para.map(inline).join("<br />")}</p>`);
    }
    return html.join("");
  }

  // ---------- UI helpers ----------
  function addMessage(role, textContent) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "user") bubble.textContent = textContent;
    else bubble.innerHTML = renderMarkdown(textContent);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    scrollDown();
    return bubble;
  }

  /** One card strip per answer; later tool rounds update cards by product id instead of duplicating them. */
  function renderCards(turn, items) {
    for (const it of items) turn.cards.set(it.id, it);
    if (!turn.cardRow) {
      turn.cardRow = document.createElement("div");
      turn.cardRow.className = "cards";
      turn.cardRow.setAttribute("aria-label", "Products mentioned");
      log.appendChild(turn.cardRow);
    }
    turn.cardRow.replaceChildren(...[...turn.cards.values()].slice(0, 8).map(buildCard));
    scrollDown();
  }

  function buildCard(it) {
    const c = document.createElement("article");
    c.className = "card";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = it.title;
    title.title = it.title;
    const price = document.createElement("div");
    price.className = "price";
    price.textContent = inr.format(it.bestPrice);
    const note = document.createElement("div");
    note.className = "meta";
    note.textContent = `Best on ${STORE_NAMES[it.bestMarketplaceId] ?? it.bestMarketplaceId}, incl. best bank offer`;
    const meta = document.createElement("div");
    meta.className = "meta";
    const stores = document.createElement("span");
    stores.textContent = `${it.storeCount} store${it.storeCount === 1 ? "" : "s"}`;
    const rating = document.createElement("span");
    rating.textContent = `★ ${Number(it.rating).toFixed(1)}`;
    meta.append(stores, rating);
    if (it.dataSource === "sample") {
      const b = document.createElement("span");
      b.className = "badge sample";
      b.textContent = "Sample data";
      meta.appendChild(b);
    }
    c.append(title, price, note, meta);
    return c;
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function setBusy(busy, text) {
    send.disabled = busy;
    statusEl.hidden = !busy;
    if (text) statusText.textContent = text;
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  // ---------- Streaming ----------
  async function ask(question) {
    if (controller) return;
    const q = question.trim();
    if (!q) return;
    suggestions.hidden = true;
    addMessage("user", q);
    history.push({ role: "user", content: q });
    history = history.slice(-MAX_HISTORY);

    let answer = "";
    let bubble = null;
    const turn = { cards: new Map(), cardRow: null };
    let renderQueued = false;
    const render = () => {
      renderQueued = false;
      if (!bubble) bubble = addMessage("assistant", "");
      bubble.innerHTML = renderMarkdown(answer);
      bubble.classList.add("cursor");
      scrollDown();
    };

    controller = new AbortController();
    setBusy(true, "Thinking");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let message = `Request failed (${res.status}).`;
        try {
          const body = await res.json();
          if (body?.error?.message) message = body.error.message;
        } catch { /* keep default */ }
        throw new Error(message);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const data = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
          if (!data) continue;
          let ev;
          try { ev = JSON.parse(data); } catch { continue; }
          if (ev.type === "text") {
            answer += ev.delta;
            setBusy(true, "Writing");
            if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
          } else if (ev.type === "status") {
            setBusy(true, ev.message);
          } else if (ev.type === "products" && Array.isArray(ev.items) && ev.items.length) {
            renderCards(turn, ev.items);
          } else if (ev.type === "error") {
            throw new Error(ev.message || "Something went wrong.");
          } else if (ev.type === "done") {
            finished = true;
          }
        }
      }
      if (answer) render();
      bubble?.classList.remove("cursor");
      if (answer.trim()) history.push({ role: "assistant", content: answer });
      else if (history.at(-1)?.role === "user") history.pop();
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (bubble) bubble.classList.remove("cursor");
      const e = addMessage("assistant", err?.message || "Something went wrong. Please try again.");
      e.classList.add("error");
      // Keep history consistent: drop the unanswered question so a retry is clean.
      if (history.at(-1)?.role === "user") history.pop();
    } finally {
      controller = null;
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value;
    input.value = "";
    autoGrow();
    ask(q);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  input.addEventListener("input", autoGrow);
  suggestions.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) ask(chip.textContent);
  });
  newChat.addEventListener("click", () => {
    controller?.abort();
    controller = null;
    history = [];
    for (const el of [...log.children]) if (!el.classList.contains("intro") && el !== suggestions) el.remove();
    suggestions.hidden = false;
    setBusy(false);
    input.focus();
  });
})();

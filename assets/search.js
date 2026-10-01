/* Type-to-search quarterback pickers. QBSearch.enhance(select) hides a <select> behind a text box:
   click it and the box clears and the full list opens; type a few letters to narrow it; pick with
   the mouse or the arrow keys and Enter. The <select> stays the source of truth, so the page's own
   code keeps reading and setting select.value and listening for "change" exactly as before. */

const QBSearch = (() => {
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  let uid = 0;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function enhance(select, placeholder = "Type a quarterback's name…") {
    if (select._qbs) return;
    const width = select.offsetWidth;
    const box = document.createElement("div");
    box.className = "qbs";
    if (width) box.style.width = `${Math.max(width, 200)}px`;
    const input = document.createElement("input");
    const listId = `qbs-list-${++uid}`;
    Object.assign(input, { type: "text", className: "qbs-input", placeholder, autocomplete: "off", spellcheck: false });
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", listId);
    const label = select.id && document.querySelector(`label[for="${select.id}"]`);
    if (label) { input.id = `${select.id}-search`; label.htmlFor = input.id; }
    else input.setAttribute("aria-label", "Quarterback");
    const list = document.createElement("ul");
    list.className = "qbs-list"; list.id = listId; list.setAttribute("role", "listbox"); list.hidden = true;
    select.parentNode.insertBefore(box, select);
    box.append(input, select);
    document.body.appendChild(list);   // on the body, so no card can clip it
    select.hidden = true;
    select._qbs = true;

    const current = () => select.options[select.selectedIndex];
    const show = () => { const o = current(); input.value = o && o.value !== "" ? o.textContent : ""; };
    // keep the text box in step when the page's code sets select.value directly
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); show(); },
    });

    let items = [], active = -1;
    // the whole list, grouped by rookie class; once you type, matches are ranked: last name first,
    // then any other word that starts with what you typed, then anything that contains it
    function render(q) {
      const needle = q.trim().toLowerCase();
      const words = (t) => t.replace(/\s*\(.*\)$/, "").toLowerCase().split(/\s+/).filter((w) => !/^(jr\.?|sr\.?|ii|iii|iv)$/.test(w));
      const rank = (t) => {
        const w = words(t);
        return w[w.length - 1].startsWith(needle) ? 0 : w.some((x) => x.startsWith(needle)) || t.toLowerCase().startsWith(needle) ? 1 : 2;
      };
      let opts = [...select.options].map((o, n) => ({ o, n, group: o.parentElement.tagName === "OPTGROUP" ? o.parentElement.label : null }));
      if (needle) opts = opts.filter((x) => x.o.textContent.toLowerCase().includes(needle))
        .map((x) => ({ ...x, r: rank(x.o.textContent) })).sort((a, b) => a.r - b.r || a.n - b.n);
      items = [];
      let html = "", lastGroup = null;
      opts.forEach(({ o, group }) => {
        const text = o.textContent, at = text.toLowerCase().indexOf(needle);
        if (!needle && group && group !== lastGroup) html += `<li class="qbs-group" role="presentation">${esc(group)}</li>`;
        lastGroup = group;
        const shown = needle ? `${esc(text.slice(0, at))}<b>${esc(text.slice(at, at + needle.length))}</b>${esc(text.slice(at + needle.length))}` : esc(text);
        const sub = needle && group ? `<span class="qbs-sub">${esc(group)}</span>` : "";
        html += `<li class="qbs-item${o.selected ? " current" : ""}" role="option" id="${listId}-${items.length}" data-k="${items.length}">${shown}${sub}</li>`;
        items.push(o);
      });
      list.innerHTML = html || '<li class="qbs-empty">No quarterback matches that.</li>';
      setActive(needle && items.length ? 0 : items.findIndex((o) => o.selected));
    }
    function setActive(k, scroll = true) {
      active = k;
      list.querySelectorAll(".qbs-item").forEach((li) => li.classList.toggle("active", +li.dataset.k === k));
      const li = list.querySelector(`[data-k="${k}"]`);
      if (li) { if (scroll) li.scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", li.id); }
      else input.removeAttribute("aria-activedescendant");
    }
    function place() {
      const r = input.getBoundingClientRect(), below = innerHeight - r.bottom;
      list.style.left = `${r.left}px`;
      list.style.minWidth = `${r.width}px`;
      list.style.maxHeight = `${Math.max(160, Math.min(340, (below > 220 ? below : r.top) - 16))}px`;
      if (below > 220 || below > r.top) { list.style.top = `${r.bottom + 4}px`; list.style.bottom = ""; }
      else { list.style.bottom = `${innerHeight - r.top + 4}px`; list.style.top = ""; }
    }
    function open() {
      if (!list.hidden) return;
      input.placeholder = current() && current().value !== "" ? current().textContent : placeholder;
      input.value = "";            // clear the box so it is obvious you can type
      render("");
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      place();
      addEventListener("scroll", place, true);
      addEventListener("resize", place);
    }
    function close(restore = true) {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.placeholder = placeholder;
      removeEventListener("scroll", place, true);
      removeEventListener("resize", place);
      if (restore) show();
    }
    function pick(k) {
      const o = items[k];
      if (!o) return;
      close(false);
      if (!o.selected) {
        desc.set.call(select, o.value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      show();
      input.blur();
    }

    input.addEventListener("focus", open);
    input.addEventListener("click", open);
    input.addEventListener("input", () => { if (list.hidden) open(); render(input.value); place(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.hidden) return open();
        const n = items.length;
        if (n) setActive(((active < 0 ? (e.key === "ArrowDown" ? -1 : 0) : active) + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!list.hidden && active >= 0) pick(active);
      } else if (e.key === "Escape") {
        close(); input.blur();
      }
    });
    input.addEventListener("blur", () => setTimeout(() => close(), 120));
    list.addEventListener("mousedown", (e) => e.preventDefault());   // keep focus in the box while clicking
    list.addEventListener("click", (e) => { const li = e.target.closest(".qbs-item"); if (li) pick(+li.dataset.k); });
    list.addEventListener("mousemove", (e) => { const li = e.target.closest(".qbs-item"); if (li && +li.dataset.k !== active) setActive(+li.dataset.k, false); });
    show();
  }

  return { enhance };
})();

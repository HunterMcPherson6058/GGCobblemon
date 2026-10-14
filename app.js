/* GGQuest Pokédex — static client-side renderer (no build tools) */
"use strict";

const app = document.getElementById("app");
const searchInput = document.getElementById("search");
const loadError = document.getElementById("load-error");

/* ---------- theme ---------- */
const themeToggle = document.getElementById("theme-toggle");
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
}
applyTheme(document.documentElement.dataset.theme || "light");
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("pokedex-theme", next);
  applyTheme(next);
});

const fetchCache = new Map();
async function fetchJSON(url) {
  if (!fetchCache.has(url)) {
    fetchCache.set(url, fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      return res.json();
    }));
  }
  return fetchCache.get(url);
}

let abilitiesCache = null;
async function customAbilities() {
  if (!abilitiesCache) abilitiesCache = (await fetchJSON("data/abilities.json")).abilities;
  return abilitiesCache;
}

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));

const STAT_LABELS = [
  ["hp", "HP"], ["attack", "Attack"], ["defence", "Defense"],
  ["special_attack", "Sp. Atk"], ["special_defence", "Sp. Def"], ["speed", "Speed"],
];

/* ---------- helpers ---------- */

function heightText(dm) {
  if (dm == null) return "—";
  const m = dm / 10;
  const totalInches = m * 39.3701;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - ft * 12);
  return `${m.toFixed(1)} m (${ft}′${inches.toString().padStart(2, "0")}″)`;
}

function weightText(hg) {
  if (hg == null) return "—";
  const kg = hg / 10;
  return `${kg.toFixed(1)} kg (${(kg * 2.20462).toFixed(1)} lbs)`;
}

function typeBadge(type) {
  return `<span class="type-badge badge-${esc(type)}">${esc(type)}</span>`;
}

function genderText(ratio) {
  if (ratio == null) return '<span class="ability-hidden-note">Genderless</span>';
  const male = Math.round(ratio * 1000) / 10;
  const female = Math.round((1 - ratio) * 1000) / 10;
  return `
    <span class="gender-bar"><span class="m" style="width:${male}%"></span><span class="f" style="width:${female}%"></span></span>
    <span title="Male">${male}% ♂</span>, <span title="Female">${female}% ♀</span>`;
}

function statRange(key, base) {
  // Level 100 ranges: max = 31 IVs / 252 EVs / beneficial nature, min = 0/0/hindering
  if (key === "hp") return [2 * base + 110, 2 * base + 204];
  return [Math.floor((2 * base + 5) * 0.9), Math.floor((2 * base + 99) * 1.1)];
}

function statBarClass(value) {
  if (value < 50) return "low";
  if (value < 100) return "mid";
  if (value < 130) return "high";
  return "v-high";
}

function statBars(stats) {
  const rows = STAT_LABELS.map(([key, label]) => {
    const value = stats[key] ?? 0;
    const [min, max] = statRange(key, value);
    return `
      <div class="stat-row">
        <span class="stat-name">${label}</span>
        <span class="stat-value">${value}</span>
        <span class="stat-bar-track"><span class="stat-bar ${statBarClass(value)}" style="width:${Math.min(100, (value / 230) * 100)}%"></span></span>
        <span class="stat-range">${min}</span>
        <span class="stat-range">${max}</span>
      </div>`;
  }).join("");
  const total = STAT_LABELS.reduce((sum, [key]) => sum + (stats[key] ?? 0), 0);
  return `${rows}
    <div class="stat-row">
      <span class="stat-name" style="align-self:center">Total</span>
      <span class="stat-value" style="font-weight:700">${total}</span>
      <span></span>
      <span class="stat-range stat-range-label">Min</span>
      <span class="stat-range stat-range-label">Max</span>
    </div>
    <p class="stat-caption">The ranges shown on the right are for a level 100 Pokémon. Maximum values are based on a beneficial nature, 252 EVs, 31 IVs; minimum values are based on a hindering nature, 0 EVs, 0 IVs.</p>`;
}

const TYPE_ABBREVIATIONS = {
  normal: "NOR", fire: "FIR", water: "WAT", electric: "ELE", grass: "GRA",
  ice: "ICE", fighting: "FIG", poison: "POI", ground: "GRO", flying: "FLY",
  psychic: "PSY", bug: "BUG", rock: "ROC", ghost: "GHO", dragon: "DRA",
  dark: "DAR", steel: "STE", fairy: "FAI",
};

function defenseGrid(types, name, typeChart) {
  const cells = Object.keys(typeChart).map((attacker) => {
    let multiplier = 1;
    for (const defender of types) {
      multiplier *= typeChart[attacker][defender] ?? 1;
    }
    const valueClass = {
      4: "eff-four", 2: "eff-two", 0.5: "eff-half", 0.25: "eff-quarter", 0: "eff-zero",
    }[multiplier] || "";
    const label = multiplier === 0.5 ? "½" : multiplier === 0.25 ? "¼" : multiplier === 1 ? "" : String(multiplier);
    return `
      <div class="defense-cell">
        <span class="defense-type badge-${esc(attacker)}">${TYPE_ABBREVIATIONS[attacker]}</span>
        <span class="defense-value ${valueClass}">${label}</span>
      </div>`;
  }).join("");
  return `
    <p class="defense-subtitle">The effectiveness of each type on <em>${esc(name)}</em>.</p>
    <div class="defense-grid">${cells}</div>`;
}

function categoryChip(category) {
  if (!category) return "—";
  const label = { physical: "Physical", special: "Special", status: "Status" }[category] || category;
  return `<img class="cat-icon" src="img/icons/${esc(category)}.png" alt="${label}" title="${label}">`;
}

function moveTable(moves, withLevel) {
  const columns = [
    ...(withLevel ? [{ key: "level", label: "Level", type: "int" }] : []),
    { key: "name", label: "Move", type: "text" },
    { key: "type", label: "Type", type: "text" },
    { key: "category", label: "Cat.", type: "text" },
    { key: "power", label: "Power", type: "int" },
    { key: "accuracy", label: "Acc.", type: "int" },
    { key: "pp", label: "PP", type: "int" },
  ];
  const state = { key: withLevel ? "level" : "name", dir: 1 };
  const table = document.createElement("table");
  table.className = "moves";

  const rowsHtml = (rows) => rows.map((move) => `
    <tr>
      ${withLevel ? `<td class="num">${move.level ?? "—"}</td>` : ""}
      <td>${esc(move.name || move.move)}</td>
      <td>${move.type ? typeBadge(move.type) : "—"}</td>
      <td>${categoryChip(move.category)}</td>
      <td class="num">${move.power ?? "—"}</td>
      <td class="num">${move.accuracy ?? "—"}</td>
      <td class="num">${move.pp ?? "—"}</td>
    </tr>`).join("");

  const render = () => {
    const col = columns.find((c) => c.key === state.key);
    const sorted = [...moves].sort((a, b) => {
      const av = a[state.key];
      const bv = b[state.key];
      if (col.type === "int") {
        if (av == null && bv == null) return 0;
        if (av == null) return 1;   // missing values always last
        if (bv == null) return -1;
        return (av - bv) * state.dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? "")) * state.dir;
    });
    table.innerHTML = `
      <thead><tr>${columns.map((c) => `
        <th class="sortable ${state.key === c.key ? (state.dir === 1 ? "sorted-asc" : "sorted-desc") : ""}" data-key="${c.key}">${c.label}</th>`).join("")}
      </tr></thead>
      <tbody>${rowsHtml(sorted)}</tbody>`;
  };
  render();
  table.addEventListener("click", (event) => {
    const th = event.target.closest("th.sortable");
    if (!th) return;
    if (state.key === th.dataset.key) state.dir *= -1;
    else { state.key = th.dataset.key; state.dir = 1; }
    render();
  });
  return table;
}

/* ---------- list view ---------- */

let indexCache = null;
let typeFilter = null;

function typeOrder() {
  return Object.keys(TYPE_ABBREVIATIONS); // declared later in this file
}

function dexCardsHtml(items) {
  return items.map((item) => `
    <a class="dex-card" href="#/pokemon/${esc(item.slug)}">
      <span class="dex-no">#${String(item.dex).padStart(3, "0")}</span>
      ${item.image
        ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy">`
        : '<span class="img-placeholder img-placeholder-card">?</span>'}
      <span class="dex-name">${item.hasMega ? '<img class="mega-icon" src="img/icons/mega.png" alt="Mega capable" title="Can Mega Evolve">' : ""}<span class="dex-name-text">${esc(item.name)}</span></span>
      <span class="type-chips">${item.types.map(typeBadge).join("")}</span>
    </a>`).join("");
}

async function renderIndex() {
  document.title = "Cobblemon Eternal Platinum Pokédex";
  if (!indexCache) indexCache = await fetchJSON("data/index.json");
  const filterBar = `
    <div class="type-filter">
      ${typeOrder().map((type) => `
        <button class="type-filter-btn ${typeFilter === type ? "active" : ""}" data-type="${type}" title="Filter by ${type}">
          <span class="type-badge badge-${type}">${type}</span>
        </button>`).join("")}
      <button class="type-filter-btn ${typeFilter === "mega" ? "active" : ""}" data-type="mega" title="Filter by Mega-capable Pokémon">
        <span class="type-badge badge-mega">mega</span>
      </button>
      ${typeFilter ? '<button class="type-filter-clear" data-type="">Clear filter</button>' : ""}
    </div>`;
  const items = typeFilter === "mega"
    ? indexCache.filter((item) => item.hasMega)
    : typeFilter ? indexCache.filter((item) => item.types.includes(typeFilter)) : indexCache;
  const cards = dexCardsHtml(items);
  app.innerHTML = filterBar + (cards
    ? `<div class="dex-grid">${cards}</div>`
    : '<p class="muted-note">No Pokémon match this filter.</p>');
  app.querySelectorAll(".type-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      typeFilter = typeFilter === btn.dataset.type ? null : btn.dataset.type;
      renderIndex();
    });
  });
  const clear = app.querySelector(".type-filter-clear");
  if (clear) clear.addEventListener("click", () => { typeFilter = null; renderIndex(); });
}

/* ---------- entry view ---------- */

async function buildEvolutionTree(entry) {
  // Walk up via preEvolution, then expand evolutions downward as a branch tree.
  const bySlug = new Map([[entry.slug, entry]]);
  let root = entry;
  while (root.preEvolution && !bySlug.has(root.preEvolution)) {
    let parent = null;
    try { parent = await fetchJSON(`data/pokemon/${root.preEvolution}.json`); } catch { /* not exported yet */ }
    if (!parent) break;
    bySlug.set(parent.slug, parent);
    root = parent;
  }
  const index = await fetchJSON("data/index.json");
  const lookup = new Map(index.map((item) => [item.slug, item]));
  const seen = new Set([`${root.slug}|`]);

  const expand = async (node) => {
    const children = [];
    for (const evo of node.evolutions || []) {
      let child = bySlug.get(evo.to);
      if (!child) {
        try { child = await fetchJSON(`data/pokemon/${evo.to}.json`); } catch { /* leaf */ }
        if (child) bySlug.set(child.slug, child);
      }
      if (!child || !lookup.has(child.slug)) continue;
      const form = (child.forms || []).some((f) => f.id === evo.toForm) ? evo.toForm : null;
      const key = `${child.slug}|${form || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const formData = form ? (child.forms || []).find((f) => f.id === form) : null;
      const base = lookup.get(child.slug);
      children.push({
        slug: child.slug,
        form,
        condition: evo.condition,
        name: formData ? formData.name : base.name,
        types: formData ? formData.types : base.types,
        dex: base.dex,
        image: base.image,
        children: await expand(child),
      });
    }
    return children;
  };

  const base = lookup.get(root.slug);
  return {
    slug: root.slug, form: null, condition: null,
    name: base ? base.name : root.name,
    types: base ? base.types : root.types,
    dex: base ? base.dex : root.dex,
    image: base ? base.image : null,
    children: await expand(root),
  };
}

function evoNodeCard(node) {
  return `
    <a class="evo-node" href="#/pokemon/${esc(node.slug)}${node.form ? `/${esc(node.form)}` : ""}">
      ${node.image
        ? `<img src="${esc(node.image)}" alt="${esc(node.name)}" loading="lazy">`
        : '<span class="img-placeholder img-placeholder-evo">?</span>'}
      <span class="evo-no">#${String(node.dex).padStart(3, "0")}</span>
      <span class="evo-name">${esc(node.name)}</span>
      <span class="type-chips">${node.types.map(typeBadge).join("")}</span>
    </a>`;
}

function evoLink(condition, angle) {
  return `
    <div class="evo-link evo-link-${angle}">
      <span class="evo-line"></span>
      ${condition ? `<span class="evo-cond">${esc(condition)}</span>` : ""}
    </div>`;
}

function evolutionTreeHtml(node) {
  const kids = node.children || [];
  if (!kids.length) return `<div class="evo-cell">${evoNodeCard(node)}</div>`;
  if (kids.length === 1) {
    return `
      <div class="evo-row">
        <div class="evo-cell">${evoNodeCard(node)}</div>
        ${evoLink(kids[0].condition, "flat")}
        ${evolutionTreeHtml(kids[0])}
      </div>`;
  }
  const branches = kids.map((kid, i) => {
    const angle = i === 0 ? "up" : i === kids.length - 1 ? "down" : "flat";
    return `<div class="evo-row">${evoLink(kid.condition, angle)}${evolutionTreeHtml(kid)}</div>`;
  }).join("");
  return `
    <div class="evo-row">
      <div class="evo-cell">${evoNodeCard(node)}</div>
      <div class="evo-branches">${branches}</div>
    </div>`;
}

async function renderEntry(slug, requestedForm) {
  const [entry, meta, index, customAbilityList] = await Promise.all([
    fetchJSON(`data/pokemon/${slug}.json`),
    fetchJSON("data/meta.json"),
    fetchJSON("data/index.json"),
    customAbilities(),
  ]);
  const customIds = new Set(customAbilityList.map((ability) => ability.id));

  const forms = [{ id: "base", name: entry.name }].concat(entry.forms || []);
  const activeId = requestedForm && forms.some((f) => f.id === requestedForm) ? requestedForm : "base";
  const activeForm = forms.find((f) => f.id === activeId);
  const position = index.findIndex((item) => item.slug === slug);
  const prev = index[(position - 1 + index.length) % index.length];
  const next = index[(position + 1) % index.length];

  document.title = `${activeForm.name} - Cobblemon Eternal Platinum Pokédex`;

  const tabs = forms.map((form) => `
    <button class="form-tab ${form.id === activeId ? "active" : ""}" data-form="${esc(form.id)}">${esc(form.name)}</button>`).join("");

  app.innerHTML = `
    <div class="entry-nav">
      <a href="#/pokemon/${esc(prev.slug)}">← #${String(prev.dex).padStart(3, "0")} ${esc(prev.name)}</a>
      <a href="#/pokemon/${esc(next.slug)}">#${String(next.dex).padStart(3, "0")} ${esc(next.name)} →</a>
    </div>
    <div class="entry-top">
      <h1 class="entry-title" id="entry-name"></h1>
      <span class="entry-dexno">#${String(entry.dex).padStart(3, "0")}</span>
    </div>
    ${forms.length > 1 ? `<div class="form-tabs">${tabs}</div>` : ""}
    <div id="form-content"></div>
    <div class="card"><h2>Evolution chart</h2><div class="card-body evo-chain" id="evo-chain"><span class="loading">Loading evolution line…</span></div></div>
    <div class="move-section" id="moves"></div>`;

  const renderForm = (formId) => {
    const form = forms.find((f) => f.id === formId);
    const isBase = form.id === "base";
    const name = isBase ? entry.name : form.name;
    const types = isBase ? entry.types : form.types;
    const stats = isBase ? entry.stats : form.stats;
    const abilities = isBase ? entry.abilities : form.abilities;
    const height = isBase ? entry.height : (form.height ?? entry.height);
    const weight = isBase ? entry.weight : (form.weight ?? entry.weight);
    const flavor = isBase ? entry.flavor : (form.flavor || entry.flavor);
    const image = isBase ? entry.images.art : form.image;
    const pixClass = image && image.includes("sprite") ? "pix" : "";

    document.getElementById("entry-name").textContent = name;

    const abilityHtml = abilities.map((ability) => {
      const hiddenNote = ability.hidden ? ' <span class="ability-hidden-note">(hidden)</span>' : "";
      const title = ability.desc ? ` title="${esc(ability.desc)}"` : "";
      if (customIds.has(ability.id)) {
        return `<a class="ability-link" href="#/ability/${esc(ability.id)}"${title}>${esc(ability.name)}</a>${hiddenNote}`;
      }
      return `<span${ability.desc ? ` class="ability-tip"${title}` : ""}>${esc(ability.name)}</span>${hiddenNote}`;
    }).join("<br>");

    document.getElementById("form-content").innerHTML = `
      <div class="entry-grid">
        <div class="card">
          <div class="art-frame">${image ? `<img class="${pixClass}" src="${esc(image)}" alt="${esc(name)}">` : '<div class="art-placeholder">Artwork coming soon</div>'}</div>
        </div>
        <div class="card">
          <h2>Pokédex data</h2>
          <div class="card-body">
            <table class="vitals">
              <tr><th>Type</th><td><span class="type-chips" style="justify-content:flex-start">${types.map(typeBadge).join("")}</span></td></tr>
              <tr><th>Height</th><td>${heightText(height)}</td></tr>
              <tr><th>Weight</th><td>${weightText(weight)}</td></tr>
              <tr><th>Abilities</th><td>${abilityHtml}</td></tr>
              <tr><th>Catch rate</th><td>${entry.catchRate ?? "—"}</td></tr>
              <tr><th>Base friendship</th><td>${entry.baseFriendship ?? "—"}</td></tr>
              <tr><th>Base exp.</th><td>${entry.baseExp ?? "—"}</td></tr>
              <tr><th>Growth rate</th><td>${esc((entry.growthRate || "—").replace(/_/g, " "))}</td></tr>
              <tr><th>Gender</th><td>${genderText(entry.genderRatio)}</td></tr>
              <tr><th>Egg groups</th><td>${entry.eggGroups.map((group) => esc(group.replace(/_/g, " "))).join(", ") || "—"}</td></tr>
              <tr><th>Egg cycles</th><td>${entry.eggCycles ?? "—"}</td></tr>
            </table>
          </div>
        </div>
      </div>
      <div class="entry-row2">
        <div class="card">
          <h2>Type defenses</h2>
          <div class="card-body">${defenseGrid(types, name, meta.typeChart)}</div>
        </div>
        <div class="card">
          <h2>Base stats</h2>
          <div class="card-body">${statBars(stats)}</div>
        </div>
      </div>`;

    app.querySelectorAll(".form-tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.form === formId);
    });
    renderMoves(isBase ? entry.moves : (form.moves || entry.moves));
  };

  // Move tables — sortable; two columns: level/tutor/egg stacked left, TMs right
  const renderMoves = (movesData) => {
    const movesRoot = document.getElementById("moves");
    movesRoot.innerHTML = "";
    const buildCard = (title, moves, withLevel) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h2>${title}</h2><div class="card-body moves-wrap"></div>`;
      card.querySelector(".moves-wrap").appendChild(moveTable(moves, withLevel));
      return card;
    };
    const present = new Set(Object.keys(movesData).filter((key) => (movesData[key] || []).length));
    const titles = {
      level: "Moves learned by leveling up",
      evolution: "Moves learned on evolution",
      tm: "Moves learned by TM",
      tutor: "Moves learned by tutor",
      egg: "Egg moves",
    };
    // Left column: level-up, tutor, egg, evolution (stacked); right column: TMs alone
    if (present.size) {
      const known = ["level", "tutor", "egg", "evolution", "tm"];
      const leftKeys = ["level", "tutor", "egg", "evolution",
        ...[...present].filter((key) => !known.includes(key))];
      const leftStack = document.createElement("div");
      leftStack.className = "moves-stack";
      for (const key of leftKeys) {
        if (present.has(key)) leftStack.appendChild(buildCard(titles[key] || `${key.replace(/_/g, " ")} moves`, movesData[key], key === "level"));
      }
      if (present.has("tm")) {
        const columns = document.createElement("div");
        columns.className = "moves-columns";
        columns.appendChild(leftStack);
        columns.appendChild(buildCard(titles.tm, movesData.tm, false));
        movesRoot.appendChild(columns);
      } else {
        movesRoot.appendChild(leftStack);
      }
    } else {
      movesRoot.innerHTML = '<div class="card"><div class="card-body"><p class="muted-note">No moves documented.</p></div></div>';
    }
  };

  renderForm(activeId);
  app.querySelectorAll(".form-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      history.replaceState(null, "", `#/pokemon/${slug}${tab.dataset.form !== "base" ? `/${tab.dataset.form}` : ""}`);
      renderForm(tab.dataset.form);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Evolution chart (branching tree, data for the whole line)
  const tree = await buildEvolutionTree(entry);
  document.getElementById("evo-chain").innerHTML = (tree.children || []).length
    ? evolutionTreeHtml(tree)
    : '<p class="muted-note">This Pokémon does not evolve.</p>';
  document.querySelectorAll("#evo-chain .evo-node").forEach((link) => {
    link.addEventListener("click", () => window.scrollTo(0, 0));
  });
}

/* ---------- battle changes + ability pages ---------- */

const multiplierLabel = (value) => ({
  0: "0×", 0.25: "¼×", 0.5: "½×", 1: "1×", 2: "2×", 4: "4×",
}[value] || `${value}×`);

const effectivenessWord = (value) => ({
  0: "no effect against", 0.25: "not very effective against", 0.5: "not very effective against",
  1: "neutral against", 2: "super effective against", 4: "super effective against",
}[value] || `×${value} against`);

async function renderBattleChanges() {
  document.title = "Battle Changes - Cobblemon Eternal Platinum Pokédex";
  const [meta, abilities] = await Promise.all([fetchJSON("data/meta.json"), customAbilities()]);
  const typeRows = (meta.typeChanges || []).map((change) => `
    <div class="type-change-row">
      <span class="type-chips">${typeBadge(change.attacker)}</span>
      <span class="type-change-vs">${esc(effectivenessWord(change.to))}</span>
      <span class="type-chips">${typeBadge(change.defender)}</span>
      <span class="mult-change">${multiplierLabel(change.from)} → <strong>${multiplierLabel(change.to)}</strong></span>
    </div>`).join("");
  const ruleRows = (meta.ruleChanges || []).map((rule) => `
    <div class="type-change-row rule-change-row">
      <span class="type-chips">${typeBadge(rule.type)}</span>
      <span class="rule-change-text">${esc(rule.text)}</span>
    </div>`).join("");
  const abilityRows = abilities.map((ability) => `
    <a class="ability-row" href="#/ability/${esc(ability.id)}">
      <span class="ability-row-name">${esc(ability.name)}</span>
      <span class="ability-row-desc">${esc(ability.short || ability.desc)}</span>
    </a>`).join("");
  app.innerHTML = `
    <h1 class="page-title">Battle changes</h1>
    <p class="page-intro">How Eternal Platinum battles differ from the base games.</p>
    <div class="card">
      <h2>Type effectiveness changes</h2>
      <div class="card-body">
        ${(typeRows + ruleRows) || '<p class="muted-note">No type effectiveness changes.</p>'}
      </div>
    </div>
    <div class="card">
      <h2>Custom abilities</h2>
      <div class="card-body ability-list">
        ${abilityRows || '<p class="muted-note">No custom abilities.</p>'}
      </div>
    </div>`;
}

async function renderAbility(id) {
  const abilities = await customAbilities();
  const ability = abilities.find((a) => a.id === id);
  if (!ability) throw new Error(`unknown ability '${id}'`);
  document.title = `${ability.name} - Cobblemon Eternal Platinum Pokédex`;
  const holders = ability.pokemon.map((holder) => `
    <a class="holder-chip" href="#/pokemon/${esc(holder.slug)}${holder.form ? `/${esc(holder.form)}` : ""}">${esc(holder.name)}</a>`).join("");
  const validMoves = ability.validMoves || [];
  const holdersCard = `
    <div class="card">
      <h2>Pokémon with ${esc(ability.name)}</h2>
      <div class="card-body holder-chips">
        ${holders || '<p class="muted-note">No Pokémon in the current dex scope has this ability.</p>'}
      </div>
    </div>`;
  app.innerHTML = `
    <div class="entry-nav">
      <a href="#/battle-changes">← All battle changes</a>
    </div>
    <h1 class="page-title">${esc(ability.name)}</h1>
    <div class="card">
      <h2>Effect</h2>
      <div class="card-body">
        <p class="ability-desc">${esc(ability.effect || ability.short || ability.desc) || "No description available."}</p>
      </div>
    </div>
    ${validMoves.length ? `
    <div class="moves-columns">
      <div class="card">
        <h2>Valid moves</h2>
        <div class="card-body valid-move-wrap"></div>
      </div>
      ${holdersCard}
    </div>` : holdersCard}`;
  const movesWrap = app.querySelector(".valid-move-wrap");
  if (movesWrap) movesWrap.appendChild(moveTable(validMoves, false));
}

/* ---------- router ---------- */

async function route() {
  loadError.hidden = true;
  app.innerHTML = '<p class="loading">Loading…</p>';
  searchInput.value = "";
  closeSearch();
  try {
    const hash = location.hash.replace(/^#/, "");
    const parts = hash.split("/").filter(Boolean); // ["pokemon", slug, form?] / ["ability", id]
    const isBattle = parts[0] === "battle-changes" || parts[0] === "ability";
    document.querySelectorAll("#site-nav a").forEach((link) => {
      link.classList.toggle("active", isBattle ? link.dataset.nav === "battle" : link.dataset.nav === "pokedex");
    });
    if (parts[0] === "pokemon" && parts[1]) {
      await renderEntry(parts[1], parts[2]);
    } else if (parts[0] === "battle-changes") {
      await renderBattleChanges();
    } else if (parts[0] === "ability" && parts[1]) {
      await renderAbility(decodeURIComponent(parts[1]));
    } else {
      await renderIndex();
    }
  } catch (err) {
    app.innerHTML = "";
    loadError.textContent = `Could not load this page: ${err.message}. Try regenerating the data with _pokedex_export.py.`;
    loadError.hidden = false;
  }
}

/* ---------- search autocomplete ---------- */
let searchIndexCache = null;

async function searchMatches(query) {
  const [index, abilities] = await Promise.all([
    searchIndexCache || fetchJSON("data/index.json").then((data) => (searchIndexCache = data)),
    customAbilities(),
  ]);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const numbered = String(parseInt(q, 10) === Number(q) ? Number(q) : NaN);
  const results = [];
  index.forEach((item) => {
    const name = item.name.toLowerCase();
    let rank = -1;
    if (name.startsWith(q)) rank = 0;
    else if (name.includes(q)) rank = 1;
    else if (item.slug.startsWith(q)) rank = 2;
    else if (item.slug.includes(q)) rank = 3;
    else if (numbered === String(item.dex) || String(item.dex).padStart(3, "0").startsWith(q)) rank = 4;
    if (rank >= 0) results.push({ kind: "pokemon", rank, order: item.dex, item });
  });
  abilities.forEach((ability) => {
    const name = ability.name.toLowerCase();
    let rank = -1;
    if (name.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (ability.id.startsWith(q)) rank = 3;
    if (rank >= 0) results.push({ kind: "ability", rank, order: 0, item: ability });
  });
  return results
    .sort((a, b) => a.rank - b.rank || (a.kind === b.kind ? a.order - b.order : a.kind === "pokemon" ? -1 : 1))
    .slice(0, 5);
}

function renderSearchResults(results) {
  const box = document.getElementById("search-results");
  if (!results.length) {
    box.innerHTML = '<div class="search-empty">No matching Pokémon or abilities.</div>';
    box.hidden = false;
    return;
  }
  box.innerHTML = results.map(({ kind, item }) => kind === "pokemon" ? `
    <button class="search-item" data-slug="${esc(item.slug)}">
      ${item.image ? `<img src="${esc(item.image)}" alt="">` : '<span class="img-placeholder img-placeholder-search">?</span>'}
      <span class="dex-no">#${String(item.dex).padStart(3, "0")}</span>
      <span class="search-item-name">${item.hasMega ? '<img class="mega-icon" src="img/icons/mega.png" alt="">' : ""}${esc(item.name)}</span>
      <span class="type-chips">${item.types.map(typeBadge).join("")}</span>
    </button>` : `
    <button class="search-item search-item-ability" data-ability="${esc(item.id)}">
      <span class="img-placeholder img-placeholder-search ability-search-icon">A</span>
      <span class="dex-no">Ability</span>
      <span class="search-item-name">${esc(item.name)}</span>
      <span class="type-chips"></span>
    </button>`).join("");
  box.hidden = false;
}

function closeSearch() {
  document.getElementById("search-results").hidden = true;
}

searchInput.addEventListener("input", () => {
  searchMatches(searchInput.value)
    .then(renderSearchResults)
    .catch(() => closeSearch());
});

searchInput.addEventListener("keydown", (event) => {
  const box = document.getElementById("search-results");
  if (event.key === "Escape") { closeSearch(); return; }
  if (event.key === "Enter") {
    const first = box.querySelector(".search-item");
    if (first) {
      location.hash = first.dataset.ability
        ? `#/ability/${first.dataset.ability}`
        : `#/pokemon/${first.dataset.slug}`;
      closeSearch();
      searchInput.blur();
    }
  }
});

document.getElementById("search-results").addEventListener("click", (event) => {
  const item = event.target.closest(".search-item");
  if (item) {
    location.hash = item.dataset.ability
      ? `#/ability/${item.dataset.ability}`
      : `#/pokemon/${item.dataset.slug}`;
    closeSearch();
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) closeSearch();
});

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", route);
if (document.readyState !== "loading") route();

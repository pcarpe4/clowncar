import React, { useState, useMemo, useRef, useEffect } from "react";
import * as d3 from "d3";

// ---------- shorthand grammar ----------
// Q: question   A: answer   > follow-up   plain text = note
// #name = owner   @date = due date   indent 2 spaces (Tab) = nested under the line above

const NODE_W = 212;
const NODE_H = 78;
const GAP_X = 26;
const GAP_Y = 54;

const TYPES = {
  question: { label: "Question", glyph: "Q", prefix: "Q: ", color: "#3B5BDB" },
  answer: { label: "Answer", glyph: "A", prefix: "A: ", color: "#12876F" },
  action: { label: "Follow-up", glyph: "→", prefix: "> ", color: "#E8590C" },
  note: { label: "Note", glyph: "·", prefix: "", color: "#6B7280" },
};
const CYCLE = ["question", "answer", "action", "note"];

const SAMPLE = `Q: Ship v2 in September?
  A: Only if QA signs off by the 10th #Maria
    > Confirm QA timeline #Dave @Sep 3
  Q: What's the fallback if QA slips?
    A: Feature-flag the new checkout
      > Write rollout plan #Priya @Sep 8
Q: Who owns launch comms?
  > Draft announcement #Sam @Sep 12`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const tabsToSpaces = (s) => s.replace(/\t/g, "  ");
const stop = (e) => e.stopPropagation();

function parseLine(raw) {
  const line = tabsToSpaces(raw);
  const indent = line.match(/^ */)[0].length;
  let body = line.trim();
  let type = "note";
  let m;
  if ((m = body.match(/^(q:|\?)\s*/i))) { type = "question"; body = body.slice(m[0].length); }
  else if ((m = body.match(/^(a:|=)\s*/i))) { type = "answer"; body = body.slice(m[0].length); }
  else if ((m = body.match(/^(>|!|todo:)\s*/i))) { type = "action"; body = body.slice(m[0].length); }
  let owner = null;
  let date = null;
  body = body.replace(/\s*#(\S+)/, (_, o) => { owner = o; return ""; });
  body = body.replace(/\s*@(.+)$/, (_, d) => { date = d.trim(); return ""; });
  body = body.trim();
  if (type === "note" && /\?$/.test(body)) type = "question"; // a line ending in ? is a question
  return { depth: Math.round(indent / 2), type, text: body, owner, date };
}

function parseText(text) {
  const lines = text.split("\n");
  const root = { id: -1, line: -1, depth: -1, type: "root", text: "", children: [], parent: null };
  const byId = new Map();
  const stack = [root];
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const node = { id: i, line: i, ...parseLine(raw), children: [], parent: null };
    while (stack.length > 1 && stack[stack.length - 1].depth >= node.depth) stack.pop();
    const parent = stack[stack.length - 1];
    node.parent = parent;
    parent.children.push(node);
    stack.push(node);
    byId.set(i, node);
  });
  const finish = (n) => {
    let end = n.line;
    n.children.forEach((c) => { end = Math.max(end, finish(c)); });
    n.end = end;
    if (n.type === "question") n.open = !n.children.some((c) => c.type === "answer");
    return end;
  };
  finish(root);
  return { root, byId };
}

function layoutTree(root) {
  const h = d3.hierarchy(root, (d) => d.children);
  d3.tree().nodeSize([NODE_W + GAP_X, NODE_H + GAP_Y])(h);
  const pos = {};
  h.descendants().forEach((d) => {
    if (d.data.id === -1) return;
    pos[d.data.id] = { x: d.x - NODE_W / 2, y: d.y - (NODE_H + GAP_Y) };
  });
  return pos;
}

function serialize(n, patch = {}) {
  const m = { ...n, ...patch };
  return (
    " ".repeat(Math.max(0, m.depth) * 2) +
    TYPES[m.type].prefix +
    (m.text || "") +
    (m.owner ? " #" + m.owner : "") +
    (m.date ? " @" + m.date : "")
  );
}

function shiftIndent(line, delta) {
  const s = tabsToSpaces(line);
  if (delta >= 0) return " ".repeat(delta * 2) + s;
  const cur = s.match(/^ */)[0].length;
  return s.slice(Math.min(cur, -delta * 2));
}

function isDescendant(node, ancestor) {
  let p = node.parent;
  while (p) { if (p === ancestor) return true; p = p.parent; }
  return false;
}

function edgePath(a, b) {
  const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2, y2 = b.y;
  const my = y1 + (y2 - y1) / 2;
  return `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
}

// ---------- component ----------
export default function Callmap() {
  const [text, setText] = useState(SAMPLE);
  const [overrides, setOverrides] = useState({});
  const [view, setView] = useState({ x: 40, y: 32, k: 1 });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [showNotes, setShowNotes] = useState(true);
  const [flash, setFlash] = useState(null);
  const [panning, setPanning] = useState(false);

  const canvasRef = useRef(null);
  const notesRef = useRef(null);
  const dragRef = useRef(null);
  const dropRef = useRef(null);
  const posRef = useRef({});
  const pendingSel = useRef(null);
  const cancelEdit = useRef(false);

  const model = useMemo(() => parseText(text), [text]);
  const auto = useMemo(() => layoutTree(model.root), [model]);
  const positions = useMemo(() => {
    const p = {};
    for (const id of Object.keys(auto)) p[id] = overrides[id] || auto[id];
    return p;
  }, [auto, overrides]);
  posRef.current = positions;

  const nodes = useMemo(() => [...model.byId.values()], [model]);
  const openQs = nodes.filter((n) => n.type === "question" && n.open);
  const actions = nodes.filter((n) => n.type === "action");
  const dated = actions.filter((n) => n.date);
  const edges = nodes
    .filter((n) => n.parent && n.parent.id !== -1)
    .map((n) => {
      const a = positions[n.parent.id], b = positions[n.id];
      return a && b ? { id: n.id, a, b, color: TYPES[n.type].color } : null;
    })
    .filter(Boolean);

  // ----- text mutations (the notes are the source of truth) -----
  const lines = () => text.split("\n");
  const commitLines = (arr, structural) => {
    setText(arr.join("\n"));
    if (structural) setOverrides({});
  };
  const setNodeText = (id, t) => {
    const n = model.byId.get(id); if (!n) return;
    const L = lines(); L[id] = serialize(n, { text: t.trim() }); commitLines(L);
  };
  const cycleType = (id) => {
    const n = model.byId.get(id); if (!n) return;
    const next = CYCLE[(CYCLE.indexOf(n.type) + 1) % CYCLE.length];
    const L = lines(); L[id] = serialize(n, { type: next }); commitLines(L);
  };
  const addChild = (parentId, type) => {
    const L = lines();
    const parent = parentId === -1 ? model.root : model.byId.get(parentId);
    if (!parent) return;
    const at = parent.id === -1 ? L.length : parent.end + 1;
    L.splice(at, 0, " ".repeat((parent.depth + 1) * 2) + TYPES[type].prefix);
    commitLines(L, true);
    setSelected(at); setEditing(at);
  };
  const deleteNode = (id) => {
    const n = model.byId.get(id); if (!n) return;
    const L = lines(); L.splice(n.line, n.end - n.line + 1); commitLines(L, true);
    setSelected(null); setEditing(null);
  };
  const reparent = (id, targetId) => {
    const n = model.byId.get(id), t = model.byId.get(targetId);
    if (!n || !t || n === t || isDescendant(t, n)) return;
    const L = lines();
    const block = L.slice(n.line, n.end + 1);
    const moved = block.map((l) => shiftIndent(l, t.depth + 1 - n.depth));
    const rest = [...L.slice(0, n.line), ...L.slice(n.end + 1)];
    let at = t.end + 1;
    if (t.end >= n.end) at -= block.length;
    rest.splice(at, 0, ...moved);
    commitLines(rest, true);
    setSelected(null);
  };

  // ----- notes pane keyboard: Tab nests, Enter keeps indent -----
  const applyText = (nv, s, e) => {
    if (nv.split("\n").length !== text.split("\n").length) setOverrides({});
    setText(nv); pendingSel.current = [s, e];
  };
  useEffect(() => {
    if (pendingSel.current && notesRef.current) {
      const [a, b] = pendingSel.current; notesRef.current.setSelectionRange(a, b); pendingSel.current = null;
    }
  }, [text]);
  const onNotesChange = (e) => applyText(e.target.value, e.target.selectionStart, e.target.selectionEnd);
  const onNotesKeyDown = (e) => {
    const ta = e.currentTarget;
    const { selectionStart: s, selectionEnd: en, value } = ta;
    const ls = value.lastIndexOf("\n", s - 1) + 1;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (value.slice(ls, ls + 2) === "  ") applyText(value.slice(0, ls) + value.slice(ls + 2), Math.max(ls, s - 2), Math.max(ls, en - 2));
      } else {
        applyText(value.slice(0, s) + "  " + value.slice(en), s + 2, s + 2);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const ins = "\n" + value.slice(ls).match(/^ */)[0];
      applyText(value.slice(0, s) + ins + value.slice(en), s + ins.length, s + ins.length);
    }
  };

  // ----- canvas: pan, zoom, fit -----
  const worldPoint = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k };
  };
  const zoomAt = (mx, my, f) =>
    setView((v) => {
      const k = clamp(v.k * f, 0.2, 2.5), s = k / v.k;
      return { k, x: mx - (mx - v.x) * s, y: my - (my - v.y) * s };
    });
  const zoomBy = (f) => { const el = canvasRef.current; if (el) zoomAt(el.clientWidth / 2, el.clientHeight / 2, f); };
  const fitTo = (pos) => {
    const el = canvasRef.current; const P = pos || positions;
    const vals = Object.values(P); if (!el || !vals.length) return;
    const minX = Math.min(...vals.map((p) => p.x)), maxX = Math.max(...vals.map((p) => p.x)) + NODE_W;
    const minY = Math.min(...vals.map((p) => p.y)), maxY = Math.max(...vals.map((p) => p.y)) + NODE_H;
    const pad = 36, w = el.clientWidth, h = el.clientHeight;
    const k = clamp(Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY)), 0.2, 1.2);
    setView({ k, x: (w - (maxX - minX) * k) / 2 - minX * k, y: (h - (maxY - minY) * k) / 2 - minY * k });
  };
  const tidy = () => { setOverrides({}); fitTo(auto); };
  const focusNode = (id) => {
    const el = canvasRef.current, p = positions[id]; if (!el || !p) return;
    setView((v) => ({ ...v, x: el.clientWidth / 2 - (p.x + NODE_W / 2) * v.k, y: el.clientHeight / 2 - (p.y + NODE_H / 2) * v.k }));
    setSelected(id); setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 900);
  };
  useEffect(() => { fitTo(); }, []); // eslint-disable-line
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0012));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onCanvasDown = (e) => {
    dragRef.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);
  };
  const onCanvasMove = (e) => {
    const d = dragRef.current; if (!d || d.kind !== "pan") return;
    d.moved = true;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
  };
  const onCanvasUp = () => {
    const d = dragRef.current; dragRef.current = null; setPanning(false);
    if (d && d.kind === "pan" && !d.moved) setSelected(null);
  };

  // ----- cards: tap to select, tap again to edit, drag to move, drop on a card to nest -----
  const findTarget = (id, wx, wy) => {
    const n = model.byId.get(id);
    for (const [tid, t] of model.byId) {
      if (tid === id || isDescendant(t, n)) continue;
      const p = posRef.current[tid]; if (!p) continue;
      if (wx >= p.x && wx <= p.x + NODE_W && wy >= p.y && wy <= p.y + NODE_H) return tid;
    }
    return null;
  };
  const onNodeDown = (e, id) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const p = positions[id];
    dragRef.current = { kind: "node", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onNodeMove = (e) => {
    const d = dragRef.current; if (!d || d.kind !== "node") return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.moved = true; setDragging(d.id); setEditing(null);
    }
    setOverrides((o) => ({ ...o, [d.id]: { x: d.ox + (e.clientX - d.sx) / view.k, y: d.oy + (e.clientY - d.sy) / view.k } }));
    const w = worldPoint(e);
    const t = findTarget(d.id, w.x, w.y);
    dropRef.current = t; setDropTarget(t);
  };
  const onNodeUp = () => {
    const d = dragRef.current; dragRef.current = null;
    if (!d || d.kind !== "node") return;
    if (!d.moved) {
      if (selected === d.id) setEditing(d.id); else setSelected(d.id);
      return;
    }
    setDragging(null);
    if (dropRef.current !== null && dropRef.current !== undefined) reparent(d.id, dropRef.current);
    dropRef.current = null; setDropTarget(null);
  };

  return (
    <div className="cm-root">
      <style>{CSS}</style>
      <header className="cm-head">
        <div className="cm-brand"><i />Callmap</div>
        <div className="cm-ledger">
          <span className="cm-eyebrow">Still open</span>
          {openQs.length === 0 ? (
            <span className="cm-count">none — every question has an answer</span>
          ) : (
            openQs.map((n) => (
              <button key={n.id} className="cm-chip" onClick={() => focusNode(n.id)} title="Jump to this question">
                {n.text || "Untitled question"}
              </button>
            ))
          )}
        </div>
        <span className="cm-count">
          <b>{actions.length}</b> follow-up{actions.length === 1 ? "" : "s"}{dated.length ? `, ${dated.length} dated` : ""}
        </span>
        <div className="cm-tools">
          <button className="cm-btn" onClick={() => setShowNotes((s) => !s)}>{showNotes ? "Hide notes" : "Show notes"}</button>
          <button className="cm-btn" onClick={tidy} title="Re-run the automatic layout">Tidy</button>
          <button className="cm-btn" onClick={() => fitTo()} title="Fit everything on screen">Fit</button>
          <button className="cm-btn" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">−</button>
          <button className="cm-btn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        </div>
      </header>

      <div className="cm-main">
        {showNotes && (
          <aside className="cm-notes">
            <textarea
              ref={notesRef}
              value={text}
              onChange={onNotesChange}
              onKeyDown={onNotesKeyDown}
              spellCheck={false}
              placeholder="Q: What are we deciding today?"
            />
            <div className="cm-legend">
              <code>Q:</code> question · <code>A:</code> answer · <code>&gt;</code> follow-up · <code>#name</code> owner · <code>@date</code> due ·{" "}
              <code>Tab</code> nests under the line above · drag a card onto another card to move it there
            </div>
          </aside>
        )}

        <div
          ref={canvasRef}
          className={"cm-canvas" + (panning ? " panning" : "")}
          onPointerDown={onCanvasDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasUp}
          onPointerCancel={onCanvasUp}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.k}px ${22 * view.k}px` }}
        >
          <div className="cm-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            <svg className="cm-edges" width="1" height="1">
              {edges.map((e) => (
                <path key={e.id} d={edgePath(e.a, e.b)} fill="none" stroke={e.color} strokeOpacity="0.45" strokeWidth="2" />
              ))}
            </svg>

            {nodes.map((n) => {
              const p = positions[n.id]; if (!p) return null;
              const t = TYPES[n.type];
              const isSel = selected === n.id;
              const cls = [
                "cm-node", n.type,
                n.open ? "open" : "",
                isSel ? "selected" : "",
                dropTarget === n.id ? "target" : "",
                dragging === n.id ? "dragging" : "",
                flash === n.id ? "flash" : "",
              ].filter(Boolean).join(" ");
              return (
                <div
                  key={n.id}
                  className={cls}
                  style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                  onPointerDown={(e) => onNodeDown(e, n.id)}
                  onPointerMove={onNodeMove}
                  onPointerUp={onNodeUp}
                  onPointerCancel={onNodeUp}
                >
                  <div className="cm-spine" style={{ background: t.color }} />
                  <button className="cm-type" style={{ background: t.color }} title={`${t.label} — tap to change type`} onPointerDown={stop} onClick={() => cycleType(n.id)}>
                    {t.glyph}
                  </button>
                  <div className="cm-body">
                    {editing === n.id ? (
                      <textarea
                        className="cm-edit"
                        autoFocus
                        defaultValue={n.text}
                        onPointerDown={stop}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
                          if (e.key === "Escape") { cancelEdit.current = true; e.currentTarget.blur(); }
                        }}
                        onBlur={(e) => {
                          if (!cancelEdit.current) setNodeText(n.id, e.target.value);
                          cancelEdit.current = false; setEditing(null);
                        }}
                      />
                    ) : (
                      <div className={"cm-text" + (n.text ? "" : " empty")}>{n.text || `Untitled ${t.label.toLowerCase()}`}</div>
                    )}
                    <div className="cm-meta">
                      {n.type === "question" && (n.open ? <span className="cm-tag open">open</span> : <span className="cm-tag done">answered</span>)}
                      {n.owner && <span className="cm-tag owner">{n.owner}</span>}
                      {n.date && <span className="cm-tag date">{n.date}</span>}
                    </div>
                  </div>
                  {isSel && editing !== n.id && (
                    <div className="cm-nodetools" onPointerDown={stop}>
                      <button className="q" onClick={() => addChild(n.id, "question")}>+ Q</button>
                      <button className="a" onClick={() => addChild(n.id, "answer")}>+ A</button>
                      <button className="f" onClick={() => addChild(n.id, "action")}>+ →</button>
                      <button className="x" onClick={() => deleteNode(n.id)} title="Delete this card and everything under it">✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {nodes.length === 0 && (
            <div className="cm-empty">
              <div>
                Nothing mapped yet. Start a line in the notes with <b>Q:</b> and the first card appears here.
                <br />
                <button className="cm-btn" style={{ marginTop: 10 }} onClick={() => addChild(-1, "question")}>Add a question</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.cm-root { --ink:#16213A; --muted:#5B6578; --line:#D5DBE4; --paper:#FFFFFF; --canvas:#EEF1F5; --dot:#C3CBD6; --q:#3B5BDB; --a:#12876F; --f:#E8590C;
  font-family:"Instrument Sans", system-ui, -apple-system, sans-serif; color:var(--ink); height:100vh; display:flex; flex-direction:column; background:var(--canvas); overflow:hidden; }
.cm-root * { box-sizing:border-box; }
.cm-head { display:flex; align-items:center; gap:14px; padding:10px 14px; background:var(--paper); border-bottom:1px solid var(--line); flex-wrap:wrap; }
.cm-brand { font-family:"Bricolage Grotesque", "Instrument Sans", sans-serif; font-weight:700; font-size:18px; letter-spacing:-0.02em; display:flex; align-items:center; gap:8px; }
.cm-brand i { width:10px; height:10px; border-radius:50%; background:var(--q); box-shadow:0 0 0 3px #E4E9FB; }
.cm-ledger { display:flex; align-items:center; gap:6px; flex:1; min-width:0; overflow-x:auto; scrollbar-width:none; }
.cm-ledger::-webkit-scrollbar { display:none; }
.cm-eyebrow { font-family:"Bricolage Grotesque", sans-serif; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); white-space:nowrap; }
.cm-chip { border:1.5px dashed var(--q); color:var(--q); background:#fff; border-radius:999px; padding:3px 10px; font-size:12px; font-weight:500; font-family:inherit; white-space:nowrap; max-width:190px; overflow:hidden; text-overflow:ellipsis; cursor:pointer; }
.cm-chip:hover { background:#E4E9FB; }
.cm-count { font-size:12px; color:var(--muted); white-space:nowrap; }
.cm-count b { color:var(--f); font-weight:600; }
.cm-tools { display:flex; gap:6px; margin-left:auto; }
.cm-btn { font-family:inherit; font-size:12px; font-weight:500; padding:6px 10px; border:1px solid var(--line); background:#fff; border-radius:8px; color:var(--ink); cursor:pointer; }
.cm-btn:hover { border-color:#AAB4C3; }
.cm-btn:focus-visible, .cm-chip:focus-visible, .cm-type:focus-visible { outline:2px solid var(--q); outline-offset:2px; }
.cm-main { flex:1; display:flex; min-height:0; }
.cm-notes { width:320px; flex:none; display:flex; flex-direction:column; background:var(--paper); border-right:1px solid var(--line); }
.cm-notes textarea { flex:1; resize:none; border:0; outline:0; padding:14px; font-family:"JetBrains Mono", ui-monospace, Menlo, monospace; font-size:13px; line-height:1.55; color:var(--ink); background:transparent; tab-size:2; }
.cm-legend { padding:8px 14px 10px; border-top:1px solid var(--line); font-size:11.5px; color:var(--muted); line-height:1.8; }
.cm-legend code { font-family:"JetBrains Mono", monospace; background:#F1F3F7; padding:1px 5px; border-radius:4px; color:var(--ink); }
.cm-canvas { flex:1; position:relative; overflow:hidden; touch-action:none; cursor:grab; background-color:var(--canvas); background-image:radial-gradient(var(--dot) 1px, transparent 1.2px); }
.cm-canvas.panning { cursor:grabbing; }
.cm-world { position:absolute; left:0; top:0; transform-origin:0 0; }
.cm-edges { position:absolute; left:0; top:0; overflow:visible; pointer-events:none; }
.cm-node { position:absolute; background:var(--paper); border:1.5px solid var(--line); border-radius:12px; box-shadow:0 1px 2px rgba(22,33,58,.06); display:flex; cursor:grab; user-select:none; -webkit-user-select:none; }
.cm-node.question.open { border-color:var(--q); border-style:dashed; }
.cm-node.selected { box-shadow:0 0 0 3px #C9D3FA, 0 6px 16px rgba(22,33,58,.12); z-index:3; }
.cm-node.target { box-shadow:0 0 0 3px #A7E3D3; transform:scale(1.03); }
.cm-node.dragging { opacity:.92; box-shadow:0 12px 24px rgba(22,33,58,.18); cursor:grabbing; z-index:5; }
.cm-node.flash { animation:cm-flash .9s ease-out; }
@keyframes cm-flash { 0% { box-shadow:0 0 0 0 rgba(59,91,219,.55); } 100% { box-shadow:0 0 0 16px rgba(59,91,219,0); } }
.cm-spine { width:6px; flex:none; border-radius:10px 0 0 10px; }
.cm-type { width:26px; height:26px; margin:8px 0 0 8px; flex:none; border:0; border-radius:7px; color:#fff; cursor:pointer; font-family:"Bricolage Grotesque", sans-serif; font-weight:700; font-size:13px; line-height:1; }
.cm-body { flex:1; min-width:0; padding:8px 10px 8px 8px; display:flex; flex-direction:column; justify-content:space-between; overflow:hidden; }
.cm-text { font-size:13px; line-height:1.3; font-weight:500; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; }
.cm-text.empty { color:#9AA3B2; font-weight:400; }
.cm-edit { width:100%; flex:1; border:0; outline:0; resize:none; padding:0; background:transparent; color:var(--ink); font:inherit; font-size:13px; font-weight:500; line-height:1.3; user-select:text; -webkit-user-select:text; }
.cm-meta { display:flex; gap:5px; overflow:hidden; margin-top:4px; }
.cm-tag { font-size:10.5px; padding:1px 6px; border-radius:999px; white-space:nowrap; line-height:1.5; }
.cm-tag.owner { background:#EEF0F4; color:var(--muted); }
.cm-tag.date { background:#FDE6D8; color:#B4460A; font-family:"JetBrains Mono", monospace; }
.cm-tag.open { border:1px dashed var(--q); color:var(--q); }
.cm-tag.done { background:#DDF3EC; color:var(--a); }
.cm-nodetools { position:absolute; top:100%; left:0; margin-top:6px; display:flex; gap:4px; background:#fff; border:1px solid var(--line); border-radius:8px; padding:3px; box-shadow:0 4px 12px rgba(22,33,58,.12); }
.cm-nodetools button { font-family:inherit; font-size:11.5px; font-weight:600; border:0; background:#F3F5F8; border-radius:5px; padding:4px 7px; cursor:pointer; color:var(--ink); white-space:nowrap; }
.cm-nodetools button.q { color:var(--q); } .cm-nodetools button.a { color:var(--a); } .cm-nodetools button.f { color:var(--f); } .cm-nodetools button.x { color:#B42318; }
.cm-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
.cm-empty > div { pointer-events:auto; background:#fff; border:1px dashed var(--line); border-radius:14px; padding:18px 22px; text-align:center; max-width:300px; font-size:13px; color:var(--muted); line-height:1.5; }
@media (prefers-reduced-motion: reduce) { .cm-node.flash { animation:none; } .cm-node.target { transform:none; } }
@media (max-width: 720px) {
  .cm-main { flex-direction:column; }
  .cm-notes { width:auto; height:36vh; border-right:0; border-bottom:1px solid var(--line); }
  .cm-legend { display:none; }
  .cm-head { gap:8px; padding:8px 10px; }
}
`;

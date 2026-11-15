// The writing editor: CodeMirror 6 in place of a long-form text box (a piece's draft, a
// source's notes). Markdown is styled as you type: headings bigger, bold bold, links in the
// accent colour. Lines wrap, undo works, Ctrl+F searches, and Enter carries a list on.
//
// How: the same trick as the Aa layer (textformat.js). The textarea stays in the page, hidden,
// as the place the value lives; the editor is drawn after it and kept in step both ways. So the
// page's own save code (an "input" listener on [data-f]), its word count, its preview and its
// ta.focus() all work unchanged, and setting ta.value from code repaints the editor.
//
// CodeMirror is ~125 KB gzipped, so it loads only when a page with a writing box opens. Until it
// arrives the plain textarea is there and works; whatever was typed in it carries over.
//
// The editor only ever holds the user's words: nothing here writes text on its own. The [[
// suggestions insert a link only when the user picks one.
//
// Markup: give the textarea data-code (keep data-fmtable for the Aa button), then
// upgradeCode(textarea, { links, keys }) once it's in the page. `links()` returns [{ label, href }];
// `keys` are extra key bindings ({ key: "Mod-Enter", run }) that come before the usual ones.
// The textarea's placeholder, selectionStart/End, setSelectionRange, focus and scrollIntoView keep
// working and reach the editor, so a page written for a plain textarea needs no other change.

let cmPromise = null;
const loadCM = () => (cmPromise ||= import("../../vendor/codemirror.js").catch((e) => { cmPromise = null; throw e; })); // try again next time

/** Draw the editor for one textarea. Resolves to the EditorView (or null if it couldn't load). */
export async function upgradeCode(f, opts = {}) {
  if (f._cm) return f._cm;
  if (f._cmLoading) return f._cmLoading;
  f._cmLoading = (async () => {
    let CM;
    try { CM = await loadCM(); } catch { return null; } // offline before first load: the textarea stays
    if (!f.isConnected) return null;
    return make(CM, f, opts);
  })();
  return f._cmLoading;
}

function make(CM, f, { links, keys = [], repaint } = {}) {
  const { Compartment, EditorState, EditorView, keymap, placeholder, drawSelection, history, defaultKeymap, historyKeymap,
    syntaxHighlighting, HighlightStyle, search, searchKeymap, autocompletion, completionKeymap,
    markdownLanguage, insertNewlineContinueMarkup, deleteMarkupBackward, tags: t, Decoration, ViewPlugin } = CM;

  const proto = Object.getPrototypeOf(f);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  const rawGet = () => desc.get.call(f);
  const rawSet = (v) => desc.set.call(f, v);
  const hadFocus = document.activeElement === f;
  const caret = Math.min(f.selectionStart ?? 0, rawGet().length);

  // How Markdown looks while you write it. The marks themselves (#, **, >) stay, dimmed.
  const look = HighlightStyle.define([
    { tag: t.heading1, class: "cm-h cm-h1" },
    { tag: t.heading2, class: "cm-h cm-h2" },
    { tag: [t.heading3, t.heading4, t.heading5, t.heading6], class: "cm-h cm-h3" },
    { tag: t.strong, class: "cm-strong" },
    { tag: t.emphasis, class: "cm-em" },
    { tag: t.strikethrough, class: "cm-strike" },
    { tag: [t.link, t.url], class: "cm-link" },
    { tag: t.quote, class: "cm-quote" },
    { tag: t.monospace, class: "cm-mono" },
    { tag: [t.processingInstruction, t.contentSeparator, t.labelName], class: "cm-mark" },
    { tag: t.list, class: "cm-list" },
  ]);

  // The app's own size/colour markup — [words]{.red .large} from the Aa button — shown in its
  // size and colour, with its codes hidden unless the cursor is inside it (then you can edit
  // them). Markdown's own marks (#, **) stay, dimmed: they're part of writing Markdown.
  const SPAN = /\[([^\]\n]+)\]\{((?:\s*\.[\w-]+)+)\s*\}/g;
  const hide = Decoration.replace({});
  const spans = (view) => {
    const out = [];
    const sel = view.state.selection.ranges;
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      for (const m of text.matchAll(SPAN)) {
        const a = from + m.index, z = a + m[0].length, inner = a + 1 + m[1].length;
        out.push(Decoration.mark({ class: m[2].trim().split(/\s+/).map((c) => `fmt-${c.slice(1)}`).join(" ") }).range(a + 1, inner));
        if (sel.some((r) => r.to >= a && r.from <= z)) continue;
        out.push(hide.range(a, a + 1), hide.range(inner, z));
      }
    }
    return Decoration.set(out, true);
  };
  const fmtPlugin = ViewPlugin.define((view) => ({
    decorations: spans(view),
    update(u) { if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = spans(u.view); },
  }), { decorations: (v) => v.decorations });

  // [[ then a few letters: your sources, as Markdown links that open them from the preview.
  const linkSource = (cx) => {
    const m = cx.matchBefore(/\[\[[^\]\n]*$/);
    if (!m || !links) return null;
    return {
      from: m.from,
      filter: true,
      options: links().map((l) => ({ label: `[[${l.label}`, displayLabel: l.label, detail: l.detail || "", apply: `[${l.label.replace(/[[\]]/g, "")}](${l.href})` })),
    };
  };

  const label = f.getAttribute("aria-label") || "";
  let fromCode = false; // a value set by the page, not typed
  const hint = new Compartment(); // the placeholder can change (Today asks a different question each time)
  const phDesc = Object.getOwnPropertyDescriptor(proto, "placeholder");
  const view = new EditorView({
    state: EditorState.create({
      doc: rawGet(),
      selection: { anchor: caret },
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdownLanguage,
        syntaxHighlighting(look),
        fmtPlugin,
        search({ top: true }),
        links ? autocompletion({ override: [linkSource], icons: false, activateOnTyping: true }) : [],
        hint.of(placeholder(f.placeholder || "")),
        keymap.of([
          ...keys,
          { key: "Enter", run: insertNewlineContinueMarkup },
          { key: "Backspace", run: deleteMarkupBackward },
          ...completionKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap,
        ]),
        EditorView.editorAttributes.of({ class: "code-field" }), // (CodeMirror owns its root's classes)
        EditorView.contentAttributes.of({ "aria-label": label, "aria-multiline": "true", spellcheck: "true", autocorrect: "on", autocapitalize: "sentences" }),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          rawSet(u.state.doc.toString());
          if (!fromCode) f.dispatchEvent(new Event("input", { bubbles: true })); // the page set it: nothing to echo back
        }),
        EditorView.domEventHandlers({ blur: () => { f.dispatchEvent(new Event("change", { bubbles: true })); } }),
      ],
    }),
  });
  f.after(view.dom);
  f.style.display = "none";
  f.tabIndex = -1;
  f.setAttribute("aria-hidden", "true");

  // Setting the value from code repaints the editor: not while you're typing in it (a page's
  // autosave can echo an older value back), unless the page only ever sets it on purpose
  // (repaint: "always", e.g. Today clearing the box after Save).
  Object.defineProperty(f, "value", {
    configurable: true,
    get: rawGet,
    set(v) {
      rawSet(v);
      if ((repaint === "always" || !view.hasFocus) && String(v ?? "") !== view.state.doc.toString()) {
        fromCode = true;
        try { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(v ?? "") } }); } finally { fromCode = false; }
      }
    },
  });
  f.focus = () => view.focus();
  Object.defineProperty(f, "placeholder", {
    configurable: true,
    get: () => phDesc.get.call(f),
    set(v) { phDesc.set.call(f, v); view.dispatch({ effects: hint.reconfigure(placeholder(String(v ?? ""))) }); },
  });
  Object.defineProperty(f, "selectionStart", { configurable: true, get: () => view.state.selection.main.from, set: (v) => f.setSelectionRange(v, Math.max(v, view.state.selection.main.to)) });
  Object.defineProperty(f, "selectionEnd", { configurable: true, get: () => view.state.selection.main.to, set: (v) => f.setSelectionRange(Math.min(v, view.state.selection.main.from), v) });
  f.setSelectionRange = (a, z = a) => {
    const n = view.state.doc.length;
    view.dispatch({ selection: { anchor: Math.max(0, Math.min(a, n)), head: Math.max(0, Math.min(z, n)) }, scrollIntoView: true });
  };
  f.scrollIntoView = (o) => view.dom.scrollIntoView(o);
  f.blur = () => view.contentDOM.blur();

  // For the Aa button: what's selected, and a way to put formatted text back as one undoable change.
  f._ext = {
    dom: view.dom,
    selection() {
      const r = view.state.selection.main;
      return { text: view.state.doc.toString(), from: r.from, to: r.to };
    },
    replace(value, start, end) {
      const old = view.state.doc.toString();
      let a = 0;
      while (a < old.length && a < value.length && old[a] === value[a]) a++;
      let zo = old.length, zn = value.length;
      while (zo > a && zn > a && old[zo - 1] === value[zn - 1]) { zo--; zn--; }
      view.dispatch({ changes: { from: a, to: zo, insert: value.slice(a, zn) }, selection: { anchor: start, head: end }, scrollIntoView: true });
      view.focus();
    },
  };
  f._cm = view;
  if (hadFocus) view.focus();
  return view;
}

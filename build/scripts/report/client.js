/* Validation report, client side. Everything here is an enhancement: the
   page reads without it (images, anchors and the video all work as plain
   links). Mermaid is the one external asset, loaded from the CDN. */
(function () {
  "use strict";
  var MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

  // ---- screenshots open large in a dialog ----
  var box = document.getElementById("lightbox");
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a.shot");
    if (!a || !box || typeof box.showModal !== "function") return;
    ev.preventDefault();
    box.querySelector("img").src = a.getAttribute("href");
    box.querySelector(".lb-cap").textContent = a.getAttribute("data-cap") || "";
    box.showModal();
  });
  if (box) {
    box.addEventListener("click", function (ev) {
      if (ev.target === box || ev.target.tagName === "IMG") box.close();
    });
  }

  // ---- chapter links seek the video ----
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a.chap");
    if (!a) return;
    var video = a.closest(".video") && a.closest(".video").querySelector("video");
    if (!video) return;
    ev.preventDefault();
    video.currentTime = Number(a.getAttribute("data-t")) || 0;
    video.play().catch(function () {});
  });

  // ---- details open for printing, and close again afterwards ----
  var opened = [];
  function openAll() {
    opened = [];
    document.querySelectorAll("details").forEach(function (d) {
      if (!d.open) { d.open = true; opened.push(d); }
    });
  }
  function restore() {
    opened.forEach(function (d) { d.open = false; });
    opened = [];
  }
  window.addEventListener("beforeprint", openAll);
  window.addEventListener("afterprint", restore);
  var printQuery = window.matchMedia && window.matchMedia("print");
  if (printQuery && printQuery.addEventListener) {
    printQuery.addEventListener("change", function (e) { (e.matches ? openAll : restore)(); });
  }

  // ---- current section in the top bar ----
  var links = {};
  document.querySelectorAll(".top nav a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting || !links[e.target.id]) return;
        Object.keys(links).forEach(function (k) { links[k].classList.remove("on"); });
        links[e.target.id].classList.add("on");
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  // ---- diagrams ----
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function theme() {
    var ink = cssVar("--ink"), surface = cssVar("--surface"), surface2 = cssVar("--surface-2"), line = cssVar("--line-strong"), muted = cssVar("--muted");
    return {
      background: surface, primaryColor: surface2, primaryTextColor: ink, primaryBorderColor: line,
      secondaryColor: surface2, tertiaryColor: surface, lineColor: muted, textColor: ink,
      noteBkgColor: cssVar("--warn-soft"), noteTextColor: ink, noteBorderColor: cssVar("--warn"),
      actorBkg: surface2, actorBorder: line, actorTextColor: ink, signalColor: muted, signalTextColor: ink,
      labelBoxBkgColor: surface2, labelBoxBorderColor: line, labelTextColor: ink, loopTextColor: ink,
      activationBkgColor: surface2, sequenceNumberColor: surface,
      fontFamily: cssVar("--sans")
    };
  }

  function restyleChanged() {
    var fill = cssVar("--changed-fill"), stroke = cssVar("--changed-stroke");
    document.querySelectorAll(".dcard svg .changed").forEach(function (g) {
      g.querySelectorAll("rect, polygon, path, circle, ellipse").forEach(function (s) {
        if (s.closest(".label, .edgeLabel, marker")) return;
        s.style.setProperty("fill", fill, "important");
        s.style.setProperty("stroke", stroke, "important");
      });
    });
    // sequence diagrams highlight with rect blocks
    document.querySelectorAll(".dcard svg rect.rect").forEach(function (r) {
      r.style.setProperty("fill", fill, "important");
      r.style.setProperty("fill-opacity", ".55", "important");
    });
  }

  function wireJourneys() {
    document.querySelectorAll(".journey-chart svg g.node").forEach(function (g) {
      var m = /^flowchart-(.+)-\d+$/.exec(g.id || "");
      if (!m || !document.getElementById(m[1])) return;
      g.setAttribute("tabindex", "0");
      g.setAttribute("role", "link");
      function go() { location.hash = m[1]; }
      g.addEventListener("click", go);
      g.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    });
  }

  var done = false;
  function ready() { if (!done) { done = true; window.__reportReady = true; } }

  var blocks = document.querySelectorAll(".mermaid");
  if (!blocks.length) { ready(); return; }
  import(MERMAID_URL).then(function (mod) {
    var mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: theme(),
      flowchart: { curve: "basis", padding: 12, htmlLabels: true },
      sequence: { mirrorActors: false, useMaxWidth: true }
    });
    return mermaid.run({ querySelector: ".mermaid", suppressErrors: true });
  }).then(function () {
    restyleChanged();
    wireJourneys();
  }).catch(function () {
    document.documentElement.setAttribute("data-diagrams", "unavailable");
  }).then(ready);
})();

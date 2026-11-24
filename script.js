/* A single scroll coordinate drives the entire scene. Geometry is cached on resize;
   pinned positioning, touch scrolling and history restoration remain browser-native. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const desktop = matchMedia(
  "(min-width: 960px) and (min-height: 620px) and (min-aspect-ratio: 1/1) and (hover: hover) and (pointer: fine)",
);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const fine = matchMedia("(hover: hover) and (pointer: fine)");
const stages = [
  ["standby", 0],
  ["activation", 0.15],
  ["explode", 0.3],
  ["architecture", 0.55],
  ["reassemble", 0.75],
  ["transition", 0.9],
];
const clamp = (value) => Math.min(1, Math.max(0, value));
function segment(value, start, end) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}
function put(element, key, value) {
  element.style.setProperty(key, value);
}
function visibleToFocus(element, visible) {
  if (element.inert === visible) element.inert = !visible;
}

function useDesktopScene() {
  const lowPower =
    navigator.connection?.saveData ||
    (navigator.deviceMemory && navigator.deviceMemory <= 2);
  return (
    desktop.matches &&
    !reduced.matches &&
    !lowPower &&
    CSS.supports("position", "sticky")
  );
}
// Reserve the complete scene before the first paint, including on history restoration.
document.documentElement.classList.toggle("cinematic", useDesktopScene());

function mount() {
  const lifetime = new AbortController();
  const listen = (el, event, fn, options = {}) =>
    el.addEventListener(event, fn, { ...options, signal: lifetime.signal });
  const html = document.documentElement;
  const hero = $(".hero"),
    scene = $(".scene"),
    copy = $(".hero-copy");
  const camera = $(".camera"),
    tilt = $(".chip-tilt"),
    hardware = $(".hardware");
  const labels = $$(".annotation"),
    leaders = $$(".leaders path"),
    terminals = $$(".leaders circle");
  const guides = $$(".guides path"),
    pulses = $$(".signal path"),
    output = $(".output-trace");
  const nav = $$(".header nav a").map((link) => ({
    link,
    section: $(link.hash),
  }));
  const chapterStops = $$(".chapter-stops button"),
    progressBar = $(".page-progress");
  const navHeight = $(".header"),
    pointerQuery = () => fine.matches && !reduced.matches;
  let geometry,
    cinematic,
    frame = 0,
    resizePending = true,
    previous = -1,
    selected = "",
    hovered = "";
  let inspectorOpen = false;
  const observers = [];
  let cardAnimation;

  function refreshInspection() {
    const active = cinematic && !inspectorOpen ? "" : hovered || selected;
    scene.dataset.inspect = active;
    for (const label of labels) {
      label.toggleAttribute("data-current", active === label.dataset.layer);
      $("button", label).setAttribute(
        "aria-pressed",
        String(selected === label.dataset.layer),
      );
    }
  }
  for (const label of labels) {
    const button = $("button", label);
    button.disabled = false;
    listen(button, "click", () => {
      selected = selected === label.dataset.layer ? "" : label.dataset.layer;
      hovered = "";
      refreshInspection();
    });
    listen(label, "pointerenter", (e) => {
      if (pointerQuery() && e.pointerType !== "touch") {
        hovered = label.dataset.layer;
        refreshInspection();
      }
    });
    listen(label, "pointerleave", () => {
      hovered = "";
      refreshInspection();
    });
    listen(button, "focus", () => {
      if (button.matches(":focus-visible")) {
        hovered = label.dataset.layer;
        refreshInspection();
      }
    });
    listen(button, "blur", () => {
      hovered = "";
      refreshInspection();
    });
  }

  const entries = $$(".entry");
  const reader = $(".source-reader");
  const editorial = matchMedia("(min-width: 900px) and (min-height: 620px)");
  let displayedEntry = -1;
  let markedLine = -1;
  const sourcePages = entries.map((entry) => {
    const excerpt = $(".excerpt", entry).cloneNode(true);
    const start = Number(entry.dataset.line);
    $$("code > span", excerpt).forEach((line, i) => {
      line.dataset.line = start + i;
    });
    return excerpt;
  });
  function renderNotebook(y) {
    if (
      !geometry.showReader ||
      y + innerHeight < geometry.entryStarts[0] ||
      y > geometry.noteEnd
    )
      return;
    const marker = y + innerHeight * 0.5;
    const starts = geometry.entryStarts;
    let index = 0;
    while (index + 1 < starts.length && marker >= starts[index + 1]) index++;
    const end = starts[index + 1] ?? geometry.noteEnd;
    const fraction = clamp(
      (marker - starts[index]) / Math.max(1, end - starts[index]),
    );
    if (displayedEntry !== index) {
      displayedEntry = index;
      entries.forEach((entry, i) =>
        entry.toggleAttribute("data-reading", i === index),
      );
      $(".reader-file", reader).textContent = entries[index].dataset.file;
      $(".reader-content", reader).replaceChildren(sourcePages[index]);
      markedLine = -1;
    }
    const lines = sourcePages[index].firstElementChild.children;
    const current = Math.min(
      lines.length - 1,
      Math.floor(fraction * lines.length),
    );
    if (current !== markedLine) {
      for (const line of lines)
        line.toggleAttribute("data-highlight", line === lines[current]);
      markedLine = current;
    }
    put(reader, "--reading", fraction);
  }

  for (const stop of chapterStops) {
    listen(stop, "click", () => {
      if (!cinematic || !geometry) return;
      scrollTo({
        top: geometry.start + Number(stop.dataset.seek) * geometry.length,
        behavior: "smooth",
      });
    });
  }
  function measure() {
    cinematic = useDesktopScene();
    html.classList.toggle("cinematic", cinematic);
    html.classList.add("js");
    const showReader = editorial.matches && !reduced.matches;
    html.classList.toggle("has-reader", showReader);
    const height = scene.offsetHeight,
      width = scene.clientWidth,
      header = navHeight.offsetHeight;
    const start = hero.getBoundingClientRect().top + scrollY - header;
    geometry = {
      height,
      width,
      start,
      header,
      chip: camera.offsetWidth,
      length: Math.max(1, hero.offsetHeight - height),
      total: Math.max(1, html.scrollHeight - innerHeight),
      showReader,
      entryStarts: entries.map(
        (entry) => entry.getBoundingClientRect().top + scrollY,
      ),
      noteEnd: $("#notes").getBoundingClientRect().bottom + scrollY,
      visuals: $$(".study-visual,.books-visual").map((el) => ({
        el,
        top: el.getBoundingClientRect().top + scrollY,
        height: el.offsetHeight,
      })),
      labelY: labels.map((label) => label.offsetTop),
      labelWidth: labels[0].offsetWidth,
      sections: nav.map(
        ({ section }) => scrollY + section.getBoundingClientRect().top,
      ),
      compactStart: $(".module").getBoundingClientRect().top + scrollY,
    };
    camera.style.removeProperty("--dial-angle");
    hardware.style.removeProperty("--cap-y");
    hardware.style.removeProperty("--base-y");
    if (!cinematic) {
      visibleToFocus(copy, true);
      for (const label of labels) visibleToFocus(label, true);
      inspectorOpen = true;
      scene.removeAttribute("data-stage");
      $(".activation").setAttribute("aria-hidden", "true");
      $(".integration").setAttribute("aria-hidden", "true");
      scene.removeAttribute("style");
    }
    previous = -1;
    refreshInspection();
  }

  function drawWires(lift, lower, zoom, travel, rise, draw, exit) {
    const { width: w, height: h, chip, labelY, labelWidth } = geometry;
    const x = w / 2 + travel,
      y = h * 0.47 + rise,
      size = chip * zoom,
      upperGap = size * 0.18 * lift,
      lowerGap = size * 0.155 * lower;
    const points = [
      [x - size * 0.24, y - size * 0.23 - upperGap],
      [x + size * 0.31, y + size * 0.035],
      [x - size * 0.25, y + size * 0.18 + lowerGap],
    ];
    for (let i = 0; i < 3; i++) {
      const [px, py] = points[i],
        right = i === 1;
      const endX = right ? w - labelWidth : labelWidth,
        endY = labelY[i] + 0.5;
      const elbow = px + (endX - px) * 0.44;
      leaders[i].setAttribute(
        "d",
        `M${px} ${py}H${elbow}L${elbow + (endX - px) * 0.22} ${endY}H${endX}`,
      );
      put(leaders[i], "--draw", 1 - draw[i]);
      terminals[i].setAttribute("cx", px);
      terminals[i].setAttribute("cy", py);
      terminals[i].style.opacity = draw[i];
    }
    for (let i = 0; i < 2; i++) {
      const gx = x + (i ? 1 : -1) * size * 0.355;
      const d = `M${gx} ${y - size * 0.1 - upperGap}v${size * 0.06 + upperGap}m0 ${size * 0.09}v${size * 0.07 + lowerGap}`;
      guides[i].setAttribute("d", d);
      pulses[i].setAttribute("d", d);
    }
    output.setAttribute(
      "d",
      `M${x} ${y + size * 0.44}v${h * 0.085}l${-w * 0.055} ${h * 0.055}V${h}`,
    );
    put(output, "--output", 1 - exit);
  }

  function renderHero(p) {
    if (p === previous) return;
    previous = p;
    if (!cinematic) {
      const motion = reduced.matches ? 0 : p;
      put(hardware, "--cap-y", -2 - 8 * segment(motion, 0.1, 0.69) + "%");
      put(hardware, "--base-y", 2 + 6 * segment(motion, 0.35, 0.9) + "%");
      put(camera, "--dial-angle", motion * 22 + "deg");
      return;
    }
    const stageIndex = stages.findLastIndex(([, start]) => p >= start);
    const [stage, start] = stages[stageIndex];
    const next = stages[stageIndex + 1]?.[1] ?? 1;
    const chapterProgress = Math.min(
      1,
      (stageIndex + clamp((p - start) / (next - start))) / (stages.length - 1),
    );
    const activate = segment(p, 0.15, 0.32),
      separation = segment(p, 0.3, 0.55) * (1 - segment(p, 0.76, 0.89));
    const assembly = segment(p, 0.76, 0.9),
      exit = segment(p, 0.9, 1);
    const travel = geometry.width * (0.25 * (1 - activate) + 0.17 * assembly);
    const lift = segment(p, 0.29, 0.46) * (1 - segment(p, 0.815, 0.9));
    const lower = segment(p, 0.37, 0.55) * (1 - segment(p, 0.755, 0.855));
    const arc = Math.sin(activate * Math.PI);
    const zoom =
      1.18 + 0.065 * activate + 0.035 * arc - 0.155 * separation - 0.31 * exit;
    const intro = 1 - segment(p, 0.15, 0.27);
    const activation = segment(p, 0.18, 0.26) * (1 - segment(p, 0.48, 0.56));
    const integration = segment(p, 0.81, 0.9) * (1 - 0.35 * exit);
    const draw = labels.map(
      (_, i) =>
        segment(p, 0.55 + i * 0.044, 0.617 + i * 0.044) *
        (1 - segment(p, 0.75, 0.8)),
    );
    const visible = draw.some((n) => n > 0.65);
    if (inspectorOpen !== visible) {
      inspectorOpen = visible;
      hovered = "";
      selected = "";
      refreshInspection();
    }
    visibleToFocus(copy, intro > 0.15);
    labels.forEach((label, i) => {
      put(label, "--label", draw[i]);
      visibleToFocus(label, draw[i] > 0.65);
    });
    $(".activation").setAttribute("aria-hidden", String(activation < 0.35));
    $(".integration").setAttribute("aria-hidden", String(integration < 0.35));
    const style = {
      "--travel": travel + "px",
      "--zoom": zoom,
      "--pitch": -2.4 * activate + 2.4 * assembly + "deg",
      "--copy": intro,
      "--copy-rise": 24 * (1 - intro) + "px",
      "--field-x": (travel / geometry.width) * 75 + "%",
      "--grid": activate * (1 - exit),
      "--cap-y": -18 * lift + "%",
      "--base-y": 15.5 * lower + "%",
      "--wafer-y": -1.2 * separation + "%",
      "--cap-angle": -2.1 * lift + 0.9 * lower + "deg",
      "--roll": -3 * arc + 1.6 * (lift - lower) + "deg",
      "--arc-lift": -geometry.chip * 0.055 * arc + "px",
      "--dial-angle": activate * 25 + separation * 22 + assembly * 16 + "deg",
      "--dial-ink": 0.68 - 0.43 * separation - 0.17 * exit,

      "--exit": exit,
      "--wafer-bright": 1 + 0.12 * separation,
      "--guide": separation * 0.83,
      "--packet": 1 - ((p * 4) % 1),
      "--light":
        Math.sin(Math.PI * segment(p, 0.17, 0.34)) +
        0.8 * Math.sin(Math.PI * segment(p, 0.82, 0.96)),
      "--symbol-shift": -geometry.chip * 0.18 * lift + "px",
      "--presence": 1 - 0.33 * exit,
      "--activation": activation,
      "--act-mask": (1 - activation) * 100 + "%",
      "--integration": integration,
      "--int-mask": (1 - segment(p, 0.81, 0.9)) * 100 + "%",
      "--playhead": chapterProgress,
    };
    for (const [key, value] of Object.entries(style)) put(scene, key, value);
    if (scene.dataset.stage !== stage) {
      scene.dataset.stage = stage;
      for (const stop of chapterStops) {
        if (stop.dataset.name === stage)
          stop.setAttribute("aria-current", "step");
        else stop.removeAttribute("aria-current");
      }
      if (stage !== "standby") resetTilt();
    }
    drawWires(
      lift,
      lower,
      zoom,
      travel,
      -geometry.chip * 0.055 * arc,
      draw,
      exit,
    );
  }

  function tick() {
    frame = 0;
    if (document.hidden) return;
    if (resizePending) {
      measure();
      resizePending = false;
    }
    const y = scrollY,
      g = geometry;
    const progress = cinematic
      ? clamp((y - g.start) / g.length)
      : clamp((y + innerHeight * 0.7 - g.compactStart) / Math.max(1, g.chip));
    renderHero(progress);
    renderNotebook(y);
    if (!reduced.matches) {
      for (const { el, top, height } of g.visuals) {
        if (y + innerHeight >= top - 50 && y <= top + height + 50) {
          const reveal = segment(
            y + innerHeight,
            top,
            top + Math.min(height * 0.85, innerHeight * 0.48),
          );
          put(el, "--unfold", 1 - reveal);
        }
      }
    }
    put(progressBar, "--read", clamp(y / g.total));
    const marker = y + g.header + 42;
    let active = -1;
    g.sections.forEach((start, i) => {
      if (marker >= start) active = i;
    });
    if (y >= g.total - 2) {
      const target = nav.findIndex(({ link }) => link.hash === location.hash);
      active =
        target >= 0 &&
        g.sections[target] >= y - 2 &&
        g.sections[target] < y + innerHeight
          ? target
          : nav.length - 1;
    }
    nav.forEach(({ link }, i) => {
      if (i === active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  }
  function schedule() {
    if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function refresh() {
    resizePending = true;
    schedule();
  }
  function resetTilt() {
    put(tilt, "--tilt-x", "0deg");
    put(tilt, "--tilt-y", "0deg");
  }
  listen(camera, "pointermove", (e) => {
    if (
      !pointerQuery() ||
      e.pointerType === "touch" ||
      (cinematic && scene.dataset.stage !== "standby")
    )
      return;
    const r = camera.getBoundingClientRect();
    put(tilt, "--tilt-y", ((e.clientX - r.left) / r.width - 0.5) * 9 + "deg");
    put(tilt, "--tilt-x", ((e.clientY - r.top) / r.height - 0.5) * -9 + "deg");
  });
  listen(camera, "pointerleave", resetTilt);
  const primary = $(".primary");
  listen(primary, "pointermove", (e) => {
    if (!pointerQuery() || e.pointerType === "touch") return;
    const r = primary.getBoundingClientRect();
    put(primary, "--mx", ((e.clientX - r.left) / r.width - 0.5) * 6 + "px");
    put(primary, "--my", ((e.clientY - r.top) / r.height - 0.5) * 5 + "px");
  });
  listen(primary, "pointerleave", () => {
    put(primary, "--mx", "0px");
    put(primary, "--my", "0px");
  });

  const flip = $("#flip"),
    face = $(".flash-content");
  let answer = flip.dataset.side === "answer";
  flip.hidden = false;
  listen(flip, "click", () => {
    answer = !answer;
    flip.dataset.side = answer ? "answer" : "question";
    $("#card-side").textContent = answer ? "Sample answer" : "Sample question";
    $("#card-text").textContent = answer
      ? "The question and relevant text from the PDF."
      : "What gives an AI tutor context?";
    flip.textContent = answer ? "Show question" : "Reveal answer";
    cardAnimation?.cancel();
    if (!reduced.matches)
      cardAnimation = face.animate(
        [
          { opacity: 0.35, transform: "translateY(4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 240, easing: "ease-out" },
      );
  });
  const route = $("#route");
  route.hidden = false;
  listen(route, "click", () => {
    const failed = $(".sentinel-visual").classList.toggle("failed");
    route.setAttribute("aria-pressed", String(failed));
    route.textContent = failed ? "Restore primary" : "Simulate failover";
    $("#route-state").textContent = failed
      ? "Primary failed Â· Backup serving"
      : "Primary restored Â· Backup on standby";
  });

  if ("IntersectionObserver" in window) {
    const visibility = new IntersectionObserver((entries) =>
      entries.forEach((e) => {
        e.target.classList.toggle("on-screen", e.isIntersecting);
        if (e.target === scene)
          scene.classList.toggle("in-view", e.isIntersecting);
      }),
    );
    for (const element of [scene, ...$$(".project")])
      visibility.observe(element);
    const entrance = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("reveal");
            entrance.unobserve(e.target);
          }
        }),
      { threshold: 0.07 },
    );
    for (const el of $$(".project,.stack-grid>a,.about,.work-heading"))
      entrance.observe(el);
    observers.push(entrance, visibility);
  }
  listen(window, "scroll", schedule, { passive: true });
  listen(window, "resize", refresh);
  for (const mq of [desktop, reduced, fine, editorial])
    listen(mq, "change", () => {
      resetTilt();
      refresh();
    });
  if ("ResizeObserver" in window) {
    const sizes = new ResizeObserver(refresh);
    for (const el of [document.body, scene, navHeight]) sizes.observe(el);
    observers.push(sizes);
  }
  if (document.fonts) listen(document.fonts, "loadingdone", refresh);
  listen(document, "visibilitychange", () => {
    html.classList.toggle("paused", document.hidden);
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else refresh();
  });
  tick();
  return () => {
    lifetime.abort();
    cancelAnimationFrame(frame);
    observers.forEach((o) => o.disconnect());
    cardAnimation?.cancel();
  };
}
let unmount;
document.addEventListener(
  "DOMContentLoaded",
  () => {
    unmount = mount();
  },
  { once: true },
);
window.addEventListener("pagehide", () => unmount?.());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) unmount = mount();
});

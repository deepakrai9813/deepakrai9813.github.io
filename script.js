const flip = document.querySelector("#flip");
const side = document.querySelector("#card-side");
const cardText = document.querySelector("#card-text");
flip.hidden = false;
let showingAnswer = false;
flip.addEventListener("click", () => {
  showingAnswer = !showingAnswer;
  side.textContent = showingAnswer ? "Sample answer" : "Sample question";
  cardText.textContent = showingAnswer
    ? "The question and relevant text from the PDF."
    : "What gives an AI tutor context?";
  flip.textContent = showingAnswer ? "Show question" : "Reveal answer";
});

const route = document.querySelector("#route");
route.hidden = false;
route.addEventListener("click", () => {
  const failed = route.closest(".sentinel-visual").classList.toggle("failed");
  route.setAttribute("aria-pressed", String(failed));
  route.textContent = failed ? "Restore primary" : "Simulate failover";
});

const hero = document.querySelector(".hero");
const moduleArt = document.querySelector(".hardware");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let waitingForFrame = false;
function updateLayers() {
  waitingForFrame = false;
  const bounds = hero.getBoundingClientRect();
  const progress = motion.matches
    ? 0
    : Math.min(1, Math.max(0, (84 - bounds.top) / bounds.height));
  moduleArt.style.setProperty("--explode", progress.toFixed(3));
}
function scheduleLayers() {
  if (!waitingForFrame) {
    waitingForFrame = true;
    requestAnimationFrame(updateLayers);
  }
}
window.addEventListener("scroll", scheduleLayers, { passive: true });
window.addEventListener("resize", scheduleLayers);
motion.addEventListener("change", scheduleLayers);
updateLayers();

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!motion.matches) entry.target.classList.add("reveal");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08 },
  );
  for (const element of document.querySelectorAll(
    ".project, .stack-grid > div, .about > div",
  )) {
    observer.observe(element);
  }
}

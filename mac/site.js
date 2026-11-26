"use strict";

document.documentElement.classList.add("js");

const track = document.querySelector(".chapter-track");
const cards = Array.from(track.querySelectorAll("[data-chapter]"));
const notes = Array.from(document.querySelectorAll(".chapter-notes article"));
const back = document.querySelector('[data-scroll="-1"]');
const forward = document.querySelector('[data-scroll="1"]');
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function syncArrows() {
  back.disabled = track.scrollLeft <= 2;
  forward.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
}
function scrollChapter(direction) {
  const stride = cards[1].offsetLeft - cards[0].offsetLeft;
  track.scrollBy({left: direction * stride, behavior: reducedMotion.matches ? "instant" : "smooth"});
}
back.addEventListener("click", () => scrollChapter(-1));
forward.addEventListener("click", () => scrollChapter(1));
track.addEventListener("scroll", syncArrows, {passive: true});
window.addEventListener("resize", syncArrows);
track.addEventListener("keydown", event => {
  if (event.target !== track) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    scrollChapter(event.key === "ArrowRight" ? 1 : -1);
  }
});
syncArrows();

const dialog = document.getElementById("case-dialog");
const close = dialog.querySelector(".case-close");
const caseArt = document.getElementById("case-art");
if (typeof dialog.showModal === "function") {
  cards.forEach((card, index) => {
    card.setAttribute("aria-haspopup", "dialog");
    card.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      document.getElementById("case-index").textContent = card.querySelector(".chapter-index").textContent;
      document.getElementById("case-title").textContent = notes[index].querySelector("h3").textContent;
      document.getElementById("case-body").textContent = notes[index].querySelector("p").textContent;
      caseArt.src = "media/chapter-" + (index + 1) + ".webp";
      caseArt.alt = card.querySelector("img").alt;
      dialog.showModal();
      close.focus({preventScroll: true});
    });
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
} else {
  document.querySelector(".chapter-notes").style.display = "block";
}

const topicList = document.querySelector(".guide-tabs");
const topics = Array.from(topicList.querySelectorAll("a"));
topicList.setAttribute("role", "tablist");
function chooseTopic(active) {
  topics.forEach((tab, index) => {
    const selected = index === active;
    const panel = document.getElementById(tab.hash.slice(1));
    tab.id = "tab-" + panel.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    panel.hidden = !selected;
  });
}
topics.forEach((tab, index) => {
  tab.addEventListener("click", event => {event.preventDefault(); chooseTopic(index);});
  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowLeft") next = (index + topics.length - 1) % topics.length;
    if (event.key === "ArrowRight") next = (index + 1) % topics.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = topics.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    chooseTopic(next);
    topics[next].focus();
  });
});
function readFragment() {
  const topic = topics.findIndex(tab => tab.hash === location.hash);
  if (topic >= 0) chooseTopic(topic);
  const chapter = cards.find(card => card.hash === location.hash);
  if (chapter && !dialog.open && typeof dialog.showModal === "function") chapter.click();
}
chooseTopic(0);
readFragment();
window.addEventListener("hashchange", readFragment);

const film = document.getElementById("game-film");
document.querySelector("[data-watch]").addEventListener("click", event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  film.play().catch(() => { /* Native controls stay available when the browser requires a second tap. */ });
});

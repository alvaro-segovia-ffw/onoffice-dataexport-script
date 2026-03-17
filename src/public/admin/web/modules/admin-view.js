import { VIEW_CONTENT } from './admin-config.js';
import { els } from './admin-elements.js';

export function setActiveView(viewName) {
  const content = VIEW_CONTENT[viewName] || VIEW_CONTENT.overview;

  els.viewTitle.textContent = content.title;
  els.viewDescription.textContent = content.description;

  for (const link of els.navLinks) {
    const isActive = link.dataset.viewTarget === viewName;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  }

  for (const view of els.views) {
    const isActive = view.dataset.view === viewName;
    view.classList.toggle('active', isActive);
    view.hidden = !isActive;
  }
}

export function bindViewNavigation() {
  for (const link of els.navLinks) {
    link.addEventListener('click', () => {
      setActiveView(link.dataset.viewTarget || 'overview');
    });
  }
}

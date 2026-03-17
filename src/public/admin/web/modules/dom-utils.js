export function setStatus(el, label, ok) {
  el.textContent = label;
  el.classList.remove('ok', 'err');
  if (ok === true) el.classList.add('ok');
  if (ok === false) el.classList.add('err');
}

export function clearChildren(node) {
  node.replaceChildren();
}

export function appendTextElement(parent, tagName, text, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

export function writeJson(el, payload) {
  el.textContent = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
}

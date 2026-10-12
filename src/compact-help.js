// Explanations are optional reading; statuses, errors, controls and labels stay visible.
export function compactHelp(root) {
  for (const p of root.querySelectorAll('p.wjwk-muted')) {
    if (p.closest('details') || p.hasAttribute('role') || p.attributes.length !== 1 ||
        p.querySelector('input,select,textarea,button,a') || p.textContent.length < 45) continue;
    const details = p.ownerDocument.createElement('details');details.className='wjwk-help';
    const summary = p.ownerDocument.createElement('summary');summary.textContent='使用说明';
    p.before(details);details.append(summary,p);
  }
}

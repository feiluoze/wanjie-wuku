// Explanations are optional reading; statuses, errors, controls and labels stay visible.
export function compactHelp(root) {
  for (const p of root.querySelectorAll('p.wjwk-muted,p[data-wjwk-help],.wjwk-player-hero>div>p')) {
    const intro=p.matches('.wjwk-player-hero>div>p'),explicit=p.hasAttribute('data-wjwk-help')||intro;
    if (p.closest('details') || p.hasAttribute('role') || (!explicit&&p.attributes.length !== 1) ||
        p.querySelector('input,select,textarea,button,a') || (!explicit&&p.textContent.length < 45)) continue;
    const details = p.ownerDocument.createElement('details');details.className='wjwk-help';
    const summary = p.ownerDocument.createElement('summary');summary.textContent=p.dataset.helpTitle||(intro?'简介':'使用说明');
    p.before(details);details.append(summary,p);
  }
}

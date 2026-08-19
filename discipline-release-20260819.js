(function removeRetiredDisciplineSection(root) {
  const core = root.TradingCore;
  if (!core || !Array.isArray(core.DISCIPLINE_SECTIONS)) return;

  core.DISCIPLINE_SECTIONS = core.DISCIPLINE_SECTIONS.filter((section) => {
    const title = String(section?.title || '');
    const source = String(section?.source || '');
    return !title.includes('幕布离场纪律') && !source.includes('share.mubu.com/doc/DO4yxkTzYf');
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);

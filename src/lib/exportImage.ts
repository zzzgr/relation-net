import { toPng } from 'html-to-image';

export async function exportFamilyChartPng(
  container: HTMLElement,
  filename: string
): Promise<void> {
  const svg = container.querySelector('svg') as SVGSVGElement | null;
  if (!svg) throw new Error('未找到家族树画布');

  const origWidth = svg.getAttribute('width');
  const origHeight = svg.getAttribute('height');
  const origViewBox = svg.getAttribute('viewBox');
  const origOverflow = container.style.overflow;

  const bbox = svg.getBBox();
  const padding = 60;
  const width = Math.ceil(bbox.width + padding * 2);
  const height = Math.ceil(bbox.height + padding * 2);

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute(
    'viewBox',
    `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`
  );
  container.style.overflow = 'visible';

  const foldBtns = container.querySelectorAll<HTMLElement>('.f3-fold-btn');
  foldBtns.forEach((el) => (el.style.display = 'none'));

  const links = container.querySelectorAll<SVGPathElement>('path.link');
  const linkOrigStyles: string[] = [];
  links.forEach((el) => {
    linkOrigStyles.push(el.getAttribute('style') ?? '');
    const cs = getComputedStyle(el);
    const isPathToMain = el.classList.contains('f3-path-to-main');
    el.style.stroke = isPathToMain ? cs.stroke : '#94a3b8';
    el.style.strokeWidth = isPathToMain ? '2.4px' : '1.5px';
    el.style.fill = 'none';
    el.style.opacity = '1';
  });

  try {
    const dataUrl = await toPng(container, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
      width,
      height,
      filter: (node) => {
        if (node instanceof HTMLElement && node.classList?.contains('f3-fold-btn')) return false;
        return true;
      },
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
    link.click();
  } finally {
    if (origWidth) svg.setAttribute('width', origWidth);
    else svg.removeAttribute('width');
    if (origHeight) svg.setAttribute('height', origHeight);
    else svg.removeAttribute('height');
    if (origViewBox) svg.setAttribute('viewBox', origViewBox);
    else svg.removeAttribute('viewBox');
    container.style.overflow = origOverflow;
    foldBtns.forEach((el) => (el.style.display = ''));
    links.forEach((el, i) => {
      const orig = linkOrigStyles[i];
      if (orig) el.setAttribute('style', orig);
      else el.removeAttribute('style');
    });
  }
}
